// The darts: flights in the thrower's colour, thrown from the oche along an arc and stuck in the exact bed the
// server scored (kit/darts dartPosition: number, multiplier and sector → bed, spread by a seeded rnd so the same
// dart always sits in the same place). A turn's three darts stay in until the turn ends, then pull out and fade.
// Geometry as Shanghai's, scaled to this board. The board faces +z at z = 0, centred at BOARD_Y.
import * as THREE from 'three';
import { dartPosition, hitAt } from '../lib3d/kit/darts.js';
import { BOARD_Y, K, hash, rng } from './common.js';

export const FLIGHT_S = 0.34;
const SCALE = 0.55;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);

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
export const boardPoint = (x, y, z = 0) => V(x * K, BOARD_Y + y * K, z);
/** board-plane spot (mm) for a dart: seeded by its key, so it never moves on a reload */
export const dartSpot = (t, key) => dartPosition(t && t.miss ? { miss: true } : t, rng(hash('mpo', key)));

let GEO = null;
export class Darts {
    constructor(scene) {
        this.scene = scene;
        if (!GEO) GEO = geometry();
        this.steel = new THREE.MeshStandardMaterial({ color: '#cfd3d8', metalness: 1, roughness: 0.18 });
        this.barrelMat = new THREE.MeshStandardMaterial({ color: '#9aa3b5', metalness: 1, roughness: 0.25 });
        this.shaftMat = new THREE.MeshStandardMaterial({ color: '#141416', metalness: 0.4, roughness: 0.35 });
        this.list = []; this.spare = [];
        this.ringGeo = new THREE.RingGeometry(0.045, 0.072, 40);
    }
    make(color) {
        let D = this.spare.pop();
        if (!D) {
            const g = new THREE.Group();
            const fm = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.45, side: THREE.DoubleSide, emissive: new THREE.Color(), emissiveIntensity: 0.6, transparent: true });
            const parts = [new THREE.Mesh(GEO.tip, this.steel), new THREE.Mesh(GEO.barrel, this.barrelMat), new THREE.Mesh(GEO.shaft, this.shaftMat), ...GEO.flights.map((f) => new THREE.Mesh(f, fm))];
            parts.forEach((m) => { m.castShadow = true; g.add(m); });
            D = { g, fm };
        }
        D.fm.color.set(color); D.fm.emissive.set(color); D.fm.opacity = 1;
        D.g.visible = true; D.g.scale.setScalar(SCALE);
        this.scene.add(D.g);
        return D;
    }
    /** throw a dart from `from` at lastThrow t; .hit is the bed it really sits in (nothing-lies), .at its tip */
    throwIn(t, key, color, from, { onImpact, instant = false } = {}) {
        const pos = dartSpot(t, key);
        const at = boardPoint(pos.x, pos.y, 0.01);
        const D = this.make(color);
        const s = Math.abs(Math.sin(pos.x * 12.9898 + pos.y * 78.233) * 43758.5453) % 1;
        const out = V(0, 0, 1).add(V((from.x - at.x) * 0.02 + (s - 0.5) * 0.18, 0.14 + (s - 0.5) * 0.08, 0)).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), out);
        const rec = { D, at, q, from: from.clone(), hit: hitAt(pos.x, pos.y), bed: pos.bed, color, phase: 'fly', t: 0, onImpact, wob: 0, key };
        if (instant) { rec.phase = 'stuck'; this.place(rec, 1); this.ring(rec); }
        this.list.push(rec);
        return rec;
    }
    place(rec, u) {
        const g = rec.D.g;
        if (u >= 1) { g.position.copy(rec.at); g.quaternion.copy(rec.q); return; }
        const arc = (k) => { const p = rec.from.clone().lerp(rec.at, k); p.y += Math.sin(k * Math.PI) * 0.8; return p; };
        const p = arc(u), nxt = arc(Math.min(1, u + 0.04));
        g.position.copy(p);
        const back = p.clone().sub(nxt).normalize();
        g.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), back)).slerp(rec.q, u * u);
    }
    ring(r) {
        r.ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(r.color).multiplyScalar(2.2), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        r.ring.position.copy(r.at).add(V(0, 0, 0.012)); r.ring.renderOrder = 4; this.scene.add(r.ring);
    }
    clear(instant = false) { for (const r of this.list) if (r.phase !== 'leave') { r.phase = 'leave'; r.t = instant ? 9 : 0; } }
    get shown() { return this.list.filter((r) => r.phase !== 'leave'); }
    get busy() { return this.list.some((r) => r.phase === 'fly' || (r.phase === 'leave' && r.t < 0.6) || r.wob > 0.02); }
    update(dt) {
        for (let i = this.list.length - 1; i >= 0; i--) {
            const r = this.list[i], g = r.D.g;
            r.t += dt;
            if (r.phase === 'fly') {
                const u = clamp01(r.t / FLIGHT_S);
                this.place(r, u);
                if (u >= 1) { r.phase = 'stuck'; r.wob = 1; this.ring(r); if (r.onImpact) r.onImpact(r); }
            } else if (r.phase === 'stuck') {
                r.wob = Math.max(0, r.wob - dt * 2.6);
                const w = Math.sin(r.t * 38) * r.wob * r.wob * 0.09;
                g.position.copy(r.at);
                if (r.ring) r.ring.material.opacity = 0.55 + 0.3 * r.wob + 0.08 * Math.sin(r.t * 4);
                g.quaternion.copy(r.q).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(w, 0, w * 0.6)));
            } else {
                const u = clamp01(r.t / 0.6);
                g.position.copy(r.at).add(V(0, 0, easeOut(u) * 0.9));
                r.D.fm.opacity = 1 - u; g.scale.setScalar(SCALE * (1 - u * 0.4));
                if (r.ring) r.ring.material.opacity = 0.8 * (1 - u);
                if (u >= 1) { g.visible = false; this.scene.remove(g); this.spare.push(r.D); if (r.ring) { this.scene.remove(r.ring); r.ring.material.dispose(); r.ring = null; } this.list.splice(i, 1); }
            }
        }
    }
}
