/* ============================================================================
   TOTAL WORK — Excel parsing and column detection

   Pulled out of ExcelImport.jsx because this is where the import either works
   or silently does not, and none of it is React. Same functions, same field
   list, same synonym vocabulary; the header matcher and the date reader are
   fixed, and both fixes are covered by tests.
   ========================================================================== */
import { normalizeMatricule, recordKey } from './import-utils.js'

/* [field, label, required] — the order is the order of the mapping UI. */
export const FIELDS = [
  ['matricule', 'Matricule', true], ['location', 'Localisation'], ['company', 'Entreprise'],
  ['payDate', 'Date de paiement', true], ['price', 'Montant'], ['capacity', 'Capacité'],
  ['people', 'Personnes'], ['chantier', 'Chantier'], ['responsible', 'Responsable'],
  ['startMonth', 'Date de début'], ['remark', 'Remarque'],
]

/* Real TOTAL WORK sheets head their columns with anything from 'Matricule' to a
   bare 'E', so the vocabulary stays broad. Aliases and headers of one or two
   characters are matched whole-word only — see `score` below for why. */
export const SYNONYMS = {
  matricule: ['matricule', 'mat', 'matr', 'identifiant', 'id logement'],
  location: ['location', 'localisation', 'lieu', 'ville', 'site'],
  company: ['entreprise', 'societe', 'société', 'company', 'e'],
  payDate: ['pay date', 'date de pay', 'date paiement', 'date de paiement', 'jour paiement', 'echeance', 'échéance'],
  price: ['montant', 'prix', 'price', 'loyer', 'cout', 'coût'],
  capacity: ['capacite', 'capacité', 'capacity', 'places'],
  people: ['personnes', 'nombre personnes', 'n.p', 'np', 'people', 'effectif'],
  chantier: ['chantier', 'chanter', 'projet'], responsible: ['responsable', 'respo', 'superviseur'],
  startMonth: ['date de debut', 'date début', 'mois de debut', 'mois début', 'start date'],
  remark: ['remarque', 'remark', 'observation', 'commentaire'],
}

export const clean = (value) => String(value ?? '').trim().replace(/\s+/g, ' ')
export const normalized = (value) => clean(value).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

/**
 * Read a number out of a spreadsheet cell.
 *
 * Excel hands us real numbers when the cell is typed as one, and text when it
 * is not — '4 000,00 MAD', '4.000,00', '1 200'. The currency and separators are
 * stripped, then the last separator standing decides the decimal point.
 */
export function numberValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  let text = clean(value).replace(/[^0-9,.-]/g, '')
  if (!text) return null
  const comma = text.lastIndexOf(','), dot = text.lastIndexOf('.')
  /* Both present: the rightmost is the decimal mark and the other is grouping —
     '1.234,56' (fr) and '1,234.56' (en) both come out as 1234.56. Previously
     only the first comma was swapped for a dot, so '1.234,56' parsed as NaN and
     the row was rejected as "Montant invalide". */
  if (comma > -1 && dot > -1) {
    text = comma > dot ? text.replaceAll('.', '').replace(',', '.') : text.replaceAll(',', '')
  } else if (comma > -1) {
    /* One comma: decimal if it leaves one or two digits ('4000,50'), grouping
       otherwise ('4,000'). Excel's fr locale writes the former. */
    text = /,\d{3}(\D|$)/.test(text) && !/,\d{1,2}$/.test(text) ? text.replaceAll(',', '') : text.replace(',', '.')
  } else if (/\.\d{3}(\D|$)/.test(text) && !/\.\d{1,2}$/.test(text)) {
    text = text.replaceAll('.', '')
  }
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : null
}

export const isMissingValue = (value) => ['', '*', '-', '—', 'N/A', 'NA'].includes(clean(value).toUpperCase())

/**
 * Read a payment date out of a cell and return `{ date, day }`, or null.
 *
 * `day` is what the whole Paiements page filters on, so it must agree with
 * `date`. It reads the date's UTC parts throughout: XLSX with `cellDates: true`
 * builds Date objects at UTC midnight, and `.getDate()` is local — so for any
 * user west of Greenwich, the 1st of March came back as `date: '2026-03-01'`
 * with `day: 28`, and the record then filtered under February.
 */
export function paymentDate(value, XLSX) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return { date: value.toISOString().slice(0, 10), day: value.getUTCDate() }
  }
  /* A serial ≤ 31 is far more likely to be a day-of-month typed as a number
     than a date in January 1900, which is what Excel's epoch would make of it. */
  if (typeof value === 'number' && value > 31) {
    const date = XLSX?.SSF?.parse_date_code(value)
    if (date) return { date: `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`, day: date.d }
  }
  const text = clean(value), parts = text.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/)
  if (parts) {
    const day = Number(parts[1]), month = Number(parts[2])
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const year = parts[3].length === 2 ? `20${parts[3]}` : parts[3]
      return { date: `${year}-${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}`, day }
    }
    return null
  }
  const day = Number(text.match(/\d{1,2}/)?.[0])
  return day >= 1 && day <= 31 ? { date: '', day } : null
}

