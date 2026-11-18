# Million Pound Oche — status

Plan: [`MILLION-POUND-OCHE.md`](MILLION-POUND-OCHE.md). **The rules contract is the header of
`src/engines/millionpound.js` (rules V2)**; where the plan's §0 / §4 text says a bull *or outer bull* is a pass, or has
no trebles, it predates V2 and the engine wins.

## Rules V2 (Sean, 2026-11-18): knowledge, accuracy and nerve

| Dart | Movement |
|---|---|
| Right single / double | +1 rung |
| Right treble | **+2 rungs** |
| Wrong single / double | none |
| Wrong treble (in another answer's *active* zone) | **−1 rung**, never below a banked checkpoint |
| Miss, a number not in play, outer bull | none (no answer) |
| Inner bull | the player's **first** one is a free pass (+1); later ones are no answer |

- Answer zones by visit: **5 / 5 / 3 / 3 / 2** numbers an answer, the same for everyone (`ZONE_SIZES`); sudden death 1.
- Checkpoints: **£1,000 and £32,000** (rungs 5 and 10), banked once reached.
- Stakes before every dart: right → £x, treble → £y, wrong treble → £z (or "BANKED").
- Final visit banner: *FINAL VISIT · THE MILLION POUND OCHE*. Suspense grows: lock 0.9 s → 3.0 s by visit, 3.8 s for
  a dart that could reach £1M and every sudden-death dart.
- The winner: highest rung after 15. Millionaires level → first to £1M (question number). Otherwise sudden death:
  one question, one dart, one-number zones; right treble > right single > anything else; repeat (cap 12 rounds).
- Avoided, as recommended: no speed bonus, no elimination, no lifelines or power-ups.

## Built

- Engine + bank (274 questions, 6 levels, fact-checked: `millionpound-bank-review.md`), server drop-not-queue,
  round-finishing timed sessions, tablet card + debug group, bots.
- 3D TV `games/millionpound.html` ("The Hot Oche") with the V2 HUD: stakes chips, shrinking ring zones, checkpoint
  rows on the money tree, bull-used state, final visit, sudden death, champion standings. How to play explainer (V2).
- `?demo=1` offline sim (`players=1..6`, `seed`, `speed`, `doubles=1`; keys A B C D, X bull, M miss, or click).
- Per-player playtest counters in state and the final standings: `correct`, `trebles`, `wrong`, `wrongTrebles`,
  `noAnswer`, `passes`, `millionAt`.

## Commands

- Run: `SCORING_MODE=mock PORT=4401 node src/server.js` → `https://localhost:4401/control.html` (pick Million
  Pound Oche), TV at `https://localhost:4401/viewer.html`. No server: `games/millionpound.html?demo=1&players=4`.
- Balance: `node scripts/millionpound-balance.cjs [games]` (real engine, venue bot profiles; ~1 s for 1,000).
- Review renders: `node docs/plans/tools/millionpound-look.cjs` → `millionpound-lookdev/look/` + `contact.jpg`.
- Tests: `node --test tests/millionpound-*.test.cjs`; browser `tests/browser/millionpound.spec.cjs`.

## Balance (first run, 2026-11-18, 200 games a line-up)

| Profile | median finish | stuck ≤ £8k | £1M | right | trebles | wrong trebles |
|---|---|---|---|---|---|---|
| advanced | £1M | 0% | 93% | 74% | 50% | 1% |
| intermediate | £32k | 24% | 1% | 58% | 2% | 1% |
| casual | £4k | 84% | 0% | 44% | 1% | 1% |
| dummy | £500 | 99% | 0% | 26% | 0% | 0% |

Four casuals: 28% of games go to sudden death, 2.4 lead changes a game. Mixed line-ups: the advanced bot wins 99%.

Read with care. Bots only throw a treble when they know the answer, and only the advanced bot does, so the
wrong-treble jeopardy barely shows (1%), and the "knows the answer" odds are invented (`BOT_KNOWS`). But by the
brief's own test (most stuck at £8k = too hard; everyone at £1M = too easy), casual players look too stuck and a strong
thrower too sure of the million. Needs a real playtest before anything is tuned.

## Left to do

1. **Sean plays it** (M1 gate) and a casual-group playtest; compare the counters with the sim.
2. Tune from that: the question levels (`QUESTION_LEVELS`), zone sizes, or bot odds. No rule change without Sean.
3. Bots that gamble: aim for a treble when *fairly* sure, so wrong trebles happen in bot games and the sim.
4. Look-dev sign-off (M2 ⛔), set pieces (M3), game-flow polish (M4: doubles through the real server, Correct
   Score across a reveal, 6 players with long names).
5. Sound (M5 ⛔): cash stings, the music building towards £1M, the big treble celebration.
6. Fold V2 into the plan's §0 / §4 text; the browser spec and full suite after the V2 changes (not run this session).
