# Shanghai 3D — plan

Written 2026-11-18, after Quackshot M3. **This file is the whole brief**: read it top to bottom before touching code.
Its siblings are [`QUACKSHOT-3D.md`](QUACKSHOT-3D.md) (the process that worked; status in
[`QUACKSHOT-3D-STATUS.md`](QUACKSHOT-3D-STATUS.md)), [`KILLER-3D.md`](KILLER-3D.md) (the one that didn't) and
[`GAME-INTROS-3D.md`](GAME-INTROS-3D.md) (every 3D game opens on a How to play explainer).

**Why Shanghai next:** it's the last social game still in 2D. Its competition has open items:
- Quackshot M4–M6: swap-in, sound, polish;
- the Demolition swap-in;
- the Killer agents redo.

Those are finishing jobs, not new games.

---

## 0. In one paragraph

Shanghai becomes **"The Lantern Pagoda"**: a temple courtyard where an eight-tier pagoda rises behind a round
**moon gate**, and the moon gate *is* the dartboard. The game has exactly eight rounds, and in round *n* only
number *n* scores. So:
- **the pagoda is the round tracker:** tier *n* lights as round *n* begins, with the target number on its plaque;
- **the board shows the one live number:** only that wedge glows gold;
- **every point is a sky lantern:** a scoring dart rings the gate's bronze gong, and lanterns in the thrower's
  colour rise from the wedge and drift up to that player's lantern string.

Across the eight rounds **the sky goes from late sunset to full night**, so the light itself says how far the
game has gone. It's the 2D page's own photo (pagoda, curved eaves, red and gold), made into a world where the rules
are the architecture.

---

## 1. Lessons to carry (from Killer and Quackshot)

Process (the Quackshot order worked, keep it):
1. **Hero first, signed off before any world** (Milestone 0). Here the hero is architecture, not a character. The
   risk moves to the **curved, upturned eaves**: a pagoda built from boxes and cones looks like a toy. The eaves are
   swept curves (a lofted roof profile with upturned corners), tiled, with brackets under them.
2. **Every element answers "what has this got to do with Shanghai?"** (§4).
3. **Gates hold** even when several milestones are asked for at once. Say so at the start.
4. **Review at 1:1 + silhouette + reference**, write the critique, and fix what it finds *before* sending.
5. **A rejected hero gets 2–3 rendered options.**
6. **Cameras aim from real bounds**, by projecting the subject's points into a frame window clear of the HUD and the
   title safe zone (Quackshot `director.js fitPoints`). Never fit a box by its size alone: near things eat the frame.
7. **One command per deliverable set** (look-dev, moments, intros), seeded and fixed-step from day one.
8. **List the choices before building** (§9); flag new ones in each report.

Engine traps that cost Quackshot time (check these on day one):
- **InstancedMesh culling:** three computes the bounding sphere once, with every instance at the origin. Set
  `frustumCulled = false` on any instanced set placed away from the origin, or it vanishes off-axis. That's thousands
  of lanterns here.
- **Light count is fixed at load:** adding a light later recompiles every shader. Make every light up front at
  intensity 0.
- **Shadow biases are per scene scale:** the engine's are sized for 50 m. Check for a ring or peter-panning at the
  real scale.
- **CSS custom-property names collide** with the kit's: the kit uses `--ki-*`, so use the page's own prefix.
- **A late tail can overwrite a final title:** guard every late card with "the game hasn't ended".
- **Particles up close:** big round drops read as soap bubbles, and white-hot additive bursts blow out. Size and
  brightness have to be judged in the close shot.
- **What the tests can't see:** the nothing-lies check counts things, but an invisible thing still counts. Every
  review render looks for missing objects.
- Older lessons still apply: wall-clock sub-stepping; read the verdict when the dart lands; GPU flags in Playwright;
  no `Math.random` drift from shared code; quiet backgrounds; judge in motion.

---

## 2. Project facts

- Repo `~/flightdeck-fork`, branch `feat/arcade-platform` with Sean's uncommitted work: **do not commit or push**
  unless asked. Server `SCORING_MODE=mock PORT=4000 node src/server.js` (one is usually running).
- Rules: `src/engines/shanghai.js` (316 lines). Scheduler cases are `shanghai_*` in `src/engines/index.js`
  (~713, 796–802). Shared round/intermission helpers are in `src/engines/core.js`. Bot aim is `aimNumber` (the
  round's number).
- TV page today: `public/games/shanghai.html` (1,354 lines). It has:
  - a parchment scroll score table (round scores per player);
  - a board map;
  - scroll + bamboo takeovers;
  - winner FX with petals and lanterns;
  - a help card.

  Asset: `public/assets/shanghai/bg.jpg` (the pagoda photo).
- Catalogue `['shanghai', 'Shanghai', 'social', 2, 6]`. **No browser test covers Shanghai today.**
- Reuse:
  - `lib3d` (engine, director, particles, beacons, physics);
  - the kit: queue, loop, hud, demo, roster, darts, **intro**;
  - Quackshot's `director.js` (`fitPoints` / `closeOn`), `darts.js` (upright board, glow ring) and the tool
    templates (`quackshot-look.cjs`, `quackshot-moments.cjs`, `intros.cjs`).

---

## 3. Shanghai rules — the exact state contract (from `src/engines/shanghai.js`)

**Players** (2–6): `{id, name, avatar, score, roundScores[8]}`. `roundScores[r-1]` is null until that player throws
in round *r*, then holds the round's running total. Doubles: one entity per team with `members[]`, plus
`isDoublesLineup` and `throwerIndices[]` (kit `roster.js`).

**Rounds**:
- `currentRound` runs 1–8 (`SHANGHAI_MAX_ROUNDS`), and **the target number is the round number**.
- There is no round-1 announce.
- Later rounds announce with `round_announce` data `{eyebrow: 'SCROLL ROUND', subtitle: 'AIM FOR n', round,
  maxRounds: 8, …}`.
- There are no round multipliers.

**A dart** (`handleShanghaiThrow`, phase `playing` only):

| Dart | Points |
|---|---|
| the round's number, single | n |
| the round's number, double | 2n |
| the round's number, treble | 3n |
| any other number, a bull, a miss | 0 |

- `lastThrow = {points, hit, label ('+16' | '7' | 'MISS' | 'BULL'), playerId, playerName, number, multiplier,
  targetNumber, sector}`.
- `turnDarts` holds this visit's darts `[{label ('T5', 'MISS', '7'), mult, points, hit}]`, at most 3.
- **No overlay phases.** A dart never opens a takeover: every dart just scores, and the next dart can come at once.
- **Where the dart goes:**
  - from `number` and `multiplier`;
  - inner or outer single from `sector` (`s`/`S`) when there is one, otherwise a seeded pick (it doesn't change
    the score);
  - **a bull's `multiplier` is always 1 in `lastThrow`**, so outer bull vs bull comes from `sector` (`25` / `Bull`)
    and defaults to the outer bull. Both score 0, so it's cosmetic, but draw it truthfully when the sector says.
- **There is no "Shanghai" instant win in this engine.** The pub rule (single + double + treble of the target in one
  visit wins outright) isn't implemented. The 3D page must not imply it (see §9).

**Timing**:

| After | Server | Then |
|---|---|---|
| dart 1–2 of a visit | nothing | stays `playing` |
| **dart 3** | `round_announce` 3 s if the round wraps, else `intermission` 2.5 s — **in the same state as the dart** | `playing`, next player |
| the last visit of round 8 | `playing` + 600 ms → `shanghai_resolve_match` | `winner` `{winnerId, winnerName, score, rounds: 8, reason: 'score'}` or `draw` `{contenders[], reason: 'score'}` |

- So **every visit's third dart arrives with a takeover** (unlike Quackshot, where only an inner single did). Queue
  the dart first and hold it long enough to land and score.
- Detect a dart by `(activeIdx, throwsThisTurn)` going up.
- Debug previews: `next`, `winner`, `draw` (they park the phase; `screen: 'clear'` returns to playing).

**Winner**: the highest `score` after round 8. A tie for the top is a **draw**.

---

## 4. Creative direction — "The Lantern Pagoda"

The sixth mood in the set:
- Derby: golden afternoon;
- Demolition: industrial night;
- Limbo: lagoon dusk;
- Killer: noir interior;
- Quackshot: fairground blue hour;
- **Shanghai: a temple courtyard turning from sunset to night**, one step per round.

It's an original world: no real temple, no brands, no mascots or known characters. It uses the bg photo's palette:
red lacquer, imperial yellow walls, dark grey tile, gold finials.

| Element | What it is | Why it belongs |
|---|---|---|
| **The moon gate** (hero, with the pagoda) | A round gateway in a red courtyard wall. The board fills it: lacquer and bronze beds, a gilt number ring, a bronze gong hung above | It's the board the darts hit, every bed exact. The round gate is the round board |
| **The live wedge** | Only the round's number glows gold (single, double, treble beds); the rest of the board is dim lacquer | "Only the current number scores": you can see what to aim for from across a bar |
| **The pagoda** | Eight tiers rising behind the gate, swept upturned eaves, a bell at every corner, a gold spire | Eight rounds. Tier *n* lights when round *n* starts; its plaque shows *n*. The lit tiers are the round tracker |
| **Sky lanterns** | Paper lanterns in the thrower's colour; a scoring dart releases one per point, and they rise to that player's string | Points made visible. The 2D page's winner already releases lanterns |
| **Player stations** | Along the courtyard steps, one per player: a lantern pole in their colour, a hanging scroll with their name and score, a stone step lit when it's their turn | The 2D page's scroll score table, made physical. **No people** |
| **The scroll banners** | Each player's scroll shows their eight round scores (the 2D table) and their total | The 2D page's score grid; the DOM HUD is still the readable truth |
| **The sky clock** | Round 1 late sunset → round 8 full night with stars; the lanterns glow more as it darkens | Progress without a number; escalation toward the final round |
| **Courtyard dressing** | Stone lions *as distant silhouettes only*, braziers, plum blossom, roof tiles framing the top of the frame (the bg photo's foreground eave) | The bg photo's world. Kept quiet and out of focus |
| **Darts** | 1.2 m darts with flights in the thrower's colour, thrown from the active station, stuck in the exact bed, glow ring at the bed | The real dart, placed truthfully |

**Light**: the key is a low warm sun at first, cooling to moonlight by round 8. The fill is the sky (it bakes the
environment once per round, at the round change). The practicals are the lanterns, braziers and tier lights.
Saturation comes from the red lacquer, the gold and the player colours.

### The moments

Every dart goes **throw-in → impact → reaction → settle**. There are no overlay windows, so reactions stay short
and are never blocking (the next dart can land at once).

| Moment | Visual |
|---|---|
| A scoring dart (on the round's number) | The gong rings, with a camera kick. The bed flashes gold, "+n" / "+2n" / "+3n" floats off, and that many lanterns rise from the wedge to the thrower's string; their scroll's round cell and total tick up |
| A treble on the number | As above, plus firecrackers along the gate wall and a brighter gong |
| A no-score dart (other number, bull, miss) | The dart sticks with a dull wooden knock (a miss hits the wall), a puff of dust; "0" in the HUD. Truthful and quiet |
| Dart 3 + the takeover | The dart lands and scores first (held ~0.7 s), then the intermission or round announce |
| Intermission (2.5 s) | The camera finds the next player's station; their scroll unrolls; their step lights |
| Round announce (3 s) | The camera cranes up the pagoda as tier *n* lights, its bells chime, and its plaque shows *n*; the sky steps darker; the board's live wedge moves to the new number. Card: "SCROLL ROUND · ROUND n · AIM FOR n" |
| Round 8 (the last) | The pagoda's spire lights; the sky is full night; the lanterns glow brightest; "FINAL ROUND" |
| Winner | Every lantern in the courtyard rises; the winner's string and scroll turn gold; fireworks over the pagoda; "CHAMPION" with the name as DOM text |
| Draw | Each contender's station lit; "TIED" with the names as DOM text |

**Cameras** (`ShotDirector` subclass, framing by projected bounds):
- `master`: the default. From the courtyard, slightly raised: the whole gate board, the pagoda's lit tiers above
  it, and every station.
- `bed`: on the live wedge when a dart scores.
- `lanterns`: following the rise.
- `station`: intermission.
- `crane`: round announce, up the pagoda.
- `winner`: a slow push.

**HUD** (scroll style; everything players type via `textContent`):
- score columns with each player's total and a mini eight-cell round row;
- the round pill with the target number big ("AIM FOR 5");
- the thrower card with each dart's result ("T5 · +15", "7 · 0");
- title cards;
- help;
- the How to play explainer (`shanghai/intro.js`).

---

## 5. What the 2D page does that the 3D page must keep

- The origin + parent check on messages; phases de-duplicated by `type + startedAt`.
- The per-round score grid for every player (the scroll), the thrower named in doubles, the current target big.
- Winner and draw names as DOM text, the winner clip via `FlightDeckWinnerVideo`, help (`helpVisible`), and the How
  to play explainer (kit).

---

## 6. Sound (after the look, on the shared audio core)

- Ambience: courtyard evening (wind chimes, a distant crowd, braziers).
- The gong (pitched by multiplier), lantern whoosh, firecrackers, tier bells on the round, a wooden knock for no-score
  darts, fireworks for the winner.

Out of scope until the look and the game are signed off.

---

## 7. File plan

```
public/games/shanghai-classic.html        ← exact copy of today's shanghai.html (FIRST)
public/viewer.html                         ← add shanghai to the classic switch (+ ?shanghai=3d preview until M4)
public/games/shanghai/
  common.js    scale, bed mapping (sector-aware, bulls), colours, the round → sky table
  pagoda.js    the eight-tier pagoda: lofted upturned eaves, tiles, brackets, bells, plaques, tier lights (hero)
  gate.js      the moon gate board: exact beds, live-wedge glow, gilt number ring, gong
  courtyard.js wall, steps, stations (lantern poles, scrolls), braziers, dressing
  lanterns.js  instanced sky lanterns: release, rise, gather on strings (unculled!)
  sky.js       sunset → night sky + per-round env bake
  darts.js     from Quackshot's (upright board, glow ring)
  fx.js        gong ring, firecrackers, dust, fireworks
  director.js hud.js game.js demo.js main.js intro.js audio.js (M5)
public/games/shanghai-3d.html              ← the 3D shell until it plays the real game (M4 swap-in)
docs/plans/tools/shanghai-lookdev.cjs      ← M0/M2 stills, 1:1 crops, silhouettes, clip, contact sheets
docs/plans/tools/shanghai-moments.cjs      ← M3 strips per moment + a clip
docs/plans/shanghai-lookdev/reference/     ← pagoda / eave / moon gate / sky-lantern references
tests/shanghai-bed.test.cjs                ← dart → bed mapping, every form
tests/browser/shanghai.spec.cjs            ← nothing lies, every dart type, dart-3 takeovers, 8 rounds, winner/draw text
docs/plans/SHANGHAI-3D-STATUS.md, CHANGELOG.md, docs/ASSET-REGISTER.md
```

---

## 8. Quality gates

**The hero checklist** (the pagoda and the gate; written critique before every review):
- **Silhouette:** in solid black, it reads as a pagoda at once. The eaves sweep up at the corners, not as flat cones;
  the tiers step in; the spire reads.
- **Proportion:** the tier spacing, eave overhang and taper match the reference within the eye's tolerance (overlay
  the reference at 50%).
- **No primitive tells:** no plain cones or boxes for roofs; tiles and brackets present at close range;
  no z-fighting between tiers.
- **Material:** lacquer red with a soft clearcoat, matte imperial-yellow walls, dark tile with a little gloss, real
  gold leaf on the finials.
- **Close-up and distance:** it holds at 1:1 in the crane shot and reads behind the gate at master distance.

**The game:**
- **Readable from across a bar:** one master frame shows the live number, every score, the round (lit tiers + the
  HUD), whose turn it is, and each dart of the visit. Check at 2, 4 and 6 players on a phone thumbnail.
- **Nothing lies** (automated through the server): DOM totals and round cells equal `score` / `roundScores`; the
  marked tiers equal `currentRound`; the live wedge is the target; the dart count equals `throwsThisTurn`; each dart
  sits in its bed; **every element counted is also on screen** (a check in the review renders, not just the test).
- Every dart reacts within 100 ms. Every dart 3 lands and scores before its takeover. No camera clipping; no title
  over the subject; no HUD overlap at 6 players with "Christopher & Maximilian".
- 60 fps at 1080p-equivalent pixels **in real Chrome on the M1**, measured at Milestone 2, with ~1,000 lanterns in
  flight in the winner moment.
- `npm test`, `npm run check` and `npx playwright test` pass at every milestone end.

---

## 9. Decisions (proposed; Sean to confirm or change at the M0 gate)

1. **Concept: "The Lantern Pagoda", the moon gate as the board, the pagoda as the round tracker, lanterns as
   points.** I rejected two alternatives:
   - a scroll-painting world: too flat for 3D;
   - a dragon dance: a character, the asset class that sank Killer.
2. **No people, no creatures up close.** Players are stations; the stone lions are distant silhouettes only.
3. **One lantern per point**, in the player's colour. Visible counts are capped per string, and above the cap the
   lanterns grow brighter. The DOM HUD is the readable number.
4. **The sky darkens one step per round** (sunset → night); the environment bakes only at the round change.
5. **No "Shanghai!" instant-win moment**, because the engine doesn't have the rule. A treble on the number gets
   firecrackers, but nothing suggests the game ended. **Question for Sean:** should the engine get the real pub rule
   (single + double + treble of the target in one visit wins outright)? That's a rules change on the server, his
   call, and the view would then gain a "SHANGHAI!" finale moment.
6. **Bull vs outer bull** is drawn from `sector` when present; otherwise the outer bull (both score 0).

---

## 10. Milestones (in order — **stop where marked, even if several are asked for at once**)

0. **The pagoda and the gate. STOP for sign-off.**
   - Collect the reference (the bg photo plus real pagodas, eave details, moon gates, sky lanterns) into
     `docs/plans/shanghai-lookdev/reference/`.
   - Build the pagoda in **2–3 eave/profile variants** (steeper Jiangnan sweep, gentler northern, a slimmer tower).
   - Build the moon-gate board with the live wedge, and one sky lantern.
   - Deliver turnarounds, 1:1 close-ups, silhouettes, a reference overlay and the written critique.
   - Ask: **"Is this the pagoda? Which one?"**
   - Also show one rough still of the whole courtyard concept and the round-1 vs round-8 sky.
   - Also raise the §9.5 rules question.
1. **Greybox that plays the real game.**
   - Copy `shanghai-classic.html` and add the viewer switch.
   - Greybox gate with exact beds and the live wedge, block stations with scores, a block pagoda whose tiers light by
     round, capsule darts in exact beds, and the How to play explainer.
   - Drive it from `demo.js` and from the real server.
   - Write `shanghai.spec.cjs` and the bed unit test. Run the full suite. Show Sean.
2. **Look-dev. STOP for sign-off.**
   - Materials, the courtyard, the sunset → night sky, the lanterns, round-8 escalation, all on a running game.
   - Deliver 8 stills (master rounds 1 / 4 / 8, a scoring dart, a treble, lanterns rising, the round crane, the
     winner), 1:1 crops of every hero, and a 20 s clip.
   - Measure fps in real Chrome on the M1. Ask **"Is this the look?"**
3. **Set pieces:** the gong and lantern release, the treble firecrackers, the round crane and tier lighting,
   intermission scroll, winner (every lantern rises), draw.
4. **Game flow and swap-in:** director logic from state, HUD + scroll checks, doubles through the real server,
   help, previews, 6 players with long names, swap in as `shanghai.html`.
5. **Sound** on the shared audio core.
6. **Polish, perf, verification:** a full-game video, a before/after image, CHANGELOG and the asset register.

---

## 11. Risks to check early

- **The eaves:** the whole look rides on them. Build the lofted roof generator first and judge its silhouette before
  any tiling.
- **Pagoda vs board in one master frame:** a tall tower behind a round board fights a 16:9 frame. Block it at
  M1 with 6 stations. The pagoda may need to sit offset (behind and to one side of the gate), with the crane shot
  carrying it.
- **Lantern counts:** a 300-point game is 300+ lanterns per player in the winner moment. Instance them, keep them
  unculled, draw far ones as glow sprites, and measure.
- **Every visit's dart 3 arrives with a takeover:** make that the first thing the browser test covers.
- **The sky clock is a lighting change per round:** bake the environment at the round change only (it's a hitch
  risk; measure it), and keep the key light's shadows stable.
- **No-score darts are most darts:** keep them quiet but honest. The board must still show where they sit, and
  the HUD shows 0.
