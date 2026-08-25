/* Unit smoke test for the client's pure logic — metrics.js and excel.js.
   These are the numbers the parc runs on and the parsing that decides whether
   an import works at all, so they are checked here rather than on screen. Same
   shape as server/security-smoke.mjs: build one results object, compare it
   against one expectation, and let a single diff name the guarantee that moved.

   Run: npm run test:client */

/* Set before the first Date operation. The payment-date reader must return a
   day that agrees with its own date string, and reading local parts off a
   UTC-midnight Date only disagrees west of Greenwich — under UTC the broken
   version passes. Pinning the zone makes that regression reachable. */
process.env.TZ = 'America/Los_Angeles'

const {
  sum, unique, rate, initials, UNSET, groupRows, grouped,
  matches, applyFilters, payDay, money, number, compact, csvCell, csvDocument,
} = await import('./metrics.js')
const {
  clean, normalized, numberValue, isMissingValue, paymentDate,
  score, detect, analyze, readWorkbook,
} = await import('./excel.js')

/* ---- Fixtures ------------------------------------------------------------ */

const parc = [
  { matricule: 'A-1', location: 'Casablanca', payDay: 5, price: 100, people: 4, capacity: 6 },
  { matricule: 'B-2', location: '', payDay: 20, price: 50, people: 3, capacity: 4 },
  { matricule: 'C-3', location: 'Casablanca', payDay: 12, price: 25, people: 2, capacity: 2 },
  { matricule: 'D-4', location: 'Rabat', payDay: 28, price: 125, people: 1, capacity: 10 },
  { matricule: 'E-5', location: 'Rabat', payDay: null, price: 900, people: 9, capacity: 9 },
]
const noFilter = { location: '', company: '', chantier: '', responsible: '', matricule: '', from: 1, to: 31 }
const filterBy = (extra) => applyFilters(parc, { ...noFilter, ...extra }).map((row) => row.matricule)

/* XLSX is only reached for serial dates and for sheet_to_json, so a stub of
   exactly those two entry points keeps the test free of the real dependency. */
const XLSX = {
  SSF: { parse_date_code: (serial) => (serial === 45717 ? { y: 2026, m: 3, d: 1 } : null) },
  utils: { sheet_to_json: (sheet) => sheet },
}

const workbook = {
  SheetNames: ['Logements'],
  Sheets: {
    /* A title banner over the table, a repeated label, a blank column and a
       trailing empty row — every shape readWorkbook claims to survive. */
    Logements: [
      ['Rapport logements 2026', '', '', '', ''],
      ['Matricule', 'Montant', 'Montant', '', 'Note'],
      ['A-1', '4 000,00 MAD', '5', '', 'ok'],
      ['', '', '', '', ''],
    ],
  },
}
const sheet = readWorkbook(workbook, XLSX).sheets.Logements

const utcDate = paymentDate(new Date(Date.UTC(2026, 2, 1)))
const mapping = { matricule: 'Matricule', payDate: 'Date', price: 'Montant' }
const analysis = analyze([
  { Matricule: 'a-1', Date: '05/03/2026', Montant: '4 000,00' },
  { Matricule: 'A-1', Date: '05/03/2026', Montant: '4 000,00' },
  { Matricule: '', Date: '05/03/2026', Montant: '1' },
  { Matricule: 'B-2', Date: 'sans date', Montant: '1' },
  { Matricule: 'C-3', Date: '07/03/2026', Montant: 'abc' },
], mapping, [{ matricule: 'A-1', payDay: 5, payDate: '2026-03-05', price: 3000, people: null, capacity: null, remark: '', responsible: '', startMonth: '', company: '', chantier: '', location: '' }], XLSX)

/* ---- Results ------------------------------------------------------------- */

