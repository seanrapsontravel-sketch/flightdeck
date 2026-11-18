// Effects for the Hot Oche, on the shared particle pools (lib3d/particles.js). Seeded: no Math.random.
//   burst(p, color, n)   a ring of light and sparks off the board (a right answer: green; a pass: gold)
//   sparks(p, color, n)  sparks where a dart lands
//   goldRain(on)         gold confetti and glitter falling from the rig (the million, the champion)
//   fizz(p)              a small grey puff for a wrong answer (quiet, honest)
import * as THREE from 'three';
import { Pool } from '../lib3d/particles.js';
import { rng } from './common.js';

const GOLD = [1.0, 0.74, 0.25];

export class Fx {
    constructor(scene) {
        this.scene = scene;
        this.light = new Pool(2400, THREE.AdditiveBlending, scene, new THREE.Vector3(1, 1, 1));
        this.matter = new Pool(2600, THREE.NormalBlending, scene, new THREE.Vector3(0.8, 0.8, 0.85));
        this.R = rng(71);
        this.queue = []; this.t = 0; this.rain = 0; this.rainT = 0;
    }
    later(dt, fn) { this.queue.push([this.t + dt, fn]); }
    sparks(p, c = [0.7, 0.8, 1], n = 24) {
        const R = this.R;
        for (let i = 0; i < n; i++) {
            const a = R() * Math.PI * 2, s = 1 + R() * 2.6;
            this.light.spawn({ p: [p.x, p.y, p.z + 0.04], v: [Math.cos(a) * s, Math.sin(a) * s + 0.6, 0.6 + R() * 1.6], c: [c[0] * 2.2, c[1] * 2.2, c[2] * 2.2, 1], size: 0.035 + R() * 0.03, kind: 4, life: 0.3 + R() * 0.35, drag: 2.5, grav: 5 });
        }
        this.light.spawn({ p: [p.x, p.y, p.z + 0.08], c: [c[0] * 1.4, c[1] * 1.4, c[2] * 1.4, 0.8], size: 0.6, kind: 3, life: 0.3, grav: 0, grow: 0.8 });
    }
    burst(p, c = [0.2, 1, 0.45], n = 120) {
        const R = this.R;
        this.light.spawn({ p: [p.x, p.y, p.z + 0.2], c: [c[0] * 1.6, c[1] * 1.6, c[2] * 1.6, 0.55], size: 7, kind: 3, life: 0.6, grav: 0, grow: 0.6 });
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + R() * 0.05, s = 4 + R() * 3.5;
            this.light.spawn({ p: [p.x + Math.cos(a) * 1.9, p.y + Math.sin(a) * 1.9, p.z + 0.2], v: [Math.cos(a) * s, Math.sin(a) * s, 1 + R() * 2], c: [c[0] * 2.4, c[1] * 2.4, c[2] * 2.4, 1], size: 0.06 + R() * 0.05, kind: 4, life: 0.5 + R() * 0.5, drag: 2.2, grav: 2 });
        }
    }
    fizz(p) {
        const R = this.R;
        for (let i = 0; i < 12; i++) this.matter.spawn({ p: [p.x + (R() - 0.5) * 0.4, p.y + (R() - 0.5) * 0.4, p.z + 0.1], v: [(R() - 0.5) * 0.5, R() * 0.4, 0.4 + R() * 0.4], c: [0.4, 0.42, 0.5, 0.35], size: 0.18 + R() * 0.12, kind: 1, life: 1 + R() * 0.6, drag: 2, grav: -0.15, grow: 2 });
    }
    /** gold confetti and glitter falling over the stage; k 0 stops it */
    goldRain(k) { this.rain = k; }
    setScale(px, w, h) { this.light.setScale(px, w, h); this.matter.setScale(px, w, h); }
    update(dt) {
        this.t += dt;
        for (let i = this.queue.length - 1; i >= 0; i--) if (this.queue[i][0] <= this.t) { const f = this.queue[i][1]; this.queue.splice(i, 1); f(); }
        if (this.rain > 0) {
            this.rainT += dt * 140 * this.rain;
            const R = this.R;
            while (this.rainT >= 1) {
                this.rainT -= 1;
                const x = (R() - 0.5) * 16, z = (R() - 0.3) * 10, y = 9 + R() * 2;
                if (R() < 0.7) this.matter.spawn({ p: [x, y, z], v: [(R() - 0.5) * 0.6, -1.2 - R(), (R() - 0.5) * 0.6], c: [...(R() < 0.8 ? GOLD : [0.9, 0.92, 1]), 1], size: 0.09 + R() * 0.05, kind: 2, rot: R() * 6, spin: (R() - 0.5) * 10, life: 5 + R() * 2, drag: 1.4, grav: 0.6 });
                else this.light.spawn({ p: [x, y, z], v: [(R() - 0.5) * 0.3, -1.4 - R(), 0], c: [2.2, 1.6, 0.6, 1], size: 0.05, kind: 3, life: 3.5 + R(), drag: 0.8, grav: 0.4 });
            }
        }
        this.light.update(dt); this.matter.update(dt);
    }
}
