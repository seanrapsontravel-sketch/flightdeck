# Quackshot 3D — plan

Written 2026-11-18, after 3D Killer. **This file is the whole brief**: read it top to bottom before touching code.
Its siblings are [`KILLER-3D.md`](KILLER-3D.md) (+ [`KILLER-3D-STATUS.md`](KILLER-3D-STATUS.md)),
[`LIMBO-3D.md`](LIMBO-3D.md) and [`DEMOLITION-3D.md`](DEMOLITION-3D.md).

---

## 0. In one paragraph — and why this plan starts with a failure

Quackshot becomes **"Duck Row"**: the rubber-duck shooting stall at a fairground at blue hour. It's the world the
2D page's own background photo (`public/assets/quackshot/bg.jpg`) already promises: a striped counter with mounted
guns and coloured stools, strings of bulbs, ducks everywhere, and a Ferris wheel and carousel glowing behind. The
hero is **the target**: a giant upright carnival target at the back of the stall, laid out exactly like a real
dartboard, where **every scoring zone is a fairground attraction**. The bull carries the tin prize ducks (+2/+3),
a parade of rubber ducks rides round the inner-single ring (+1), the treble ring is a ring of gas flame (−2), and
the outer board is painted water that splashes (−1). Every dart sticks in its exact bed, and the zone it hit does
its thing. The board itself tells you the score.

**Killer was a step down, and this plan is built around not repeating it.** Sean's verdict on Killer:
*"This iteration wasn't as good as previous. The killer design is poor. Heads are too round etc."* Earlier still:
*"What have chess pieces got to do with killer?"* Section 1 lists what went wrong and the rule each lesson adds.
The two biggest changes:

1. **The characters come first, and they're sculpted, not assembled.** The only characters in Quackshot are
   ducks. They're designed, sculpted with Derby's signed-distance pipeline, reviewed close up against reference,
   and **signed off by Sean in Milestone 0, before any world is built.**
2. **Everything on screen has to answer "what has this got to do with Quackshot?"** Section 4 gives every element
   one line saying why it belongs. Anything that can't answer is cut.

---

## 1. Lessons from Killer (do not repeat)

What went right (keep it): building a greybox that played real state first; the shared kit; the nothing-lies
browser test; exact dart beds; the board as the information; the seeded fixed-step review tools.

What went wrong, and the rule each adds:

1. **Primitive-built characters looked cheap.** The hitmen were capsules, spheres and lathe shapes: round heads, no
   necks, blank faces, mannequin arms. The Derby horse was good because it was **sculpted**: signed-distance
   shapes blended with smooth-min, meshed with surface nets, then skinned.
   **Rule:** anything organic (ducks here) is sculpted with `derby/sdf.js` (`ellipsoid`, `roundCone`, `smin`,
   `surfaceNets`). It's never assembled from three primitives. Primitives are only for hard-surface parts:
   counter, rails, frames, bulbs.
2. **The concept wasn't tied to the game.** The plan chose chess-piece "agents" for elegance, and Sean asked what
   they had to do with Killer.
   **Rule:** every element gets a one-line *why it belongs* (§4), checked against the game's rules and its 2D
   identity (the duck icon, the bg photo, the words on the page: "Splash!", "Ring of Fire!", "CARNIVAL ROUND",
   "ADMIT ONE", "Grand Prize").
3. **The look sign-off was skipped.** Sean asked for milestones 1–4 together, so I built on an unsigned look and
   the problems surfaced at the end.
   **Rule:** sign-off gates hold even when several milestones are asked for at once. At a gate, send the stills,
   then carry on only with work the look can't change (state, tests, timing) until Sean answers. Say this at the
   start, not at the end.
4. **Reviews happened at thumbnail size.** The 640×360 contact sheets hid the round heads and blank faces.
   **Rule:** every hero review includes **1:1 close-ups** and a **solid-black silhouette** of the asset, shown
   **side by side with the reference image**. Before anything goes to Sean, write a short critique of it against
   the checklist in §8. If a flaw is visible in the critique, fix it before sending.
