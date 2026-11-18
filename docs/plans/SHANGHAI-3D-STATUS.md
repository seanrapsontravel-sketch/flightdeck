# Shanghai 3D — status

Plan: [`SHANGHAI-3D.md`](SHANGHAI-3D.md). Updated 2026-11-18.

## Where it stands

- **Milestone 0 — SIGNED OFF 2026-11-18.** Sean's answers: **pagoda A · Jiangnan sweep**; **yes, add the pub
  "Shanghai" instant-win rule to the engine** (built in M1 so the greybox plays the true game); **keep all four
  flagged choices** (offset pagoda on a terrace, round-number plaques + lamp outline, the board colours, the
  in-frame sunset).
- **Milestone 1 (greybox that plays the real game) — DONE 2026-11-18**, shown to Sean.
- **Milestones 2 (look-dev) and 3 (set pieces) — DONE 2026-11-18.** Sean asked for both in one go ("go with 2 and 3
  milestone. dont stop and ask"), so the M2 sign-off stop was skipped at his request; the M2 deliverables are below
  for him to judge the look after the fact. **Next: M4** (game flow polish, doubles through the real server, help,
  previews, 6 players with long names, swap in as `shanghai.html`), then M5 sound, M6 polish.

## Milestone 2 — look-dev (DONE 2026-11-18; sign-off skipped at Sean's request)

One command: `node docs/plans/tools/shanghai-look.cjs` (seeded, fake clock, ≈5 min with the clip) →
`docs/plans/shanghai-lookdev/m2/`: `1-master-round1`, `2-master-round4`, `3-master-round8`, `4-scoring-dart`,
`5-treble`, `6-lanterns-rising`, `7-round-crane`, `8-winner` (+ `8b-winner-master`), `contact-sheet.jpg`, `crops/`
(1:1, unscaled: the board at sunset and at night, the pagoda at sunset and at night, both rows of stations with their
lantern strings, the scoring dart's bed, the treble's firecrackers, the winner's station, the winner's lanterns and
fireworks), `shanghai-lookdev-visit.mp4` (20 s at 60 fps: a single, a treble, another number, UP NEXT) and
`visit-filmstrip.jpg`.

**Performance: real Chrome on the M1** (Claude in Chrome, `localhost:4000`, 6 players, long names, `?dpr=1.9` =
**2188×1050 = 2.3 Mpx**, more than 1080p). All states are vsync-capped at 60:

| State | fps | p95 |
|---|---|---|
| Master, round 1 | 59.9 | 17.5 ms |
| Master, round 4 | 59.9 | 17.6 ms |
| Master, round 8, every lantern string full | 59.1 | 17.6 ms |
| A live treble (firecrackers, lanterns in flight) | 60.1 | 17.6 ms |
| **The winner on the master** (every lantern released, fireworks) | 60.1 | 17.1 ms |

The first measurement failed: **49 fps, p95 33 ms**, at about 730 k triangles and 280 draw calls a frame. The lantern
flock drew all 448 instances, empty ones included, at full lathe detail (about 344 k triangles), and the pagoda was
rendered into a shadow map it can never show in. Fixes:
- an 8-sided, 10-ring flock lantern;
- `count` set to only the instances in use (handed out lowest first);
- the pagoda doesn't cast shadows (it stands outside the key light's shadow box);
- the pagoda uses a far LOD (half the tile cross-section, fewer rows, no tile-end caps, thinner balusters):
  **226 k triangles** against 574 k for the hero.

The first seconds after load janked while shaders compiled on first sight, so the scene is now precompiled at boot.
The sky's environment bake measures 8–16 ms per round change.

What changed:
- **Lantern strings, one sky lantern per point:** each station has a lantern tree, four tethered strings beside the
  scroll that fill from the top in the player's colour (CAP 32; past the cap the strings glow brighter, and the DOM
  is the number). A first version gathered each player's lanterns in a cloud above the station. At round 4 the
  clouds were walls of lanterns burying the gong, the gatehouse and the pagoda's lower tiers, which are the round
  tracker. In the master, any cloud above the right-hand stations overlaps the pagoda, so the lanterns now hang
  below its horizon.
- **The courtyard:** red palace lanterns under the gatehouse corners and along the wall; two plum trees in blossom
  beyond the outer stations; distant temple halls behind the wall on the left (the pagoda has the right); the bg
  photo's dark foreground eave across the top left; a lantern spill light on the gong and the board, made at load and
  rising with the night (from dusk on, the gong had gone dark).
