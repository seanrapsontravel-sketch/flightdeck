# Zero Hour — status

Plan: [`ZERO-HOUR.md`](ZERO-HOUR.md). Updated 2026-11-18.

## Where it stands

- **Built 2026-11-18 (Sean: "build it"):** the rules, the server engine and every hook, the tests, the balance
  script, and a **playable TV page**: a greybox salon round a real table, real chips and the sweep, a modelled wheel,
  the HUD and How to play. This is Milestone 0's hero (the chips, the table and the sweep) and Milestone 1 (it plays
  the real game) together, because the greybox needed the hero chips to be judged at all.
- **⛔ STOP: the Milestone 0 gate.** "Is this the chip, the table and the sweep?" The wheel hero (M2) and the salon
  (M3) wait for that answer.
- **Sean's rule changes during the build:**
  - **2 hot numbers a round, from 10–20 only** ("double 1 is 2, not worth aiming for"). The same pair for every player
    that round. "Per visit" was read as per round, because each player getting their own pair would be unfair (one
    gets 20 and 19, the next 10 and 11). Flagged for Sean to confirm.
  - **A standard 0–36 wheel** (single zero, European order and colours) and the standard betting layout. To keep
    the balance on 37 numbers, the drop came down from 3 chips to 2 (plan §4).
  - Because the table now runs to 36, **hot numbers live on the dartboard and the HUD only**, not on the table or
    the wheel.

## How to run it on the Mac