5. **The redesign was one shot.** Asked for "a hitman in a tuxedo", I built one version in an hour and shipped it.
   **Rule:** when Sean rejects a hero element, come back with **2–3 rendered options** (rough sculpts, same
   framing), let him pick, then refine.
6. **Shots and titles were tuned to the old geometry.** When the figure changed, cameras cut off heads and the
   KILLER title sat across a face.
   **Rule:** cameras aim from each asset's real bounds (`Box3` from the mesh), never from hand-typed heights.
   Title cards have a safe zone, and the director keeps the subject out of it.
7. **Deliverables went stale.** The contact sheet was built by hand and not regenerated when the stills were.
   **Rule:** one command (`docs/plans/tools/quackshot-lookdev.cjs`) renders every still, close-up, silhouette
   sheet, clip and contact sheet.
8. **Big choices were made quietly.** Coloured velvet jackets, blank faces and hats as identifiers all got
   decided without asking.
   **Rule:** list the choices in §9 *before* building, and flag any new ones in the milestone report.

Older lessons still apply (each one hurt before): wall-clock sub-stepping; verdicts fit the server's window; read
the verdict when the dart lands; GPU flags in Playwright; `Math.random` drift from shared code; reflection feedback
loops; camera choices from the state; dim hot points under box-blur DOF; no `fwidth()` in branches; clamp every
`pow`/`sqrt`; **coplanar faces z-fight at distance**; a cool rim light glares off polished surfaces; quiet
backgrounds; judge in motion.

---

## 2. Project facts

- Repo `~/flightdeck-fork`, branch `feat/arcade-platform` with Sean's uncommitted work: **do not commit or push**
  unless asked. Server: `SCORING_MODE=mock PORT=4000 node src/server.js` (check `lsof -i :4000`; one is usually
  running) → `https://localhost:4000`.
- Rules: `src/engines/quackshot.js` (324 lines). Scheduler cases are `quackshot_*` in `src/engines/index.js`
  (~712, 785–795), with debug previews around ~1295–1345. Shared helpers are `scheduleRoundThenNextPlayer`,
  `showNextPlayerIntermission` and `roundAnnounceInfo` in `src/engines/core.js`. Bot aim is
  `rollQuackshotAimThrow` (index.js ~389).
- The TV page is `public/games/quackshot.html` (2,168 lines): an SVG mini board map that flashes the bed hit,
  score columns (score, a duck icon per bullseye, dart dots), round dots with a ×2 FINAL tag, takeovers (round
  announce ticket, UP NEXT, bullseye with duck knockdowns, Ring of Fire, Splash, winner/draw with confetti), and a
  help overlay. Assets are `public/assets/quackshot/{bg.jpg, ducky-icon.svg}`. The viewer sets `bg.jpg` as the
  backdrop (`viewer.html:679`).
- Catalogue: `['quackshot', 'Quackshot', 'social', 2, 6]`. Session ranking is `winner_then_score`.
  **No browser test covers Quackshot today**; `arcade.spec.cjs` doesn't play it.
- Reuse:
  - The kit `public/games/lib3d/kit/`: `queue`, `loop`, `hud`, `demo`, `roster`, `darts` (exact bed positions incl.
    `s/S/D/T/25/50/Bull` sectors).
  - `lib3d`: engine presets, `Reflection` (water), particles, physics `World` (knocked ducks), `ShotDirector`.
  - `derby/sdf.js` and `derby/merge.js` (sculpt + merge).
  - Limbo's `Flames`/`FireLight` (`limbo/fire.js`) for the Ring of Fire.
  - Killer's `darts.js` (the thrown dart) and its look-dev and moment tools.

---

## 3. Quackshot rules — the exact state contract

**Players** (2–6): `{id, name, avatar, score, bullseyes}`. The score can go **negative**. Doubles: one entity per
team with `members[]`, plus `isDoublesLineup` and `throwerIndices[]`; use the kit's `roster.js` naming.

