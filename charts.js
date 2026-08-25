/* ============================================================================
   TOTAL WORK — Visualization system

   One module decides how data becomes colour, so every chart in the dashboard
   reads as part of the same system instead of as unrelated widgets.

   Two palettes, and which one you use is decided by what the data IS:

     sequential()   ONE measure ranked across categories — the sorted bar
                    charts. A single hue ordered dark→light restates the
                    ranking that the bar length already shows. Giving those
                    bars eight different hues implies eight different kinds of
                    thing, which is false and is the main reason a dashboard
                    starts to look like a pile of unrelated charts.

     categorical()  Unordered entities that must be told apart — donut and pie
                    slices, per-entity accents. Distinct hues at comparable
                    lightness, so no one category shouts over the rest.

   Everything returned is a CSS colour string referencing tokens, never a
   literal, so light/dark is resolved by tokens.css alone. Recharts writes
   these into SVG `fill`/`stroke` presentation attributes, where custom
   properties and color-mix() both resolve.
   ========================================================================== */

/* Base palette size and ramp length. Mirrors --cat-1..8 / --seq-1..6. */
const CAT_STOPS = 8
const SEQ_STOPS = 6

/* How far each shading tier moves toward --cat-shade, and the floor it stops
   at. Past ~48 categories the tiers would collapse into each other, so they
   plateau and hue alone keeps doing the separating. */
const SHADE_STEP = 0.28
const SHADE_FLOOR = 0.3

const cat = (n) => `var(--cat-${n})`
const seq = (n) => `var(--seq-${n})`

/* Mix in OKLCH, not sRGB: sRGB interpolation dips through a darker, greyer
   midpoint, which is exactly the "two colours that are nearly the same"
   failure this module exists to avoid. OKLCH holds perceived lightness, so a
   midpoint between two hues stays as vivid as its parents. */
const mix = (a, b, weight) => `color-mix(in oklch, ${a} ${Math.round(weight * 100)}%, ${b})`

/**
 * `count` visually distinct colours for unordered categories.
 *
 * The first eight are the hand-tuned base palette. Past that, colours are
 * DERIVED rather than wrapped around, in rounds that each stay as far as
 * possible from everything already handed out:
 *
 *   round 0   the 8 base hues                                     →  8 colours
 *   round 1   the 8 midpoints between neighbouring base hues      → 16
 *   round 2   round 0, pulled toward --cat-shade                  → 24
 *   round 3   round 1, pulled toward --cat-shade                  → 32
 *   round 4+  deeper tiers of the same two hue sets
 *
 * Odd rounds add hue, even rounds add lightness, so the two dimensions
 * alternate and a new colour is never a near-twin of the one eight slots
 * earlier. Because --cat-shade points away from the panel surface in both
 * themes, every derived colour gains contrast against the panel rather than
 * fading into it.
 *
 * Assignment is by index, not by a hash of the category name: within a single
 * chart that guarantees maximum separation, which matters more here than
 * colour persistence across pages — the pages that show companies order them
 * by different measures anyway (count in Analytics, amount in Payments), so a
 * stable colour could not carry meaning between them.
 */
export function categorical(count) {
  return Array.from({ length: Math.max(count, 0) }, (_, index) => {
    const slot = index % CAT_STOPS
    const round = Math.floor(index / CAT_STOPS)

    // Even rounds sit on a base hue; odd rounds sit halfway to the next one,
    // wrapping so the last slot pairs with the first.
    const hue =
      round % 2 === 0 ? cat(slot + 1) : mix(cat(slot + 1), cat(((slot + 1) % CAT_STOPS) + 1), 0.5)

    const tier = Math.floor(round / 2)
    if (tier === 0) return hue
    return mix(hue, 'var(--cat-shade)', Math.max(1 - tier * SHADE_STEP, SHADE_FLOOR))
  })
}

/**
 * `count` colours along the sequential ramp, darkest end first — pair with
 * data sorted high to low so colour and position agree.
 *
 * The ramp has six stops, and any other count is interpolated across the whole
 * range instead of truncated to a prefix. Three bars therefore span dark →
 * mid → light rather than crowding into the three darkest greens.
 */
export function sequential(count) {
  if (count <= 0) return []
  if (count === 1) return [seq(1)]
  return Array.from({ length: count }, (_, index) => {
    const position = (index / (count - 1)) * (SEQ_STOPS - 1)
    const lower = Math.floor(position)
    const offset = position - lower
    // Landed on a stop (always true for count === SEQ_STOPS) — use it directly
    // rather than emitting a pointless 100% mix.
    if (offset < 0.001) return seq(lower + 1)
    return mix(seq(lower + 1), seq(lower + 2), 1 - offset)
  })
}

/* ============================================================================
   Shared chart chrome

   Recharts' axis and grid defaults are hardcoded greys (#666, #ccc) that
   ignore the theme, so they turn near-invisible on the dark canvas. Every
   axis and grid in the app spreads these instead.
   ========================================================================== */

/* 11px is the type floor from tokens.css. Recharts needs the number, not the
   token: it measures tick text in JS to lay out the axis, so a var() here
   would silently fall back to its default size for the layout maths. */
export const TICK = { fill: 'var(--text-tertiary)', fontSize: 11 }

export const axis = { axisLine: false, tickLine: false, tick: TICK }

/* Horizontal rules only. Vertical gridlines on a categorical axis fence off
   each bar and add no reference the labels don't already give. */
export const grid = { vertical: false, stroke: 'var(--grid)' }

/* Hover backdrop behind the focused bar/point. Recharts defaults to an opaque
   light grey that blanks out the series underneath it. */
export const cursor = { fill: 'var(--hover)' }

/* Pie and donut slices are separated by a hairline in the panel colour, so
   adjacent slices stay distinct even when the palette wraps into a derived
   tier. paddingAngle tightens as slice count grows — a fixed gap that reads
   well at 6 slices eats a 30-slice pie alive. */
export function sliceGap(count) {
  return { stroke: 'var(--surface)', strokeWidth: 1, paddingAngle: count > 18 ? 0 : count > 10 ? 1 : 2 }
}
