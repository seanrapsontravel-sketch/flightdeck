// Limbo's sound: procedural Web Audio, no files except the shared winner cheers.
//
// The mix, built for clarity on a bar's TV speakers:
//   amb   (surf, cicadas, crowd murmur, fire roar + crackle)  high-passed, quiet, wide
//   music (calypso groove: pan chop, marimba bass, shaker, congas, tiki drum, pan lead)  ducks under SFX + announcer
//   sfx   (every game moment)  dry-ish, forward
//   crowd (cheers, groans, gasps)
//   → a short open-air reverb send → glue compressor → brick-wall limiter → out
// Each element sits in its own band: bass/drum thump < 200 Hz, pans 500 Hz–3 kHz, shaker + crackle above 5 kHz,
// surf a low wash under it all.
//
// Every sound takes a start time (`when`, AudioContext seconds), and the groove has scheduleUntil(t), so the same
// engine renders offline (OfflineAudioContext) for checking and for the sound reel.
const A4 = 440;
const midiHz = (m) => A4 * Math.pow(2, (m - 69) / 12);
const R = (a, b) => a + Math.random() * (b - a);
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

// C major, calypso: I – IV – V7 – I and I – vi – IV – V. Chord tones as MIDI.
const PROG = [
    [{ root: 48, tri: [60, 64, 67] }, { root: 53, tri: [60, 65, 69] }, { root: 55, tri: [59, 62, 67] }, { root: 48, tri: [60, 64, 67] }],
    [{ root: 48, tri: [60, 64, 67] }, { root: 57, tri: [60, 64, 69] }, { root: 53, tri: [60, 65, 69] }, { root: 55, tri: [59, 62, 65] }],
];
// pan notes for a dart, by the ball's height: C major pentatonic from C5 up two octaves
const PENTA = [72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96];

export class LimboAudio {
    /** ctx: an AudioContext or OfflineAudioContext (made here if omitted); volume 0..1 */
    constructor({ ctx = null, volume = 0.85 } = {}) {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = ctx || new AC({ latencyHint: 'interactive' });
        this.offline = typeof OfflineAudioContext !== 'undefined' && this.ctx instanceof OfflineAudioContext;
        this.heat = 0; this.tension = 0;
        this.grooveOn = false; this.nextStep = 0; this.step16 = 0; this.bar = 0; this.prog = 0; this.dropUntilBar = -1; this.fill = 0;
        this.phrase = null;
        this.build(volume);
    }

    // ------------------------------------------------------------ graph
    build(volume) {
        const c = this.ctx;
        this.master = c.createGain(); this.master.gain.value = volume;
        const glue = c.createDynamicsCompressor();
        Object.assign(glue, {}); glue.threshold.value = -20; glue.knee.value = 8; glue.ratio.value = 2.5; glue.attack.value = 0.012; glue.release.value = 0.25;
        const limit = c.createDynamicsCompressor();
        limit.threshold.value = -4; limit.knee.value = 0; limit.ratio.value = 20; limit.attack.value = 0.002; limit.release.value = 0.12;
        this.glue = glue; this.limiter = limit;
        const hp1 = c.createBiquadFilter(); hp1.type = 'highpass'; hp1.frequency.value = 40; hp1.Q.value = 0.7;
        const hp2 = c.createBiquadFilter(); hp2.type = 'highpass'; hp2.frequency.value = 40; hp2.Q.value = 0.7;
        this.hp = hp1;
        hp1.connect(hp2).connect(glue);
        glue.connect(limit).connect(this.master).connect(c.destination);
        // reverb: a short, airy open-air space (a beach has no walls: quick, bright-ish, low density)
        this.verb = c.createConvolver(); this.verb.buffer = this.impulse(1.5, 2.6);
        const verbOut = c.createGain(); verbOut.gain.value = 0.32;
        const verbHP = c.createBiquadFilter(); verbHP.type = 'highpass'; verbHP.frequency.value = 220;
        this.verb.connect(verbHP).connect(verbOut).connect(hp1);
        // each bus can have a steep (24 dB/oct) high-pass to keep it out of the low end it doesn't own
        const bus = (g, hp = 0) => {
            const n = c.createGain(); n.gain.value = g;
            if (hp) { const f = c.createBiquadFilter(), f2 = c.createBiquadFilter(); f.type = f2.type = 'highpass'; f.frequency.value = f2.frequency.value = hp; n.connect(f).connect(f2).connect(hp1); } else n.connect(hp1);
            return n;
        };
        this.sfx = bus(1.0, 35);
        this.crowd = bus(0.55, 120);
        this.amb = bus(0.4, 140);
        // music: its own gain (the groove level), then a ducker the SFX and the announcer push down
        this.musicDuck = c.createGain(); this.musicDuck.gain.value = 1; this.musicDuck.connect(hp1);
        this.music = c.createGain(); this.music.gain.value = 0.3; this.music.connect(this.musicDuck);
        this.ambDuck = this.amb;
        // sends to the reverb
        this.wet = c.createGain(); this.wet.gain.value = 1; this.wet.connect(this.verb);
        // noise
        this.white = this.noiseBuffer(3, 'white'); this.pink = this.noiseBuffer(4, 'pink'); this.brown = this.noiseBuffer(5, 'brown');
    }

