// Effects for the Lantern Pagoda, on the shared particle pools (lib3d/particles.js). Seeded: no Math.random.
//   sparks(p, c, n)        gold sparks off the bed a scoring dart hit
//   gong(p, k)             a soft bronze flash at the gong when it rings (k: 1 single … 3 treble)
//   firecrackers(x0, x1)   a string of crackers popping along the top of the gate wall (a treble, a Shanghai): flashes,
//                          red paper, smoke
//   firework(p, c)         a shell bursting over the pagoda (round 8, the winner, a Shanghai)
//   show(rate, at)         keep fireworks going over `at`
//   floatText(text, p, c)  "+15" rising off the bed, big enough to read from the master
//   dust(p)                a puff off the board for a dart that scores nothing
import * as THREE from 'three';
import { Pool } from '../lib3d/particles.js';
import { rng } from './common.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const GOLD = [1.0, 0.72, 0.28], RED = [0.85, 0.08, 0.06];
const SHELL = [[1, 0.25, 0.2], [1, 0.75, 0.25], [0.35, 0.85, 1], [0.95, 0.4, 1], [0.4, 1, 0.55], [1, 0.95, 0.7]];

export class Fx {
    constructor(scene) {
        this.scene = scene;
        this.light = new Pool(2600, THREE.AdditiveBlending, scene, new THREE.Vector3(1, 1, 1));
        this.matter = new Pool(1400, THREE.NormalBlending, scene, new THREE.Vector3(0.7, 0.6, 0.6));
        this.R = rng(97);
        this.queue = [];      // delayed spawns [t, fn]
        this.texts = [];
        this.rate = 0; this.at = null; this.fwT = 0; this.t = 0;
    }
    later(dt, fn) { this.queue.push([this.t + dt, fn]); }
    setLight(k) { this.matter.mat.uniforms.uLight.value.setScalar(k); }

