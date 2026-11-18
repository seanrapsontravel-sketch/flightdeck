// Effects for Killer on the shared particle pools: dart impacts (sparks off brass, marble chips), gold sparks
// running a wedge's wires, the death burst, gold leaf over the winner. Glows are additive HDR, kept dim enough that
// out-of-focus points don't show the DOF blur's squares (Limbo lesson 8).
import * as THREE from 'three';
import { Pool } from '../lib3d/particles.js';
import { V } from './common.js';

const R = (a, b) => a + Math.random() * (b - a);

export class Fx {
    constructor(scene) {
        this.light = new THREE.Vector3(0.55, 0.48, 0.42);
        this.matter = new Pool(1200, THREE.NormalBlending, scene, this.light);
        this.glow = new Pool(1600, THREE.AdditiveBlending, scene, this.light);
        this.matter.floor = 0.01; this.glow.floor = 0.01;
        this.leaf = 0; this.leafAt = V(); this.leafT = 0;
    }
    /** a dart lands: sparks and marble chips (a miss: a skid of sparks) */
    impact(p, color, miss = false) {
        const n = miss ? 26 : 18;
        for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2, s = R(1, miss ? 4 : 3);
            this.glow.spawn({ p: [p.x, 0.03, p.z], v: [Math.cos(a) * s, R(1, 3.5), Math.sin(a) * s], c: [2.2, 1.5, 0.8, 0.9], size: R(0.012, 0.022), kind: 4, life: R(0.2, 0.45), grav: 9, drag: 1.2 });
        }
        for (let i = 0; i < 8; i++) {
            const a = Math.random() * Math.PI * 2, s = R(0.4, 1.4);
            this.matter.spawn({ p: [p.x, 0.03, p.z], v: [Math.cos(a) * s, R(0.8, 2), Math.sin(a) * s], c: [0.5, 0.48, 0.45, 1], size: R(0.012, 0.025), kind: 0, life: R(0.5, 0.9), grav: 10, drag: 0.4 });
        }
        if (color) for (let i = 0; i < 6; i++) this.glow.spawn({ p: [p.x, 0.05, p.z], v: [R(-0.4, 0.4), R(0.2, 0.8), R(-0.4, 0.4)], c: [color.r * 1.2, color.g * 1.2, color.b * 1.2, 0.5], size: R(0.08, 0.14), kind: 3, life: R(0.3, 0.5), grav: 0, drag: 2 });
    }
    /** gold sparks running along the line a → b (a wedge's wires) */
    wireSparks(a, b, color, n = 40) {
        for (let i = 0; i < n; i++) {
            const u = Math.random(), p = a.clone().lerp(b, u);
            const c = color || { r: 1, g: 0.7, b: 0.3 };
            this.glow.spawn({ p: [p.x, 0.03, p.z], v: [R(-0.6, 0.6), R(0.6, 2.4), R(-0.6, 0.6)], c: [c.r * 2.2, c.g * 2.2, c.b * 2.2, 0.9], size: R(0.012, 0.02), kind: 4, life: R(0.3, 0.7), grav: 5, drag: 1 });
        }
    }
    /** a ring of light rising from a point (became killer) */
    flare(p, color, n = 60, r = 0.6) {
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            this.glow.spawn({ p: [p.x + Math.cos(a) * r, 0.05, p.z + Math.sin(a) * r], v: [Math.cos(a) * 0.4, R(1.5, 4), Math.sin(a) * 0.4], c: [color.r * 2, color.g * 2, color.b * 2, 0.8], size: R(0.02, 0.035), kind: 4, life: R(0.6, 1.2), grav: -0.5, drag: 0.8 });
        }
    }
    /** the death: dust and glass-bright shards from the shattering piece */
    burst(p, color) {
        for (let i = 0; i < 60; i++) {
            const a = Math.random() * Math.PI * 2, s = R(1, 5);
            this.glow.spawn({ p: [p.x, R(0.2, 1.5), p.z], v: [Math.cos(a) * s, R(0, 4), Math.sin(a) * s], c: [color.r * 1.6 + 0.4, color.g * 1.6 + 0.3, color.b * 1.6 + 0.3, 0.9], size: R(0.015, 0.03), kind: 4, life: R(0.4, 0.9), grav: 9, drag: 0.8 });
        }
        for (let i = 0; i < 24; i++) this.matter.spawn({ p: [p.x + R(-0.3, 0.3), R(0.1, 1.2), p.z + R(-0.3, 0.3)], v: [R(-1, 1), R(0.2, 1.5), R(-1, 1)], c: [0.12, 0.1, 0.1, 0.16], size: R(0.25, 0.5), kind: 1, life: R(0.8, 1.5), grav: 0.4, drag: 1.4, grow: 1.6 });
    }
    /** gold leaf drifting down over the winner (until stopped) */
    goldLeaf(p, on = true) { this.leaf = on ? 1 : 0; this.leafAt.copy(p); }
    update(dt) {
        if (this.leaf) {
            this.leafT += dt;
            while (this.leafT > 0.02) {
                this.leafT -= 0.02;
                const p = this.leafAt;
                this.matter.spawn({ p: [p.x + R(-3, 3), R(5, 7), p.z + R(-3, 3)], v: [R(-0.3, 0.3), R(-1.2, -0.6), R(-0.3, 0.3)], c: [1.2, 0.85, 0.35, 1], size: R(0.04, 0.07), kind: 2, rot: R(0, 6), spin: R(-6, 6), life: R(4, 6), grav: 0.05, drag: 0.6 });
            }
        }
        this.matter.update(dt); this.glow.update(dt);
    }
    setScale(px, w, h) { this.matter.setScale(px, w, h); this.glow.setScale(px, w, h); }
}
