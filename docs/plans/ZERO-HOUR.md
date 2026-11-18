# Zero Hour — plan

Written 2026-11-18 from Sean's brief "Build & Playtest ZERO HOUR — A Social Darts Roulette Game". **This file is the
whole brief**: read it top to bottom before touching code. Its siblings are the 3D game plans (the series this game must
sit in): [`SHANGHAI-3D.md`](SHANGHAI-3D.md) and its status, [`QUACKSHOT-3D.md`](QUACKSHOT-3D.md),
[`KILLER-3D.md`](KILLER-3D.md) (the one that went wrong), [`GAME-INTROS-3D.md`](GAME-INTROS-3D.md).

Unlike the other 3D plans, this is a **new game**: the rules aren't settled, and settling them with evidence is half the
job. So the plan has two tracks that meet in the middle:
- **the game track:** rules, maths and simulation;
- **the show track:** the 3D wheel, built on the same kit and to the same bar as Derby through Shanghai.

---

## 0. In one paragraph

Players throw darts to earn chips; chips buy them a share of a roulette wheel; the wheel decides the winner. The
brief's own rule (**skill earns probability, luck decides the outcome**) is the right one, but the brief's two versions
don't yet deliver it: a first rough model (§3) says that with chips equal to darts score, **an expert beats a novice
only ~69/31**, and "aim at treble 20" isn't even the best aim for most players. So the plan:
1. builds one shared rules core with every mechanic as a parameter;
2. puts Versions A and B (and a Version C that the maths suggests) through 100,000-game seeded simulations per
   configuration;
3. puts all of them on the real server and control tablet so they can be **played**;
4. dresses the winner in a 3D world as good as the others: **"Midnight"**, a clock-tower observatory where the
   wheel is a great brass clock face, the dartboard is its hub and the last spin strikes midnight (zero hour).

Then it answers honestly whether six friends would choose it over Killer, Derby or Demolition.

---

## 1. What we carry from the 3D series (and must not relearn)

