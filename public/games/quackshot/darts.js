// The darts: 1.2 m darts with flights in the thrower's colour, thrown from the active station along an arc and stuck
// in the exact bed the server scored (common.js dartSpot: zone → bed, number, seeded spread). A visit's darts stay
// in until the visit ends, then pull out and fade. Geometry from Killer's darts; the board here is upright (z = 0
// plane facing +z), so a stuck dart points back out toward the counter.
import * as THREE from 'three';
import { hitAt } from '../lib3d/kit/darts.js';
import { MM, BOARD_Y, FLIGHT_S, dartSpot, clamp01, easeOut } from './common.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
function geometry() {
    const tip = new THREE.ConeGeometry(0.018, 0.2, 10).rotateX(Math.PI).translate(0, 0.1, 0);
    const barrel = new THREE.CylinderGeometry(0.05, 0.042, 0.36, 18, 6).translate(0, 0.38, 0);
    const p = barrel.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); const s = 1 - 0.08 * (Math.round((y - 0.2) * 40) % 2); p.setX(i, p.getX(i) * s); p.setZ(i, p.getZ(i) * s); }
    barrel.computeVertexNormals();
    const shaft = new THREE.CylinderGeometry(0.016, 0.02, 0.36, 10).translate(0, 0.74, 0);
    const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(0.11, 0.06); s.lineTo(0.13, 0.26); s.lineTo(0, 0.3); s.closePath();
    const flights = [];
    for (let i = 0; i < 3; i++) flights.push(new THREE.ShapeGeometry(s).translate(0.012, 0.88, 0).rotateY((i * Math.PI * 2) / 3));
    return { tip, barrel, shaft, flights };
}

