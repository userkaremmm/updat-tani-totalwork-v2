import { scryptSync, createHash, randomBytes } from 'node:crypto'
const token = randomBytes(32).toString('base64url')
let t = performance.now()
for (let i=0;i<20;i++) scryptSync(token, 'total-work-session-v1', 32)
const scryptMs = (performance.now()-t)/20
t = performance.now()
for (let i=0;i<20000;i++) createHash('sha256').update(token).digest('hex')
const shaMs = (performance.now()-t)/20000
console.log('scryptSync per session lookup:', scryptMs.toFixed(2), 'ms')
console.log('sha256    per session lookup:', shaMs.toFixed(4), 'ms')
console.log('ratio:', Math.round(scryptMs/shaMs) + 'x')
console.log('=> max authenticated req/s on 1 core, session lookup alone:', Math.round(1000/scryptMs))
