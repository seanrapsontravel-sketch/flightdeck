# Zero Hour — plan

Rewritten 2026-11-18 from Sean's brief "ZERO HOUR — Build a Premium 3D Casino Darts Game". It was amended so the
game sits in the 3D series. **This file is the whole brief**: read it top to bottom before touching code.

It **supersedes** the first Zero Hour plan (versions A/B/C, Redline, a weighted wheel, the clock tower; in git at
`f88ecb2`). The brief says to keep that plan's architectural research and drop its betting systems, so §2 (the
codebase audit, which [`MILLION-POUND-OCHE.md`](MILLION-POUND-OCHE.md) also relies on) and the commit–reveal idea
are kept, and everything else is new.

Its siblings:
- [`SHANGHAI-3D.md`](SHANGHAI-3D.md) and its status: the template, and the bar;
- [`QUACKSHOT-3D.md`](QUACKSHOT-3D.md): the process that worked;
- [`KILLER-3D.md`](KILLER-3D.md): the one that didn't, and **the art-deco world this game must not repeat** (§6);
- [`GAME-INTROS-3D.md`](GAME-INTROS-3D.md): every 3D game opens on a How to play explainer.

**Where it stands:** [`ZERO-HOUR-STATUS.md`](ZERO-HOUR-STATUS.md).

This is a **new game**: there's no 2D page and no classic. It has two tracks:
- **the game track:** the engine, the allocation, the tests, one balance check;
- **the show track:** the table, chips and wheel, built on the same kit and to the same bar as Derby through Shanghai.

---

## 0. In one paragraph

Five rounds of three darts each. Each dart scores its normal points, ×3 on that round's two **hot numbers** (drawn
from 10–20). A visit's score becomes chips, and the server scatters the chips in little stacks of two onto a standard
0–36 roulette layout, where they stay. After the last visit, one spin of a standard single-zero wheel decides it: **whoever has the
most chip value on the winning number wins**, and everyone else is placed by what they had there too.

The best player is the clear favourite (about 34–47% to win), third and fourth win now and then, and the order behind
the winner really moves (§4). Every visit **steals** a number or two from someone, the favourite's crown changes hands
about four times a six-player game, and five of six players are usually still alive when the ball is spun (§8.1).

The world is **"Salle Zéro"** (working name): an original Belle Époque gaming salon on a Riviera cliff at midnight.
It has gilt, a painted ceiling, a stained-glass laylight, emerald felt, walnut, burgundy velvet, and the harbour lights
through tall open windows.
- **The table is the scoreboard:** player-coloured chip stacks on the 37 cells of a standard layout.
- **The wheel is the finale.**
- **The signature is the sweep:** after every visit the thrower's chips slide across the felt to their numbers, the
  way a croupier pushes stacks.

---

## 1. Series lessons, and what changed from the brief

### 1.1 What we carry from the 3D series (and must not relearn)

Process (it worked on Quackshot and Shanghai):
1. **Hero first, signed off before any world.** The heroes here are **the chips and the table**, judged on
   readability first (who leads each number, from across a bar) and beauty second. The wheel is the second hero.