- **Round 8 escalation:** full night and stars, every tier lit and outlined, the spire lit gold, palace lanterns,
  blossom and station lanterns at their brightest, and a slow firework show over the pagoda.
- The tier for each new round flickers on and then ramps up, rather than snapping on.

Critique, fixed before this report: the gong flash blew out to a white disc and the spire glow read as a second moon
(both toned down); "+n" was huge in the close-up (now 0.9 m); a plum trunk cut across the station shots (trees moved
out); the foreground eave was out of frame (moved in); the treble's firecrackers barely read on the master (bigger
flashes, more crackers); and the fascia grid went fractional at the far LOD with an odd tile count, which drew past
its vertex buffer (WebGL "vertex buffer is not big enough").

## Milestone 3 — set pieces (DONE 2026-11-18)

One command: `node docs/plans/tools/shanghai-moments.cjs` (≈2 min) → `docs/plans/shanghai-lookdev/m3/`, one 8-frame
strip per moment across its window, and `moments.mp4` (every moment in real time, 30 fps).

| Moment | What happens |
|---|---|
| A scoring dart | The gong rings: it swings and glows, harder for a double and a treble. There is a camera kick, the bed flashes and gold sparks fly. "+n" floats off the bed, and **n lanterns rise from the wedge** in an arc to the thrower's lantern strings (`lanterns-land` in the log). The bed shot then eases back to the master. |
| A treble on the number | As above, plus **firecrackers popping the length of both low walls** (flashes, sparks, red paper, smoke) and a brighter gong. |
| A dart that scores nothing | The dart sticks truthfully, with a puff of dust and a small kick; the HUD shows "7 · 0". |
| The round crane | The camera cranes from the master up the pagoda. At the top, tier *n* flickers on and ramps up, with its plaque and eave lamps; the sky steps darker; the live wedge moves to *n*. Then it comes back down. Round 8 lights the spire. |
| Intermission | The camera finds the next player's station; their scroll **unrolls** from its rod; their step lights; UP NEXT · AIM FOR *n*. |
| **Shanghai!** | The third dart lands and scores. A SHANGHAI! card, crackers along the gatehouse frieze, the gong at full and five shells over the pagoda. The winner follows 0.9 s later (server timing). |
| The champion | **Every lantern in the courtyard lets go and rises** into the night. Fireworks over the pagoda, crackers along both walls, the winner's scroll turns gold, and CHAMPION (or SHANGHAI!) with the name as DOM text. |
| A tie | Each contender's station is lit, a gentle firework show, and TIED with the names as DOM text. |

Fixed while reviewing: TIED / CHAMPION showed stale totals under the title for a second (the HUD only reconciled once
the end event finished; the end events now set the scores at once).

New check: the browser test's nothing-lies list now includes **each player's lantern strings = min(32, score)** after
every dart (the lanterns must have landed for the view to count as settled).

## Milestone 1 — the greybox plays the real game (DONE 2026-11-18)

Play it: `viewer.html?shanghai=3d` through the real server, or `games/shanghai-3d.html?demo=1` (`players=2..6`,
`long=1`, `doubles=1`, `seed=n`, `speed=n`; `window.__shanghaiDemo.force('single'|'double'|'treble'|'other'|'bull'|
'miss'|'dart3'|'round'|'final'|'shanghai'|'winner'|'draw')`). The classic 2D page is `viewer.html?shanghai=classic`.
Review renders: `node docs/plans/tools/shanghai-greybox.cjs` → `docs/plans/shanghai-lookdev/m1/` (the master at 2 / 4 / 6
players with long names, a scoring dart, the dart-3 UP NEXT, the round crane, round 8 at night, a Shanghai, the
champion, a tie, and a contact sheet).

**The Shanghai rule (Sean: "yes")** is in the engine (`src/engines/shanghai.js`): a single, double and treble of the
target in one visit sets `gameData.shanghai`, marks `lastThrow.shanghai`, keeps `playing` for 900 ms (the dart lands and
scores first) and then `shanghai_resolve_match` crowns that thrower with `reason: 'shanghai'`, whatever the scores.
Anything short of the full set plays on. The 2D page (live and classic) says "Shanghai!" and its help card lists the
rule. Unit test `tests/shanghai-rules.test.cjs` (any order, near-misses, a later round, the normal 8-round finish).

