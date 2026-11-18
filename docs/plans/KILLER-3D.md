# Killer 3D — plan

Written 2026-11-17, after 3D Limbo reached a signed-off look and a playable simulated game ("It's great. Well
done."). **This file is the whole brief**: read it top to bottom before touching code. Its siblings are
[`LIMBO-3D.md`](LIMBO-3D.md) (and [`LIMBO-3D-STATUS.md`](LIMBO-3D-STATUS.md)) and [`DEMOLITION-3D.md`](DEMOLITION-3D.md).

---

## 0. In one paragraph — and what's different this time

Killer becomes **"The Ledger"**: a private club for professionals at the top of an art-deco tower on a rainy
night. The centrepiece is the game itself: **a giant marble-and-brass dartboard inlaid in the floor**. Every dart
lands in it exactly where it hit the real board, every player stands on their own contract number as a lacquered
agent piece, and their marks and lives are light filling the three bands of their wedge.

Four things change from Derby, Demolition and Limbo. Each comes from something Limbo taught us:

1. **Game first, look second.** Limbo's look was signed off on a scripted loop, and the real-game problems only
   showed up once the game was wired: cameras that framed the wrong thing for real darts, a slow TV falling
   behind the host, verdicts outliving the server's window. Killer starts with a **greybox that plays real state**
   (simulator, event queue, the nothing-lies test) and does look-dev on top of a running game.
2. **A shared 3D game kit.** About a third of Limbo is generic: the event queue with tails, reconcile and `truth()`;
   the wall-clock sub-stepping loop; the capture hooks; the HUD base; the full-game and moment review tools; the
   GPU-enabled Playwright pattern. Milestone 1 lifts these into `lib3d/` and `docs/plans/tools/`, so Killer (and
   every game after it) starts where Limbo finished.
3. **The board is the information.** Killer has the most state of any social game: target numbers, marks, killer
   status, lives, a round multiplier and a 12-round clock. The 3D world must carry it on its own, so that **a
   person across the bar can read the whole game from one overhead shot.** Spectacle comes second, and cameras
   always return to that master shot.
4. **The world's own moments, plus the film clips in video mode.** Every Killer moment gets an in-engine
   cinematic. When the venue's video mode is on, the existing clips (`became-charon`, `lost-excommunicado`,
   `elim-skyfall-take-the-shot`) still play over the 3D scene exactly as the 2D page plays them (Sean,
   2026-11-17: *"the film clips are fine to use"*).

---

## 1. The ask and the bar

- Sean: *"Plan out the 3D version of Killer, with the quality of these other projects… don't be afraid to think
  about how to improve significantly."*
- The bar: Demolition — look-dev *"fantastic"*; Limbo — *"Is this the look? Yes… well done"*, game *"It's great."*
  Derby's *"good, not excellent"* is the floor.
- Standing brief: Flight Club / Electric Shuffle quality, not a basic 2D arcade game; keep the original for
  before/after.

**Process rules** (from `~/.claude/CLAUDE.md`; these override older briefs):
- The main model writes all code: design, shaders, motion, cameras, HUD, audio, tests and the simulator. No
  code-writing subagents. Verbose output goes to `log-reader`, broad reading to `search`.
- Verify before saying done: tests, stills **and motion** (clips, filmstrips, full-game contact sheets).
- **Do not commit or push** unless Sean asks. Branch `feat/arcade-platform` carries his uncommitted 0.25.0 work
  and three 3D games.
- **Stop at Milestone 2 (look-dev) for Sean's sign-off.** Get a playable `?demo=1` in front of him as early as it's
  meaningful. With the greybox-first plan, that's the end of Milestone 1.
- Plan mode is proposed for multi-file changes; this plan is that proposal for the whole project.

---

## 2. Project facts

- Repo `~/flightdeck-fork`. Run `SCORING_MODE=mock PORT=4000 node src/server.js` (check `lsof -i :4000`; one is
  usually running) → `https://localhost:4000`.
- Rules: `src/engines/killer.js` (573 lines). Scheduler cases `killer_*` in `src/engines/index.js` ~711–785; debug
  preview builders ~1189–1210; generic video-delay switch at `src/server.js:1530`.
