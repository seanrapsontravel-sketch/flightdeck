# Milestones 1–3 implementation

Implemented in `feat/arcade-platform`, version 0.25.0. The existing game engines and tablet/TV structure are retained. Milestones 4–7 remain outside this change.

| Milestone | Delivered |
|---|---|
| 1: trustworthy base | Strict names/photos/darts validation; escaped names and initials; paired tablet/operator permissions; read-only TV sockets even when the browser also holds an operator cookie; origin and iframe sender checks; stable corrected Quick 10 identities; Node 22.14+ runtime; refreshed locked dependencies; portable audit rules and browser scenarios; CI; dead example-clip reference removal; current-tree asset hashes and unresolved rights inventory |
| 2: persistent sessions | Versioned atomic checkpoints with flush/rename; saved lineup, game, takeout gate, correction/undo state, pending schedule, queued darts, result versions and command/event receipts; Resume session; safe command retries; provider-identity deduplication; history writes replayed from durable pending records; stop scoring when storage fails; bounded diagnostics and photo URLs in broadcasts |
| 3: timed arcade and championship | Saved 30/60/90-minute deadlines; five-minute warning; finish-current-visit expiry; operator pause/continue/extension and deliberate early ending; standard versioned results; tie-aware points and corrections; explicit solo/team/simulation/participant exclusions; standings on tablet and TV; final champion screen; fixed/random order choice |

The boundaries are implemented in `src/validation.js`, `src/devices.js`, `src/players.js`, `src/storage.js`, `src/session.js` and `src/catalogue.js`. `src/server.js` continues to orchestrate the existing engines; the new functional session UI lives in separate `public/arcade-client.js` and `public/arcade.css` files.

## Rules adopted

- Finish the current visit at expiry; end immediately at an idle/setup/turn boundary. Corrections remain possible, with no fresh visits after expiry.
- 10/7/5/3 championship points, zero thereafter, with average occupied-place points for ties.
- Same singles participants across competitive games. Solo, teams, changed participants, bots, mock/debug scoring and abandoned games are explicitly excluded.
- Fixed throwing order by default; random order is opt-in.
- Games that establish only a winner share the remaining places. Games with score-based finishing order or a supplied ranking preserve it.

Full operating instructions and these decisions are in [ARCADE-OPERATIONS.md](ARCADE-OPERATIONS.md).

## Verification

Verification on the M1 host with Node 22.14.0:

- A clean `npm ci --offline` succeeds using the lockfile.
- `npm run check` parses application, test and inline browser scripts.
- `npm test` runs 27 rule, session, mapping and host integration checks. This includes SIGKILL recovery, a persisted correction, recovery during Quick 10's final commit, duplicate retries, repeated legitimate T20s, a restart crossing expiry and scoring stopped on a failed checkpoint.
- Browser automation uses a 1280×800 touch controller and separate 1920×1080 TV. It completes Derby, Killer, Demolition, X01 and Quick 10 and verifies 790→840 correction with one saved leaderboard entry. Security scenarios verify literal unsafe names, iframe sender rejection and read-only TV permissions. A saved-results fixture verifies championship display, restart, pause/continue, extension, early ending and the final champion on both screens; this fixture is separate from the real game-flow scenarios.
- The dependency audit reports zero known vulnerabilities at implementation time. CI is configured for Node 22/24 rule/recovery checks and Node 22 browser checks. Remote CI has not been run by this local implementation task.

## Explicit limits

- Checkpoints use flushed atomic JSON rather than SQLite. This keeps installation free of native database bindings for one local writer. Unknown/corrupt schema data fails closed and is preserved.
- Deduplication across restart requires a stable provider identity. OpenDarts supplies visit/dart identity; Autodarts and Scolia pass through upstream identities when present. No score/timing heuristic discards repeated targets. Firmware without stable event identity still needs a hardware-specific solution and validation.
- Physical Samsung sleep/wake, real camera scoring, long venue sessions and sudden loss of power at the filesystem boundary have not been certified by software tests.
- Remaining art/sounds have an explicit unresolved-rights manifest. The inherited Git history still contains removed example clips. This branch is not a cleared commercial distribution.
- New 3D games, premium controller redesign, hardware packaging, update rollback and commercial photo-retention controls remain planned milestones.
