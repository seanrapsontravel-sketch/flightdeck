// Quackshot's particles, on the shared lib3d pools: one alpha-blended pool for matter (confetti, water), one
// additive pool for light (gold sparks, fireworks, flame embers). Recipes:
//   goldShower(p)    a double bull: a fountain of gilt sparks and coins off the boss
//   splash(p, n)     water: a burst of droplets and spray off the painted sea (and the pool, for a miss)
//   squeak(p)        a parade hit: a little puff off the tipped duck
//   confetti(p)      the winner's station
//   firework(p, c)   a shell bursting over the Ferris wheel (round 6, winner)
import * as THREE from 'three';
import { Pool } from '../lib3d/particles.js';

const TAU = Math.PI * 2;
const FIRE_COLS = ['#ff5a7a', '#ffd38a', '#7ad8ff', '#b47aff', '#7aff9a', '#ffffff'];
const CONF = ['#d3212f', '#f4c430', '#1f8fc0', '#2fa36a', '#ff5a9a', '#ffffff'];

export class Fx {
    constructor(scene) {
        this.light = new THREE.Color(1, 1, 1);
        this.matter = new Pool(1600, THREE.NormalBlending, scene, this.light);
        this.glow = new Pool(2400, THREE.AdditiveBlending, scene, this.light);
        this.matter.floor = 0.05; this.glow.floor = -100;
        this.fwT = 0; this.fireworks = 0;
    }
    rgb(c, k = 1, a = 1) { const C = new THREE.Color(c); return [C.r * k, C.g * k, C.b * k, a]; }

