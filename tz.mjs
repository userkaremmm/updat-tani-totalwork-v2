const d = new Date('2026-03-01T00:00:00.000Z')
console.log('TZ=', process.env.TZ, '| toISOString.slice(0,10)=', d.toISOString().slice(0,10), '| getDate()=', d.getDate(), '| getUTCDate()=', d.getUTCDate())