**Rounds**: `currentRound` runs 1–6 (`QUACKSHOT_MAX_ROUNDS`). **Round 6 doubles every score, minus scores
included** (`roundMultiplier` 2). There's no round-1 announce. `round_announce` data:
`{eyebrow: 'CARNIVAL ROUND', title: 'ROUND n', maxRounds: 6, isLast, multiplier, tags: ['FINAL ROUND',
'DOUBLE POINTS'] at round 6, subtitle}`.

**A dart** (`handleQuackshotThrow`; only in phase `playing`) scores by zone, × the round multiplier:

| Zone (`lastThrow.zone`) | From | Points | Phase |
|---|---|---|---|
| `double_bull` | sector `Bull`, or bull ×2 | **+3** | `bullseye` (title "Double Bullseye!") |
| `bull` | sector `25`, or bull ×1 | **+2** | `bullseye` ("Outer Bull!") |
| `inner_single` | sector `sN` / `singleinner` | **+1** | **none**: the score just changes |
| `triple` | ×3 or sector `TN` | **−2** | `zone_hit` ("Ring of Fire!") |
| `board` | outer single, double, or a single with no sector | **−1** | `splash` ("Splash!") |
| `miss` | off the board | **−1** | `splash` |

- `lastThrow = {points, basePoints, roundMultiplier, zone, label ('+3', '−2 ×2', …), bullseye, playerId,
  playerName, number, multiplier, sector}`. `bullseyes` counts bull hits (the 2D page shows one duck icon each).
- **Where the dart goes**: take the bed from `zone`, and the number from `number` when it's there. A single with no
  sector is scored as **outer** (`board`), so draw it in the outer single. A bot's random throw can give a zone with
  no number: pick the number from a hash of (player, round, dart) so a reload shows the same picture.
- Phase data: `bullseye {playerName, avatar, bullseyes, zone, points, label, title, winning}`, and
  `zone_hit` / `splash` `{playerName, avatar, zone, points, label, title}`.

**Timing** (the windows the view must fit):

| After | Server waits | Then |
|---|---|---|
| bull, triple, outer/double or miss | **1260 + 150 + 3000 = 4410 ms** (`quackshotOverlayDelayMs`): the 2D page flashes the bed for 1.41 s, then shows the card for 3 s | `quackshot_after_hit` → continue |
| inner single, darts 1–2 | nothing | stays `playing` |
| **inner single, dart 3** | nothing: **the intermission (or round announce) arrives in the same state as the dart** | the dart must still visibly land and score before the takeover (an event with a tail) |
| continue after dart 3 | `round_announce` 3000 ms if the round wraps → `intermission` 2500 ms (`nextPlayerName, avatar`) → `playing` | |
| the last visit of round 6 | `playing` + 600 ms → `quackshot_resolve_match` → `winner` (reason `score`) or **`draw`** `{contenders[], reason: 'score'}` | |

- No video-mode window changes apply to Quackshot (confirm at Milestone 1: grep `delayMsWithVideo`). The winner
  clip still plays through `FlightDeckWinnerVideo` as on every page.
- Detect a dart by `(activeIdx, throwsThisTurn)` going up; read `lastThrow` and the phase from the same state.
- Debug previews: `outer_bull`, `double_bull`/`bullseye` (`bullseyes: 2` → two-duck knockdown), `zone_minus`,
  `splash`/`zone_splash`. They must play without corrupting the scores shown.

---

## 4. Creative direction — "Duck Row"

The fifth mood in the set, after Derby's golden afternoon, Demolition's industrial night, Limbo's lagoon dusk and
Killer's noir interior: **fairground blue hour**. The sky is deep blue with the last light, the bulbs warm, and
every colour candy-bright. It's the 2D bg photo, made real. It's an original world: no brands, mascots or known
characters.

Every element, and why it belongs:

