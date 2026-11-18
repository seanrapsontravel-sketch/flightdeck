// The darts: each landed dart arrives as a 1.2 m brass-and-tungsten dart with flights in the thrower's colour,
// thrown in from the oche side (the audience, +z) on a short arc, and sticks in the exact bed it hit (lib3d/kit/darts
// dartPosition from lastThrow). A visit's darts stay in until the visit ends, then rise out and fade. A miss lands
// in the dark ring outside the doubles, skitters and lies flat.
import * as THREE from 'three';
import { dartPosition, hitAt } from '../lib3d/kit/darts.js';
import { MM, FLIGHT_S, V, clamp01, easeOut } from './common.js';

const L = 1.2; // overall length; the tip at the origin, the dart along +y
function dartGeometry() {
    const tip = new THREE.ConeGeometry(0.018, 0.2, 10).rotateX(Math.PI).translate(0, 0.1, 0);
    const barrel = new THREE.CylinderGeometry(0.05, 0.042, 0.36, 18, 6).translate(0, 0.38, 0);
    // knurled grip rings on the barrel
    const p = barrel.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); const s = 1 - 0.08 * (Math.round((y - 0.2) * 40) % 2); p.setX(i, p.getX(i) * s); p.setZ(i, p.getZ(i) * s); }
    barrel.computeVertexNormals();
    const shaft = new THREE.CylinderGeometry(0.016, 0.02, 0.36, 10).translate(0, 0.74, 0);
    return { tip, barrel, shaft };
}
function flightGeometry() {
    // three kite-shaped flights round the back of the shaft
    const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(0.11, 0.06); s.lineTo(0.13, 0.26); s.lineTo(0, 0.3); s.closePath();
    const g = [];
    for (let i = 0; i < 3; i++) g.push(new THREE.ShapeGeometry(s).translate(0.012, 0.88, 0).rotateY(i * Math.PI * 2 / 3));
    return g;
}

let GEO = null;
export class Darts {
    constructor(scene, fx) {
        this.scene = scene; this.fx = fx;
        if (!GEO) GEO = { ...dartGeometry(), flights: flightGeometry() };
        this.steel = new THREE.MeshStandardMaterial({ color: '#cfd3d8', metalness: 1, roughness: 0.18 });
        this.brass = new THREE.MeshStandardMaterial({ color: '#b98a3e', metalness: 1, roughness: 0.28 });
        this.shaftMat = new THREE.MeshStandardMaterial({ color: '#141416', metalness: 0.4, roughness: 0.35 });
        this.list = [];   // { g, phase: 'fly'|'stuck'|'leave', ... }
        this.pool = [];
    }
    make(color) {
        let D = this.pool.pop();
        if (!D) {
            const g = new THREE.Group();
            const fm = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.45, side: THREE.DoubleSide, emissive: new THREE.Color(), emissiveIntensity: 0.6, transparent: true });
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
     * throw a dart in: t = lastThrow; rnd spreads it inside its bed. Returns the record (with .hit, the bed it really
     * sits in, for the nothing-lies check). onImpact(record) fires when it lands (FLIGHT_S after the throw).
     */
    throwIn(t, color, rnd, { onImpact, instant = false } = {}) {
        const pos = dartPosition(t, rnd);
        const at = V(pos.x * MM, 0, -pos.y * MM);
        const D = this.make(color);
        // the stuck angle: leaning back toward the oche (+z), a little random yaw
        const lean = 0.32 + rnd() * 0.12, yaw = (rnd() - 0.5) * 0.5;
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(lean, yaw, 0, 'YXZ'));
        const rec = { D, at, q, hit: hitAt(pos.x, pos.y), bed: pos.bed, miss: pos.bed === 'miss', phase: 'fly', t: 0, onImpact, wob: 0 };
        // from off-camera: high over the oche side
        rec.from = at.clone().add(V((rnd() - 0.5) * 2, 7.5, 9));
        if (instant) { rec.phase = 'stuck'; rec.t = 1; this.place(rec, 1); }
        this.list.push(rec);
        return rec;
    }
    place(rec, u) {
        const g = rec.D.g;
        if (u >= 1) { g.position.copy(rec.at); g.quaternion.copy(rec.q); return; }
        const p = rec.from.clone().lerp(rec.at, u); p.y += Math.sin(u * Math.PI) * 0.9;
        g.position.copy(p);
        // point along the flight: tip first (the dart's +y points back along its path)
        const nxt = rec.from.clone().lerp(rec.at, Math.min(1, u + 0.05)); nxt.y += Math.sin(Math.min(1, u + 0.05) * Math.PI) * 0.9;
        const back = p.clone().sub(nxt).normalize();
        const qa = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), back);
        g.quaternion.copy(qa).slerp(rec.q, u * u);
    }
    /** the visit is over: every stuck dart rises out and fades */
    clear(instant = false) {
        for (const r of this.list) if (r.phase !== 'leave') { r.phase = 'leave'; r.t = 0; if (instant) r.t = 9; }
    }
    /** the darts currently in the board (stuck or in flight), in throw order */
    get shown() { return this.list.filter((r) => r.phase !== 'leave'); }
    get busy() { return this.list.some((r) => r.phase === 'fly' || (r.phase === 'leave' && r.t < 0.7) || r.wob > 0.02 || (r.skid && r.skid.t < r.skid.dur)); }

    update(dt) {
        for (let i = this.list.length - 1; i >= 0; i--) {
            const r = this.list[i], g = r.D.g;
            r.t += dt;
            if (r.phase === 'fly') {
                const u = clamp01(r.t / FLIGHT_S);
                this.place(r, u);
                if (u >= 1) {
                    r.phase = 'stuck'; r.wob = 1;
                    if (r.miss) {
                        // skitters: bounces outward and lies flat in the dark ring
                        const out = V(r.at.x, 0, r.at.z).normalize();
                        r.skid = { t: 0, dur: 0.55, from: r.at.clone(), to: r.at.clone().addScaledVector(out, 0.35), q0: r.q.clone(), q1: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 - 0.08, Math.atan2(out.x, out.z), 0, 'YXZ')) };
                        r.wob = 0;
                    }
                    if (this.fx) this.fx.impact(r.at, g.children[3].material.color, r.miss);
                    if (r.onImpact) r.onImpact(r);
                }
            } else if (r.phase === 'stuck') {
                if (r.skid) {
                    const S = r.skid; S.t += dt; const u = clamp01(S.t / S.dur);
                    g.position.copy(S.from).lerp(S.to, easeOut(u)); g.position.y = Math.abs(Math.sin(u * Math.PI * 2)) * 0.18 * (1 - u) + u * 0.05;
                    g.quaternion.copy(S.q0).slerp(S.q1, easeOut(u));
                    if (u >= 1) { r.at.copy(g.position); r.q.copy(g.quaternion); }
                } else {
                    // the thunk: a damped wobble about the stuck angle
                    r.wob = Math.max(0, r.wob - dt * 2.6);
                    const w = Math.sin(r.t * 38) * r.wob * r.wob * 0.09;
                    g.position.copy(r.at);
                    g.quaternion.copy(r.q).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(w, 0, w * 0.6)));
                }
            } else {
                const u = clamp01(r.t / 0.7);
                g.position.copy(r.at).add(V(0, easeOut(u) * 1.6, 0));
                r.D.fm.opacity = 1 - u; g.scale.setScalar(1 - u * 0.4);
                if (u >= 1) { g.visible = false; this.scene.remove(g); this.pool.push(r.D); this.list.splice(i, 1); }
            }
        }
    }
}
