# Limbo 3D — status and what's left

Last updated 2026-11-17. The full brief (rules contract, art direction, moments, quality gates) is
[`LIMBO-3D.md`](LIMBO-3D.md); this file tracks progress against it.

## Where it stands

| Milestone | State |
|---|---|
| 1. Foundation | **Done** (2026-11-17), see below. |
| 2. Look-dev | **Done — signed off** ("Yes this is the look, well done"). Stills + clip in `docs/plans/limbo-lookdev/`. |
| 3. Set pieces | **First cut done** (with M4): burn/slam + fireball, no room, miss coconut, hold kiss, out topple, bar reset, clear limbo, winner fireworks. To do: early-bust ghost markers, coconut from a palm, rigid-body topple + ball crack into the surf, torches relight in the winner's colour. |
| 4. Game flow | **Done** (2026-11-17, Sean: "It's great. Well done."). `limbo.html` is now the 3D page (`limbo-classic.html` = the original; `limbo-3d.html` redirects). `?demo=1` simulator, event queue, HUD, `tests/browser/limbo.spec.cjs` (nothing lies through the real server). |
| 5. Audio | **Built, PARKED mid-tuning** — opt-in `?sound=1`; see [`LIMBO-3D-SOUND.md`](LIMBO-3D-SOUND.md). |
| 6. Polish + perf + verification | Not started. |

## Milestone 1 — what was done