| Element | What it is | Why it belongs |
|---|---|---|
| **The target** (hero) | A 5 m upright carnival target at the back of the stall: exact dartboard beds, a bulb-lit number ring, painted tin and enamel | It's the board the darts hit; every bed is placed exactly |
| **Bull: the prize ducks** | Two gilded tin knockdown ducks on a brass boss at the centre. Outer bull (+2) knocks one flat; double bull (+3) knocks both, and the golden duck flies off | The 2D page knocks 1 duck on an outer bull and 2 on a double bull; "bullseyes" are ducks won |
| **Inner singles: the parade** | A rail running round the inner-single ring carrying ~20 rubber ducks bobbing along. A hit knocks the nearest duck over with a squeak; it rights itself further round | +1 is the duck-shoot hit; the inner ring is where the ducks are |
| **Treble ring: the Ring of Fire** | A ring of gas jets on a brass pipe. A hit roars the whole ring up in flame | The 2D page calls a treble "Ring of Fire!" (−2) |
| **Outer board: the water** | The outer singles and doubles are painted waves on tin, fed by a trough. A hit fires water jets and a splash curtain; a miss splashes into the pool in front | The 2D page calls these "Splash!" (−1) |
| **The counter and stations** | The striped counter with one station per player: their coloured stool, a mounted dart rest, their avatar on an ADMIT ONE ticket | The bg photo's counter. **No people**: players are stations, so there are no human characters to get wrong |
| **The prize shelf** | Above each station, a shelf where that player's won ducks sit (one per bullseye) | The 2D score columns show a duck per bullseye |
| **The marquee scoreboard** | The stall's header: each player's score in chasing bulbs (minus scores in red bulbs), the round as six bulb dots, a ×2 FINAL sign | The score is the game; the 2D page has round dots and ×2 FINAL |
| **Hanging ducks + bulb strings** | Big rubber ducks hanging from the awning, as in the bg photo | Dressing that says "duck stall"; it frames the target |
| **The fairground** | Ferris wheel, carousel tent, bunting, other stalls, all in bokeh behind | It's the bg photo's world. Keep it quiet: low contrast, defocused (Demolition lesson) |
| **Escalation (round 6, ×2)** | Fireworks over the Ferris wheel, the bulbs chasing faster, the parade speeding up, gold bulbs | "FINAL ROUND · DOUBLE POINTS" |
| **Darts** | 1.2 m darts with flights in the thrower's colour, thrown from the active station along a believable arc; they stick in the exact bed. A visit's darts are pulled at the end | The real dart, placed truthfully |

**The ducks (the only characters).** Two kinds, both sculpted (Milestone 0):
- **Rubber duck** (the parade, the hanging ducks, the prize shelves): the classic bath duck.
  - Body: a flat-bottomed teardrop with a full chest and a flicked-up tail.
  - Head: set **forward** of the body, slightly squashed, merged into the body through a real neck crease.
  - Beak: a wide flat bill with a slight smile line.
  - Eyes: painted, with a highlight; a cheek bump below them.
  - Material: glossy vinyl with subsurface-ish warmth and a soft rim of light. It must read as a rubber duck in
    pure black silhouette.
- **Tin prize duck** (the bull): a flat pressed-tin knockdown target, a duck in profile cut from sheet metal and
  rolled at the edges, gilded and enamel-painted. It's hard-surface (an extruded shape plus a bevel), not organic.
- **Reference:** the 2D `ducky-icon.svg` (head forward and round, the body an elongated oval, a wide flat beak),
  the bg photo, and real rubber-duck photos (side, front, 3/4, top), collected into
  `docs/plans/quackshot-lookdev/reference/`.

**Light**: blue-hour sky fill (cool), warm bulb practicals everywhere (instanced emissive bulbs plus a few real
lights), a warm key on the target from the awning. Saturation comes from the ducks, the stripes and the player
colours. Fire and fireworks are the only hot whites.

### The moments

Every dart goes **throw-in → impact (hit-stop) → the zone's reaction → settle**. The 2D page's bed flash takes
1.41 s before its card, so the 3D reaction owns that 1.41 s, then the title card runs to the window's end.

