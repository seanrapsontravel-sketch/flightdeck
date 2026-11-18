// Demolition effects: concrete dust lit by the floodlights, spark showers, brick chips in the team colour, glass
// glints, ground puffs where rubble lands, and dust motes hanging in the floodlight beams.
import * as THREE from 'three';
import { Pool } from '../lib3d/particles.js';

const R = (a, b) => a + Math.random() * (b - a);

export class Fx {
    constructor(scene) {
        // dust and chips are lit by sodium floodlights at night: warm, dim
        this.light = new THREE.Color(0.62, 0.52, 0.44);
        this.matter = new Pool(7000, THREE.NormalBlending, scene, this.light);
        this.glow = new Pool(5000, THREE.AdditiveBlending, scene, this.light);
        this.beams = []; this.shells = [];
        this.moteT = 0;
    }

    /** the main hit: a dense puff of concrete dust thrown along dir, plus chips and sparks */
    impact(pos, dir, power = 1, color) {
        const n = Math.round(70 * power);
        for (let i = 0; i < n; i++) {
            // concrete dust: many small puffs blown along the hit, varied in tone so the cloud has form
            const s = R(0.3, 5.5) * power, g = R(0.32, 0.5);
            this.matter.spawn({ p: [pos.x + R(-0.7, 0.7), pos.y + R(-0.6, 0.5), pos.z + R(-0.7, 0.7)], v: [dir.x * s + R(-1.8, 1.8), R(-0.6, 1.6), dir.z * s + R(-1.8, 1.8)],
                c: [g, g * 0.93, g * 0.86, R(0.1, 0.24)], size: R(0.35, 1.1), grow: R(2.2, 4.2), kind: 1, life: R(1.6, 4), drag: R(1.4, 2.6), grav: R(-0.25, 0.4) });
        }
        this.chips(pos, dir, Math.round(40 * power), color);
        this.sparks(pos, dir, Math.round(60 * power));
        this.glass(pos, Math.round(24 * power));
        // a hot flash at the contact point
        this.glow.spawn({ p: [pos.x, pos.y, pos.z], c: [9, 6, 3.5, 0.9], size: 1.6 * power, kind: 3, life: 0.1, grav: 0 });
    }

    chips(pos, dir, n, color) {
        const c = color ? new THREE.Color(color) : null;
        for (let i = 0; i < n; i++) {
            const team = c && Math.random() < 0.55;
            const col = team ? [c.r * 1.2, c.g * 1.2, c.b * 1.2, 1] : [0.42, 0.41, 0.4, 1];
            const s = R(3, 10);
            this.matter.spawn({ p: [pos.x, pos.y, pos.z], v: [dir.x * s + R(-3.5, 3.5), R(1, 7), dir.z * s + R(-3.5, 3.5)], c: col, size: R(0.05, 0.14), kind: 0, life: R(1.2, 2.4), drag: 0.25, grav: 16 });
        }
    }

    sparks(pos, dir, n) {
        for (let i = 0; i < n; i++) {
            const s = R(6, 18), hot = Math.random();
            this.glow.spawn({ p: [pos.x, pos.y, pos.z], v: [dir.x * s * 0.6 + R(-7, 7), R(-1, 8), dir.z * s * 0.6 + R(-7, 7)],
                c: [5 + hot * 3, 2.4 + hot * 2.4, 0.7 + hot, 1], size: R(0.03, 0.06), kind: 4, life: R(0.25, 0.8), drag: 1.2, grav: 12 });
        }
    }

    glass(pos, n) {
        for (let i = 0; i < n; i++) this.glow.spawn({ p: [pos.x + R(-0.6, 0.6), pos.y + R(-0.3, 0.5), pos.z + R(-0.6, 0.6)], v: [R(-4, 4), R(0, 5), R(-4, 4)],
            c: [2.2, 2.6, 3.2, 0.9], size: R(0.04, 0.09), kind: 3, life: R(0.5, 1.3), drag: 0.6, grav: 14 });
    }

    /** a brick slamming into the ground or the pile */
    landing(pos, speed) {
        const k = Math.min(1, (speed - 3) / 8);
        for (let i = 0; i < 3 + k * 7; i++) this.matter.spawn({ p: [pos.x + R(-0.3, 0.3), 0.15 + R(0, 0.3), pos.z + R(-0.3, 0.3)], v: [R(-1.6, 1.6), R(0.2, 1.2), R(-1.6, 1.6)],
            c: [0.5, 0.46, 0.42, R(0.12, 0.24)], size: R(0.6, 1.3), grow: 2.4, kind: 1, life: R(1.4, 2.6), drag: 2, grav: -0.08 });
        for (let i = 0; i < 2 + k * 6; i++) this.matter.spawn({ p: [pos.x, pos.y + 0.05, pos.z], v: [R(-3, 3), R(1, 4), R(-3, 3)], c: [0.4, 0.39, 0.38, 1], size: R(0.04, 0.09), kind: 0, life: R(0.6, 1.2), drag: 0.3, grav: 16 });
    }

