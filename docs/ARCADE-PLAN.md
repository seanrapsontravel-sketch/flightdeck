# Darts Arcade improvement plan

**Status: milestones 1–3 implemented in the working branch; see [operations and rules](ARCADE-OPERATIONS.md) and [implementation evidence](IMPLEMENTATION-STATUS.md). Milestones 4–7 remain planned.**

Prepared 16 November 2026 from an executed source and browser audit of FlightDeck 0.24.0, commit `9bfc6cf1516d262d003584efd22ca32a1ad43eb7`.

## The recommendation

Build on FlightDeck. Keep its working games, scoring connections and tablet/TV arrangement. Strengthen the parts that protect a session and its scores, then add your own presentation and games.

The intended first setup is **one darts lane, one Samsung Android controller, one TV driven by the M1 MacBook, and up to six singles players**. Continue developing without scoring cameras using the built-in throws and bots. Prove one real scoring system later before promising support for three hardware packages.

The first important milestone is a reliable evening of play: players can move between games, every result counts correctly, the tablet can reconnect, and a host restart does not end the session.

## What is already in place

- A real [GitHub fork](https://github.com/seanrapsontravel-sketch/flightdeck) with upstream attribution and the MIT licence preserved.
- A separate local working copy, so the original audited demo remains available.
- This plan, an [audit baseline](AUDIT-BASELINE.md) and an [asset register](ASSET-REGISTER.md).
- Fourteen third-party example video clips removed from the current files. The inherited Git history still includes them; this is not yet a commercially cleared distribution.

The existing engines and controller are retained. Security fixes, automated tests, recovery, timed sessions and championship standings are implemented in this branch. New games and commercial packaging below remain **planned work**.

## The order of work

| Milestone | What you will be able to do | Indicative effort |
|---|---|---|
| 1. Make the base trustworthy | Play existing games with safer controls, dependable corrected results and repeatable tests | 1–2 weeks |
| 2. Keep the session alive | Recover the same lineup, scores and turn after a restart; tolerate duplicate/retried throws | 3–5 weeks |
| 3. Run an arcade session | Choose 30/60/90 minutes and play a championship across supported games | 2–4 weeks |
| 4. Make the tablet feel premium | Run a simple, consistent touchscreen experience on the actual Samsung | 3–6 weeks, with design support |
| 5. Add 3D Snakes & Ladders | Play the first original Three.js game through the same dependable scoring system | 3–6 weeks after a small 3D integration foundation |
| 6. Add Zombie Siege | Play a polished cooperative survival prototype with waves and dart-driven actions | 6–10 weeks for the first convincing version |
| 7. Package and support it | Install, diagnose and update a commercial hardware package predictably | 6–12+ weeks of dedicated hardening and hardware validation |

These are planning ranges for one experienced developer, full time, with rules agreed and design/art support available. Some work overlaps. They exclude commissioning original art, manufacturing, legal review and extensive content production. A commercial package is a multi-month programme, roughly **4–8+ months**, rather than a short reskin. Release only when each milestone's checks pass.

## Milestone 1 — Make the base trustworthy

### Fix the problems already reproduced

1. **Make names and photos safe.** Treat player names as text, validate avatar inputs, reject impossible board numbers and cap input sizes. A name containing a harmless image tag executed script during the audit; a throw at 19.5 scored fractional points.
2. **Give devices different permissions.** The TV should only display. The paired tablet can operate the game. Restart, configuration, updates and debug actions belong to an operator. Block unrecognised WebSocket origins and check iframe message senders.
3. **Fix completed-result corrections.** A corrected match must update the same result. Quick 10 currently leaves both the old and new score on the leaderboard.
4. **Make installation predictable.** Declare and verify a supported Node runtime, update affected dependencies, and document setup on the M1. Avoid claiming Node 18 support until it works.
5. **Restore delivered tests.** Bring the portable audit checks into the fork, fix the broken test command, and run checks automatically for each change. Preserve completed browser scenarios for Derby, Killer, Demolition, X01 and Quick 10.
6. **Finish media cleanup.** Remove dead example-clip references, ensure the text/animation presentation works with no videos, and replace or clear the remaining images and sounds before any commercial release.

### Make the code easier to change safely

Split the large server into a few clear responsibilities: player management, match/session control, scoring input, saved data and device connections. Separate the controller's behaviour and styles from its huge HTML file as changes naturally touch those areas. Avoid a wholesale frontend rewrite during this milestone.

Make one game catalogue define the title, category, view, supported player counts and available options. The current engine registry is useful, but the picker, labels and backgrounds still repeat the game list elsewhere.

**Ready when:** a fresh checkout starts using the documented runtime; unsafe names display harmlessly; invalid throws are rejected; an unpaired browser cannot change a game; a corrected Quick 10 has one current leaderboard entry; and all five audited game flows pass automatically without example videos.

## Milestone 2 — Keep the session alive

### Save the things that matter

Introduce durable records for the session, lineup, active match, current player, accepted darts, completed results and pending transitions. A small local database such as SQLite is the proposed choice for one Mac host. Keep the existing engine rules behind the new session/storage boundary.

Save a scoring change before telling screens it has been accepted. Store enough information to reconstruct a pending animation/turn change after a restart; saving only the score is insufficient. Use versioned saved data so future updates can read or migrate it.

The existing `run.sh` supervisor already restarts the process. Add session recovery so the restarted process can offer **Resume session** with the same players, score and turn. It must not replay the previous scoring event a second time.

### Make scoring and commands count once

Assign each accepted physical throw a stable identity from its provider/visit/dart position where available. Distinguish a repeated notification from a new dart hitting the same number. Never remove a legitimate repeated T20 merely because it has the same score or arrived quickly.

Give controller commands their own identifiers and acknowledgements. Show a clear disconnected state. Permit safe retries after reconnect, while ensuring a command already accepted is not performed again.

Keep the takeout boundary explicit. Test bursts during overlays, early checkouts, corrections and events arriving after a game has ended. Retain a bounded diagnostic log; do not send the entire growing session log and all avatar data with every dart.

**Ready when:** disconnecting the tablet preserves play; killing the host after any dart restores the same visit; replaying an event changes nothing; two legitimate darts at the same target both count; and results remain correct after a correction followed by another restart.

## Milestone 3 — Run timed sessions and a championship

### Timed sessions

Add a simple setup flow: choose players, choose 30/60/90 minutes, then start. Keep the deadline on the host and save it; refreshing the tablet must not reset the clock.

**Proposed expiry rule for review:** warn with five minutes remaining; at expiry, finish the current three-dart visit, stop further play and show the session results. An operator may extend the session. Pauses, extensions and early endings must be recorded. This rule is a proposal, not implemented behaviour.

Handle the awkward cases explicitly: expiry during an animation, correction, tiebreak or disconnected tablet; a restart that crosses the deadline; and a player leaving early. Idle/wake-lock timers already in FlightDeck are separate from purchased play time.

### Championship across games

Create a standard result from every competitive game: participants, placing, ties, completion status, score details and result version. Most existing games do not currently save a final result.

**Suggested starting points system for review:** 10, 7, 5 and 3 points for first through fourth; tied players share the average points for the occupied places. Recalculate the championship whenever a result is corrected. Abandoned games and simulated/debug results should not silently count in a genuine championship.

Start with individual games among the same participants. Keep solo challenges such as Quick 10 separate until their championship contribution has a fair rule. Team results need an explicit policy before mixing them with individual rankings. Do not add raw scores across games with completely different scales.

Show overall standings on both the tablet and TV, plus a clear final champion screen.

**Ready when:** a full timed session spans at least three games; the standings explain how points were earned; ties and corrections recalculate correctly; and a restart does not reset the timer or championship.

## Milestone 4 — Make the Samsung controller feel premium

Use a short player journey: **players → session → game → play → results**. Keep technical diagnostics in an operator area.

- Large, consistent touch targets and readable type at the tablet's actual screen scaling.
- Reliable onscreen keyboard, focus, back navigation and accidental-tap handling.
- A clear active player, remaining time and connection status.
- An explicit choice between fixed and random playing order. Currently game initialisation shuffles the arranged lineup.
- Player rename/photo update controls and a clear way to remove a player's stored photos.
- A deliberate correction flow that explains the old dart, replacement dart and effect on results.
- Reconnect/resume screens that tell the operator what happened and what to do next.
- Original visual identity, sound and animation, with motion and volume controls.

Test on the physical Samsung in landscape, including dragging, long names, a full lineup, the onscreen keyboard, sleep/wake and network reconnection. Validate the TV separately at 1080p before committing to 4K.

**Ready when:** someone unfamiliar with the software can register four players, start a session, play, correct a dart and choose the next game without opening Debug or needing verbal instructions.

## Milestone 5 — Original Three.js games and Snakes & Ladders

First create a small reusable integration between the existing viewer and a Three.js game. The host owns rules and scores; the TV owns cameras, movement, effects and sound. A reconnecting TV reconstructs the scene from current state rather than needing every previous animation.

Keep 3D assets local, load them once per game, and release graphics resources on exit. Provide quality settings for the 8 GB M1 and measure frame time during the busiest scene. Keep the original games playable while developing this.

For Snakes & Ladders, agree the dart-to-movement rule, turn structure, board size, snakes/ladders, exact-finish rule and tie handling before commissioning the full art. Then build a small playable board and expand it after the rules feel fair and entertaining.

**Ready when:** four players can complete a match; a correction updates the board correctly; a reconnect restores positions; movement and scoring stay in agreement; and the target hardware runs the busiest animation smoothly.

## Milestone 6 — Zombie Siege

Start with a small cooperative game: one arena, a few enemy types, a shared survival objective and escalating waves. Prove the fun before expanding content.

Decide how darts translate into damage, ammunition, accuracy bonuses, special attacks and misses. Define player turns, wave timing, damage taken, win/loss conditions and difficulty. Keep wave timing and game rules authoritative on the host, even while the TV is disconnected.

Reuse the session, participants, accepted throw events, corrections, saved results and Three.js integration. Build new enemy behaviour, wave rules, animations, effects, audio and balancing. Set a clear maximum number of enemies/effects so performance does not collapse during later waves.

**Ready when:** a complete survival run is fun with four players, survives recovery, handles corrected darts sensibly and meets the agreed TV performance target. Add new arenas and enemies afterward.

## Milestone 7 — A commercial hardware package

Choose one supported hardware combination first. Validate actual camera scoring, calibration, misses, takeout, duplicates, provider disconnection and corrections against its exact software/firmware version. The audit proved mock play and mappings, not camera hardware reliability.

Then add a guided setup, device discovery/pairing, predictable startup, protected maintenance, versioned updates with rollback, local backups, an exportable support log and a safe reset process. Document what continues to work without internet for the chosen scoring provider.

Run repeated complete sessions and an unattended soak test on the actual package. Test power interruption, full storage, loss of Wi-Fi, a frozen viewer and failed updates. Finish the asset/branding licence manifest and player-photo retention policy before selling or redistributing it.

**Ready when:** a new operator can install the box and play without developer help; failures have a clear recovery path; an interrupted update rolls back; and every shipped asset has documented rights.

## Suggested first two-week work package

| Order | Deliverable | What we check |
|---|---|---|
| 1 | Supported runtime, portable tests and automatic checks | Clean install; tests actually exist and run |
| 2 | Safe player rendering and strict throw validation | The audit's name-injection and fractional-score cases no longer work |
| 3 | Tablet pairing, read-only TV and restricted maintenance | Unpaired browser cannot score, reset or restart |
| 4 | Stable match/result identity and final-score correction fix | Corrected Quick 10 leaves one current result |
| 5 | Video-free presentation and remaining asset inventory | Missing clips cause no dead panels or failed-media behaviour |
| 6 | Review of the recovery design before implementation | Agree what is saved and how resume/expiry/correction interact |

Take these as small, reviewable changes. Run the existing game flows after each relevant change. Do not begin two large rewrites or both new 3D games at the same time.

## Decisions to make before the relevant milestone

These do not block reading the plan or the fork that has already been created:

- Confirm the public repository name and future product branding; FlightDeck is currently the upstream project name.
- Confirm session expiry, pause and operator-extension rules.
- Agree championship points, ties, changing participants and whether solo/team modes count.
- Choose fixed or random throwing order as the default.
- Approve Snakes & Ladders and Zombie Siege rules before detailed 3D production.
- Pick the first physical scoring system and the exact Samsung/TV configuration to support.

**Recommended next move:** implement Milestone 1, then prove crash recovery with the existing games before investing heavily in original 3D assets.