let GEO = null;
export class Darts {
    constructor(scene) {
        this.scene = scene;
        if (!GEO) GEO = geometry();
        this.steel = new THREE.MeshStandardMaterial({ color: '#cfd3d8', metalness: 1, roughness: 0.18 });
        this.brass = new THREE.MeshStandardMaterial({ color: '#b98a3e', metalness: 1, roughness: 0.28 });
        this.shaftMat = new THREE.MeshStandardMaterial({ color: '#141416', metalness: 0.4, roughness: 0.35 });
        this.list = []; this.spare = [];
        this.pool = null;   // the water trough (pool.js): a miss comes down in it
        this.ringGeo = new THREE.RingGeometry(0.075, 0.12, 40);
    }
    make(color) {
        let D = this.spare.pop();
        if (!D) {
            const g = new THREE.Group();
            const fm = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.45, side: THREE.DoubleSide, emissive: new THREE.Color(), emissiveIntensity: 0.5, transparent: true });
            const parts = [new THREE.Mesh(GEO.tip, this.steel), new THREE.Mesh(GEO.barrel, this.brass), new THREE.Mesh(GEO.shaft, this.shaftMat), ...GEO.flights.map((f) => new THREE.Mesh(f, fm))];
            parts.forEach((m) => { m.castShadow = true; g.add(m); });
            D = { g, fm };
        }
        D.fm.color.set(color); D.fm.emissive.set(color); D.fm.opacity = 1;
        D.g.visible = true; D.g.scale.setScalar(1);
        this.scene.add(D.g);
        return D;
    }

    /**
     * throw a dart from `from` (world) at lastThrow t; key seeds where in its bed it sits (player|round|dart).
     * Returns the record: .hit is the bed it really sits in (for the nothing-lies check), .at its world tip.
     */
    throwIn(t, key, color, from, { onImpact, instant = false } = {}) {
        const pos = dartSpot(t, key);
        const water = pos.bed === 'miss' && this.pool;
        // a miss comes down in the pool below the board; everything else sticks in its exact bed
        const at = water ? this.pool.landing(pos.x * MM).add(V(0, 0.05, 0)) : V(pos.x * MM, BOARD_Y + pos.y * MM, 0.004);
        const D = this.make(color);
        // stuck: pointing back out of the board toward the thrower, drooping a little, a touch of seeded yaw
        const s = Math.abs(Math.sin(pos.x * 12.9898 + pos.y * 78.233) * 43758.5453) % 1;
        const out = V(0, 0, 1).add(V((from.x - at.x) * 0.03 + (s - 0.5) * 0.18, 0.16 + (s - 0.5) * 0.08, 0)).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), water ? V(-0.25 + s * 0.5, 0.85, 0.4).normalize() : out);
        const rec = { D, at, q, from: from.clone(), hit: hitAt(pos.x, pos.y), bed: pos.bed, water, color, phase: 'fly', t: 0, onImpact, wob: 0 };
        if (instant) { rec.phase = 'stuck'; this.place(rec, 1); }
        this.list.push(rec);
        return rec;
    }
    place(rec, u) {
        const g = rec.D.g;
        if (u >= 1) { g.position.copy(rec.at); g.quaternion.copy(rec.q); return; }
        const arc = (k) => { const p = rec.from.clone().lerp(rec.at, k); p.y += Math.sin(k * Math.PI) * 1.1; return p; };
        const p = arc(u), nxt = arc(Math.min(1, u + 0.04));
        g.position.copy(p);
        const back = p.clone().sub(nxt).normalize();
        g.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), back)).slerp(rec.q, u * u);
    }
    /** the visit is over: every stuck dart pulls out and fades */
    clear(instant = false) { for (const r of this.list) if (r.phase !== 'leave') { r.phase = 'leave'; r.t = instant ? 9 : 0; } }
    /** the darts in the board (stuck or in flight), in throw order */
    get shown() { return this.list.filter((r) => r.phase !== 'leave'); }
    get busy() { return this.list.some((r) => r.phase === 'fly' || (r.phase === 'leave' && r.t < 0.6) || r.wob > 0.02); }
    /** the record of the dart that just landed (for the camera) */
    get last() { return this.shown.at(-1) || null; }

    update(dt) {
        for (let i = this.list.length - 1; i >= 0; i--) {
            const r = this.list[i], g = r.D.g;
            r.t += dt;
            if (r.phase === 'fly') {
                const u = clamp01(r.t / FLIGHT_S);
                this.place(r, u);
                if (u >= 1) {
                    r.phase = 'stuck'; r.wob = 1;
                    // a glow ring at the bed in the thrower's colour, so every dart's spot reads from across a bar
                    if (!r.water) {
                        r.ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(r.color).multiplyScalar(2.2), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
                        r.ring.position.copy(r.at).add(V(0, 0, 0.012)); r.ring.renderOrder = 3; this.scene.add(r.ring);
                    }
                    if (r.onImpact) r.onImpact(r);
                }
            } else if (r.phase === 'stuck') {
                r.wob = Math.max(0, r.wob - dt * 2.6);
                const w = Math.sin(r.t * 38) * r.wob * r.wob * 0.09;
                g.position.copy(r.at);
                if (r.water) g.position.y += Math.sin(r.t * 1.7) * 0.02;   // bobbing in the pool
                if (r.ring) r.ring.material.opacity = 0.55 + 0.3 * r.wob + 0.08 * Math.sin(r.t * 4);
                g.quaternion.copy(r.q).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(w, 0, w * 0.6)));
            } else {
                const u = clamp01(r.t / 0.6);
                g.position.copy(r.at).add(V(0, 0, easeOut(u) * 1.4));
                r.D.fm.opacity = 1 - u; g.scale.setScalar(1 - u * 0.4);
                if (r.ring) r.ring.material.opacity = 0.8 * (1 - u);
                if (u >= 1) { g.visible = false; this.scene.remove(g); this.spare.push(r.D); if (r.ring) { this.scene.remove(r.ring); r.ring.material.dispose(); } this.list.splice(i, 1); }
            }
        }
    }
}