    impulse(sec, decay) {
        const c = this.ctx, n = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, n, c.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
            const d = b.getChannelData(ch); let lp = 0;
            for (let i = 0; i < n; i++) {
                const t = i / n, early = i < c.sampleRate * 0.012 ? 0 : 1;
                lp += (Math.random() * 2 - 1 - lp) * (0.55 - 0.4 * t);   // darker as it decays (air absorbs the highs)
                d[i] = lp * Math.pow(1 - t, decay) * early;
            }
        }
        return b;
    }
    noiseBuffer(sec, kind) {
        const c = this.ctx, n = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, n, c.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
            const d = b.getChannelData(ch); let b0 = 0, b1 = 0, b2 = 0, br = 0;
            for (let i = 0; i < n; i++) {
                const w = Math.random() * 2 - 1;
                if (kind === 'white') d[i] = w;
                else if (kind === 'pink') { b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; }
                else { br = (br + 0.02 * w) / 1.02; d[i] = br * 3.5; }
            }
        }
        return b;
    }

    get now() { return this.ctx.currentTime; }
    resume() { if (!this.offline && this.ctx.state !== 'running') return this.ctx.resume().catch(() => {}); }

    // ------------------------------------------------------------ voices (building blocks)
    /** a gain envelope: 0 → peak in a, then exponential-ish decay to silence over d */
    env(g, t, a, peak, d) {
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(peak, t + a);
        g.gain.setTargetAtTime(0, t + a, Math.max(0.005, d / 4));
    }
    out(dest, pan = 0, wet = 0) {
        const c = this.ctx, g = c.createGain(), p = c.createStereoPanner();
        p.pan.value = Math.max(-1, Math.min(1, pan));
        g.connect(p).connect(dest);
        if (wet > 0) { const s = c.createGain(); s.gain.value = wet; p.connect(s).connect(this.wet); }
        return g;
    }
    noise(buf, t, dur, dest, { type = 'bandpass', f = 1000, q = 1, f2 = null, gain = 0.5, a = 0.005, pan = 0, wet = 0, rate = 1 } = {}) {
        const c = this.ctx, s = c.createBufferSource();
        s.buffer = buf; s.loop = true; s.playbackRate.value = rate;
        const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
        if (f2) fl.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
        const g = c.createGain();
        this.env(g, t, a, gain, dur);
        s.connect(fl).connect(g).connect(this.out(dest, pan, wet));
        s.start(t, Math.random() * (buf.duration - 0.1)); s.stop(t + dur * 1.6 + 0.2);
        return { s, fl, g };
    }
    tone(t, f, dur, dest, { type = 'sine', gain = 0.3, a = 0.003, pan = 0, wet = 0, f2 = null, glide = 0.05 } = {}) {
        const c = this.ctx, o = c.createOscillator(); o.type = type;
        o.frequency.setValueAtTime(f, t);
        if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(10, f2), t + glide);
        const g = c.createGain(); this.env(g, t, a, gain, dur);
        o.connect(g).connect(this.out(dest, pan, wet));
        o.start(t); o.stop(t + dur * 1.6 + 0.05);
        return o;
    }

    /** steel pan: a near-harmonic stack (1, 2, 3 and a bright 4.2) with fast attack, the partials decaying at
     *  different rates, a little beating from a detuned pair, and a mallet tick */
    pan(t, midi, { gain = 0.22, dur = 1.1, pan = 0, dest = this.music, wet = 0.22 } = {}) {
        const f = midiHz(midi), parts = [[1, 1, 1], [1.003, 0.35, 0.9], [2, 0.55, 0.6], [3, 0.22, 0.4], [4.2, 0.07, 0.18]];
        for (const [k, g, d] of parts) this.tone(t, f * k, dur * d, dest, { gain: gain * g, a: 0.004, pan, wet });
        this.noise(this.white, t, 0.018, dest, { f: Math.min(9000, f * 6), q: 1.2, gain: gain * 0.35, a: 0.001, pan });
    }
    /** marimba / log bass: woody fundamental + the 4th partial of a tuned bar */
    marimba(t, midi, { gain = 0.34, dur = 0.42, pan = 0, dest = this.music } = {}) {
        const f = midiHz(midi);
        this.tone(t, f, dur, dest, { gain, a: 0.004, pan });
        this.tone(t, f * 3.93, dur * 0.25, dest, { gain: gain * 0.18, a: 0.002, pan });
        this.tone(t, f * 2, dur * 0.4, dest, { gain: gain * 0.12, a: 0.003, pan });
    }
    /** tiki drum / conga / bongo: a membrane whose pitch drops on the strike, plus a slap of noise */
    drum(t, { f = 120, f2 = 70, dur = 0.35, gain = 0.6, slap = 0.15, slapF = 1800, pan = 0, dest = this.sfx, wet = 0.12 } = {}) {
        this.tone(t, f, dur, dest, { gain, a: 0.002, f2, glide: dur * 0.35, pan, wet });
        this.tone(t, f * 2, dur * 0.5, dest, { gain: gain * 0.28, a: 0.002, f2: f2 * 2, glide: dur * 0.35, pan });
        if (slap) this.noise(this.white, t, 0.05, dest, { f: slapF, q: 0.9, gain: slap, a: 0.001, pan, wet });
    }
    /** a short whoosh: band-passed noise sweeping (a leap, a launch, a ball under the bar) */
    whoosh(t, { dur = 0.45, f = 400, f2 = 2200, gain = 0.25, pan = 0, q = 1.4, dest = this.sfx, wet = 0.15 } = {}) {
        this.noise(this.pink, t, dur, dest, { f, f2, q, gain, a: dur * 0.45, pan, wet });
    }

    // ------------------------------------------------------------ ambience
    startAmbience(t = this.now) {
        if (this.ambOn) return; this.ambOn = true;
        const c = this.ctx;
        // the lagoon: two independent low washes (left / right), each breathing in slow swells, with a hiss on the crest
        for (const [pan, period, ph] of [[-0.6, 7.3, 0], [0.6, 8.9, 2.1]]) {
            const s = c.createBufferSource(); s.buffer = this.brown; s.loop = true;
            const lp = c.createBiquadFilter(); lp.type = 'bandpass'; lp.frequency.value = 380; lp.Q.value = 0.55;
            const g = c.createGain(); g.gain.value = 0.0;
            const lfo = c.createOscillator(); lfo.frequency.value = 1 / period;
            const depth = c.createGain(); depth.gain.value = 0.22;
            lfo.connect(depth).connect(g.gain);
            g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.3, t + 3);
            const lfo2 = c.createGain(); lfo2.gain.value = 180; lfo.connect(lfo2).connect(lp.frequency);
            s.connect(lp).connect(g).connect(this.out(this.amb, pan));
            s.start(t, ph); lfo.start(t + ph);
            // crest hiss
            const h = c.createBufferSource(); h.buffer = this.pink; h.loop = true;
            const hp = c.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 3200; hp.Q.value = 0.5;
            const hg = c.createGain(); hg.gain.value = 0;
            const hd = c.createGain(); hd.gain.value = 0.025; lfo.connect(hd).connect(hg.gain);
            h.connect(hp).connect(hg).connect(this.out(this.amb, pan * 0.8));
            h.start(t, ph);
        }
        // the fire: a low roar and a crackle, both following the heat
        {
            const s = c.createBufferSource(); s.buffer = this.brown; s.loop = true;
            const lp = c.createBiquadFilter(); lp.type = 'bandpass'; lp.frequency.value = 230; lp.Q.value = 0.8;
            this.roar = c.createGain(); this.roar.gain.value = 0;
            s.connect(lp).connect(this.roar).connect(this.out(this.amb, 0)); s.start(t);
        }
        // the crowd murmur under it all (a bar full of people, felt more than heard)
        {
            const s = c.createBufferSource(); s.buffer = this.pink; s.loop = true;
            const f1 = c.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 520; f1.Q.value = 1.2;
            const f2 = c.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1300; f2.Q.value = 1.6;
            this.murmur = c.createGain(); this.murmur.gain.value = 0;
            s.connect(f1).connect(this.murmur); s.connect(f2).connect(this.murmur);
            const mod = c.createOscillator(); mod.frequency.value = 0.31; const md = c.createGain(); md.gain.value = 0.012; mod.connect(md).connect(this.murmur.gain);
            this.murmur.connect(this.out(this.crowd, 0.1, 0.2)); s.start(t); mod.start(t);
            this.murmur.gain.setValueAtTime(0, t); this.murmur.gain.linearRampToValueAtTime(0.05, t + 4);
        }
        this.ambT = t; this.crackleT = t; this.cicadaT = t + 1;
    }
    /** scattered events in the ambience (crackles, cicada pulses): call with the schedule horizon */
    ambienceUntil(until) {
        if (!this.ambOn) return;
        // crackle: sparse clicks, denser and louder with heat
        const rate = 7 + 38 * this.heat;
        while (this.crackleT < until) {
            this.crackleT += -Math.log(1 - Math.random()) / rate;
            const g = R(0.02, 0.08) * (0.5 + this.heat);
            this.noise(this.white, this.crackleT, R(0.004, 0.02), this.amb, { f: R(2500, 7000), q: R(0.8, 3), gain: g, a: 0.0008, pan: R(-0.35, 0.35) });
        }
        // cicadas: a soft pulsing chirp, left and right, now and then
        while (this.cicadaT < until) {
            const t = this.cicadaT, pan = Math.random() < 0.5 ? -0.85 : 0.85, n = 6 + ((Math.random() * 10) | 0), f = R(4300, 5200);
            for (let i = 0; i < n; i++) this.tone(t + i * 0.055, f, 0.035, this.amb, { gain: 0.012, a: 0.008, pan });
            this.cicadaT += R(2.5, 6);
        }
    }

    // ------------------------------------------------------------ heat / tension / ducking
    setHeat(h) {
        h = clamp01(h);
        if (Math.abs(h - this.heat) < 0.004 && this.heatSet) return;
        this.heatSet = true; this.heat = h;
        if (this.roar) this.roar.gain.setTargetAtTime(0.06 + 0.22 * this.heat, this.now, 0.6);
        if (this.murmur) this.murmur.gain.setTargetAtTime(0.045 + 0.06 * this.heat, this.now, 1.2);
    }
    /** 0 = ball far from the bar, 1 = touching: a low drone and the fire crackle swell */
    setTension(v) {
        v = clamp01(v);
        if (this.drone && Math.abs(v - this.tension) < 0.01) return;
        const c = this.ctx;
        if (!this.drone) {
            const g = c.createGain(); g.gain.value = 0;
            const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300; lp.Q.value = 3;
            for (const [f, d] of [[55, 0], [55.4, 0], [82.4, 0.2]]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d; o.connect(lp); o.start(); }
            lp.connect(g).connect(this.out(this.sfx, 0, 0.2));
            this.drone = { g, lp };
        }
        this.tension = v;
        this.drone.g.gain.setTargetAtTime(0.11 * v * v, this.now, 0.25);
        this.drone.lp.frequency.setTargetAtTime(220 + 900 * v * v, this.now, 0.3);
    }
    /** push the music (and ambience) down for a moment: big SFX, the announcer's callout */
    duck(depth = 0.45, dur = 1, t = this.now) {
        const g = this.musicDuck.gain;
        g.cancelScheduledValues(t); g.setTargetAtTime(depth, t, 0.03); g.setTargetAtTime(1, t + dur, 0.35);
    }

    // ------------------------------------------------------------ the groove
    startGroove(t = this.now) { if (this.grooveOn) return; this.grooveOn = true; this.nextStep = t + 0.1; this.step16 = 0; this.bar = 0; this.music.gain.setTargetAtTime(0.3, t, 0.5); }
    stopGroove(t = this.now) { this.grooveOn = false; this.music.gain.setTargetAtTime(0.0001, t, 0.4); }
    /** the band drops out (only the shaker keeps time) for n bars: after a burn */
    dropOut(bars = 2) { this.dropUntilBar = this.bar + bars; }
    bpm() { return 98 + 28 * this.heat; }
    scheduleUntil(until) {
        this.ambienceUntil(until);
        if (!this.grooveOn) return;
        while (this.nextStep < until) {
            const s16 = 60 / this.bpm() / 4, swing = this.step16 % 2 ? s16 * 0.12 : 0;
            this.playStep(this.nextStep + swing, this.step16);
            this.nextStep += s16;
            if (++this.step16 === 16) { this.step16 = 0; this.bar++; if (this.bar % 8 === 0) this.prog = 1 - this.prog; }
        }
    }
    playStep(t, s) {
        const H = this.heat, chord = PROG[this.prog][this.bar % 4], drop = this.bar < this.dropUntilBar;
        const M = this.music, hum = () => R(0.85, 1.1);
        // shaker: every 16th, accents on the offbeats; it's the one thing that never stops
        this.noise(this.white, t, 0.04, M, { type: 'highpass', f: 6500, q: 0.7, gain: (s % 4 === 2 ? 0.09 : s % 2 ? 0.035 : 0.055) * hum(), a: 0.006, pan: 0.35 });
        if (drop) return;
        // marimba bass: root on 1, fifth on 2&, root on 3, third on 4, fifth on 4& (the calypso walk)
        const bass = { 0: 0, 6: 7, 8: 0, 12: 4, 14: 7 };
        if (s in bass) this.marimba(t, chord.root + bass[s] - 12 + (bass[s] === 4 ? 0 : 0), { gain: s === 0 ? 0.38 : 0.28 });
        // pan chop: the chord rolled on the offbeat 8ths
        if (s % 4 === 2) chord.tri.forEach((m, i) => this.pan(t + i * 0.011, m, { gain: 0.07 * hum(), dur: 0.38, pan: -0.3 + i * 0.15, wet: 0.15 }));
        // tiki drum: 1 and 3 once things warm up, a pickup on 4& when it's hot
        if (H > 0.25 && (s === 0 || s === 8)) this.drum(t, { f: 95, f2: 58, dur: 0.32, gain: 0.32, slap: 0.04, dest: M, wet: 0.05 });
        if (H > 0.7 && s === 14) this.drum(t, { f: 110, f2: 70, dur: 0.2, gain: 0.22, slap: 0.05, dest: M });
        // congas (mid heat up): a light tumbao
        if (H > 0.35) {
            const cg = { 3: [300, 0.05, 0.05], 6: [420, 0.1, 0.16], 7: [330, 0.08, 0.04], 14: [300, 0.12, 0.05], 15: [300, 0.1, 0.05] };
            if (s in cg) { const [f, g, sl] = cg[s]; this.drum(t, { f, f2: f * 0.85, dur: 0.16, gain: g, slap: sl, slapF: 2600, pan: 0.45, dest: M, wet: 0.08 }); }
        }
        // woodblock clave (3-2) when it's hot
        if (H > 0.55 && [0, 6, 12].includes(s) && this.bar % 2 === 0 || H > 0.55 && [4, 8].includes(s) && this.bar % 2 === 1) this.tone(t, 1250, 0.05, M, { gain: 0.05, pan: -0.5, wet: 0.1 });
        // the pan lead: two-bar phrases from chord tones, more notes and higher as the heat rises
        if (H > 0.12) {
            if (s === 0 && this.bar % 2 === 0) this.phrase = this.makePhrase(chord, H);
            const ph = this.phrase && this.phrase[(this.bar % 2) * 16 + s];
            if (ph) this.pan(t, ph, { gain: 0.11 * hum(), dur: 0.9, pan: 0.2, wet: 0.28 });
        }
    }
    makePhrase(chord, H) {
        const RHY = [[0, 3, 6, 10, 12], [2, 6, 8, 14, 16, 22], [0, 4, 6, 8, 12, 18, 20, 24], [0, 2, 6, 10, 16, 19, 22, 26, 28], [6, 8, 10, 12, 14, 22, 24, 28, 30]];
        const r = RHY[Math.min(RHY.length - 1, Math.floor(H * RHY.length + Math.random() * 1.2))];
        const up = H > 0.6 ? 12 : 0, tones = [...chord.tri.map((m) => m + up), chord.tri[0] + 12 + up, chord.tri[1] + 12 + up];
        let i = (Math.random() * 3) | 0;
        const out = {};
        for (const st of r) { i = Math.max(0, Math.min(tones.length - 1, i + ((Math.random() * 3) | 0) - 1)); out[st] = tones[i] + (Math.random() < 0.15 ? 2 : 0); }
        return out;
    }

    // ------------------------------------------------------------ moments
    /** a new thrower: a short tiki drum roll on the deck */
    visitStart(t = this.now) {
        for (let i = 0; i < 9; i++) this.drum(t + i * 0.055, { f: 150 + i * 4, f2: 120, dur: 0.12, gain: 0.08 + i * 0.022, slap: 0.06, slapF: 2200, pan: R(-0.15, 0.15), wet: 0.15 });
        this.drum(t + 0.52, { f: 92, f2: 55, dur: 0.45, gain: 0.5, slap: 0.12 });
    }
    leap(pan = 0, t = this.now) { this.whoosh(t, { dur: 0.7, f: 260, f2: 1800, gain: 0.2, pan, q: 1.1 }); this.pan(t + 0.05, 79, { gain: 0.08, dur: 0.6, pan, dest: this.sfx }); }
    land(t = this.now) { this.drum(t, { f: 85, f2: 50, dur: 0.3, gain: 0.45, slap: 0.1, slapF: 900, wet: 0.08 }); }
    /** a dart: launch whoosh, a tiki drum hit (bigger for a big score) and a pan note pitched by the ball's height */
    dart({ total = 0, score = 0, bar = 60 } = {}, t = this.now) {
        const big = Math.min(1, score / 40);
        this.whoosh(t, { dur: 0.42, f: 300, f2: 2600 + big * 1500, gain: 0.12 + big * 0.1, q: 1.6 });
        const hit = t + 0.46;   // the ball's arrival (0.1 s crouch + most of its 0.48 s flight)
        this.drum(hit, { f: 120 + big * 30, f2: 62, dur: 0.38 + big * 0.2, gain: 0.55 + big * 0.25, slap: 0.16, slapF: 1500 });
        const idx = Math.max(0, Math.min(PENTA.length - 1, Math.round((total / Math.max(1, bar)) * (PENTA.length - 1))));
        this.pan(hit, PENTA[idx], { gain: 0.2, dur: 1.2, dest: this.sfx, wet: 0.3 });
        if (bar - total <= 5) this.pan(hit + 0.004, PENTA[idx] + 6, { gain: 0.06, dur: 0.8, dest: this.sfx }); // a tritone edge when it's close
        this.duck(0.55, 0.5, hit);
    }
    /** a miss: a coconut drops (slide whistle down) and bonks the ball */
    coconutFall(t = this.now) { this.tone(t, 1900, 0.5, this.sfx, { type: 'triangle', f2: 600, glide: 0.42, gain: 0.07, a: 0.04, wet: 0.2 }); }
    bonk(t = this.now) {
        this.tone(t, 820, 0.12, this.sfx, { f2: 560, glide: 0.06, gain: 0.4, wet: 0.15 });
        this.tone(t, 1640, 0.05, this.sfx, { gain: 0.12 });
        this.noise(this.white, t, 0.03, this.sfx, { f: 1400, q: 2, gain: 0.25, a: 0.001 });
        this.tone(t + 0.12, 500, 0.5, this.sfx, { type: 'triangle', f2: 1500, glide: 0.4, gain: 0.06, a: 0.02, wet: 0.2 }); // and back up, cartoon style
    }
    /** an exact hold: a bright metal ting, a gasp */
    ting(t = this.now) {
        for (const [k, g, d] of [[1, 0.2, 2.2], [2.76, 0.08, 1.4], [5.4, 0.04, 0.8], [8.9, 0.02, 0.4]]) this.tone(t, 2093 * k / 2, d, this.sfx, { gain: g, a: 0.001, wet: 0.35 });
        this.gasp(t + 0.1);
        this.duck(0.4, 1.4, t);
    }
    /** over the bar: the ball slams into the fire (a fireball: sub thump, roar, crackle burst) */
    fireball(t = this.now, size = 1) {
        this.tone(t, 78, 0.6 * size, this.sfx, { f2: 44, glide: 0.4, gain: 0.6 * size });
        this.tone(t, 156, 0.4 * size, this.sfx, { f2: 88, glide: 0.4, gain: 0.22 * size });
        this.noise(this.pink, t, 1.1 * size, this.sfx, { type: 'lowpass', f: 2200, f2: 260, q: 0.7, gain: 0.5 * size, a: 0.01, wet: 0.25 });
        this.noise(this.pink, t, 0.5, this.sfx, { f: 1200, f2: 300, q: 0.8, gain: 0.3 * size, a: 0.005 });
        for (let i = 0; i < 26 * size; i++) this.noise(this.white, t + R(0, 1.0), R(0.004, 0.02), this.sfx, { f: R(2000, 7500), q: R(1, 3), gain: R(0.04, 0.12), a: 0.0008, pan: R(-0.5, 0.5) });
        this.duck(0.25, 1.6, t);
    }
    /** no room: a dissonant stab (a pan cluster over a low hit) */
    noRoom(t = this.now) {
        this.drum(t, { f: 70, f2: 45, dur: 0.5, gain: 0.55, slap: 0.15 });
        for (const m of [73, 74, 79, 80]) this.pan(t + R(0, 0.012), m, { gain: 0.1, dur: 0.8, dest: this.sfx, wet: 0.25 });
        this.duck(0.3, 1.2, t);
    }
    /** the conch horn: a breathy, swelling low call */
    conch(t = this.now, f = 196) {
        const c = this.ctx, o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f * 0.94, t); o.frequency.linearRampToValueAtTime(f, t + 0.25);
        const vib = c.createOscillator(); vib.frequency.value = 5.2; const vd = c.createGain(); vd.gain.value = 2.2; vib.connect(vd).connect(o.frequency);
        const f1 = c.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 600; f1.Q.value = 2.5;
        const f2 = c.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1050; f2.Q.value = 4;
        const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.3, t + 0.35); g.gain.setValueAtTime(0.3, t + 0.9); g.gain.linearRampToValueAtTime(0, t + 1.5);
        const dest = this.out(this.sfx, -0.2, 0.4);
        o.connect(f1).connect(g); o.connect(f2).connect(g); g.connect(dest);
        this.noise(this.pink, t, 1.3, this.sfx, { f: 900, q: 1.5, gain: 0.05, a: 0.3 });
        o.start(t); vib.start(t); o.stop(t + 1.6); vib.stop(t + 1.6);
    }
    /** a torch is snuffed: a hiss and a soft thump */
    snuff(pan = 0, t = this.now) {
        this.noise(this.pink, t, 0.6, this.sfx, { type: 'bandpass', f: 2600, f2: 4200, q: 0.9, gain: 0.11, a: 0.02, pan, wet: 0.2 });
        this.drum(t, { f: 160, f2: 90, dur: 0.12, gain: 0.12, slap: 0, pan });
    }
    /** out: the totem cracks and goes over, thuds into the sand, a gong */
    timber(pan = 0, t = this.now) {
        for (let i = 0; i < 7; i++) this.noise(this.white, t + i * R(0.02, 0.05), 0.04, this.sfx, { f: R(500, 1600), q: 3, gain: 0.25, a: 0.001, pan });
        this.tone(t + 0.05, 160, 0.9, this.sfx, { type: 'sawtooth', f2: 90, glide: 0.8, gain: 0.05, pan, wet: 0.2 }); // the creak
    }
    thud(pan = 0, t = this.now) {
        this.drum(t, { f: 72, f2: 46, dur: 0.6, gain: 0.75, slap: 0.2, slapF: 500, pan, wet: 0.1 });
        this.noise(this.pink, t, 0.6, this.sfx, { type: 'bandpass', f: 380, q: 0.6, gain: 0.3, a: 0.004, pan });
    }
    gong(t = this.now) {
        for (const [k, g, d] of [[1, 0.3, 4], [1.47, 0.12, 3], [2.09, 0.1, 2.4], [2.56, 0.06, 1.8], [3.4, 0.03, 1.2]]) this.tone(t, 73.4 * k, d, this.sfx, { gain: g, a: 0.02, wet: 0.45 });
    }
    /** one tooth of the ratchet: a metal clunk (dropping) or a tick (the fast run back up) */
    tooth(mode = 'drop', last = false, t = this.now) {
        if (mode === 'drop') {
            this.noise(this.white, t, 0.035, this.sfx, { f: R(1300, 1700), q: 4, gain: last ? 0.3 : 0.2, a: 0.001, wet: 0.1 });
            this.tone(t, last ? 110 : 150, last ? 0.25 : 0.1, this.sfx, { f2: last ? 70 : 110, glide: 0.06, gain: last ? 0.45 : 0.18 });
            this.tone(t, R(2200, 2600), 0.06, this.sfx, { gain: 0.04 });
        } else this.noise(this.white, t, 0.015, this.sfx, { f: 2400, q: 5, gain: 0.08, a: 0.0005 });
    }
    /** the bar runs back up to 60: a winding whirr */
    resetRun(dur = 0.9, t = this.now) {
        this.noise(this.pink, t, dur, this.sfx, { f: 600, f2: 2400, q: 3, gain: 0.12, a: dur * 0.3, wet: 0.1 });
        this.whoosh(t + dur * 0.6, { dur: 0.5, f: 500, f2: 3000, gain: 0.14 });
    }
    /** the ball hits the lagoon */
    splash(t = this.now, pan = 0) {
        this.noise(this.white, t, 0.5, this.sfx, { type: 'lowpass', f: 5000, f2: 900, q: 0.6, gain: 0.35, a: 0.004, pan, wet: 0.25 });
        this.drum(t, { f: 90, f2: 55, dur: 0.22, gain: 0.3, slap: 0, pan });
        for (let i = 0; i < 9; i++) this.tone(t + 0.15 + R(0, 0.5), R(600, 1400), 0.06, this.sfx, { f2: R(1500, 2600), glide: 0.05, gain: 0.03, pan: pan + R(-0.3, 0.3) }); // bubbles
    }
    /** under the bar: the limbo glide */
    limbo(t = this.now) { this.whoosh(t + 0.2, { dur: 1.0, f: 200, f2: 1200, gain: 0.14, q: 0.9 }); }
    /** cleared: a pan flourish up the scale */
    flourish(t = this.now) { [72, 76, 79, 84, 88].forEach((m, i) => this.pan(t + i * 0.07, m, { gain: 0.13, dur: 0.9, dest: this.sfx, wet: 0.3 })); }

    // ------------------------------------------------------------ the crowd
    /** a crowd: N voices (sawtooth through vowel formants) gliding together, breath noise, and hand claps */
    voices(t, { n = 14, dur = 2, gain = 0.3, from = 1, to = 1.25, vowel = 'ah', claps = 0, swell = 0.25 } = {}) {
        const c = this.ctx;
        const F = { ah: [800, 1150, 2900], oh: [500, 900, 2500], ee: [350, 2200, 3000] }[vowel];
        const bus = c.createGain(); bus.gain.setValueAtTime(0, t); bus.gain.linearRampToValueAtTime(gain, t + swell); bus.gain.setTargetAtTime(0, t + dur * 0.55, dur * 0.2);
        const mix = c.createGain(); mix.gain.value = 0.12;
        F.forEach((f, i) => { const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 6 + i * 2; mix.connect(bp).connect(bus); });
        bus.connect(this.out(this.crowd, 0, 0.35));
        for (let i = 0; i < n; i++) {
            const o = c.createOscillator(); o.type = 'sawtooth';
            const f0 = R(140, 330), st = t + R(0, 0.25);
            o.frequency.setValueAtTime(f0 * from, st); o.frequency.exponentialRampToValueAtTime(f0 * to, st + dur * R(0.4, 0.8));
            const v = c.createOscillator(); v.frequency.value = R(4, 7); const vg = c.createGain(); vg.gain.value = f0 * 0.02; v.connect(vg).connect(o.frequency);
            const p = c.createStereoPanner(); p.pan.value = R(-0.8, 0.8);
            o.connect(p).connect(mix); o.start(st); v.start(st); o.stop(t + dur + 0.5); v.stop(t + dur + 0.5);
        }
        this.noise(this.pink, t, dur, this.crowd, { f: 1500, q: 0.7, gain: gain * 0.35, a: swell, wet: 0.3 });
        for (let i = 0; i < claps; i++) this.noise(this.white, t + R(0.1, dur * 0.9), 0.03, this.crowd, { f: R(1100, 1900), q: 1.5, gain: R(0.05, 0.12), a: 0.001, pan: R(-0.9, 0.9), wet: 0.3 });
    }
    cheer(t = this.now, big = 1) { this.voices(t, { n: 16, dur: 2.2 * big, gain: 0.32 * big, from: 0.95, to: 1.35, vowel: 'ah', claps: Math.round(30 * big) }); }
    groan(t = this.now) { this.voices(t, { n: 14, dur: 1.8, gain: 0.28, from: 1.15, to: 0.78, vowel: 'oh', swell: 0.15 }); }
    gasp(t = this.now) { this.noise(this.pink, t, 0.35, this.crowd, { type: 'highpass', f: 900, f2: 2600, q: 0.6, gain: 0.18, a: 0.12, wet: 0.3 }); }

    /** a firework: a thump, a crackling burst a moment later (sound travels: further = later) */
    firework(pan = 0, dist = 40, t = this.now) {
        const d = t + dist / 343;
        this.drum(d, { f: 55, f2: 35, dur: 0.5, gain: 0.35, slap: 0.15, slapF: 700, pan, wet: 0.5 });
        for (let i = 0; i < 18; i++) this.noise(this.white, d + 0.25 + R(0, 0.9), R(0.003, 0.012), this.sfx, { f: R(3000, 8000), q: 2, gain: R(0.02, 0.06), a: 0.0005, pan: pan + R(-0.3, 0.3), wet: 0.4 });
    }

    /** the winner: a fanfare (pan arpeggio over a conch chord and a drum roll), the crowd, the shared cheers clip */
    winner(t = this.now) {
        this.stopGroove(t);
        for (let i = 0; i < 16; i++) this.drum(t + i * 0.045, { f: 170, f2: 140, dur: 0.08, gain: 0.07 + i * 0.012, slap: 0.05, slapF: 2400 });
        const s = t + 0.75;
        this.drum(s, { f: 80, f2: 45, dur: 0.8, gain: 0.8, slap: 0.2 });
        [60, 64, 67, 72, 76, 79, 84].forEach((m, i) => this.pan(s + i * 0.06, m + 12, { gain: 0.16, dur: 1.6, dest: this.sfx, wet: 0.35 }));
        this.conch(s + 0.05, 130.8); this.conch(s + 0.08, 196);
        this.cheer(s, 1.6);
        this.playClip('/assets/shared/winner-cheers.mp3', s + 0.2, 0.45);
        this.heat = 0.8;
        this.grooveAt = s + 2.4;
    }
    async playClip(url, t, gain = 0.5) {
        try {
            if (!this.clips) this.clips = new Map();
            let buf = this.clips.get(url);
            if (!buf) { const r = await fetch(url); buf = await this.ctx.decodeAudioData(await r.arrayBuffer()); this.clips.set(url, buf); }
            const s = this.ctx.createBufferSource(); s.buffer = buf;
            const g = this.ctx.createGain(); g.gain.value = gain;
            s.connect(g).connect(this.crowd); s.start(Math.max(t, this.now));
        } catch (e) { /* the clip is a nicety */ }
    }

    /** real-time pump: keep ~150 ms of groove and ambience scheduled ahead */
    update() {
        if (this.offline) return;
        if (this.grooveAt && this.now >= this.grooveAt) { this.grooveAt = 0; this.startGroove(); }
        this.scheduleUntil(this.now + 0.15);
    }
}

