# Million Pound Oche — plan

Written 2026-11-18 from Sean's brief "Build MVP: Million Pound Oche — Darts Quiz Arcade". It was amended so the game
sits in the 3D series. **This file is the whole brief**: read it top to bottom before touching code.

> **Rules changed 2026-11-18, after the decisions** (Sean): a turn is **three questions, one dart each**; a **bull or
> outer bull is a free pass** that counts as right; **five turns each, fifteen questions**, on the classic
> **fifteen-rung** money tree (£100, 200, 300, 500, 1,000, 2,000, 4,000, 8,000, 16,000, 32,000, 64,000, 125,000,
> 250,000, 500,000, £1,000,000). §4 below is the contract as built. Where the older text elsewhere says six rounds, one
> question a turn or six rungs, §4 wins. Build status: [`MILLION-POUND-OCHE-STATUS.md`](MILLION-POUND-OCHE-STATUS.md).

Its siblings:
- [`SHANGHAI-3D.md`](SHANGHAI-3D.md) and its status: the template, and the bar;
- [`QUACKSHOT-3D.md`](QUACKSHOT-3D.md): the process that worked;
- [`KILLER-3D.md`](KILLER-3D.md): the one that didn't;
- [`ZERO-HOUR.md`](ZERO-HOUR.md): the other brand-new game, whose codebase audit (§2) this plan relies on;
- [`GAME-INTROS-3D.md`](GAME-INTROS-3D.md): every 3D game opens on a How to play explainer.

Like Zero Hour, this is a **new game**. There's no 2D page and no classic, so the plan has two tracks:
- **the game track:** the engine, the question bank, the tests;
- **the show track:** a 3D TV studio built on the same kit, and to the same bar, as Derby through Shanghai.

---

## 0. In one paragraph

Million Pound Oche is a quiz played with darts. Each player gets one multiple-choice question per round, over six
rounds that get harder.
- **The board's four quadrants are the four answers:** A is the top, B the right, C the bottom, D the left.
- **One dart locks in the answer.**
- A right answer climbs one rung of a six-rung money ladder (£100 → £1,000,000). A wrong answer, a bull or a miss
  stays put.
- Nobody is eliminated. After six rounds the highest rung wins, and a tie shares the win.

The world is **"The Hot Oche"**, a prime-time quiz studio in the dark:
- **the dartboard is the hero:** it's set centre stage in a great ring of light, and its rim is split into four
  lettered arcs;
- **the question and answers** sit in the lower third in lozenge panels;
- **each player has a glass podium** with their own ladder;
- **the lighting tightens round by round:** a bright wash in round 1, one shaft of light on the oche for the million.

It should feel unmistakably like a big-money TV quiz: the lock-in, the held breath, the reveal. But it's our own
show (§6.1).

---

## 1. What changed from the brief, and why

Most of the brief stands: the rules, the quadrant table, the bank principles, the tests and the out-of-scope list.
What changed is **where things live**. This platform already has:
- players, sessions and the lineup;
- a control tablet;
- board drivers for Autodarts and OpenDarts, a mock mode, and a debug dart panel;
- undo and Correct Score;
- a server-owned rules layer, and TV pages that only render state.

So the game plugs into all of that rather than rebuilding it.

