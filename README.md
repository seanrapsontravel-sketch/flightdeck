# flightdeck

## Darts Arcade fork

This is Sean's working fork of [richiela/flightdeck](https://github.com/richiela/flightdeck), based on audited commit `9bfc6cf1516d262d003584efd22ca32a1ad43eb7`.

**Start here: [Darts Arcade improvement plan](docs/ARCADE-PLAN.md).**

- [Audit baseline and confirmed problems](docs/AUDIT-BASELINE.md)
- [Asset status and removed example clips](docs/ASSET-REGISTER.md)

The game code is unchanged at this planning stage. The example film/TV/sports clips have been removed from the current tree. Other assets still need a commercial rights review, and the inherited Git history still contains the original clips. Turn **Viewer Video off** in Configure when trying this fork. Existing video references will be cleaned up in the first implementation milestone.

Use **Node 22.14.0**, the version exercised in the audit, for now. The upstream Node 18 claim below is not valid with the current locked UUID dependency. The upstream test command also references missing files. Fixing the runtime contract and restoring a reproducible test suite are first-milestone tasks.

The upstream project description and instructions follow.

---

A control panel + kiosk display for running a real dartboard as a party/venue
game system, inspired by [Flight Club](https://flightclubdarts.com/). This is a personal fan project,
not affiliated with or endorsed by Flight Club — built for my own dartboard
because I wanted that kind of experience at home. Some of the game names
(Killer, Shanghai, Cricket, X01) are just standard, decades-old pub-darts
terms that predate any single venue. A few others (Demolition, Derby, Limbo,
Quackshot) are closer to Flight Club's own naming.

One screen (**Control**) for the operator to register players, pick a game,
and manage the match; a second screen (**Viewer**) for the big display
everyone actually watches while playing. Obviously, you can just have a laptop
next to you with two tabs open too.

Eleven games ship out of the box — Demolition, Limbo, Derby, Killer, Quackshot,
Shanghai, Warm Up, Quick 10, X01, Cricket, and Around the World — with
player registration, avatar capture, and per-venue configuration (idle
timeouts, callout duration, which games are enabled).

## Quick start

No hardware required — runs against a mock board so you can see every game
end to end.

You need node 18+, npm and openssl installed already — `run.sh` checks for
all three up front and tells you exactly what is missing.

```bash
git clone <this-repo-url>
cd flightdeck
./run.sh
```

That installs dependencies, generates a local self-signed TLS cert on first
run, and starts the server. Open `https://localhost:4000/control.html`
(accept the self-signed cert warning) — that's the operator panel. Point a
second screen or window at `https://localhost:4000/viewer.html` for the
display everyone watches.  We need SSL for camera support.. BOO!

`PORT=5000 ./run.sh` to use a different port.

## Real hardware

FlightDeck talks to three dartboard scoring systems:

- **[Scolia](https://scoliadarts.com/)** — cloud-connected, the default provider
- **[Autodarts](https://autodarts.io/)** — local Board Manager, self-hosted
- **[OpenDarts](https://github.com/richiela/opendarts)** — an opensource dart scoring program

Pick one from Control's Board Debug panel, or set it in `data/board.json`.
Each provider needs its own host/port; see `src/board/createBoardDriver.js`
for the exact config shape.

## Configuration

Everything venue-specific lives in `data/` (gitignored, never committed):

| File | What |
|---|---|
| `board.json` | Which board provider is active, and its host/port |
| `venue.json` | Arena name, idle timeouts, dart-callout duration, which games are enabled |
| `players.json` | Registered player roster + avatars |
| `scolia.json` | Scolia board credentials (`serialNumber` + `accessToken`), if using that provider |

**None of these are created for you, and that is deliberate.** Running the app
doesn't write them; they appear the first time you change the corresponding
setting (through Control's Configure panel, or Board Debug for `board.json`).
Until then the code simply uses its built-in defaults, from `src/venueConfig.js`
and `src/board/createBoardDriver.js`.

The reason is that a config file, once written, wins forever. If the app
generated `venue.json` on first boot, every later improvement to a default —
a better idle timeout, a newly enabled game — would be silently ignored on
every existing install, because a file written months ago would still be
overriding it. "File absent" meaning "follow current defaults" is what keeps
upgrades working without a migration step.

So you only need to create one of these by hand if you want to set something
without going through the UI. `data/venue.json` is the usual one, and it is a
partial override — include only the keys you care about:

```jsonc
{
  "arenaName": "The Tungsten Arms",
  "dartCalloutMs": 1200,
  "dartCalloutMode": "card",     // 'card' | 'sound' | 'both' | 'off'
  "registrationIdleMs": 600000,  // release the avatar camera after 10 min idle
  "inGameIdleMs": 600000,        // allow display sleep after 10 min idle
  "boardStandbyMinutes": 30,     // Autodarts/OpenDarts camera standby
  "games": { "killer": false }   // list only what you turn off
}
```

`DEFAULT_VENUE` in `src/venueConfig.js` is the full list of keys and their current
values.

## Videos

Winner screens, busts, and eliminations can play a short video instead of
just a text overlay. Upstream shipped example film, TV and sports clips;
its author explicitly said they did not hold the rights to them. Those
fourteen clips have been removed from this fork's current tree. The
inherited Git history still contains them.

Use **Viewer Video off** until original or appropriately licensed clips
are supplied. See [the asset register](docs/ASSET-REGISTER.md) for remaining
rights checks and the planned cleanup of existing video references.
Point a game's config at any `.mp4` the same way — see
`public/games/event-videos.js` and each game's own HTML for where the
paths are wired up.

## Sounds

Each dart thrown can also get an audible callout ("triple twenty", "bust",
etc.) instead of, or alongside, the on-screen callout card — set
`dartCalloutMode` (`'card' | 'sound' | 'both' | 'off'`) in `data/venue.json`.

Upstream describes `public/assets/sounds/callouts/{Bella,Daniel}/` as
locally generated synthetic speech made with Kokoro TTS (Apache-2.0).
This fork retains those files for prototyping; the exact model/voice terms
and any required notices must be verified before commercial distribution.
Pick the
voice with `dartCalloutVoice` in `data/venue.json`. Run
`scripts/generate-callout-sounds.py` to regenerate a set or add a new voice.

## Adding a game

Application code lives in `src/` (`server.js`, the engines and board
drivers); `public/` is what the browser loads, and `data/` and `certs/` are
created at runtime beside them.

Each game is two files: one in `src/engines/` for the rules, scoring and timing,
and one in `public/games/` for its screen. Register it in `src/engines/registry.js`
and add its name to `ALL_GAMES` in `src/venueConfig.js` — nothing else in the
codebase needs to know it exists. `src/engines/README.md` has the full contract.


## Last things to know
The entire system is completely configurable.  Hate an image or the registration page;
replace the png files.  All images used for games came from stock photo sites.

Working on front facing camera to capture key moments.  Will finish when I get
back to it.


## License

MIT — see [LICENSE](LICENSE). Do whatever you want with it.