    goldShower(p, k = 1) {
        for (let i = 0; i < 90 * k; i++) {
            const a = Math.random() * TAU, up = 2 + Math.random() * 5, s = 1 + Math.random() * 3;
            this.glow.spawn({ p: [p.x, p.y, p.z + 0.2], v: [Math.cos(a) * s, up, 1 + Math.random() * 3], c: this.rgb(i % 3 ? '#ffb53a' : '#ffe08a', 1.7), size: 0.016 + Math.random() * 0.014, kind: 4, life: 1.2 + Math.random(), drag: 0.6, grav: 6 });
        }
        for (let i = 0; i < 40 * k; i++) {
            const a = Math.random() * TAU, s = 1 + Math.random() * 2.5;
            this.matter.spawn({ p: [p.x, p.y, p.z + 0.25], v: [Math.cos(a) * s, 2 + Math.random() * 4, 1.5 + Math.random() * 2], c: this.rgb('#e8b84a', 1.4), size: 0.045, kind: 2, rot: Math.random() * 6, spin: 8, life: 2.2, drag: 0.3, grav: 9 });
        }
    }
    splash(p, n = 90) {
        // droplets: fast thin streaks thrown up and out, falling back (additive so they catch the bulbs)
        for (let i = 0; i < n; i++) {
            const a = Math.PI * (0.15 + Math.random() * 0.7) * (Math.random() < 0.5 ? 1 : -1) + Math.PI / 2, s = 1.5 + Math.random() * 3.5;
            this.glow.spawn({ p: [p.x, p.y, p.z + 0.08], v: [Math.cos(a) * s * 0.7, Math.abs(Math.sin(a)) * s + 1, 1 + Math.random() * 3], c: this.rgb(i % 3 ? '#9fdcff' : '#e8f8ff', 1.6, 0.9), size: 0.018 + Math.random() * 0.02, kind: 4, life: 0.7 + Math.random() * 0.5, drag: 0.3, grav: 9.8 });
        }
        // and a sheet of mist (no round drops: up close they read as soap bubbles)
        for (let i = 0; i < 16; i++) this.matter.spawn({ p: [p.x + (Math.random() - 0.5) * 0.3, p.y + (Math.random() - 0.5) * 0.3, p.z + 0.15], v: [(Math.random() - 0.5) * 1.2, 0.3 + Math.random() * 0.9, 0.6 + Math.random()], c: this.rgb('#d8f2ff', 1.1, 0.22), size: 0.3, kind: 1, grow: 3, life: 1.3, drag: 1.6, grav: 0.3 });
    }
    squeak(p) {
        for (let i = 0; i < 8; i++) this.matter.spawn({ p: [p.x, p.y, p.z + 0.1], v: [(Math.random() - 0.5) * 0.8, Math.random() * 0.8, 0.4], c: [1, 1, 1, 0.4], size: 0.1, kind: 1, grow: 2, life: 0.6, drag: 2, grav: -0.3 });
    }
    confetti(p, n = 220) {
        for (let i = 0; i < n; i++) {
            const a = Math.random() * TAU, s = 1 + Math.random() * 3;
            this.matter.spawn({ p: [p.x + (Math.random() - 0.5), p.y + 2.5, p.z], v: [Math.cos(a) * s, 2 + Math.random() * 4, Math.sin(a) * s], c: this.rgb(CONF[i % CONF.length], 1.2), size: 0.04 + Math.random() * 0.025, kind: 2, rot: Math.random() * 6, spin: 6 + Math.random() * 6, life: 3 + Math.random() * 2, drag: 1.4, grav: 2.2 });
        }
    }
    firework(p, col) {
        const c = col || FIRE_COLS[(Math.random() * FIRE_COLS.length) | 0], n = 110;
        for (let i = 0; i < n; i++) {
            // an even sphere of stars
            const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y), a = i * 2.399963;
            const s = 7 + Math.random() * 1.5;
            this.glow.spawn({ p: [p.x, p.y, p.z], v: [Math.cos(a) * r * s, y * s, Math.sin(a) * r * s], c: this.rgb(c, 5), size: 0.5, kind: 4, life: 1.6 + Math.random() * 0.6, drag: 1.2, grav: 2.2 });
        }
        this.glow.spawn({ p: [p.x, p.y, p.z], v: [0, 0, 0], c: this.rgb(c, 8), size: 7, kind: 3, life: 0.35, grav: 0 });
    }
    /** an ember lifting off a burning jet */
    ember(p) {
        this.glow.spawn({ p: [p.x + (Math.random() - 0.5) * 0.05, p.y + 0.25 + Math.random() * 0.2, p.z + 0.05], v: [(Math.random() - 0.5) * 0.5, 1 + Math.random() * 1.5, 0.2 + Math.random() * 0.5], c: this.rgb(Math.random() < 0.5 ? '#ff8a3a' : '#ffc46a', 3.5), size: 0.02 + Math.random() * 0.015, kind: 4, life: 0.8 + Math.random() * 0.8, drag: 0.8, grav: -0.6 });
    }
    /** a column of water out of the pool (a miss) */
    plume(p) {
        for (let i = 0; i < 110; i++) {
            const a = Math.random() * TAU, s = Math.random() * 1.1;
            this.glow.spawn({ p: [p.x, p.y + 0.02, p.z], v: [Math.cos(a) * s, 2.5 + Math.random() * 3.2, Math.sin(a) * s], c: this.rgb(i % 3 ? '#9fdcff' : '#e8f8ff', 1.5, 0.9), size: 0.02 + Math.random() * 0.02, kind: 4, life: 0.9 + Math.random() * 0.5, drag: 0.2, grav: 9.8 });
        }
        for (let i = 0; i < 12; i++) this.matter.spawn({ p: [p.x, p.y + 0.1, p.z], v: [(Math.random() - 0.5) * 1, 0.6 + Math.random() * 1.4, (Math.random() - 0.5) * 1], c: this.rgb('#d8f2ff', 1.1, 0.25), size: 0.4, kind: 1, grow: 2.5, life: 1.4, drag: 1.4, grav: 0.2 });
    }
    /** a water jet from a nozzle at `from` arcing onto `to` for `dur` seconds */
    jet(from, to, dur = 0.7) { this.jets = this.jets || []; this.jets.push({ from: from.clone(), to: to.clone(), t: 0, dur }); }
    /** gold sparkle behind something in flight */
    trail(p, gold = true) {
        this.glow.spawn({ p: [p.x, p.y, p.z], v: [(Math.random() - 0.5) * 0.4, -0.2 + Math.random() * 0.4, (Math.random() - 0.5) * 0.4], c: this.rgb(gold ? '#ffd56a' : '#ffffff', 3), size: 0.03, kind: 3, life: 0.6, drag: 1, grav: 1 });
    }
    /** keep a show of fireworks going over `at` (rate per second; 0 stops) */
    setFireworks(rate, at) { this.fireworks = rate; this.fwAt = at; }

    setScale(px, w, h) { this.matter.setScale(px, w, h); this.glow.setScale(px, w, h); }
    update(dt) {
        if (this.fireworks > 0 && this.fwAt) {
            this.fwT -= dt;
            if (this.fwT <= 0) {
                this.fwT = (0.4 + Math.random() * 0.8) / this.fireworks;
                // alternate sides: the open sky either side of the stall (the awning hides the sky above it)
                const A = this.fwAt, side = (this.fwSide = -(this.fwSide || 1));
                this.firework(new THREE.Vector3(side * Math.abs(A.x) + (Math.random() - 0.5) * 10, A.y + Math.random() * 8, A.z + (Math.random() - 0.5) * 10));
            }
        }
        // water jets: droplets launched on a ballistic path that lands on the target point in ~0.35 s
        if (this.jets) for (let k = this.jets.length - 1; k >= 0; k--) {
            const J = this.jets[k]; J.t += dt;
            if (J.t > J.dur) { this.jets.splice(k, 1); continue; }
            const T = 0.32, n = Math.ceil(dt * 260);
            for (let i = 0; i < n; i++) {
                const to = J.to.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.25, 0));
                const v = [(to.x - J.from.x) / T, (to.y - J.from.y) / T + 0.5 * 9.8 * T, (to.z - J.from.z) / T];
                this.glow.spawn({ p: [J.from.x, J.from.y, J.from.z], v, c: this.rgb(i % 3 ? '#a8e0ff' : '#f0fbff', 1.7, 0.9), size: 0.018, kind: 4, life: T + 0.05, drag: 0, grav: 9.8 });
            }
        }
        this.matter.update(dt); this.glow.update(dt);
    }
}