What was built (`public/games/shanghai/`):
- `beds.js` — where a dart sits, from the server's number / multiplier / sector (bull's multiplier is always 1, so
  the inner bull only from `Bull` / `50`; a sectorless single by a seeded, area-weighted pick). Pure; unit-tested in
  `tests/shanghai-bed.test.cjs` against every form through the real engine.
- `courtyard.js` — paving, steps, the moon gate, pagoda A on its terrace, braziers, and one station per player (lacquer
  post, a lantern in their colour, a scroll with name, total and the eight round cells, a step that lights on their
  turn), three either side of the board.
- `darts.js` (exact beds, glow ring in the thrower's colour), `director.js` (master / bed / station / crane / winner),
  `hud.js` (scroll-style: score columns with the eight round cells, ROUND n / 8 + AIM FOR n, the thrower card with
  each dart's result, titles, help, winner clip), `game.js` (state → events, reconcile, `truth()`), `demo.js`
  (the server's rules and windows, the Shanghai rule included), `intro.js` (How to play: 8 rounds, one number each,
  S / D / T = ×1 / ×2 / ×3, Shanghai! wins on the spot), `main.js`.
- Round change: tier n lights, the live wedge moves to n and the sky steps toward night (one environment bake per
  round: **10–16 ms**, at most one dropped frame).

The master shot: an eye-height lens (2.2 m) that tilts up; for each distance it solves pitch and yaw so every subject
point (the gate and gong, each station, the pagoda's eight tiers and most of its spire) is centred in the window
between the HUD bands, and takes the nearest distance that fits. A plain fixed-direction fit lifted the lens to 11 m
and backed it off to 43 m (a tiny board), then wandered off the gate with two players. The board is now large and
central at 2, 4 and 6 players. The thrower card moved to the top left: at the top right it covered the pagoda's
upper tiers, i.e. the round tracker.

Tests (`tests/browser/shanghai.spec.cjs`, through the real server and control):
1. **A whole game**, "nothing lies" after every dart: every DOM total and round cell, every station scroll, the round
   pill and AIM FOR, the lit tiers (= the round), the live wedge (= the target), the active station, the dart dots
   and each dart in the bed the server scored. It covers inner and outer singles, doubles, trebles, other numbers,
   both bulls and misses. Every visit's dart 3 arrives with its takeover (intermission and round announce): it lands
   and scores before the title. Eight rounds, the champion's name as DOM text, dart reaction **worst 67 ms over
   47 darts** (limit 100), and forged / off-origin state ignored.
2. **A Shanghai wins outright**: the third dart lands before "SHANGHAI!", and the winner's name is DOM text.
3. **Debug previews** (next, round, winner, draw, then clear) leave the truth intact; an even game ends **TIED** with
   both names.

New choices (flagged): stations at z = 5.6 (nearer the gate, 2.45 m apart) so six fit a big-board master; the thrower
card at the top left; a SHANGHAI! card on the third dart, then SHANGHAI! + the name as the winner title (CHAMPION for
a normal win, TIED for a draw).

## Milestone 0 — deliverables

One command regenerates everything (≈50 s, seeded, no animation clock):
`node docs/plans/tools/shanghai-lookdev.cjs` → `docs/plans/shanghai-lookdev/m0/`

| File | What it shows |
|---|---|
| `contact.jpg` | the headline frames on one sheet |
| `lineup.jpg` | A / B / C at the same scale: studio, silhouette, round-1 sunset, night with 4 tiers lit |
| `turnaround-{A,B,C}.jpg` | studio / sunset / night (round 3) / silhouette × front, corner-on, 3/4, the photo's low view, top |
| `closeup-1to1-{A,B,C}.png` | a tier-5 corner at 1:1, unscaled: studio, sunset, night lit (hook, bell, tile ends, frieze, plaque) |
| `master-distance-1to1.png` | the tower at master distance (110 m, 36° lens), 1:1, at round 1 and at night with 5 tiers lit |
| `overlay-{A,B,C}.jpg` | the bg photo beside our silhouette laid over it at 50% (aligned on finial + top-roof span) |
| `gate.jpg` | the moon-gate board: round 1 (live 20), round 8 night (live 8), 3/4, the live wedge close in both lights, the gong |
| `lantern.jpg` | the sky lantern: hero at night and at sunset, the six player colours, an instanced flock |
| `concept.jpg`, `concept-round{1,8}.jpg` | the rough courtyard concept at rounds 1, 4 and 8 (the sky clock) |
| `stills/` | every raw frame (1920×1080) |

References (reference only, never shipped; licences in `reference/CREDITS.md`): the bg photo, Suzhou North Temple
(Jiangnan), Liuhe (Hangzhou), Fogong (northern, + a corner bracket set), two Suzhou moon gates, two sky-lantern photos.

### What was built (`public/games/shanghai/`, page `public/games/shanghai-3d.html?lookdev=…`)

- `pagoda.js` — **the hero, procedural, no primitive roofs.** Every roof is a lofted octagonal surface: concave down
  the slope, the eave line sweeping up toward the corners (lift ∝ |u|^q·v²) and pushing out in plan. Real half-round
  tile rolls run down every facet (they scallop the eave silhouette), with round tile ends, a red fascia, rafters
  under the eave, hip ridges that run on past the eave into upturned hooks, a bronze bell under each hook, a bracket
  frieze (evenly spaced units under a gilt-edged beam), corner columns, a lintel, arched doors / latticed windows,
  a balcony with a red railing on every tier, a stone plinth and steps, and a spire (inverted bowl, seven rings,
  canopy, chains to the top hooks, gold gourd). **Round tracker:** `setLit(n, k)` lights tier n's doors, its plaque
  and a ring of lamps along its fascia. Each tier's plaque carries its round number.
- `gate.js` — the moon gate. The beds are at the exact regulation radii (`kit/darts` RADII × K, double ring at 2.0 m).
  Singles are black and cinnabar lacquer, the rings red and jade, with a raised gilt wire spider, gilt numerals and a
  carved stone surround. **The live wedge:** `setTarget(n)` paints only number n's singles, treble, double and numeral
  into the emissive map, as gold leaf (the other numerals keep a faint glow so the ring reads at night). The red
  courtyard wall has lacquer pilasters and tiled copings; a raised gatehouse carries its own roof, a frieze of gilt
  studs and the **bronze nipple gong** on cords from a lacquered beam.
- `lanterns.js` — the Kongming sky lantern: a paper bell in the player's colour with a cream crown, hot just above the
  flame, a bamboo hoop, cross wires, the fuel cell and a halo. `LanternFlock` is the instanced version (one draw for the
  paper, one for halos, `frustumCulled = false`).
- `sky.js` — the sky clock: one dome, round 1 late sunset → round 8 full night with stars and a moon. It drives the
  key, fill, rim and haze from the table in `common.js` and bakes the image-based light only when the round changes.
- `common.js` (scale, palette, materials, the round → sky table, a seeded rng, a geometry builder, a variable-radius
  sweep), `lookdev.js` (subjects × lights, framing from projected bounds).

### The three variants (one parameter: `variant`)

| | A · Jiangnan sweep (recommended) | B · Northern | C · Slender |
|---|---|---|---|
| Model | the bg photo / Suzhou | Song–Liao (Fogong) | a slimmer, taller tower |
| Eaves | slim, deep concave sweep, horn hooks rising to near-vertical | broad, flatter, heavy; corners only gently raised | Jiangnan hooks, a little calmer, tighter plan |
| Plan | 4.8 → 3.5 m apothem | 5.6 → 4.05 m | 3.9 → 2.45 m |
| Pagoda triangles | 574 k | 663 k | 464 k |

## Written critique (done before sending; what it found was fixed)

Against the hero checklist (plan §8):

- **Silhouette — passes.** In solid black all three read as a pagoda at once. The eaves sweep up at the corners (not
  cones), the tiers step in, the spire reads. A is the most distinctive and the closest to the photo.
- **Proportion — A passes the overlay.** The first overlay showed A's spire ~35% short against its top roof, and its
  taper too fast. Fixed: a taller spire with an inverted bowl and wider rings, a steeper top roof, a gentler taper;
  the low camera is now a long lens from 62 m, like the photo. The finial, top-roof pitch, taper and hook rhythm now
  sit on the photo within the eye's tolerance. B and C differ from it on purpose.
- **No primitive tells — passes, after fixes.** The first bracket band was a scatter of red and teal blocks ("Lego").
  It's now a frieze of identical units under a continuous beam. Other fixes: the tile ends hung like loose coins
  under drip "teeth" (now flush, teeth removed); fascia lamps looked like black polka dots (now dark-red studs by
  day, a lit outline at night); ridges looked like black plastic (now matte grey tile); B's ridge ends looked like
  cannon barrels (slimmer, turning up). No z-fighting between tiers. The plaque sat just in front of its gilt frame
  and was moved clear.
- **Material — mostly passes.** Lacquer red with a soft clearcoat, matte imperial-yellow plaster, dark tile with a
  little gloss, gold leaf on the finial, bracket caps and plaques. The low sun's clearcoat glare blew out the plaques
  and lintels; it's toned down, but the lintel still catches a bright band at sunset (it's a real sunlit surface).
- **Close-up and distance — passes.** At 1:1 the corner holds (tile rolls, frieze, bell, hook, lit outline). At
  master distance the tiers, plaques and the lit/unlit split read; unlit tiers at night are dim but readable as a
  silhouette (moonlight and the night horizon were lifted for this).
- **The gate:** the live wedge first read as pale paper; it's now gold leaf (flecks + sheen, deeper colour).
  Other fixes: the wall plaster had vertical streaks (now mottled); the gatehouse was a plain box (frieze, studs,
  pilasters); the gong looked like a vinyl record (now hammer dimples and lathe bands) and is bigger.
- **The lantern:** first a pink blob. It now has the crown, the foot glow and a visible flame. **A truth bug the
  review caught:** in the instanced flock the paper rendered white (only the halos were tinted), because three r160
  defines `USE_INSTANCING_COLOR` only in the vertex shader. The tint now keys on `USE_COLOR`, so every lantern
  carries its player's colour.
- **The concept:** the pagoda was hidden behind the gatehouse from the master camera (plan §11's risk, confirmed). It
  now stands **offset to the right on a 7 m stone terrace**, so the bottom tier (round 1) clears the wall. The side
  walls are lower, and the master camera is a little raised. The first layout also stood a station's scroll in front of
  the board; the stations now stand three either side. Round 1's sky first read lilac rather than sunset, because the
  sun was behind the camera: the visible sun and its warm haze now set in frame behind the pagoda, with a warm rim
  from that side.

Still open (not blocking the look question, carried into M1/M2):
1. **Triangles:** 460–660 k per pagoda. It needs a far LOD (fewer tile rolls, no balusters) before the M2 60 fps
   measurement.
2. The eave undersides are very dark; the rafters barely read. It needs fill or bounce in M2.
3. At night the gong goes dark; it needs a practical (brazier or lantern spill) in M2.
4. The courtyard wall is still a flat run of plaster; dressing (plum blossom, distant lions, the foreground eave)
   is M2.
5. In the master the pagoda's spire touches the top of frame; the M1 greybox sets the real master and HUD-safe zones.

## Decisions

From plan §9, as built: the Lantern Pagoda concept; no people or creatures; one lantern per point in the player's
colour; the sky darkening one step per round; bull vs outer bull from `sector`.

New choices (flagged for Sean):
- **The pagoda stands offset to the right on a stone terrace** behind the courtyard wall, not centred behind the gate.
- **Each tier has a round-number plaque** in Arabic numerals, and lit tiers get a lamp outline along the eaves (it
  reads from across a bar).
- **Live-wedge colours:** the rest of the board is black / cinnabar singles with red / jade rings. The live wedge is
  gold leaf.
- **The visible sunset is in frame behind the pagoda** while the key light stays on the courtyard (a cinematic cheat).

**Question for Sean (plan §9.5):** should the engine get the real pub "Shanghai" rule (a single, double and treble
of the target number in one visit wins outright)? It's a server rules change. Today the 3D page implies nothing
of the sort; with the rule, the view would gain a "SHANGHAI!" finale.

## Checks (2026-11-18)

- `npm test` 32/32 pass; `npm run check` clean. M0 adds only new files; no existing page or engine changed.
- M0: `npx playwright test` 13/13 pass (12.3 min).
- **M2 + M3 (2026-11-18): `npm test` 40/40, `npm run check` clean, `npx playwright test` 16/16 (17.1 min; the Shanghai spec now also checks the lantern strings), real-Chrome fps above; both review commands re-run on the final code with no console errors.**
- **M1 (2026-11-18): `npm test` 40/40 (incl. `shanghai-rules` + `shanghai-bed`), `npm run check` clean, `npx playwright test` 16/16 (16.8 min, incl. the three Shanghai tests).** Review renders: no console errors; sky bake 8–16 ms per round change.
- The look-dev command reports no console errors.