/**
 * Score a header against one synonym. 1 is exact, .72 is a containment match,
 * 0 is no match; .7 is the acceptance threshold in `detect`.
 *
 * The containment rule is what made the importer unusable on ordinary sheets.
 * `SYNONYMS.company` legitimately includes the one-letter alias 'e' for sheets
 * whose entreprise column is headed 'E' — and 'e' is contained in almost every
 * French header there is. 'Date de paiement' scored .72 for `company`, company
 * is resolved before payDate in field order, so it claimed the column; payDate
 * was left unmapped and every single row failed with "Date de paiement
 * invalide". Tokens of one or two characters now have to match a whole word.
 *
 * The rule is symmetric because containment is: with only the alias guarded, a
 * header of 'E' was still contained in 'location', so Localisation took the
 * entreprise column at .72 — resolved earlier in field order than Entreprise,
 * which would have matched it exactly — and entreprise went unmapped instead.
 */
export function score(header, alias) {
  const source = normalized(header), target = normalized(alias)
  if (!source || !target) return 0
  if (source === target) return 1
  if (target.length <= 2 || source.length <= 2) return source.split(' ').includes(target) || target.split(' ').includes(source) ? 1 : 0
  return source.includes(target) || target.includes(source) ? 0.72 : 0
}

/**
 * Map spreadsheet headers onto our fields.
 *
 * A previously saved mapping for the same field wins outright. Required fields
 * are resolved before optional ones, so a column both could claim goes to the
 * one the import cannot proceed without.
 */
export function detect(headers, saved = {}) {
  const mapping = Object.fromEntries(FIELDS.map(([field]) => [field, '']))
  const used = new Set()
  const claim = (field, header) => { mapping[field] = header; if (header) used.add(header) }

  for (const [field] of FIELDS) {
    if (saved[field] && headers.includes(saved[field]) && !used.has(saved[field])) claim(field, saved[field])
  }
  const remaining = [...FIELDS].sort((a, b) => Number(Boolean(b[2])) - Number(Boolean(a[2])))
  for (const [field] of remaining) {
    if (mapping[field]) continue
    let best = '', highest = 0
    for (const header of headers) {
      if (used.has(header)) continue
      for (const alias of SYNONYMS[field]) {
        const next = score(header, alias)
        if (next > highest) { highest = next; best = header }
      }
    }
    if (highest >= 0.7) claim(field, best)
  }
  return mapping
}

/**
 * Turn a sheet's rows into records, sorted into accepted / errors / duplicates.
 *
 * `existing` is the current dataset, used only to describe what an import would
 * change — nothing here writes anything.
 */
export function analyze(rows, mapping, existing, XLSX) {
  const accepted = [], errors = [], duplicates = [], seen = new Set()
  const existingMap = new Map(existing.map((row) => [recordKey(row), row]))
  rows.forEach((source, index) => {
    const get = (field) => (mapping[field] ? source[mapping[field]] : '')
    const pay = paymentDate(get('payDate'), XLSX), matricule = normalizeMatricule(get('matricule'))
    const price = numberValue(get('price')), people = numberValue(get('people')), capacity = numberValue(get('capacity'))
    const rowErrors = []
    if (!matricule) rowErrors.push('Matricule manquant')
    if (!pay) rowErrors.push('Date de paiement invalide')
    if (mapping.price && price == null) rowErrors.push('Montant invalide')
    if (mapping.people && !isMissingValue(get('people')) && people == null) rowErrors.push('Nombre de personnes invalide')
    if (mapping.capacity && !isMissingValue(get('capacity')) && capacity == null) rowErrors.push('Capacité invalide')
    const record = { matricule, people, capacity, payDay: pay?.day ?? null, payDate: pay?.date || '', price, remark: clean(get('remark')), responsible: clean(get('responsible')), startMonth: clean(get('startMonth')), company: clean(get('company')), chantier: clean(get('chantier')), location: clean(get('location')) }
    /* +2: one for the header row, one because spreadsheet rows are 1-based. */
    if (rowErrors.length) { errors.push({ line: index + 2, messages: rowErrors, source }); return }
    const key = recordKey(record)
    if (seen.has(key)) { duplicates.push({ line: index + 2, record, key }); return }
    seen.add(key)
    const previous = existingMap.get(key)
    const changes = previous
      ? Object.keys(record).filter((field) => String(previous[field] ?? '') !== String(record[field] ?? '')).map((field) => ({ field, before: previous[field], after: record[field] }))
      : []
    accepted.push({ record, key, previous, changes })
  })
  return { accepted, errors, duplicates }
}

/**
 * Read a workbook into `{ names, sheets }`, one entry per sheet.
 *
 * The header row is the first row carrying two or more non-empty cells, which
 * is how sheets with a title banner above the table are handled.
 */
export function readWorkbook(workbook, XLSX) {
  const sheets = Object.fromEntries(workbook.SheetNames.map((name) => {
    const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '', raw: true })
    const headerIndex = matrix.findIndex((row) => row.filter((cell) => clean(cell)).length >= 2)
    const headerRow = matrix[headerIndex] || []
    const lastColumn = headerRow.reduce((last, value, index) => (clean(value) ? index : last), -1)
    /* Blank headers keep a positional name so their column stays selectable in
       the mapping UI rather than silently disappearing. Duplicate labels are
       suffixed, because two identical keys would collapse into one below. */
    const taken = new Set()
    const headers = headerRow.slice(0, lastColumn + 1).map((header, index) => {
      const base = clean(header) || `Colonne ${index + 1}`
      let label = base
      for (let suffix = 2; taken.has(label); suffix++) label = `${base} (${suffix})`
      taken.add(label)
      return label
    })
    const rows = matrix.slice(headerIndex + 1)
      .filter((row) => row.slice(0, headers.length).some((cell) => clean(cell)))
      .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index]])))
    return [name, { headers, rows, columns: headers.length }]
  }))
  return { names: workbook.SheetNames, sheets }
}