/**
 * The page's sound, or null when it's switched off (?sound=0) or the browser has no Web Audio.
 * The context starts suspended in an ordinary browser until the first click/key (the venue kiosk allows autoplay);
 * a small "tap for sound" pill shows until then.
 */
export function createAudio(params) {
    // PARKED (2026-11-17): opt-in with ?sound=1 until the mix is finished — docs/plans/LIMBO-3D-SOUND.md
    if (params.get('sound') !== '1') return null;
    if (!(window.AudioContext || window.webkitAudioContext)) return null;
    let audio;
    try { audio = new LimboAudio({ volume: Math.max(0, Math.min(1, Number(params.get('volume') ?? 0.85))) }); } catch (e) { console.warn('[limbo] audio unavailable', e); return null; }
    const pill = document.createElement('div');
    pill.className = 'lb-sound';
    pill.textContent = '🔈 Click for sound';
    document.body.appendChild(pill);
    const sync = () => pill.classList.toggle('is-on', audio.ctx.state !== 'running');
    const go = () => { audio.resume(); setTimeout(sync, 60); };
    ['pointerdown', 'keydown', 'touchstart'].forEach((t) => addEventListener(t, go, { passive: true }));
    audio.ctx.onstatechange = sync; sync(); go();
    // duck under the announcer's callouts (same origin + parent checks as the game's own listener)
    let lastSeq = null;
    addEventListener('message', (event) => {
        if (event.origin !== location.origin || event.source !== window.parent) return;
        const m = event.data; if (!m) return;
        if (m.type === 'DART_ANNOUNCE' && m.data && m.data.sound) { audio.duck(0.35, 1.3); return; }
        if (m.type !== 'SYNC_STATE' || !m.state) return;
        const mode = m.state.dartCalloutMode, seq = m.state.gameData?.dartAnnounce?.seq;
        audio.calloutsOn = mode === 'sound' || mode === 'both';
        if (seq != null && seq !== lastSeq) { if (lastSeq !== null && audio.calloutsOn) audio.duck(0.35, 1.3); lastSeq = seq; }
    });
    return audio;
}
