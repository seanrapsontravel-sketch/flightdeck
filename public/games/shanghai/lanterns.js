// Sky lanterns — the points. A paper lantern (a Kongming lantern: a paper bell open at the foot, a bamboo hoop,
// a burning fuel cell on cross wires) in the thrower's colour; a scoring dart releases one per point.
//
// Milestone 0 has the single hero lantern (skyLantern) and an instanced flock (LanternFlock) for the concept still.
// The flock is ONE draw call for the paper and one for the glow sprites; per-instance colour drives both the
// paper's diffuse and its emissive (patched into the standard shader). frustumCulled is off: three's instanced
// bounding sphere doesn't follow instances placed far from the origin.
import * as THREE from 'three';
import { Vector3 } from 'three';
import { Builder, canvasTex } from './common.js';

const H = 0.95; // a big sky lantern is ~1 m tall

/** the paper bell: open at the foot, widest at about two-thirds height, a rounded crown */
export function lanternGeo(seg = 28, rings = 24) {
    const P = [];
    for (let i = 0; i <= rings; i++) {
        const t = i / rings, y = t * H;
        // radius: 0.25 at the hoop, swelling to 0.33, then rounding over the crown
        const r = t < 0.78 ? 0.25 + 0.08 * Math.sin((t / 0.78) * Math.PI * 0.62) : 0.33 * Math.cos(((t - 0.78) / 0.22) * Math.PI / 2) ** 0.55;
        P.push(new THREE.Vector2(Math.max(0.0005, r), y));
    }
    const g = new THREE.LatheGeometry(P, seg);
    return g;
}

