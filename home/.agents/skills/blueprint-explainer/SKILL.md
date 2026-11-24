---
name: blueprint-explainer
description: Blueprint/dataviz look and motion for HyperFrames (HTML/CSS/GSAP) explainer scenes - dot-grid sheet, one-blue isometric line drawings, exploded diagrams, vertical mono labels, ink-only charts and counters. Use when a video scene should look "blueprint", "technical drawing", "exploded view", "makingsoftware / Dan Hollick style", or when writing or reviewing a scene brief in that style.
---

# Blueprint explainer

Every scene is a **figure**: one technical drawing on a dotted sheet, labelled like a plate in a manual, in one blue ink. The drawing is the motion: parts trace on, the object explodes to show its layers, callouts arrive, the object closes again. Nothing floats, pulses or slides in for decoration.

This skill sets the look and the motion. The HyperFrames contract (clips, `window.__timelines`, check, render) comes from the `hyperframes` skill; read it first.

## Build a scene

1. **Copy the kit** into the video project (once per project):
   ```bash
   SK=<this skill dir>; V=<video project dir>
   mkdir -p $V/assets/blueprint $V/assets/fonts $V/assets/vendor
   cp $SK/references/{palette.css,components.css,draw.js,motion.js} $V/assets/blueprint/
   cp $SK/assets/fonts/* $V/assets/fonts/          # Departure Mono + OFL licence
   cp -n $SK/assets/vendor/gsap.min.js $V/assets/vendor/   # skip if the project has GSAP
   ```
   In `index.html` `<head>`, in this order: `assets/vendor/gsap.min.js`, `assets/blueprint/palette.css`, `assets/blueprint/components.css`, `assets/blueprint/draw.js`, `assets/blueprint/motion.js`. Done when `check` reports no font or network findings.
