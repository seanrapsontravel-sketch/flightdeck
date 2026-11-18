// Effects for Limbo on the shared particle pools: the ball's glowing trail, splashes in the lagoon, dust on the
// deck, sparks. Matter (spray, dust) is lit by a cool moon-ish light vector; glows are additive HDR.
import * as THREE from 'three';
import { Pool } from '../lib3d/particles.js';

const R = (a, b) => a + Math.random() * (b - a);

export class Fx {
    constructor(scene) {
        this.light = new THREE.Vector3(0.42, 0.48, 0.66);
        this.matter = new Pool(1400, THREE.NormalBlending, scene, this.light);
        this.glow = new Pool(1600, THREE.AdditiveBlending, scene, this.light);
        this.matter.floor = 0.02; this.glow.floor = -5;
        this.rings = [];
        this.scene = scene;
        this.ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.6, 0.75), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    }

    /** a soft glowing streak behind a fast-moving ball */
    trail(p, color) {
        const c = color;
        for (let i = 0; i < 2; i++) this.glow.spawn({ p: [p.x + R(-0.15, 0.15), p.y + R(-0.15, 0.15), p.z + R(-0.15, 0.15)], v: [R(-0.2, 0.2), R(-0.3, 0.1), R(-0.2, 0.2)], c: [c.r * 1.8, c.g * 1.8, c.b * 1.8, 0.7], size: R(0.18, 0.3), kind: 3, life: R(0.25, 0.45), grav: 0, drag: 2 });
        this.glow.spawn({ p: [p.x, p.y, p.z], v: [R(-1, 1), R(-0.5, 1), R(-1, 1)], c: [3, 2.2, 1.2, 1], size: R(0.03, 0.05), kind: 4, life: R(0.3, 0.6), grav: 2, drag: 1 });
    }

    /** the ball hits the lagoon: a crown of spray, a column, droplets, an expanding ring */
    splash(p, color) {
        // droplets streak (they catch the firelight: a warm-white glint, not grey dots); a few fat drops stay round
        for (let i = 0; i < 150; i++) {
            const a = Math.random() * Math.PI * 2, s = R(1, 4.2), up = R(2.5, 7.5) * (i < 50 ? 1.4 : 1), w = R(0.7, 1.3);
            this.glow.spawn({ p: [p.x + Math.cos(a) * 0.3, 0.05, p.z + Math.sin(a) * 0.3], v: [Math.cos(a) * s, up, Math.sin(a) * s], c: [1.1 * w, 0.95 * w, 0.8 * w, 0.9], size: R(0.02, 0.035), kind: 4, life: R(0.7, 1.3), grav: 12, drag: 0.4 });
        }
        for (let i = 0; i < 24; i++) {
            const a = Math.random() * Math.PI * 2, s = R(0.6, 2.5);
            this.matter.spawn({ p: [p.x, 0.05, p.z], v: [Math.cos(a) * s, R(3, 6), Math.sin(a) * s], c: [0.85, 0.9, 1, 0.8], size: R(0.04, 0.07), kind: 0, life: R(0.8, 1.2), grav: 12, drag: 0.3 });
        }
        for (let i = 0; i < 30; i++) this.matter.spawn({ p: [p.x + R(-0.4, 0.4), R(0, 0.4), p.z + R(-0.4, 0.4)], v: [R(-1, 1), R(1, 3.5), R(-1, 1)], c: [0.85, 0.88, 0.92, 0.22], size: R(0.3, 0.6), kind: 1, life: R(0.6, 1.1), grav: 1.5, drag: 1.4, grow: 1.4 });
        for (let i = 0; i < 24; i++) this.glow.spawn({ p: [p.x, 0.2, p.z], v: [R(-2, 2), R(2, 5), R(-2, 2)], c: [color.r * 2, color.g * 2, color.b * 2, 0.8], size: R(0.06, 0.12), kind: 3, life: R(0.5, 1), grav: 8, drag: 0.5 });
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48).rotateX(-Math.PI / 2), this.ringMat.clone());
        ring.position.set(p.x, 0.02, p.z); this.scene.add(ring); this.rings.push({ m: ring, t: 0 });
    }

    /** a puff where the ball lands on the deck */
    dust(p) {
        for (let i = 0; i < 18; i++) {
            const a = Math.random() * Math.PI * 2;
            this.matter.spawn({ p: [p.x + Math.cos(a) * 0.3, p.y + 0.05, p.z + Math.sin(a) * 0.3], v: [Math.cos(a) * R(0.8, 2), R(0.1, 0.5), Math.sin(a) * R(0.8, 2)], c: [0.34, 0.33, 0.36, 0.35], size: R(0.25, 0.5), kind: 1, life: R(0.6, 1.1), grav: 0, drag: 3, grow: 1.4 });
        }
    }

    /** the ball slams into the burning bar (or the flames lash down onto it): a fireball, sparks, a smoke plume */
    fireball(p, scale = 1) {
        for (let i = 0; i < 46 * scale; i++) {
            const a = Math.random() * Math.PI * 2, e = R(-0.4, 1.2), s = R(1.5, 5) * scale;
            const hot = R(0.6, 1.4);
            this.glow.spawn({ p: [p.x, p.y, p.z], v: [Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + 1.5, Math.sin(a) * Math.cos(e) * s], c: [3.4 * hot, 1.2 * hot, 0.25 * hot, 0.9], size: R(0.35, 0.8) * scale, kind: 3, life: R(0.35, 0.8), grav: -2, drag: 3.5, grow: 1.5 });
        }
        for (let i = 0; i < 90 * scale; i++) {
            const a = Math.random() * Math.PI * 2, e = R(-0.6, 1.3), s = R(3, 11);
            this.glow.spawn({ p: [p.x, p.y, p.z], v: [Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s, Math.sin(a) * Math.cos(e) * s], c: [3, 1.5, 0.4, 1], size: R(0.025, 0.045), kind: 4, life: R(0.5, 1.4), grav: 9, drag: 0.8 });
        }
        this.smoke(p, 18 * scale, 1.2);
    }

    /** dark smoke rising (a snuffed torch, a scorched ball) */
    smoke(p, n = 10, k = 1) {
        for (let i = 0; i < n; i++) this.matter.spawn({ p: [p.x + R(-0.15, 0.15) * k, p.y + R(0, 0.3), p.z + R(-0.15, 0.15) * k], v: [R(-0.3, 0.3), R(0.6, 1.6) * k, R(-0.3, 0.3)], c: [0.09, 0.085, 0.09, 0.55], size: R(0.3, 0.6) * k, kind: 1, life: R(1.4, 2.6), grav: -0.4, drag: 1.2, grow: 2.2 });
    }

    /** the exact-hold kiss: a ring of sparks spraying out round the contact point */
    sparkRing(p, color) {
        for (let i = 0; i < 70; i++) {
            const a = (i / 70) * Math.PI * 2, s = R(2.5, 4.5);
            this.glow.spawn({ p: [p.x, p.y, p.z], v: [Math.cos(a) * s, R(-0.5, 1.5), Math.sin(a) * s], c: [3, 2.4, 1.2, 1], size: R(0.025, 0.04), kind: 4, life: R(0.5, 0.9), grav: 5, drag: 1.4 });
        }
        for (let i = 0; i < 16; i++) this.glow.spawn({ p: [p.x, p.y, p.z], v: [R(-1, 1), R(-0.5, 1), R(-1, 1)], c: [color.r * 3, color.g * 3, color.b * 3, 0.8], size: R(0.2, 0.4), kind: 3, life: R(0.3, 0.6), grav: 0, drag: 3 });
    }

    /** the ball cracks: lacquer shards in the team colour */
    shards(p, color) {
        for (let i = 0; i < 60; i++) {
            const a = Math.random() * Math.PI * 2, s = R(1.5, 5);
            this.matter.spawn({ p: [p.x, p.y, p.z], v: [Math.cos(a) * s, R(1, 5), Math.sin(a) * s], c: [color.r, color.g, color.b, 1], size: R(0.06, 0.14), kind: 2, rot: R(0, 6), spin: R(-12, 12), life: R(1.2, 2.2), grav: 12, drag: 0.3 });
        }
    }

    /** a firework shell bursting over the lagoon (and, through the reflection, in it) */
    firework(p, color) {
        const c = color, n = 120;
        for (let i = 0; i < n; i++) {
            const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u), s = R(7, 9);
            this.glow.spawn({ p: [p.x, p.y, p.z], v: [r * Math.cos(a) * s, u * s, r * Math.sin(a) * s], c: [c.r * 3 + 0.4, c.g * 3 + 0.4, c.b * 3 + 0.4, 1], size: R(0.12, 0.2), kind: 4, life: R(1.2, 1.9), grav: 3, drag: 1.1 });
        }
        for (let i = 0; i < 10; i++) this.glow.spawn({ p: [p.x, p.y, p.z], v: [R(-1, 1), R(-1, 1), R(-1, 1)], c: [c.r * 4 + 1, c.g * 4 + 1, c.b * 4 + 1, 0.9], size: R(2, 3.5), kind: 3, life: R(0.2, 0.4), grav: 0, drag: 2 });
    }

    /** flower petals drifting down over the winner */
    petals(p, n = 80) {
        const cols = [[1, 0.42, 0.55], [1, 0.85, 0.4], [1, 1, 0.92], [1, 0.55, 0.3]];
        for (let i = 0; i < n; i++) {
            const c = cols[i % cols.length];
            this.matter.spawn({ p: [p.x + R(-4, 4), p.y + R(2, 6), p.z + R(-3, 3)], v: [R(-0.6, 0.6), R(-0.5, 0), R(-0.6, 0.6)], c: [c[0], c[1], c[2], 1], size: R(0.07, 0.12), kind: 2, rot: R(0, 6), spin: R(-4, 4), life: R(3, 5), grav: 0.6, drag: 1.6 });
        }
    }

    update(dt) {
        this.matter.update(dt); this.glow.update(dt);
        for (let i = this.rings.length - 1; i >= 0; i--) {
            const r = this.rings[i]; r.t += dt;
            const k = r.t / 1.6;
            r.m.scale.setScalar(1 + k * 5); r.m.material.opacity = (1 - k) * 0.8;
            if (k >= 1) { this.scene.remove(r.m); r.m.geometry.dispose(); r.m.material.dispose(); this.rings.splice(i, 1); }
        }
    }
    setScale(px, w, h) { this.matter.setScale(px, w, h); this.glow.setScale(px, w, h); }
}
