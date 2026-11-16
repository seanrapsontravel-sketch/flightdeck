# Audit baseline

The improvement plan is based on an executed audit, not just a README review.

- Source: [richiela/flightdeck](https://github.com/richiela/flightdeck).
- Audited version: 0.24.0.
- Audited commit: `9bfc6cf1516d262d003584efd22ca32a1ad43eb7`.
- Audit date: 16 November 2026.
- Host: Apple M1 MacBook Pro, 8 GB RAM; Node 22.14.0.
- Recommendation: fork with significant changes; code quality 5/10.

## Executed checks

The original application was installed and run in its built-in mock mode. Playwright controlled a touch-capable 1280×800 controller context and separate 1920×1080 viewer context.

- Registered four named players, including an avatar from Chromium's synthetic camera.
- Seated and rearranged the lineup using the actual UI.
- Completed Derby, Killer, Demolition, X01 and Quick 10 with expected scores/winners.
- Exercised built-in random throws, Next Player, automatic bots and last-dart correction/cancel.
- Tested rapid events, repeated scoring actions, controller reconnection, offline commands, server restart and process crash.
- Checked saved roster and supported leaderboard data.
- Ran 16 independent rule/mapping/history tests: 16 passed.
- Final browser audit: 17 scenarios, comprising 11 passed checks, 4 reproduced application deficiencies and 2 behavioural observations, with no unexpected harness failures in that final run.

The upstream `npm test` command could not execute: its five referenced test files were missing from the repository. The independent audit scripts remain in the separate local audit folder; bringing portable tests into this fork is planned in Milestone 1.

## Confirmed problems driving the plan

| Problem | Observed behaviour |
|---|---|
| Unsafe player rendering | A harmless image tag in a name executed a local JavaScript marker in the controller |
| Unrestricted control connection | A connection with an unrelated WebSocket Origin was accepted and could change the app |
| No active-match recovery | After normal restart and forced process crash, a match at 281 points returned to registration with no game data and an empty seated lineup |
| Stale corrected results | A completed Quick 10 changed from 790 to 840 after correction, but both results remained on the leaderboard |
| No central event deduplication | An identical action with the same supplied event identifier counted as two darts |
| Incomplete input validation | A treble at number 19.5 scored 58.5 |
| Broken advertised runtime | Node 18.20.8 failed to load the locked UUID dependency from CommonJS |
| Lineup order differs from throwing order | A Ben/Alice/Chloe/Dev lineup became Chloe/Ben/Alice/Dev in Derby because game setup shuffles players |

The roster and Quick 10 history survived the restart/crash tests. Closing only the controller connection recovered the active match correctly. Excess rapid throws stayed within one visit and were discarded after the three-dart boundary. Offline controller actions were dropped rather than replayed.

Source review found persistent leaderboard results for Quick 10 and Around the World, but no universal results archive or championship. The server sends full state with a growing event log and avatar data. Persistence and pending transition recovery need a stronger design.

Dependency scans at audit time identified six affected packages overall, including three in production dependencies. Advisory severity is not the same as demonstrated exploitability; assess the actual routes and configuration while updating. No dependency versions were changed during the audit.

## Performance and limits

Server samples were approximately 45–67 MiB resident memory with very low instantaneous CPU. A five-second headed-browser sample of a quiet Derby viewer recorded a median animation-frame interval of 16.7 ms, 95th percentile 18.7 ms and no intervals above 50 ms. This supports a 1080p prototype; it does not establish sustained 4K or future 3D performance.

Autodarts, OpenDarts and Scolia mappings were checked for all 60 numbered beds and explicit bull/miss cases. No real scoring hardware/cloud credentials were available. Physical Samsung touch behaviour, Wi-Fi, TV output, long-duration play and exhaustive doubles/playoff cases were not verified.

## Evidence location

The full report, screenshots, state captures, audit scripts, logs and recorded outputs are retained locally in `flightdeck-audit`, separate from the running original `flightdeck` checkout and this `flightdeck-fork` working copy.

No player photos, local credentials, private TLS keys or runtime data were copied into this public repository. This document summarises the baseline; it does not claim the planned fixes have been completed.