- `public/games/limbo-classic.html`: byte-identical copy of the 2D `limbo.html` (loads standalone with no errors).
- `public/viewer.html`: the classic switch accepts `limbo` (`viewer.html?limbo=classic` or `?classic=limbo`).
- Lifted out of Demolition into `public/games/lib3d/` (Demolition now imports them):
  - `reflection.js`: the planar reflection, plus an optional mirror-plane `height` (Limbo's sea level).
  - `beacons.js`: glowing point sprites in one draw call (for Limbo's lanterns and fireflies).
  - `physics.js`: rigid-body `World`. It is generic now: `new World(scene, instancedMesh, {w,h,d}, { sinkAfter })`;
    the seed attribute is optional. Demolition passes `blockMesh(...)` + `BLOCK`.
  - `director.js`: `ShotDirector` base with damping, focus/aperture, trauma shake, the occlusion fallback
    (`occluders(p)` → cylinders), `avoid(p)` hook, and prop clearance (`clearance.items()`). Demolition's
    `Director` extends it and keeps only its shots, its towers as occluders, and tower-volume avoidance.
- `lib3d/engine.js`: new `dusk` preset (cool moon key behind camera-right, coral haze lobe toward the sunset, warm
  rim, `sky: false`; the game draws its own sky). New optional `fog.az/el` aims the haze's warm lobe away from the
  key light; `engine.fogDir` holds it. Existing presets are unaffected (no `fog.az`, so it equals `sunDir`).
  The dusk numbers are a starting point for look-dev.

### Verification

- Demolition, seeded `Math.random` + fixed-step `?capture=1`, look-dev loop and `?demo=1` game, frames 240/420/600:
  **pixel-identical** before vs after the move (two baseline runs agree exactly on those frames; frames 1 and 90 vary
  run to run from async startup). Camera position/FOV, DOF focus/aperture, physics body count: identical.
- Derby: preset, every light's colour/intensity, haze array, bloom/vignette/CA/grade identical; still within the
  run-to-run noise of two baseline runs (~0.5% of pixels).
- No console errors on Demolition, Derby or `limbo-classic.html`.
- `npm test` 27/27, `npm run check` clean, `npx playwright test` 3/3 (2.9 min; the X01 card click that failed after
  Demolition look-dev passed this time).
- Viewer switch through the real server: with Limbo started from the control tablet, `/viewer` loads
  `games/limbo.html`, while `/viewer?limbo=classic` and `/viewer?classic=limbo` load `games/limbo-classic.html`; no page errors.

## Milestone 2 — look-dev (built; waiting for sign-off)

### Try it

- Look-dev loop: `https://localhost:4000/games/limbo-3d.html` (`&players=2..6`, `&bar=n` to start lower,
  `&shot=establish|wide|rig|low|gap|flames|totem|limbo` to hold a camera, `&loop=0` to stop the visits).
- Console: `__limbo.rig.setBar(n, 'drop'|'reset'|'snap')`, `__limbo.ball.snap(total)`, `__limbo.shot(name)`.
- Capture: `GLOBAL=__limbo node docs/plans/tools/dcap.cjs <out> <steps.json> games/limbo-3d.html 'capture=1&dpr=1&bar=16'`.

### Deliverables (`docs/plans/limbo-lookdev/`)

`0-establish`, `1-wide`, `2-rig-hero`, `3-flames-close`, `4-low-under-the-bar`, `5-gap-at-bar-6`, `6-totem`,
`7-ball-mid-limbo` (1920×1080), `contact-sheet.jpg`, and `limbo-lookdev-visit.mp4` (15.5 s, fixed-step 60 fps: a
full visit at bar 16 — perch, leap, three darts, the reverse-angle limbo and splash, the ratchet down to 10 — then
the next player's totem and leap).

### What's in it

- **The height scale** (`limbo/common.js`): ball base at `deck + total × 0.1`, bar underside at
  `deck + bar × 0.1 + ball diameter`. Total = bar means the ball's top kisses the bar; the rack has one tooth per
  point and the bronze glyph tags sit at those same heights. At bar 3 a resting ball still has a 30 cm gap.
- `limbo/beach.js`: dusk sky shader (cobalt → violet → coral band, lit cirrus, round stars, crescent moon), lagoon
  (planar reflection with the new `clip` + `guard` options, two-scale swell normals, fresnel, shallow tint, broken
  foam), wet-sand mirror band, deck with pilings and steps, 18 faceted palms with frond sway, tiki torches, lantern
  strings + bunting, thatched beach bar with a "LIMBO LAGOON" neon, outrigger canoe, rocks, far island with a
  volcano glow, headland lighthouse with a slow beam.
- `limbo/fire.js`: every flame in one instanced draw call (upright billboards, eroded teardrop, yellow core →
  orange → dark red tips; clamped pow bases), plus `FireLight` flicker.
- `limbo/rig.js`: carved tiki posts (faces with glowing eyes, painted bands, headdress), racks, glyph tags, bronze
  clamps, charred bamboo with ember cracks, plaque, ragged flame sheet, embers, two fire lights; heat scales
  flames/embers/light; `setBar(v, 'drop'|'reset'|'snap')` ratchets tooth by tooth with a clunk (designed durations).
- `limbo/totem.js`: three lacquered octagonal drums in the team colour (grin, big face, fierce head + feather fan),
  avatar shield (same-origin/`data:` avatars only, else initials), name sign that lights when active, three life
  torches (`setLives`), one fire light each.
- `limbo/ball.js`: glossy ball, gold band, avatar inset, self-glow light; `perch`, `leap` (0.95 s), `rise` (crouch
  0.1 + 0.48 s with overshoot), `limbo` (1.5 s, off the back of the deck into the lagoon), squash spring, roll that
  settles face-forward.
- `limbo/fx.js` (trail, splash streaks + ring, dust), `limbo/director.js` (shots: establish, wide, rig, low, gap,
  flames, totem, limbo-reverse-angle; posts/palms/totems as occluders; lens kept out of the sand; shots tighten
  with heat), `limbo/main.js` (look-dev visit loop, capture), shell `games/limbo-3d.html`.
- `lib3d/reflection.js` gained `clip` (cut below the mirror plane) and `guard` (uniforms that read black during the
  mirrored pass, so wet sand can sample the reflection and still be in it). Both default off: Demolition unaffected.
- `lib3d/engine.js` `dusk` preset retuned during look-dev (cooler, thinner haze).

### Measured

- Headless Chromium, 1920×1080, `dpr=1`: 60 fps (vsync cap) for the look-dev loop at bar 16, and with
  `?quality=low`. **Not yet measured in real Chrome on the M1.**
- No console errors or warnings in any capture.

### Known rough edges (for after sign-off)

- Out-of-focus embers/stars can show as small squares (the engine's box-filtered DOF blur on tiny hot points);
  calmed by dimming embers and a smaller aperture on the reverse angle.
- The plaque reads from the front only (dark board from behind).
- The rig's look-dev visit uses a scripted dart sequence; real `gameData` wiring is Milestone 4.
