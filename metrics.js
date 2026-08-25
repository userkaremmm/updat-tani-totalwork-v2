/* ============================================================================
   TOTAL WORK — Metrics

   Every number the dashboard shows comes from this file. It was inline in
   App.jsx, mixed in with the components that rendered it, which meant the
   payment totals and occupancy rates — the figures the business actually runs
   on — could only be checked by looking at the screen. They are pure functions
   of an array of records, so they belong somewhere a test can reach them.

   The calculations themselves are unchanged: same tolerance for missing values,
   same rounding, same sort orders. What changed is that they are now stated
   once, and that grouping hands back the rows it grouped instead of making
   callers re-scan the dataset to find them again.
   ========================================================================== */

/* Records arrive from Excel, so "not declared" is a normal state for almost
   every field. A missing number contributes nothing rather than poisoning the
   total with NaN — that tolerance is deliberate and load-bearing. */
export const sum = (data, key) => data.reduce((total, item) => total + (Number(item[key]) || 0), 0)

/* Sorted with a French collator: without it, 'Étoile' lands after 'Zagora'. */
export const unique = (data, key) => [...new Set(data.map((item) => item[key]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'fr'))

/* No capacity declared is 0%, not a division by zero. Above 100% is possible
   and left visible on purpose: an over-occupied site is exactly the thing the
   parc manager needs to see, so it is not clamped here. Callers that render a
   fixed-width bar clamp at their own edge. */
export const rate = (data) => {
  const capacity = sum(data, 'capacity')
  return capacity ? Math.round((sum(data, 'people') / capacity) * 100) : 0
}

export const initials = (text) => String(text || '')
  .split(/\s+/)
  .map((part) => part[0] || '')
  .join('')
  .slice(0, 2)
  .toUpperCase()

/* The label for a record whose grouping field is empty. Exported because the
   Housing filter has to reproduce it to answer "show me the rows in this
   bucket" — a hardcoded copy in a second file is how the Directory cards ended
   up claiming zero people for the "Non renseigné" group. */
export const UNSET = 'Non renseigné'

/**
 * Group records by a field. Returns one bucket per distinct value, ranked by
 * amount descending, each carrying the rows that formed it.
 *
 * `value` is either 'count' (one per record) or the numeric field to total.
 */
export function groupRows(data, key, value = 'price') {
  const buckets = new Map()
  for (const item of data) {
    /* Empty, null and '' all collapse into one visible bucket. payDay is the
       one numeric key grouped this way and is validated 1..31 server-side, so
       no legitimate record falls in here through a falsy 0. */
    const name = item[key] || UNSET
    let bucket = buckets.get(name)
    if (!bucket) buckets.set(name, (bucket = { name, amount: 0, rows: [] }))
    bucket.amount += value === 'count' ? 1 : Number(item[value]) || 0
    bucket.rows.push(item)
  }
  /* Insertion order in, stable sort applied: two buckets with equal amounts
     keep the order they first appeared in the dataset. */
  return [...buckets.values()].sort((a, b) => b.amount - a.amount)
}

/** groupRows without the rows, for the chart series that only need the shape. */
export const grouped = (data, key, value = 'price') => groupRows(data, key, value).map(({ name, amount }) => ({ name, amount }))

/* ---- Filtering -----------------------------------------------------------
   The one filter predicate for the whole app. Both payment-day bounds are
   inclusive — the Paiements page states that to the user in so many words.
   ------------------------------------------------------------------------ */

/* An empty filter accepts everything. A filter set to UNSET means "this field
   is empty", which is what the Directory cards link to: the bucket is named
   'Non renseigné', and comparing that label against the records as a literal
   value matched nothing at all, so the card opened an empty table. */
const fieldMatches = (item, key, wanted) => !wanted || (wanted === UNSET ? !item[key] : item[key] === wanted)

export function matches(item, filters) {
  if (!fieldMatches(item, 'location', filters.location)) return false
  if (!fieldMatches(item, 'company', filters.company)) return false
  if (!fieldMatches(item, 'chantier', filters.chantier)) return false
  if (!fieldMatches(item, 'responsible', filters.responsible)) return false
  if (filters.matricule && !String(item.matricule ?? '').toLowerCase().includes(filters.matricule.toLowerCase())) return false
  const day = Number(item.payDay)
  return Number.isFinite(day) && day >= filters.from && day <= filters.to
}

export const applyFilters = (data, filters) => data.filter((item) => matches(item, filters))

/* A day-of-month input that the user has cleared reads as '' → Number('') → 0,
   which used to widen the range to `payDay >= 0` and silently disable the
   filter while showing an out-of-range 0 in the box. */
export const payDay = (value, fallback) => {
  const parsed = Math.trunc(Number(value))
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 31 ? parsed : fallback
}

/* ---- Formatting ---------------------------------------------------------- */
export const money = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'MAD', minimumFractionDigits: 2 })
export const number = new Intl.NumberFormat('fr-FR')
export const compact = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 })

/**
 * One CSV field, quoted and escaped.
 *
 * Excel and Sheets evaluate any cell whose text begins with = + - @ or a
 * control character as a formula, so a remark typed as `=HYPERLINK("http://…")`
 * used to execute the moment somebody opened the exported report. A leading
 * apostrophe is the spreadsheet-native "this is literal text" marker and is not
 * displayed as content. Numbers are exempt: they cannot carry a formula, and
 * prefixing a negative amount would break it as a number.
 */
export const csvCell = (value) => {
  const text = value == null ? '' : String(value)
  const risky = typeof value !== 'number' && /^[=+\-@\t\r]/.test(text)
  return `"${(risky ? `'${text}` : text).replaceAll('"', '""')}"`
}

/** A complete CSV document, BOM-prefixed so Excel reads it as UTF-8. */
export const csvDocument = (headers, rows) => `﻿${[headers.map(csvCell).join(';'), ...rows.map((row) => row.map(csvCell).join(';'))].join('\r\n')}`

/* Revoking synchronously after click() cancels the download in Safari, so the
   URL is released on the next task instead. */
export function download(filename, text, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
