# Quackshot 3D — status

Plan: [`QUACKSHOT-3D.md`](QUACKSHOT-3D.md). Updated 2026-11-18.

## Where it stands

- **Milestone 0 (the ducks) — SIGNED OFF 2026-11-18** ("looks good, proceed"). Sean didn't name a variant, so the
  recommended **A · Classic** is the one in use; say so if B or C was wanted (it's one parameter: `variant`).
  The target concept was accepted with it.
- **Milestone 1 (greybox that plays the real game) — DONE**, shown to Sean ("Yes start it").
- **Milestone 2 (look-dev) — signed off** ("Continue", 2026-11-18).
- **How to play intro — DONE 2026-11-18** (all five 3D games; `docs/plans/GAME-INTROS-3D.md`). Quackshot's: `public/games/quackshot/intro.js`.
- **Milestone 3 (set pieces) — DONE.** Next: M4 (director polish, HUD, doubles via the server, swap-in as `quackshot.html`).

## Milestone 3 — set pieces (DONE 2026-11-18)

M2's look was taken as signed off on "Continue" (2026-11-18). Review: `node docs/plans/tools/quackshot-moments.cjs`
→ `docs/plans/quackshot-lookdev/m3/` — one strip of 8 frames per moment across its window (fixed-step, seeded) and
`moments.mp4` (every moment in real time).

| Moment | What happens (all inside the server's window) |
|---|---|
| Parade +1 | the nearest parade duck flips back with a squash-and-stretch pop and a squeak puff, a "+1" (or "+1 ×2") floats off it — big enough to read from the master — and it springs up again with an overshoot further round. The camera stays on the master. |
| Outer bull +2 | the dart hits the boss; the enamel tin duck slams flat on its hinge and bounces; gold sparks; the bull shot; then **a duck in the player's colour flies off the boss to their prize shelf** (prize camera follows), bounces once and joins the shelf, which hops; the station holds under the card. The shelf only counts the duck once it has landed. |
| Double bull +3 | both tin ducks fall, every bulb on the board strobes, a bigger gold shower, a flash; the duck flies with a gold sparkle trail. |
| Ring of Fire −2 | the ring ignites as a wave from where the dart went in, both ways round; embers; a real flickering fire light; the board's bulbs dip; it dies back to pilot lights after ~1.7 s. |
| Splash −1 | water jets fire from the two nearest rim nozzles onto the dart; spray and mist; the splash curtain hits the lens (backdrop blur through a drop mask). |
| Miss −1 | the dart comes down in **the pool** (new: a striped tin trough of water at the target's foot with ducks bobbing in it, the bg photo's pond), a plume and ripples, the pool shot. |
| Round announce | a crane up from the master over the awning to the fair and the dusk sky, and back down (round 6: FINALE, fireworks start). |
| Intermission | the camera finds the next station; its ticket is stamped ADMITTED with a punch; the station lamp comes up. |
| Winner | the station lights gold, its shelf ducks bounce, the marquee lights the winner's column, confetti and fireworks; GRAND PRIZE + name (DOM). |
| Draw | each contender's station lit, fireworks, DEAD HEAT + names (DOM) over the target so the marquee's tied scores stay in view. |

Also: every stuck dart gets a glow ring at its bed in the thrower's colour (M2 critique 1: where each dart sits now
reads from the master).

Tests: `quackshot.spec.cjs` now also checks that **a bull's duck lands on its shelf before the server leaves the
bullseye phase** (4.41 s), and "settled" includes the prize flight.

Fixed while reviewing: the fire light blew the board out; the gold burst was white-hot; the splash's round drops and
the first lens overlay read as soap bubbles (water on a lens refracts: it's now a blur, not drawn outlines); the prize
arc climbed over the marquee; the ADMITTED stamp covered the name; DEAD HEAT covered the marquee.

New choices (flagged): the pool + floating ducks; the miss lands in the pool (still the `miss` bed for the truth check);
the parade keeps the master (no cut) so every dart stays visible; the won duck is a rubber duck in the player's colour
(the shelf's own duck), launched off the tin duck it knocked.

## Milestone 2 — look-dev (signed off)

Built 2026-11-18. Regenerate every deliverable with **one command**: `node docs/plans/tools/quackshot-look.cjs`
(≈5 min, seeded, fake clock) → `docs/plans/quackshot-lookdev/m2/`:
`1-master-round1`, `2-master-round6`, `3-parade-bed`, `4-outer-bull`, `5-double-bull`, `6-ring-of-fire`, `7-splash`,
`8-winner` (+ `-card` frames for the four overlay moments), `contact-sheet.jpg`, `crops/` (1:1, unscaled: parade
ducks, tin ducks, target face, marquee, stations, hanging ducks, Ring of Fire, winner station, fairground + fireworks),
`quackshot-lookdev-visit.mp4` (20 s at 60 fps: a parade +1, an outer bull, a splash, then UP NEXT) + `visit-filmstrip.jpg`.

**Performance — real Chrome 157 on the M1** (Claude in Chrome on Sean's browser, `localhost:4000`, 6 players, long
names): **60 fps (vsync-capped) at 2188×965 = 2.11 Mpx (1080p's pixel count, `?dpr=1.9`)** — master p95 17.3 ms,
round-6 fireworks p95 16.8 ms, Ring of Fire close-up p95 17.3 ms, worst frame 17.8 ms. At the window's natural
size (1728×762, dpr 1.5) also 60. `?quality=low` not measured separately (full quality already holds 60).

What changed (all in `public/games/quackshot/`):
- `fair.js` (new): blue-hour sky shader (cloud streaks lit by the fair, early stars), Ferris wheel (left, turning,
  bulbs on rim and spokes, level gondolas), carousel (right, striped canopy, bulb band, lit from inside), distant
  booths, light poles, bunting, far bokeh lights. Round 6: everything turns faster.
- `fx.js` (new): gold shower (bulls), water streaks + mist (splash), squeak puff (parade), confetti (winner),
  fireworks (round 6 + winner, bursting in the open sky either side of the stall).
- `stall.js`: sunburst back panel with gilt stars; barber-pole pillars with bulb strips; striped awning + scalloped
  valance with a big bulb per scallop; bulb strings; 26 hanging ducks (outboard ones from the awning, the ones beside
  the board from a brass rail under the marquee so no string crosses the scores); lacquered counter with gilt edge
  and candy-striped front; chrome stools; ADMIT ONE tickets; prize shelves; a real light on the thrower's station;
  **the marquee is a bulb matrix** (scores as lit bulbs, red when negative; painted names; ×2 FINAL as a glowing sign).
- `target.js`: raised 3D gilt wire spider, enamel orange-peel, glass number-ring bulbs with halos, parade LOD1 only
  when the lens is close (else LOD2).
- Lighting: cool sky key from behind, warm awning spot on the target, warm fill on the counter, two warm lights on
  the hanging ducks, the station light, the carousel's interior light; image-based light from a blue-hour dome with
  bulb strings so the vinyl and brass catch them. Master gets a touch of depth of field (aperture 0.09).

Bugs found and fixed on the way: **instanced ducks were frustum-culled** (three computes an InstancedMesh's bounding
sphere once, with every instance at the origin) — the winner shot showed an empty prize shelf; all instanced ducks are
now unculled. A late Splash card could overwrite GRAND PRIZE. A ticket easel poked through every ticket. Hanging
ducks and their strings covered the marquee. Changing the light count at runtime would recompile every shader (the
station light is now made up front).

### Critique (written before sending, plan §8)

Works: the bg photo's world is there — bulbs everywhere, the sunburst framing the target, ducks hanging either side,
the fair turning beyond the barber poles. The Ring of Fire frame is the strongest still. The marquee's bulb digits read
from across the room, red for negatives. Round 6 visibly escalates (gold chase, fireworks, the fair speeds up). The
ducks hold at 1:1 (eyes, bills, vinyl gloss) and the tin ducks read as gilt pressed tin.

Weak, and what I'd do in M3/M6 unless Sean says otherwise:
1. **Darts are small at master** (~30 px long): readable as dart + flight colour, but "where each dart sits" from
   across a bar leans on the HUD's dart results. Option: thicker flights / a glow ring at each dart's bed in master.
2. **The bull is small at master** (the tin ducks are ~40 px); the bull shot carries the moment.
3. **The splash and gold shower are first-pass particles** — the water jets / splash curtain / ballistic duck-to-shelf
   flight are the M3 set pieces.
4. **Parade ducks run a little pale** under the warm key on the target; hanging ducks a little orange in shade.
5. **The fairground is low-detail** if seen sharp (booth boxes); it's meant to sit in bokeh — kept quiet.
6. The HUD columns are heavy cream tickets (~1/9 of the frame) — readable on a phone thumbnail, but big.
7. Not yet reviewed as stills: the round-announce crane and the draw (they play; see the M1 renders).

### Choices made in M2 (flagged per §1 rule 8)

Sunburst back panel with gilt stars · barber-pole pillars · scalloped valance with big bulbs · hanging ducks on a rail
beside the board · Ferris wheel left / carousel right · fireworks either side of the stall (the awning hides the sky
above it) · ×2 FINAL as a painted glowing sign on the marquee · the game uses only duck LOD1/LOD2 (LOD0 = look-dev
only, so the 2 s build never happens in the game; LOD1+LOD2 build in ≈0.35 s).

## Milestone 1

How to see it:
- On the real TV: `viewer?quackshot=3d` (a preview switch until the M4 swap-in; `?quackshot=classic` also works).
- Simulated: `games/quackshot-3d.html?demo=1&players=6&long=1` — `__quackshotDemo.force('parade'|'bull'|'dbull'|
  'fire'|'splash'|'miss'|'dart3'|'round'|'final'|'winner'|'draw')`; `?shot=master` holds one camera.
- Review renders: `node docs/plans/tools/quackshot-greybox.cjs` → `docs/plans/quackshot-lookdev/m1/` (master at
  2/4/6 players, a still per moment, a fixed-step clip of the demo + filmstrip).

What's built (`public/games/quackshot/`): `common.js` (scale, **zone → bed mapping** from what the server scored,
seeded dart spread, labels), `target.js` (exact beds, number ring + bulbs, parade of the signed-off duck riding the
inner singles, Ring of Fire on Limbo's `Flames`, bull boss with the tin ducks, bed flashes), `stall.js` (counter,
stations with stool / ADMIT ONE ticket / lamp / prize shelf, marquee scoreboard, awning, hanging ducks),
`darts.js` (from the active station into the exact bed), `director.js` (**every shot framed by projecting real
points into the frame**, clear of the HUD bands and the title safe zone), `hud.js`, `game.js` (StateQueue +
reconcile), `demo.js` (server rules and windows), `main.js`. `quackshot-classic.html` is the exact 2D copy.

Tests: `tests/quackshot-bed.test.cjs` (every sector form through the real rules → drawn in a bed of the scored zone,
on its number; bot throws with no number stable across reloads) and `tests/browser/quackshot.spec.cjs` (through the
real server: nothing lies after every dart — DOM scores incl. negatives, duck counts, shelves, marquee, round, active
station, dart dots, each dart's bed; every zone; the dart-3 inner single landing and scoring before its intermission
AND before its round announce; six rounds incl. ×2; winner and draw names as DOM text; debug previews don't corrupt
anything; forged messages ignored). **Measured: worst dart reaction 83.7 ms** after its state (budget 100 ms).

Found and fixed on the way: a debug preview pulled the visit's darts and nothing put them back (the board showed
0 darts for 1 thrown) — reconcile now restores missing darts from the visit's own record. Note for anyone testing
previews: `DEBUG_SHOW_SCREEN` parks the game on that phase; `screen: 'clear'` returns to playing (RESET_PHASE is
only the mock board's takeout).

Layout decisions (greybox, flagged per §1 rule 8): the counter sits 5.4 m from the target and stations are spaced
≤1.9 m so six fit the master with the target ~40% of frame height; the thrower card moved to the **top right** (a
centred card covered the marquee); title cards live in an upper safe zone and close shots place their subject below
it. Known greybox gaps for M2: hanging/parade ducks are under-lit (brown), back wall and fairground are placeholders,
a miss sticks in the surround (the splash into the pool is an M3 set piece), master readability vs a phone thumbnail
not yet judged.

## Deliverables (`docs/plans/quackshot-lookdev/m0/`)

Regenerate everything with **one command**: `node docs/plans/tools/quackshot-lookdev.cjs` (≈1 min; starts its own
server; renders into `m0/stills/` then builds the sheets with `docs/plans/tools/quackshot-sheets.py`).
Pass a second argument to render only stills whose name contains it (no sheets), e.g. `… /tmp/x duck-B-`.

| File | What |
|---|---|
| `contact.jpg` | the headline sheet: every variant in studio + blue hour + silhouette, tin ducks, target concept |
| `turnaround-{A,B,C}.jpg` | front / side / 3/4 / back / top × studio, blue hour, solid silhouette |
| `lineup.jpg` | the three variants side by side at the same scale (studio side, 3/4, silhouette) |
| `closeup-1to1-{A,B,C}.png` | the head at true 1:1 pixels (bed-shot distance), studio \| blue hour |
| `master-distance-1to1.png` | a 0.25 m parade duck from 12 m (~40 px) at 1:1 and 4× blow-up, LOD1 and LOD2 |
| `overlay-{A,B,C}.jpg` | the side silhouette at 50% over the bg photo's hanging duck and a real duck photo |
| `silhouettes.jpg`, `reference.jpg` | silhouettes side/3/4/front; the reference board |
| `tin.jpg` | tin prize ducks (enamel + golden) studio, 3/4, blue hour, silhouette |
| `target-concept.jpg` | rough target: master at rest, bull + parade close-up, Ring of Fire roaring |

Reference images: `docs/plans/quackshot-lookdev/reference/` — crops of the 2D page's `bg.jpg`, the 2D duck icon, and
real rubber-duck photos from Wikimedia Commons (CC0 / public domain / CC BY / CC BY-SA; reference only, not shipped).

Look-dev page by hand: `games/quackshot-3d.html?lookdev=duck&variant=B&view=34&light=blue`
(`lookdev` duck|lineup|tin|target · `view` front|side|34|back|top|head|far|bull · `light` studio|blue|sil).

## Code

- `public/games/quackshot/duck.js` — **the rubber duck**: one SDF sculpt (`derby/sdf.js`: ellipsoids + round cones,
  smooth-min, surface nets; never assembled primitives) parametrised as variants `A`/`B`/`C`; bill/eyes/catch-light
  painted analytically in the shader from duck-space position, so they're crisp at every LOD and the body tints per
  instance (`rubberDuckInstances` + `setColorAt`). Three LODs. **The tin prize duck** (hard surface): an extruded
  pressed-tin profile with a rolled bevel on a brass hinge, gilt + enamel from a canvas (`tinDuck({finish})`).
- `public/games/quackshot/lookdev.js`, `public/games/quackshot-3d.html` — the M0 look-dev page (becomes the game shell).
- `docs/plans/tools/quackshot-lookdev.cjs`, `docs/plans/tools/quackshot-sheets.py` — the one-command deliverables.

Mesh sizes (tris): LOD0 ~150k (close-ups only), LOD1 ~33k (parade/shelves), LOD2 ~7k (hanging/far).
**Build cost: LOD0 ≈ 2.0 s, LOD1 0.3 s, LOD2 0.05 s** in Chrome on the M1. LOD0 at game load is too slow → M2 to-do:
narrow-band evaluation or bake the chosen variant to a binary asset, and only ever build the signed-off variant.

## Hero critique (plan §8 checklist), written before sending

Iterations made from the critique before this went out: eyes missing (eye-point march bug) → fixed; bill read as
two thin paddles → thicker, chunkier; front view was a snowman (head as wide as body) → body widened to ~1.5× head;
mustard colour → saturated yellow, less sheen/clearcoat haze; lumpy rump and a ridge from cheek to bill → wider
blends; a dark ring round the base (shadow normal-bias at the wrong scale) → fixed in look-dev; overlay showed bills
too small and tails too high/pointed vs the photos → bills ~1.3× bigger, tails lower and rounder.

- **Silhouette** — all three read as a rubber duck in solid black from the side and 3/4: head forward of the body,
  tail flicked up, wide flat bill with a visible mouth line. From the front B reads closest to two stacked balls.
- **Proportion** (overlays) — **A** matches the real duck photo's head size and position closely. **B**'s head is
  ~15% bigger than the reference (that's the variant's point — cuter). **C**'s body is ~10% longer and lower with a
  smaller head and a sharper tail (the vintage look). Against the bg photo's hanging duck all three have a slightly
  higher tail; that duck is seen from below, so it's a soft comparison.
- **No primitive tells** — no visible spheres or capsules; head-to-body is a blended crease, bill-to-head blended,
  lips separated by a real groove, nostril dents, embossed wings. Residual: on A the cheek blend leaves a soft
  plane from eye to bill root at 3/4 (reads as the bill root, acceptable); the wing/rump gloss shows gentle moulding.
- **Material** — glossy vinyl with soft softbox highlights and warm shadow; the painted eyes are glossier than the
  vinyl and pick up bulb reflections in blue hour. Studio yellow runs slightly golden next to the lemon photos.
- **Close-up and distance** — holds at 1:1 on the head; at master distance (~40 px) both LOD1 and LOD2 still read
  (eye and bill visible), so LOD2 is fine for anything that small.
- **Tin ducks** — read as gilt pressed tin with a rolled edge; the enamel one is cream with red bill and gilt
  scallops, the golden one all gilt. Profile is a generic gallery duck (original, not traced from anything).

## Choices made in M0 that the plan didn't settle (flagged per §1 rule 8)

1. **Parade position**: the plan's risk note says the rail sits on the inner-single ring's *inner* edge, but that
   edge is the bull (0.19 m radius at this scale) — no room for 20 ducks. The concept puts the rail near the ring's
   **outer** edge, just inside the treble, leaving most of each inner-single bed clear.
2. **Parade ducks ride gondola-style**: always upright, profile to the camera, facing the direction of travel
   (clockwise), like Ferris-wheel cars — not standing radially on the rail (which would turn the bottom ones over).
3. **The flame ring idles as pilot lights** and only roars up on a treble.
4. **Bull**: the two tin ducks (enamel + golden) stand back to back on a brass ledge projecting from the boss; at a
   readable size (0.38 m) the pair is wider than the bull, so they overlap the inner singles either side (6/11 side).
   The dart must stay the front-most object (as the plan's §11 already demands).
5. **Board paint**: inner singles cream/red (the counter's stripes), outer singles + doubles alternating sea blues
   with painted waves, treble scorched brass, gilt numbers on a navy ring with bulbs. Beds alternate so they all read.

## Next

- **M4 game flow + swap-in:** director shot logic polish, HUD + marquee checks, doubles naming through the real server,
  help, debug previews, 6 players with long names, then swap in as `games/quackshot.html` (classic stays at
  `?quackshot=classic`; remove the `?quackshot=3d` preview switch). Then M5 sound, M6 polish/perf/CHANGELOG/asset register.
