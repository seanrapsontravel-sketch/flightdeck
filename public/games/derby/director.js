// Camera direction, cut like a racing broadcast: a long-lens tracking shot on the field during play, a dolly
// alongside a horse that surges, a low head-on as one charges, a rearing close-up for a knock, the classic
// photo-finish angle across the line, a crane for round titles and an orbit of the winner's circle.
import * as THREE from 'three';
import { FINISH, RAIL_Z } from './course.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
function noise1(t) { return Math.sin(t * 0.71) * 0.5 + Math.sin(t * 1.37 + 1.3) * 0.3 + Math.sin(t * 2.93 + 2.1) * 0.2; }

export class Director {
    constructor(camera) {
        this.cam = camera;
        this.pos = V(-40, 30, 90); this.look = V(60, 0, 0); this.fov = 32;
        this.shot = { name: 'establish', t: 0, p: {} };
        this.shake = 0;
        this.lastCut = 0; this.clock = 0;
        this.ctx = null;
    }

    /** switch shot; cut snaps, otherwise the camera glides there */
    set(name, p = {}, cut = false) {
        if (this.shot.name === name && !cut && sameParams(this.shot.p, p)) return;
        this.shot = { name, t: 0, p, cut };
        if (cut) this.snap = true;
        this.lastCut = this.clock;
    }

    field(ctx) {
        const rs = ctx.runners;
        if (!rs.length) return { min: 0, max: 0, mean: 0, z0: -4, z1: 4 };
        let min = Infinity, max = -Infinity, mean = 0, z0 = Infinity, z1 = -Infinity;
        for (const r of rs) { min = Math.min(min, r.x); max = Math.max(max, r.x); mean += r.x; z0 = Math.min(z0, r.z); z1 = Math.max(z1, r.z); }
        return { min, max, mean: mean / rs.length, z0, z1 };
    }

    compute(ctx, dt) {
        const s = this.shot, p = s.p, t = s.t, c = this.clock;
        const f = this.field(ctx);
        const zc = (f.z0 + f.z1) / 2;
        const hand = V(noise1(c * 0.6) * 0.25, noise1(c * 0.5 + 9) * 0.15, 0);
        switch (s.name) {
            case 'establish': {
                // slow crane across the course
                const a = c * 0.05;
                return { pos: V(90 + Math.cos(a) * 140, 38 + Math.sin(c * 0.13) * 6, 40 + Math.sin(a) * 110), look: V(90, 4, -20), fov: 38, k: 1.2 };
            }
            case 'field': {
                // the broadcast angle: ahead of the horse that's throwing and out on the infield side, looking back
                // across it at the stand so the lanes separate; widens to take in rivals close by
                const r = p.runner;
                const ax = r ? r.x : f.mean, az = r ? r.z : zc;
                let near = 0;
                for (const o of ctx.runners) { const dx = Math.abs(o.x - ax); if (dx < 40) near = Math.max(near, dx); }
                return { pos: V(ax + 9 + near * 0.25, 3.0 + near * 0.07, az + 12.5 + near * 0.32).add(hand), look: V(ax - 2.5 - near * 0.3, 0.9, az - 2.5), fov: 32, k: 1.6 };
            }
            case 'hero': {
                // call to the post: low 3/4 front from outside the field, a slow push in; a longer lens for far lanes
                const r = p.runner; if (!r) break;
                const out = Math.max(r.z + 4.5, f.z1 + 3.2), dz = out - r.z;
                const push = ease(t / 3);
                const dx = 4.2 + dz * 0.45 - push * 1.2;
                const dist = Math.hypot(dx, dz);
                return { pos: V(r.x + dx, 1.45 + dz * 0.12, out), look: V(r.x + 0.45, 1.5, r.z), fov: Math.max(9, 2 * Math.atan(1.95 / dist) * 57.3), k: 4 };
            }
            case 'chase': {
                // dolly alongside, a little ahead, looking back across the horse: always outside the field
                const r = p.runner; if (!r) break;
                const out = Math.max(r.z + 8.5, f.z1 + 4.5), dz = out - r.z;
                const dist = Math.hypot(4.2, dz);
                return { pos: V(r.x + 4.2, 2.0 + dz * 0.06, out).add(hand.multiplyScalar(0.6)), look: V(r.x + 0.4, 1.35, r.z - 0.5), fov: Math.max(14, 2 * Math.atan(2.6 / dist) * 57.3), k: 5 };
            }
            case 'charge': {
                // low and ahead: the horse thunders toward the lens; the camera pans to follow it past
                const r = p.runner; if (!r) break;
                const ax = p.anchorX ?? (r.targetX + 4);
                const pos = V(ax, 0.85, r.z + 1.35);
                const look = V(Math.min(r.x + 1.0, ax - 0.4), 1.3, r.z);
                return { pos, look, fov: 30 + Math.min(10, Math.max(0, 8 - Math.abs(ax - r.x)) * 0.8), k: 9 };
            }
            case 'knock': {
                const r = p.runner; if (!r) break;
                const out = Math.max(r.z + 7, f.z1 + 4), dz = out - r.z;
                const dist = Math.hypot(6 + t * 0.3, dz);
                return { pos: V(r.x + 6 + t * 0.3, 1.6 + dz * 0.08, out), look: V(r.x + 0.3, 1.6, r.z), fov: Math.max(14, 2 * Math.atan(2.4 / dist) * 57.3), k: 4 };
            }
            case 'photo': {
                // across the line, low on the infield side; the winning post on the far rail lines up behind
                // short of the line on the infield side, looking through the gantry so it frames the post
                const r = p.runner, rz = r ? r.z : 0;
                return { pos: V(FINISH - 5.5, 1.9, RAIL_Z + 7.5), look: V(FINISH + 1.2, 1.25, rz - 1), fov: 34, k: 30 };
            }
            case 'pastpost': {
                const r = p.runner; if (!r) break;
                const out = Math.max(r.z + 6, f.z1 + 3.5), dz = out - r.z;
                const dx = 5.5 - t * 0.5, dist = Math.hypot(dx, dz);
                return { pos: V(r.x + dx, 1.8 + t * 0.12, out), look: V(r.x + 0.4, 1.6, r.z), fov: Math.max(12, 2 * Math.atan(2.3 / dist) * 57.3), k: 3 };
            }
            case 'crane': {
                // round title: sweep up the straight from behind the stalls, rising
                const u = ease(t / 3.2);
                const x = -30 + u * 70;
                return { pos: V(x, 9 + u * 16, 46 - u * 6), look: V(x + 70, 0, -10), fov: 36, k: 2.2 };
            }
            case 'winner': {
                const rs = p.runners && p.runners.length ? p.runners : ctx.runners.slice(0, 1);
                const cx = rs.reduce((s, r) => s + r.x, 0) / rs.length, cz = rs.reduce((s, r) => s + r.z, 0) / rs.length;
                const spread = rs.length > 1 ? Math.max(...rs.map((r) => Math.abs(r.z - cz))) : 0;
                const a = 0.9 + t * 0.16;
                const rad = 6.8 + spread * 1.3;
                return { pos: V(cx + Math.cos(a) * rad, 1.9 + Math.sin(t * 0.4) * 0.3, cz + Math.sin(a) * rad), look: V(cx + 0.3, 1.55, cz), fov: 33, k: 2.4 };
            }
        }
        return { pos: this.pos.clone(), look: this.look.clone(), fov: this.fov, k: 2 };
    }