| Moment | Visual | Fits |
|---|---|---|
| Visit start (intermission) | The camera finds the next player's station; the ticket stamps ADMIT ONE with their name; their stool light comes up | 2.5 s |
| +1 parade hit | The dart sticks in the inner ring; the nearest parade duck tips over with a squeak and pops back up further round; "+1" floats off the marquee | instant; no phase |
| Outer bull +2 | The dart hits the boss; one tin duck slams flat; the gold duck wobbles; dartcam then a push-in; the knocked duck flies on a ballistic arc to the player's prize shelf | 4.41 s |
| **Double bull +3** | Both tin ducks fall; the golden duck launches, spinning, and lands on the shelf; a shower of gold; all the bulbs flash | 4.41 s |
| **Ring of Fire −2** | The whole treble ring roars up in flame; heat shimmer; the bulbs dip; "Ring of Fire!" | 4.41 s |
| **Splash −1** | Water jets fire across the outer board and a splash curtain hits the lens; a miss lands in the pool with a plume | 4.41 s |
| Round announce | A crane up over the fairground and back down to the stall; an ADMIT ONE ticket card ("CARNIVAL ROUND · ROUND n OF 6"); round 6: "FINALE", fireworks start | 3.0 s |
| Winner | The winner's station lights gold; their prize shelf ducks bounce; confetti and fireworks; the marquee spells their name; "GRAND PRIZE" with the name as DOM text | until next game |
| Draw | Each contender's station lit; "DEAD HEAT" with each name as DOM text | until next game |

**Cameras** (`ShotDirector` subclass):
- `master` (**the default the director always returns to**): from behind the counter at shooter's eye height,
  slightly raised. The whole target, the marquee and every station are in frame.
- `dartcam`: rides the dart in.
- `bed`: tight on the hit zone.
- `prize`: follows the knocked duck to the shelf.
- `fire` and `splash`: low and close.
- `station`: for intermission.
- `crane`: for the round announce.
- `winner`: an orbit.

Every shot aims from asset bounds (lesson 6).

**HUD** (carnival ticket style, matching the 2D page; everything players type goes in via `textContent`):
- Score columns along the bottom: avatar, name, score, a duck per bullseye, dart dots.
- Round dots (top left) with ×2 FINAL.
- The thrower card with each dart's result ("s17 · +1", "T5 · −2", "BULL · +3").
- Title cards: Splash! / Ring of Fire! / Outer Bull! / Double Bullseye! / ROUND n / UP NEXT / GRAND PRIZE /
  DEAD HEAT.
- The help overlay.
- The marquee in the world also shows scores, but the DOM columns are the readable truth.

---

## 5. What the 2D page does that the 3D page must keep

- The message handler checks `origin === location.origin && source === window.parent`; phases are de-duplicated
  by `type + startedAt`.
- The bed reaction starts at once; the overlay card follows 1.41 s later and fits the 4.41 s window.
- Score columns with duck counts and the current thrower's dart dots; doubles duo avatars and the thrower named.
- Round 6 marked ×2 FINAL everywhere.
- The winner/draw screen with names as DOM text, the winner clip via `FlightDeckWinnerVideo`, and the help overlay
  (`helpVisible`).
- The 2D page's layout check is `?layoutTest=all`. The 3D equivalent is `?demo=1&players=6&long=1`.

---

## 6. Sound (after the look; on the shared audio core)

Same order as Killer: finish Limbo's parked mix, lift `lib3d/audio.js`, then build Quackshot's palette.
- **Ambience:** fairground ambience (distant organ, crowd murmur, a bell, rides).
- **Music:** a band-organ waltz that goes double-time in round 6.
- **Moments:** dart thunk into tin (pitch by bed), a parade-duck squeak, a tin clang and coin shower for bulls, the
  whoomph of the flame ring, water jets and a splash, a ticket stamp, fireworks and a fanfare.

Measure with the sound reel and listen by ear. Out of scope until the look and game are signed off.

---

## 7. File plan

