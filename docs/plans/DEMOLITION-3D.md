# Demolition 3D — handoff plan

Written 2026-11-17 at the end of the session that built the 3D Derby. Context was cleared after this; **this file is the whole brief**. Read it top to bottom before touching code.

---

## 1. The ask (in Sean's words, condensed)

- Earlier brief (applies again): *"Take one of the games and completely transform it visually… visually stunning… worthy of an interactive premium bar like Flight Club or Electric Shuffle, not a basic 2D arcade game. Use Sonnet sub agents only where work is well scoped, but as Opus orchestrator, you must do the design work… Take a copy of the game so I can compare before and after."* Quality reference: the renderer in `~/lacala-flyover` (techniques only — not its Costa del Sol setting) and a stylised-3D tropical game screenshot Sean liked (chunky, saturated, cinematic light).
- Verdict on Derby: **"You have done a good job. Not excellent, but good."**
- New ask: **"Do another game, and make it a super polished arcade experience."** Game chosen: **Demolition**. Sean approved this plan's direction by asking for it to be written as a handoff.

**Process rules (from `~/.claude/CLAUDE.md` + this brief):**
- Opus does all design, shader, physics, camera, HUD, audio and polish work. Sonnet subagents only for well-scoped chores (listed in §9). Code edits are not delegated otherwise.
- Verbose output (test failures, logs) → `log-reader` subagent; broad code search → `search` subagent.
- Verify before saying done (tests + screenshots + recorded video).
- **Do not commit or push** unless Sean asks. Branch `feat/arcade-platform` carries a lot of Sean's uncommitted security/session work (0.25.0) plus the uncommitted 3D Derby. The repo dir currently reports "not a git repository" to the harness — don't try to fix that.
- **Stop at the look-dev checkpoint (Milestone 2) and show Sean stills + a clip before building the rest.**

---

## 2. Project facts you need

