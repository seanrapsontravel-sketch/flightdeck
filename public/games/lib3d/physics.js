// Rigid-body boxes (debris, chunks, toppling props). Shared by the 3D games: Demolition's rubble, Limbo's toppling
// totems and cracked ball. Bodies are boxes: semi-implicit Euler with quaternion orientation,
// sequential-impulse contacts with restitution and Coulomb friction. Contacts:
//   box corners vs the ground plane and vs `statics` (objects with `group.position` and `solidAt(point, out)`
//   → bool, filling out.nx/ny/nz/depth; only those within 8 m in plan are asked)
//   box vs box through a cluster of four spheres per box (cheap, and rubble piles convincingly)
//   box vs `kinematic` spheres ({p, v, r, active}: a wrecking ball), which push but are never pushed
// Bodies fall asleep when they stop. Everything renders as one InstancedMesh the game supplies (its geometry is
// the unit box `size`; a body's `s` scales it). If mesh.userData.seed is an instanced attribute, it gets b.seed.
//   const world = new World(scene, mesh, { w, h, d }, { sinkAfter: 24 });
import * as THREE from 'three';

export const GRAVITY = 16;
const SUB = 1 / 120, MAX_SUB = 5, ITER = 6;
const MU = 0.62, REST = 0.22, SLOP = 0.004;

class Body {
    constructor() {
        this.p = new THREE.Vector3(); this.q = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.w = new THREE.Vector3();
        this.h = new THREE.Vector3(); this.s = new THREE.Vector3(1, 1, 1);
        this.invM = 1; this.invI = new THREE.Vector3();
        this.R = new Float32Array(9);
        this.color = new THREE.Color(); this.seed = -1;
        this.sleep = false; this.still = 0; this.age = 0;
        this.corr = new THREE.Vector3(); this.nc = 0;
        this.spheres = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]; this.sr = 0.29;
    }
    updateR() {
        const { x, y, z, w } = this.q, R = this.R;
        const x2 = x + x, y2 = y + y, z2 = z + z, xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
        // row-major: R[r*3+c]
        R[0] = 1 - (yy + zz); R[1] = xy - wz; R[2] = xz + wy;
        R[3] = xy + wz; R[4] = 1 - (xx + zz); R[5] = yz - wx;
        R[6] = xz - wy; R[7] = yz + wx; R[8] = 1 - (xx + yy);
        // sphere cluster centres in world
        const ox = this.h.x * 0.5, oz = this.h.z * 0.5;
        let k = 0;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
            const lx = sx * ox, lz = sz * oz;
            this.spheres[k++].set(this.p.x + R[0] * lx + R[2] * lz, this.p.y + R[3] * lx + R[5] * lz, this.p.z + R[6] * lx + R[8] * lz);
        }
    }
    /** out = Iw^-1 * x (world) */
    invIw(x, out) {
        const R = this.R;
        const bx = R[0] * x.x + R[3] * x.y + R[6] * x.z, by = R[1] * x.x + R[4] * x.y + R[7] * x.z, bz = R[2] * x.x + R[5] * x.y + R[8] * x.z;
        const ix = bx * this.invI.x, iy = by * this.invI.y, iz = bz * this.invI.z;
        return out.set(R[0] * ix + R[1] * iy + R[2] * iz, R[3] * ix + R[4] * iy + R[5] * iz, R[6] * ix + R[7] * iy + R[8] * iz);
    }
}

const V1 = new THREE.Vector3(), V2 = new THREE.Vector3(), V3 = new THREE.Vector3(), V4 = new THREE.Vector3(), V5 = new THREE.Vector3();
const OUT = { nx: 0, ny: 0, nz: 0, depth: 0 };

export class World {
    /** mesh: an InstancedMesh whose capacity is the body limit; size: the unit box {w,h,d} its geometry spans;
     *  sinkAfter: seconds asleep before a body sinks away into the ground (Infinity = never) */
    constructor(scene, mesh, size, { sinkAfter = 24 } = {}) {
        this.max = mesh.count;
        this.size = size;
        this.sinkAfter = sinkAfter;
        this.mesh = mesh;
        this.mesh.count = 0;
        scene.add(this.mesh);
        this.bodies = []; this.pool = [];
        this.statics = []; this.kinematic = [];
        this.contacts = []; this.cpool = [];
        this.events = [];
        this.acc = 0;
        this.grid = new Map();
        this.M = new THREE.Matrix4();
    }

