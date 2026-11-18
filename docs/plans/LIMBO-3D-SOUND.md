# Limbo 3D — sound (Milestone 5): parked

Parked 2026-11-17 at Sean's request, mid-tuning. **The sound is built and wired in but switched off by default:**
it only plays with `?sound=1` (see `createAudio()` in `public/games/limbo/audio.js`). Turn it back to opt-out
(`?sound=0`) once the to-do list below is done.

Sean's ask: *"fantastic, clear sound to go alongside it… keep it the same theme."*

## What exists

`public/games/limbo/audio.js`: procedural Web Audio, no files except `/assets/shared/winner-cheers.mp3`.

- **Mix:** buses for amb / music / sfx / crowd → an open-air convolution reverb send → a 40 Hz double high-pass →
  glue compressor → brick-wall limiter. The music bus has a ducker that big SFX and the announcer push down.
- **Ambience:** stereo surf (band-passed noise in slow swells plus crest hiss), cicada pulses, a crowd murmur, and
  the fire's roar and crackle, whose level and density follow the heat.
- **Groove:** a calypso band of pan chop on the offbeat 8ths, marimba bass walk, shaker, tiki drum (heat > 0.25),
  congas (> 0.35), a 3-2 woodblock clave (> 0.55) and a two-bar pan-lead phrase generator. Tempo is 98 → 126 BPM
  with heat, alternating I–IV–V7–I and I–vi–IV–V. `dropOut(bars)` after a burn.
- **Moments:** visitStart (drum roll), leap, land, dart (whoosh + tiki hit + pan note pitched by height, with a
  tritone edge near the bar), tension drone (from ball–bar closeness), coconutFall + bonk, noRoom, fireball, conch,
  groan, snuff, timber, thud, gong, tooth (drop clunk / reset tick), resetRun, limbo, splash, flourish, ting,
  gasp, cheer, firework (delayed by distance), winner (roll + pan arpeggio + conch chord + cheer + cheers clip).
- **Hooks:** all game hooks are in `limbo/game.js` (`this.audio?.…`), with stereo pan from the screen position
  (`panOf`). `limbo/main.js` creates it, runs `audio.update()` each frame and calls `tooth()` from `rig.onTooth`.
- **Announcer:** ducks on `DART_ANNOUNCE` and on a `dartAnnounce.seq` change when `dartCalloutMode` is sound/both.
- **Unlock:** a "🔈 Click for sound" pill shows while the AudioContext is suspended (ordinary browsers); the venue
  kiosk allows autoplay.

## Verification tooling

`docs/plans/tools/sound-reel.cjs <out.wav>` renders the engine
offline (OfflineAudioContext, 48 kHz) as a 34 s scripted reel of every moment in game order with heat rising, then
writes a WAV. Measure with:

```
ffmpeg -i reel.wav -af ebur128=peak=true -f null -          # integrated loudness, LRA, true peak
ffmpeg -i reel.wav -lavfi showspectrumpic=s=1600x600:fscale=log:legend=1 spec.png
```

Last measurement (after the first low-end pass): −15.5 LUFS integrated, peak −2.2 dBFS, no non-finite samples,
LRA ≈ 3.5 LU.

## To do when resumed

1. **The low end is still too heavy** (the main clarity problem). Energy below 120 Hz is only ~3.5 dB under the
   whole mix. Banding the surf/roar and adding a 40 Hz master high-pass didn't move it, so the source is probably
   the music (marimba bass every bar, tiki drum on 1 and 3, the drums' new 2nd harmonic) and the SFX drums.
   **Render stems** (amb / music / sfx / crowd separately; the stem switch was about to go into `reel.cjs`) and
   measure each one's <120 Hz share and loudness before changing anything. Then likely: bass-line notes shorter
   and an octave up, music-bus low shelf −4 dB, the tiki drum lighter, and dart drums tighter.
2. **Dynamics:** LRA 3.5 LU is flat. Moments should sit ~8–10 dB over the bed. Lower the bed (amb 0.4 → ~0.28,
   music 0.3 → ~0.22) and ease the glue compressor (ratio 2.5 → 1.8), then re-measure the momentary loudness of each
   moment against the bed (ebur128 framelog).
3. **Listen to every moment in isolation** (a reel per moment) and judge by ear. The crowd voices (saw + formants)
   are the riskiest part; if they read as synthetic, layer `winner-cheers.mp3` slices under cheers or find a CC0
   crowd bed (asset register).
4. Groove variety over minutes: check there's no fatigue at 10+ minutes (phrase bank, fills every 8 bars, a
   breakdown when the bar resets).
5. The announcer duck depth with callouts on (venue `dartCalloutMode: 'sound'`); doubles; `?volume=`.
6. Real Chrome on the M1: CPU cost of the groove scheduler (node churn) at heat 1; no glitches under the 3D load.
7. **Venue control:** there's no game-sound setting in `src/venueConfig.js`. Propose `gameSoundEnabled` +
   `gameSoundVolume` with a tablet toggle (a server change across venueConfig + control UI; ask Sean first).
8. Re-enable by default (`?sound=0` to mute), add a Playwright assertion that the page has no audio errors, and
   add the CHANGELOG / asset register lines (procedural; `winner-cheers.mp3` already registered).
