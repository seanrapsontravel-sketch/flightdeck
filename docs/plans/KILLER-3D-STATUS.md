# Killer 3D — status and what's left

Last updated 2026-11-18. The brief is [`KILLER-3D.md`](KILLER-3D.md); this file tracks progress against it.

| Milestone | State |
|---|---|
| 1. Kit + greybox playing the real game | **Done.** |
| 2. Look-dev | **Built, not yet signed off.** Sean asked for milestones 1–4 in one go, so the plan's stop for sign-off was not taken: **ask "Is this the look?"** Stills + clip in `docs/plans/killer-lookdev/`. |
| 3. Set pieces | **Done (first cut).** All moments built and reviewed in motion; polish items below. |
| 4. Game flow + swap-in | **Done.** `killer.html` is the 3D page (`killer-classic.html` = the original, `killer-3d.html` redirects). |
| 5. Sound | Not started (and Limbo's sound is still parked, which the plan says to finish first). |
| 6. Polish, perf, verification | Not started, apart from the perf numbers below. |

## Try it

- Simulated game: `https://localhost:4000/games/killer.html?demo=1` (`&players=2..6 &seed=n &speed=2 &doubles=1 &video=1 &long=1`).
  Console: `__killerDemo.force('mark'|'boost'|'became'|'strike'|'knock'|'lost'|'death'|'miss'|'bull'|'round'|'winner'|'draw'|'visit'|'doubles')`,
  `__killerDemo.set(i, { killerMarks, lives, isKiller, round })`, `__killer.shot(name, p)`, `__killer.truth()`.
- The original: `viewer.html?killer=classic` (or `?classic=killer`).
- Review tools (all seeded, fixed-step, fake clock, deterministic):
  - `docs/plans/tools/baseline.cjs <out> [frames]` + `baseline-diff.py A B`: regression frames for Limbo, Demolition, Killer (`CASES=...`).
  - `GLOBAL=__killer DEMO=__killerDemo [PRE='js'] node docs/plans/tools/moments.cjs <out> games/killer.html '<query>' kind,kind [offsets]`: a contact sheet per moment.
  - `dcap.cjs` as before (`GLOBAL=__killer`).

## Milestone 1 — what was done

- `killer-classic.html`: byte-identical copy of the 2D page; the viewer's classic switch accepts `killer`.
- **The shared kit** `public/games/lib3d/kit/`: `queue.js` (StateQueue: events with tails, `runQueue`, `queueIdle`, `queueBusy`; `stateInbox` — origin + parent check, every state kept), `loop.js` (wall-clock sub-stepping, `?capture=1`, `step(n, dt)`, `engine.adapt`), `hud.js` (`el`, `initials`, `avatarEl`, `dartLabel`, `TitleCard`, `helpOverlay`), `demo.js` (seeded rng, `demoTimer`, `phase`, doubles helpers), `roster.js` (server-style doubles naming), `darts.js` (regulation bed radii, wheel order, `dartPosition` from `lastThrow` incl. the `s/S/D/T/25/50/Bull` sectors, `hitAt`).
- **Limbo moved onto the kit** (game/main/hud/demo). **Verified unchanged:** `baseline.cjs` runs Limbo and Demolition (look-dev loops and `?demo=1` games) with seeded `Math.random`, fixed step and a paused fake clock; two baseline runs are identical, and after the lift every frame (240/420/600, plus Limbo's demo to frame 2400, HUD included) is **pixel-identical**. `limbo.spec.cjs` passes.
- `tests/darts.test.cjs`: 4,800 seeded darts land in the bed and number reported, for every number and bed, bulls and misses.

## What the 3D page is (milestones 2–4)

Modules in `public/games/killer/`: `common` (scale, bands, crowns, colours), `board` (the floor board — one shader: beds, wires, number ring, the per-wedge light bands, killer/dead/ledger line, crack + drain, tracer, escalation glow; 20 brass numerals), `agents` (hitmen in dinner jackets in the team colour: six head silhouettes — fedora, slicked hair, top hat, chignon, bowler, shaved head + shades — avatar medallion, name plate; a killer draws a suppressed pistol and levels it at the board with a crimson laser sight, fires on a strike, drops it when stripped; recoil, shatter into physics chunks, winner column), `darts` (1.2 m darts thrown in on an arc, wobble, misses skitter, withdraw at visit end), `fx`, `room` (the club: glass with rain refracting a procedural city, mullions, walnut + brass, bar, coffers, pendants, sconces; heat levels), `director` (master, agent, dartcam, wedge, strike, death, orbit, round), `hud`, `game` (state → events → reconcile → `truth()`), `demo` (a port of `src/engines/killer.js` + the scheduler timings, video windows included), `main`.

- Wedge bands: band 0 (the first mark) at the rim, filling inward; strikes drain top-down as the server lists them. 0.75 s per band (inside the server's 0.9 s beat).
- A verdict moment starts when its wedge animation ends and fits the window: 3 s, or 5.5/5.2 s in video mode.
- The film clips are **not in this tree** (removed per the asset register). The page plays them only if present (checked once, and only when video mode is on); winner clips play through `event-videos.js` as on every page.

## Verification (2026-11-18)

- `tests/browser/killer.spec.cjs` (through the real server, GPU flags): (1) a whole 3-player game — ×2 mark, misses, a bull, three players becoming killers, strikes, two killers stripped, a ×2 overkill death, a round wrap, the final kill — with **nothing lies** after every dart (each wedge's lit bands, killer flags, outs, one dart per dart thrown **in its exact bed**, the round), the winner's name as TV text, out players shattered + struck through, forged messages ignored, no errors; (2) video mode: the became-killer window (> 5 s) is used and the TV's moment is finished when the server moves on; debug previews of became/lost/death leave the board telling the truth.
- Moment contact sheets reviewed for every moment; 20 s fixed-step clip of a real visit (mark → killer, strike, kill).
- Perf (headless Chromium, 1920×1080, dpr 1): 60 fps master shot after cutting the glass to 2 city samples and the key shadow to 2048; 60 with `?quality=low`. **Not yet measured in real Chrome on the M1.**
- Full suite (2026-11-18): `npm test` 29/29, `npm run check` clean, `npx playwright test` 5/6 with the Limbo test failing on its own `reset` counter (it read the bar before the server had put it back to 60 after a burn; every nothing-lies check had passed). Fixed in `limbo.spec.cjs` (wait for play to resume before reading) and that test re-run: passes. The arcade test plays Killer to a winner through the new 3D page.

## Lessons (add to the plan's list)

1. **Coplanar faces z-fight at the master distance.** The post chain's depth is not precise enough for surfaces millimetres apart at 15 m: the greybox room box's floor face at y = 0 and a floor plane under the board both shredded it. The floor is a ring with the board's disc cut out; inlays (numbers, medallions, plates, pools) use polygon offset, not height.
2. **No `fwidth()` inside per-pixel branches** (undefined derivatives → blocky smears). Compute every wire, then mask.
3. **A cool rim light glares off a polished floor** at an overhead lens and washes the board blue. Killer runs the preset with `rim: null`.
4. Debug a shader by painting its intermediate values (`uReflOn = 2` paints the raw reflection) — the reflection target itself was clean; the corruption was something drawn over the board.

## Known gaps / next

- **Agents are hitmen now** (2026-11-18, Sean: "a secret agent / hitman, in a tuxedo" — the chess-like turned pieces are gone). Stills re-rendered.
- **Sign-off on the look** (milestone 2's question was not asked before building on).
- Doubles naming is wired the way Limbo's is (server `throwerIndices`) and checked in the demo, not yet through the real server.
- Set-piece polish: the agent's lamp "swinging" is one spot that eases between agents; "lamp goes out" is a stutter of that spot; ×2/×3 strikes don't yet chain-crack with a shake beyond the trauma; the winner's lamps don't all swing (one key + the moment light).
- Room: the bar end is only seen in orbits; sconces and bottles are shader-drawn; no columns.
- Milestones 5 (sound) and 6 (real-Chrome perf on the M1, full-game video, before/after image).