    add({ p, q, v, w, s, color, seed = -1 }) {
        if (this.bodies.length >= this.max) this.evict();
        const b = this.pool.pop() || new Body();
        b.p.copy(p); b.q.copy(q); b.v.copy(v || V1.set(0, 0, 0)); b.w.copy(w || V1.set(0, 0, 0));
        b.s.copy(s || V1.set(1, 1, 1));
        b.h.set(this.size.w / 2 * b.s.x, this.size.h / 2 * b.s.y, this.size.d / 2 * b.s.z);
        const m = 8 * b.h.x * b.h.y * b.h.z * 4;
        b.invM = 1 / m;
        const hx2 = b.h.x * b.h.x, hy2 = b.h.y * b.h.y, hz2 = b.h.z * b.h.z;
        b.invI.set(3 / (m * (hy2 + hz2)), 3 / (m * (hx2 + hz2)), 3 / (m * (hx2 + hy2)));
        b.sr = Math.min(b.h.y, b.h.x * 0.75);
        b.color.copy(color); b.seed = seed; b.sleep = false; b.still = 0; b.age = 0;
        b.updateR();
        this.bodies.push(b);
        return b;
    }
    evict() {
        let k = this.bodies.findIndex((b) => b.sleep);
        if (k < 0) k = 0;
        this.pool.push(this.bodies.splice(k, 1)[0]);
    }
    clear() { while (this.bodies.length) this.pool.push(this.bodies.pop()); this.mesh.count = 0; }
    wakeAll() { for (const b of this.bodies) { b.sleep = false; b.still = 0; } }

    /** clear every body by sinking it into the ground over a second */
    sink() { this.sinking = 1; }

    step(dt) {
        if (this.sinking > 0) {
            this.sinking -= dt;
            for (const b of this.bodies) { b.p.y -= dt * 1.6; b.sleep = true; }
            if (this.sinking <= 0) this.clear();
            return;
        }
        this.acc = Math.min(this.acc + dt, SUB * MAX_SUB);
        while (this.acc >= SUB) { this.substep(SUB); this.acc -= SUB; }
    }

    contact(a, b, nx, ny, nz, px, py, pz, depth, kv) {
        const c = this.cpool.pop() || { n: new THREE.Vector3(), ra: new THREE.Vector3(), rb: new THREE.Vector3(), kv: new THREE.Vector3() };
        c.a = a; c.b = b; c.n.set(nx, ny, nz); c.depth = depth; c.jn = 0; c.jt = 0;
        c.ra.set(px - a.p.x, py - a.p.y, pz - a.p.z);
        if (b) c.rb.set(px - b.p.x, py - b.p.y, pz - b.p.z); else c.rb.set(0, 0, 0);
        if (kv) c.kv.copy(kv); else c.kv.set(0, 0, 0);
        // effective mass along the normal
        c.mn = 1 / (this.k(a, c.ra, c.n) + (b && !b.sleep ? this.k(b, c.rb, c.n) : 0));
        const vn = this.relVel(c, V5).dot(c.n);
        c.bias = vn < -1.2 ? -REST * vn : 0;
        if (vn < -3.5 && this.events.length < 32) this.events.push({ x: px, y: py, z: pz, speed: -vn, ground: !b && ny > 0.9 && py < 0.2, body: a });
        if (b && b.sleep && vn < -2.5) { b.sleep = false; b.still = 0; }
        this.contacts.push(c);
    }
    k(b, r, n) {
        const rn = V1.crossVectors(r, n);
        b.invIw(rn, V2);
        return b.invM + V3.crossVectors(V2, r).dot(n);
    }
    relVel(c, out) {
        const a = c.a, b = c.b;
        out.crossVectors(a.w, c.ra).add(a.v);
        if (b && !b.sleep) { V4.crossVectors(b.w, c.rb).add(b.v); out.sub(V4); } else out.sub(c.kv);
        return out;
    }
    impulse(c, jx, jy, jz) {
        const a = c.a, b = c.b, J = V1.set(jx, jy, jz);
        a.v.addScaledVector(J, a.invM);
        a.invIw(V2.crossVectors(c.ra, J), V3); a.w.add(V3);
        if (b && !b.sleep) {
            b.v.addScaledVector(J, -b.invM);
            b.invIw(V2.crossVectors(c.rb, J), V3); b.w.sub(V3);
        }
    }

