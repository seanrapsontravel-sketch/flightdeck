// Camera direction base for the 3D games. A game subclasses ShotDirector and writes its shots in compute(), which
// returns where the lens wants to be for the current shot: { pos, look, fov, k (damping rate), focusPt? }.
// The base supplies what every game needs and learned the hard way in Demolition:
//   - damping toward the shot (a cut snaps), focus distance and a per-shot aperture for the engine's DOF
//   - trauma shake: impacts add trauma, shake = trauma², it decays (translation + a little roll)
//   - occlusion fallback: set() swaps to the shot's fallback while something stands between lens and subject
//     (the game lists blockers as upright cylinders via occluders())
//   - clearance: the lens rises over nearby props (clearance.items(): things with .p) and never dips below the floor
//   - avoid(p): a game hook to push the lens out of solid volumes
import * as THREE from 'three';

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
export const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
export function noise1(t) { return Math.sin(t * 0.71) * 0.5 + Math.sin(t * 1.37 + 1.3) * 0.3 + Math.sin(t * 2.93 + 2.1) * 0.2; }

export class ShotDirector {
    /**
     * fallback  — { shot: nextShotIfOccluded }
     * aperture  — { shot: DOF aperture } (default `apertureDefault`)
     * clearance — { r: radius around the lens, lift: height above an item's centre, items: () => [{p}] } or null
     * floor     — the lowest the lens may go
     * shake     — { decay, x, y, z, roll } trauma-shake amplitudes
     */
    constructor(camera, { fallback = {}, aperture = {}, apertureDefault = 0.2, clearance = null, floor = 0.3, shake = {}, start = {} } = {}) {
        this.cam = camera;
        this.fallback = fallback; this.aperture = aperture; this.apertureDefault = apertureDefault;
        this.clearance = clearance; this.floor = floor;
        this.shake = { decay: 1.6, x: 0.45, y: 0.35, z: 0.2, roll: 0.06, ...shake };
        this.pos = start.pos || V(0, 9, 40); this.look = start.look || V(0, 6, -4); this.fov = start.fov ?? 38; this.roll = 0;
        this.shot = { name: start.shot || 'wide', t: 0, p: {} };
        this.trauma = 0; this.clock = 0;
        this.dofFocus = 30; this.dofAp = 0.2;
        this.snap = true;
    }

    set(name, p = {}, cut = false) {
        // if something stands between this angle and its subject, take the next angle that's clear
        for (let k = 0; k < 4 && this.fallback[name] && this.occluded(name, p); k++) name = this.fallback[name];
        this.shot = { name, t: 0, p };
        if (cut) this.snap = true;
    }

    /** blockers for shot params p, as upright cylinders { x, z, r, top } (the subject itself left out) */
    occluders(/* p */) { return []; }

    /** would shot `name` look through one of the occluders? (checked in plan, at the sight line's height) */
    occluded(name, p) {
        const keep = this.shot;
        this.shot = { name, t: 0, p };
        const w = this.compute();
        this.shot = keep;
        const a = w.pos, b = w.look, dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1;
        for (const o of this.occluders(p)) {
            const u = THREE.MathUtils.clamp(((o.x - a.x) * dx + (o.z - a.z) * dz) / L2, 0, 1);
            const px = a.x + dx * u - o.x, pz = a.z + dz * u - o.z, y = a.y + (b.y - a.y) * u;
            if (px * px + pz * pz < o.r * o.r && y < o.top) return true;
        }
        return false;
    }
    addTrauma(a) { this.trauma = Math.min(1, this.trauma + a); }

    /** the shot's desired lens: override */
    compute() { return { pos: this.pos.clone(), look: this.look.clone(), fov: this.fov, k: 2 }; }

    /** push the lens out of solid volumes: override */
    avoid(/* p */) {}

    /** focus distance for the lens `w` (override for subjects that aren't points) */
    focusDistance(w) { return w.focusPt ? this.pos.distanceTo(w.focusPt) : this.pos.distanceTo(this.look); }

    /** keep the camera out of solids, above nearby props, and above the floor */
    constrain(p) {
        this.avoid(p);
        const C = this.clearance;
        if (C) {
            let top = 0;
            const r2 = C.r * C.r;
            for (const b of C.items()) { const dx = b.p.x - p.x, dz = b.p.z - p.z; if (dx * dx + dz * dz < r2) top = Math.max(top, b.p.y + C.lift); }
            if (p.y < top) p.y = top;
        }
        if (p.y < this.floor) p.y = this.floor;
        return p;
    }

    update(dt) {
        this.clock += dt; this.shot.t += dt;
        const w = this.compute();
        this.constrain(w.pos);
        if (this.snap) { this.pos.copy(w.pos); this.look.copy(w.look); this.fov = w.fov; this.snap = false; }
        else {
            const k = w.k;
            this.pos.set(damp(this.pos.x, w.pos.x, k, dt), damp(this.pos.y, w.pos.y, k, dt), damp(this.pos.z, w.pos.z, k, dt));
            this.look.set(damp(this.look.x, w.look.x, k * 1.4, dt), damp(this.look.y, w.look.y, k * 1.4, dt), damp(this.look.z, w.look.z, k * 1.4, dt));
            this.fov = damp(this.fov, w.fov, k, dt);
        }
        this.dofFocus = damp(this.dofFocus, this.focusDistance(w), 6, dt);
        this.dofAp = damp(this.dofAp, w.aperture ?? this.aperture[this.shot.name] ?? this.apertureDefault, 3, dt);
        // trauma shake: translation + roll, quadratic in trauma
        const K = this.shake;
        this.trauma = Math.max(0, this.trauma - dt * K.decay);
        const sh = this.trauma * this.trauma, c = this.clock;
        const off = V(noise1(c * 31) * sh * K.x, noise1(c * 27 + 4) * sh * K.y, noise1(c * 23 + 8) * sh * K.z);
        this.cam.position.copy(this.pos).add(off);
        this.cam.up.set(Math.sin(noise1(c * 19 + 2) * sh * K.roll), 1, 0).normalize();
        this.cam.lookAt(V().copy(this.look).addScaledVector(off, 0.6));
        if (Math.abs(this.cam.fov - this.fov) > 0.01) { this.cam.fov = this.fov; this.cam.updateProjectionMatrix(); }
    }
}