```
public/games/quackshot-classic.html        ← exact copy of today's quackshot.html (FIRST)
public/viewer.html                          ← add quackshot to the classic switch
public/games/quackshot/
  common.js    scale, zone → bed mapping, colours, the safe-zone for titles
  duck.js      the sculpted rubber duck (SDF → surface nets, LODs, instanced) + the tin prize duck
  target.js    the board: exact beds, number ring, parade rail, flame ring, water panel, bull boss
  stall.js     counter, stations, stools, shelves, marquee, awning, hanging ducks, bulbs (instanced)
  fair.js      background: Ferris wheel, carousel, stalls, sky, fireworks
  darts.js     thrown darts (from Killer's, thrown from the active station)
  fx.js        splash/jets, flames (limbo/fire.js), gold shower, confetti, squeak puffs
  director.js  hud.js  game.js  demo.js  main.js  audio.js (M5)
public/games/quackshot.html                 ← the 3D shell, once it plays the real game
docs/plans/tools/quackshot-lookdev.cjs      ← ONE command: stills, 1:1 crops, silhouettes, clip, contact sheets
docs/plans/quackshot-lookdev/reference/     ← the reference images for the ducks and the stall
tests/browser/quackshot.spec.cjs            ← nothing lies, every phase, winner/draw text
tests/quackshot-bed.test.cjs                ← zone → bed mapping for every sector form
docs/plans/QUACKSHOT-3D-STATUS.md, CHANGELOG.md, docs/ASSET-REGISTER.md
```

---

## 8. Quality gates

**The hero checklist** (written critique before every review; Sean sees it with the images):
- **Silhouette:** in solid black, from the side and 3/4, it reads as a rubber duck. The head is forward of the
  body, the tail is flicked up, and the beak is wide and flat.
- **Proportion:** the head-to-body ratio and the head position match the reference within the eye's tolerance
  (overlay the reference at 50% opacity).
- **No primitive tells:** no perfect spheres or capsules visible, no hard intersections where parts meet (blended
  creases instead), no blank faces.
- **Material:** vinyl gloss with a soft highlight, warm shadowing; not plastic-flat, not chrome.
- **Close-up and distance:** it holds up at 1:1 in the `bed` shot and still reads at master distance.

**The game:**
- **Readable from across a bar:** one master frame shows every score, every bullseye count, the round (and ×2), whose
  turn it is, and where each dart of the visit sits with what it scored. Check at 2, 4 and 6 players on a
  phone-sized thumbnail.
- **Nothing lies** (automated, through the server): once settled, each player's shown score and duck count equal
  the state, the round matches, the dart count equals `throwsThisTurn`, and each dart sits in the bed its zone says.
- Every dart reacts within 100 ms of the state arriving. Each overlay moment fits 4.41 s. The dart-3 inner single
  shows before its takeover.
- No camera clipping; no title over the subject; no HUD overlap at 6 players with "Christopher & Maximilian".
- 60 fps at 1080p **in real Chrome on the M1**, measured at Milestone 2, not at the end; `?quality=low` holds 60.
- `npm test`, `npm run check` and `npx playwright test` pass at every milestone end; no console errors. Every
  moment is reviewed in motion.

---

## 9. Decisions (made 2026-11-18; Sean: "you make the decisions")

These are settled. Don't reopen them without a reason found in the work, and say so in the report if one turns up.

1. **Concept: "Duck Row", the upright carnival target, seen from the counter.** The floor-level pond was rejected:
   - a duck shoot is aimed at, so the player's-eye view is the natural one;
   - it keeps the dart's flight readable;
   - it's a different picture from Killer's overhead board.
2. **No people.** Players are their stations at the counter: stool, dart rest, ADMIT ONE ticket, prize shelf. This
   removes the asset class that sank Killer. Nothing human appears anywhere: no hands throwing, no stallholder,
   no crowd figures. The crowd exists only as sound and distant bokeh.
3. **Duck colours.** The parade and hanging ducks are the classic glossy yellow bath duck (the bg photo, the
   genre). **Each player's prize ducks are in that player's colour**, so a glance at the shelves says who has won
   what. The tin bull ducks are gilt. All of them are one sculpt with a tint per instance, not separate models.
4. **No novelty accessories.** Players are told apart without colour by four things, all of which must work in
   greyscale:
   - their station's fixed position in the line;
   - their name on the ticket and on the marquee;
   - the active station's lit stool and ticket;
   - the HUD columns in the same order as the stations.

   Accessories would mean more sculpts going through the gate for little gain. Revisit only if the greyscale
   check fails at 6 players.