let PAPER = null;
/** paper: fibres, a few ribs, brighter low (the flame is at the foot) — used as the emissive map */
function paperTex() {
    if (PAPER) return PAPER;
    PAPER = canvasTex(256, 256, (g, w, h) => {
        const gr = g.createLinearGradient(0, h, 0, 0);
        gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.35, '#d8d8d8'); gr.addColorStop(0.75, '#8a8a8a'); gr.addColorStop(1, '#5a5a5a');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        // the paper's seams (four panels) and fibres
        g.fillStyle = 'rgba(0,0,0,0.35)'; for (let i = 0; i < 4; i++) g.fillRect((i / 4) * w, 0, 4, h);
        for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(${i % 2 ? 255 : 0},${i % 2 ? 255 : 0},${i % 2 ? 255 : 0},0.05)`; g.fillRect((i * 73) % w, (i * 151) % h, 1 + (i % 9), 1); }
    }, { srgb: false });
    return PAPER;
}

let GLOW = null;
function glowTex() {
    if (GLOW) return GLOW;
    GLOW = canvasTex(128, 128, (g, w) => {
        const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
        gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(0, 0, w, w);
    });
    return GLOW;
}

/** paper in the player's colour with a cream crown; it glows from inside, white-hot just above the flame */
const PAPER_GLSL = `
float hy=vEmissiveMapUv.y;float gk=max(max(emissive.r,emissive.g),emissive.b);
vec3 tint=totalEmissiveRadiance;
float crown=smoothstep(.8,.84,hy);
totalEmissiveRadiance=mix(tint,vec3(1.,.86,.62)*gk*.55,crown);
totalEmissiveRadiance+=vec3(1.,.72,.38)*pow(max(1.-hy*1.25,0.),3.)*gk*.9;
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.95,.88,.72),crown);`;
function paperMaterial(colour, glow = 1.6, instanced = false) {
    const m = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.85, side: THREE.DoubleSide, emissive: colour, emissiveMap: paperTex(), emissiveIntensity: glow });
    m.onBeforeCompile = (s) => {
        s.fragmentShader = s.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + (instanced ? '#ifdef USE_COLOR\ntotalEmissiveRadiance *= vColor;\n#endif\n' : '') + PAPER_GLSL);
    };
    return m;
}

/** one hero lantern: paper, bamboo hoop, cross wires, the burning fuel cell and a soft halo */
export function skyLantern(colour = '#e63946', { glow = 1.6, halo = true } = {}) {
    const G = new THREE.Group(); G.name = 'sky-lantern';
    const paper = new THREE.Mesh(lanternGeo(), paperMaterial(colour, glow)); G.add(paper);
    const bamboo = new THREE.MeshStandardMaterial({ color: '#c9a46a', roughness: 0.7 });
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.012, 6, 40).rotateX(Math.PI / 2), bamboo); hoop.position.y = 0.005; G.add(hoop);
    const wires = new Builder();
    wires.add(new THREE.CylinderGeometry(0.003, 0.003, 0.5, 4).rotateZ(Math.PI / 2));
    wires.add(new THREE.CylinderGeometry(0.003, 0.003, 0.5, 4).rotateX(Math.PI / 2));
    G.add(new THREE.Mesh(wires.build(), new THREE.MeshStandardMaterial({ color: '#555', metalness: 1, roughness: 0.5 })));
    const fuel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb24a').multiplyScalar(9) })); G.add(fuel);
    // the flame: a small additive sprite on the fuel cell, and the halo round the whole lantern
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: new THREE.Color('#ffc070').multiplyScalar(4), blending: THREE.AdditiveBlending, depthWrite: false }));
    flame.scale.set(0.16, 0.24, 1); flame.position.y = 0.06; G.add(flame);
    if (halo) {
        const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: new THREE.Color(colour).multiplyScalar(0.5), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.35 }));
        h.scale.set(1.6, 1.6, 1); h.position.y = H * 0.45; G.add(h);
    }
    G.userData = { paper, height: H };
    return G;
}

/**
 * A flock of lanterns: instanced paper + glow sprites. place(i, pos, colour, scale) sets one; count is fixed.
 */
export class LanternFlock {
    constructor(count, { glow = 1.6 } = {}) {
        // the instance colour tints the glow as well as the paper
        const m = paperMaterial('#ffffff', glow, true);
        // the flock is seen small: an 8-sided, 10-ring paper bell (160 triangles) is plenty
        this.paper = new THREE.InstancedMesh(lanternGeo(8, 10), m, count);
        this.paper.frustumCulled = false;
        const gm = new THREE.MeshBasicMaterial({ map: glowTex(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 });
        this.halo = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), gm, count);
        this.halo.frustumCulled = false;
        this.count = count;
        this.group = new THREE.Group(); this.group.add(this.paper, this.halo);
        this._m = new THREE.Matrix4(); this._c = new THREE.Color();
        this._q = new THREE.Quaternion(); this._s = new THREE.Vector3();
        for (let i = 0; i < count; i++) this.place(i, new THREE.Vector3(0, -999, 0), '#000', 0);
    }
    /** halos face the camera: call with the camera's quaternion before placing */
    face(q) { this._q.copy(q); }
    place(i, p, colour, s = 1, tilt = 0) {
        const M = this._m;
        M.compose(p, new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, 0, tilt * 0.6)), this._s.set(s, s, s));
        this.paper.setMatrixAt(i, M);
        this.paper.setColorAt(i, this._c.set(colour));
        M.compose(new THREE.Vector3(p.x, p.y + H * 0.45 * s, p.z), this._q, this._s.set(1.9 * s, 1.9 * s, 1.9 * s));
        this.halo.setMatrixAt(i, M);
        this.halo.setColorAt(i, this._c.set(colour).multiplyScalar(0.55));
        this.paper.instanceMatrix.needsUpdate = this.halo.instanceMatrix.needsUpdate = true;
        if (this.paper.instanceColor) this.paper.instanceColor.needsUpdate = true;
        if (this.halo.instanceColor) this.halo.instanceColor.needsUpdate = true;
    }
}

/**
 * Every player's points, as sky lanterns: a scoring dart releases one lantern per point from the bed; each rises in
 * an arc and joins that player's cloud above their station (their "string": a loose hanging lattice, tethered to the
 * pole). The cloud shows one lantern per point up to CAP; past the cap the cloud glows brighter instead (plan §9.3:
 * the DOM HUD is the readable number). On the winner every lantern lets go and rises into the night.
 *
 *   field.setPlayers([{ color, anchor: Vector3 }])     field.set(i, points)      (no animation: reconcile)
 *   field.release(i, from: Vector3, n, onLand?)         n lanterns fly from `from` to player i's cloud
 *   field.releaseAll()                                   the winner: everything rises away
 *   field.shown(i)   lanterns in player i's cloud (landed)          field.busy   any in flight
 */
export const CAP = 32;
const FLY_S = 1.7, STAGGER = 0.07;
export class LanternField {
    constructor(scene, { players = 6 } = {}) {
        this.max = players * CAP + 160;
        this.flock = new LanternFlock(this.max, { glow: 1.5 });
        scene.add(this.flock.group);
        this.players = []; this.fly = []; this.free = []; this.gone = [];
        this.t = 0; this._p = new Vector3(); this.cam = null;
        for (let k = this.max - 1; k >= 0; k--) this.free.push(k);
    }
    setPlayers(list) {
        this.fly.length = 0; this.gone.length = 0; this.free.length = 0;
        this.flock.paper.count = this.flock.halo.count = this.max;
        for (let k = this.max - 1; k >= 0; k--) { this.free.push(k); this.flock.place(k, HIDE, '#000', 0); }
        this.players = list.map((p, i) => ({ ...p, i, slots: [], points: 0, landed: 0 }));
    }
    /**
     * slot k of player i: the player's lantern tree — four tethered strings hanging from an arm beside their scroll,
     * filling from the top (8 a string). It stays below the pagoda's horizon in the master, so the round tracker and
     * the gong are never buried.
     */
    slot(i, k) {
        const P = this.players[i], a = P.anchor, col = k % 4, row = Math.floor(k / 4);
        const j = (Math.sin(k * 12.9898 + i * 78.233) * 43758.5453) % 1;
        return new Vector3(a.x + 0.78 + col * 0.25 + (row % 2) * 0.05, a.y - 0.42 - row * 0.29 + j * 0.03, a.z - 0.15 - (col % 2) * 0.12);
    }
    /** reconcile: player i shows min(points, CAP) lanterns, landed, no animation */
    set(i, points) {
        const P = this.players[i]; if (!P) return;
        P.points = points;
        const want = Math.min(CAP, points);
        if (this.fly.some((f) => f.i === i)) return; // let the flight finish; it lands into the right count
        while (P.slots.length > want) { const s = P.slots.pop(); this.flock.place(s.k, HIDE, '#000', 0); this.free.push(s.k); this.free.sort((a, b) => b - a); }
        while (P.slots.length < want) { const k = this.free.pop(); if (k == null) break; P.slots.push({ k }); }
        P.landed = P.slots.length;
        this.glow(i);
    }
    glow(i) { const P = this.players[i]; P.over = Math.max(0, P.points - CAP); }
    release(i, from, n, onLand) {
        const P = this.players[i]; if (!P || n <= 0) return;
        P.points += n;
        let room = CAP - P.slots.length - this.fly.filter((f) => f.i === i).length;
        for (let m = 0; m < n; m++) {
            const k = this.free.pop(); if (k == null) break;
            const target = room > 0 ? P.slots.length + this.fly.filter((f) => f.i === i && f.slot != null).length : null;
            if (room > 0) room--;
            this.fly.push({ k, i, from: from.clone(), t: -m * STAGGER, slot: target, last: m === n - 1 ? onLand : null, side: (m % 2 ? 1 : -1) * (0.3 + (m % 5) * 0.12) });
        }
    }
    /** the winner: every lantern lets go and drifts up into the sky */
    releaseAll() {
        for (const P of this.players) { for (const s of P.slots) this.gone.push({ k: s.k, i: P.i, p: this.slot(P.i, P.slots.indexOf(s)), t: -h01(s.k) * 1.5, v: 0.8 + h01(s.k + 7) * 0.9, sway: h01(s.k + 13) * 6 }); P.slots = []; P.landed = 0; }
        for (const f of this.fly) this.gone.push({ k: f.k, i: f.i, p: f.from.clone(), t: 0, v: 1, sway: 1 });
        this.fly.length = 0;
    }
    shown(i) { return this.players[i] ? this.players[i].slots.length : 0; }
    get busy() { return this.fly.length > 0; }
    update(dt, cam) {
        this.t += dt;
        if (cam) this.flock.face(cam.quaternion);
        const F = this.flock;
        // flights: a rising arc from the bed, bowing out sideways, easing into the slot
        for (let n = this.fly.length - 1; n >= 0; n--) {
            const f = this.fly[n]; f.t += dt;
            if (f.t < 0) continue;
            const P = this.players[f.i], u = Math.min(1, f.t / FLY_S), e = 1 - Math.pow(1 - u, 2.2);
            const to = f.slot != null ? this.slot(f.i, f.slot) : P.anchor.clone().add(new Vector3(1.1, 0.6 + (f.k % 5) * 0.2, -0.4));
            const p = f.from.clone().lerp(to, e); p.y += Math.sin(u * Math.PI) * 1.6; p.x += Math.sin(u * Math.PI) * f.side;
            F.place(f.k, p, P.color, 0.36 - 0.12 * u, Math.sin(this.t * 3 + f.k) * 0.1);
            if (u >= 1) {
                this.fly.splice(n, 1);
                if (f.slot != null) { P.slots.push({ k: f.k }); P.landed = P.slots.length; }
                else { F.place(f.k, HIDE, '#000', 0); this.free.push(f.k); this.free.sort((a, b) => b - a); } // past the cap: it joins the glow instead
                this.glow(f.i);
                if (f.last) f.last();
            }
        }
        // the clouds bob; past the cap they glow brighter
        for (const P of this.players) {
            const boost = 1 + Math.min(1.5, (P.over || 0) / 40);
            P.slots.forEach((s, k) => { const p = this.slot(P.i, k); p.y += Math.sin(this.t * 0.9 + k * 1.7) * 0.025; F.place(s.k, p, P.color, 0.24 * (boost > 1 ? 1.04 : 1), Math.sin(this.t * 0.7 + k) * 0.06); });
            if (boost > 1) for (const s of P.slots) F.halo.setColorAt(s.k, F._c.set(P.color).multiplyScalar(0.55 * boost));
        }
        // the winner's release: up and away, swaying, fading into the dark
        for (let n = this.gone.length - 1; n >= 0; n--) {
            const g = this.gone[n]; g.t += dt;
            if (g.t < 0) continue;
            g.p.y += g.v * dt * (1 + g.t * 0.4); g.p.x += Math.sin(g.t * 0.8 + g.sway) * 0.3 * dt; g.p.z -= 0.4 * dt;
            F.place(g.k, g.p, this.players[g.i]?.color || '#fff', 0.3 + Math.min(0.3, g.t * 0.05), Math.sin(g.t + g.sway) * 0.12);
            if (g.p.y > 70) { F.place(g.k, HIDE, '#000', 0); this.free.push(g.k); this.free.sort((a, b) => b - a); this.gone.splice(n, 1); }
        }
        F.halo.instanceColor && (F.halo.instanceColor.needsUpdate = true);
        // draw only as many instances as are in use (free slots are handed out lowest first)
        let hi = -1;
        for (const P of this.players) for (const s of P.slots) if (s.k > hi) hi = s.k;
        for (const f of this.fly) if (f.k > hi) hi = f.k;
        for (const g of this.gone) if (g.k > hi) hi = g.k;
        F.paper.count = F.halo.count = hi + 1;
    }
}
const HIDE = new Vector3(0, -999, 0);
/** a stable per-lantern number in [0, 1) (no Math.random in shared code) */
const h01 = (k) => { const x = Math.sin(k * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