Process (it worked on Quackshot and Shanghai):
1. **Hero first, signed off before any world.** The hero here is **the wheel**, judged on clarity first (can you read
   who's favourite from across a bar?) and beauty second.
2. **Every element answers "what has this got to do with the game?"** (§8 table).
3. **Gates hold**, unless Sean says to skip them (he did for Shanghai M2 → M3). The plan marks them; say so at the
   start of each run.
4. **Review at 1:1, plus silhouettes and references.** Write the critique and fix what it finds *before* sending.
   A rejected hero gets 2–3 rendered options.
5. **One command per deliverable set**, seeded and fixed-step (`docs/plans/tools/shanghai-cap.cjs` is the
   template: a fake clock plus `?capture=1`).
6. **List the choices before building**, and flag new ones in each report.

Engine and kit lessons (each one cost a day somewhere):
- **Cameras:** aim from real bounds. The master is an **eye-height lens that tilts** (Shanghai `director.js`
  `eyeFit`), not a fixed-direction fit, which lifts the lens and wanders.
- **Lights:** make every light at load, at intensity 0 (adding one later recompiles every shader).
- **Shaders:** precompile at boot (`renderer.compile`), or the first seconds after load jank.
- **Instanced meshes:**
  - `frustumCulled = false` on any instanced set away from the origin;
  - set `count` to only the instances in use (Shanghai's 448-lantern flock cost about 344k triangles when it didn't);
  - three r160 fragment shaders see `USE_COLOR`, not `USE_INSTANCING_COLOR`.
- **Procedural grids:** keep grid counts integers (a fractional count drew past its vertex buffer at Shanghai's
  far LOD).
- **LOD:** use a far version for anything big and distant; shadow casting only inside the key light's shadow box.
- **Performance:** **measure fps in real Chrome on the M1** (Claude in Chrome) at ≥ 2.1 Mpx, in the master and in
  the busiest moment, before calling look-dev done.
- **Composition:** points made visible must never bury the scoreboard (Shanghai's lantern clouds hid the pagoda; a
  wheel's chips must not hide the wheel).
- **State rules:** every visit's dart 3 arrives with its takeover, so queue the dart first and land it. Guard late
  cards with "the game hasn't ended". The nothing-lies check reads the DOM and `truth()`, and every counted thing
  must also be on screen.
- **Kit and HUD:**
  - use the kit (`lib3d/kit`: queue, loop, hud, intro, roster, darts, demo) and the engine presets;
  - the HUD's DOM is the readable truth;
  - names go in with `textContent`;
  - use the page's own CSS prefix (the kit uses `--ki-*`);
  - every game opens on the How to play explainer.

---

## 2. The codebase, as it stands (audit 2026-11-18)

**Adding a game** is one engine file, `src/engines/zerohour.js`, plus one row in `src/catalogue.js`
(`['zerohour','Zero Hour','social',2,6]`). `registry.js` and `venueConfig.js` derive from the catalogue (the engines
README is stale on this). The engine exports `init`, `initDoubles`, `handleThrow`, `handleAction`, `aimNumber` /
`aimedThrow`, `scheduled{}`, `debugPreviewPhase`, `meta`, and optionally `meta.leaderboard` + `buildMatchRecords`;
`shanghai.js` is the template. Its `scheduled` map must supply `zerohour_show_next_after_round` (the core's switch
hard-codes that step for five other games) as well as `_advance_turn` / `_after_round_announce`.

**Hard-coded lists a new game must be added to** (the surprises):
- `server.js:2438`, the FORWARD_GAME_ACTION whitelist: every new action type (setup, Redline choice).
- `server.js:1596-1615`, plus `:1456, :2076, :2114`: the phase names that end a visit or hold the throw queue. Every
  new phase (`setup`, `redline`, `spin`) goes here.
- `session.js:68,89`: score metric and ranking rule.
- `control.html`: the game card, the debug group, the background map, the setup overlay.
- `viewer.html`: the background map.
- `tests/rules.test.cjs:16`: the per-game setup special case. A game that starts in `setup` breaks the
  all-games loop without one.

**Options:** SELECT_GAME passes no per-game options. **Copy X01's route**: init in a `setup` phase, then
`CONFIRM_ZEROHOUR_SETUP {version, params…}` through `handleAction`, with an overlay copied from `#x01SetupOverlay`.
(Around the World's variant selector is dead code: whitelisted and tested, but never reachable. Don't copy it.)

**Mid-game decisions:** no game has one yet. Redline needs a new decision phase. Darts that arrive during it queue
(`throwQueue`) and must be handled deliberately (§5).

**Randomness:** everything server-side is unseeded `Math.random()`, and nothing is seeded. Zero Hour needs its own
injectable RNG (§5). Correct Score clones the whole `gameData`, so **all rules state, including the spin record,
must live in `gameData` as plain JSON**: no module-level state, or a correction wouldn't roll it back.

**Bots:**
- **Profiles:** `dummy`, `casual`, `intermediate` and `advanced` (`core.js:49-109`). They're wheel-scatter models
  (hit, adjacent, two away, elsewhere), set per player via `isBot` / `botProfile`.
- **Timing:** `BOT_DART_DELAY_MS = 1200`.
- **Results:** any bot or mock dart marks the match `matchSimulated` (so it can't count as a clean result).

**Lifecycle:**
- last-dart undo, Correct Score (BEGIN / CANCEL / APPLY restores `preGameData`), the throw queue;
- restore after restart (`sessionStore`, "Engine Restored!");
- timed sessions: the deadline lets the current visit finish, and ends at once during `setup`.

**TV:** the page's `stateInbox` gets `SYNC_STATE`, with the origin and parent checks in the kit. The 3D pages:
- Derby, Limbo and Killer are swapped in;
- Demolition, Quackshot and Shanghai still have `-3d.html` previews.

There's no Monte Carlo anywhere, but the engines are pure, so a simulator can drive `initGameData` /
`handleGameAction` / `applyScheduledAction` with no server, as `rules.test.cjs` already does.

---

## 3. First-look evidence (a 30-line model, not the harness)

A throw model with Gaussian scatter round the aim point (σ in mm per axis: novice 60, casual 38, club 24, expert 14).
**These σ are guesses, not measured accuracy**, and the harness (§6) will make them configurable and documented.

Expected chips per dart (chips = darts score):

| Aim | novice | casual | club | expert |
|---|---|---|---|---|
| T20 | 10.1 | 12.5 | 15.2 | **22.9** |
| T19 | **10.9** | **13.4** | **15.9** | 22.6 |
| bull | **12.1** | 12.3 | 14.3 | 19.9 |

Version A win chances (15 darts each at T20, the wheel weighted by chips):

| Line-up | Win % |
|---|---|
| expert v novice | 69 / 31 |
| expert v casual | 65 / 35 |
| club v 3 casual | 29 / 24 / 24 / 24 |
| novice v 3 club | 18 / 27 / 27 / 27 |
| expert v 5 novices | 31 v 14 each |

What that suggests (hypotheses for the harness to confirm or kill):
- **H1, skill is too flat.** A proportional wheel on raw score compresses skill. The upset chance is generous; the
  "substantial advantage" isn't there. Candidates: convex payouts (a double or treble worth more than face) or a
  wheel weight of chips^k.
- **H2, no real decisions.** On face value, the best aim barely differs between targets, so no aim is interesting.
  Decisions must come from targets the game *changes* (hot numbers, nominations), not from the board.
- **H3, one moment.** Version A has one moment, at the end, after about 12 minutes of adding up.
- **H4, B's spin bonus risks a runaway.** It compounds a leader's lead unless it's capped or scaled.
- **H5, Redline on "any hit on 20 in three darts" isn't a gamble for a decent player** (P(hit) is high), so it needs
  a harder target and payouts by difficulty.

---

## 4. The rules: one core, three versions, every mechanic a parameter

One rules module, `src/engines/zerohour/rules.js`, is **pure** (no I/O, randomness passed in) and used three ways: by
the engine (`src/engines/zerohour.js`), the simulator and the TV's `?demo=1`. One copy of the rules means no drift
between what's simulated, what's played and what's previewed. Node 22.14 (this repo's runtime) can `require()` an
ES module, so the shared file can be ESM; **verify this on day one** and fall back to CommonJS plus a small build
copy if it doesn't hold.

The shared shape: 2–6 players or doubles teams, five visits of three darts. Doubles alternate throwers **by visit**
(`doublesAdvanceThrowerAfterVisit`), and a team owns one wedge of the wheel.

**Chips from a dart** (params): `chips = face × payout[multiplier]`. The brief's default is `payout = {1:1, 2:1, 3:1}`
(face value). The candidate convex payout is `{1:1, 2:2, 3:3}` *on top of face*, so D20 = 80 and T20 = 180. Bulls
are 25 and 50, scalable; a miss is 0. A **floor** of `startChips` (e.g. 10) means nobody's wedge is ever empty
(§5's zero rules).

**Wheel weight** (params): `weight = chips^k` (k = 1 is the brief's proportional wheel; test 1, 1.5 and 2). The wheel
shows **weights as arcs** and says so; chips are the score.

### Version A — One final spin (the brief's)
All 15 darts go into the bank; one weighted spin at the end. Optional knobs to test: convex payout, k, and Redline on
visit 5.

### Version B — Five spins (the brief's, as proposed)
Each round:
- **three hot numbers**, drawn by the server, worth `hotBonus ×` (param);
- a spin weighted by **that round's** chips;
- the spin's winner gets `spinReward` into their bank (param: a flat amount, a % of the pot, or a % of their round
  chips);
- the round chips reset; the banks don't.

Round 5 has Redline, then the final spin on the banks.

**Anti-runaway knobs to test:**
- cap the reward;
- scale it inversely to the bank leader's share;
- forbid the bank leader from winning the round bonus twice running.

### Version C candidates (because the evidence may say A and B aren't enough)
- **C1 "Steal":** like B, but the round spin's winner **takes `stealPct` of the bank leader's chips** (or the
  round's pot). It's a built-in comeback, every spin can reverse the order, and the final spin stays meaningful.
- **C2 "The hour's number":** each round has **one** hour number (8, 9, 10, 11, 12, in the clock theme; or random),
  worth ×3, so everyone knows the target at a glance (it reads in 2 seconds, Shanghai-style). The round spin pays a
  **pot**. The final spin is on the banks.
- The harness ranks A, B, C1 and C2 on the success criteria (§6.4). Only the winner, plus whichever is a close second,
  get the full presentation.

### Redline (visit 5)
The thrower chooses **SAFE** or **REDLINE** before their visit. It's a decision phase on the tablet, with a button on
the TV page as well.

| Variant to test | Rule |
|---|---|
| R1 (brief) | Nominate a number; any hit in 3 darts doubles your bank, else lose half |
| R2 | Nominate a number; must hit its **double or treble** |
| R3 | Payout by difficulty: number 1×, double 2.5×, treble 3×, bull 4× (multipliers set so EV ≈ 0 for a *casual* player) |
| R4 | **Stake a chosen part** of your bank (25 / 50 / 100%); payout by R3 |

Measure EV and win-probability change by skill, and whether everyone rational makes the same choice (if they do, it
isn't a decision). The recommendation is chosen from the evidence; every number stays configurable for playtests.

### Zero and edge rules (defined, tested)
- Everyone at 0: equal arcs.
- A player at 0: they keep the floor wedge (`startChips`), so nobody's eliminated.
- A spin while a player is mid-correction can't happen: spins only start after the scheduled step.
- A dart during the `spin` or `redline` phase is **queued, not scored**, and released when the phase ends (it's the
  existing throw-queue behaviour; the test proves it).
- Undo of the dart that ended a round **before** its spin is drawn is allowed; after the draw, no (a correction
  restores `preGameData`, spin record included, so a corrected round re-draws only if Sean wants that; default: the
  spin stands, and only chips change).

---

## 5. Fairness, randomness and the spin record

- **The server decides; the TV shows.** The draw happens on the server when the `spin` phase begins:
  `r = randomInt(0, totalWeight)` over **integer** weights (cumulative intervals, so it has no float bias), giving
  the owner of `r`. The **landing angle** is also server-chosen, uniformly inside the winner's arc. The TV animates to
  that angle from any start, at any frame rate. Animation can never change the result: the result is in the state
  before the first frame.
- **RNG:** an injectable source.
  - Production: `crypto.randomInt`.
  - Sims and tests: a seeded generator (xoshiro128** or mulberry32), with the seed in the record.
  - Hot numbers and anything else random come from the same source.
- **The spin record**, in `gameData` (plain JSON, so restore and correction work): `{ spinId, round, weights[], total,
  r, winnerId, angle, commit, seed? }`.
- **Verifiable (commit–reveal):**
  - at the round's start the server publishes `commit = sha256(serverSeed)`;
  - the spin uses an HMAC of `serverSeed` and the spin's inputs;
  - after the game, `serverSeed` is revealed in the match record, so anyone can recompute every spin.
  - It's cheap, it's honest, and the TV can show the commit hash in small type.
- **No manufactured drama.** No re-rolls, near-miss bias, or slow-down tuned to the result's identity. The ball's
  path is chosen from the landing angle only, and the same deceleration curve is used for every spin.
- **The wheel is a continuous weighted wheel, not pockets:**
  - player-coloured arcs exactly proportional to weight, with labelled percentages;
  - fine tick marks every 1% for scale;
  - a single ball or pointer on the bezel;
  - no fixed equal pockets anywhere, so nothing implies equal pockets have unequal odds.
- **Tested:**
  - the same seed gives the same game;
  - the observed winner frequencies over 10⁶ draws match the weights (χ² test, p > 0.01, in CI);
  - the angle always lands inside the winner's arc;
  - the TV's final ball angle equals the state's angle (nothing-lies check).

---

## 6. The simulation harness

`scripts/zerohour-sim.cjs` (seeded, worker threads, deterministic per seed) drives the **real** rules module.

### 6.1 Throw models (documented and configurable; not presented as measured accuracy)
- **Gaussian:**
  - aim point plus bivariate normal scatter σ per skill (novice, casual, club, expert; §3's defaults);
  - per-player bias optional;
  - mapped through the regulation board (kit `RADII`, the same geometry the TV draws with).
- **Profile:** the existing `core.js` throw profiles (wheel scatter), so results can be cross-checked against the
  bots the venue already runs.

### 6.2 Policies (how simulated players decide)
- **Aim:**
  - fixed T20;
  - the best expected-value aim for their σ (precomputed per target by numerical integration);
  - hot-number seeking (Version B);
  - the hour's number (C2).
- **Redline:**
  - never;
  - always;
  - threshold (Redline when behind by more than X% of the leader);
  - optimal (by simulated win-probability lookahead).

### 6.3 Experiment matrix (≥ 100,000 complete games per configuration)
For each version (A, B, C1, C2) and each table size (2, 3, 4 and 6 players, and 2v2 doubles):
1. all equal (casual);
2. one expert v casuals;
3. one novice v experienced (club);
4. mixed (novice, casual, club, expert…);
5. extreme (expert v novices);
6. Redline policies against each other;
7. `hotBonus` sweep (×1.5, ×2, ×3);
8. `spinReward` / `stealPct` sweep;
9. payout and k sweep (A's skill-flatness fix).

That's roughly 4 versions × 5 sizes × 9 mixes × a few sweeps, about 400 configurations × 10⁵ games. Each game is
under 100 darts, so this is minutes on the M1 across workers. If any part runs long, say so and report the sample
size used.

### 6.4 What it reports (into `docs/plans/zero-hour-playtest.md`, tables with 95% intervals)
- **Win rate by skill level.** How often the weakest wins; how often the strongest wins.
- **The skill gradient:** the strongest's edge over a fair share, by table size. Targets, to calibrate rather than
  decree: the strongest of 6 wins **25–35%** (fair share 16.7%); the weakest still **≥ 5–8%**.
- **Runaway:** P(the bank leader after round 3 wins), and how often a leader with > 50% of the wheel loses.
- **Lead changes per game** and **"alive at the last spin":** the share of players holding ≥ 10% of the final wheel.
  This is the excitement proxy, labelled as a proxy.
- **Redline:** EV and Δ win-probability by skill and situation; **does one choice dominate?**
- **Hot numbers:** does chasing them pay more for better players (skill), or just add noise?
- **Fairness checks:** observed v theoretical spin outcomes (χ²); the angle-in-arc property.
- **Duration model:** darts × measured seconds a dart (from `data/matches.jsonl` / session logs where available,
  else the bot pace), plus phase windows plus spin lengths. Answers whether **6 players in 15 minutes** is possible:
  at about 30 s a visit, 6 × 5 visits alone is ~15 minutes before any spin, so it may need shorter windows, faster
  spins, or 4 visits for 6 players. Report honestly.

Statistical fairness isn't fun. The harness reports proxies; the playtest (§7) and the simulated customer read (§9)
judge the fun, and the report keeps the two apart.

---

## 7. Playing it: the playtest build (on the real server and tablet)

- **Setup overlay** on the tablet (copied from X01's):
  - Version A, B, C1 or C2;
  - a parameter preset (default, "spicy", "fair") with an "advanced" drawer for the raw numbers.
- **Players:** the existing lineup screen (2–6, doubles teams).
- **Simulated players:** the existing bots (`isBot`), with a **per-player skill** added for Zero Hour: novice, casual,
  club or expert, mapped to the Gaussian model through `aimedThrow`, so a bot also *chooses* its aim and Redline the
  way the sim policy does.
- **Darts in:**
  - manual darts (the debug panel's number / multiplier / ring) and the real board;
  - "auto-throw" (bots for everyone);
  - **test speed** (×1, ×2, ×4: phase windows and animation divided down; a playtest option recorded in
    `gameData.options`, so results are marked simulated).
- **"Skip spin animation"** is a TV-side setting that jumps to the end frame. The result is already in the state, so
  skipping can't change it.
- **Redline on the tablet:** SAFE / REDLINE, the nominated target, and the stake (R4), with the odds shown before
  confirming.
- **TV:**
  - the wheel (updating after every dart), the leaderboard, chips and % for everyone, the round and hot numbers;
  - the spins, winner and replay;
  - "Rematch" and restart through the existing RESET_MATCH / SELECT_GAME.
- **`games/zerohour.html?demo=1`:** a simulated game on the TV page with no server (`players`, `seed`, `speed`,
  `version`), driven by the **same rules module**.

---

## 8. The show: "Midnight" — the clock tower observatory

The seventh mood in the series:
- Derby: golden afternoon;
- Demolition: industrial night;
- Limbo: lagoon dusk;
- Killer: noir interior;
- Quackshot: fairground blue hour;
- Shanghai: temple sunset to night;
- **Zero Hour: the top of a clock tower just before midnight.**

It's an original place: no casino brand, no real tower, no characters. Art deco brass, smoked glass, a great clock
face, the city's lights far below. The game counts down five visits to midnight (the 8, 9, 10, 11 and 12 o'clock
"hours"), and the last spin strikes zero hour.

| Element | What it is | Why it belongs |
|---|---|---|
| **The wheel** (hero) | The tower's great clock face, tilted toward the room: a brass bezel with fine 1% ticks; enamel arcs in each player's colour, exactly their share; each arc labelled with the name, chips and % | It's the scoreboard: ownership, the favourite, the underdog and every dart's effect, at a glance |
| **The hub** | A dartboard at the centre of the face; darts stick in the exact bed | The truth of every dart (as in every game in the series) |
| **Chips** | Brass-and-enamel chips that fly from the bed to the thrower's arc as it **grows** (the arc tweens to its new share) | "Each dart changes the odds", made visible. Counted chips never cover the face (the Shanghai lantern-cloud lesson) |
| **The ball** | A polished steel ball on the bezel track | The spin |
| **The hands** | The clock's hands show the round (8 → 12); at 12 they meet | Progress at a glance; the finale is literally midnight |
| **Hot numbers / the hour's number** | Their wedges on the hub glow (Shanghai's gold-leaf live wedge) | What to aim for, from across a bar |
| **Redline** | The nominated target burns red on the hub; a red line runs round the bezel to the player's arc | The stake, visible to the room |
| **The room** | The clock tower's top: brass gearwork behind the face, tall windows, the city in bokeh; one player station each (a brass plaque, a lamp in their colour), no people | The place; quiet so the face reads |
| **The spin theatre** | The lights dim; the face lights from behind; the arcs glow; the gears turn; the ball accelerates; the camera finds the ball; it slows and settles; the winning arc erupts (light, chips, the chime) | The brief's seven beats, in this world |
| **The finale** | Midnight: the hands meet, the bells strike twelve, the last spin, fireworks over the city | The one moment everyone stays for |

**Cameras** (`ShotDirector` subclass; the master by `eyeFit`):
- `master`: the face square-on, every arc and label legible, the HUD clear;
- `bed`: on the dart;
- `arc`: on the arc growing;
- `ball`: following the ball, then tight on where it settles;
- `station`: intermission;
- `winner`: the winning arc and the player's plaque.

**HUD** (deco; DOM truth):
- per-player chips and %, favourite and underdog tags;
- the round ("10 PM — 2 to midnight");
- hot numbers;
- the thrower card with each dart's chips;
- the spin's result card: "BEN WINS ROUND 3 · +120", or the champion;
- the commit hash in small type;
- help and How to play.

**Readability from across a bar is the first gate**, ahead of beauty:
- every player's arc, name and % must read on a 1080p TV at 4 m, at 2, 4 and 6 players;
- a 2% arc must still be visible (a minimum drawn width, with the true % printed).

---

## 9. Simulated customer perspectives (labelled as simulated, not research)

Personas: a darts beginner; a casual group at the bar; a competitive darts enthusiast; a bar operator (engagement,
session turnover).

For each persona, from the sim numbers and a scripted playthrough:
- what they'd enjoy;
- what would frustrate them;
- where they'd get bored;
- whether losing feels fair;
- whether they have a reason to play again.

**Compared against Killer, Derby and Demolition** on:
- first-play excitement;
- strategic depth;
- spectator engagement;
- dramatic moments;
- perceived fairness;
- replayability;
- duration;
- how fast the rules explain.

Every claim is labelled as a hypothesis for real playtesting.

---

## 10. Deliverables and file plan

```
src/engines/zerohour/rules.js      the pure rules core (versions, params, chips, weights, spins, Redline), ESM if require(esm) holds
src/engines/zerohour/rng.js        injectable RNG: crypto in production, seeded for sims/tests; commit–reveal
src/engines/zerohour.js            the engine (init/setup/handleThrow/handleAction/scheduled/meta/debugPreviewPhase)
src/catalogue.js                   + ['zerohour','Zero Hour','social',2,6]
src/server.js                      whitelist CONFIRM_ZEROHOUR_SETUP / ZEROHOUR_REDLINE; phase lists + setup, redline, spin
src/session.js                     ranking rule for Zero Hour
public/control.html                game card, setup overlay (version + preset + advanced), Redline panel, debug group
public/viewer.html                 background map
public/games/zerohour.html         the 3D TV page (no classic: this is a new game)
public/games/zerohour/             common, wheel (hero), hub (board), chips, ball, room, fx, director, hud, game, demo, intro, main
scripts/zerohour-sim.cjs           the Monte Carlo harness (+ throw models, policies) → JSON + markdown tables
tests/zerohour-rules.test.cjs      rules: every version, every dart form, bulls, misses, zero rules, doubles, Redline variants
tests/zerohour-fairness.test.cjs   seeded reproducibility, χ² of draws v weights, angle-in-arc, commit–reveal round trip
tests/zerohour-lifecycle.test.cjs  undo, Correct Score across a spin, reconnect / restore mid-spin, darts during spin/redline, session expiry
tests/rules.test.cjs               + the setup special case for zerohour
tests/browser/zerohour.spec.cjs    nothing lies: arcs = weights, chips, %, round, hot numbers, ball's final angle = state's, winner name in DOM
docs/plans/tools/zerohour-*.cjs    look-dev / moments renders (from the shanghai-cap template)
docs/plans/zero-hour-playtest.md   THE REPORT: sim results, the recommendation, limitations, balancing, how to run on the Mac
docs/plans/ZERO-HOUR-STATUS.md     status + critiques, as the other games
```

---

## 11. Milestones (in order; ⛔ = a stop for Sean unless he says to run through)

0. **The rules core and the harness.**
   - Verify `require(esm)`. Write `rules.js` and `rng.js` with every mechanic as a parameter, the throw models and
     the policies, and `zerohour-sim.cjs`.
   - Run the full matrix (§6.3).
   - Write the first report (`zero-hour-playtest.md`): the results, A v B v C1 v C2 against §10's success criteria,
     the recommended version and parameters, and Redline's recommended variant.
   - ⛔ **"Which version do we build out, with which numbers?"** The other versions stay playable.
1. **Playable on the real server** (a greybox TV page):
   - the engine, catalogue, setup overlay, Redline panel, bots with skill, and test speed;
   - a greybox TV with a flat 2D-in-3D wheel with exact arcs, the hub board, chips and the spin playing the server's
     angle;
   - the How to play explainer;
   - all versions selectable;
   - the rules, fairness and lifecycle tests, and the browser spec;
   - the full suite green;
   - Sean plays it.
2. **The wheel (hero) look-dev:**
   - 2–3 face designs at 1:1 (studio and in the room), readability tests at 2, 4 and 6 players and at a 2% arc, and
     the spin's seven beats as a strip.
   - ⛔ **"Is this the wheel?"**
3. **The room and the look:**
   - the clock tower, the city, lights, the midnight finale, the HUD in deco;
   - stills, crops, a 20 s clip;
   - **fps in real Chrome on the M1.**
   - ⛔ **"Is this the look?"**
4. **Set pieces:** the chip flights and arc growth, hot-number glows, Redline (the red line, the gamble's resolution),
   each round spin's theatre, the midnight finale, a tie or zero edge.
5. **Polish and the second report:** re-run the sims with the final numbers; the simulated customer read; duration
   measured from real bot-paced games on the server; CHANGELOG, the asset register; the final
   `zero-hour-playtest.md` with "would six friends rematch?" answered as honestly as the evidence allows.
6. **Sound** on the shared audio core (ticks, the ball, chimes, the midnight bells): after the look, as for the
   others.

---

## 12. Risks to check early

- **The core may not be fun.** The maths can make it fair; only play can make it fun. Build M1 fast and play it before
  polishing anything. If neither version is compelling, the report says so and Version C gets the build.
- **Skill flatness (H1).** If no payout or k setting gives a meaningful skill edge without killing upsets, that's a
  design problem to report, not to hide.
- **Pace.** Six players, five visits and five spins may not fit 15 minutes. Measure; propose cuts (spin length, 4
  visits at 6 players, simultaneous phase windows).
- **The decision phase is new to the platform.** Darts thrown during Redline or a spin, a tablet disconnect
  mid-decision, and a session expiring mid-spin all need tests on day one.
- **ESM / CJS:** if `require(esm)` doesn't hold on the venue's Node, the shared rules module needs a build step.
  Check `.nvmrc` and the deploy target.
- **Readability of small arcs,** and labels on a tilted face. Prototype in M1, not M2.
- **Fairness perception.** A ball that lands near an arc's edge will look rigged to someone. Draw the arc edges crisply,
  print the %, and let the ball settle visibly inside.

---

## 13. Decisions proposed (Sean to confirm or change at the M0 gate)

1. **One shared, pure rules module** for the server, the simulator and the TV demo.
2. **A continuous weighted wheel** with labelled percentages, not pockets.
3. **Server-side draws with integer weights and commit–reveal;** the TV animates to the server's angle.
4. **A floor of chips** so nobody's wedge is ever empty.
5. **Four candidates enter the harness (A, B, C1, C2)**, and the evidence picks one.
6. **"Midnight", the clock tower observatory,** as the world; the five visits are the hours to midnight.
7. **No real money, deposits, prizes or betting language** beyond "chips"; chips are points.

**Questions for Sean:**
- Is a convex payout acceptable (it breaks "chips = darts score" but may fix skill flatness)?
- Is 4 visits at 6 players acceptable if 5 can't fit 15 minutes?
- Should a corrected dart re-draw an already-drawn spin? (The proposal: no.)
