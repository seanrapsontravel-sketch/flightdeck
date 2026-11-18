// Particles, simulated on the CPU and drawn as sized point sprites: turf kicked up by hooves, dust, confetti,
// fireworks, crowd camera flashes and the lake fountain. Two pools: alpha-blended matter and additive light.
import * as THREE from 'three';

import { Pool } from '../lib3d/particles.js';

const R = (a, b) => a + Math.random() * (b - a);
const CONFETTI = ['#ffd45e', '#f5f1e6', '#ffb43a', '#e8c46a', '#ffffff'];

export class Fx {
    constructor(scene, engine) {
        this.engine = engine;
        this.light = new THREE.Color(1.35, 1.2, 1.0);
        this.matter = new Pool(6000, THREE.NormalBlending, scene, this.light);
        this.glow = new Pool(4000, THREE.AdditiveBlending, scene, this.light);
        this.bursts = [];
        this.fountainOn = null;
        this.flashT = 0;
        this.confettiTimer = 0; this.confettiColors = CONFETTI;
    }

    /** a hoof strikes the turf at speed: clods and a little dust thrown up and back */
    turfKick(pos, vx) {
        const sp = Math.min(Math.abs(vx), 18), dir = Math.sign(vx) || 1;
        const n = 3 + ((sp / 4) | 0);
        for (let i = 0; i < n; i++) {
            const g = Math.random();
            this.matter.spawn({ p: [pos.x, 0.06, pos.z + R(-0.1, 0.1)], v: [-dir * R(1, 4) - vx * 0.15, R(1.5, 4.2), R(-0.8, 0.8)],
                c: g < 0.5 ? [0.06, 0.1, 0.025, 1] : [0.12, 0.08, 0.045, 1], size: R(0.05, 0.11), kind: 0, life: R(0.6, 1.1), drag: 0.5 });
        }
        if (Math.random() < 0.7) this.matter.spawn({ p: [pos.x, 0.25, pos.z], v: [-dir * R(0.5, 2), R(0.2, 0.8), R(-0.4, 0.4)],
            c: [0.5, 0.43, 0.3, 0.16], size: R(0.6, 1.0), grow: 2.2, kind: 1, life: R(1.0, 1.7), drag: 1.5, grav: -0.15 });
    }

    /** a big puff at a horse (rearing, stopping hard) */
    dustBurst(pos, n = 18) {
        for (let i = 0; i < n; i++) this.matter.spawn({ p: [pos.x + R(-0.8, 0.8), R(0.1, 0.6), pos.z + R(-0.6, 0.6)], v: [R(-2, 2), R(0.4, 1.6), R(-2, 2)],
            c: [0.52, 0.45, 0.32, 0.22], size: R(0.8, 1.6), grow: 2.5, kind: 1, life: R(1.2, 2.2), drag: 1.8, grav: -0.1 });
    }

    /** a burst of player-coloured sparkle trailing a horse that has just surged */
    surge(pos, color) {
        for (let i = 0; i < 30; i++) {
            const c = color.clone().lerp(new THREE.Color('#fff2c8'), Math.random() * 0.5);
            this.glow.spawn({ p: [pos.x + R(-1, 1), R(0.4, 2.2), pos.z + R(-0.6, 0.6)], v: [R(-6, -1), R(0.5, 2.5), R(-1.2, 1.2)],
                c: [c.r * 3, c.g * 3, c.b * 3, 0.9], size: R(0.06, 0.16), kind: 3, life: R(0.5, 1.1), drag: 1.2, grav: 1.5 });
        }
    }

    /** confetti shower over a point (winner's circle, past the post) */
    confetti(center, n = 400, colors = this.confettiColors, spread = 9) {
        for (let i = 0; i < n; i++) {
            const c = new THREE.Color(colors[(Math.random() * colors.length) | 0]);
            this.matter.spawn({ p: [center.x + R(-spread, spread), center.y + R(4, 11), center.z + R(-spread, spread) * 0.8], v: [R(-1, 1), R(-0.5, 1.5), R(-1, 1)],
                c: [c.r, c.g, c.b, 1], size: R(0.09, 0.15), kind: 2, rot: R(0, 6.28), spin: R(-9, 9), life: R(4, 7), drag: 2.4, grav: 2.2 });
        }
    }

