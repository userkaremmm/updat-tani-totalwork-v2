const XLSX = (await import('@e965/xlsx')).default
// Build a workbook with a real date cell
const ws = XLSX.utils.aoa_to_sheet([['Matricule','Date de paiement'],['A1', new Date(2026,2,1)]])
const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'S')
const buf = XLSX.write(wb, {type:'array', bookType:'xlsx'})
const back = XLSX.read(buf, {type:'array', cellDates:true})
const m = XLSX.utils.sheet_to_json(back.Sheets.S, {header:1, defval:'', raw:true})
const v = m[1][1]
console.log('cell type:', Object.prototype.toString.call(v), 'value:', v)
if (v instanceof Date) {
  console.log('  toISOString().slice(0,10) =', v.toISOString().slice(0,10))
  console.log('  getDate()                 =', v.getDate())
  console.log('  local date                =', `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`)
  console.log('  TZ offset minutes         =', v.getTimezoneOffset())
}
// Test the detect() 'e' synonym problem
const clean = (x) => String(x ?? '').trim().replace(/\s+/g,' ')
const normalized = (x) => clean(x).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim()
const FIELDS=[['matricule'],['location'],['company'],['payDate'],['price'],['capacity'],['people'],['chantier'],['responsible'],['startMonth'],['remark']]
const SYNONYMS={matricule:['matricule','mat','matr','identifiant','id logement'],location:['location','localisation','lieu','ville','site'],company:['entreprise','societe','société','company','e'],payDate:['pay date','date de pay','date paiement','date de paiement','jour paiement','echeance','échéance'],price:['montant','prix','price','loyer','cout','coût'],capacity:['capacite','capacité','capacity','places'],people:['personnes','nombre personnes','n.p','np','people','effectif'],chantier:['chantier','chanter','projet'],responsible:['responsable','respo','superviseur'],startMonth:['date de debut','date début','mois de debut','mois début','start date'],remark:['remarque','remark','observation','commentaire']}
function detect(headers, saved={}){const used=new Set();return Object.fromEntries(FIELDS.map(([field])=>{if(saved[field]&&headers.includes(saved[field])){used.add(saved[field]);return[field,saved[field]]}let best='',score=0;headers.forEach((header)=>{if(used.has(header))return;const source=normalized(header);SYNONYMS[field].forEach((alias)=>{const target=normalized(alias);const next=source===target?1:source.includes(target)||target.includes(source)?.72:0;if(next>score){score=next;best=header}})});if(score>=.7)used.add(best);else best='';return[field,best]}))}
console.log('\n--- detect() with a sheet that has NO company column ---')
console.log(detect(['Matricule','Ville','Date de paiement','Montant','Remarque']))
console.log('\n--- detect() with realistic headers ---')
console.log(detect(['MATRICULE','N.P','CAPACITE','DATE DE PAY','MONTANT','REMARQUE','RESPONSABLE','DATE DE DEBUT','E','CHANTIER','LOCALISATION']))