    substep(dt) {
        const B = this.bodies;
        // integrate forces
        for (const b of B) { if (b.sleep) continue; b.v.y -= GRAVITY * dt; b.age += dt; b.updateR(); }
        // contacts
        for (const c of this.contacts) this.cpool.push(c);
        this.contacts.length = 0;
        this.collideStatic(B);
        this.collidePairs(B);
        this.collideKinematic(B);
        // solve
        const C = this.contacts;
        for (let it = 0; it < ITER; it++) {
            for (const c of C) {
                const rel = this.relVel(c, V5);
                const vn = rel.dot(c.n);
                let jn = (c.bias - vn) * c.mn;
                const acc = Math.max(c.jn + jn, 0); jn = acc - c.jn; c.jn = acc;
                if (jn !== 0) this.impulse(c, c.n.x * jn, c.n.y * jn, c.n.z * jn);
                // friction along the sliding direction
                const r2 = this.relVel(c, V5);
                const vn2 = r2.dot(c.n);
                r2.addScaledVector(c.n, -vn2);
                const vt = r2.length();
                if (vt > 1e-5) {
                    const t = r2.divideScalar(vt);
                    const mt = 1 / (this.k(c.a, c.ra, t) + (c.b && !c.b.sleep ? this.k(c.b, c.rb, t) : 0));
                    let jt = -vt * mt;
                    const lim = MU * c.jn, accT = THREE.MathUtils.clamp(c.jt + jt, -lim, lim); jt = accT - c.jt; c.jt = accT;
                    this.impulse(c, t.x * jt, t.y * jt, t.z * jt);
                }
            }
        }
        // integrate positions, damp, sleep
        for (const b of B) {
            if (b.sleep) continue;
            b.v.multiplyScalar(0.9992); b.w.multiplyScalar(0.985);
            b.p.addScaledVector(b.v, dt);
            const { x, y, z } = b.w, q = b.q;
            const qx = q.x, qy = q.y, qz = q.z, qw = q.w, h = 0.5 * dt;
            q.set(qx + h * (x * qw + y * qz - z * qy), qy + h * (y * qw + z * qx - x * qz), qz + h * (z * qw + x * qy - y * qx), qw + h * (-x * qx - y * qy - z * qz)).normalize();
            b.corr.set(0, 0, 0); b.nc = 0;
        }
        // positional correction: average push-out per body (so four corners on the floor don't quadruple it)
        for (const c of C) {
            const d = Math.max(c.depth - SLOP, 0); if (!d) continue;
            const a = c.a, b = c.b;
            if (b && !b.sleep) {
                const wa = a.invM / (a.invM + b.invM);
                a.corr.addScaledVector(c.n, d * wa); a.nc++;
                b.corr.addScaledVector(c.n, -d * (1 - wa)); b.nc++;
            } else { a.corr.addScaledVector(c.n, d); a.nc++; }
        }
        for (const b of B) {
            if (b.sleep || !b.nc) continue;
            b.p.addScaledVector(b.corr, 0.8 / Math.max(1, b.nc * 0.5));
            const e = b.v.lengthSq() < 0.05 && b.w.lengthSq() < 0.12;
            b.still = e ? b.still + dt : 0;
            if (b.still > 0.45) { b.sleep = true; b.v.set(0, 0, 0); b.w.set(0, 0, 0); }
        }
        // long-settled rubble sinks away slowly so a long game doesn't bury the set
        for (const b of B) if (b.sleep && b.age > this.sinkAfter) { b.p.y -= dt * 0.25; b.age += dt; }
        for (const b of B) if (b.sleep) b.age += dt;
        // anything that fell through, sank away or flew far away is gone
        for (let i = B.length - 1; i >= 0; i--) if (B[i].p.y < -3 || B[i].p.lengthSq() > 250000) this.pool.push(B.splice(i, 1)[0]);
    }

