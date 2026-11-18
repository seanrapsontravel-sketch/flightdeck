# Arcade sessions (milestones 1–3)

## Start on the M1 Mac

Use Node **22.14 or newer** (Node 22 and 24 are the CI targets). Node 18 is no longer advertised. From this folder:

```sh
npm ci
npm run setup
npm run dev
```

For warning-free HTTPS on the Mac, install `mkcert` using Homebrew and explicitly run the trusted-certificate setup once:

```sh
brew install mkcert
npm run setup:trusted
```

This registers mkcert's local certificate authority in the Mac trust store, then issues a certificate for `localhost`, `127.0.0.1` and `::1`. It may ask for administrator authentication. This is an explicit trust-store change; normal setup, tests and startup never perform it automatically. Previous server certificates are backed up under `certs/server.previous.*`. Restart the host after replacing its certificate. Keep all private keys local.

Open `https://localhost:4000/control` on the Mac. Open `/viewer` on the TV. The viewer can display without pairing and cannot change a game. The fallback setup creates a self-signed certificate, which triggers a browser warning. A tablet using the Mac's LAN address requires a certificate covering that address and its own trust setup; trusting the CA on the Mac does not automatically trust it on Android.

The terminal displays separate eight-digit **tablet** and **operator** codes. Codes expire 15 minutes after startup; existing paired devices stay paired for 30 days. Restart the host to generate fresh codes. Enter a tablet code for ordinary play, or an operator code for configuration, mock throws, board maintenance, pauses and extensions. Codes and pairing cookies are never placed in URLs or public game state. Use the operator permission when developing without cameras.

The host accepts its own localhost, hostname and LAN IP origins. If you deliberately use another hostname, set `FD_ALLOWED_ORIGINS` to its full HTTPS origin. Unrecognised origins are rejected. Keep this single-lane service on the venue network.

For supervised operation, `./run.sh` generates certificates, installs locked dependencies when needed, and restarts a failed host. `npm start` runs the production process directly; `npm run dev` provides reloads. Development reloads also offer session recovery.

## Play a timed session

1. Register players and seat 1–6 people in the singles lineup.
2. Select **Start timed session**, choose 30, 60 or 90 minutes, and choose fixed or random throwing order. Fixed is the default.
3. Select games as usual. The tablet and TV show remaining time and championship standings.
4. At five minutes remaining, the clock displays a warning. When time expires, complete the visit already in progress, then stop. If no visit has started, the session ends immediately. Animations and a disconnected tablet do not reset the host deadline.
5. Use **Standings** to see how each result counts. The final screen names the champion, or joint champions when points tie.

An operator can pause/continue or add 30 minutes in Standings. The session records pauses, extensions, expiry and early ending. Pause stops game input and pending animations and extends the deadline by the pause duration when continued. An operator may extend an ended session. An unfinished match at session end is recorded as abandoned and earns no championship points. A player may leave the lineup between games; games with a different participant set are explicitly excluded from the original championship.

Competitive games use 10 / 7 / 5 / 3 points for first through fourth, and zero thereafter. Ties share the average for the occupied places. Solo games, Quick 10, Warm Up, doubles/team games, abandoned matches, forced debug screens and games containing bots or simulated throws are excluded. Corrections replace the same match and recalculate the standings. Correcting a real dart does not itself make a match simulated.

Derby, Shanghai and Quackshot rank remaining players by their game score. Around the World supplies its own ranking. X01, Cricket, Killer, Limbo and Demolition determine winners, but do not establish a complete finishing order: remaining players share the remaining places. This policy is saved with every result, rather than inventing a ranking from incomparable raw scores.

## Recover and correct

After a host restart, the tablet offers **Resume session**. The host preserves the lineup, game, visit, correction state, takeout gate and pending transition. Resume does not restart the purchased clock. If the deadline passed during the outage, only the previously active visit may finish.

Sent commands are retained in the tablet's session storage until acknowledged, then safely retried after a reconnect. New taps while disconnected are refused with a visible message. Physical scoring deduplicates provider identities, never target values or timing: two separate T20s count twice. OpenDarts carries visit/dart identities. Autodarts and Scolia carry event IDs when their upstream messages provide them. Providers that do not supply stable identities cannot guarantee deduplication across a host restart; verify that with the actual firmware before using paid sessions. Simulated throws remain available to paired operators.

Correct Score edits the last accepted dart. A completed Quick 10 retains one stable leaderboard identity, including after a correction and restart. Starting correction preserves the original result until Apply; Cancel restores it. Applying a correction retracts the old result until the replacement has completed.

## Saved data and troubleshooting

`data/session.json` is a versioned, atomic checkpoint for this one-writer host. It includes results, accepted event/command identities and pending transitions. A complete temporary file is flushed, renamed and its directory flushed before scoring state is broadcast. This uses built-in Node filesystem support instead of introducing SQLite and native installation requirements. SQLite remains an option if multiple lanes/writers or a much larger archive becomes necessary.

Roster data is also kept in `data/players.json`; historical challenge results are in `data/matches.jsonl`. Device token hashes are in `data/devices.json`. Back up the entire `data/` folder while the host is stopped. Do not commit that folder or certificates. Set `FD_DATA_DIR` to use an isolated data folder for a demo or tests.

If a checkpoint cannot be saved, scoring stops and clients disconnect instead of receiving an unsaved score. Free disk space or repair permissions, then restart. An unreadable or unknown-version checkpoint fails startup with an explanation and is preserved for recovery; it is never silently reset. Do not delete a session file to troubleshoot a paid session without preserving a copy first.

The in-memory diagnostic event log is limited to 200 entries. Network snapshots omit this log and serve photos by cached URLs instead of repeating base64 images after every dart. Host logs rotate at 10 MB. Photos remain local; deleting roster entries does not promise removal from historical snapshots or backups. Commercial retention controls and asset clearance belong to later packaging work.

## Checks

```sh
npm run check
npm test
npx playwright install chromium
npm run test:browser
npm audit
```

Tests use temporary data and ephemeral ports. They never clear the real roster. Rule checks cover every existing engine, board mappings, arithmetic, ties and result corrections. Host tests kill and restart the process, retry identities, restore correction mode and a pending completion, and cross the saved deadline. Browser scenarios use a 1280×800 touch controller and separate 1920×1080 TV for Derby, Killer, Demolition, X01 and Quick 10. CI runs rules/recovery on Node 22 and 24 and browser checks on Node 22.

Real Samsung sleep/wake, real scoring cameras, power cuts at the filesystem boundary, and sustained physical venue sessions still require the equipment. These software checks do not certify a commercial hardware package.
