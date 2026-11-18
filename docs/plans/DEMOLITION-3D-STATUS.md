# Demolition 3D — status and what's left

Last updated 2026-11-17. The full brief (rules contract, art direction, quality gates) is
[`DEMOLITION-3D.md`](DEMOLITION-3D.md); this file tracks progress against it.

## Where it stands

| Milestone | State |
|---|---|
| 1. Foundation | **Done.** `demolition-classic.html` kept; viewer `?demolition=classic` / `?classic=<derby\|demolition>`; engine extracted to `public/games/lib3d/engine.js` (presets `day`, `night`); Derby verified unchanged. |
| 2. Look-dev | **Done — signed off by Sean** ("The look is fantastic"). Night construction yard, glossy block towers, crane + wrecking ball, stills + 15 s clip. |
| 3. Destruction | **Partly done.** Rigid-body physics, wrecking-ball strike, hit-stop, shake, dust/sparks/chips. Other attacks not started. |
| 4. Game flow | **MVP done** (built early so Sean could play it). Not yet swapped in as the real game. |
| 5. Audio | Not started. |
| 6. Polish + perf + verification | Not started. |

### Try it

- Simulated game: `https://localhost:4000/games/demolition-3d.html?demo=1` (`&players=2..6`, `&speed=2`, `&seed=n`).
  Console: `__demolitionDemo.set(lane, score)` jumps a lane near the finish.
- Look-dev loop (no game): `games/demolition-3d.html`, or hold a camera with `?shot=wide|establish|hero|low|close|strike|strike2|checkout`.
- Classic 2D on the TV: `viewer.html?demolition=classic`.
- Capture: `node docs/plans/tools/dcap.cjs <outdir> <steps.json> games/demolition-3d.html 'capture=1&dpr=1'`
  (`{step:n}`, `{shot:name}`, `{eval:js}`, `{video:name, frames, fps}` → mp4 via ffmpeg).

### Code map

`public/games/demolition-3d.html` (shell + HUD CSS; becomes `demolition.html` in M4) and `public/games/demolition/`:
`blocks.js` (bevelled block geometry + material), `tower.js` (layouts 180/60, plinth, LED ticker, crown, drop-in),
`yard.js` (wet ground + planar reflection, night sky, skyline, floodlights, barriers, containers, jumbotron),
`crane.js` (lattice tower cranes, ball rig), `attacks.js` (wrecking ball, `releaseTop`),
`fx.js`, `director.js` (shots, towers as occluders, lens out of tower volumes), `hud.js`, `game.js` (state → yard;
towers reconciled to score every frame), `demo.js` (rules simulator), `main.js`.
Shared: `public/games/lib3d/engine.js`, `public/games/lib3d/particles.js` (Derby uses both); since Limbo M1 (2026-11-17)
also `lib3d/reflection.js` (the planar reflection), `lib3d/beacons.js`, `lib3d/physics.js` (rigid-body `World`, now
given its mesh + box size by the caller) and `lib3d/director.js` (`ShotDirector`: damping, trauma shake, occlusion
fallback, clearance). The move was verified pixel-identical on seeded fixed-step frames.

## Still to do

### Tests (deferred while getting the MVP on screen — run these first)

- [ ] `npm test` — not run since the game MVP was added.
- [ ] `npm run check` — passed after the last change; re-run with the rest.
- [ ] `npx playwright test` — last full run (after look-dev) had one failure: timeout clicking the X01 card on the
      control tablet in `tests/browser/arcade.spec.cjs:8`, after Derby/Killer/Demolition passed. Passed when re-run
      alone. Untouched code, but not yet shown to be a flake.

### Milestone 3 — Destruction

- [ ] Double: rocket streaks in, explosive blast throws blocks outward.
- [ ] Treble: charges blink floor by floor, chain detonation, slow-mo collapse (time scale ~0.35), camera orbit.
- [ ] Bull 25/50: beam from the sky, ring shockwave.
- [ ] Miss: ball swings past, crane horn, one block wobbles (currently a miss does nothing in the yard).
- [ ] Bust rewind: rubble flies back up and re-stacks (currently the blocks just drop back on).
- [ ] Checkout: foundation erupts, crown topples off and falls (currently fireworks + confetti only).
- [ ] Pre-fractured chunks (2–4 per block) on big impacts.
- [ ] Bake sleeping rubble into a static pile per tower (currently old rubble sinks into the ground after ~24 s).

### Milestone 4 — Game flow (finish)

- [ ] Swap in: `demolition.html` → the 3D shell (classic stays as `demolition-classic.html`); keep `?demo=1`.
- [ ] TV Moment: face clip on the jumbotron as a video texture, DOM fallback, `TVM_COMPLETE` (today it posts
      `TVM_COMPLETE` at once and skips the clip).
- [ ] Load the shared page scripts (`event-videos`, `dart-callout`, `dart-announcer`) like the classic page does.
- [ ] Help overlay (`helpVisible`), avatars on the thrower card (`data:`/`/`/`http` only), doubles/team naming
      checked against the real server (`isDoublesLineup`, `throwerIndices`).
- [ ] `demo.js` `force(kind)` for screenshots: `playing, bust, intermission, single, double, treble, bull, miss,
      checkout, tvm, playoff, winner, doubles, nearfinish`.
- [ ] Playwright: Demolition 3D on the TV through the real server — no errors, each lane's standing block count equals
      `teamScores[i]` after every dart settles (including bust and playoff), winner name present as DOM text.
- [ ] Adapt `docs/plans/tools/e2e.cjs` for Demolition (`teamScores` / `activeTurnIndex`).

### Milestone 5 — Audio

- [ ] Procedural Web Audio: impacts, rubble, explosions, glass, crane motor, city ambience, stings, charge beeps, horn.
- [ ] Duck under announcer/video; `?sound=0`; reuse the `dart-announcer.js` unlock; check `venueConfig` gating.

### Milestone 6 — Polish, perf, verification

- [ ] 60 fps at 1080p in real Chrome on the M1 (headless so far: 45–56 fps; `?quality=low` 60).
- [ ] No HUD overlap at 2, 4, 6 lanes with long names ("Christopher & Maximilian").
- [ ] Camera review in motion for 2, 4, 6 lanes (occlusion fallback added; edge lanes need a look).
- [ ] Full-game demo video and a before/after image for Sean.
- [ ] `CHANGELOG.md` "Unreleased — 3D Demolition" entry; `docs/ASSET-REGISTER.md` section (three.js MIT, everything
      else procedural, system fonts).
- [ ] Nothing committed yet (branch `feat/arcade-platform` also carries Sean's uncommitted 0.25.0 work) — commit only
      when Sean asks.

### Known rough edges in the MVP

- Every scoring dart uses the wrecking ball; darts arriving while the ball is busy knock the top off without it.
- Rubble near a low camera is handled by lifting the camera; dense rubble can still crowd tight shots.
- The hero still crops the crown on a full 180 tower.