    /** confetti cannons fired from the finish gantry */
    cannons(x, colors) {
        for (const s of [1, -1]) for (let i = 0; i < 260; i++) {
            const c = new THREE.Color(colors[(Math.random() * colors.length) | 0]);
            this.matter.spawn({ p: [x + R(-0.3, 0.3), 8.6, s * 12.2], v: [R(-3, 3), R(5, 13), -s * R(3, 9)],
                c: [c.r, c.g, c.b, 1], size: R(0.1, 0.16), kind: 2, rot: R(0, 6.28), spin: R(-10, 10), life: R(4, 6.5), drag: 1.6, grav: 3 });
        }
        for (const s of [1, -1]) for (let i = 0; i < 80; i++) this.glow.spawn({ p: [x, 8.6, s * 12.2], v: [R(-2, 2), R(2, 9), -s * R(1, 6)], c: [4, 3, 1.6, 1], size: R(0.05, 0.1), kind: 3, life: R(0.6, 1.4), drag: 1, grav: 6 });
    }

    /** fireworks over the stand */
    firework(pos, color) {
        this.bursts.push({ p: pos.clone(), y0: 0, t: 0, fuse: R(0.6, 1.0), color: new THREE.Color(color), done: false });
    }
    explode(b) {
        const n = 160, c = b.color;
        for (let i = 0; i < n; i++) {
            const u = R(-1, 1), a = R(0, 6.283), s = Math.sqrt(1 - u * u), sp = R(13, 16);
            const w = Math.random() < 0.2 ? new THREE.Color('#fff4d8') : c;
            this.glow.spawn({ p: [b.p.x, b.p.y, b.p.z], v: [s * Math.cos(a) * sp, u * sp, s * Math.sin(a) * sp], c: [w.r * 6, w.g * 6, w.b * 6, 1], size: R(0.5, 0.9), kind: 3, life: R(1.4, 2.2), drag: 1.6, grav: 3.5 });
        }
        this.glow.spawn({ p: [b.p.x, b.p.y, b.p.z], c: [c.r * 10, c.g * 10, c.b * 10, 0.7], size: 26, kind: 3, life: 0.35, grav: 0 });
    }

    /** crowd camera flashes across the stand */
    flashes(n, region) {
        for (let i = 0; i < n; i++) this.glow.spawn({ p: [R(region.x0, region.x1), R(1.5, region.y), R(region.z0, region.z1)], c: [9, 9, 10, 1], size: R(0.7, 1.2), kind: 3, life: R(0.06, 0.14), grav: 0 });
    }

    update(dt, t) {
        for (const b of this.bursts) {
            if (b.done) continue;
            b.t += dt;
            if (b.t < b.fuse) {
                const y = b.p.y * (b.t / b.fuse);
                this.glow.spawn({ p: [b.p.x + R(-0.1, 0.1), y, b.p.z], v: [0, -2, 0], c: [3, 2.2, 1.2, 1], size: 0.35, kind: 3, life: 0.4, grav: 0 });
            } else { b.done = true; this.explode(b); }
        }
        this.bursts = this.bursts.filter((b) => !b.done);
        if (this.fountainOn) {
            const f = this.fountainOn;
            for (let i = 0; i < 6; i++) {
                const a = R(0, 6.28), r = R(0, 0.5);
                this.matter.spawn({ p: [f.x + Math.cos(a) * r, 0.2, f.z + Math.sin(a) * r], v: [Math.cos(a) * R(0.5, 1.6), R(10, 13), Math.sin(a) * R(0.5, 1.6)],
                    c: [0.85, 0.92, 1, 0.35], size: R(0.4, 0.8), grow: 1.5, kind: 1, life: R(1.8, 2.4), drag: 0.25, grav: 9.8 });
            }
        }
        this.matter.update(dt); this.glow.update(dt);
    }

    setScale(px) { this.matter.mat.uniforms.uScale.value = px; this.glow.mat.uniforms.uScale.value = px; }
}