Also settled while making these:
- **One duck sculpt, chosen at Milestone 0.** Sean picks one of the 2–3 variants; it's the only organic mesh in the
  game, drawn instanced with LODs.
- **No live film clips beyond the winner clip** the platform already plays; Quackshot has no event clips.
- **The marquee's scores are a second display, not the source.** The DOM score columns are the truth the tests
  read; the marquee must match them (nothing lies).

---

## 10. Milestones (in order — **stop where marked, even if several are asked for at once**)

0. **The ducks. STOP for sign-off.**
   - Collect the reference.
   - Sculpt the rubber duck with the SDF pipeline, in **2–3 variants** (proportion and beak options).
   - Model the tin prize duck.
   - Deliver turnarounds (front, side, 3/4, back, top) at 1:1 in neutral studio light and in a rough blue-hour
     light, solid silhouettes, the reference overlay, and the written critique (§8).
   - Ask: **"Are these the ducks? Which one?"**
   - Also send one rough still of the target concept, so the concept is agreed before it's built.
1. **Greybox that plays the real game.**
   - Copy `quackshot-classic.html` and add the viewer switch.
   - Greybox target with exact beds, block stations, a marquee, capsule darts in exact beds, scores and duck counts,
     all driven by `demo.js` and by the real server through the kit's queue.
   - `quackshot.spec.cjs` (nothing lies, every phase, the dart-3 inner-single case, forged messages ignored, winner
     and draw text) and the bed unit test.
   - Run the full suite. **Show Sean the greybox playing.**
2. **Look-dev. STOP for sign-off.**
   - The stall, target materials, the signed-off ducks in place, bulbs, the fairground, blue-hour light, round-6
     escalation, judged on a running game.
   - Deliver 8 stills (master at rounds 1 and 6, bed close-up on the parade, outer bull, double bull, Ring of Fire,
     splash, winner), 1:1 crops of every hero, and a 20 s clip of a real visit.
   - Measure fps on the M1. Ask **"Is this the look?"**
3. **Set pieces:** parade knock and recovery, tin knockdowns and the flight to the shelf, the gold shower, the
   flame ring, water jets and splash, the round crane, intermission, winner, draw.
4. **Game flow and swap-in:**
   - The director's shot logic from state, with framing from bounds.
   - The HUD and the marquee.
   - Doubles naming checked through the real server.
   - Help, debug previews, 6 players with long names.
   - Swap in as `quackshot.html`.
5. **Sound** on the shared audio core.
6. **Polish, perf, verification:** a full-game video, a before/after image, CHANGELOG and the asset register.

---

**Added 2026-11-18 (Sean):** a **How to play** intro screen at the start of every game — how it works, how to
score, how to win. Shared across all 3D games; brief in [`GAME-INTROS-3D.md`](GAME-INTROS-3D.md). Built before M4.

## 11. Risks to check early

- **Board legibility vs the attractions:** parade ducks and flame jets sit *in front of* the beds and could hide
  where a dart is. Keep the ducks small relative to the ring, put the rail on the ring's inner edge, and make sure
  the dart is always the front-most object at its bed (the `bed` shot checks it).
- **An upright target from the counter:** the master must show the target, the marquee and six stations without the
  stations eating the frame. Block it in the greybox with 6 players before any art.
- **Instancing:** ~20 parade ducks, ~40 hanging ducks, prize shelves and hundreds of bulbs mean one sculpted duck
  mesh (with LODs) drawn instanced, and bulbs as instanced emissives with only a handful of real lights.
- **Water and fire cost:** the splash is a sprite sheet plus a few physics droplets, not a fluid sim; the flame
  ring reuses Limbo's `Flames`. Budget both on the M1 at Milestone 2.
- **Negative scores** in the marquee (red bulbs, a minus sign), and the round-6 ×2 labels ("−2 ×2").
- **Draws** are rare in the demo: force them with `__quackshotDemo.force('draw')` and test them.
- **Killer's own redo:** the Killer agents still need replacing (Sean's verdict). That's separate from this plan;
  when it's picked up, it should go through the same Milestone 0 gate.