    sparks(p, c = GOLD, n = 40) {
        const R = this.R;
        for (let i = 0; i < n; i++) {
            const a = R() * Math.PI * 2, s = 1.5 + R() * 4;
            this.light.spawn({ p: [p.x, p.y, p.z + 0.05], v: [Math.cos(a) * s, Math.sin(a) * s + 1, 1 + R() * 2.5], c: [c[0] * 2.4, c[1] * 2.4, c[2] * 2.4, 1], size: 0.05 + R() * 0.04, kind: 4, life: 0.35 + R() * 0.4, drag: 2.5, grav: 6 });
        }
        this.light.spawn({ p: [p.x, p.y, p.z + 0.1], c: [c[0] * 1.6, c[1] * 1.6, c[2] * 1.6, 0.9], size: 1.1, kind: 3, life: 0.35, grav: 0, grow: 0.8 });
    }
    gong(p, k = 1) {
        this.light.spawn({ p: [p.x, p.y, p.z + 0.25], c: [1.2, 0.8, 0.42, 0.18 + 0.06 * k], size: 1.3 + k * 0.3, kind: 3, life: 0.45 + 0.1 * k, grav: 0, grow: 0.9 });
    }
    dust(p) {
        const R = this.R;
        for (let i = 0; i < 10; i++) this.matter.spawn({ p: [p.x, p.y, p.z + 0.05], v: [(R() - 0.5) * 0.8, (R() - 0.2) * 0.6, 0.3 + R() * 0.5], c: [0.55, 0.45, 0.38, 0.45], size: 0.12 + R() * 0.1, kind: 1, life: 0.8 + R() * 0.5, drag: 2, grav: -0.2, grow: 2 });
    }
    /** crackers pop in sequence from x0 to x1 along the wall top (y), each a flash, sparks, red paper and smoke */
    firecrackers(x0, x1, y = 4.95, z = 0.35, n = 26) {
        const R = this.R;
        for (let i = 0; i < n; i++) {
            const x = x0 + (x1 - x0) * (i / (n - 1)) + (R() - 0.5) * 0.2;
            this.later(i * 0.055 + R() * 0.03, () => {
                this.light.spawn({ p: [x, y, z], c: [2.8, 2.0, 1.1, 1], size: 1.7 + R() * 0.8, kind: 3, life: 0.14, grav: 0 });
                for (let k = 0; k < 10; k++) { const a = R() * Math.PI * 2; this.light.spawn({ p: [x, y, z], v: [Math.cos(a) * 4, Math.sin(a) * 4 + 1, 1 + R()], c: [2.6, 1.6, 0.5, 1], size: 0.07, kind: 4, life: 0.25 + R() * 0.2, drag: 3, grav: 5 }); }
                for (let k = 0; k < 6; k++) this.matter.spawn({ p: [x, y, z], v: [(R() - 0.5) * 2.4, R() * 2.8, 0.5 + R() * 1.5], c: [...RED, 1], size: 0.1 + R() * 0.06, kind: 2, rot: R() * 6, spin: (R() - 0.5) * 14, life: 1.6 + R(), drag: 1.6, grav: 2.2 });
                this.matter.spawn({ p: [x, y + 0.1, z], v: [0, 0.5, 0.2], c: [0.62, 0.58, 0.56, 0.35], size: 0.5, kind: 1, life: 1.6, drag: 1, grav: -0.25, grow: 2.5 });
            });
        }
    }
    firework(p, c) {
        const R = this.R, col = c || SHELL[Math.floor(R() * SHELL.length)], n = 110;
        this.light.spawn({ p: [p.x, p.y, p.z], c: [col[0] * 2, col[1] * 2, col[2] * 2, 1], size: 9, kind: 3, life: 0.25, grav: 0 });
        for (let i = 0; i < n; i++) {
            const u = R() * 2 - 1, a = R() * Math.PI * 2, r = Math.sqrt(1 - u * u), s = 9 + R() * 3;
            this.light.spawn({ p: [p.x, p.y, p.z], v: [r * Math.cos(a) * s, u * s, r * Math.sin(a) * s], c: [col[0] * 2.2, col[1] * 2.2, col[2] * 2.2, 1], size: 0.35, kind: 4, life: 1.3 + R() * 0.7, drag: 1.3, grav: 3 });
        }
    }
    /** keep a show going: `rate` shells a second over the point `at` (0 stops) */
    show(rate, at) { this.rate = rate; this.at = at; }
    floatText(text, p, color = '#ffd36a', scale = 1) {
        const c = document.createElement('canvas'); c.width = 256; c.height = 128;
        const g = c.getContext('2d');
        g.font = '900 96px "Avenir Next Condensed","DIN Condensed",Impact,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineWidth = 12; g.strokeStyle = 'rgba(40,10,0,0.85)'; g.strokeText(text, 128, 66); g.fillStyle = color; g.fillText(text, 128, 66);
        const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
        s.scale.set(0.9 * scale, 0.45 * scale, 1); s.position.copy(p); s.renderOrder = 9;
        this.scene.add(s); this.texts.push({ s, t: 0, y0: p.y });
    }
    setScale(px, w, h) { this.light.setScale(px, w, h); this.matter.setScale(px, w, h); }
    get busy() { return this.texts.length > 0; }
    update(dt) {
        this.t += dt;
        for (let i = this.queue.length - 1; i >= 0; i--) if (this.queue[i][0] <= this.t) { const f = this.queue[i][1]; this.queue.splice(i, 1); f(); }
        if (this.rate > 0 && this.at) {
            this.fwT -= dt;
            if (this.fwT <= 0) { const R = this.R; this.fwT = (0.4 + R() * 0.8) / this.rate; this.firework(V(this.at.x + (R() - 0.5) * 30, this.at.y + R() * 12, this.at.z + (R() - 0.5) * 14)); }
        }
        for (let i = this.texts.length - 1; i >= 0; i--) {
            const T = this.texts[i]; T.t += dt;
            const u = T.t / 1.4;
            T.s.position.y = T.y0 + u * 1.1; T.s.material.opacity = u < 0.15 ? u / 0.15 : 1 - Math.max(0, (u - 0.6) / 0.4);
            if (u >= 1) { this.scene.remove(T.s); T.s.material.map.dispose(); T.s.material.dispose(); this.texts.splice(i, 1); }
        }
        this.light.update(dt); this.matter.update(dt);
    }
}