    collideStatic(B) {
        const S = this.statics;
        for (const b of B) {
            if (b.sleep) continue;
            const R = b.R, h = b.h;
            const near = [];
            for (const s of S) { const dx = b.p.x - s.group.position.x, dz = b.p.z - s.group.position.z; if (dx * dx + dz * dz < 64) near.push(s); }
            for (let k = 0; k < 8; k++) {
                const lx = k & 1 ? h.x : -h.x, ly = k & 2 ? h.y : -h.y, lz = k & 4 ? h.z : -h.z;
                const px = b.p.x + R[0] * lx + R[1] * ly + R[2] * lz, py = b.p.y + R[3] * lx + R[4] * ly + R[5] * lz, pz = b.p.z + R[6] * lx + R[7] * ly + R[8] * lz;
                if (py < 0) this.contact(b, null, 0, 1, 0, px, py, pz, -py);
                for (const s of near) {
                    V4.set(px, py, pz);
                    if (s.solidAt(V4, OUT)) this.contact(b, null, OUT.nx, OUT.ny, OUT.nz, px, py, pz, OUT.depth);
                }
            }
        }
    }

    collidePairs(B) {
        const G = this.grid; G.clear();
        const cs = 1.4, key = (x, y, z) => (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);
        for (const b of B) {
            const k = key(Math.floor(b.p.x / cs), Math.floor(b.p.y / cs), Math.floor(b.p.z / cs));
            let l = G.get(k); if (!l) G.set(k, (l = [])); l.push(b);
        }
        for (const a of B) {
            if (a.sleep) continue;
            const cx = Math.floor(a.p.x / cs), cy = Math.floor(a.p.y / cs), cz = Math.floor(a.p.z / cs);
            for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
                const l = G.get(key(cx + dx, cy + dy, cz + dz)); if (!l) continue;
                for (const b of l) {
                    if (b === a || (!b.sleep && b.id < a.id)) continue;
                    if (!b.sleep && a.p.distanceToSquared(b.p) > 2.6) continue;
                    if (b.sleep && a.p.distanceToSquared(b.p) > 2.6) continue;
                    this.spherePairs(a, b);
                }
            }
        }
    }
    spherePairs(a, b) {
        // at most two deepest sphere contacts per pair keeps the solver calm
        let best = [null, null];
        const ra = a.sr, rb = b.sr, R = ra + rb;
        for (const sa of a.spheres) for (const sb of b.spheres) {
            const dx = sa.x - sb.x, dy = sa.y - sb.y, dz = sa.z - sb.z, d2 = dx * dx + dy * dy + dz * dz;
            if (d2 >= R * R || d2 < 1e-8) continue;
            const d = Math.sqrt(d2), depth = R - d;
            const c = { nx: dx / d, ny: dy / d, nz: dz / d, px: sb.x + dx / d * (rb - depth / 2), py: sb.y + dy / d * (rb - depth / 2), pz: sb.z + dz / d * (rb - depth / 2), depth };
            if (!best[0] || depth > best[0].depth) { best[1] = best[0]; best[0] = c; } else if (!best[1] || depth > best[1].depth) best[1] = c;
        }
        for (const c of best) if (c) this.contact(a, b, c.nx, c.ny, c.nz, c.px, c.py, c.pz, c.depth);
    }

    collideKinematic(B) {
        for (const K of this.kinematic) {
            if (!K.active) continue;
            for (const b of B) {
                const rr = K.r + 1.2;
                if (b.p.distanceToSquared(K.p) > rr * rr) continue;
                if (b.sleep) { b.sleep = false; b.still = 0; }
                for (const s of b.spheres) {
                    const dx = s.x - K.p.x, dy = s.y - K.p.y, dz = s.z - K.p.z, d = Math.hypot(dx, dy, dz), R = K.r + b.sr;
                    if (d >= R || d < 1e-6) continue;
                    const nx = dx / d, ny = dy / d, nz = dz / d;
                    this.contact(b, null, nx, ny, nz, K.p.x + nx * K.r, K.p.y + ny * K.r, K.p.z + nz * K.r, R - d, K.v);
                }
            }
        }
    }

    render() {
        const B = this.bodies, M = this.M, mesh = this.mesh, seed = mesh.userData.seed;
        for (let i = 0; i < B.length; i++) {
            const b = B[i];
            M.compose(b.p, b.q, b.s);
            mesh.setMatrixAt(i, M);
            mesh.setColorAt(i, b.color);
            if (seed) seed.array[i] = b.seed;
        }
        mesh.count = B.length;
        mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; if (seed) seed.needsUpdate = true;
    }
}

let ids = 0;
Object.defineProperty(Body.prototype, 'id', { get() { return this._id ?? (this._id = ids++); } });