- Repo: `~/flightdeck-fork` (fork of richiela/flightdeck). `~/flightdeck` is untouched upstream — don't edit it.
- Server: Express 5, `src/server.js`. Run locally: `cd ~/flightdeck-fork && SCORING_MODE=mock PORT=4000 node src/server.js` → `https://localhost:4000` (self-signed cert; certs in `certs/`). A previous session may have left one running on 4000 — check `lsof -i :4000` first.
- Architecture: **server owns rules** (`src/engines/<game>.js`, scheduler steps in `src/engines/index.js`); the TV page `public/viewer.html` iframes `public/games/<id>.html` and posts `{type:'SYNC_STATE', state}`. The game must check `event.origin === location.origin && event.source === window.parent` and read `state.gameData`.
- CSP: `script-src 'self' 'unsafe-inline'; img-src 'self' data:` — **no CDNs**. three.js r160 is vendored at `public/vendor/three-0.160.0/three.module.min.js`, loaded via an importmap: `{ "imports": { "three": "/vendor/three-0.160.0/three.module.min.js" } }`.
- Shared page scripts other games load: `shared-player-theme.{css,js}`, `event-videos.{css,js}` (`window.FlightDeckWinnerVideo`: `applyFromState`, `applyScreenClass`, `playFixedIn`, `stopIn`, `playCheers`, `enabled`), `dart-callout.{css,js}`, `dart-announcer.js` (owns an AudioContext with a resume-on-gesture unlock at ~line 49–69 — reuse that approach for game audio).
- Checks: `npm test` (27 node tests), `npm run check` (syntax incl. ES modules; skips `public/vendor`), `npx playwright test` (3 tests; `tests/browser/arcade.spec.cjs` plays **Derby, Killer, Demolition, X01, Quick 10** on a real TV page and asserts the winner name appears as text inside `#gameFrame`'s body, with no page errors).

### The 3D Derby (the reference implementation — reuse it)
- `public/games/derby.html` + ES modules in `public/games/derby/`:
  - `engine.js` — `Engine`: renderer, half-float MSAA HDR target, 5-mip bloom, AgX-style CustomToneMapping grade, composite pass (chromatic aberration, depth-of-field from depthTexture, vignette, flash, sat/warm/lift *after* tonemapping, dither), aerial haze replacing fog chunks, procedural cumulus sky, PMREM env baked from sky, PCFSoft 4096 shadows with texel snapping (`placeShadow(focus)`), dynamic DPR (`adapt(ms)`; `?dpr=` pins, `?quality=low`). Fields: `engine.dof = {focus, aperture}`, `engine.time` uniform, flash/bloom/vignette/ca knobs.
  - `sdf.js` (SDF helpers + surface nets), `horse.js`, `course.js`, `fx.js` (CPU particle pools as Points: dust, confetti, fireworks, flashes), `director.js` (camera shots + per-shot DOF), `race.js`, `hud.js`, `demo.js` (`startDemo(emit,{players,speed,seed,loop})` → `{stop,pause,resume,state,throwDart,force}`, exposed as `window.__derbyDemo`), `main.js` (boot + frame loop; exposes `window.__derby`).
  - `:root { font-size: calc(100vh / 108) }` so the HUD is sized in rem against a 1080p TV.
  - `body.cine` letterbox bars; HUD z-index above them.
- Original kept at `public/games/derby-classic.html`; `public/viewer.html` ~line 809 swaps to it on `?derby=classic`.
- `CHANGELOG.md` has an "Unreleased — 3D Derby" entry; `docs/ASSET-REGISTER.md` has a "3D Derby" section (three.js MIT, everything else procedural, system fonts). Add equivalents for Demolition.
- Derby before/after image: `docs/plans/derby-before-after.png`.

### Lessons from Derby (why it was "good, not excellent") — do not repeat
1. **Organic procedural models hit a ceiling** (SDF horses read slightly uncanny close up). Demolition is hard-surface — play to that.
2. **Not enough game feel.** Events were gentle. Every dart here needs anticipation → impact → hit-stop → shake → settle, scaled to the score.
3. **No sound.** Add a full procedural Web Audio layer.
4. **HUD was a generic overlay.** Design a bespoke kinetic-type motion-graphics language.
5. **Judged from stills.** Review recorded video of full games at each milestone; stills hide motion problems.
6. Specific Derby bugs to pre-empt: cameras clipping through scene objects (constrain every shot); full-screen flash whiting out (cap flash ~0.5, fast decay); grade uniforms in the tonemapping chunk greyscaling built-ins (do grade in the composite pass); roof undersides picking up green env reflections (dark underside materials); headless fps was only 25–45 at 1080p (set a real perf budget, test in real Chrome).

---

## 3. Demolition rules — exact state contract

Source: `src/engines/demolition.js`, scheduler cases `demolition_*` in `src/engines/index.js` (~lines 599–692), TV-moment handling in `src/server.js` (~404–520, ~1995–2010, ~2454).

- Players cluster into up to **6 lanes** (`DEMOLITION_MAX_LANES`); a lane with >1 player is a team ("TEAM N"); doubles lineups also exist (`isDoublesLineup`). Each lane starts at **180** (`DEMOLITION_START`). 3 darts per visit. Score drops by dart value; must hit **exactly 0**.
- `gameData` fields: `gameType:'demolition'`, `teams[[{id,name,avatar,…}]]`, `teamScores[]`, `activeTurnIndex`, `dartsThrownThisTurn`, `roundInitialScores[]` (score at start of the visit — bust resets to this), `turnStartingScores[]` (pre-dart baseline the viewer uses to animate; synced after anim), `teamsActedThisRound[]`, `checkedOutThisRound[]`, `finishRoundMode`, `isPlayoff`, `isDoublesLineup`, `throwerIndices[]`, `helpVisible`, `tvmClipUrl` (only during tvm), `lastThrow {score, bust, checkout, miss, number, multiplier}`, `phase {type, data}`.
- Phases:
  - `playing` — no data.
  - `bust` — `{teamIndex, teamName, avatar}`; score already reset to `roundInitialScores[idx]`; lasts `OVERLAY_EVENT_MS` (3000) then next team.
  - `intermission` — `{nextTeamIndex, nextTeamName, avatar}`; 2500 ms (`OVERLAY_NEXT_PLAYER_MS`).
  - `tvm` — `{teamIndex, teamName, avatar}`; face-clip "TV Moment". **Server skips it** (goes straight to checkout) when the TVM recorder is off, video is off, or a bot checked out. When it runs, `gameData.tvmClipUrl` arrives later; play it with `FlightDeckWinnerVideo.playFixedIn(screen, url)` and post `window.parent.postMessage({type:'TVM_COMPLETE'}, location.origin)` on ended/error/near-end (copy `maybePlayTvm` from `demolition-classic.html` ~line 845). 20 s safety max.
  - `checkout` — `{teamIndex, teamName, avatar}`; 3000 ms. Then other teams that haven't thrown this round get their visit (`finishRoundMode`).
  - `playoff` — `{contenderNames[], startScore:60}`; 3000 ms; then towers for the tied teams reset to **60** (`DEMOLITION_PLAYOFF_START`), `isPlayoff:true`, teams array is replaced by only the contenders (indices change!).
  - `winner` — `{teamIndex, winnerName, avatar, members[], avatars[]}`. **Render `winnerName` as DOM text** (the Playwright test asserts it).
- Timing after a scoring dart: the server waits `animDelay = max(700, bricksRemoved*15 + 450)` ms before the next state step. So a dart's destruction must *read* in ~0.7–1.4 s, but can keep settling afterwards. Darts can arrive faster than animations — **queue/fast-forward**, never drop or desync.
- Detect a new dart by `(activeTurnIndex, dartsThrownThisTurn, teamScores[idx])` changing; classify from `lastThrow`: `miss`, `multiplier` 1/2/3, bull = `number` 25 (`multiplier` 2 → 50), `bust`, `checkout`.
- Classic tower shape (2D, `demolition-classic.html` ~line 880): rows of 10 bricks ×15 then 8,6,4,2 (=180); playoff 10×4 then 8,6,4,2 (=60). Bricks disappear from the top.

---

## 4. Creative direction — "Neon Demolition Yard"

Premium-bar arcade, **stylised not realistic**: chunky toy-like geometry lit like a film. Night.

- **Set:** a city construction yard at night. Wet asphalt with screen-space-ish/planar reflections (cheap: mirrored env + roughness map puddles), concrete barriers, hazard chevrons, stacked shipping containers, floodlight rigs with volumetric beams (additive cone meshes with noise), drifting dust motes in the beams, tower cranes with blinking red aircraft lights, a defocused city skyline backdrop (emissive window grid shader on far boxes → lovely bokeh through the existing DOF), a large LED jumbotron billboard in the scene.
- **Palette:** environment dark, desaturated, cool (deep blue-teal shadows, sodium-orange floodlight practicals). **Team colour is the only saturated colour** → instant readability across a bar. Use the shared player colours (`shared-player-theme.js` — check how Derby's `playerColor` in `race.js` derives them) for the towers.
- **Towers:** one per lane in a shallow arc facing camera, each built from glossy bevelled blocks (rounded-box geometry, ~0.08 bevel) in team colour with emissive window-strip insets and a subtle clearcoat; blocks cast and receive shadows; AO via baked per-instance vertex darkening at contact faces. Stepped art-deco setbacks echo the classic taper. Proposed layout (blocks removed top-down, fixed order within a floor):
  - Main: 13 floors of 4×3 (156) + 2 floors of 3×3 (18) + 1 floor 2×2 (4) + spire 2 (=180).
  - Playoff: 3 floors of 4×3 (36) + 2 of 3×3 (18) + 2×2 (4) + spire 2 (=60), built by a crane dropping floors in.
- **Crown:** a beacon + team-flag + name sign riding on the topmost remaining block; it lowers as floors go. On checkout it topples off and falls.
- Each tower base: a lit plinth with the team name in an LED ticker; ground decal ring in team colour.

## 5. The dart moments (core of the experience)

Every dart: **anticipation (150–300 ms) → impact → hit-stop (40–90 ms freeze scaled to score) → camera shake (trauma model, decays) → debris settle + dust**. Score counter on the HUD ticks down block-by-block in sync with blocks leaving.

| Dart | Visual | Audio |
|---|---|---|
| Single (1–20) | Wrecking ball swings in on its crane cable, smashes the top N blocks off | whoosh, heavy thud, rubble tumble |
| Double | Rocket streaks in from off-screen, explosive blast throws blocks outward, sparks | rocket hiss, boom with sub, debris rain |
| Treble | Demolition charges light up floor-by-floor (blinking red), chain detonation, top section collapses in slow-mo (time scale ~0.35), camera orbit | beeps accelerating → staggered blasts → long rumble |
| Bull 25/50 | Orbital "bullseye" strike: beam from the sky, ring shockwave | charge-up whine, crack |
| Miss | Ball swings, scrapes past, crane horn honks, a single block wobbles but stays — comedic, short | horn, clank |
| Bust | Physics **rewinds**: rubble flies back up and re-stacks to `roundInitialScores`, big "BUST" stamp slams with chromatic hit | tape-rewind warble, stamp thud |
| Checkout (exact 0) | Foundation erupts, crown topples, team-colour fireworks + confetti cannons, skyline windows flash team colour | big blast, crowd roar (synth), sting |
| TV Moment | Face clip plays on the in-world jumbotron (video texture) with a framed DOM fallback | duck game audio |
| Playoff | "SUDDEN DEATH" title; cranes drop new 60-block towers floor by floor | siren, clanks per floor |
| Winner | Crane lowers a gold trophy onto the winner's plinth, all floodlights swing to it, skyline floods winner colour, confetti | fanfare sting |

**Physics (custom, no library):** removed blocks become rigid bodies — semi-implicit Euler, quaternion orientation, box-vs-ground-plane with restitution/friction via contact points (8 corners), cheap box-vs-box using sphere-cluster approximation so rubble piles, sleeping when slow. Big impacts split blocks into 2–4 pre-fractured chunk meshes. All debris rendered with InstancedMesh (per-instance colour). Cap ~600 active bodies; when over budget or asleep, bake into a static rubble pile per tower (merged instances). **The standing tower is always laid out from the score, never from physics**, so the display can't lie. Rewind = record per-body transforms for the last dart, play them backwards.

**FX:** lit smoke/dust (soft particles, floodlight-tinted), sparks (stretched additive), glass shard glints, ground shockwave ring decal, impact scorch decal, embers. Reuse/extend Derby `fx.js` pools.

**Camera director** (extend Derby `director.js` pattern): `establish` (slow crane over the yard, all towers), `turn` (push in to active tower, thrower named), `strike-single/double/treble/bull` (per-attack framing, treble orbit in slow-mo), `bust-rewind`, `checkout` (low hero angle, crown fall), `jumbotron` (tvm), `playoff` (wide, cranes), `winner` (orbit on trophy). Constrain every shot so it never enters a tower or crane volume; frame correctly for 2–6 lanes. Per-shot DOF focus/aperture like Derby.

**HUD (bespoke, kinetic):** top-centre thrower card (avatar, name, team, 3 dart pips with values); lane strip along the bottom — one card per lane: colour, name, big score that rolls down per block, mini tower silhouette, active pulse, "OUT" / checked-out tick; checkout hint for the active lane ("NEED 17 · S17", or "NEED 50 · BULL"); finish-round banner ("FINAL CHANCE — N TO THROW"); title cards for BUST / CHECKOUT / SUDDEN DEATH / WINNER with slam-in kinetic type; help overlay (`helpVisible`). Avatars only from `data:image`, `/`, or `http` (copy Derby `hud.js` `avatarEl`). All names via `textContent` (security test injects unsafe names).

**Audio (procedural Web Audio, no files):** master bus → compressor; layers: impact (noise burst through lowpass + sine sub drop), rubble (granular noise grains, density from active bodies), explosion (noise + pitch-dropping sub + tail), glass (high bandpassed noise pings), crane motor (detuned saw through lowpass, pitch from cable speed), ambient city (filtered brown noise + distant traffic swells), UI stings, charge beeps, horn. Duck under announcer/video. `?sound=0` disables; respect AudioContext unlock like `dart-announcer.js`. Check whether viewer volume / video settings in `venueConfig` should gate it.

---

## 6. File plan

```
public/games/demolition-classic.html   ← exact copy of current demolition.html (do this FIRST)
public/games/demolition.html           ← new shell: importmap, HUD markup, CSS, loads shared scripts + /games/demolition/main.js
public/games/lib3d/engine.js           ← Engine moved out of derby/engine.js, parametrised (sky/night preset, fog colour, sun vs floodlights)
public/games/lib3d/fx.js               ← (optional) shared particle pools if clean to extract
public/games/derby/engine.js           ← becomes a thin re-export / day preset of lib3d/engine.js — Derby must look identical afterwards
public/games/demolition/
  main.js      boot, message listener, ?demo, frame loop, window.__demolition
  yard.js      set dressing: ground, barriers, containers, floodlights+beams, cranes, skyline, jumbotron
  tower.js     block layout tables, instanced tower per lane, crown, plinth/LED, rebuild/playoff build-in
  physics.js   rigid bodies, contacts, sleeping, fracture, rewind recorder
  attacks.js   wrecking ball / rocket / charges / bull strike / miss / bust-rewind / checkout sequences
  fx.js        smoke, sparks, shards, shockwave, fireworks, confetti (or import lib3d/fx.js)
  director.js  shots + constraints + DOF
  hud.js       HUD + title cards + checkout hint + tvm DOM fallback
  audio.js     procedural sound bank + mixer
  game.js      state sync: diff gameData → queue of events → drives towers/attacks/director/hud
  demo.js      simulator (Sonnet), window.__demolitionDemo
public/viewer.html                     ← add `?demolition=classic` next to the derby switch (~line 809); consider generalising to `?classic=<game>` while keeping `?derby=classic` working
tests/browser/…                        ← extend/add: Demolition on TV — no errors, tower block counts == teamScores after each dart settles, winner text present
CHANGELOG.md, docs/ASSET-REGISTER.md   ← entries
```

## 7. Milestones (in order — stop where marked)

1. **Foundation.** Copy `demolition.html` → `demolition-classic.html`. Add the viewer `?demolition=classic` switch. Extract the engine to `lib3d/`, point Derby at it, re-run `npm test`, `npm run check`, `npx playwright test`, and take a Derby screenshot with `GAME=derby node docs/plans/tools/dshot.cjs …` to confirm it's visually unchanged.
2. **Look-dev — STOP for Sean's sign-off.** Yard + lighting + one full tower + crown + a wrecking-ball strike on a loop. Deliver 4–6 stills (wide, hero tower, low angle, close-up of blocks) and a ~15 s clip. Ask Sean: "Is this the look?" Don't build further until he says yes.
3. **Destruction.** Physics, fracture, all attack types, hit-stop, shake, FX, rewind.
4. **Game flow.** `game.js` state diffing + event queue, every phase, director, HUD, tvm (jumbotron + DOM fallback + `TVM_COMPLETE`), playoff rebuild (indices change!), winner, doubles/teams naming. `demo.js` with `force(kind)` for: `playing, bust, intermission, single, double, treble, bull, miss, checkout, tvm, playoff, winner, doubles, nearfinish`.
5. **Audio.**
6. **Polish + perf + verification.** Tuning pass from recorded video, `?quality=low`, tests, before/after image (classic vs new, same moment), full-game demo video for Sean.

## 8. Quality gates (definition of "excellent")

- 60 fps at 1080p in **real Chrome on the M1** (headless numbers are pessimistic — say so if you can only measure headless). `?quality=low` holds 60 on weaker TVs.
- **The tower never lies:** automated check that each lane's standing block count equals `teamScores[i]` once a dart settles, over a full game through the real server (including bust and playoff).
- A dart produces a visible reaction within 100 ms of the state arriving.
- No camera clipping; no HUD overlap with 2, 4, 6 lanes and long doubles names (test with "Christopher & Maximilian").
- `npm test`, `npm run check`, `npx playwright test` all pass; no console errors.
- Every phase reviewed **in motion** (video), not only stills.

## 9. Delegation

- **Opus (you):** art direction, all shaders/materials, tower, physics, attacks, FX, director, HUD design, audio design, every polish pass, final judgement.
- **Sonnet subagents (well-scoped only):** `demo.js` simulator (mirror the rules in §3 exactly; seeded RNG; `force()` kinds above; give it this section verbatim); the Playwright Demolition test; adapting `docs/plans/tools/e2e.cjs` for Demolition; video capture script (Playwright `recordVideo` at 1920×1080 → mp4 via ffmpeg if present).
- `log-reader` for failing test output; `search` for wide code sweeps.

## 10. Tools already in the repo

- `docs/plans/tools/dshot.cjs` — headless screenshots of a game page in demo mode. `GAME=derby node docs/plans/tools/dshot.cjs <outdir> <steps.json> [query]`; steps: `[{"wait":ms},{"force":"kind","extra":{}},{"resume":1},{"eval":"js"},{"shot":"name"}]`. Prints fps + dpr + console errors. Expects `window.__<game>Demo` and `window.__<game>.engine`. Verified working on Derby 2026-11-17.
- `docs/plans/tools/e2e.cjs` — full game via real server + control page + TV viewer (currently Derby-specific: player loop uses `players/activeIdx/targetNumber`; adapt to `teamScores/activeTurnIndex` for Demolition). `node docs/plans/tools/e2e.cjs <outdir> [viewerQuery]`.
- `docs/plans/tools/sheet.py` — contact sheet: `python3 docs/plans/tools/sheet.py <dir> <out.png> [cols]` (needs Pillow).
- Put temporary outputs in the session scratchpad, not the repo.

## 11. Risks to check early

- **Video texture:** the tvm clip as a WebGL texture needs same-origin/CORS-clean video and CSP `media-src` allowing it; if blocked, use the DOM `.fd-event-video` frame (event-videos.css) styled as a jumbotron overlay.
- **Audio autoplay** inside the viewer iframe: reuse the announcer's unlock; if the TV never gets a gesture, audio may stay silent — confirm how the announcer is heard on the real TV.
- **Engine extraction regressions** in Derby — compare screenshots before/after extraction.
- **Playoff index remap** — teams array shrinks; rebuild towers by team identity (member ids), not by index.
- **State bursts** — several SYNC_STATEs can arrive in one frame (Derby used a `pending` latest-wins slot in `main.js`); for Demolition you need *every* dart event, so diff each incoming state against the last applied one, not only the latest.

## 12. Useful URLs once built

- Demo: `https://localhost:4000/games/demolition.html?demo=1&players=4&seed=5`
- Classic on TV: `https://localhost:4000/viewer.html?demolition=classic` (start a Demolition game from `https://localhost:4000/control.html`)
- Derby demo for comparison: `https://localhost:4000/games/derby.html?demo=1&players=5&seed=5`
