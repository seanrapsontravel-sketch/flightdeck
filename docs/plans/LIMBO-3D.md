# Limbo 3D — handoff plan

Written 2026-11-17, after 3D Demolition reached signed-off look-dev plus a playable simulated game. **This file is
the whole brief**: read it top to bottom before touching code. Demolition's status lives in
[`DEMOLITION-3D-STATUS.md`](DEMOLITION-3D-STATUS.md); its brief, [`DEMOLITION-3D.md`](DEMOLITION-3D.md), is the
template this one follows.

---

## 1. The ask

- Sean: *"Create a plan for Limbo. I want the quality as good as Demolition."*
- Demolition's verdicts set the bar: look-dev — *"The look is fantastic"*; overall — *"You've done a great job."*
  Derby's — *"good, not excellent"* — is the floor to stay well clear of.
- Standing brief (from Derby, still applies): visually stunning, worthy of a premium bar like Flight Club or
  Electric Shuffle, not a basic 2D arcade game. Keep a copy of the original for before/after.

**Process rules** (from `~/.claude/CLAUDE.md` and the Demolition brief):
- Opus does all design, shader, motion, camera, HUD, audio and polish work. Sonnet subagents only for the
  well-scoped chores in §10. Verbose output → `log-reader`; broad code search → `search`.
- Verify before saying done: tests, screenshots, and **motion** (filmstrips / clips), not stills alone.
- **Do not commit or push** unless Sean asks. Branch `feat/arcade-platform` carries Sean's uncommitted 0.25.0 work,
  the 3D Derby and the 3D Demolition.
- **Stop at look-dev (Milestone 2) for Sean's sign-off** before building the rest.
- Sean prefers seeing it working early: after sign-off, get a playable `?demo=1` on screen before the long tail.

---

## 2. Project facts

- Repo `~/flightdeck-fork`; run `cd ~/flightdeck-fork && SCORING_MODE=mock PORT=4000 node src/server.js` →
  `https://localhost:4000` (check `lsof -i :4000` first; one is usually already running).
- **Server owns rules** (`src/engines/limbo.js`, scheduler cases `limbo_*` in `src/engines/index.js` ~694–708).
  The TV page `public/viewer.html` iframes `public/games/<id>.html` and posts `{type:'SYNC_STATE', state}`; the game
  checks `event.origin === location.origin && event.source === window.parent` and reads `state.gameData`.
- CSP: `script-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:` — no CDNs. three r160 is
  vendored (`/vendor/three-0.160.0/three.module.min.js`, importmap).
- Catalogue: `['limbo', 'Limbo', 'social', 2, 6]` (`src/catalogue.js:4`). **No browser test covers Limbo today.**
- Checks: `npm test`, `npm run check`, `npx playwright test`.
- Current 2D view: `public/games/limbo.html` (~1,230 lines): two cartoon dinosaurs hold the limbo pole (the bar);
  a pink line for the running total climbs toward it; hearts beside avatars are lives; full-screen takeover cards
  for clears and burns; bunting. Assets: `public/assets/limbo/{bg.jpg, dino-blue.png, dino-red.png}`.

### What 3D Demolition built that Limbo reuses

- `public/games/lib3d/engine.js` — renderer, HDR bloom, AgX grade, DOF (with the optional `dof.far` level), haze,
  shadows, dynamic DPR, `prePasses` hook, presets via `PRESETS` / `withPreset()`.