    update(ctx, dt) {
        this.clock += dt;
        this.shot.t += dt;
        const w = this.compute(ctx, dt);
        if (this.snap) { this.pos.copy(w.pos); this.look.copy(w.look); this.fov = w.fov; this.snap = false; }
        else {
            const k = w.k;
            this.pos.set(damp(this.pos.x, w.pos.x, k, dt), damp(this.pos.y, w.pos.y, k, dt), damp(this.pos.z, w.pos.z, k, dt));
            this.look.set(damp(this.look.x, w.look.x, k * 1.4, dt), damp(this.look.y, w.look.y, k * 1.4, dt), damp(this.look.z, w.look.z, k * 1.4, dt));
            this.fov = damp(this.fov, w.fov, k, dt);
        }
        // depth of field per shot: shallow on the close, cinematic angles, none on the wide ones
        const AP = { hero: 1.1, winner: 0.85, pastpost: 0.8, knock: 0.8, chase: 0.55, charge: 0.4, photo: 0.25, field: 0.22 };
        const fr = this.shot.p.runner || (this.shot.p.runners && this.shot.p.runners[0]);
        const fd = fr && this.shot.name !== 'field' ? this.cam.position.distanceTo(V(fr.x + 0.4, 1.4, fr.z)) : this.pos.distanceTo(this.look);
        this.dofFocus = this.snap === false && this.dofFocus ? damp(this.dofFocus, fd, 8, dt) : fd;
        this.dofAp = damp(this.dofAp || 0, AP[this.shot.name] || 0, 3, dt);
        this.shake = Math.max(0, this.shake - dt * 2.5);
        const sh = this.shake * this.shake;
        this.cam.position.copy(this.pos).add(V(noise1(this.clock * 23) * sh * 0.08, noise1(this.clock * 19 + 4) * sh * 0.08, 0));
        this.cam.lookAt(this.look);
        if (Math.abs(this.cam.fov - this.fov) > 0.01) { this.cam.fov = this.fov; this.cam.updateProjectionMatrix(); }
    }
}

function sameParams(a, b) {
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => a[k] === b[k]);
}