2. **Write the brief** with the template in [Prompting guide](#prompting-guide). Done when every layer has a fill, a lift and a callout side, and exactly one part is the accent.
3. **Build the scene** as a sub-composition by copying `examples/exploded-stack/compositions/exploded-stack.html` and replacing the drawing block, callouts and beats. Keep the frame (sheet, ticks, three corner labels) on every scene.
4. **Check and look**: run `check --json` (0 errors), then `snapshot --at` the build, the fully exploded hold and the rest hold. Compare each snapshot against the [Look checklist](#look-checklist). Done when every item passes.

## Tokens

All values live in `references/palette.css`; use the variables, never raw hex.

| Token | Value | Role | Evidence |
|---|---|---|---|
| `--bp-paper` | `#F9F9FA` | page outside the sheet, no dots | `frames/full_t3.5.png` (#F9F9F9) |
| `--bp-sheet` | `#F7F7FC` | figure panel, carries dots | same frame (#F7F7FC) |
| `--bp-dot` | `#CFCDE6` | grid dots | `frames/crop_corner_topleft.png` |
| `--bp-ink` | `#2A36E0` | every outline, leader, label | darkest ink #2430C8–#3440FC |
| `--bp-ink-soft` | `#7C86EE` | dashed guides, gridlines | `frames/crop_labels_left.png` |
| `--bp-meta` | `#6B6B6B` | corner metadata | measured #707070–#747474, darkened to pass 4.5:1 |
| `--bp-face` | `#EFF2F5` | neutral part faces | #EFF2F5 |
| `--bp-tint` | `#DFE6FC` | secondary faces, bars | #DFE6FC |
| `--bp-accent` | `#8C9BF9` | the ONE part the scene is about | #8C9BF9 |
| `--bp-signal` | `#E5484D` | error/alert state only, max one element | our addition |

Light theme only: it reads well inline in Slack and on phones. Fills are flat; no gradients, shadows, glows or blur. Side faces are the same fill with `filter: brightness(0.96)`.

## Ground: the dotted sheet

- `.bp-paper` (full frame, plain) + `.bp-sheet` (inset 96 px left/right, 64 px top/bottom, 1 px `--bp-sheet-rule` outline) + `.bp-ticks` (four 16 px L-shaped corner marks, 2 px ink). Dots only inside the sheet (`frames/crop_corner_topleft.png`).
- Dots: `radial-gradient(circle, var(--bp-dot) 1.1px, transparent 1.7px)` tiled at **12 px**. The reference uses 6 px at 1874 px wide; 12 px is our deliberate change so dots survive H.264 at 1080p (proof: `example-render-dotgrid-crop.png`).

## Line work

| Element | Recipe | Evidence |
|---|---|---|
| Outline | 2 px `--bp-ink`, round joins (`.bp-line`, `.bp-face`) | `frames/full_t3.5_half.png` |
| Inner detail | 1.5 px ink (`.bp-detail`) | same |
| Construction guide | 1.5 px `--bp-ink-soft`, dash `14 8` (`.bp-guide`); joins corresponding corners of exploded layers; shown only while exploded | `frames/crop_labels_left.png` |
| Callout leader | horizontal 2 px ink line, 16 px gap to the label, 10×8 px filled arrowhead touching the part (`BP.leader`) | `frames/crop_button_leader.png` |
| Dimension | line parallel to the measured edge, offset 40–46 px, 45° slash ticks, dashed extension lines, value centred and rotated with the line (`BP.dimension`) | our addition, in the same ink |
| Corner ticks | 16 px L marks on the sheet corners (`.bp-ticks`) | our addition |

## Type

- **One family: Departure Mono** (Helena Zhang, SIL OFL 1.1; file + licence in `assets/fonts/`, all bundled files listed in `assets/LICENSES.md`). It is the mono the reference site uses (`site/css_e32cee72da89388f.txt`). It is a pixel font: sizes are multiples of 11 px so pixels land on whole pixels. One weight only; emphasis comes from colour (ink vs meta grey) and size, never bold.
- Always UPPERCASE for labels, `letter-spacing: 0.04em`. Numbers use the same face.

| Use | Size | Colour | Notes |
|---|---|---|---|
| Corner metadata, readout keys | 22 px | `--bp-meta` | texture: add `data-layout-ignore` |
| Callout labels, dimension values | 33 px | `--bp-ink` | reading text, above the 28 px phone floor |
| Counters, chart values | 44 px | `--bp-ink` | tabular |
| Scene title (optional, one) | 66 px | `--bp-ink` | uppercase, one line |
| Hero number | 132 px | `--bp-ink` | one per scene |

**Vertical labels** (`.bp-meta.bp-vertical`): `writing-mode: vertical-rl; text-orientation: sideways` turns glyphs 90° clockwise, reading top → bottom. Three per figure: `FIG_00N` top-left, `[ SUBJECT NAME ]` top-right, `[ YEAR ]` bottom-right, 18 px inside the sheet (`frames/crop_vertical_label.png`, `site/home.png`).

## Exploded diagram recipe

Draw in SVG with `references/draw.js` (isometric 30°, world px; x runs down-right, y down-left, z up). `examples/exploded-stack` is the full worked version.

1. `const P = BP.iso(ox, oy)`: screen origin of world (0,0,0). Put it so the exploded stack fits the sheet: cover top ≥ 100 px, base bottom ≤ 960 px.
2. One `<g>` per layer, created bottom → top so upper layers paint over lower ones: `L.base = BP.el("g", {id:"layer-base"}, svg)`.
3. Fill each layer with `BP.slab(g, {P, x, y, z, w, d, h, fill})` and `BP.tray(...)` (open box). Rest positions stack: each layer's `z` = top of the one below, so the closed object hides its insides.
4. Fills: shells and trays `face`; boards and plates `tint`; the hero part `accent`. A checker of cells (`h: 0` slabs) reads as a sensor, grid or memory.
5. **Lifts** grow with height: base 0, then e.g. 110 / 230 / 380 px for a 4-layer stack. The top layer travels 35–45% of frame height (reference: 45%, `frames/motion_track_30fps.txt`). The explode is straight up the screen (a `y` tween on the layer group), never sideways.
6. Callouts go **inside their layer's group** (`BP.leader(L.mesh, {at, labelX, text})`) so they ride with the part (`frames/labels_in_1.70_vs_1.80.png`). Left column labels end at x = 560, right column starts at x = 1360. Anchor `at` on a face the layers above do not hide.
7. Guides: put them in the base group, drawn from base corners up to the cover corners' exploded height (`BP.guide`), hidden until exploded.

## Dataviz rules

Charts are drawings too: same ink, same fills, same type (`evidence/style/components-gallery.png`).

- Bars: `.bp-bar` (tint fill, 2 px ink outline), the one bar that matters `.bp-bar.hero` (accent). No other colours, no legends; the value sits 22 px above each bar in 33 px mono.
- Axis: 2 px ink baseline only. Gridlines: 1 px `--bp-ink-soft`, dash `2 6`.
- Counters: `.bp-value` / `.bp-hero-number`, zero-padded so width never jumps (`0412`). A 22 px grey key above, a 22 px unit below.
- Numbers come from the source; one data object drives every number in the scene.

## Motion vocabulary

`references/motion.js` helpers take `(tl, targets, at, opts)` and return the end time. Raw GSAP shown so you can adapt.

```js
// Stroke draw-on (BP.drawOn): trace each outline, fill fades in from 55% of the trace
const len = el.getTotalLength();
gsap.set(el, { attr: { "stroke-dasharray": `${len} ${len}` }, strokeDashoffset: len, fillOpacity: 0 });
tl.to(el, { strokeDashoffset: 0, duration: 0.6, ease: "power2.inOut" }, at);
tl.to(el, { fillOpacity: 1, duration: 0.3 }, at + 0.33);

// Explode / collapse (BP.explode / BP.collapse): measured curve, same both ways
const explodeEase = (t) => Math.pow(1 - Math.pow(1 - t, 3.1), 1.8);
tl.to("#layer-cover", { y: -380, duration: 1.6, ease: explodeEase }, at);
tl.to("#layer-cover", { y: 0, duration: 1.55, ease: explodeEase }, at2);

// Callouts (BP.calloutsIn / BP.calloutsOut): leader traces 0.3 s, text fades 0.2 s, 0.06 s apart; out all at once 0.15 s
// Dashed guides (BP.drawGuide): a masked solid copy traces so the dashes never crawl
// Counter tick (BP.counter): text set from tween progress, seek-safe
const p = { v: 0 };
tl.to(p, { v: 380, duration: 1.6, ease: explodeEase, onUpdate: () => (el.textContent = "+" + String(Math.round(p.v)).padStart(3, "0") + " PX") }, at);

// Bars (BP.barsGrow): height + y from the baseline, expo.out 0.7 s, 0.06 s apart
// Camera (BP.camera): move a stage wrapper, never the clip; power2.inOut 1.2–2.0 s
tl.to("#stage", { x: -320, y: 60, scale: 1.35, duration: 1.6, ease: "power2.inOut" }, at);
// Metadata type-on (BP.typeOn): 30–40 characters per second, no cursor
```

## Timing

| Beat | Duration | Ease | Source |
|---|---|---|---|
| Metadata type-on | 30–40 chars/s, from 0.1 s | none | ours |
| Construct (draw-on), per layer bottom → top | 0.6 s each, layers 0.25 s apart, faces 0.01 s apart | power2.inOut | ours |
| Rest hold before explode | 0.4–1.1 s | – | reference 1.1 s |
| Explode | 1.6 s | `explodeEase` | reference 1.6 s, `frames/ease_fit.txt` |
| Callouts in | start at 70% of the explode | 0.3 s leader, 0.2 s text | reference ~0.15 s fade at 70% |
| Guides draw | from 75% of the explode, 0.5 s | power2.out | ours |
| Exploded hold | ≥ 1.5 s, + 0.3 s per callout beyond 4 | – | reference 1.55 s |
| Callouts out | 0.15 s, all together, at collapse start | power1.in | reference |
| Collapse | 1.55 s | `explodeEase` | reference 1.57 s |
| Final rest hold | ≥ 1.3 s | – | reference 2.35 s |
| Counter | same start, duration and ease as the motion it measures | – | ours |
| Camera move | 1.2–2.0 s, only between beats | power2.inOut | ours |

Motion rules: one thing moves at a time per beat; a landed drawing is dead still; the base never moves; no bounce, no rotation of the object, no creeping zoom.

## Layout at 1920×1080

```
x: 0    96                 560  600              1320  1360              1824  1920
y:0  +------------------------------- paper ----------------------------------+
  64 |    +----------------------------- sheet (dots) ----------------------+    |
     |    | FIG_00N (vertical)                         [ NAME ] (vertical) |    |
     |    |   title zone x144-900, y120 (optional)                         |    |
     |    |   left labels  |   object / chart zone  |  right labels       |    |
     |    |   end x=560    |   x600-1320, y100-960  |  start x=1360       |    |
     |    |   readout key y~896                                            |    |
     |    |   +380 PX     y~948                          [ YEAR ] (vert.) |    |
1016 |    +----------------------------------------------------------------+    |
1080 +------------------------------------------------------------------------+
```

- Title-safe = the sheet minus 48 px. Metadata 18 px inside the sheet corners.
- Exploded object centred near x = 960; at rest it sits low (its base stays where it was), so the explode fills the space above (`frames/contact_4fps.png`).
- Data scenes: chart zone x 360–1560, values above bars, one hero number top-right.

## Prompting guide

Describe a scene to an agent as a figure, not a slide. Fill every line; leave nothing to "make it look nice".

```
FIGURE   FIG_00<n> · [ <SUBJECT NAME> ] · [ <YEAR> ] · <duration> s
IDEA     <the one thing the viewer understands by the end, one sentence>
OBJECT   <the physical or system object, as layers bottom → top>
LAYERS   <name> | <slab|tray|cells> | <fill face|tint|accent> | <w×d×h> | lift <px> | callout <L|R>
HERO     <the one accent part and why it matters>
DATA     <counter or bars: values, unit, source>   (or "none")
BEATS    <t> <construct|explode|callouts|hold|collapse|camera|counter> <what>
AVOID    <anything off-style for this scene>
```

**Worked example 1: exploded system**

```
FIGURE   FIG_002 · [ TRACED LLM CALL ] · [ 2026 ] · 9 s
IDEA     A single model call is four layers, and tracing sits underneath all of them.
OBJECT   a request module seen in isometric, opened up
LAYERS   TRACE LOG    | tray  | face   | 420×300×14 | lift 0   | callout L
         PROMPT       | slab  | tint   | 380×260×10 | lift 110 | callout L
         MODEL        | slab  | accent | 140×110×26 | lift 110 | callout R   (sits on PROMPT)
         TOOL CALLS   | cells | tint   | 6×4 grid   | lift 230 | callout L
         RESPONSE     | slab  | face   | 420×300×40 | lift 380 | callout R
HERO     MODEL: the part the trace explains
DATA     counter "SPANS" 0 → 12, same timing as the explode
BEATS    0.2 construct bottom → top · 2.0 explode 1.6 s + counter · 3.1 callouts · 3.6–5.8 hold · 5.8 collapse · 7.4–9 hold
AVOID    arrows between layers, any second accent, sideways explode
```

**Worked example 2: dataviz**

```
FIGURE   FIG_003 · [ COST PER DAY ] · [ 2026 ] · 7 s
IDEA     One day's spend was three times the others.
OBJECT   bar chart on the sheet, no object
LAYERS   none
HERO     Thursday's bar (accent); all others tint
DATA     MON 120 · TUE 210 · WED 160 · THU 330 · FRI 190 (USD, from billing export); hero number "0330" top-right, key "THU · USD"
BEATS    0.2 axis draws on 0.5 s · 0.6 bars grow 0.06 s apart · 1.2 values fade in · 1.4 hero counter 0 → 330, 1.2 s power2.out · 2.6 camera push 1.25× toward THU, 1.6 s · 4.2–7 hold
AVOID    legends, pie charts, colours outside the palette, gridlines heavier than 1 px
```

## Look checklist

- [ ] Paper outside, dotted sheet inside, four corner ticks, three vertical metadata labels.
- [ ] One blue does every line and label; fills are face/tint/accent only; exactly one accent part (plus at most one signal red).
- [ ] Every text element is Departure Mono, uppercase, at a multiple of 11 px; reading text ≥ 33 px.
- [ ] Exploded layers move straight up, base fixed; callouts ride with their layer and point at a visible face.
- [ ] Guides dashed and soft, only while exploded; no gradients, shadows or blur anywhere.
- [ ] Motion follows the timing table; holds are still.

## Do not copy

This style is inspired by Dan Hollick's *Making Software*, not a copy of it.

- Draw our own subjects. Never trace, recreate or reuse his drawings, illustrations, figure compositions, article text, page layouts, logos, the "Making Software" wordmark or his figure titles.
- Describe the look in our words (this file); keep his frames and screenshots in `evidence/style/` only, never in the skill, a scene or a render.
- Fonts: only free-licensed files bundled here (Departure Mono, OFL). The site's serif (ABC Arizona) is commercial and stays out.
- Our own additions (corner ticks, dimension lines, counters, signal red, 12 px grid) keep the result distinct.

## Evidence

Every measured value above cites a file under `/Users/kevinpruett/work/.fleet/projects/ai-obs-explainer-video/evidence/style/`; `NOTES.md` there lists the measurements, the timing track and the site captures.