- `public/games/lib3d/particles.js` — `Pool` (kinds: hard, puff, confetti, glow, **streak**).
- Demolition modules to lift into `lib3d/` in Milestone 1 (they're generic): the planar reflection
  (`Reflection` in `demolition/yard.js`), `Beacons`, the trauma-shake + occlusion-fallback + clearance parts of
  `demolition/director.js`, and the rigid-body `World` in `demolition/physics.js` (for toppling totems and
  fracture).
- `docs/plans/tools/dcap.cjs` — headless capture: fixed-step frames (`?capture=1` + `window.__<game>.step(n, dt)`),
  stills, and mp4 clips via ffmpeg. `docs/plans/tools/sheet.py` — contact sheets.
- Patterns that worked: towers laid out from the score and reconciled every frame (here: ball height and bar height
  from state); a `demo.js` simulator emitting real `gameData`; a HUD in DOM with `textContent` for names.

### Lessons from Demolition — do not repeat

1. **Motion speed must not scale with geometry.** The first wrecking-ball swing hit at 60 m/s because the pendulum
   length was 15 m; fixed by normalising the swing time. Every Limbo motion (ball launch, bar drop) gets a
   designed duration, not "whatever the physics gives".
2. **Neighbours occlude cameras in an arc.** Build the occlusion check + shot fallback in from day one.
3. **Props near low cameras.** Rubble filled low shots; the director now lifts the lens clear. Same for sand,
   palms, torches here.
4. **NaNs go black and spread through bloom.** `pow()` of a slightly negative value in a beam shader painted black
   arcs across the frame. Clamp every `pow`/`sqrt`/`log` base in custom shaders.
5. **Backgrounds get loud.** The skyline started as a wall of windows competing with the towers. Keep the backdrop
   quiet: hazy, defocused, low contrast; the hero objects and team colours carry the frame.
6. **Haze turns to smog.** Brown inscatter flattened the wide shots. Start haze far out and keep its colour in
   the sky's family.
7. **Judge in motion with fixed-step capture.** Headless runs at ~45–55 fps; record with `?capture=1`.
8. **Run the test suite at every milestone end** — Demolition deferred tests twice and ended with one unresolved
   Playwright failure (X01 card click, passed alone).

---

## 3. Limbo rules — exact state contract

Source: `src/engines/limbo.js`, scheduler `limbo_after_life_loss` / `limbo_after_bar` / `limbo_winner` in
`src/engines/index.js`, debug preview in `src/server.js` ~3014.

- **Players**: 2–6, each `{id, name, avatar, lives}` with `lives: 3`. Doubles: `initDoubles` builds one scoring
  entity per team (`buildDoublesPlayerRoster`); `isDoublesLineup`, `throwerIndices[]` say which member is throwing
  (display names via the server's doubles helpers — mirror `limbo.html`).
- **The bar**: `currentTargetBar` starts at **60**. A visit is three darts; their total
  (`currentRunningTotal`) must finish **at or under** the bar.
  - Finish **under** → bar drops to your total: phase `bar_status` `{mode:'clear', barValue: newBar, headline,
    badge, playerId, playerName, avatar}`.
  - Finish **exactly on** it → bar holds: `bar_status` `{mode:'hold', barValue: bar}`; `lastThrow.matchedBar = true`.
  - Go **over** → lose a life: phase `life_loss` `{playerId, playerName, avatar, livesBefore, eliminated, members}`;
    `lastThrow.lifeLost = true`; if the total went over, it's clamped to the bar and `lastThrow.hitBar = true`.
  - **Early bust**: a life is lost as soon as the remaining darts can't fit, assuming at least 1 point each
    (`total + dartsLeft > bar`). A burn can happen on dart 1, 2 or 3.
- **A miss scores 25** (`throwSpec.miss → 25`). Miss is a big penalty in Limbo, not a free dart.
- `lastThrow`: `{score, hitBar, lifeLost, miss, number, multiplier, matchedBar?}`; reset to `null` at turn start.
- **After a life loss the bar resets to 60** (`limbo_after_life_loss`), then the next player still alive throws.
  After a clear/hold the bar stays where it is and the next alive player throws.
- Both `life_loss` and `bar_status` last `OVERLAY_EVENT_MS` = **3000 ms**, then the turn advances
  (`throwsThisTurn = 0`, `currentRunningTotal = 0`, `phase = playing`, `lastThrow = null`).
- **Winner**: when one player has lives left, 3000 ms after the final `life_loss` → phase `winner`
  `{winnerId, winnerName, avatar, members, avatars}`. **Render `winnerName` as DOM text.**
- **No TV Moment**, no round structure, no intermission phase (the next thrower appears with the `playing` state).
- **Timing**: there is no animation delay on Limbo throws. Darts arrive at the player's pace, and dart 3 (or a
  busting dart) arrives **in the same state** as its verdict phase. The view must queue: play the dart's rise
  first, then the verdict, inside the 3000 ms window. Never drop or reorder darts.
- Detect a new dart by `(activeIdx, throwsThisTurn, currentRunningTotal)` changing; read the value from
  `lastThrow.score` (and `miss`).
- **Debug previews** (`DEBUG_SHOW_SCREEN`) can force any phase, and a forced `bar_status` sets the bar directly with
  `currentRunningTotal = 0`. The view must accept jumps without animating nonsense.
- Bot aim numbers `[2, 3, 5]`: simulated games play low, so bars get very low (3–10). Low bars are the climax and
  must read well.

---

## 4. Creative direction — "Limbo Lagoon"

A tropical beach party at **blue hour**, the sun just gone under the sea. Stylised, chunky, toy-like geometry lit
like a film; the stylised-tropical reference Sean liked for Derby lands squarely here. It is deliberately the third
mood in the set: Derby is a golden afternoon, Demolition an industrial night, Limbo a lagoon at dusk.

- **Sky**: deep cobalt overhead → violet → a hot coral-orange band on the horizon where the sun went down; first
  stars; a thin crescent moon. Procedural, in the Demolition night-sky style, plus a sun-glow lobe.
- **Sea**: a calm lagoon, glassy with long reflections of the sky band, the burning bar and the torches (planar
  reflection from `lib3d`, sea-surface ripple normals, fresnel, a soft foam line at the shore). Wet sand at the
  waterline is a darker, mirror-ish band (the Demolition wet-asphalt trick).
- **Set**: pale sand in blue shadow; a wooden deck stage at the water's edge for the limbo rig; low-poly palms
  (faceted, smooth-shaded, gentle wind sway); tiki torches everywhere (real flame shader + a few true lights); string
  lanterns and the 2D version's bunting; a thatched beach bar with warm windows; an outrigger canoe; rocks; a
  distant island silhouette with a faint volcano glow; a lighthouse beam sweeping slowly across the haze.
- **Palette**: environment cool and desaturated (blue sand, deep teal palms, violet sky); warm practicals (fire,
  lanterns); **player colours are the only other saturated colours**, carried by emissive and lacquered surfaces.
- **No characters.** Organic models hit Derby's ceiling. Everything here is hard-surface or stylised-geometric:
  carved totems, tiki masks as geometric inlays, palms as faceted rings and bent planes.

### The limbo rig (hero object, centre stage)

- **Two carved tiki posts**, ~7.5 m, stacked geometric faces with glowing glyph markers every 10 points on their
  inner faces. **Height scale: 1 point = 10 cm**, so the bar at 60 is 6 m above the deck. It's linear and exact.
- **The bar**: a thick bamboo pole **on fire** along its length (layered flame-ribbon shader + embers + a moving,
  flickering point light), held in bronze ratchet clamps. When it drops, the clamps clunk down the posts tooth by
  tooth while a big carved number plaque on the pole counts down. A reset to 60 runs the ratchet back up, fast.
- **Heat**: `heat = (60 − bar) / 57`. The lower the bar, the bigger the flames, the brighter the embers, the faster
  the drums, the tighter the cameras. The whole beach escalates as the game goes on.

### The players

- **Totems**: each player has a 2.5 m carved totem lacquered in their colour on a stone plinth, in a shallow arc on
  the sand either side of the rig (2–6). Their avatar sits on a shield at the top (initials if none) and their
  name is on a carved sign that lights up.
- **Lives = three tiki torches** in front of the totem. A life lost snuffs one torch (a smoke wisp, the flame
  shrinks to an ember and dies).
- **The limbo ball**: the thrower's token. A big glossy sphere in their colour with a gold band and their avatar
  inset. At the start of a visit it leaps from their totem to the rig and settles at the deck (total 0).

---

## 5. The moments

The structure of every dart: **anticipation → launch → hit-stop → camera kick → settle**, scaled to the score.

| Moment | Visual | Audio |
|---|---|---|
| Visit start | Spotlight finds the thrower's totem; the ball leaps from it to the rig | drum roll, whoosh |
| Dart lands | The ball crouches (squash), launches up by score×10 cm with overshoot and settle; a glowing trail; the gap to the bar shrinks | tiki drum hit, steel-pan pluck pitched by height |
| Close to the bar | Flames lean toward the ball, heat shimmer, embers fall on it; camera goes low looking up | crackle swells, tension drone |
| No room (early bust) | The ghost markers for the remaining darts (1 point each) pile above the ball and pierce the flames | warning stab |
| Miss (+25) | A coconut drops from the nearest palm, bonks the ball, and it pops up 25 points — funny, quick | bonk, slide whistle |
| **Burned** (over the bar) | The ball slams into the burning bar: fireball, the bamboo flexes, embers rain, the ball drops trailing smoke; one of the player's torches is snuffed | fireball, crowd groan, conch horn |
| **Out** (last life) | Final torch out, totem's eyes go dark, the totem topples into the sand (rigid body); the ball cracks into chunks and rolls into the surf | timber crack, splash, low gong |
| Bar resets to 60 | Ratchet clamps run the burning bar back up fast; heat drops | ratchet whirr, whoosh |
| **Cleared** | After dart 3 the ball does the limbo — dips under the bar in an arc, out toward the sea, splashes; the bar clunks down to the ball's height tooth by tooth; flames roar bigger | cheer, ratchet clunks, splash |
| **Bar holds** (exact) | The ball rises to exactly touch the bar: slow-mo kiss, a ring of sparks, the bar shudders and holds | metallic ting, gasp then cheer |
| Winner | Every torch on the beach relights in the winner's colour; fireworks over the lagoon (and in its reflection); the winner's totem rises on its plinth; flower-petal confetti | fanfare sting, crowd |

**Camera director** (Demolition pattern, with occlusion fallback and clearance from the start): `establish` (slow
crane along the beach), `totem` (push in on the thrower), `rig` (front, the whole bar and ball), `low` (ground level
looking up the posts at the flames; used near the bar and at low bars), `gap` (tight on the space between ball and
bar), `limbo` (tracking the ball under the bar), `burn`, `out` (on the toppling totem), `winner` (orbit). Shots
tighten with heat. Per-shot DOF; the lagoon and horizon fall into bokeh.

**HUD** (bespoke "tiki-pop" kinetic type; carved wood + neon edge, team colour accents):
- **The bar plaque** (top left): big number that ratchets down/up with the 3D bar.
- **Thrower card** (top centre): avatar, name, three dart pips (score; MISS shows +25), total vs bar, and the
  *room* left: "24 TO SPARE · 2 DARTS".
- **Lives strip** (bottom): one card per player with three flame icons; out players greyed with OUT.
- **Title cards** with slam-in type: CLEARED · BAR DROPS TO 29 / BAR HOLDS / BURNED! / OUT! / BAR RESET 60 /
  WINNER (winner name as DOM text).
- Help overlay (`helpVisible`). Avatars only from `data:image`, `/`, or `http` (copy Derby `hud.js` `avatarEl`);
  all names via `textContent`.

**Audio** (procedural Web Audio, no files except the shared `winner-cheers.mp3`): surf (filtered noise swells),
fire crackle, tiki drums (sine thump + noise), steel-pan plucks (FM bell), launch whoosh, ratchet clunks, fireball,
splash, coconut bonk, conch horn, crowd cheer/groan (formant-filtered noise), and a calypso groove (shaker + pan
motif) whose tempo and density follow `heat`. Duck under the announcer; `?sound=0`; reuse the `dart-announcer.js`
unlock; check `venueConfig` gating.

---

## 6. File plan

```
public/games/limbo-classic.html        ← exact copy of current limbo.html (do this FIRST)
public/games/limbo-3d.html             ← look-dev / demo shell until it plays the real game, then becomes limbo.html
public/games/lib3d/reflection.js       ← planar reflection lifted out of demolition/yard.js (Demolition imports it)
public/games/lib3d/beacons.js          ← if needed (aircraft lights → lantern/firefly sprites)
public/games/lib3d/physics.js          ← rigid-body World lifted out of demolition/physics.js (Demolition imports it)
public/games/lib3d/director.js         ← shot base: damping, trauma shake, occlusion fallback, prop clearance
public/games/limbo/
  main.js      boot, message listener, ?demo, ?capture, frame loop, window.__limbo
  beach.js     sky, sea, sand, palms, torches, lanterns, beach bar, island, lighthouse
  rig.js       tiki posts, burning bar, ratchet clamps, height glyphs, plaque, heat
  totem.js     player totems, plinths, name signs, avatar shields, life torches, topple
  ball.js      the limbo ball: launch/settle motion, trail, squash, limbo arc, burn, crack
  fire.js      flame-ribbon shader, torch flames, embers, smoke (on lib3d/particles)
  fx.js        fireballs, sparks, splashes, petals, fireworks
  director.js  Limbo shots on lib3d/director.js
  hud.js       bar plaque, thrower card, lives strip, title cards, help
  audio.js     procedural sound bank + groove + mixer
  game.js      state sync: diff gameData → event queue → rig/ball/totems/director/hud/audio
  demo.js      simulator (§3 rules exactly), window.__limboDemo with set()/force()
public/viewer.html                     ← add limbo to the classic switch (the regex at the ?classic= block)
tests/browser/…                        ← Limbo on the TV (no coverage today)
CHANGELOG.md, docs/ASSET-REGISTER.md   ← entries
docs/plans/LIMBO-3D-STATUS.md          ← progress tracker, kept current (Demolition-style)
```

## 7. Milestones (in order — stop where marked)

1. **Foundation.** Copy `limbo.html` → `limbo-classic.html`; add `limbo` to the viewer classic switch. Lift the
   reflection, physics and director base into `lib3d/` and point Demolition at them. Add a `dusk` preset to
   `lib3d/engine.js`. Verify Demolition and Derby unchanged: runtime light/grade values plus screenshots. Diff
   against run-to-run noise: a live demo differs 4–28% between two runs of identical code. Run `npm test`,
   `npm run check`, `npx playwright test`.
2. **Look-dev — STOP for Sean's sign-off.** Beach, sky, sea, lighting, the rig with the burning bar, two totems with
   torches, and the ball doing a full visit on a loop: three launches, a limbo under the bar, the bar ratcheting down.
   Deliver 6–8 stills (wide, rig hero, low under the bar, close on the flames, totem, the ball mid-limbo) and a
   ~15 s clip (fixed-step capture). Ask "Is this the look?"
3. **Set pieces.** Launch feel at every score, early-bust ghosts, miss coconut, burn, out/topple/crack, bar reset,
   clear-limbo, hold-kiss, winner, heat escalation.
4. **Game flow** (get `?demo=1` playable early in this milestone and show Sean). `game.js` diff + event queue
   (dart rise before verdict, never dropped), every phase, director, HUD, doubles naming, help overlay, forced
   debug phases. `demo.js` with `set(i, lives|bar)` and `force(kind)` for: `playing, dart, nearbar, noroom, miss,
   burn, out, reset, clear, hold, winner, doubles`. Swap in as `limbo.html`; the classic stays reachable.
5. **Audio.**
6. **Polish + perf + verification.** Tuning from recorded video, `?quality=low`, tests, before/after image, full
   game video for Sean, CHANGELOG + asset register.

## 8. Quality gates (definition of "as good as Demolition")

- 60 fps at 1080p in **real Chrome on the M1** (say so if only headless was measured); `?quality=low` holds 60.
- **Nothing lies:** an automated check through the real server that, once each event settles, the bar's height
  equals `currentTargetBar`, the ball's height equals `currentRunningTotal` (during `playing`), and each player's
  lit torches equal `lives`, across a full game including burns, resets, a hold and an elimination.
- A dart produces a visible reaction within 100 ms of the state arriving; dart 3 + verdict both play, in order,
  inside 3000 ms.
- Bars from 60 down to 3 all read clearly from across a bar (the low-bar climax gets its own framing).
- No camera clipping or occlusion; no HUD overlap at 2, 4, 6 players and with "Christopher & Maximilian".
- `npm test`, `npm run check`, `npx playwright test` pass at each milestone end; no console errors.
- Every moment reviewed **in motion** (clip or filmstrip), not only stills.

## 9. Risks to check early

- **Avatars as textures**: `data:` and same-origin URLs are fine; an `http` avatar from another origin taints WebGL.
  Fall back to an initials canvas texture and keep the DOM avatar on the HUD.
- **Two expensive passes**: the sea reflection plus shadows plus many flames. Budget it: half-res reflection, a
  capped number of true lights (moon key + the bar's fire light + a few torch lights; the rest emissive), flames as
  cheap ribbons.
- **Low bars**: at bar 3–10 the whole play happens in the bottom 1 m of the rig. Plan the `gap`/`low` shots and the
  plaque/HUD for it from look-dev on.
- **Same-state verdicts**: dart 3 and `bar_status`/`life_loss` arrive together; forced debug phases jump the bar.
  Build the queue first, before polishing set pieces.
- **Lifting Demolition modules into `lib3d/`** can regress Demolition: compare stills and re-run its
  tower-vs-score check after the move.
- **Organic creep**: palms, flowers and masks must stay stylised-geometric. No characters, no crowd figures (use
  lanterns and light-sticks for crowd energy, plus audio).

## 10. Delegation

- **Opus**: art direction, every shader and material, rig/ball/totem motion, set pieces, director, HUD, audio
  design, polish, final judgement.
- **Sonnet subagents** (well-scoped only): `demo.js` simulator (give it §3 verbatim; seeded RNG; `set()`/`force()`
  kinds from §7.4); the Playwright Limbo test and the nothing-lies check; adapting `docs/plans/tools/e2e.cjs` for
  Limbo (`players[].lives`, `activeIdx`, `currentTargetBar`).
- `log-reader` for test output and logs; `search` for wide sweeps.

## 11. Useful URLs once built

- Demo: `https://localhost:4000/games/limbo-3d.html?demo=1&players=4&seed=5`
- Classic on the TV: `https://localhost:4000/viewer.html?limbo=classic` (start Limbo from `control.html`)
- Demolition for comparison: `https://localhost:4000/games/demolition-3d.html?demo=1`