- The TV page is `public/games/killer.html` (2,083 lines). Its 220×220 SVG board sits centre, with players at the
  rim on their numbers, 3 segments per wedge, dart dots, a round tracker, text takeovers and the winner shards.
  It handles `round_announce, became_killer, lost_killer, death, mult_boost, mult_knock, intermission, winner,
  draw` (everything else clears the overlays). Assets: `public/assets/killer/{bg.jpg, ATTRIBUTION.txt}`. Shared
  scripts: `shared-player-theme`, `dart-callout`, `dart-announcer`, `event-videos`.
- Catalogue: `['killer', 'Killer', 'social', 2, 6]`. Tests: `tests/browser/arcade.spec.cjs:8` plays Killer to a
  winner through the server (it asserts the winner's name is in the TV's DOM text). There is no Killer-specific
  TV test.
- CSP: no CDNs. three r160 is vendored. Shared 3D code lives in `public/games/lib3d/`: engine (presets `day`,
  `night`, `dusk`), particles, reflection (+ `clip`, `guard`), beacons, physics, director.

### Lessons carried in from Limbo (do not repeat)

1. **Wall-clock pacing.** Simulate slow frames in sub-steps through the real elapsed time, or a weak TV falls
   behind the host. Limbo's `tick()` does this; it goes into the kit.
2. **Verdicts must fit the server's window.** Each event has designed durations, later beats run on as "tails",
   and every dart reacts at once.
3. **Read the verdict when the dart lands**, not after the TV settles. The server moves on in 3 s.
4. **Playwright needs the GPU flags** for a 3D page (`--enable-gpu --use-angle=metal --ignore-gpu-blocklist`),
   otherwise it renders in software at ~3 fps.