| What | Command / URL |
|---|---|
| The server (mock board) | `npm run dev` → https://localhost:4000 |
| A real game | control tablet → Social → **Zero Hour** → Play (the TV picks up `games/zerohour.html`) |
| Short spin windows for testing | `ZEROHOUR_PACE=fast npm run dev` (the spin is 0.4× as long) |
| The TV on its own, simulated | `https://localhost:4000/games/zerohour.html?demo=1&players=6` (`&long=1` long names, `&skip=20` play 20 visits at once, `&seed=7`, `&fast=1`, `&intro=0`) |
| Jump to the spin in the demo | browser console: `__zerohourDemo.toSpin()` (also `.force('hot3')`, `.skip(n)`, `.pause()`, `.resume()`) |
| Review renders | `node docs/plans/tools/zerohour-look.cjs` → `docs/plans/zerohour-lookdev/m0/` |
| How to play renders | `node docs/plans/tools/intros.cjs docs/plans/zerohour-lookdev/m0/intro zerohour` |
| Balance on the real engine | `node scripts/zerohour-balance.cjs 2000` |
| Tests | `npm test` (90, Zero Hour's included), `npx playwright test tests/browser/zerohour.spec.cjs`, `npx playwright test tests/browser/intros.spec.cjs -g "Zero Hour"` |

## What's built

**Rules** (`public/games/zerohour/rules.mjs`, the single copy, required by the server and imported by the TV demo):
- scoring with hot ×3; 5-point chips with nothing rounded away (the remainder is a small chip);
- drops of 2 onto 0–36;
- leaders: value, then total points, then a tie;
- the exact chance (the share of occupied numbers led);
- the favourite and steals;
- the spin draws (empty pockets re-spin) and the placings.

**Engine** (`src/engines/zerohour.js`):
- **Turn flow:** the turn flow on core's round and intermission helpers. The sweep fits inside the changeover, and
  the only new phase is `spin`. The shootout is a `playing` sub-mode, so the queue drains correctly.
- **Draws:** every draw is an HMAC of a per-match secret (rejection-sampled, unbiased). So a corrected dart 3
  re-lands the surviving drops exactly where they were, a restart re-derives everything, and nothing in the match
  can steer the spin.
- **Commit–reveal:** `zh.commit` is the secret's sha256 (on screen in small type); the secret is revealed in the
  state at the end.
- **Session places:** the winner phase hands the session every player's place (doubles members included).

**Server:** two one-word additions (`'spin'` in the match-over phase lists, so a dart during the spin is ignored, not
held for a shootout) and the secret strip in `getPublicGameState`. Plus the catalogue row, the session ranking label,
the tablet's game card, debug group and backgrounds.

**TV** (`games/zerohour.html` + `games/zerohour/`):

| Part | What it does |
|---|---|
| The table | Felt printed with the standard layout. A leader rim per cell in the leader's colour (subtle all game, strong before the spin), landing glows, a tray per seat. |
| The chips | One instanced mesh. A lathed, bevelled 42 mm chip with procedural decoration: edge inserts round the rim and down the side, a gold ring, and an ivory medallion with the seat's pips (1–6), the colour-blind cue. The pale (ivory) player gets charcoal inserts and dark-gold pips. Stacks are in seat order in every cell. A cheap stand-in casts the shadows. |
| The sweep | After dart 3 the visit's drops leave the tray in a staggered fan, slide in low arcs, settle with a bounce, and flash their cells. Then the rims, the standings and the crown update, and a steal or new-favourite card shows. |
| The wheel | Walnut bowl, brass rim and turret, frets, diamonds, the pocket ring with numbers, an ivory ball. The spin is a closed-form timeline that lands in the server's pocket at any frame rate; a mid-spin join jumps to the right moment. Pocket rims glow in the leader's colour, and the pocket under the ball lights as it passes. |
| The porthole | A live, gilt-ringed view of the dartboard at the top of the screen, from a second camera. The hot wedges glow gold; darts stick in the exact bed. |
| The HUD | Round + LAST ORDERS, the two hot numbers, the thrower card (hot darts gold), the standings ordered by chance with the favourite's crown, and the cards: HOT ×3, SCORES · +CHIPS, TAKES 14 FROM BEN, NEW FAVOURITE, UP NEXT / LAST VISIT, ALL BETS ARE DOWN, NO CHIPS ON n · SPIN AGAIN, NUMBER n · ONE DROP IN IT, WINS ZERO HOUR · FROM 4TH ON POINTS. The final placings show each player's points rank (↑ ↓). |
| How to play | Three pages on the kit explainer. |

## Tests (all green 2026-11-18)

**Unit and host tests:**
- `npm test`: 90/90 on the combined tree (Million Pound Oche's work included), with the 21 Zero Hour tests;
- `tests/zerohour-rules.test.cjs`: 20 tests. Every scoring form; chips equal points for 0–600; leaders, chance and
  placings; the standard wheel; draw determinism and χ² uniformity; a full game; the sweep's steals; correcting
  dart 3 (only the tail changes); a JSON restart continuing identically; darts ignored in the spin; the all-zero
  shootout; a level shootout; a tie on the number; doubles placing every member; the secret.
- `tests/zerohour-host.test.cjs`: a whole game through the real server. No state update ever carried the secret; a
  dart in the spin changed nothing; the revealed secret matches the commit; the session result's places equal the
  engine's.

**Browser tests:**
- `tests/browser/zerohour.spec.cjs` (2 tests). A whole 3-player game through the tablet. After every visit the TV
  must show exactly the state: every chip in its number and seat spot, every rim, every standings card and the
  crown, and the hot numbers on the HUD and the board. The ball rests in the server's pocket, the reveal names it,
  and the winner and placings are in the DOM. Also: a TV refresh rebuilds the whole table without replaying the
  sweeps.
- `tests/browser/intros.spec.cjs` with Zero Hour added.

## Balance (real engine, `node scripts/zerohour-balance.cjs 1000`)

| Line-up (strongest first) | Win % | Top 3 % |
|---|---|---|
| Six, close | 42 19 17 7 8 7 | 81 60 59 34 34 32 |
| Six, wide | 44 20 20 6 8 3 | 81 61 66 35 38 20 |
| Four | 57 27 11 6 | 96 90 72 43 |
| Four, even | 24 24 25 26 | — |
| Two | 80 20 | — |

This meets Sean's target: the best player generally wins, 3rd and 4th sometimes, and the 5th-best finishes top three
about a third of the time.
- **Engagement:** about 2 steals a visit, 3 favourite changes a six-player game, and 5.5 of 6 still leading a number
  at the spin.
- **Re-spins:** 0–3% of games.

## Review renders (M0) — `docs/plans/zerohour-lookdev/m0/`

| File | What it is |
|---|---|
| `1-master-{2,4,6}p-round1` | The empty table at each size |
| `2-master-{2,4,6}p-round5` | The full table at each size |
| `3-chips-cell-*` | The chip close-up |
| `crops/` | 1:1 at TV pixels: chips, layout, wheel, porthole |
| `4` to `9` | The spin: all bets are down, the wheel, the ball, the reveal, the winner, the placings |
| `10-sweep.mp4`, `10-sweep-filmstrip.jpg` | A big hot visit sweeping onto a busy six-player table |
| `intro/` | The three How to play pages |
| `contact-sheet.jpg` | Everything above on one sheet |

### Critique (written before sending; what's fixed, what's left)

**Fixed:**
- The first master framed neither the whole table nor the wheel, and the board was off the top of the shot. The
  porthole solved it: the master holds the full 37-cell table and wheel, and the board stays on screen.
- Landing glows washed big visits' cells pink, and the ivory player's glows and rims went milky white. Glow now
  scales by brightness, and rims for pale colours are toned down.
- The ivory player's chips had invisible inserts and pips. They now have charcoal inserts and dark-gold pips, the
  classic black-and-white chip. A first try with burgundy inserts read too close to the scarlet player.
- The felt printed six tray recesses even at two players. Removed.
- The standings text was too small for 4 m. It's bigger now.
- The hot wedges in the porthole were faint. Brighter now.
- The reveal said "ONE DROP IN IT" when two players were exactly level and it was decided on points. It now says
  "LEVEL — MORE POINTS WINS".
- The demo stalled when resumed after its pending step had fired while paused (a kit `demoTimer` behaviour). The
  Zero Hour demo now resumes from the phase.

**Left for Sean's eye, or the next milestones:**
- **Readability at 37 cells.** In the master a chip is about 25 px. Stacks read as colour clusters, and the leader
  rims are what carry who-leads-what. Still to do: check on the TV at 4 m. If it's too small, the near rail and trays
  (about a quarter of the frame) can give way to a tighter master.
- **The sweep's feel.** A big hot visit is now about 30 landings, in about 2 s. It needs judging in motion
  (`10-sweep.mp4`): is it satisfying, or too busy?
- **The wheel** is modelled but greybox-lit; the number band is small at master size. That's the M2 hero work: the
  materials, the ball's glints, the cone, the hero angles, the 100-spin landing test at several frame rates.
- **The salon** is a greybox: a wall, pilasters, sconces and a lamp. The Belle Époque room is M3.
- **No sound** yet (M6, the series rule).
- **Doubles** is tested in the engine, not yet looked at on the TV.

### Performance (real Chrome on the M1, Claude in Chrome, 2026-11-18)

**Measured at 2188×1050 = 2.3 Mpx, the same window and moment for both games:**

| State | Zero Hour, first build | Zero Hour, after the fix | Shanghai |
|---|---|---|---|
| The master, 6 players, round 5, about 456 chips | 25 fps | 47–55 fps (median frame 16.7 ms) | 39 fps |
| A big hot sweep in flight | 22 fps | 52 fps | — |
| The spin (the wheel shot) | 25 fps | 60 fps | — |

**The cause:** the chips. About 255k of the scene's 330k triangles, and they were drawn three times a frame: the main
view, the shadow map, and the porthole's render of the whole scene. The fixes:
- **A lighter chip:** 28 lathe segments, not 40.
- **A shadow stand-in:** a 10-sided cylinder sharing the chips' instance matrices casts the shadows instead of every
  lathed chip. The real chips only receive. The stand-in writes nothing to the screen, because three r160's shadow
  pass tests layers against the main camera, so a shadow-only layer won't work.
- **A board-only porthole:** the porthole's camera draws only layer 2 (the board, its darts, the wall and the lights).

Contact shadows look the same at 1:1. The porthole now costs nothing measurable.

**Caveat:** Shanghai measured 60 fps at 2.3 Mpx when it was signed off and measures 39 now, so this browser is
slower today than then. Read Zero Hour as at least as fast as Shanghai, not as "60 everywhere". **Re-measure on an
idle machine** (the ⛔ M3 look gate needs it anyway).

### The arcade browser test (not Zero Hour)

`tests/browser/arcade.spec.cjs` "four-player…" fails intermittently. After Demolition, the tablet's X01 card isn't
visible when clicked: the Classic tab flips back. It was checked on a **clean checkout of `d6f462e`** (a git
worktree, no uncommitted work at all): one pass and one fail, failing at the same line (`start('x01')`). So it's the
pre-existing X01-card flake, not Zero Hour or Million Pound Oche. It's unfixed (out of scope); a likely cause is a
state broadcast with the old `selectedGame` re-selecting the Social tab just after the click.

## Next

1. **⛔ Sean: the M0 gate.**
   - Is this the chip, the table and the sweep?
   - Are the porthole and the hot numbers off the table OK?
   - Are hot numbers per round (not per visit) right?
2. **M2: the wheel hero**, at 1:1 from 3+ angles, plus the 100-spin landing test.
3. **M3: the salon and the look.**
4. **M4:** set-piece polish.
5. **M5:** flow, doubles on the TV, 6 long names, fps on an idle machine.
6. **M6:** sound.