2. **Every element answers "what has this got to do with the game?"** (§6 table).
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
  - set `count` to only the instances in use (Shanghai's 448-lantern flock cost about 344k triangles when it
    didn't);
  - three r160 fragment shaders see `USE_COLOR`, not `USE_INSTANCING_COLOR`.
- **Procedural grids:** keep grid counts integers (a fractional count drew past its vertex buffer at Shanghai's far
  LOD).
- **LOD:** use a far version for anything big and distant; shadow casting only inside the key light's shadow box.
- **Performance:** **measure fps in real Chrome on the M1** at ≥ 2.1 Mpx, in the master and in the busiest moment,
  before calling look-dev done.
- **Composition:** points made visible must never bury the scoreboard (Shanghai's lantern clouds hid the pagoda).
  Here, stacks must never hide the cell numbers or each other.
- **State rules:** every visit's dart 3 arrives with its takeover, so queue the dart first and land it, then sweep.
  Guard late cards with "the game hasn't ended". The nothing-lies check reads the DOM and `truth()`, and every
  counted thing must also be on screen.
- **Kit and HUD:**
  - use the kit (`lib3d/kit`) and the engine presets;
  - the HUD's DOM is the readable truth;
  - names go in with `textContent`;
  - use the page's own CSS prefix;
  - every game opens on the How to play explainer.

### 1.2 What changed from the brief, and why

The brief's rules and vision stand. These are the changes needed to slot it into the series, plus one balance finding
it doesn't anticipate.

| # | Change | Why |
|---|---|---|
| 1 | **Series process with gates**: hero first (the chips and the table), then a greybox, then the wheel, then the room. ⛔ stops where marked (§13) | The brief's six milestones put the hero after the greybox and have no stops. Hero-first plus gates is what worked on Quackshot and Shanghai and what went wrong without them on Killer. Sean can say "run through" (he did for Shanghai M2→M3). |
| 2 | **Belle Époque, not art deco** (§6) | Killer's "The Ledger" is already an art-deco club at 1 a.m.: black lacquer, gold rules, a deco serif, city bokeh. The brief's casino would be its twin. Monte Carlo's own idiom is Belle Époque (gilt, frescoes, chandeliers, onyx), which is warmer, golder and different. It's still an original, fictional salon: no real casino, no Bond. |
| 3 | **The allocation is drawn in drops of 2 chips** (`DROP = 2` on the 37-pocket wheel; the brief's rule = 1), decided 2026-11-18 (§4) | With one random number per 5-point chip, the strongest of six wins 40–55% and the bottom two almost never. The drop size is the dial between "skill decides" and "anyone can win". A drop is a small stack of chips that lands on one number together. It keeps every chip and every point, and animates better (croupiers push stacks, not single chips). |
| 3b | **Places 2–6 come from the winning number too** (§3) | The brief only names a winner, but the session standings rank every place. Placing by chips on the winning number is what lets the fifth-best player finish third. |
| 4 | **"Value" is the comparison, and the HUD says it** | The brief's examples say "45 chips" but its rule says "highest chip value". Remainder chips (1–4 points) make count and value differ. The game compares **points on the number**, and the HUD prints points ("BEN 45"). |
| 5 | **The live standing is "wins on N numbers"** | The spin is uniform over the 37 pockets, and an empty pocket re-spins, so a player's true chance is the share of **occupied** numbers they lead. It's exact, it's the brief's pre-spin "winning-number map" as a number, and it reads at a glance all game. |
| 6 | **A standard single-zero (European) wheel and layout, 0–36** (§7.3; Sean, 2026-11-18: "this can be a standard 0-36 roulette wheel now") | The real wheel order and colours, and the real betting layout (0 at the head, twelve columns of three), so it looks like the real thing. Hot numbers are dartboard numbers (10–20), so they live on the board and the HUD, not the table. |
| 7 | **No new server phase for the sweep** (§8) | The sweep runs inside the existing dart-3 → takeout → intermission changeover, so pace is unchanged. Hot numbers ride the existing `round_announce` phase. The only new phases are `spin` and `shootout`. |
| 8 | **One server secret drives every draw** (allocation, hot numbers, spin), and it's stripped from the public state (§5) | `getPublicGameState` sends `gameData` whole to the TV and the tablet. A seed in `gameData` would let anyone predict the spin, and fresh randomness would let a correction re-roll it. |
| 9 | **Sound after the look** (M6), synthesised on a shared core | It's the series rule (Limbo's sound is parked for the same reason), and no third-party audio means no licence questions. |
| 10 | **No betting language beyond "chips"; chips are points** | It's a bar game with no money, deposits or prizes. "ALL BETS ARE DOWN" stays as theatre. |

---

## 2. The codebase, as it stands (audit 2026-11-18, kept from the first plan and updated)

**Adding a game** is one engine file, `src/engines/zerohour.js`, plus one row in `src/catalogue.js`
(`['zerohour', 'Zero Hour', 'social', 2, 6]`). `registry.js` and `venueConfig.js` derive from the catalogue (the
engines README is stale on this). The engine exports `init`, `initDoubles`, `handleThrow`, `handleAction`,
`aimNumber` / `aimedThrow`, `scheduled{}`, `debugPreviewPhase`, `meta`, and optionally `meta.leaderboard` +
`buildMatchRecords`. `shanghai.js` is the template. Its `scheduled` map must supply `zerohour_show_next_after_round`
(`core.js` `scheduleRoundThenNextPlayer` builds `${gameType}_show_next_after_round`) as well as `_advance_turn` /
`_after_round_announce`.

**Hard-coded lists a new game must be added to:**
- `server.js` `visitEndedAfterThrow` (~:1616) plus the queue-hold checks (~:1456, :2076, :2114): add `spin` and
  `shootout`. `playoff` is already listed (Demolition's); M1 checks whether `shootout` can simply *be* `playoff`.
- `server.js` `getPublicGameState` (:1284): strip `gameData.secret` for Zero Hour (§5).
- `server.js` FORWARD_GAME_ACTION whitelist (~:2436): no new actions are needed. There's no setup and there are no
  choices; if the shootout needs one, add it here.
- `session.js:68, :89`: add `zerohour` to the `winner_then_score` group, with the metric = total earned score.
- `control.html`: the game card (~:3252 pattern), the debug group (~:3535), the background maps (~:3868–3893); the
  Zero Hour card shows "Spinning…" and **must not print the spin result before the reveal**.
- `viewer.html`: the background maps (~:682–695). There's no classic, so no `?zerohour=classic` route and no
  `-3d.html` preview: the page is `games/zerohour.html` from day one.
- `tests/rules.test.cjs`: the all-games loop must pass with the new engine (there's no `setup` phase, so no special
  case).

**Options:** none are needed. SELECT_GAME passes no per-game options, and the brief has no choices, which is a relief.
The drop size and pace (§4, §8) are engine constants plus a debug/env override, not a setup screen.

**Corrections:** Correct Score only ever edits **the last dart** (`captureThrowUndo` clones `gameData` before each
dart; APPLY restores it and re-applies the corrected dart). So "correcting a visit" means correcting dart 3 after its
sweep. Restoring the clone removes that visit's allocation; re-applying it must re-derive the *same* placements for
the units that still exist (§5). All rules state lives in `gameData` as plain JSON, with no module-level state.

**Randomness:** everything server-side today is unseeded `Math.random()`. Zero Hour brings its own HMAC-derived
draws (§5).

**Bots:**
- **Profiles:** `dummy`, `casual`, `intermediate` and `advanced` (`core.js` wheel-scatter models), set per player via
  `isBot` / `botProfile`.
- **Aim:** `aimNumber` aims at the treble of the **highest hot number**. A bull is never hot.
- **Timing:** `BOT_DART_DELAY_MS = 1200`.
- **Results:** any bot or mock dart marks the match `matchSimulated`.

**Lifecycle:** last-dart undo, Correct Score, the throw queue, restore after restart (`sessionStore`), and timed
sessions (the deadline lets the current visit finish). **A deadline during `spin` lets the spin finish.**

**TV:** the page's `stateInbox` gets `SYNC_STATE` (with the kit's origin and parent checks); `serverNow` is in the
public state for mid-spin joins. Engines are pure, so tests and the balance sim can drive `init` / `handleThrow` /
`scheduled` with no server, as `rules.test.cjs` does.

**Kit to reuse:**
- `lib3d/engine.js` (presets plus `withPreset()`; this game adds a `salon` interior preset);
- `lib3d/director.js` (ShotDirector, eyeFit), `particles.js`, `reflection.js`, `beacons.js`;
- `lib3d/kit/` (queue, loop, hud, intro, roster, darts, demo);
- capture tools `docs/plans/tools/shanghai-cap.cjs` (a fake clock plus `?capture=1`) and `moments.cjs`.

---

## 3. The rules: the exact state contract

- **Players:** 2–6, or doubles teams. Doubles alternate throwers **by visit**
  (`doublesAdvanceThrowerAfterVisit`); a team is one colour.
- **The match:** five rounds. Each round, every player has one visit of three darts, in seat order.
- **Hot numbers:** at the start of each round, **two** distinct numbers are drawn from the double figures **10–20**
  (Sean, 2026-11-18: single figures aren't worth aiming for), the same for everyone that round. They're drawn when the round begins and announced in that round's `round_announce`. Round 1 gets one too.
- **Dart score:** `face × multiplier`, ×3 more if the number is hot (S19 hot = 57, D19 = 114, T19 = 171; T20 not
  hot = 60). Bull 25 / 50 is never hot. A miss is 0.
- **Visit to chips:** a visit's points become `floor(points / 5)` five-point chips, plus one remainder chip worth
  `points % 5` if it isn't 0. Nothing is rounded away: the sum of a player's chip values equals their total points,
  always (tested).
- **Allocation:** the chips are grouped into drops of `DROP = 2` chips (10 points; §4). The last drop may be
  smaller. Each drop, and the remainder chip on its own, goes to one of 0–36 uniformly. Placements are permanent.
  For example, a visit of 47 is 9 chips plus a 2-point remainder: four drops of 2, one of 1, and the remainder.
- **The spin**, after the last visit of round 5:
  - one uniform draw over the 37 pockets;
  - an empty pocket (no player has value there) is announced ("NO CHIPS ON 7 · SPIN AGAIN") and the wheel re-spins,
    and the chips never move;
  - the winner is the player with the **highest value** on the pocket. A tie goes to the higher total earned score;
    if that's tied too, the tied players have a one-dart shootout.
- **Places 2–6:** ordered by value on the winning number too, then by total points. Anyone with nothing on it ranks
  below everyone who has something there, ordered by total points among themselves. The session standings use this
  order (`session.js`).
- **Everyone on 0 points** (the all-zero match): a one-dart shootout before the roulette, as the brief says.
- **The shootout:** one dart each, in seat order, scored at face value with no hot numbers. The highest wins;
  players still tied throw again.
- **Darts during `spin`** are discarded, with the usual log line. Darts during `shootout` from a non-shootout
  player are ignored.

**Phase list:**
- `round_announce` (existing; it carries `{round, hot[]}`);
- `intermission` (existing);
- `playing`;
- `spin`, carrying `{draws: [pocket…], startedAt, durations}`: every re-spin is drawn up front, so the TV knows the
  whole sequence and the length of the window;
- `shootout`;
- `winner` (existing).

**The public state the TV reads** (`gameData.zh`):
```
{ round, hot: [n,n,n], drop, commit,                    // commit = sha256(secret)
  players: { [id]: { total, chips: [{v, pocket, round, k}] } },   // every chip, in arrival order
  cells:   [{ pocket, byPlayer: {id: value}, leader, tie }] ×21,  // derived, but in state so the TV never computes rules
  standings: [{ id, total, numbersLed, chancePct }],   // chancePct = numbersLed / occupied numbers (exact; ties by total)
  favourite,                                           // the id with the highest chancePct
  lastVisit: { playerId, round, points, hotDarts, drops: [{pocket, v}], steals: [{pocket, from, to}] },
  spin?: { draws, startedAt, durations, pocket, margin, neighbours: [{pocket, leader}] ×2 },
  placings?: [{ id, place, onPocket, pointsRank }],    // pointsRank lets the TV say "5th on points → 3rd"
  shootout?, winner? }
```
The TV never computes a rule. `cells`, `standings`, `favourite`, `steals`, `margin` and `placings` all come from the
engine, and the browser spec checks the TV against them.

---

## 4. Balance: the drop size and the placing rule (decided 2026-11-18: 2-chip drops on 0–36, places by the winning number)

**What Sean wants (2026-11-18):** the best player should generally win. The third or fourth player *can* win, but
not often. Upsets lower down, such as the fifth-best player finishing third, should happen sometimes.

**How it was measured:** a full-game Monte Carlo (20,000 games a line, 2026-11-18).
- **Throwers:** the `core.js` bot profiles, interpolated (dummy, casual … advanced), each aiming at the treble of
  the highest hot number.
- **Hot numbers:** three a round from 1–20, ×3 (the first draft; the build uses two from 10–20, below).
- **The spin:** uniform, with a re-spin on an empty pocket.
- **The script:** `scripts/zerohour-balance.cjs` will redo this on the real engine in M0.

These profiles are the venue's bots, not measured human accuracy, so treat the numbers as the shape, not the decimals.

**Key:** *Win %* and *Top 3 %* are listed by skill rank, best to worst. "Best last" is how often the best player
finishes last.

**Six players, a close group (advanced down to casual):**

| Drop (chips that land together) | Win % | Top 3 % | Best last |
|---|---|---|---|
| 1 chip (the brief) | 40 26 17 10 5 3 | 80 70 57 44 30 19 | 3% |
| 2 chips | 36 25 17 11 7 5 | 76 66 56 44 34 24 | 4% |
| **3 chips** | **34 24 17 12 8 5** | **73 66 55 45 35 26** | 5% |
| 5 chips | 32 23 17 13 9 6 | 72 64 54 45 36 28 | 4% |

**Six players, a wide bar spread (advanced down to a total novice):**

| Drop | Win % | Top 3 % |
|---|---|---|
| 1 chip | 55 25 11 5 2 1 | 90 76 58 37 24 14 |
| 2 chips | 48 25 14 7 4 2 | 86 72 57 39 27 18 |
| **3 chips** | **44 25 14 8 5 3** | **83 70 56 40 29 22** |
| 5 chips | 42 24 15 9 6 4 | 81 68 55 40 32 24 |

**Four players (advanced to casual):** 1 chip 54 28 13 5 · 2 chips 50 28 15 7 · **3 chips 47 28 16 9** · 5 chips
45 28 17 10.

**Placing rule for 2nd–6th** (six players, close group, 2-chip drops; Top 3 %):

| Places after the winner by… | Top 3 % | Best last |
|---|---|---|
| Total points | 92 80 62 38 20 9 | 0% |
| The winning number plus half its wheel neighbours | 85 74 58 42 27 15 | 2% |
| **Value on the winning number, then total** | **76 66 56 44 34 24** | 4% |

What it shows:
- **Real scores are noisy** (hot trebles come and go), so the brief's rule is less one-sided than the fixed-total
  model in the first draft of this section suggested. It still leaves the bottom of a wide group almost no chance.
- **The drop size sets the winner spread.** Bigger drops make each number's leader more random.
- **The placing rule sets the mixing lower down.** Placing by total points freezes the order behind the winner.
  Placing by the winning number is what makes "fifth comes third" happen (about a third of the time in a close
  group).
- **Things that barely move it:** hot ×2 against ×3 (a point or two), and doubling round 5's chips (under a point).
  Keep both for their drama, not for balance.
- **Re-spins** stay rare at 1–3 chips (0–2% of games; 6% at four players with 5-chip drops).

**The build (2026-11-18): a standard 37-pocket wheel, two hot numbers from 10–20, drops of 2 chips.** Sean moved to
a standard 0–36 wheel and two double-figure hot numbers after the tables above. More pockets spread the same chips
thinner (more luck per drop, more empty pockets), so the drop size came down from 3 to 2 to keep the same balance and
keep re-spins rare. Measured on the **real engine** (`node scripts/zerohour-balance.cjs 1000`, bot profiles):

| Line-up (strongest first) | Win % | Top 3 % | Steals a visit | Re-spin games |
|---|---|---|---|---|
| Six, close (adv · int · int · cas · cas · cas) | 42 19 17 7 8 7 | 81 60 59 34 34 32 | 2.35 | 0% |
| Six, wide (… · dummy) | 44 20 20 6 8 3 | 81 61 66 35 38 20 | 2.18 | 0% |
| Four (adv · int · cas · dummy) | 57 27 11 6 | 96 90 72 43 | 1.99 | 1% |
| Four, all intermediate | 24 24 25 26 | 75 74 76 76 | 3.46 | 0% |
| Two (adv · cas) | 80 20 | — | 1.28 | 3% |

The first draft's recommendation, kept for the record:

**Recommendation (21 pockets): drops of 3 chips (15 points) and places by value on the winning number.**

| Table | Best | 3rd | 4th | 5th finishes top 3 |
|---|---|---|---|---|
| Six, close group | 34% | 17% | 12% | 35% |
| Six, wide spread | 44% | 14% | 8% | 29% |
| Four | 47% | 16% | 9% (4th = last) | — |

The best player is always the clear favourite (2–3 times a fair share at six). Third and fourth win now and then.
The order behind the winner is genuinely shuffled by the spin. If the best should win more often, use 2-chip drops
(48% in a wide group); if less, 5-chip drops. `DROP` is one constant.

---

## 5. Randomness, allocation, corrections and recovery

- **One secret per match:** `gameData.secret` (32 random bytes from `crypto`), made at `init`.
  - It's **stripped from the public state** and never sent to the TV or the tablet.
  - It's persisted with the session (so a restart restores it).
  - `commit = sha256(secret)` is public from the first dart and shown in small type on the TV.
  - The secret is revealed in the match record after the game, so anyone can recompute every draw.
- **Every draw is `HMAC(secret, label)` → an unbiased integer** (rejection sampling, no modulo bias):
  - hot numbers: `hot:<round>`;
  - a drop's pocket: `drop:<playerId>:<round>:<k>`, where *k* is the drop's index in that visit;
  - the remainder chip: `rem:<playerId>:<round>`;
  - the spins: `spin:<n>`.
- **What that buys:**
  - **Corrections are deterministic.** Correcting dart 3 from T20 to S20 restores the pre-dart clone and re-applies
    it: the first drops land exactly where they did, the surplus disappears, and no other visit is touched (they
    were never re-drawn).
  - **Restarts are safe.** The restored secret gives the same draws.
  - **A correction can't re-roll the spin.** `spin:<n>` doesn't depend on chips or time. It's fixed (though unknown)
    from the first dart, so nothing done during the match can steer it.
  - **No manufactured drama:** the same deceleration curve for every spin, and no near-miss shaping.
- **Mid-spin correction:** Correct Score is refused once `spin` has begun (`canCorrectScore` is false). Before that,
  the last dart of the match can be corrected normally.
- **The TV on reconnect or refresh:** it builds the whole table from `players[].chips` in one frame (stack position
  is the chip's index among that player's chips in that cell), with no replay. In `spin`, it jumps to
  `serverNow − startedAt` in the deterministic spin timeline.
- **Repeated or delayed events:** chips are keyed `(player, round, k)`. The TV diffs the old and new chip sets:
  - new chips sweep;
  - vanished chips (a correction) lift and fade back to the bank;
  - unchanged chips never move.

---

## 6. Creative direction — "Salle Zéro"

The eighth mood in the series:
- Derby: golden afternoon;
- Demolition: industrial night;
- Limbo: lagoon dusk;
- Killer: a cold, rainy art-deco tower;
- Quackshot: fairground blue hour;
- Shanghai: temple sunset to night;
- Million Pound Oche: a prime-time studio;
- **Zero Hour: a warm, gilded Belle Époque salon at midnight.**

**Kept apart from Killer's "The Ledger" on purpose:**

| | The Ledger (Killer) | Salle Zéro (Zero Hour) |
|---|---|---|
| Period | Art deco, 1930s | Belle Époque, 1890s |
| Temperature | Cold: rain, blue city, black | Warm: candle-gold, emerald, burgundy |
| Surfaces | Black lacquer, marble, chrome-brass rules | Gilt mouldings, walnut, velvet, onyx columns, painted ceiling |
| Outside | A rain-streaked glass wall, city bokeh | Tall open windows, a terrace, harbour and yacht lights, the sea |
| Type | Condensed deco serif | A high-contrast Didone with engraved small caps |

**Originality:** a fictional salon. No real casino's name, building, logo or chip design; no "Monte Carlo" or
"Monaco" in-game; no Bond (no 007, tuxedo silhouettes, gun barrel or theme-like music).

| Element | What it is | Why it belongs |
|---|---|---|
| **The table** (hero) | A walnut-railed table with emerald felt, the standard gold-ruled 0–36 layout, a brass border and inlays; each cell has six fixed stack spots, one per seat | The scoreboard: who's where, who leads each number, how the table filled |
| **The chips** (hero) | Player-coloured clay-composite chips: real thickness, a bevelled edge, repeated edge spots, an inlaid centre medallion, gloss with micro-texture | Your score, made physical; every chip is a point you earned |
| **The cashier tray** | Each seat's brass-and-walnut tray at the table's near rail | Where a visit's chips appear before the sweep; the bank total |
| **The wheel** (finale hero) | A standard single-zero wheel at the head of the table: a walnut bowl, a brass turret and cross, an ivory ball | The one spin that decides it |
| **The hot numbers** | Gold wedges and gold number discs on the dartboard (always on screen in the porthole), gold numbers in the HUD | What to aim for. Not on the table or the wheel: those run 0–36 and the chips land at random, so gold cells there would mislead |
| **The porthole** | A gilt-ringed live view of the dartboard at the top of the screen (a second camera into a render target) | The master has to hold the whole 37-cell table, which leaves no room for the board; the porthole keeps every dart and the hot wedges in view without moving the camera |
| **The dartboard** | Mounted in a gilt frame on the salon wall behind the table, in frame on the master; darts stick in the exact bed | The truth of every dart, as in every game in the series |
| **The room** | Columns, a painted ceiling, the laylight, chandeliers (dimmable), velvet banquettes, the windows to the harbour; no people | Atmosphere, held quiet so the table reads |
| **Escalation** | The chandeliers lower and dim round by round; round 5 is lamp-lit; the spin is a pool of light on the wheel | The night closing in toward zero hour |

---

## 7. The heroes

### 7.1 The table and its layout
- **The layout** is the standard single-zero layout: 0 in a tall cell at the wheel end, then twelve columns of three
  (1-2-3 … 34-35-36), the 3-6-9 … 36 row farthest from the players. Filmed from the long side.
- **A cell** holds 6 stack spots in a 3 × 2 grid, always in seat order, so seat 1 is top-left in every cell.
  Ownership reads by position as well as colour.
- **Scale:** 42 mm chips on a cell of 160 × 140 mm; the layout is 2.08 m with the zero, the wheel beside it.
- **The leader light** is always on, subtly: each cell's brass rim takes the colour of its current leader (or
  two-tone for a tie). It strengthens before the spin into the brief's "winning-number map". It comes from
  `cells[].leader`, never computed on the TV.
- **Readability (the first gate, ahead of beauty):** on a 1080p TV at 4 m, at 2, 4 and 6 players, round 1 and round
  5, you can read every cell's number, every player's colour and who leads each cell.

### 7.2 The chips
- **Geometry and look:** a lathe profile with a bevel and an edge-spot band. The colours and patterns are in a
  shader: player colour, edge spots, a centre medallion with a seat glyph, and micro-texture.
- **Colours:** six player colours that read on emerald felt and are distinct from the hot gold and the wheel's
  red/black/green. Start from the kit `roster` palette; replace any that fail on felt. **A second cue for colour
  blindness:** the edge-spot count or pattern differs per seat.
- **Remainder chips** (1–4 points) are smaller "fractional" chips (they're real value, and visibly so).
- **Rendering:**
  - one `InstancedMesh` for resting chips and one for chips in flight;
  - per-instance colour and seat;
  - `count` = only the chips in use;
  - `frustumCulled = false`;
  - two LODs (24 and 12 segments).
- **Stacks:** a stack is drawn chip by chip up to 40 high. Beyond that, the stack becomes an aggregate cylinder
  textured as stacked edges, at the exact height. The value is always printed in the DOM, so geometry never has to
  be the number.
- **The 1:1 review:** the edge spots, the bevel highlight, the contact shadow, and a 6-colour stack row on felt.

### 7.3 The wheel
- **37 equal pockets, the standard European wheel:** 0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8,
  23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26 clockwise, the standard reds (1, 3, 5, 7,
  9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36), a green 0. Recorded in `rules.mjs` as `WHEEL_ORDER` / `REDS`.
- **Parts:** a walnut bowl, a brass cone and four-arm turret, pocket frets, diamond deflectors on the ball track,
  and an ivory ball.
- **Determinism:** the spin is a **timeline, not physics**:
  - the rotor's angle *θ(t)* and the ball's *φ(t)* are closed-form decays over a fixed duration;
  - the start phase is solved so the ball rests in the server's pocket at *t = end*;
  - the ball's bounces are keyframes from a seeded noise (`spinId`), the same every playback and independent of fps;
  - the browser spec checks that the final pocket under the ball equals `spin.draws[last]`.

---

## 8. What keeps it gripping, the moments and their timing

### 8.1 Engagement design (no new rules: players still only throw darts)

The brief's game has no choices, so the drama has to come from **showing, honestly, how every visit changes who can
win**. A full-game sim at the recommended settings (§4; 10,000 games, 2026-11-18) says there's plenty to show:

| Six players | |
|---|---|
| Numbers that change leader per visit ("steals") | **1.6 on average**: nearly every visit takes something from someone |
| Changes of favourite (the player leading the most numbers) per game | **4.2** |
| Players still leading at least one number at the spin | **5.1 of 6** (at least 3 alive in 100% of games) |
| Spins where the runner-up on the winning number is within one drop (15 points) | **66%** |

(At four players: 1.6 steals a visit, 2.8 favourite changes, 3.7 of 4 alive. Two players is a duel with 0.6 favourite
changes a game; see §14.)

The features that turn those numbers into moments:
1. **Steals are the payoff of every visit.** When a drop takes a number:
   - the cell's brass rim snaps from the old leader's colour to the new one;
   - the old leader's stack dims for a beat;
   - a card reads "SEAN TAKES 14 FROM BEN".
   
   Two or more steals in one visit get one card, "SEAN TAKES 3 NUMBERS". It comes from `lastVisit.steals`.
2. **Live odds, always on:**
   - the standings strip is ordered by chance, not points: "BEN · 6 NUMBERS · 29%";
   - **the favourite** wears a small gold crown in the strip;
   - when the crown changes hands it gets its own beat: "NEW FAVOURITE: ALI".
   
   Points are still shown, smaller. The chance is exact: §3's `chancePct`, because a re-spin skips empty numbers.
3. **The hot dart is the second payoff.** "HOT ×3", the count-up and the gold flare already show it. A hot treble
   also gets the chip close-up camera, at most once a round so it stays special.
4. **Last Orders (round 5):** presentation only, the same rules.
   - The salon dims to lamp light.
   - Each player's visit opens on a card, "LAST VISIT · 4 NUMBERS · 19%".
   - The final thrower of the match gets the visit camera and "LAST DARTS OF THE NIGHT".
5. **The ball tells the story.** During the spin, every pocket's rim glows in its leader's colour, so as the ball
   passes a pocket, the room sees whose number it's on. As it slows, each pass is a shout. This is honest: the rims
   are `cells[].leader`, and the ball's path is the same deterministic curve every spin (§7.3).
6. **The reveal says how close it was:**
   - the winner, their value on the number and the runner-up's: "NUMBER 14 · BEN 45 · SEAN 40";
   - "ONE DROP IN IT" when the margin is ≤ 15 (`spin.margin`);
   - the near misses: "NEXT DOOR: 20 (ALI) · 5 (SEAN)", from `spin.neighbours`.
7. **Upsets are celebrated, not hidden:**
   - the final placings card shows each place with the points rank beside it ("ALI · 3RD · 5th on points ↑");
   - a winner who wasn't top on points gets "FROM 4TH ON POINTS" on the winner card.
8. **Announcer lines** go through the shared callout scripts the other 3D games use: "Hot nineteen!", "Rien ne va
   plus", "Number fourteen". No film or television audio.
9. **Tempo:**
   - the sweep plays inside the changeover (below);
   - a six-player game is about 15 minutes of darts plus a minute of finale;
   - the celebration is ≤ 8 s;
   - **rematch is one tap** (the existing RESET_MATCH) within 15 s of the reveal.

The hot numbers stay purely random. Only 2% of rounds have a hot treble worth less than T20 (a real "chase it or go
T20?" choice); that's rare enough to be a nice surprise rather than a system.

### 8.2 The moments and their timing

**The sweep fits inside the existing changeover.** Dart 3 lands, then takeout (the players pull their darts, usually
3–8 s), then the 2.5 s intermission. The sweep is about 3 s from dart 3, so pace is unchanged. If the next player's
first dart arrives mid-sweep, the TV fast-forwards to the end state (interruptible by design).

| Moment | What happens | Time |
|---|---|---|
| Round start (`round_announce`) | The two new hot wedges light gold on the board and the porthole pulses; the card reads "ROUND 2 · HOT NUMBERS 19 · 14" | 3.0 s (the existing window) |
| A dart | It sticks truthfully; "+60" floats from the bed; its chips clack into the thrower's tray | 0.8 s |
| A hot dart | A gold flare on the wedge and its table cell; "HOT ×3"; the score counts 19 → 57; a distinctive chime; a bigger cascade into the tray | 1.4 s |
| The sweep (after dart 3) | "SEAN SCORES 114 · +114 CHIPS"; the tray's drops lift and slide across the felt in a staggered fan; each settles with a tiny bounce and a click; the receiving cells glow; **steals** snap their rim to the thrower's colour with a "TAKES 14 FROM BEN" card; a changed favourite moves the crown | 2–4 s (it scales with the drops, in grouped batches; at 2 chips a drop a visit is ~3–30 landings) |
| The pre-spin | The lights dim; "ALL BETS ARE DOWN"; a wide shot of the full table; the leader map strengthens; the HUD shows each player's "wins on N numbers" | 6 s |
| The spin | The wheel hero shot; the rotor turns; every pocket rim glows its leader's colour; the ball launches the other way; the ball camera follows; the room quietens; each slow pass lights the pocket under it; the ball drops and rattles into the pocket | 12 s |
| A re-spin (empty pocket) | "NO CHIPS ON 7 · SPIN AGAIN"; a short spin | 6 s |
| The reveal | A cut to the table; the winning cell lights; its stacks are the focus; the card reads "NUMBER 14 · BEN 45 · SEAN 40 · BEN WINS ZERO HOUR", plus "ONE DROP IN IT" and "NEXT DOOR: 20 (ALI) · 5 (SEAN)" when true | 5 s |
| The celebration | A gold sweep across the felt; the winning stacks glow; a few chips rise and spin; the room takes the winner's colour; "FROM 4TH ON POINTS" if it's an upset | ≤ 8 s |
| The placings | The final card: every place with its points rank beside it (↑ / ↓ arrows for movers); Rematch | until rematch, then the existing winner flow |

The server's `spin` window = pre-spin + spins + reveal, fixed by `spin.durations`, so every TV is in step.

**Fast mode:**
- `?fast=1` on the TV, for testing, halves the sweep and the spin;
- `ZEROHOUR_PACE=fast` on the server (env, or the debug panel if it already has a pace control; check in M1) shortens
  the server windows to match;
- `?reduced=1`, or `prefers-reduced-motion`, swaps flights for fades and cuts for camera moves.

**Cameras** (a ShotDirector subclass; the master by `eyeFit`, from the table's real bounds):
- `master`: the table long side, the wheel at the left, the board in frame. The pitch is steep enough that tall
  stacks don't hide short ones behind them;
- `visit`: the thrower's tray and the near half of the table;
- `chip`: a close-up, used sparingly (a hot visit, the first sweep of the game);
- `wheel`, `ball`, `winner`.

The camera rests on the master during ordinary play.

**HUD** (Didone + small caps; the DOM is the readable truth; names via `textContent`; `--zh-*` CSS prefix):
- the thrower card: name, colour, darts left, each dart's points (hot ones in gold);
- the round "ROUND 3 OF 5";
- the hot numbers;
- the standings strip, ordered by chance: per player colour, **"N numbers · chance %"**, total points (smaller),
  and the favourite's crown;
- the sweep card, with steals;
- the round-5 "LAST VISIT" cards;
- the spin cards and the winner card;
- the commit hash in small type;
- help and How to play (a 20-second explainer: the brief's own script, on `lib3d/kit/intro.js`).

---

## 9. Sound (M6, after the look; on a shared synth core, no third-party audio)

The sounds:
- the chips: appear, clack into a tray, slide on felt, land on a stack, settle;
- the hot hit;
- the rotor's rumble, the ball circling, the ball's rattle into a pocket;
- the reveal, and a victory flourish;
- a quiet room tone.

Each is scheduled from the same timeline as the animation (so it's in sync by construction). There's a volume
setting, and sound is off by default until M6 is signed off (Limbo's rule).

The synth starts as `lib3d/audio.js`, promoted from `limbo/audio.js` if that fits; otherwise it's built here and
Limbo adopts it later. Either way, Limbo is untouched.

---

## 10. Performance budget

Target: **60 fps at ≥ 2.1 Mpx in real Chrome on the M1** (Claude in Chrome), in the master and in the busiest
moment.

**Build to:**
- ≤ 1 shadow-casting key light, with the shadow box on the table;
- the room in a far LOD;
- every light made at load at intensity 0;
- `renderer.compile` at boot;
- the reflection probe baked once per round, not per frame.

**The busiest state, tested explicitly:** 6 players, 5 rounds, high scores (inject about 3,000 chips via
`__zerohourDemo.force('full')`), a sweep in flight and the leader map pulsing.

---

## 11. File plan (as built, 2026-11-18)

```
public/games/zerohour/rules.mjs    THE rules (pure ES module): scoring, hot, chips, drops, cells/leaders/standings, steals, spin draws,
                                   placings, WHEEL_ORDER — required by the server (Node >= 22.14 loads ESM with require), the tests and the demo
src/engines/zerohour.js            the engine: turn flow, HMAC draws from the match secret, commit, spin/shootout/finish, bots, previews
src/catalogue.js                   + ['zerohour','Zero Hour','social',2,6]
src/server.js                      'spin' in the two match-over phase lists (darts are ignored); gameData.secret stripped in getPublicGameState
src/session.js                     zerohour → 'engine_standings' (the winner phase supplies every player's place)
public/control.html                game card, debug group (Next / Spin / Winner), background maps
public/viewer.html                 background map; public/assets/zerohour/bg.jpg (a render)
public/games/zerohour.html         the 3D TV page (HUD styles)
public/games/zerohour/             common, table, chips, wheel, board (+ porthole), room, director, hud, game, demo, intro, main
scripts/zerohour-balance.cjs       balance on the real engine with the venue's bot profiles (§4)
tests/zerohour-rules.test.cjs      rules, draws (χ²), the engine's turn flow, corrections, restart, spin, shootouts, doubles, the secret
tests/zerohour-host.test.cjs       a whole game through the real server: the secret never sent, darts in the spin ignored, session places
tests/browser/zerohour.spec.cjs    nothing lies through a whole game; the ball rests in the server's pocket; a refresh rebuilds the table
tests/browser/intros.spec.cjs      + Zero Hour (How to play)
docs/plans/tools/zerohour-look.cjs the review renders (→ docs/plans/zerohour-lookdev/m0/)
docs/plans/ZERO-HOUR-STATUS.md     status + critiques
```

---

## 12. Quality gates (each review: 1920×1080 stills, 1:1 crops, a 4 m readability check, written critique fixed before sending)

The brief's ten questions are the checklist. In short:
1. Credible in a premium venue?
2. A distinct, original salon (not Killer's)?
3. Do the chips convince at 1:1?
4. Is the sweep satisfying, and is it under 4 s?
5. Can you tell who owns and who leads each cell from 4 m?
6. Is the table beautiful and readable when full?
7. Is the wheel worth the finale?
8. Is it exciting without wasting time?
9. Is the winner obvious in one second?
10. Would someone watching want to play?

---

## 13. Milestones (in order; ⛔ = a stop for Sean unless he says to run through)

The brief's M1–M6 map onto the series' hero-first order like this:

0. **The rules core, the balance check, and the chip-and-table hero.**
   - `rules.js` and `draw.js` with their unit tests; `zerohour-balance.cjs` (§4) on the real rules.
   - 2–3 chip designs and 2–3 table layouts at 1:1 and full frame: at 2, 4 and 6 players, round 1 and round 5.
   - A first **sweep motion study** (a clip), because it's the signature and should be judged early.
   - The balance script confirms §4 and §8.1 on the real engine; if it disagrees by more than a few points, the
     report says so and proposes the `DROP` that hits Sean's target.
   - ⛔ **"Is this the chip, the table and the sweep?"**
1. **Greybox that plays the real game** (the brief's M1):
   - the engine, the catalogue and every hard-coded list (§2);
   - a greybox table, chips and stacks; a greybox wheel landing on the server's pocket; How to play;
   - the rules, draws and lifecycle tests and the browser spec; the full suite green;
   - shown to Sean.
2. **The wheel hero** (the brief's M3): the modelled wheel at 1:1 from 3+ angles, the spin timeline, and a test of
   100 seeded spins that all land on their server pocket at 30, 60 and 120 fps. ⛔ **"Is this the wheel?"**
3. **The salon and the look** (the brief's M4): the room, the lighting and escalation, the HUD; stills, crops, a 20 s
   clip; **fps in real Chrome**. ⛔ **"Is this the look?"**
4. **Set pieces** (the brief's M2 animation + M5): the hot reveal, the hot dart, the full sweep, the pre-spin map,
   the steal card, a favourite change, Last Orders, the spin theatre with the leader-coloured rims, the re-spin, the
   reveal (with "one drop in it" and the neighbours), an upset celebration, the placings card, a tie, and the
   shootout. Strips plus `moments.mp4`.
5. **Game flow and stability:** 6 players with long names, doubles, corrections and reconnects in the browser, fast
   and reduced modes, the busiest-state fps, CHANGELOG.
6. **Sound,** then the final status and how to run it on the Mac (the brief's M6).

---

## 14. Risks to check early

- **Balance (§4):** the sims use the venue's bot profiles, not real players. If the real-engine sim or real play
  disagrees, change `DROP` (one constant), not the rules.
- **Two players is the weakest table:** a duel with few favourite changes. It's still a fair game; the How to play
  and the attract copy should suggest 3–6.
- **Steal-card fatigue:** at 1.6 steals a visit, a card every visit could get old. One combined card a visit, no
  card for a steal of an empty-ish number (the old leader had ≤ 1 drop there), and the crown change outranks a steal.
- **Occlusion:** tall near stacks hiding far cells at a shallow camera. Prototype the master pitch in M0, not M3.
- **The tablet spoiling the spin:** the control card must hold the result until the reveal (a browser check).
- **The secret leaking:** a test asserts `getPublicGameState().gameData.secret` is undefined, and that match records
  carry it only after the game ends.
- **Six chip colours on green felt:** a colour-blindness check (deuteranopia simulation) in M0.
- **A sweep arriving mid-takeout or a fast next dart:** the interrupt path is tested in the browser spec.

---

## 15. Decisions (made 2026-11-18; Sean: "update the plan with your recommendations of a fun, engaging game")

1. **Balance:** drops of **2 chips** (10 points) on the 37-pocket wheel; **places 2–6 by value on the winning number**,
   then by total points.
   Sean's target: the best player generally wins, third and fourth sometimes, and upsets lower down (§4).
2. **The world:** the Belle Époque **"Salle Zéro"** (a working title), kept clear of Killer's art deco.
3. **The wheel:** a standard single-zero European wheel and layout, 0–36 (Sean, 2026-11-18). Two hot numbers a round,
   from 10–20 only, shown on the board and the HUD.
4. **The leader light:** subtle all game, strong before the spin; the pocket rims carry it during the spin.
5. **The engagement layer (§8.1):** steals, live odds with the favourite's crown, Last Orders, the leader-lit spin,
   "one drop in it", upset placings, one-tap rematch. It's all presentation of engine state; no new rules.
6. **The gates:** held (the series rule). Sean can say "run through" at any point.

Still open: none needed to start M0. The M0 gate judges the chips, the table and the sweep; the M2 and M3 gates judge
the wheel and the look.