5. **New textures draw from `Math.random`** (three's uuids). Shared code must not create objects a game doesn't
   use, or seeded regression captures drift.
6. **Feedback loops.** A material that samples a render target can't be drawn into it: use the reflection's `guard`.
7. **Cameras need the subject in frame for real data.** Choose shots from the state (gap, distance, who's
   involved), never by dart index alone.
8. **Out-of-focus tiny hot points show as squares** (box-blur DOF). Keep embers and rain glints dim, or stop the
   aperture down.
9. Demolition's lessons still apply: designed durations, not physics; occlusion fallback; lift the lens over
   props; clamp every `pow`/`sqrt`/`log`; quiet backgrounds; haze in the sky's colour family; judge in motion; run
   the tests at every milestone end.

---

## 3. Killer rules — the exact state contract

Source: `src/engines/killer.js`, `src/engines/index.js` killer cases, `src/engines/core.js`.

**Players** (2–6): `{id, name, avatar, targetNumber, lives, killerMarks, isKiller}`. Targets come from
`generateDegreeSpacedTargets` (spread evenly round the wheel, random rotation). `lives` starts at 3, `killerMarks`
at 0. **Out = `lives < 0`** (−1); 0 is still alive. Doubles: one entity per team with `members[]`;
`isDoublesLineup` and `throwerIndices[]` say who is throwing (use the server's naming helpers, as Limbo does).

**Rounds**: `currentRound` runs 1 to 12 (`KILLER_MAX_ROUNDS`). The round multiplier is **×1 in rounds 1–6, ×2 in
7–9, ×3 in 10–12**. A round ends when play wraps past the last alive player.

**A dart** (`handleKillerThrow`; only in phase `playing`):
- `multiplier = dartMultiplier × roundMultiplier`. `lastThrow = {hitNumber, effect: 'miss'|'mark'|'strike',
  miss, number, multiplier, dartMultiplier, roundMultiplier, sector?}`.
- **Not yet a killer, hits own number**: `killerMarks += multiplier` (capped at 3); `effect: 'mark'`,
  `markSegments[]` (the segment indices that filled). At 3 → `isKiller = true`, `lives = 3`, phase
  **`became_killer`** `{playerId, playerName, avatar, targetNumber}`.
- **A killer hits someone else's number** (alive): `effect: 'strike'`, `victimId`, `strikeSegments[]` (emptied,
  top down), `strikeSegment`.
  - Victim is a killer: `lives −= multiplier`. If they end at 0–2 they lose killer status: `killerMarks = lives`,
    phase **`lost_killer`** `{playerId, playerName, avatar, attackerName, targetNumber, livesRemaining}`.
  - Victim isn't a killer and has marks: marks drop by the multiplier. If the multiplier exceeds their marks they
    are out (`lives = −1`), otherwise `lives = marks`.
  - Victim isn't a killer and has no marks: out.
  - Out → phase **`death`** `{attackerId, attackerName, victimId, victimName, victimAvatar, hitNumber}`.
- **A true double/treble** (dartMultiplier ≥ 2) that marked → **`mult_boost`** `{playerName, avatar, multiplier,
  steps, quip, targetNumber}`. One that struck → **`mult_knock`** `{playerName (the victim), avatar, actorName,
  multiplier, steps, quip, targetNumber}`.
- Anything else (a miss, someone else's number while not a killer, own number as a killer) → no phase; continue.

**Timing** (the windows the view must fit):

| After | Server waits | Then |
|---|---|---|
| mark / strike with an overlay phase | `count × 900 + 150` ms (wedge animation) **+ 3000** ms (or with video mode on: became 5500, death 5500, lost 5200) | `killer_resume_playing`, or the intermission chain after dart 3 |
| a plain dart, darts 1–2 | nothing | phase stays `playing` |
| dart 3, no overlay | 600 ms | `killer_show_intermission` |
| intermission chain | `round_announce` 3000 ms if the round wraps → `intermission` 2500 ms (`nextPlayerName, targetNumber, avatar`) → `playing` | |
| `death` | as above → `killer_after_elimination`: `playing`; 1 alive → 900 ms → `winner` | |
| last wrap of round 12 | `killer_resolve_match` → `winner` (reason `last_standing` / `sole_killer` / `wedges`) or **`draw`** `{contenders[], reason: 'killers'/'wedges'}` | |

- **Video mode** (`gameState.viewerVideoEnabled`) lengthens the windows (`server.js:1530`). With it on, the 3D
  page plays the existing clip over the scene the way the 2D page does (`FlightDeckWinnerVideo` / `event-videos.js`,
  `video.fd-event-video`), with the in-engine moment running underneath and resolving as the clip ends. With it off,
  only the in-engine moment plays, fitted to the shorter window.
- Detect a dart by `(activeIdx, throwsThisTurn)` going up; read its outcome from `lastThrow` and the phase **in the
  same state**. Never drop or reorder darts.
- Debug previews (`DEBUG_SHOW_SCREEN`) can force `became_killer` / `lost_killer` / `death` / others with made-up
  data, and the view must accept them without corrupting the board.
- Known quirks, not in scope (just don't trip on them): `aimNumber` filters `lives > 0`, so bots never aim at a
  marked-down 0-life player, and it reads `p.eliminated`, which is never set.

---

## 4. Creative direction — "The Ledger"

An original world in the noir-assassin genre: no film names, logos, characters or quotes. It's a members' club on
the 66th floor at 1 a.m., with rain streaming down a wall of glass and the city a sea of bokeh below. Art-deco: black
marble, brass inlay, oxblood velvet, frosted-glass sconces, a coffered ceiling. It is the fourth mood in the set:
Derby's golden afternoon, Demolition's industrial night, Limbo's lagoon dusk, Killer's **noir interior**.

- **Light**: low-key and hard. Pools from brass pendant lamps; a cool city glow through the rain on the glass
  (animated rain-streak normal map, refraction-lite); warm practicals; **crimson is reserved for killers**.
  Player colours are the only other saturation.
- **The Board** (the hero, 9 m across, inlaid in the floor): black and cream marble beds, brass wires,
  red/green-lacquer doubles and trebles in deep enamel, a gold number ring that is the brightest thing in the room,
  and the bull a polished brass boss. Planar reflection on the polished floor (lib3d `Reflection`, low roughness
  on the marble, higher on the enamel).
- **The darts**: each landed dart arrives as a 1.2 m brass-and-tungsten dart with flights in the thrower's colour.
  It's thrown in from off-camera along a believable arc and sticks **in the exact bed it hit** (number, single
  inner/outer, double, treble, bull, from `lastThrow.number/multiplier/sector`). The three darts of a visit stay
  in until the visit ends, then rise out and fade. A miss hits the dark outer ring and skitters.
- **The agents** (one per player, at the rim on their own number): tall lathe-turned **chess-piece silhouettes**
  (organic modelling is banned; turned pieces are hard-surface, elegant and iconic) lacquered in the team colour
  with gold collars. **Each player index gets a different crown silhouette** (crescent, spike, tri-blade, ring,
  arrow, square), so players can be told apart without relying on colour, which matters for colour-blind guests.
  Avatar on a disc set in the base (the Limbo shield code). Name on a brass plate at the rim.
- **Marks and lives**: each wedge's three bands are segments. A mark floods its band with light in the player's
  colour, running from the rim inward (900 ms each, the server's beat). As a **killer** the wedge's light turns
  crimson-gold, a crimson ring ignites at the agent's base, the crown sprouts a thin blade of light, and the
  brass number on the ring flips to crimson. Lives are the same three bands.
- **Struck**: the strike segment cracks; the light drains out of it like ink back down the brass channels and it
  goes black. The agent recoils on its base.
- **Death**: the agent **shatters** into pre-fractured chunks (lib3d `World`; real rigid bodies, given a designed
  push), the chunks skitter across the marble, and a red ledger line is drawn across their wedge, which stays dark
  for the rest of the game.
- **Escalation** (the round multiplier, Killer's "heat"): rounds 1–6 calm, 7–9 **×2** (the pendant lamps swing
  amber, the rain heavier, a slow lightning flicker over the city), 10–12 **×3** (red emergency wash on the
  ceiling, rain lashing the glass, the HUD ticker in crimson). The music tempo follows (§6).
- **Background**: the city through rain is the backdrop. Keep it quiet: defocused, low contrast, cool. Don't let
  the skyline compete with the board (the Demolition lesson). Reuse Demolition's skyline + beacons, re-lit for rain.

### The moments

Every dart: **throw-in → impact (hit-stop) → result → settle**, scaled by multiplier.

| Moment | Visual | Fits |
|---|---|---|
| Visit start (intermission) | The active agent's lamp swings onto them; the camera pushes in; a brass ledger card slides out with their number | 2.5 s |
| Dart: miss / no effect | The dart sticks (or skitters off the outer ring); a small spark | instant |
| Dart: mark | The dart lands in their own number; their band floods with their colour, rim to centre | 900 ms per segment |
| ×2 / ×3 mark (`mult_boost`) | The flood surges, gold sparks run the brass wires, "×3 · +3" stamp | + overlay |
| **Became killer** | The wedge turns crimson-gold in a ripple round the brass; the crown's blade ignites; the crimson ring lights; a slow orbit under a single top light; "KILLER" | 3.0 s (5.5 s video mode) |
| Strike | The killer's dart lands in the victim's number; that segment cracks and drains; the victim agent recoils; tracer-light runs from the killer's agent along the brass to the victim | 900 ms per segment |
| ×2 / ×3 strike (`mult_knock`) | Several segments crack in a chain; shake | + overlay |
| **Lost killer** | The crown's blade snaps and falls; the crimson ring gutters out; the wedge cools to their colour; "STRIPPED" | 3.0 s (5.2 s) |
| **Death** | Dart-cam into the wedge → the agent shatters → the red ledger line is drawn across the wedge; the lamp over them goes out | 3.0 s (5.5 s) |
| Round announce | Overhead pull-back over the whole board; a deco title card "CONTRACT ROUND 7 · DOUBLE MARKS" (the 2D page's own wording); the room's light shifts to the new escalation level | 3.0 s |
| Winner | Every lamp swings onto the winner; their agent rises on a column out of the board; gold leaf rains down; the city lights flare behind the glass | until next game |
| Draw | The contenders' agents rise together, half-lit; "A DRAW" with each name as DOM text | until next game |

**Cameras** (lib3d `ShotDirector` subclass): `master` (overhead at ~60°, the whole board readable — **the default
the director always returns to**), `agent` (low, on the active agent with the board behind), `dartcam` (rides the
dart in to its bed), `wedge` (tight on a wedge's segments), `strike` (from behind the killer's agent, along the
tracer to the victim), `death` (low on the shattering agent), `orbit` (became killer / winner), `round` (high
pull-back). Shots are chosen from the state: who's involved, which wedge, distance. Use the occlusion fallback
(agents as cylinders) and per-shot DOF, with the city always in bokeh.

**HUD** (deco ledger style: black lacquer, gold rules, a condensed serif display face plus the condensed sans
used elsewhere; everything typed by players goes in via `textContent`):
- **Thrower card** (top centre): avatar, name (team under it in doubles), their number in a brass roundel, status
  (MARKS 2/3 or KILLER · LIVES 3), three dart pips that show what each dart did (S17 · MARK · STRIKE ×2 · MISS).
- **Round tracker** (top left): 12 pips in three groups (1–6 · 7–9 ×2 · 10–12 ×3), the current one lit, and the
  multiplier tag.
- **Ledger strip** (bottom): one card per player with avatar, name, number, three segment pips, a KILLER tag, and
  struck through with a red line when out.
- **Title cards**: KILLER / STRIPPED / ELIMINATED / ×3 MARKED / ×2 KNOCKED / CONTRACT ROUND N / UP NEXT / WINNER /
  A DRAW. Names are DOM text, so `arcade.spec.cjs`'s winner check keeps passing.
- The help overlay (`helpVisible`), reusing the 2D page's rules text.

---

## 5. What the 2D page does that the 3D page must keep

- The message handler checks `origin === location.origin && source === window.parent`.
- Phase de-duplication by `type + startedAt`.
- Wedge animations take exactly 900 ms per segment, sequenced (the server's wait assumes it).
- The intermission's "UP NEXT" with the next thrower's number.
- Doubles: duo avatars and the current thrower named.
- The winner/draw screen with the winner's name as text (the existing browser test reads it).
- `?layoutTest=all` (20 mock players) is the 2D page's layout check. The 3D equivalent is `?demo=1&players=6`
  plus long names.

---

## 6. Sound (designed with the visuals, built on the Limbo engine)

The Limbo sound engine is built but parked ([`LIMBO-3D-SOUND.md`](LIMBO-3D-SOUND.md)): the low end needs fixing,
plus a by-ear pass. **Finish that first**, then lift its core into `lib3d/audio.js`: buses, reverb, limiter,
the voices (pan/marimba/drum/noise/tone), crowd voices, ducking under the announcer, the unlock pill, the offline
sound reel and stems. Killer brings its own palette:

- **Room**: rain on glass (filtered noise with individual drop ticks), distant thunder at ×2 and ×3, the hum of the
  city, a low murmur of the club, a clock ticking under the round announce.
- **Music**: a noir lounge cue (upright bass walk, brushed snare, muted trumpet stabs, vibraphone). It tightens
  and quickens with the round multiplier, drops to bass and ticking for the last round, and ducks under every
  moment and the announcer.
- **Moments**: dart thunk into marble (pitch by bed), brass ring for a mark plus a rising vibraphone note per
  segment, a deep bell and orchestral hit for became killer, glass-crack plus a falling brass note for a strike, a
  porcelain shatter plus a low string sting for death, a blade snap for lost killer, a typewriter stamp for the
  round card, applause and a big-band hit for the winner.
- Measure every milestone with the sound reel (loudness, peak, stems, spectrogram) **and** listen by ear.

---

## 7. File plan

```
public/games/killer-classic.html          ← exact copy of current killer.html (FIRST)
public/games/lib3d/kit/
  queue.js        StateQueue: diff → timed events with tails; reconcile(); truth()  (from limbo/game.js)
  loop.js         wall-clock sub-stepping frame loop + ?capture=1 + window.__<game>.step   (from limbo/main.js)
  hud.css/js      shared HUD pieces (cards, pips, title-card slam, help overlay, avatarEl, initials)
  demo.js         demo harness: seeded RNG, later(), force(kind), set(), loop/speed/seed params
public/games/lib3d/audio.js                ← after Limbo's mix is finished (§6)
public/games/killer/
  main.js  room.js  board.js  agents.js  darts.js  fx.js  director.js  hud.js  game.js  demo.js  audio.js
public/games/killer.html                   ← the 3D shell once it plays the real game (the classic stays reachable)
public/viewer.html                         ← add killer to the classic switch
docs/plans/tools/fullgame.cjs, moments.cjs ← generic (GLOBAL/DEMO env), from Limbo's scratch scripts
tests/browser/killer.spec.cjs              ← Killer on the TV: nothing lies, every phase, winner/draw text
docs/plans/KILLER-3D-STATUS.md             ← progress, kept current
CHANGELOG.md, docs/ASSET-REGISTER.md
```

Limbo then moves onto the kit (its `game.js` keeps only its events). **Verify Limbo and Demolition are unchanged**
with the seeded fixed-step baseline (pixel-identical frames 240/420/600) and the Limbo TV test.

---

## 8. Decisions for Sean (before or during Milestone 1)

1. ~~The film clips~~ **Decided 2026-11-17: keep them.** The 3D page plays them in video mode (§3); the world itself
   still uses original names.
2. **Theme confirmation**: the noir members'-club setting, with "The Ledger" as a working name.
3. **Sound order**: finish Limbo's sound before Killer's (recommended: it builds the shared audio core).

---

## 9. Milestones (in order — stop where marked)

1. **Kit + greybox that plays the real game.**
   - Copy `killer-classic.html` and add the viewer switch.
   - Lift the kit out of Limbo, re-point Limbo at it, and prove Limbo and Demolition are unchanged.
   - Killer greybox: flat-shaded board with correct geometry (number ring, every bed), capsule agents, stick darts
     in the exact beds, wedge-segment fills, killer and out states, all driven by `demo.js` and by the real server
     through the queue.
   - `killer.spec.cjs` (nothing lies: segments = marks/lives, killer flags, outs, darts in the right beds, the
     round number; winner/draw text; forged messages ignored; no TV errors).
   - Run the full suite. **Show Sean the greybox playing a simulated game.**
2. **Look-dev — STOP for sign-off.** The room, rain, city, board materials, agents with their crown silhouettes,
   darts, lighting and the three escalation levels, judged **on a running simulated game**. Deliver 8 stills
   (master at rounds 1, 8 and 11, agent, dartcam, wedge fill, became-killer orbit, death) and a 20 s fixed-step clip
   of a real visit with a mark, a strike and a death. Ask "Is this the look?"
3. **Set pieces**: mark flood, ×2/×3, became killer, strike tracer, crack, lost killer, death shatter + ledger line,
   round announce + escalation shift, intermission, winner, draw, both timing modes.
4. **Game flow and swap-in**: the director's shot logic from state, the HUD, doubles naming checked against the
   real server, help, debug previews, video-mode windows, 6 players with long names. Swap in as `killer.html`.
5. **Sound** (on the shared audio core): the room, the music, the moments; reel, stems, by-ear pass.
6. **Polish, perf, verification**: 60 fps at 1080p **in real Chrome on the M1** (measured at Milestone 2 as well,
   not only at the end), `?quality=low`, a full-game video, before/after image, CHANGELOG + asset register.

## 10. Quality gates

- **Readable from across a bar**: one overhead frame shows every player's number, marks/lives, killer status and
  who's out. Check it at 2, 4 and 6 players by viewing a 1080p still downscaled to a phone-sized thumbnail.
- **Nothing lies** (automated, through the server): once settled, each wedge's lit segments equal
  `killerMarks` (or `lives` for a killer), each `isKiller` is shown, each out player is shattered and struck
  through, the dart count matches `throwsThisTurn`, and each dart sits in its bed.
- Every dart visibly reacts within 100 ms of the state arriving; wedge animations finish inside the server's
  900 ms beat; every overlay moment fits its window in **both** video-mode settings.
- Players are distinguishable without colour (crown silhouettes + numbers).
- No camera clipping or occlusion; no HUD overlap at 6 players with "Christopher & Maximilian".
- 60 fps at 1080p in real Chrome on the M1; `?quality=low` holds 60.
- `npm test`, `npm run check`, `npx playwright test` pass at every milestone end; no console errors.
- Every moment reviewed in motion (clip and full-game contact sheet), not only stills.

## 11. Risks to check early

- **Board legibility vs drama**: a 9 m floor board seen from a low cinematic angle is unreadable. That's why the
  master shot is the default and the moments are short excursions from it.
- **Wedge geometry has to be exact**: the real board's bed radii, the 18° wedges and the wheel order
  (`DARTBOARD_WHEEL`). Put the dart position maths and its unit test in the kit; the classic page and any future
  darts game can reuse them.
- **Shatter cost**: pre-fracture each agent once (8–14 chunks); cap the active bodies; bake the settled chunks.
- **Rain on glass plus reflection plus shadows**: budget at Milestone 2 on the M1, not at the end. Rain is a cheap
  screen-space normal map on a single glass plane, not particles.
- **Draws** (the 12-round limit) are rare in the demo. Force them with `__killerDemo.force('draw')` and test them.
- **Kit extraction regressions**: run the seeded baselines and the Limbo TV test straight after the lift.