const results = {
  /* Missing and non-numeric values contribute nothing instead of NaN. */
  sum: sum(parc, 'price'),
  sumMissing: sum([{ price: 10 }, { price: 'x' }, {}], 'price'),
  /* French collation: 'Étoile' before 'Zagora', and empties dropped. */
  unique: unique([{ n: 'Zagora' }, { n: 'Étoile' }, { n: '' }, { n: 'Étoile' }], 'n'),
  rate: rate([{ people: 5, capacity: 10 }]),
  rateNoCapacity: rate([{ people: 5 }]),
  rateOver: rate([{ people: 12, capacity: 10 }]),
  initials: initials('Youssef El Amrani'),
  initialsEmpty: initials(null),
  moneyCurrency: money.resolvedOptions().currency,
  numberLocale: number.resolvedOptions().locale,
  compactNotation: compact.resolvedOptions().notation,

  /* Grouping: empties collapse into one named bucket, ranked by amount, ties
     keeping dataset order, and every bucket carrying the rows that formed it. */
  groupNames: groupRows(parc, 'location', 'price').map((item) => item.name),
  groupAmounts: groupRows(parc, 'location', 'price').map((item) => item.amount),
  groupRowCounts: groupRows(parc, 'location', 'price').map((item) => item.rows.length),
  groupCounts: groupRows(parc, 'location', 'count').map((item) => [item.name, item.amount]),
  groupedKeys: Object.keys(grouped(parc, 'location')[0]),

  /* payDay null is out of range, so E-5 never passes the day filter. */
  filterNone: filterBy({}),
  /* The Directory card for the empty bucket links on the label itself. */
  filterUnset: filterBy({ location: UNSET }),
  filterLocation: filterBy({ location: 'Casablanca' }),
  filterMatricule: filterBy({ matricule: 'a-' }),
  filterBoundsInclusive: filterBy({ from: 5, to: 5 }),
  filterBoundsRange: filterBy({ from: 12, to: 20 }),
  matchesUnsetOnFilled: matches(parc[0], { ...noFilter, location: UNSET }),

  payDayCleared: payDay('', 12),
  payDayZero: payDay('0', 12),
  payDayOverflow: payDay('32', 12),
  payDayFraction: payDay('15.9', 12),
  payDayText: payDay('abc', 7),
  payDayValid: payDay('15', 12),

  /* A leading = + - @ is neutralised so the export is data, not a program. */
  csvFormula: csvCell('=HYPERLINK("http://x")'),
  csvAt: csvCell('@cmd'),
  csvNegativeText: csvCell('-500'),
  csvNegativeNumber: csvCell(-500),
  csvQuotes: csvCell('a"b'),
  csvEmpty: csvCell(null),
  csvDocument: csvDocument(['A', 'B'], [[1, '=x']]),

  clean: clean('  A-1   B  '),
  normalized: normalized('Capacité / Places'),

  /* Both separator conventions land on the same amount. */
  numberFr: numberValue('1.234,56'),
  numberEn: numberValue('1,234.56'),
  numberCurrency: numberValue('4 000,00 MAD'),
  numberSpaced: numberValue('1 200'),
  numberCommaGroup: numberValue('4,000'),
  numberCommaDecimal: numberValue('4000,50'),
  numberDotGroup: numberValue('1.200'),
  numberDotDecimal: numberValue('1.20'),
  numberNegative: numberValue('-500'),
  numberPassthrough: numberValue(1234.5),
  numberText: numberValue('abc'),
  numberNaN: numberValue(Number.NaN),
  missingDash: [' - ', '—', 'n/a', '*', ''].map(isMissingValue),
  missingZero: isMissingValue('0'),

  /* day must agree with date — the invariant the local/UTC mix-up broke. */
  utcDay: utcDate.day,
  utcDate: utcDate.date,
  utcAgrees: utcDate.date.slice(8) === String(utcDate.day).padStart(2, '0'),
  dateSlashes: paymentDate('01/03/2026'),
  dateDots: paymentDate('5.7.26'),
  dateBadMonth: paymentDate('15/13/2026'),
  dateDayOnly: paymentDate('15'),
  dateDayOutOfRange: paymentDate('45'),
  dateSmallNumber: paymentDate(5, XLSX),
  dateSerial: paymentDate(45717, XLSX),
  dateEmpty: paymentDate(''),

  /* The one-letter alias 'e' for an 'E' column must not swallow a header that
     merely contains the letter, or payDate is left unmapped and every row
     fails with "Date de paiement invalide". */
  scoreShortAliasWord: score('Date de paiement', 'e'),
  scoreShortAliasExact: score('E', 'e'),
  /* Mirrored: a one-letter header is contained in 'location' too. */
  scoreShortHeader: score('E', 'location'),
  scoreExact: score('Matricule', 'matricule'),
  scoreContains: score('Entreprise / Société', 'entreprise'),
  scoreMiss: score('Ville', 'chantier'),
  detectRealSheet: detect(['Matricule', 'Date de paiement', 'E', 'Montant']),
  detectSavedWins: detect(['Matricule', 'Remarque', 'Note'], { remark: 'Note' }).remark,
  /* Two whole sheets, mapped field for field: the accented/abbreviated header
     row TOTAL WORK actually exports, and the synonym-only variant. Anything
     that regresses the scorer shows up here as an unmapped field. */
  detectFullAccented: Object.values(detect(['Matricule', 'Localisation', 'E', 'Date de paiement', 'Montant', 'Capacité', 'N.P', 'Chantier', 'Responsable', 'Date de début', 'Remarque'])),
  detectFullSynonyms: Object.values(detect(['MAT', 'Ville', 'Entreprise', 'Echéance', 'Prix', 'Places', 'Effectif', 'Projet', 'Respo', 'Start date', 'Observation'])),

  /* Header row found under the banner, duplicate label suffixed, blank column
     kept selectable by position, blank row dropped. */
  sheetHeaders: sheet.headers,
  sheetColumns: sheet.columns,
  sheetRowCount: sheet.rows.length,
  sheetFirstRow: sheet.rows[0]['Montant (2)'],

  acceptedCount: analysis.accepted.length,
  acceptedChanges: analysis.accepted[0].changes.map((change) => change.field),
  acceptedNormalized: analysis.accepted[0].record.matricule,
  duplicateLines: analysis.duplicates.map((item) => item.line),
  errorLines: analysis.errors.map((item) => item.line),
  errorMessages: analysis.errors.map((item) => item.messages.join(', ')),
}