| The brief says | In the series it becomes | Why |
|---|---|---|
| "Inspect the codebase, follow its conventions" | Done (§3). An engine `src/engines/millionpound.js`, a catalogue row, a 3D TV page `public/games/millionpound.html` on `lib3d` + the kit | The house pattern: the host owns the rules, the TV renders state |
| A welcome screen with Start and How to play | The tablet's game card starts it. The TV opens on the **kit How to play explainer** (`millionpound/intro.js`), which shows the four quadrants lighting in turn | Every 3D game opens this way. The TV has no input, so a TV Start button would be a dead control |
| A player setup screen (1–6, names) | The existing lineup and session on the tablet. Catalogue `['millionpound','Million Pound Oche','social',1,6]`; 7+ players become doubles teams (the platform's rule) | Players, avatars, colours and sessions already exist |
| A dart input adapter with keyboard and click simulation | **Already exists.** Real darts come through `src/board/` (Autodarts / OpenDarts / Scolia → `TRIGGER_SPECIFIC_THROW`). Mock mode, bots and the tablet's debug panel cover development. Added on top: a tablet debug group with **A / B / C / D / BULL / MISS**, and, in `?demo=1` only, keyboard `A B C D` + `M` (miss) + `X` (bull) and clicks on the board | Don't build a second input path. The brief's simulation still exists, just in the right places |
| "Don't invent Autodarts APIs" | Nothing new is needed. The engine sees `{number, multiplier, sector, miss}` like every game | `autodarts/mapThrow.js` already normalises |
| A CSS/SVG dartboard | A **3D board** with exact beds (kit `darts.js` geometry), with the question and answers as **DOM text** over the scene | The series look. The DOM is the readable truth |
| Play Again / New Players buttons on the results screen | The tablet's existing RESET_MATCH (play again) and SELECT_GAME / the lineup (new players). The TV shows the final podium and leaderboard | The TV has no input; the tablet already does this |
| "Four distinct quadrant colours" | **Changed (decision §12.2):** the panels follow the TV quiz grammar. They're all one style; amber means locked in, green means correct. Quadrants are told apart by letter, position and an anchor number | In this genre green *means* correct. Four coloured panels would read as a kids' quiz and clash with the reveal |
| A 1–2 s pause before the reveal | A server-timed **`locked`** phase that grows from 1.2 s to 3.2 s by round (§4) | Escalating suspense is the show. The server owns timing, so "nothing lies" holds |
| "Six difficulty levels, ≥ 20 per level" | **≥ 40 per level (≥ 240)**, plus no repeats within a session (§5) | Six players use 6 a level per game, so 20 a level repeats by the third game in a session |
| "Run the app, test, screenshot, then summarise" | The series milestones with **sign-off gates** (§13). M0 stops for Sean | Gates hold. The hero gets judged before any world is built |

What stays exactly as the brief has it:
- one dart per question;
- the quadrant table (verified in §4: every boundary falls on a wedge edge);
- bull and miss count as no answer;
- six rounds, the six-rung ladder, no elimination, ties share;
- 1–6 players with equal questions;
- harder questions each round, different questions per player;
- the out-of-scope list (no lifelines, accounts, AI questions, real money and so on);
- the test list;
- 16:9 TV readability from 2–3 m.

---

## 2. Lessons to carry (from Killer, Quackshot, Shanghai and Zero Hour)

These are the same as [`ZERO-HOUR.md`](ZERO-HOUR.md) §1. Read them there; the ones that bite hardest here:

1. **Hero first, signed off before any world.** Here the hero is **the oche ring together with the answer
   layout**: the board, its lettered rim and the four lozenges, judged on one question, *can a first-timer tell
   which bit of the board is answer C from across a bar?*, before beauty.
2. **No people.** No presenter and no audience figures. The host is the lighting and the type; the audience is dark
   tiers and seat-edge LEDs. (Characters sank Killer.)
3. **Every element answers "what has this got to do with the game?"** (the §6 table).
4. **Gates hold** unless Sean says to run through. Say so at the start of each run.
5. **Review at 1:1, plus silhouettes and references.** Write the critique and fix what it finds *before* sending.
   A rejected hero gets 2–3 rendered options.
6. **Cameras aim from real bounds** (Shanghai `eyeFit` for the master, `fitPoints` elsewhere). The DOM lower third
   and the money tree are **keep-out zones**: no subject may sit under them.
7. **Make lights at load at intensity 0. Precompile shaders at boot.** Instanced sets need `frustumCulled = false`
   and `count` set to the instances in use. Three r160 shaders see `USE_COLOR`. Keep grid counts integers.
8. **State rules:** guard late cards with "the game hasn't ended"; the nothing-lies check reads the DOM and
   `truth()`, and every counted thing must also be on screen; names and *question text* go in via `textContent`.
9. **One command per deliverable set** (`docs/plans/tools/shanghai-cap.cjs` is the template: a fake clock and
   `?capture=1`).
10. **Measure fps in real Chrome on the M1** (Claude in Chrome) at ≥ 2.1 Mpx, in the master and in the busiest
    moment.

---

## 3. Project facts and integration (audit 2026-11-18)

- Repo `~/flightdeck-fork`, branch `feat/arcade-platform`, with uncommitted work: **do not commit or push unless
  asked**.
- Server: `SCORING_MODE=mock PORT=4000 node src/server.js`.
- Checks: `npm test`, `npm run check`, `npx playwright test` (GPU launch flags as in `shanghai.spec.cjs`).

**Files a new game touches** (the catalogue derives the registry, `ALL_GAMES`, the view URL and the max players):

| File | Change |
|---|---|
| `src/catalogue.js` | `['millionpound','Million Pound Oche','social',1,6]` |
| `src/engines/millionpound.js` | the engine (§4); CommonJS like the others |
| `src/engines/millionpound/questions/level-{1..6}.json` | the bank (§5). Server-side: the TV never needs the whole bank |
| `src/engines/millionpound/bank.js` | load + validate the bank, seeded selection, the answer shuffle |
| `src/server.js` | **(a)** `'locked'` and `'reveal'` added to `visitEndedAfterThrow` (~1616) and the queue-hold phase lists (~1456, 2076, 2114: see Zero Hour §2), so the takeout gate fires after the one dart; **(b)** this game **drops, never queues**, darts outside `playing` (§4.4); **(c)** the recent-question list per session (§5), passed into `init` via options |
| `src/session.js:68,89` | add `millionpound` to the `winner_then_score` games |
| `public/control.html` | the game card; a debug group (A / B / C / D / BULL / MISS, previews: question, locked, reveal-right, reveal-wrong, winner, draw); `gameBackgroundMaps` / `gamePageBgMaps` |
| `public/viewer.html` | the bg maps. No classic regex: there is no classic |
| `public/games/millionpound.html` + `public/games/millionpound/` | the 3D page (§10) |
| `public/assets/millionpound/bg.jpg` | the card / page background (a render of the studio, made by us) |
| `tests/…`, `docs/plans/tools/intros.cjs:9`, `tests/browser/intros.spec.cjs:12` | §10, §11 |
| `docs/ASSET-REGISTER.md`, `CHANGELOG.md` | as the other games |

**Fonts:** the series uses system stacks only (`"Avenir Next Condensed","DIN Condensed","Roboto Condensed",
"Arial Narrow"`, 900 weight; `:root{font-size:calc(100vh/108)}`). The CSP allows self-hosted fonts (`font-src` falls
back to `'self'`), and none are used yet (decision §12.6).

---

## 4. The rules: the contract as built (`src/engines/millionpound.js`)

### 4.1 The quadrants (checked against the wheel)

The wheel runs clockwise from the top: `20 1 18 4 13 6 10 15 2 17 3 19 7 16 8 11 14 9 12 5`. Each quadrant is five
wedges centred on a cardinal number; its edges sit at 45° + 90°k, and 45° = 9° + 2 × 18° is a wedge edge, so **no wedge
is split** and the segment number alone decides the answer. (A 2×2 split would cut 20, 6, 3 and 11 in half.)

| Answer | Quadrant | Anchor | Numbers |
|---|---|---|---|
| A | top | 20 | 12, 5, 20, 1, 18 |
| B | right | 6 | 4, 13, 6, 10, 15 |
| C | bottom | 3 | 2, 17, 3, 19, 7 |
| D | left | 11 | 16, 8, 11, 14, 9 |

Singles (inner and outer), doubles and trebles all name the quadrant's answer. **A bull or outer bull is a free pass**
(counts as right, climbs a rung, `passes` += 1). A miss is no answer. The TV mirrors the table in
`public/games/millionpound/common.js`; `tests/millionpound-quadrants.test.cjs` checks the two agree.

### 4.2 Format

- **A turn is three questions, one dart each** (`QUESTIONS_PER_TURN = 3`, `DARTS_PER_QUESTION = 1`), the board's own
  three-dart visit. Five turns each (`ROUNDS = 5`): fifteen questions per player.
- **Difficulty by question number**, the same for everyone: question 1–15 draws from bank level
  `[1,1,2,2,2,3,3,4,4,4,5,5,6,6,6]`. Every player gets a different question at every step.
- **Ladder**: rung = right answers + passes (0–15); `score = rung` for session ranking; the prize is shown in pounds.
- Highest rung after round 5 wins; a tie for the top is `draw` (a shared win). Nobody is eliminated.

### 4.3 State (plain JSON in `gameData`)

```
{ gameType, seed, ladder[15], maxRounds:5, questionsPerTurn:3, dartsPerQuestion:1, questions:15, sessionUnit:'round',
  players:[{ ...slimPlayer, rung, score, prize, correct, passes, answers:[{round, question, qid, chosen, pass, correctKey, right, dart}] }],
  activeIdx, currentRound 1–5, questionInTurn 0–2, throwsThisTurn 0–3, dartsThisQuestion 0–1, turnDarts[],
  question:{ id, level, category, text, answers:{A,B,C,D}, correctKey, number 1–15, of:15, turnQuestion 1–3, playingFor },
  plan:[questionNo][playerIdx] → { id, answers:[option index per letter], key },  questionIds[],
  lastThrow:{ label, dart, answer, pass, hit, number, multiplier, sector, miss, question, playerId, playerName }, phase }
```
The whole game's questions are drawn at `init` from a seeded RNG: no repeats in a game, none from the session's recent
list (`options.recentQuestions`; the server remembers ids per session), right-answer letters from a balanced deck.
`correctKey` is in the broadcast state; the TV never renders it before `reveal` (the browser spec checks).

### 4.4 Phases and timing (server-scheduled)

| Phase | Server | Darts | Then |
|---|---|---|---|
| `playing` | the question live | one dart: `dartsThisQuestion` 0 → 1, `throwsThisTurn` += 1 | `locked` |
| `locked` | `{answer, pass, dart, question, ms}`; nothing scored yet. `ms` by bank level 1200 / 1500 / 1800 / 2200 / 2700 / 3200, the million question 4000 | dropped | `reveal` |
| `reveal` | `{answer, pass, correctKey, right, rung, prize, million, turnOver}`; **the rung changes here**. 3 s, 3.5 s at the end of a turn, 5 s for the million | dropped | the turn's next question (`playing`), or UP NEXT, or a round banner, or the end |
| `intermission` (2.5 s) | UP NEXT `{nextPlayerIndex, rung, prize, playingFor}` | dropped | `playing` |
| `round_announce` (3 s) | `ROUND n · QUESTIONS a–b` (last: `FOR THE MILLION`) | dropped | UP NEXT |
| `winner` / `draw` | `{winnerId, winnerName, rung, prize, standings}` or `{contenders[] …}` | dropped | terminal |

### 4.5 Edge rules (each one tested)

- **One dart per question**: a second dart before the next question is ignored by the engine; the server **drops**
  (never queues) any dart outside `playing` for this game (`meta.queueThrows = false` → `engines.queuesThrows()`),
  so a held dart can't answer the next question unread. Duplicate board events are dropped by `eventId`.
- **Takeout**: after the third dart `throwsThisTurn = 3`, so the server waits for the takeout before the next player.
- **Bounce-outs**: the engine spec has no bounce field; one the board scores as a miss is no answer, one it doesn't
  detect isn't a dart (throw again). A dart thrown during a reveal is dropped, so throw when the question is up.
- **Correct Score** rolls back to the same question and replays the corrected dart through `locked` → `reveal`.
- **Timed sessions finish the round** (`gameData.sessionUnit = 'round'` in `src/session.js`): the clock can only stop
  between rounds, so every player gets the same number of questions (reason `round_finished`).
- **Bots**: one that knows the answer (by profile × level) aims at the anchor single; one that doesn't goes for the
  bull (intermediate, advanced) or guesses (casual, dummy).
- **The engine is structured for more darts**: `DARTS_PER_QUESTION` and `QUESTIONS_PER_TURN` are constants; nothing
  assumes a one-dart visit beyond `QUESTIONS_PER_TURN × DARTS_PER_QUESTION ≤ 3`.

---

## 5. The question bank

**Format:** one JSON file per level. Every question is:
```
{ "id":"geo-0042", "level":3, "category":"geography",
  "q":"Which river flows through Vienna, Budapest and Belgrade?",
  "correct":"Danube", "wrong":["Rhine","Vistula","Dnieper"],
  "source":"Britannica: Danube River", "checked":"2026-11-…" }
```
The loader shuffles the answers per game, so authors never pick a position. The format is extensible: new files,
new categories, more levels.

**Size and spread:**
- **≥ 40 questions per level, ≥ 240 in all**;
- categories over each level: geography, history, sport (darts at least once a level, since it's a darts bar),
  film and TV, music, science, nature, food and drink, general knowledge;
- no category over 25% of a level.

**Difficulty:**

| Level | Prize | Target |
|---|---|---|
| 1 | £100 | Everyone in the bar knows it ("How many sides has a hexagon?") |
| 2 | £1,000 | Most people know it |
| 3 | £10,000 | Pub-quiz regular |
| 4 | £50,000 | Needs real knowledge, with one tempting wrong answer |
| 5 | £250,000 | Specialist, but fair and gettable by reasoning |
| 6 | £1,000,000 | Hard; never a coin-toss of obscure dates |

**Rules for writing:**
- UK English and a UK-pub frame of reference.
- Questions ≤ 110 characters (two lines on the TV) and answers ≤ 28 characters (one line), so it's readable at 3 m.
  A lint test enforces both.
- Four distinct answers, exactly one right. No "all/none of the above". No "which is NOT" in levels 1–3.
- **No time-sensitive facts** (current holders, "the latest", records that move) unless they're dated in the
  question ("In 2012, …").
- No questions about real living private people. Public figures only on matters of public record.

**Accuracy (the bank is only as good as its worst question):**
- Every question carries a `source`.
- After writing, **a separate fact-check pass** challenges every question: is it true, unambiguous, and is each
  wrong answer actually wrong? It writes `docs/plans/millionpound-bank-review.md` listing every one it doubts.
- Doubtful questions are fixed or cut, never shipped "probably right".
- Sean sees a 30-question sample at M0 (tone and difficulty) and the review report at M1.

**No repeats:**
- Within a game: guaranteed by the `init` draw.
- Within a session: the server keeps the session's asked ids and passes them as `options.exclude`. When a level
  runs dry, the longest-ago questions come back first.
- Across sessions: not in the MVP (no persistent history is needed).

---

## 6. Creative direction: "The Hot Oche"

The eighth mood in the set:
- Derby: golden afternoon;
- Demolition: industrial night;
- Limbo: lagoon dusk;
- Killer: noir interior;
- Quackshot: fairground blue hour;
- Shanghai: sunset into night;
- Zero Hour: midnight;
- **Million Pound Oche: a television studio in the dark.**

Its palette is deep navy and black, violet and electric blue light, silver edges, and gold only for money.

### 6.1 Authentic to the genre, not a copy of a show

It should feel like a prime-time money quiz, and we copy the **grammar** of the format:
- a dark studio;
- the contestant spotlit centre stage;
- lozenge answer panels;
- a vertical money ladder;
- the lock-in, the held pause and the reveal;
- lights that tighten as the stakes rise;
- a pulsing bed under the question.

We **don't** copy any real show's:
- name or logo;
- theme music or stings;
- set design;
- graphics;
- catchphrases.

So we use "LOCKED IN", not a borrowed line. The title, the logo and the sound are original (the logo is a gold
dartboard-in-a-diamond wordmark made at M0). That keeps the game ours to run in a venue, and it's what the brief's
"original branding" asked for.

### 6.2 The elements

| Element | What it is | Why it belongs |
|---|---|---|
| **The oche ring** (hero) | A large dartboard (≈ 2.4 m) centre stage, mounted in a great ring of light. The ring's rim is split into **four arcs on the quadrant bounds**, each with a gold letter in a diamond (A at 12 o'clock, B at 3, C at 6, D at 9). It has exact beds, a black and silver board, and a halo that breathes with the question bed | It *is* the answer pad. Quadrants are the one new idea for players, so the board has to teach them |
| **The lit quadrant** | The dart's five wedges glow **amber** on lock-in. On the reveal, the right quadrant glows **green**; a wrong pick fades its amber to dim | The show's grammar on the real board: you see the answer on the thing you threw at |
| **The answer panels** | DOM lozenges in the lower third: the question bar, then four answer lozenges, each with its letter diamond. Idle navy with silver trim → amber when locked → green when right. Layout is §12.1 | Readable truth at 3 m. The 3D wall behind carries their glow |
| **The money tree** | A tall LED ladder stage right: six rungs from £100 to £1,000,000. The active player's rung is lit gold, and the next target pulses | The brief's "current prize + next target", as the genre draws it |
| **The podiums** | A shallow arc of glass contestant podiums, one per player. Each has the name, the prize in gold and a six-pip mini ladder; the active one is spotlit, the rest dim | Everyone's standing at a glance, the brief's leaderboard made physical. **No people at the podiums** |
| **The stakes rig** | A circular lighting truss over the stage. It **lowers and tightens each round**: round 1 a bright, wide wash; round 6 near-darkness and one shaft on the oche. Light lines in the floor run in to the oche | The round tracker (like Shanghai's sky clock), and the genre's signature tension |
| **The floor** | Black glass with a radial pattern, mirror-reflective (`lib3d/reflection.js`) | The studio; it doubles the light |
| **The audience** | Dark tiers with an LED strip on every step and a slow pulse on reveals. **No figures** | Scale and atmosphere without the asset class that sank Killer |
| **Darts** | Darts scaled to the board, with flights in the thrower's colour, thrown from the active podium, stuck in the exact bed, with a glow ring | The real dart, placed truthfully |

**Light:** the key is cool, high and moving; the practicals are the ring, the ladder, the podiums and the panels'
glow. **Gold appears only for money**, so the eye finds the prize. Saturation comes from the blue/violet wash, the
amber lock and the green reveal.

### 6.3 The moments

| Moment | Visual |
|---|---|
| Question in (`playing`) | The lights sweep in to the active podium; the question bar slides up; **the answers appear A → D** (~0.4 s apart: TV-only staging, and it snaps to all four the instant a dart lands); a pulsing bed; the ring's halo breathes |
| The dart lands | It sticks in the exact bed (within 100 ms); its quadrant's five wedges and its rim arc light amber; the matching lozenge turns amber, "LOCKED IN" |
| `locked` | The rig dims, the camera pushes slowly in on the ring, a heartbeat tension; longer each round |
| Correct | The right quadrant and lozenge snap green; a light burst off the ring; the money tree climbs a rung, with gold sweeping up it; the prize counts up on the podium; the audience strips flare |
| Wrong | The right answer flashes green, the chosen amber fades; the lights drop; "STAYS ON £x"; quiet and honest, never mocking |
| Bull / miss | "NO ANSWER" (a bull lands in the bull: the board tells the truth); the right answer reveals green |
| Round announce | The camera cranes down through the rig as it lowers a notch; "ROUND n · LEVEL NAME" |
| The million question (round 6) | Near-darkness, one shaft of light on the oche, the bed at its lowest; "THE MILLION POUND QUESTION" |
| A £1,000,000 answer | Everything at once: every light in the studio, gold rain from the rig, the ladder's top rung blazing, "£1,000,000" |
| Winner | The winner's podium rises into light, gold confetti, "CHAMPION" with the name as DOM text, and the final leaderboard (rung, prize, correct out of 6) |
| Draw | Each contender's podium lit; "SHARED WIN" with the names as DOM text |

**Cameras** (a `ShotDirector` subclass):
- `master`: the stage from the audience, at eye height. The ring is upper centre, the ladder stage right and the
  podiums across the bottom, with the lower-third keep-out clear.
- `podium`: UP NEXT.
- `ring`: the lock-in push.
- `ladder`: the climb.
- `crane`: the round announce.
- `winner`: a slow push.

---

## 7. TV layout and HUD (CSS prefix `--mpo-`; everything is `textContent`)

- **Lower third:** the question bar (≥ 4.4 rem at 1080p, two lines max), and below it the four answer lozenges
  (≥ 4 rem, one line, auto-fit with a floor).
- **Stage right:** the money tree for the active player.
- **Top left:** the round pill "ROUND 3 OF 6", the level name.
- **Top strip:** every player's prize (the DOM truth of the podiums), the active player marked.
- **Thrower card:** the name (the thrower in doubles), "ON £1,000 · PLAYING FOR £10,000", and the dart ("T6 · B").
- Title cards, help (`helpVisible`), the How to play explainer, and the winner clip via `FlightDeckWinnerVideo`.
- The dart callout and the announcer are free (`dart-callout.js`, `dart-announcer.js`). The announcer's number calls
  may fight the suspense (decision §12.5).
- Checked at 1, 2, 4 and 6 players, with "Christopher & Maximilian", a 110-character question and four
  28-character answers, at 1080p **and as a phone-sized thumbnail**.

---

## 8. Sound (after the look, as for the others)

Sound carries most of the genre's tension, so it matters more here than in any other game. It's still built after
the look, on Limbo's procedural Web Audio (`limbo/audio.js`, the nearest thing to a shared core; it's parked, see
`LIMBO-3D-SOUND.md`). **All original:**
- a question bed that rises in pitch and tempo per round;
- the lock-in hit;
- a heartbeat and drone under `locked`;
- a correct sting and a wrong sting;
- the ladder's rising tones;
- a round whoosh;
- the million fanfare;
- the winner, reusing `/assets/shared/winner-cheers.mp3`.

It's measured with `sound-reel.cjs` as Limbo was. Opt-in `?sound=1` until signed off.

---

## 9. Demo and review hooks

- `games/millionpound.html?demo=1&players=4&seed=7`: a simulated game on the TV with no server. It emits the same
  `gameData` the engine would, from a **demo question set** (`millionpound/demo-questions.js`, 36 questions
  written for it, so the real bank stays server-side). It works offline.
- Demo-only input: `A B C D` / `M` / `X` keys and clicks on the board.
  `window.__millionpoundDemo.force('question'|'locked'|'right'|'wrong'|'nobull'|'million'|'round'|'winner'|'draw')`
  plus `.queue/.set`.
- `window.__millionpound = { engine, game, truth, step }`. `truth()` returns `{settled, round, activeIdx, question,
  shown:{q, A, B, C, D}, chosen, revealed, rungs[], prizes[], ladderLit, quadrantLit, darts, busy}`.
- The usual flags: `dpr=1`, `quality=low`, `capture=1`, `intro=0|1`.

---

## 10. File plan

```
src/catalogue.js                               + ['millionpound','Million Pound Oche','social',1,6]
src/engines/millionpound.js                    the engine (§4)
src/engines/millionpound/bank.js               load, validate, seeded draw, answer shuffle, session exclude
src/engines/millionpound/questions/level-1..6.json   the bank (§5)
src/server.js                                  locked/reveal in the visit-end + queue lists; drop-not-queue; session asked ids
src/session.js                                 winner_then_score
public/control.html, public/viewer.html        card, debug group (A–D, BULL, MISS, previews), bg maps
public/games/millionpound.html                 the 3D page (no classic: a new game)
public/games/millionpound/
  common.js     quadrantOf, ladder, level names, colours, scale
  ring.js       the oche ring: exact beds, lettered rim arcs, quadrant glow (hero)
  studio.js     floor, stakes rig, audience tiers, the LED wall
  ladder.js     the money tree
  podiums.js    the player podiums with mini ladders
  darts.js      from Shanghai's (upright board, glow ring)
  fx.js         light bursts, gold rain, confetti
  director.js hud.js game.js demo.js demo-questions.js intro.js main.js audio.js (M5)
public/assets/millionpound/bg.jpg              a studio render
tests/millionpound-quadrants.test.cjs          all 20 numbers × S/D/T, inner/outer single, bull, outer bull, miss; engine = TV mirror
tests/millionpound-rules.test.cjs              right/wrong/no-answer, ladder, 6 rounds, turn order at 1–6, doubles, ties,
                                               one dart only, duplicate eventIds, dropped darts outside playing,
                                               undo in locked, Correct Score across reveal, reset, bots
tests/millionpound-bank.test.cjs               the lint (§5), ≥40/level, unique ids/answers, draw uniqueness,
                                               position balance, session exclude
tests/rules.test.cjs                           + the game in the all-games loop
tests/browser/millionpound.spec.cjs            nothing lies (§11), the answer not in the DOM before reveal, a full 4-player game
tests/browser/intros.spec.cjs, docs/plans/tools/intros.cjs   + millionpound
docs/plans/tools/millionpound-{lookdev,look,moments}.cjs     the review renders (from shanghai-cap)
docs/plans/millionpound-bank-review.md         the fact-check report
docs/plans/MILLION-POUND-OCHE-STATUS.md, CHANGELOG.md, docs/ASSET-REGISTER.md
```

---

## 11. Quality gates

**The hero checklist** (the ring and the answer layout; a written critique before every review):
- **The mapping reads cold:** shown one still, someone who has never played can say which part of the board is C.
  Test it on the phone thumbnail too.
- **Authentic:** in solid black-and-white the frame reads as a prime-time money quiz: the lozenges, the ladder, the
  light. No element looks like a kids' quiz or a web form.
- **No primitive tells:** the ring has depth (bezel, diffuser, inner glow), the lozenges have bevels and trim, and
  the podiums are glass with edges that catch light.
- **Close-up and distance:** the ring holds at 1:1 in the lock-in push and reads in the master.

**The game:**
- **Readable from across a bar:** one master frame shows the question, the four answers, which quadrant is which,
  whose turn it is, their prize and target, the round, and every player's standing.
- **Nothing lies** (automated through the server):
  - the DOM question and answers equal `gameData.question`;
  - the lit quadrant and amber lozenge equal `quadrantOf(lastThrow)`;
  - green appears only in `reveal` and equals `correctKey`;
  - each podium, the ladder and the top strip equal `rung` / `prize`;
  - the round pill equals `currentRound`;
  - the dart sits in its bed;
  - every counted thing is also on screen.
- Every dart reacts within 100 ms; the answers snap in if a dart beats their staging; no late card after the end;
  no HUD overlap at 6 players with long names and maximum-length text.
- 60 fps at ≥ 2.1 Mpx **in real Chrome on the M1**: in the master, and in the million moment with gold rain.
- `npm test`, `npm run check` and `npx playwright test` pass at every milestone end.

**The brief's acceptance criteria, mapped:**

| Criterion | Shown by |
|---|---|
| 1–3 (four players, six questions each, fixed quadrants) | `millionpound-rules`, the browser spec |
| 4 (simulate every dart) | the tablet debug group, the demo keys |
| 5–8 (quadrant → answer, reveal, ladder, auto-progression) | the rules and quadrant tests; the browser spec plays a full 4-player game through the server |
| 9 (winner) | winner/draw DOM text |
| 10 (immediate rematch) | RESET_MATCH in the spec, with a second game drawing no repeats |
| 11 (65-inch quality) | the look-dev gates |
| 12 (tests pass, runs locally) | every milestone |

---

## 12. Decisions (proposed; Sean to confirm or change at the M0 gate)

1. **Answer layout. The quadrants are forced to top / right / bottom / left (§4.1), but the genre's panels are a
   2×2 grid.** M0 renders both options:
   - **(a) recommended:** the authentic 2×2 grid (A B / C D). Each lozenge carries a **mini-board pictogram** with
     its quadrant lit and its anchor number ("A ▲ 20", "B ▶ 6", "C ▼ 3", "D ◀ 11"), and the ring's rim letters
     match.
   - **(b):** four lozenges arranged as a diamond around the ring. It's the most self-explanatory, but less like
     the genre and harder to fit with a long question.
2. **Panel colour follows the genre** (one style; amber = locked, green = right), not four quadrant colours. The
   brief's four colours can come back as a subtle tint on the rim arcs if (a) doesn't read cold.
3. **Suspense grows by round** (1.2 s → 3.2 s), rather than a flat 1–2 s.
4. **Bank ≥ 240** (40 a level) with no repeats within a session (a small server change), rather than 120.
5. **The dart announcer:** mute number callouts for this game, since "treble six" would spoil the held breath. The
   board and the lozenge say what was hit.
6. **Type:** the series' system condensed stack for the MVP. Option: self-host one OFL display face for the
   question and ladder (the platform's first webfont; asset register).
7. **No presenter, no audience figures, no shot clock** (the brief has none; an optional 30 s answer clock can
   come later).

**Questions for Sean:**
- A timed session can end mid-round, leaving unequal question counts. Should this game finish the round first?
- `score = rung` (0–6) for session standings, or the pound value?
- Is darts trivia once a level welcome, or should it be kept out?

---

## 13. Milestones (in order; ⛔ = a stop for Sean unless he says to run through)

0. **The hero and the layout.** ⛔
   - Collect references (the genre's studios, lighting and lozenge panels, *as mood only*) into
     `docs/plans/millionpound-lookdev/reference/`.
   - Build the oche ring (ring, rim arcs, letters, quadrant glow states: idle, amber, green) and the two answer
     layouts (§12.1) with real maximum-length text, at 1080p, plus phone thumbnails.
   - Make a rough still of the whole studio at round 1 versus round 6 light, and the logo wordmark.
   - Write **30 sample questions** (5 a level) for tone and difficulty.
   - Write the critique; ask **"Which layout? Is this the studio? Are these the right questions?"** and the §12
     decisions.
1. **The game, playable on the real server** (a greybox TV):
   - the engine, the bank (all ≥ 240, written, sourced and fact-checked, with the review report);
   - the server changes, the catalogue, the tablet card and debug group, bots;
   - a greybox studio with the exact ring, lettered rim, quadrant glow, block podiums and ladder, the DOM lower
     third, and capsule darts in exact beds;
   - the How to play explainer, `?demo=1`;
   - all unit tests and the browser spec, with the full suite green;
   - the pace measured from bot-paced games.
   - **Sean plays it.**
2. **Look-dev.** ⛔
   - Materials, the studio, the stakes rig across six rounds, the panels at full finish, the million moment, all on a
     running game.
   - 8 stills (master rounds 1 / 3 / 6, the lock-in, a right reveal, a wrong reveal, the ladder climb, the winner),
     1:1 crops of every hero, a 20 s clip.
   - fps in real Chrome on the M1. Ask **"Is this the look?"**
3. **Set pieces:** the question in, lock-in, right / wrong / no answer, the ladder climb, the round crane, the million
   question and answer, winner, draw.
4. **Game flow and polish:** director logic from state, doubles through the real server, Correct Score across a
   reveal, 1 and 6 players with long names and maximum text, previews, help.
5. **Sound** (§8). ⛔ for a listen.
6. **Polish and verification:** a full-game video, CHANGELOG and the asset register, and the status doc with what's
   left.

---

## 14. Risks to check early

- **The mapping is the whole game.** If players can't tell which bit of the board is C, nothing else matters. That's
  why M0 is the ring and the layout, judged cold, before any studio.
- **The frame is crowded:** a two-line question, four answers, the ring, a ladder and up to six podiums. Block it at
  M0 with six players and maximum text. The podiums may have to live in the top strip at 5–6 players, with the 3D
  podiums carrying only light.
- **Question quality:** one wrong "fact" in front of a bar spoils the game. Source every question, run the separate
  fact-check pass, and cut rather than guess.
- **Queued darts answering unseen questions:** the drop-not-queue rule is a server change. Test it before anything
  visual.
- **The takeout gate and a one-dart visit:** no other game ends a visit on dart 1 by phase. Test it with the mock
  board and, before M4, the real Autodarts board.
- **A misread quadrant after the reveal:** Correct Score must replay cleanly, and the TV must re-run the reveal
  without leftover green.
- **A spoiler in the DOM:** `correctKey` is in the state. The spec asserts it isn't rendered (no class, no text, no
  data attribute) before `reveal`.
- **Session end mid-round** (§12, question 1).
- **Pace at six players:** about 13 minutes measured by bots. A real bar reads more slowly; time it when Sean plays
  it at M1.
