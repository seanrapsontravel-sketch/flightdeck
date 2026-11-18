# 3D games — "How to play" intro screens

Asked for 2026-11-18 (Sean, after watching the Quackshot demo: *"I don't understand the game. … For each 3D game, I want
an engaging screen to begin explaining the game, how it works, how to score and how to win / who wins when."*)

Applies to every 3D game: Derby (`derby.html`), Demolition (`demolition-3d.html`, the 3D build until its swap-in),
Limbo (`limbo.html`), Killer (`killer.html`), Quackshot (`quackshot-3d.html`, until its M4 swap-in). Any new 3D game
gets one too.

## What it is

When a game starts, the TV opens on an animated **How to play** explainer over the game's own 3D world:

1. **How it works** — the premise in one line, then the turn structure (darts per visit, rounds or end condition).
2. **How to score** — a dartboard diagram that lights each scoring zone in turn, beside a legend of what that zone
   does (points or effect). The legend lights in step with the board.
3. **How to win** — who wins and when: the end condition, the winner rule, what happens on a tie, and any twist
   (Quackshot's ×2 final round, Killer's lives).

A footer shows page dots and progress, who throws first, and a pulsing **THROW A DART TO START**.

## Rules for it

- **It never blocks or bends the game.** It's view-only. The server state doesn't change, and nothing waits on it.
  The pages cycle until the **first dart lands**, then the explainer gets out of the way at once. The dart still
  reacts within 100 ms and the board tells the truth (nothing lies).
- **When it shows:** a new game, at its fresh start: round 1, first player, no darts thrown, nobody scored. It
  doesn't show on a reload mid-game, or when a new roster arrives part-way through. It's hidden for winner, draw and
  every takeover phase.
- **The text is true.** Every number in it (points, rounds, lives, targets) comes from the rules engine
  (`src/engines/<game>.js`), and is cited in the game's `intro.js`. Where the state carries a value (e.g.
  `maxRounds`), the intro reads it from the state.
- **One renderer, five contents.** `public/games/lib3d/kit/intro.js` draws and animates it. It injects its own
  styles, and themes itself from each game's accent colour and type. Each game supplies a data file
  `public/games/<game>/intro.js` with `{ title, tagline, accent, pages }` and the board highlights. No per-game CSS.
- **Readable from across a bar:** big type (title ≥ 9rem, body ≥ 3rem at 1080p), at most four short lines a page,
  and ~7 s a page.
- **Everything players type** (the first thrower's name) goes in via `textContent`.

## Build

1. `lib3d/kit/intro.js`: the overlay, the page carousel, the SVG dartboard with animated zone highlights, the
   legend in sync, and `show(opts)` / `hide()` / `isFresh(gd)` helpers. Also `?intro=1` to force it for review.
2. One `intro.js` content file per game, taken from its engine. Each game's page wires `show()` on a fresh game and
   `hide()` on the first dart (or any non-playing phase).
3. Test: `tests/browser/intros.spec.cjs` — for each 3D game in `?demo=1`: the explainer shows at the start with
   the right title, cycles its three pages, and is gone once the first dart has landed. The existing nothing-lies
   specs must still pass.
4. Review renders: `node docs/plans/tools/intros.cjs` gives each game's three pages at 1080p.

## Status — built 2026-11-18

- **The renderer:** `public/games/lib3d/kit/intro.js`. `new Intro(INTRO)` and `intro.sync(gd)` on every state: the
  explainer is up exactly while `INTRO.fresh(gd)` holds. `holdDemo(demo, intro)` pauses a `?demo=1` simulator for one
  cycle, so the demo shows how to play first. It's off in `?capture=1` runs unless `?intro=1`, so the look-dev and
  moment tools keep their framing. `?intro=0` turns it off. While it's up, the page's own `*-hud` steps back.
- **Content files**, each citing its engine:
  - `quackshot/intro.js`
  - `killer/intro.js`
  - `limbo/intro.js`
  - `derby/intro.js`
  - `demolition/intro.js`
- **Wired** at each page's state ingest: `quackshot/main.js`, `killer/main.js`, `limbo/main.js`, `derby/main.js`,
  `demolition/main.js`.
- **Pages:** 1 HOW IT WORKS, with the board tinted by role; 2 HOW TO SCORE, where the zones light one by one in step
  with the legend; 3 HOW TO WIN. About 25 s a cycle (`intro.cycleMs`). The pages loop until the first dart.
- **Tests:**
  - `tests/browser/intros.spec.cjs`: all five games, demo mode. The explainer shows with the right title, board and
    FIRST UP; the demo waits; it leaves on the first dart and the HUD returns.
  - `tests/browser/quackshot.spec.cjs`: the explainer is up on the real TV at the start and gone after the first
    real dart.
- **Review:** `node docs/plans/tools/intros.cjs` → `docs/plans/intros/` (each game's three pages + `contact.jpg`).

Notes from the engines that the copy depends on:
- A Limbo miss **adds 25**.
- Derby and Killer ignore bull and miss.
- Demolition has no draw: two or more checkouts play off from 60.
- After Killer's round 12: a sole Killer wins, several Killers draw, and with no Killers the most marks wins (a tie
  draws).