/* ---- Expectations -------------------------------------------------------- */

const expected = {
  sum: 1200, sumMissing: 10,
  unique: ['Étoile', 'Zagora'],
  rate: 50, rateNoCapacity: 0, rateOver: 120,
  initials: 'YE', initialsEmpty: '',
  moneyCurrency: 'MAD', numberLocale: 'fr-FR', compactNotation: 'compact',

  groupNames: ['Rabat', 'Casablanca', UNSET],
  groupAmounts: [1025, 125, 50],
  groupRowCounts: [2, 2, 1],
  groupCounts: [['Casablanca', 2], ['Rabat', 2], [UNSET, 1]],
  groupedKeys: ['name', 'amount'],

  filterNone: ['A-1', 'B-2', 'C-3', 'D-4'],
  filterUnset: ['B-2'],
  filterLocation: ['A-1', 'C-3'],
  filterMatricule: ['A-1'],
  filterBoundsInclusive: ['A-1'],
  filterBoundsRange: ['B-2', 'C-3'],
  matchesUnsetOnFilled: false,

  payDayCleared: 12, payDayZero: 12, payDayOverflow: 12,
  payDayFraction: 15, payDayText: 7, payDayValid: 15,

  csvFormula: '"\'=HYPERLINK(""http://x"")"',
  csvAt: '"\'@cmd"',
  csvNegativeText: '"\'-500"',
  csvNegativeNumber: '"-500"',
  csvQuotes: '"a""b"',
  csvEmpty: '""',
  csvDocument: '﻿"A";"B"\r\n"1";"\'=x"',

  clean: 'A-1 B',
  normalized: 'capacite places',

  numberFr: 1234.56, numberEn: 1234.56, numberCurrency: 4000,
  numberSpaced: 1200, numberCommaGroup: 4000, numberCommaDecimal: 4000.5,
  numberDotGroup: 1200, numberDotDecimal: 1.2, numberNegative: -500,
  numberPassthrough: 1234.5, numberText: null, numberNaN: null,
  missingDash: [true, true, true, true, true], missingZero: false,

  utcDay: 1, utcDate: '2026-03-01', utcAgrees: true,
  dateSlashes: { date: '2026-03-01', day: 1 },
  dateDots: { date: '2026-07-05', day: 5 },
  dateBadMonth: null,
  dateDayOnly: { date: '', day: 15 },
  dateDayOutOfRange: null,
  dateSmallNumber: { date: '', day: 5 },
  dateSerial: { date: '2026-03-01', day: 1 },
  dateEmpty: null,

  scoreShortAliasWord: 0, scoreShortAliasExact: 1, scoreShortHeader: 0, scoreExact: 1,
  scoreContains: 0.72, scoreMiss: 0,
  detectRealSheet: {
    matricule: 'Matricule', location: '', company: 'E', payDate: 'Date de paiement',
    price: 'Montant', capacity: '', people: '', chantier: '', responsible: '',
    startMonth: '', remark: '',
  },
  detectSavedWins: 'Note',
  detectFullAccented: ['Matricule', 'Localisation', 'E', 'Date de paiement', 'Montant', 'Capacité', 'N.P', 'Chantier', 'Responsable', 'Date de début', 'Remarque'],
  detectFullSynonyms: ['MAT', 'Ville', 'Entreprise', 'Echéance', 'Prix', 'Places', 'Effectif', 'Projet', 'Respo', 'Start date', 'Observation'],

  sheetHeaders: ['Matricule', 'Montant', 'Montant (2)', 'Colonne 4', 'Note'],
  sheetColumns: 5, sheetRowCount: 1, sheetFirstRow: '5',

  acceptedCount: 1,
  acceptedChanges: ['price'],
  acceptedNormalized: 'A-1',
  duplicateLines: [3],
  errorLines: [4, 5, 6],
  errorMessages: ['Matricule manquant', 'Date de paiement invalide', 'Montant invalide'],
}

let failures = 0
for (const [key, value] of Object.entries(expected)) {
  if (JSON.stringify(results[key]) !== JSON.stringify(value)) {
    console.error(`ÉCHEC ${key}: attendu ${JSON.stringify(value)}, obtenu ${JSON.stringify(results[key])}`)
    failures++
  }
}
const untested = Object.keys(results).filter((key) => !(key in expected))
if (untested.length) { console.error(`ÉCHEC résultats sans attente: ${untested.join(', ')}`); failures++ }
if (failures) process.exitCode = 1
else console.log(`OK ${Object.keys(expected).length} vérifications (metrics.js, excel.js)`)