    /** settle cloud rolling out over the base after a big collapse */
    rollingDust(pos, radius = 3, n = 30) {
        for (let i = 0; i < n; i++) {
            const a = R(0, 6.283), r = R(0.3, 1) * radius;
            this.matter.spawn({ p: [pos.x + Math.cos(a) * r * 0.4, R(0.2, 1), pos.z + Math.sin(a) * r * 0.4], v: [Math.cos(a) * R(1, 3.2), R(0.1, 0.6), Math.sin(a) * R(1, 3.2)],
                c: [0.5, 0.46, 0.42, R(0.14, 0.26)], size: R(1.4, 2.6), grow: 2.2, kind: 1, life: R(3, 5), drag: 0.9, grav: -0.05 });
        }
    }

    /** dust motes drifting in the floodlight beams (register beams from the yard) */
    motes(dt) {
        this.moteT += dt;
        while (this.moteT > 0.03) {
            this.moteT -= 0.03;
            for (const b of this.beams) {
                const t = Math.sqrt(Math.random()) * 0.85, r = Math.sqrt(Math.random()) * (0.9 + (b.rad - 0.9) * t) * 0.8;
                const a = R(0, 6.283);
                // a point in the cone: along the axis, offset on a perpendicular disc
                const ax = b.dir, up = Math.abs(ax.y) > 0.9 ? V(1, 0, 0) : V(0, 1, 0);
                const u = new THREE.Vector3().crossVectors(ax, up).normalize(), w = new THREE.Vector3().crossVectors(ax, u);
                const p = b.from.clone().addScaledVector(ax, t * b.len).addScaledVector(u, Math.cos(a) * r).addScaledVector(w, Math.sin(a) * r);
                if (p.y < 0.5) continue;
                const k = (1 - t) * 1.6;
                this.glow.spawn({ p: [p.x, p.y, p.z], v: [R(-0.15, 0.15), R(-0.08, 0.1), R(-0.15, 0.15)], c: [b.col.r * k, b.col.g * k, b.col.b * k, 0.8], size: R(0.025, 0.06), kind: 3, life: R(3, 6), drag: 0.2, grav: 0 });
            }
        }
    }

    /** checkout: shells climb from around the plinth and burst in the team colour, confetti cannons fire */
    celebrate(pos, color, shells = 7) {
        const c = new THREE.Color(color);
        for (let i = 0; i < shells; i++) this.shells.push({ t: -i * 0.28, fuse: R(0.7, 1.1), p: pos.clone().add(V(R(-5, 5), 0, R(-3, 2))), h: R(16, 26), c: Math.random() < 0.25 ? new THREE.Color('#fff2d0') : c, done: false });
        this.confetti(pos, color);
    }
    confetti(pos, color, n = 500) {
        const cols = [new THREE.Color(color), new THREE.Color(color).multiplyScalar(0.6), new THREE.Color('#ffffff'), new THREE.Color('#f5b72c')];
        for (const s of [-1, 1]) for (let i = 0; i < n / 2; i++) {
            const c = cols[(Math.random() * cols.length) | 0];
            this.matter.spawn({ p: [pos.x + s * 3.2, 0.6, pos.z + 2.4], v: [-s * R(1, 5), R(9, 17), R(-2, 3)], c: [c.r * 1.6, c.g * 1.6, c.b * 1.6, 1], size: R(0.1, 0.17), kind: 2, rot: R(0, 6.28), spin: R(-10, 10), life: R(4, 6.5), drag: 1.5, grav: 3 });
        }
    }
    updateShells(dt) {
        for (const b of this.shells) {
            b.t += dt;
            if (b.t < 0 || b.done) continue;
            if (b.t < b.fuse) {
                const y = b.h * (b.t / b.fuse);
                this.glow.spawn({ p: [b.p.x, y, b.p.z], v: [R(-0.3, 0.3), -1.5, R(-0.3, 0.3)], c: [4, 2.6, 1.2, 1], size: 0.05, kind: 4, life: 0.35, grav: 2 });
            } else {
                b.done = true;
                for (let i = 0; i < 180; i++) {
                    const u = R(-1, 1), a = R(0, 6.283), s = Math.sqrt(1 - u * u), sp = R(11, 15);
                    this.glow.spawn({ p: [b.p.x, b.h, b.p.z], v: [s * Math.cos(a) * sp, u * sp, s * Math.sin(a) * sp], c: [b.c.r * 7, b.c.g * 7, b.c.b * 7, 1], size: R(0.05, 0.09), kind: 4, life: R(1.2, 2), drag: 1.5, grav: 4 });
                }
                this.glow.spawn({ p: [b.p.x, b.h, b.p.z], c: [b.c.r * 12, b.c.g * 12, b.c.b * 12, 0.7], size: 22, kind: 3, life: 0.3, grav: 0 });
            }
        }
        this.shells = this.shells.filter((b) => !b.done);
    }

    update(dt) { this.updateShells(dt); this.motes(dt); this.matter.update(dt); this.glow.update(dt); }
    setScale(px, w, h) { this.matter.setScale(px, w, h); this.glow.setScale(px, w, h); }
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);
