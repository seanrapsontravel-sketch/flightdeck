// Racehorse + jockey. One sculpted, skinned horse mesh is built at load (signed-distance sculpt → surface nets →
// distance-weighted skin over a 19-bone rig) and shared by every runner; each runner gets its own skeleton, coat,
// silks, saddle cloth and a procedural gait (transverse gallop, rear, rewind, idle).
import * as THREE from 'three';
import { clamp, ellipsoid, mix, roundCone, segDist, smax, smin, smoothstep, sphere, surfaceNets } from './sdf.js';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------- anatomy (metres, +x forward, +y up, +z right)
// Joint landmarks: s = elbow / stifle (top of the swinging leg), k = knee / hock, f = fetlock, h = coronet, g = toe.
// The pastern slopes forward ~35° and the hoof sits ahead of the fetlock, as on a real foot.
const LEG = {
    FR: { s: [0.46, 1.04], k: [0.47, 0.56], f: [0.47, 0.18], h: [0.52, 0.078], g: [0.555, 0.0], z: 0.15, front: true },
    FL: { s: [0.46, 1.04], k: [0.47, 0.56], f: [0.47, 0.18], h: [0.52, 0.078], g: [0.555, 0.0], z: -0.15, front: true },
    HR: { s: [-0.46, 0.98], k: [-0.66, 0.58], f: [-0.6, 0.18], h: [-0.555, 0.078], g: [-0.52, 0.0], z: 0.16, front: false },
    HL: { s: [-0.46, 0.98], k: [-0.66, 0.58], f: [-0.6, 0.18], h: [-0.555, 0.078], g: [-0.52, 0.0], z: -0.16, front: false },
};
const LEG_NAMES = ['FR', 'FL', 'HR', 'HL'];
const v3 = (p, z = 0) => [p[0], p[1], z];
const TAIL_A = [-0.84, 1.42, 0], TAIL_B = [-0.98, 1.1, 0], TAIL_C = [-1.02, 0.6, 0];
const NECK_A = [0.5, 1.3, 0], NECK_B = [0.97, 1.9, 0];
const HEAD_A = [1.0, 1.94, 0], HEAD_B = [1.35, 1.53, 0];
export const EYE = [1.085, 1.905, 0.088];

// ---- sculpt kit: parts are built once (no per-sample allocation) and grouped into chains with bounding boxes;
// a chain sampled well outside its box returns the box distance, a lower bound that's never near the surface.
const box = (lo, hi) => ({ lo, hi });
function bnd(c, r) { return box([c[0] - r[0], c[1] - r[1], c[2] - r[2]], [c[0] + r[0], c[1] + r[1], c[2] + r[2]]); }
const pS = (c, r) => ({ f: (x, y, z) => sphere(x, y, z, c, r), ...bnd(c, [r, r, r]) });
const pE = (c, r) => ({ f: (x, y, z) => ellipsoid(x, y, z, c, r), ...bnd(c, r) });
/** round cone, optionally squashed along one axis (ax 0|2) by k about o (a flat-sided limb, a thin ear) */
function pC(a, b, ra, rb, ax = -1, k = 1, o = 0) {
    const R = Math.max(ra, rb);
    const lo = [0, 1, 2].map((i) => Math.min(a[i], b[i]) - R), hi = [0, 1, 2].map((i) => Math.max(a[i], b[i]) + R);
    if (ax < 0) return { f: (x, y, z) => roundCone(x, y, z, a, b, ra, rb), lo, hi };
    const sa = a.slice(), sb = b.slice(); sa[ax] = o + (a[ax] - o) * k; sb[ax] = o + (b[ax] - o) * k;
    const f = ax === 0 ? (x, y, z) => roundCone(o + (x - o) * k, y, z, sa, sb, ra, rb) / k : (x, y, z) => roundCone(x, y, o + (z - o) * k, sa, sb, ra, rb) / k;
    return { f, lo, hi };
}
/** chain: [part, k, op] — op 'u' smooth union (default), 'c' smooth carve, 'm' hard union */
function chain(list) {
    const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (const [q, k = 0, op = 'u'] of list) if (op !== 'c') for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], q.lo[i] - k * 0.25); hi[i] = Math.max(hi[i], q.hi[i] + k * 0.25); }
    const M = 0.2, n = list.length, F = list.map((e) => e[0].f), K = list.map((e) => e[1] || 0), O = list.map((e) => e[2] || 'u');
    const f = (x, y, z) => {
        const dx = Math.max(lo[0] - x, 0, x - hi[0]), dy = Math.max(lo[1] - y, 0, y - hi[1]), dz = Math.max(lo[2] - z, 0, z - hi[2]);
        if (dx > M || dy > M || dz > M) return Math.hypot(dx, dy, dz);
        let d = F[0](x, y, z);
        for (let i = 1; i < n; i++) {
            const e = F[i](x, y, z);
            d = O[i] === 'u' ? smin(d, e, K[i]) : O[i] === 'c' ? smax(d, -e, K[i]) : Math.min(d, e);
        }
        return d;
    };
    return { f, lo, hi };
}

// ---- legs
function legChain(L) {
    const zz = L.z, S = v3(L.s, zz), K = v3(L.k, zz), F = v3(L.f, zz), H = v3(L.h, zz), G = [L.g[0], 0.012, zz];
    const P = [];
    if (L.front) {
        // forearm: thick and muscled at the top, tapering hard into a flat-fronted knee
        P.push([pC(S, [K[0], K[1] + 0.05, zz], 0.092, 0.05)]);
        P.push([pE([S[0] + 0.035, 0.87, zz + 0.005 * Math.sign(zz)], [0.075, 0.17, 0.07]), 0.05]);
        P.push([pE([S[0] - 0.03, 0.92, zz], [0.06, 0.12, 0.06]), 0.04]);
        // knee: a boxy joint with the accessory carpal bone at the back
        P.push([pE([K[0] + 0.005, K[1], zz], [0.052, 0.062, 0.05]), 0.03]);
        P.push([pS([K[0] - 0.045, K[1] + 0.025, zz], 0.026), 0.025]);
    } else {
        // gaskin: the second thigh's muscle above the hock; the Achilles tendon runs to its point
        P.push([pC(S, [K[0], K[1] + 0.06, zz], 0.1, 0.048)]);
        P.push([pE([K[0] + 0.075, 0.79, zz], [0.08, 0.16, 0.066]), 0.05]);
        P.push([pC([K[0] - 0.02, 0.86, zz], [K[0] - 0.052, K[1] + 0.03, zz], 0.035, 0.026), 0.04]);
        // hock: angular joint with a sharp point behind
        P.push([pE([K[0] + 0.01, K[1] - 0.01, zz], [0.055, 0.065, 0.05]), 0.03]);
        P.push([pS([K[0] - 0.05, K[1] + 0.03, zz], 0.03), 0.025]);
    }
    // cannon: slim, flat-sided bone with the tendons standing proud behind it
    const cK = [K[0], K[1] - 0.04, zz], cF = [F[0], F[1] + 0.03, zz];
    P.push([pC(cK, cF, 0.037, 0.034, 2, 1.25, zz), 0.025]);
    P.push([pC([cK[0] - 0.032, cK[1] - 0.02, zz], [cF[0] - 0.04, cF[1] + 0.02, zz], 0.022, 0.024, 2, 1.5, zz), 0.02]);
    // fetlock: a rounded joint, fuller behind (the ergot)
    P.push([pE([F[0] - 0.008, F[1], zz], [0.05, 0.046, 0.044]), 0.025]);
    P.push([pS([F[0] - 0.035, F[1] - 0.015, zz], 0.03), 0.02]);
    // pastern down to the coronet, then the hoof flaring to a flat sole
    P.push([pC(F, H, 0.037, 0.04), 0.02]);
    P.push([pC([H[0] - 0.005, H[1] - 0.005, zz], [G[0] - 0.012, 0.02, zz], 0.044, 0.058), 0.012]);
    return chain(P);
}
const LEG_CH = Object.fromEntries(LEG_NAMES.map((n) => [n, legChain(LEG[n])]));
const TAIL_CH = chain([[pC(TAIL_A, [-0.95, 1.18, 0], 0.062, 0.055)]]);
function tailSDF(x, y, z) { return TAIL_CH.f(x, y, z); }

// ---- head
const HEAD_CH = (() => {
    const P = [
        [pE([1.04, 1.94, 0], [0.11, 0.085, 0.1])],                                  // skull: broad, flat forehead
        [pE([1.02, 1.8, 0.05], [0.125, 0.115, 0.05]), 0.06],                       // cheeks: round flat jowls
        [pE([1.02, 1.8, -0.05], [0.125, 0.115, 0.05]), 0.06],
        [pC([1.07, 1.91, 0], [1.33, 1.58, 0], 0.078, 0.058, 2, 1.15, 0), 0.06],     // nasal bone down to the muzzle
        [pE([1.345, 1.54, 0], [0.08, 0.075, 0.0714]), 0.05],                         // muzzle
        [pE([1.31, 1.465, 0], [0.065, 0.035, 0.05]), 0.03],                          // chin
        [pC([1.42, 1.5, 0], [1.27, 1.485, 0], 0.007, 0.004), 0.012, 'c'],             // mouth line
    ];
    for (const s of [1, -1]) {
        P.push([pE([1.395, 1.565, 0.05 * s], [0.03, 0.036, 0.024]), 0.025]);           // nostril rim
        P.push([pE([1.418, 1.565, 0.052 * s], [0.012, 0.024, 0.014]), 0.01, 'c']);     // nostril opening
        P.push([pE([1.075, 1.94, 0.082 * s], [0.04, 0.022, 0.03]), 0.03]);            // brow ridge
        P.push([pS([EYE[0] + 0.006, EYE[1], (EYE[2] + 0.012) * s], 0.03), 0.012, 'c']); // eye socket
        P.push([pS([EYE[0], EYE[1], EYE[2] * s], 0.026), 0, 'm']);                    // eyeball
        // ears: leaf shaped, thin front to back, cupped forward
        const ear = chain([[pC([0.985, 2.02, 0.055 * s], [0.955, 2.18, 0.075 * s], 0.034, 0.006, 0, 1.7, 0.97)],
            [pE([0.998, 2.1, 0.066 * s], [0.016, 0.06, 0.02]), 0.01, 'c']]);
        P.push([ear, 0.02]);
    }
    return chain(P);
})();
function headSDF(x, y, z) { return HEAD_CH.f(x, y, z); }

// ---- neck and crest
const NECK_CH = chain([
    [pC([0.58, 1.33, 0], [0.98, 1.84, 0], 0.25, 0.1, 2, 1.25, 0)],                 // deep at the base, clean at the throat
    [pC([0.66, 1.2, 0], [0.95, 1.72, 0], 0.1, 0.06, 2, 1.4, 0), 0.1],               // the underside runs straight
    [pE([0.97, 1.69, 0], [0.06, 0.07, 0.2]), 0.05, 'c'],                             // throat-latch
]);
const CREST_CH = chain([[pC([0.4, 1.56, 0], [0.94, 2.0, 0], 0.085, 0.055, 2, 1.15, 0)]]);
function crestSDF(x, y, z) { return CREST_CH.f(x, y, z); }

// ---- torso
const TORSO_CH = (() => {
    const P = [
        [pE([0.0, 1.24, 0], [0.56, 0.3, 0.25])],                                     // barrel
        [pE([0.3, 1.2, 0], [0.28, 0.335, 0.24]), 0.14],                              // girth: deepest behind the elbows
        [pE([-0.5, 1.29, 0], [0.36, 0.26, 0.26]), 0.16],                             // quarters
        [pC([-0.05, 1.47, 0], [0.33, 1.57, 0], 0.06, 0.075), 0.12],                  // withers
        [pC([-0.25, 1.48, 0], [-0.76, 1.43, 0], 0.07, 0.06), 0.12],                  // croup
        [pE([-0.3, 0.76, 0], [0.34, 0.17, 0.5]), 0.1, 'c'],                          // tuck-up toward the flank
    ];
    for (const s of [1, -1]) {
        P.push([pC([0.28, 1.48, 0.1 * s], [0.62, 1.16, 0.15 * s], 0.1, 0.085), 0.09]);   // shoulder blade
        P.push([pS([0.66, 1.15, 0.12 * s], 0.068), 0.07]);                               // point of shoulder
        P.push([pE([0.42, 1.12, 0.14 * s], [0.12, 0.12, 0.08]), 0.07]);                  // triceps
        P.push([pE([0.61, 1.06, 0.065 * s], [0.085, 0.105, 0.065]), 0.06]);                // breast
        P.push([pE([-0.55, 1.24, 0.12 * s], [0.32, 0.27, 0.16]), 0.1]);                  // hindquarter muscle
        P.push([pS([-0.3, 1.44, 0.16 * s], 0.055), 0.1]);                                // point of hip
        P.push([pC([-0.82, 1.32, 0.1 * s], [-0.68, 0.78, 0.12 * s], 0.11, 0.07), 0.09]);  // hamstring
        P.push([pC([-0.5, 1.24, 0.15 * s], [-0.43, 0.97, 0.16 * s], 0.12, 0.08), 0.1]);   // stifle
        P.push([pC([0.22, 1.36, 0.255 * s], [0.31, 1.06, 0.235 * s], 0.016, 0.013), 0.035, 'c']); // groove behind the shoulder
    }
    return chain(P);
})();
/** barrel, shoulders, quarters and neck: what the cloth, saddle and girth wrap onto */
function torsoSDF(x, y, z) { return smin(TORSO_CH.f(x, y, z), NECK_CH.f(x, y, z), 0.12); }

// mane: a run of locks along the crest, falling to the off side, plus a forelock; meshed as its own hair shell.
// Each lock is laid onto the sculpted neck: rooted on the crest, its middle and tip marched in onto the off side.
const MANE_LOCKS = [];
function marchTo(f, p, dir, off) {
    let t = 0;
    for (let i = 0; i < 80; i++) { const d = f(p[0] + dir[0] * t, p[1] + dir[1] * t, p[2] + dir[2] * t); if (d < 1e-4) break; t += d * 0.9; }
    return [p[0] + dir[0] * (t - off), p[1] + dir[1] * (t - off), p[2] + dir[2] * (t - off)];
}
function buildMane() {
    if (MANE_LOCKS.length) return;
    const neck = (x, y, z) => smin(torsoSDF(x, y, z), crestSDF(x, y, z), 0.05);
    const head = (x, y, z) => smin(neck(x, y, z), headSDF(x, y, z), 0.07);
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const N = 22;
    for (let i = 0; i <= N; i++) {
        const t = i / N, cx = 0.93 - t * 0.6;
        const root = marchTo(neck, [cx, 2.5, 0.012], [0, -1, 0], 0.012);
        const len = 0.1 + 0.05 * rnd() + 0.03 * Math.sin(i * 1.7);
        const mid = marchTo(neck, [cx - 0.02, root[1] - len * 0.45, 0.5], [0, 0, -1], -0.013);
        const tip = marchTo(neck, [cx - 0.035 - rnd() * 0.02, root[1] - len, 0.5], [0, 0, -1], -0.006);
        MANE_LOCKS.push({ p: [root, mid, tip], r: [0.03, 0.02, 0.006 + rnd() * 0.006] });
    }
    // forelock: from the poll between the ears, lying down the forehead
    const r0 = [1.0, 2.05, 0.0];
    const m = marchTo(head, [1.4, 2.0, 0.006], [-1, 0, 0], -0.012), t = marchTo(head, [1.4, 1.95, 0.01], [-1, 0, 0], -0.006);
    MANE_LOCKS.push({ p: [r0, m, t], r: [0.034, 0.024, 0.01], fore: true });
}
function maneSDF(x, y, z) {
    if (x < 0.25 || x > 1.2 || y < 1.3) return 1;
    let d = 1e9;
    for (const L of MANE_LOCKS) {
        const [a, b, c] = L.p, [ra, rb, rc] = L.r;
        d = smin(d, smin(roundCone(x, y, z, a, b, ra, rb), roundCone(x, y, z, b, c, rb, rc), 0.01), 0.022);
    }
    return d;
}
function bodySDF(x, y, z) {
    let d = torsoSDF(x, y, z);
    d = smin(d, CREST_CH.f(x, y, z), 0.05);
    d = smin(d, HEAD_CH.f(x, y, z), 0.07);
    for (const n of LEG_NAMES) d = smin(d, LEG_CH[n].f(x, y, z), 0.06);
    d = smin(d, TAIL_CH.f(x, y, z), 0.035);
    return Math.max(d, -y);
}
// the horse's surface: body only (the mane is its own hair shell); horseSDF adds the mane back for occlusion
const horseBody = bodySDF;
function horseSDF(x, y, z) { return Math.min(bodySDF(x, y, z), maneSDF(x, y, z)); }

/** ambient occlusion from the field: how much the surface around a point closes in on it */
function fieldAO(f, x, y, z, nx, ny, nz) {
    let occ = 0, w = 1;
    for (const h of [0.025, 0.06, 0.12, 0.2]) { occ += w * Math.max(0, h - f(x + nx * h, y + ny * h, z + nz * h)); w *= 0.6; }
    return Math.max(0, 1 - occ * 4.2);
}

// ---------------------------------------------------------------- rig
// [name, parent, head (rest), weight segment end]
const BONES = [
    ['root', -1, [-0.55, 0, 0], null],
    ['body', 0, [0.05, 1.2, 0], [0.45, 1.25, 0], [-0.15, 1.25, 0]],
    ['rump', 1, [-0.25, 1.25, 0], [-0.78, 1.22, 0]],
    ['neck', 1, [0.68, 1.5, 0], [0.97, 1.9, 0]],
    ['head', 3, [1.0, 1.94, 0], [1.36, 1.52, 0]],
];
for (const n of LEG_NAMES) {
    const L = LEG[n], par = L.front ? 1 : 2;
    const i = BONES.length;
    BONES.push([n + 'u', par, v3(L.s, L.z), v3(L.k, L.z)]);
    BONES.push([n + 'l', i, v3(L.k, L.z), v3(L.f, L.z)]);
    BONES.push([n + 'f', i + 1, v3(L.f, L.z), [L.g[0], 0.0, L.z]]);
}
BONES.push(['tail1', 2, TAIL_A, TAIL_B]);
BONES.push(['tail2', BONES.length - 1, TAIL_B, TAIL_C]);
const BI = Object.fromEntries(BONES.map((b, i) => [b[0], i]));

let SHARED = null;

// distance-weighted skinning: each vertex takes its four nearest bones (legs only on their own side)
function skinVertex(p, tailOnly, skinIndex, skinWeight, v, cand) {
    const [, y, z] = p;
    cand.length = 0;
    for (let b = 1; b < BONES.length; b++) {
        const [name, , head, end, start] = BONES[b];
        const isTail = name.startsWith('tail');
        if (tailOnly !== isTail && !(tailOnly && name === 'rump')) continue;
        const [d] = segDist(p, start || head, end);
        let w = 1 / Math.pow(Math.max(d, 0.006), 4);
        const leg = LEG[name.slice(0, 2)];
        if (leg && name.length === 3) {
            w *= smoothstep(-0.005, 0.05, z * Math.sign(leg.z));
            if (name[2] === 'u') w *= 1 - smoothstep(leg.front ? 0.9 : 0.86, leg.front ? 1.1 : 1.06, y);
        }
        if (name === 'neck') w *= smoothstep(0.55, 0.75, p[0]);
        cand.push([b, w]);
    }
    cand.sort((a, b) => b[1] - a[1]);
    let sum = 0;
    for (let k = 0; k < 4 && k < cand.length; k++) sum += cand[k][1];
    for (let k = 0; k < 4; k++) {
        skinIndex[v * 4 + k] = k < cand.length ? cand[k][0] : 0;
        skinWeight[v * 4 + k] = k < cand.length ? cand[k][1] / sum : 0;
    }
}

function buildHorseGeometry() {
    const t0 = performance.now();
    buildMane();
    const net = surfaceNets(horseBody, [-1.12, -0.012, -0.37], [1.46, 2.24, 0.37], 0.0125, { band: true });
    const { positions: P, normals: N, indices } = net;
    const n = P.length / 3;
    const t1 = performance.now();
    // aMark: x tail-dock hair, y field AO, z leg index (-1 off the legs)
    const mark = new Float32Array(n * 3);
    const skinIndex = new Uint16Array(n * 4), skinWeight = new Float32Array(n * 4);
    const cand = [];
    for (let v = 0; v < n; v++) {
        const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2], p = [x, y, z];
        const tailD = tailSDF(x, y, z), restD = torsoSDF(x, y, z);
        const tail = x < -0.78 ? 1 - smoothstep(-0.02, 0.025, tailD - restD) : 0;
        let legIdx = -1;
        if (y < 0.75) legIdx = x > 0 ? (z > 0 ? 0 : 1) : (z > 0 ? 2 : 3);
        mark[v * 3] = tail; mark[v * 3 + 1] = fieldAO(horseSDF, x, y, z, N[v * 3], N[v * 3 + 1], N[v * 3 + 2]); mark[v * 3 + 2] = legIdx;
        skinVertex(p, tail > 0.5, skinIndex, skinWeight, v, cand);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    g.setAttribute('aMark', new THREE.BufferAttribute(mark, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
    g.setIndex(new THREE.BufferAttribute(indices, 1));
    g.computeBoundingSphere();
    g.boundingSphere.radius += 0.6;
    const t2 = performance.now();
    // the mane: its own fine shell, skinned like the neck it lies on
    const mn = surfaceNets(maneSDF, [0.25, 1.28, -0.08], [1.2, 2.18, 0.2], 0.0075, { band: true });
    const mm = mn.positions.length / 3, mao = new Float32Array(mm), msi = new Uint16Array(mm * 4), msw = new Float32Array(mm * 4);
    for (let v = 0; v < mm; v++) {
        const x = mn.positions[v * 3], y = mn.positions[v * 3 + 1], z = mn.positions[v * 3 + 2];
        mao[v] = fieldAO(horseSDF, x, y, z, mn.normals[v * 3], mn.normals[v * 3 + 1], mn.normals[v * 3 + 2]);
        skinVertex([x, y, z], false, msi, msw, v, cand);
    }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(mn.positions, 3));
    mg.setAttribute('normal', new THREE.BufferAttribute(mn.normals, 3));
    mg.setAttribute('aAO', new THREE.BufferAttribute(mao, 1));
    mg.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(msi, 4));
    mg.setAttribute('skinWeight', new THREE.BufferAttribute(msw, 4));
    mg.setIndex(new THREE.BufferAttribute(mn.indices, 1));
    console.info(`[derby] horse sculpt: ${n} verts, ${indices.length / 3} tris (+mane ${mm}), ${(performance.now() - t0) | 0} ms (nets ${(t1 - t0) | 0}, marks ${(t2 - t1) | 0})`);
    return { body: g, mane: mg };
}

// ---------------------------------------------------------------- jockey
// The jockey is a list of parts (region, shape, blend). The same list drives the sculpt (smooth union) and, as
// generated GLSL, the per-pixel choice of fabric, so the seams between silks, breeches, boots and skin are crisp
// curves rather than the mesh's staircase.
// regions: 0 silks body, 1 sleeves, 2 breeches, 3 boots, 4 gloves, 5 cap, 6 skin, 7 goggle lens, 8 boot top, 9 rubber
const JP = (() => {
    const P = [];
    const S = (reg, k, c, r) => P.push({ reg, k, t: 'S', c, r });
    const E = (reg, k, c, r) => P.push({ reg, k, t: 'E', c, r });
    const C = (reg, k, a, b, ra, rb) => P.push({ reg, k, t: 'C', a, b, ra, rb });
    const H = (reg, k, c, r, n, o) => P.push({ reg, k, t: 'H', c, r, n, o });
    // trunk: hips in breeches, the silks from the waist up, a broad back over a narrow waist
    E(2, 0.06, [-0.035, 1.8, 0], [0.125, 0.1, 0.125]);
    E(0, 0.05, [0.06, 1.858, 0], [0.105, 0.085, 0.122]);
    C(0, 0.06, [0.06, 1.835, 0], [0.27, 1.915, 0], 0.098, 0.13);
    E(0, 0.06, [0.27, 1.93, 0], [0.165, 0.105, 0.15]);
    E(0, 0.05, [0.37, 1.96, 0], [0.085, 0.07, 0.15]);
    // neck, head and face under the skull cap
    C(6, 0.03, [0.44, 1.965, 0], [0.52, 1.99, 0], 0.046, 0.042);
    C(0, 0.02, [0.4, 1.955, 0], [0.47, 1.975, 0], 0.06, 0.052);                     // silk collar
    E(6, 0.03, [0.545, 2.03, 0], [0.092, 0.098, 0.082]);
    E(6, 0.03, [0.588, 1.995, 0], [0.058, 0.074, 0.06]);                             // face
    E(6, 0.02, [0.613, 2.0, 0.034], [0.028, 0.024, 0.024]);                          // cheekbones
    E(6, 0.02, [0.613, 2.0, -0.034], [0.028, 0.024, 0.024]);
    C(6, 0.01, [0.642, 2.02, 0], [0.66, 2.0, 0], 0.012, 0.0095);                     // nose
    E(6, 0.025, [0.618, 1.952, 0], [0.03, 0.024, 0.036]);                            // jaw and chin
    S(6, 0.01, [0.54, 2.0, 0.082], 0.018); S(6, 0.01, [0.54, 2.0, -0.082], 0.018);   // ears
    H(5, 0.008, [0.55, 2.05, 0], 0.107, [0.29, 0.957, 0], 0.035);
    E(5, 0.01, [0.648, 2.068, 0], [0.058, 0.011, 0.078]);
    E(9, 0.008, [0.632, 2.026, 0], [0.02, 0.026, 0.068]);
    for (const s of [1, -1]) {
        E(7, 0.005, [0.645, 2.026, 0.03 * s], [0.009, 0.018, 0.022]);
        // arms: deltoid, upper arm, forearm, a gloved fist with its thumb over the reins
        S(1, 0.04, [0.37, 1.95, 0.142 * s], 0.058);
        C(1, 0.035, [0.37, 1.95, 0.142 * s], [0.47, 1.81, 0.19 * s], 0.05, 0.04);
        C(1, 0.03, [0.47, 1.81, 0.19 * s], [0.665, 1.835, 0.095 * s], 0.04, 0.031);
        E(4, 0.012, [0.705, 1.845, 0.075 * s], [0.045, 0.035, 0.033]);
        C(4, 0.008, [0.69, 1.868, 0.062 * s], [0.722, 1.874, 0.056 * s], 0.012, 0.01);
        // legs: thigh with its quad, knee, the boot's tan top proud of the shaft, calf, foot
        C(2, 0.05, [0.0, 1.79, 0.09 * s], [0.32, 1.63, 0.2 * s], 0.088, 0.058);
        E(2, 0.04, [0.17, 1.755, 0.15 * s], [0.12, 0.058, 0.06]);
        S(2, 0.03, [0.32, 1.63, 0.2 * s], 0.056);
        C(8, 0.008, [0.305, 1.585, 0.212 * s], [0.278, 1.515, 0.232 * s], 0.057, 0.053);
        C(3, 0.02, [0.3, 1.58, 0.214 * s], [0.17, 1.31, 0.28 * s], 0.05, 0.04);
        E(3, 0.03, [0.2, 1.47, 0.245 * s], [0.042, 0.075, 0.042]);
        S(3, 0.02, [0.17, 1.305, 0.28 * s], 0.041);
        C(3, 0.02, [0.13, 1.29, 0.28 * s], [0.275, 1.272, 0.28 * s], 0.037, 0.029);
    }
    return P;
})();
function jpart(q, x, y, z) {
    switch (q.t) {
        case 'S': return sphere(x, y, z, q.c, q.r);
        case 'E': return ellipsoid(x, y, z, q.c, q.r);
        case 'C': return roundCone(x, y, z, q.a, q.b, q.ra, q.rb);
        default: { const dx = x - q.c[0], dy = y - q.c[1], dz = z - q.c[2]; return Math.max(Math.hypot(dx, dy, dz) - q.r, -(dx * q.n[0] + dy * q.n[1] + dz * q.n[2]) - q.o); }
    }
}
function jockeySDF(x, y, z) {
    let d = 1e9;
    for (const q of JP) {
        let e = jpart(q, x, y, z);
        // silks ripple in the wind: soft creases across the back and sleeves
        if (q.reg <= 1) e += 0.0022 * Math.sin(x * 95 + Math.sin(z * 31) * 1.6) * Math.sin(y * 40 + z * 12);
        d = smin(d, e, q.k);
    }
    return d;
}
const f4 = (v) => (+v).toFixed(4);
const vec = (a) => `vec3(${a.map(f4).join(',')})`;
function jockeyRegionGLSL() {
    const lines = JP.map((q) => {
        const e = q.t === 'S' ? `length(p-${vec(q.c)})-${f4(q.r)}`
            : q.t === 'E' ? `sdE(p-${vec(q.c)},${vec(q.r)})`
                : q.t === 'C' ? `sdRC(p,${vec(q.a)},${vec(q.b)},${f4(q.ra)},${f4(q.rb)})`
                    : `max(length(p-${vec(q.c)})-${f4(q.r)},-dot(p-${vec(q.c)},${vec(q.n)})-${f4(q.o)})`;
        const bias = q.reg === 5 || q.reg === 7 || q.reg === 9 || q.reg === 4 || q.reg === 8 ? '-.003' : '';
        return `d=${e}${bias};if(d<b){b=d;r=${q.reg}.;}`;
    });
    return `float sdE(vec3 p,vec3 r){float k0=length(p/r),k1=length(p/(r*r));return k0*(k0-1.)/max(k1,1e-6);}
float sdRC(vec3 p,vec3 a,vec3 b,float r1,float r2){vec3 ba=b-a;float l2=dot(ba,ba),rr=r1-r2,a2=l2-rr*rr,il2=1./l2;vec3 pa=p-a;
 float y=dot(pa,ba),z=y-l2;vec3 xv=pa*l2-ba*y;float x2=dot(xv,xv),y2=y*y*l2,z2=z*z*l2,k=sign(rr)*rr*rr*x2;
 if(sign(z)*a2*z2>k)return sqrt(x2+z2)*il2-r2;if(sign(y)*a2*y2<k)return sqrt(x2+y2)*il2-r1;return (sqrt(x2*a2*il2)+y*rr)*il2-r1;}
float jReg(vec3 p){float b=1e9,d,r=0.;\n${lines.join('\n')}\nreturn r;}`;
}
function buildJockeyGeometry() {
    const t0 = performance.now();
    const net = surfaceNets(jockeySDF, [-0.2, 1.18, -0.36], [0.8, 2.2, 0.36], 0.0088, { band: true });
    const P = net.positions, Nn = net.normals, n = P.length / 3, ao = new Float32Array(n);
    // fabric per vertex (the same choice the shader makes); triangles that straddle a seam are flagged so only
    // they run the exact per-pixel test
    const reg = new Float32Array(n), seam = new Float32Array(n);
    const BIAS = (r) => (r === 4 || r === 5 || r === 7 || r === 8 || r === 9 ? 0.003 : 0);
    for (let v = 0; v < n; v++) {
        let b = 1e9, r = 0;
        for (const q of JP) { const d = jpart(q, P[v * 3], P[v * 3 + 1], P[v * 3 + 2]) - BIAS(q.reg); if (d < b) { b = d; r = q.reg; } }
        reg[v] = r;
    }
    const I = net.indices;
    for (let t = 0; t < I.length; t += 3) {
        const a = I[t], b = I[t + 1], c = I[t + 2];
        if (reg[a] !== reg[b] || reg[b] !== reg[c]) seam[a] = seam[b] = seam[c] = 1;
    }
    for (let v = 0; v < n; v++) {
        ao[v] = Math.min(fieldAO(jockeySDF, P[v * 3], P[v * 3 + 1], P[v * 3 + 2], Nn[v * 3], Nn[v * 3 + 1], Nn[v * 3 + 2]),
            fieldAO(torsoSDF, P[v * 3], P[v * 3 + 1], P[v * 3 + 2], Nn[v * 3], Nn[v * 3 + 1], Nn[v * 3 + 2]));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(net.normals, 3));
    g.setAttribute('aAO', new THREE.BufferAttribute(ao, 1));
    g.setAttribute('aReg', new THREE.BufferAttribute(reg, 1));
    g.setAttribute('aSeam', new THREE.BufferAttribute(seam, 1));
    g.setIndex(new THREE.BufferAttribute(net.indices, 1));
    g.computeBoundingSphere();
    console.info(`[derby] jockey sculpt: ${n} verts, ${(performance.now() - t0) | 0} ms`);
    return g;
}

// shells shrink-wrapped onto the sculpted barrel: the saddle cloth, the racing saddle and the girth
function buildShellGeometry({ x0, x1, phi, U, V, cy = 1.24, off }) {
    const pos = [], uv = [], nrm = [], idx = [];
    for (let j = 0; j <= V; j++) for (let i = 0; i <= U; i++) {
        const u = i / U, v = j / V, ph = (u - 0.5) * 2 * phi;
        const x = mix(x0, x1, v), dy = Math.cos(ph), dz = Math.sin(ph);
        // march in from outside to the surface
        let t = 0.6;
        for (let it = 0; it < 60; it++) { const d = torsoSDF(x, cy + dy * t, dz * t); if (Math.abs(d) < 1e-4) break; t -= d * 0.9; }
        const e = 0.004, px = x, py = cy + dy * t, pz = dz * t;
        let gx = torsoSDF(px + e, py, pz) - torsoSDF(px - e, py, pz), gy = torsoSDF(px, py + e, pz) - torsoSDF(px, py - e, pz), gz = torsoSDF(px, py, pz + e) - torsoSDF(px, py, pz - e);
        const gl = Math.hypot(gx, gy, gz); gx /= gl; gy /= gl; gz /= gl;
        const o = off(u, v, ph);
        pos.push(px + gx * o, py + gy * o, pz + gz * o); nrm.push(gx, gy, gz); uv.push(u, v);
    }
    for (let j = 0; j < V; j++) for (let i = 0; i < U; i++) {
        const a = j * (U + 1) + i, b = a + 1, c = a + U + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
}
const buildClothGeometry = () => buildShellGeometry({ x0: -0.2, x1: 0.3, phi: 1.92, U: 40, V: 12, off: (u, v, ph) => 0.014 + 0.006 * Math.cos(ph) });
// a tiny racing saddle: a padded seat rising to a pommel over the withers, its flaps lying on the cloth
const buildSaddleGeometry = () => buildShellGeometry({
    x0: -0.06, x1: 0.26, phi: 0.95, U: 28, V: 18,
    off: (u, v) => {
        const across = Math.sin(Math.PI * u), along = Math.sin(Math.PI * v);
        const seat = Math.pow(across, 0.5) * Math.pow(along, 0.45) * (1 - smoothstep(0.55, 0.95, Math.abs(u - 0.5) * 2));
        const pommel = smoothstep(0.7, 0.95, v) * (1 - smoothstep(0.0, 0.18, Math.abs(u - 0.5))) * Math.sin(Math.PI * Math.min(1, (v - 0.7) / 0.3));
        return 0.024 + 0.022 * seat + 0.03 * pommel;
    },
});
const buildGirthGeometry = () => buildShellGeometry({ x0: 0.245, x1: 0.305, phi: 3.05, U: 80, V: 3, off: () => 0.024 });

// tail: crossed strand cards hung from the dock, skinned to the tail bones
function buildTailGeometry() {
    const chain = [TAIL_A, [-0.95, 1.2, 0], TAIL_B, [-1.01, 0.85, 0], TAIL_C, [-0.99, 0.4, 0]];
    const W = [0.06, 0.12, 0.18, 0.24, 0.28, 0.24];
    const pos = [], uv = [], nrm = [], idx = [], si = [], sw = [];
    const cards = 8;
    for (let c = 0; c < cards; c++) {
        const ang = (c / cards) * Math.PI;
        const base = pos.length / 3;
        for (let i = 0; i < chain.length; i++) {
            const p = chain[i], t = i / (chain.length - 1), w = W[i];
            for (const side of [-1, 1]) {
                pos.push(p[0] + Math.sin(ang) * w * side * 0.35, p[1], Math.cos(ang) * w * side);
                nrm.push(Math.sin(ang), 0, Math.cos(ang)); uv.push(side < 0 ? 0 : 1, 1 - t);
                const b1 = BI.tail1, b2 = BI.tail2, k = Math.min(1, Math.max(0, (i - 1) / 1.5));
                si.push(i === 0 ? BI.rump : b1, b2, 0, 0); sw.push(i === 0 ? 0.5 : 1 - k, i === 0 ? 0 : k, 0, 0);
                if (i === 0) { si[si.length - 4] = b1; sw[sw.length - 4] = 1; sw[sw.length - 3] = 0; }
            }
            if (i > 0) { const a0 = base + (i - 1) * 2, a1 = a0 + 2; idx.push(a0, a1, a0 + 1, a0 + 1, a1, a1 + 1); }
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    g.setIndex(idx);
    return g;
}
let hairTex = null;
function hairTexture() {
    if (hairTex) return hairTex;
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 512;
    const g = cv.getContext('2d');
    for (let i = 0; i < 520; i++) {
        const x = 64 + (Math.random() - 0.5) * 120 * Math.sqrt(Math.random());
        const len = 260 + Math.random() * 250, l = 140 + Math.random() * 115;
        g.strokeStyle = `rgba(${l},${l},${l},${0.55 + Math.random() * 0.45})`; g.lineWidth = 0.8 + Math.random() * 1.6;
        g.beginPath(); g.moveTo(64 + (x - 64) * 0.25, 0);
        g.bezierCurveTo(x, len * 0.3, x + (Math.random() - 0.5) * 20, len * 0.7, x + (Math.random() - 0.5) * 30, len); g.stroke();
    }
    hairTex = new THREE.CanvasTexture(cv); hairTex.colorSpace = THREE.SRGBColorSpace;
    return hairTex;
}

function clothTexture(color, number) {
    const W = 1024, H = 320, cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    // the cloth outline: square at the front/back edges, rounded at the hems
    const r = 60;
    g.beginPath();
    g.moveTo(r, 0); g.lineTo(W - r, 0); g.quadraticCurveTo(W, 0, W, r); g.lineTo(W, H - r); g.quadraticCurveTo(W, H, W - r, H);
    g.lineTo(r, H); g.quadraticCurveTo(0, H, 0, H - r); g.lineTo(0, r); g.quadraticCurveTo(0, 0, r, 0); g.closePath();
    g.save(); g.clip();
    const grad = g.createLinearGradient(0, 0, 0, H);
    const c = new THREE.Color(color);
    const dark = c.clone().multiplyScalar(0.62).getStyle(), mid = c.getStyle();
    grad.addColorStop(0, dark); grad.addColorStop(0.5, mid); grad.addColorStop(1, dark);
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    // piping
    g.strokeStyle = 'rgba(255,255,255,0.92)'; g.lineWidth = 10;
    g.strokeRect(22, 22, W - 44, H - 44);
    g.strokeStyle = 'rgba(255,214,120,0.9)'; g.lineWidth = 4;
    g.strokeRect(38, 38, W - 76, H - 76);
    // quilted weave so the cloth reads as fabric up close
    g.globalAlpha = 0.07; g.strokeStyle = '#000'; g.lineWidth = 2;
    for (let i = -H; i < W; i += 26) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + H, H); g.stroke(); g.beginPath(); g.moveTo(i + H, 0); g.lineTo(i, H); g.stroke(); }
    g.globalAlpha = 1;
    // the number on both flanks, upright when seen from that side
    const drawNum = (cx, rot) => {
        g.save(); g.translate(cx, H / 2); g.rotate(rot);
        g.fillStyle = 'rgba(255,255,255,0.96)';
        g.beginPath(); g.arc(0, 0, 104, 0, TAU); g.fill();
        g.lineWidth = 8; g.strokeStyle = dark; g.stroke();
        g.fillStyle = '#10151f';
        g.font = '900 132px "Avenir Next Condensed", "DIN Condensed", "Arial Narrow", Arial, sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(String(number), 0, 8);
        g.restore();
    };
    drawNum(W * 0.2, Math.PI / 2);
    drawNum(W * 0.8, -Math.PI / 2);
    g.restore();
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
}

// ---------------------------------------------------------------- materials
export const COATS = [
    { name: 'bay', coat: '#6a361b', points: '#17110d', hair: '#120d0a', socks: [0, 0, 0, 0], blaze: 0, dapple: 0 },
    { name: 'chestnut', coat: '#7e3615', points: '#8f4520', hair: '#a8582a', socks: [0.3, 0, 0.36, 0], blaze: 1, dapple: 0 },
    { name: 'grey', coat: '#b4b0aa', points: '#6c6863', hair: '#dad6d0', socks: [0, 0, 0, 0], blaze: 0, dapple: 1 },
    { name: 'black', coat: '#1d1714', points: '#1d1714', hair: '#0d0a08', socks: [0, 0.22, 0, 0], blaze: 1, dapple: 0 },
    { name: 'dark bay', coat: '#3e2416', points: '#120c09', hair: '#0f0b08', socks: [0, 0, 0.28, 0.28], blaze: 0, dapple: 0 },
    { name: 'palomino', coat: '#c39556', points: '#b3884c', hair: '#efe3c4', socks: [0.26, 0.26, 0, 0], blaze: 1, dapple: 0 },
];

function horseMaterial(coat) {
    const m = new THREE.MeshPhysicalMaterial({
        color: 0xffffff, roughness: 0.5, metalness: 0, clearcoat: 0.1, clearcoatRoughness: 0.45,
        sheen: 0.55, sheenRoughness: 0.4, sheenColor: new THREE.Color(coat.coat).lerp(new THREE.Color('#ffd9a8'), 0.35), envMapIntensity: 0.9,
    });
    const u = {
        uCoat: { value: new THREE.Color(coat.coat) }, uPoints: { value: new THREE.Color(coat.points) }, uHair: { value: new THREE.Color(coat.hair) },
        uSocks: { value: new THREE.Vector4(...coat.socks) }, uBlaze: { value: coat.blaze }, uDapple: { value: coat.dapple }, uGlow: { value: new THREE.Color(0) },
    };
    m.userData.u = u;
    m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, u);
        sh.vertexShader = sh.vertexShader
            .replace('#include <common>', '#include <common>\nattribute vec3 aMark;varying vec3 vMark;varying vec3 vRest;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMark=aMark;vRest=position;');
        sh.fragmentShader = sh.fragmentShader
            .replace('#include <common>', `#include <common>
uniform vec3 uCoat,uPoints,uHair,uGlow;uniform vec4 uSocks;uniform float uBlaze,uDapple;varying vec3 vMark;varying vec3 vRest;
float hh(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float vn3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(mix(hh(i),hh(i+vec3(1,0,0)),f.x),mix(hh(i+vec3(0,1,0)),hh(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hh(i+vec3(0,0,1)),hh(i+vec3(1,0,1)),f.x),mix(hh(i+vec3(0,1,1)),hh(i+vec3(1,1,1)),f.x),f.y),f.z);}
float segD(vec2 p,vec2 a,vec2 b){vec2 pa=p-a,ba=b-a;float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.);return length(pa-ba*h);}
float hEye,hLid,hNos,hHoof,hBridle;`)
            .replace('#include <color_fragment>', `#include <color_fragment>
{ vec3 p=vRest; vec3 col=uCoat;
  float legM=step(-.5,vMark.z);
  // counter-shading: a lighter belly and flank, the topline a touch deeper; fine coat variation
  col*=mix(1.06,.9,smoothstep(1.05,1.55,p.y));
  col*=.95+.1*vn3(p*7.);
  // dapples (greys): rings of lighter coat
  float dp=vn3(p*13.);col=mix(col,col*mix(.62,1.15,smoothstep(.35,.62,dp)),uDapple*smoothstep(.5,1.3,p.y));
  // points: legs darken below the knee/hock; the muzzle is dark skin under thin hair
  col=mix(col,uPoints,legM*(1.-smoothstep(.36,.6,p.y)));
  float muz=smoothstep(1.3,1.4,p.x)*step(1.4,p.y);
  col=mix(col,col*.45+vec3(.025,.02,.018),muz*.75);
  // socks, with a ragged top edge
  int li=int(vMark.z+.5);
  float sh=li==0?uSocks.x:li==1?uSocks.y:li==2?uSocks.z:uSocks.w;
  float sock=legM*step(.01,sh)*(1.-smoothstep(sh-.012,sh+.012,p.y+.012*sin(atan(p.z,p.x)*9.)+.006*vn3(p*90.)));
  col=mix(col,vec3(.86,.84,.8),sock);
  // blaze: a star widening on the forehead, a stripe down the face, pink where it reaches the muzzle
  float bd=segD(p.xy,vec2(1.07,2.0),vec2(1.4,1.56));
  float bw=mix(.024,.042,smoothstep(1.78,1.93,p.y));
  float blaze=uBlaze*(1.-smoothstep(bw-.006,bw+.006,abs(p.z)+.004*vn3(p*60.)))*step(1.03,p.x)*(1.-smoothstep(.085,.13,bd))*(1.-smoothstep(1.975,1.995,p.y));
  col=mix(col,mix(vec3(.88,.86,.82),vec3(.72,.5,.46),muz),blaze);
  // tail dock hair
  col=mix(col,uHair*(.7+.6*vn3(p*vec3(55.,9.,55.))),vMark.x);
  // hooves: dark horn below the coronet, with growth rings
  float cx=li<2?.52:-.555;
  hHoof=legM*(1.-smoothstep(-.004,.004,p.y-(.068+.3*(p.x-cx))));
  col=mix(col,vec3(.075,.068,.06)*(.85+.3*sin(p.y*260.)),hHoof);
  // bridle: noseband, headpiece and cheek straps
  hBridle=0.;
  if(p.x>.93&&p.y>1.45){vec2 hd=vec2(.649,-.761);
    hBridle=max(hBridle,1.-smoothstep(.013,.017,abs(dot(p.xy-vec2(1.22,1.67),hd))));
    hBridle=max(hBridle,(1.-smoothstep(.012,.016,abs(dot(p.xy-vec2(.975,1.965),hd))))*step(1.78,p.y));
    hBridle=max(hBridle,(1.-smoothstep(.011,.015,segD(p.xy,vec2(.985,1.96),vec2(1.2,1.69))))*smoothstep(.05,.07,abs(p.z)));
    // browband across the forehead below the ears
    hBridle=max(hBridle,(1.-smoothstep(.009,.013,abs(p.y-2.0+(p.x-1.0)*.4)))*step(.985,p.x)*step(p.x,1.06));}
  // eye: wet dark eyeball, a darker lid ring round it
  float eD=length(vec3(p.x-${EYE[0]},p.y-${EYE[1]},abs(p.z)-${EYE[2]}));
  hEye=1.-smoothstep(.0262,.0282,eD);
  hLid=(1.-smoothstep(.028,.036,eD))*(1.-hEye);
  hBridle*=1.-hLid-hEye;
  col=mix(col,vec3(.06,.038,.025),hBridle);
  col=mix(col,col*.35,hLid);
  col=mix(col,vec3(.03,.018,.012),hEye);
  // nostril openings
  float nD=length(vec3((p.x-1.418)/.6,p.y-1.565,abs(p.z)-.052));
  hNos=1.-smoothstep(.016,.024,nD);
  col=mix(col,vec3(.03,.012,.01),hNos);
  // creases and the undersides close in on themselves
  col*=mix(.36,1.,vMark.y);
  diffuseColor.rgb=col; }`)
            .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor=mix(roughnessFactor,.72,vMark.x);roughnessFactor=mix(1.,roughnessFactor,vMark.y*.6+.4);roughnessFactor=mix(roughnessFactor,.32,hHoof);roughnessFactor=mix(roughnessFactor,.05,hEye);roughnessFactor=mix(roughnessFactor,.5,hBridle);`)
            .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance+=uGlow;');
    };
    m.customProgramCacheKey = () => 'horse2';
    return m;
}
function maneMaterial(coat) {
    const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.55, sheen: 0.6, sheenRoughness: 0.3, sheenColor: new THREE.Color(coat.hair).lerp(new THREE.Color('#ffffff'), 0.4), envMapIntensity: 0.7 });
    const u = { uHair: { value: new THREE.Color(coat.hair) } };
    m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, u);
        sh.vertexShader = sh.vertexShader
            .replace('#include <common>', '#include <common>\nattribute float aAO;varying float vAO;varying vec3 vRest;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAO=aAO;vRest=position;');
        sh.fragmentShader = sh.fragmentShader
            .replace('#include <common>', `#include <common>
uniform vec3 uHair;varying float vAO;varying vec3 vRest;
float mh(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float mn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mh(i),mh(i+vec2(1,0)),f.x),mix(mh(i+vec2(0,1)),mh(i+vec2(1,1)),f.x),f.y);}`)
            .replace('#include <color_fragment>', `#include <color_fragment>
{ // strands run down the lock: noise stretched along y, fine across the crest
  vec2 q=vec2(vRest.x*240.+vRest.z*90.,vRest.y*14.);
  float str=.55+.45*mn(q)*mn(q*vec2(2.3,1.7)+5.);
  diffuseColor.rgb=uHair*str*mix(.35,1.,vAO)*1.25; }`);
    };
    m.customProgramCacheKey = () => 'mane';
    return m;
}

export const SILKS = ['hoops', 'sash', 'diamonds', 'quartered', 'stars', 'chevrons', 'braces', 'spots'];
let JREG = null;
function jockeyMaterial(primary, secondary, pattern) {
    JREG = JREG || jockeyRegionGLSL();
    const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.36, sheen: 1, sheenRoughness: 0.32, sheenColor: new THREE.Color('#ffffff'), envMapIntensity: 1.0 });
    const u = { uP: { value: new THREE.Color(primary) }, uS: { value: new THREE.Color(secondary) }, uPat: { value: pattern } };
    m.userData.u = u;
    m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, u);
        sh.vertexShader = sh.vertexShader
            .replace('#include <common>', '#include <common>\nattribute float aAO;attribute float aReg;attribute float aSeam;varying float vAO;varying float vReg;varying float vSeam;varying vec3 vRest;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAO=aAO;vReg=aReg;vSeam=aSeam;vRest=position;');
        sh.fragmentShader = sh.fragmentShader
            .replace('#include <common>', `#include <common>\nuniform vec3 uP,uS;uniform float uPat;varying float vAO;varying float vReg;varying float vSeam;varying vec3 vRest;float jR;\n${JREG}`)
            .replace('#include <color_fragment>', `#include <color_fragment>
{ vec3 p=vRest;float r=vSeam>.001?jReg(p):floor(vReg+.5);jR=r;float m=0.;int pat=int(uPat+.5);
  if(pat==0)m=step(.5,fract(p.x*9.));
  else if(pat==1)m=1.-step(.07,abs(fract((p.x-p.z*1.3+p.y*.4)*1.6)-.5));
  else if(pat==2){vec2 q=abs(fract(vec2(p.x*7.,p.z*7.+p.y*3.))-.5);m=step(q.x+q.y,.3);}
  else if(pat==3)m=step(0.,(p.x-.24)*p.z);
  else if(pat==4){vec2 q=fract(vec2(p.x*8.,(p.z+p.y)*8.))-.5;float a=atan(q.y,q.x),rr=length(q);m=step(rr,.18+.08*cos(a*5.));}
  else if(pat==5)m=step(.5,fract(p.x*6.+abs(p.z)*6.));
  else if(pat==6)m=1.-step(.06,abs(abs(p.z)-.085));
  else m=step(length(fract(vec2(p.x*8.,(p.z+p.y)*8.))-.5),.2);
  vec3 col=mix(uP,uS,m);
  if(r==1.)col=pat==3||pat==6?uS:mix(uP,uS,step(.5,fract(length(p.xz-vec2(.37,0.))*14.)));
  if(r==2.)col=vec3(.93,.91,.87);
  if(r==3.)col=vec3(.025);
  if(r==8.)col=vec3(.46,.29,.15);
  if(r==4.)col=vec3(.92);
  if(r==5.)col=mix(uS,uP,step(.5,fract(atan(p.z,p.x-.55)*1.273+.25)));
  if(r==6.)col=mix(vec3(.8,.58,.46),vec3(.82,.5,.42),smoothstep(.6,.64,p.x)*.6);
  if(r==7.)col=vec3(.04,.05,.06);
  if(r==9.)col=vec3(.03);
  diffuseColor.rgb=col*mix(.4,1.,vAO); }`)
            .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nif(jR==3.)roughnessFactor=.22;if(jR==7.)roughnessFactor=.04;if(jR==2.||jR==9.)roughnessFactor=.7;if(jR==6.)roughnessFactor=.55;if(jR==8.)roughnessFactor=.5;if(jR==5.)roughnessFactor=.25;')
            .replace('#include <lights_fragment_begin>', '{float jr=jR;if(jr==2.||jr==3.||jr==6.||jr==7.||jr==8.||jr==9.)material.sheenColor=vec3(0.);}\n#include <lights_fragment_begin>');
    };
    m.customProgramCacheKey = () => 'jockey2';
    return m;
}

let shadowTex = null;
function contactShadowTexture() {
    if (shadowTex) return shadowTex;
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const g = cv.getContext('2d'), gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    shadowTex = new THREE.CanvasTexture(cv);
    return shadowTex;
}

// hard-surface tack, shared by every runner (primitives are right here: metal and leather straps)
function buildTack() {
    const leather = new THREE.MeshPhysicalMaterial({ color: '#2a170d', roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.4, envMapIntensity: 0.9 });
    const girth = new THREE.MeshStandardMaterial({ color: '#ece6da', roughness: 0.7, envMapIntensity: 0.8 });
    const steel = new THREE.MeshStandardMaterial({ color: '#d8d8d4', roughness: 0.22, metalness: 1, envMapIntensity: 1.2 });
    const black = new THREE.MeshStandardMaterial({ color: '#0c0c0e', roughness: 0.45 });
    // whip: a tapering shaft with a flat cushioned popper, held in the right hand and laid back along the arm
    const a = new THREE.Vector3(0.712, 1.83, 0.085), b = new THREE.Vector3(0.36, 1.36, 0.31);
    const shaft = new THREE.CylinderGeometry(0.0045, 0.008, 1, 6).translate(0, 0.5, 0);
    const popper = new THREE.BoxGeometry(0.03, 0.06, 0.006).translate(0, 1.02, 0);
    const whip = mergeGeo([shaft, popper]);
    const dir = b.clone().sub(a), len = dir.length();
    whip.scale(1, len, 1);
    whip.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
    whip.translate(a.x, a.y, a.z);
    // stirrup iron: a stirrup arch with a tread, the foot resting on the tread
    const iron = mergeGeo([
        new THREE.TorusGeometry(0.048, 0.0055, 6, 20, Math.PI).rotateY(Math.PI / 2).translate(0, -0.0, 0),
        new THREE.BoxGeometry(0.03, 0.007, 0.096).translate(0, 0.0, 0),
    ]);
    iron.rotateX(Math.PI).translate(0, 0.045, 0).rotateY(Math.PI / 2);
    const ring = new THREE.TorusGeometry(0.022, 0.004, 6, 16);
    const strap = new THREE.BoxGeometry(0.022, 0.004, 1).translate(0, 0, 0.5);
    return { leather, girth, steel, black, whip, iron, ring, strap };
}
function mergeGeo(list) {
    // tiny local merge (positions + normals) so horse.js stays free of the addons import
    let n = 0, ni = 0;
    for (const g of list) { n += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), idx = new Uint32Array(ni);
    let o = 0, oi = 0;
    for (const g of list) {
        pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
        const c = g.attributes.position.count;
        if (g.index) for (let i = 0; i < g.index.count; i++) idx[oi++] = g.index.array[i] + o; else for (let i = 0; i < c; i++) idx[oi++] = i + o;
        o += c;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    return g;
}

export function prepareHorses() {
    if (!SHARED) {
        const h = buildHorseGeometry();
        SHARED = { horse: h.body, mane: h.mane, jockey: buildJockeyGeometry(), cloth: buildClothGeometry(), saddle: buildSaddleGeometry(), girth: buildGirthGeometry(), tail: buildTailGeometry(), tack: buildTack() };
    }
    return SHARED;
}

// The sculpts take a few seconds to mesh, so the result is kept in IndexedDB under a hash of this module's and
// sdf.js's source: any edit to the sculpt rebuilds it, every other load is instant. Anything failing → build.
const SCULPTED = ['horse', 'mane', 'jockey'];
function hashText(t) { let h = 0x811c9dc5; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); }
function idb(mode, fn) {
    return new Promise((res, rej) => {
        const open = indexedDB.open('derby-sculpt', 1);
        open.onupgradeneeded = () => open.result.createObjectStore('g');
        open.onerror = () => rej(open.error);
        open.onsuccess = () => {
            const tx = open.result.transaction('g', mode), req = fn(tx.objectStore('g'));
            tx.oncomplete = () => { open.result.close(); res(req && req.result); };
            tx.onerror = tx.onabort = () => { open.result.close(); rej(tx.error); };
        };
    });
}
const pack = (g) => ({ attrs: Object.fromEntries(Object.entries(g.attributes).map(([k, a]) => [k, { array: a.array, size: a.itemSize }])), index: g.index.array });
function unpack(r) {
    const g = new THREE.BufferGeometry();
    for (const [k, a] of Object.entries(r.attrs)) g.setAttribute(k, new THREE.BufferAttribute(a.array, a.size));
    g.setIndex(new THREE.BufferAttribute(r.index, 1));
    g.computeBoundingSphere();
    return g;
}
export async function prepareHorsesAsync() {
    if (SHARED) return SHARED;
    let key = null;
    try {
        const [a, b] = await Promise.all([import.meta.url, new URL('./sdf.js', import.meta.url).href].map((u) => fetch(u, { cache: 'no-cache' }).then((r) => r.text())));
        key = 'v1-' + hashText(a + '\n' + b);
        const rec = await idb('readonly', (st) => st.get(key));
        if (rec) {
            const t0 = performance.now();
            const geo = Object.fromEntries(SCULPTED.map((k) => [k, unpack(rec[k])]));
            geo.horse.boundingSphere.radius += 0.6;
            SHARED = { ...geo, cloth: buildClothGeometry(), saddle: buildSaddleGeometry(), girth: buildGirthGeometry(), tail: buildTailGeometry(), tack: buildTack() };
            console.info(`[derby] horse sculpt from cache, ${(performance.now() - t0) | 0} ms`);
            return SHARED;
        }
    } catch (e) { console.warn('[derby] sculpt cache unavailable', e && e.message); key = null; }
    prepareHorses();
    if (key) {
        try {
            const rec = Object.fromEntries(SCULPTED.map((k) => [k, pack(SHARED[k])]));
            await idb('readwrite', (st) => { st.clear(); return st.put(rec, key); });
        } catch (e) { console.warn('[derby] sculpt cache write failed', e && e.message); }
    }
    return SHARED;
}

// ---------------------------------------------------------------- gait
const ease = (t) => t * t * (3 - 2 * t);
// transverse gallop, right lead: footfall phase per leg
const GALLOP_OFF = { HL: 0.0, HR: 0.11, FL: 0.4, FR: 0.52 };
function gallopLeg(t, front) {
    const stance = front ? 0.36 : 0.38;
    let u, up, lo, ft;
    if (t < stance) {
        u = t / stance;
        up = front ? mix(0.48, -0.55, u) : mix(0.38, -0.62, u);
        lo = front ? -0.05 : 0.05;
        ft = 0.25 * Math.sin(Math.PI * u);
    } else {
        u = (t - stance) / (1 - stance);
        const e = ease(u);
        up = front ? mix(-0.55, 0.48, e) + 0.12 * Math.sin(Math.PI * u) : mix(-0.62, 0.38, e) - 0.05 * Math.sin(Math.PI * u);
        const flex = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.75)), 1.3);
        lo = front ? -1.85 * flex : 1.35 * flex;
        ft = -0.95 * flex;
    }
    return [up, lo, ft];
}

const _q = new THREE.Quaternion(), _e = new THREE.Euler();
const setRot = (b, x, y, z) => { _e.set(x, y, z, 'XYZ'); b.quaternion.setFromEuler(_e); };

let runnerSeq = 0;
export class Runner {
    constructor({ color, number, coatIndex, silkIndex, secondary }) {
        const S = prepareHorses();
        this.id = runnerSeq++;
        this.group = new THREE.Group();
        this.color = new THREE.Color(color);
        // rig
        const bones = BONES.map(([name, parent, head]) => { const b = new THREE.Bone(); b.name = name; b.userData.head = head; return b; });
        BONES.forEach(([, parent, head], i) => {
            const b = bones[i];
            if (parent < 0) b.position.set(...head);
            else { const ph = BONES[parent][2]; b.position.set(head[0] - ph[0], head[1] - ph[1], head[2] - ph[2]); bones[parent].add(b); }
        });
        this.bones = bones; this.b = Object.fromEntries(bones.map((b) => [b.name, b]));
        this.restPos = bones.map((b) => b.position.clone());
        this.coat = COATS[coatIndex % COATS.length];
        this.mat = horseMaterial(this.coat);
        const mesh = new THREE.SkinnedMesh(S.horse, this.mat);
        mesh.castShadow = true; mesh.receiveShadow = true;
        mesh.add(bones[0]);
        mesh.updateMatrixWorld(true);
        const skeleton = new THREE.Skeleton(bones);
        mesh.bind(skeleton);
        mesh.frustumCulled = false;
        this.mesh = mesh;
        this.tailMat = new THREE.MeshStandardMaterial({ map: hairTexture(), color: new THREE.Color(this.coat.hair).multiplyScalar(1.6), alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.62, envMapIntensity: 0.7 });
        this.maneMat = maneMaterial(this.coat);
        const mane = new THREE.SkinnedMesh(S.mane, this.maneMat);
        mane.bind(skeleton, mesh.bindMatrix);
        mane.castShadow = true; mane.receiveShadow = true; mane.frustumCulled = false;
        mesh.add(mane);
        const tail = new THREE.SkinnedMesh(S.tail, this.tailMat);
        tail.bind(skeleton, mesh.bindMatrix);
        tail.castShadow = true; tail.frustumCulled = false;
        mesh.add(tail);
        this.group.add(mesh);
        // jockey + cloth ride on the body bone; their geometry is in the horse's rest space
        const bh = BONES[BI.body][2];
        const rider = new THREE.Group(); rider.position.set(-bh[0], -bh[1], -bh[2]);
        this.b.body.add(rider);
        this.jockeyPivot = new THREE.Group(); this.jockeyPivot.position.set(0.05, 1.68, 0);
        rider.add(this.jockeyPivot);
        this.jockeyMat = jockeyMaterial(color, secondary, silkIndex % SILKS.length);
        const jockey = new THREE.Mesh(S.jockey, this.jockeyMat);
        jockey.position.set(-0.05, -1.68, 0);
        jockey.castShadow = true; jockey.receiveShadow = true;
        this.jockeyPivot.add(jockey);
        this.clothTex = clothTexture(color, number);
        const cloth = new THREE.Mesh(S.cloth, new THREE.MeshStandardMaterial({ map: this.clothTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.62, envMapIntensity: 0.8 }));
        cloth.castShadow = true; cloth.receiveShadow = true;
        rider.add(cloth);
        this.cloth = cloth;
        const saddle = new THREE.Mesh(S.saddle, S.tack.leather); saddle.castShadow = true; saddle.receiveShadow = true; rider.add(saddle);
        const girth = new THREE.Mesh(S.girth, S.tack.girth); girth.receiveShadow = true; rider.add(girth);
        // whip in the off hand, laid back along the shoulder; stirrup irons under the feet
        jockey.add(new THREE.Mesh(S.tack.whip, S.tack.black));
        for (const sgn of [1, -1]) {
            const iron = new THREE.Mesh(S.tack.iron, S.tack.steel);
            iron.position.set(0.215, 1.245, 0.28 * sgn); iron.castShadow = true; jockey.add(iron);
        }
        // bit rings either side of the mouth
        const hd0 = BONES[BI.head][2];
        for (const sgn of [1, -1]) {
            const ring = new THREE.Mesh(S.tack.ring, S.tack.steel);
            ring.position.set(1.285 - hd0[0], 1.492 - hd0[1], 0.064 * sgn - hd0[2]); this.b.head.add(ring);
        }
        // reins: hands → along the neck → bit; each segment is a strap stretched between two anchors each frame
        const hd = BONES[BI.head][2];
        const anchor = (parent, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o; };
        const reinMat = new THREE.MeshStandardMaterial({ color: '#1a120c', roughness: 0.6 });
        const reinGeo = new THREE.CylinderGeometry(0.007, 0.007, 1, 5, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2);
        this.reins = [];
        for (const s of [1, -1]) {
            const hand = anchor(this.jockeyPivot, 0.715 - 0.05, 1.84 - 1.68, 0.07 * s);
            const nk = BONES[BI.neck][2];
            const m1 = anchor(this.b.neck, 0.82 - nk[0], 1.83 - nk[1], 0.11 * s);
            const m2 = anchor(this.b.head, 1.0 - hd[0], 1.7 - hd[1], 0.1 * s);
            const bit = anchor(this.b.head, 1.285 - hd[0], 1.492 - hd[1], 0.064 * s);
            for (const [a, b] of [[hand, m1], [m1, m2], [m2, bit]]) {
                const m = new THREE.Mesh(reinGeo, reinMat); m.userData.hand = a; m.userData.bit = b; m.castShadow = false;
                this.group.add(m); this.reins.push(m);
            }
        }
        // stirrup leathers: from the saddle's bars down to the irons under the jockey's feet
        this.leathers = [1, -1].map((s) => {
            const m = new THREE.Mesh(S.tack.strap, S.tack.leather);
            m.userData.hand = new THREE.Object3D(); m.userData.hand.position.set(0.215 - 0.05, 1.29 - 1.68, 0.28 * s); this.jockeyPivot.add(m.userData.hand);
            m.userData.bit = new THREE.Object3D(); m.userData.bit.position.set(0.12, 1.53, 0.2 * s); rider.add(m.userData.bit);
            this.group.add(m); return m;
        });
        // grounding blob
        const blob = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.35).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: contactShadowTexture(), transparent: true, depthWrite: false, opacity: 0.85 }));
        blob.position.y = 0.025; blob.renderOrder = 1;
        this.group.add(blob); this.blob = blob;
        // motion state
        this.x = 0; this.targetX = 0; this.vx = 0; this.phase = Math.random(); this.blend = 0;
        this.mode = 'idle'; this.modeT = 0; this.rewindFrom = 0;
        this.idleSeed = Math.random() * 100; this.stamp = { t: -1, leg: 'FR' }; this.toss = -1;
        this.celebrate = 0; this.glow = 0; this.highlight = 0;
        this.footPrev = {}; this.onStride = null;
        this.time = 0;
    }

    setPlace(x, z, snap) {
        this.z = z; this.group.position.z = z;
        this.targetX = x;
        if (snap) { this.x = x; this.vx = 0; this.mode = 'idle'; }
    }

    /** a backwards move: rear, then rewind to the new mark */
    knock() { this.mode = 'rear'; this.modeT = 0; }

    update(dt) {
        this.time += dt;
        const t = this.time;
        // ----- locomotion
        let dx = this.targetX - this.x;
        if (this.mode === 'rear') {
            this.modeT += dt; this.vx *= Math.exp(-dt * 8);
            if (this.modeT > 0.95) { this.mode = 'rewind'; this.modeT = 0; }
        } else if (this.mode === 'rewind') {
            this.modeT += dt;
            const sp = -Math.min(22, 4 + Math.abs(dx) * 3.2);
            this.vx = mix(this.vx, sp, 1 - Math.exp(-dt * 6));
            if (dx > -0.05) { this.x = this.targetX; this.vx = 0; this.mode = 'idle'; }
        } else if (dx < -0.3) {
            this.knock();
        } else {
            const maxV = 16.5;
            const want = dx > 0.02 ? Math.min(maxV, Math.sqrt(2 * 7.5 * Math.max(0, dx))) : 0;
            const acc = want > this.vx ? 9 : 14;
            this.vx += clamp(want - this.vx, -acc * dt, acc * dt);
            this.mode = this.vx > 0.4 ? 'run' : 'idle';
        }
        this.x += this.vx * dt;
        if (this.mode !== 'rewind' && this.x > this.targetX && this.vx >= 0 && dx < 0.3) { this.x = Math.min(this.x, this.targetX + 0.0); }
        this.group.position.x = this.x;
        const sp = Math.abs(this.vx);
        const targetBlend = this.mode === 'rear' ? 0 : smoothstep(0.6, 7, sp);
        this.blend = mix(this.blend, targetBlend, 1 - Math.exp(-dt * 7));
        const strideRate = this.mode === 'rewind' ? -sp / 5.2 : Math.max(sp / 6.2, 1.6 * this.blend);
        this.phase = (this.phase + strideRate * dt + 10) % 1;
        this.pose(dt, t);
        // reins
        for (const r of this.reins.concat(this.leathers)) {
            const a = r.userData.hand.getWorldPosition(_va), b = r.userData.bit.getWorldPosition(_vb);
            this.group.worldToLocal(a); this.group.worldToLocal(b);
            r.position.copy(a); r.scale.set(1, 1, a.distanceTo(b)); r.lookAt(_vc.copy(b).applyMatrix4(this.group.matrixWorld));
        }
        this.mat.userData.u.uGlow.value.copy(this.color).multiplyScalar(0.035 * this.highlight);
    }

    pose(dt, t) {
        const B = this.b, w = this.blend, ph = this.phase;
        this.bones.forEach((b, i) => { b.position.copy(this.restPos[i]); b.quaternion.identity(); });
        // idle life: breathing, weight shifts, head nods, tail swish, an occasional stamp or head toss
        const s = this.idleSeed, iw = 1 - w;
        const breath = Math.sin(t * 1.7 + s) * 0.006;
        let neckX = 0, neckZ = (Math.sin(t * 0.37 + s) * 0.06 + Math.sin(t * 0.91 + s * 2) * 0.03) * iw, headZ = Math.sin(t * 0.53 + s) * 0.05 * iw, neckY = Math.sin(t * 0.21 + s) * 0.12 * iw;
        let tail1z = (-0.12 + Math.sin(t * 1.3 + s) * 0.06) * iw, tail1y = Math.sin(t * 0.8 + s) * 0.35 * iw, tail2z = 0;
        let bodyZ = 0, bodyY = breath, rootZ = 0;
        const legs = {};
        for (const n of LEG_NAMES) legs[n] = [0, 0, 0];
        if (iw > 0.01) {
            const st = (t + s * 7) % 9;
            if (st < 0.9) { const k = Math.sin(Math.PI * st / 0.9) * iw; const n = s % 2 > 1 ? 'FR' : 'FL'; legs[n] = [0.35 * k, -1.2 * k, -0.6 * k]; }
            const toss = (t + s * 3) % 13;
            if (toss < 1.2) { const k = Math.sin(Math.PI * toss / 1.2) * iw; neckZ += 0.32 * k; headZ -= 0.25 * k; }
            const shift = Math.sin(t * 0.3 + s) * 0.04 * iw;
            legs.HR[0] += shift; legs.HL[0] -= shift; legs.HR[1] -= Math.max(0, shift) * 3; legs.HR[2] -= Math.max(0, shift) * 2;
        }
        if (w > 0.01) {
            for (const n of LEG_NAMES) {
                const g = gallopLeg((ph + GALLOP_OFF[n]) % 1, LEG[n].front);
                legs[n] = [mix(legs[n][0], g[0], w), mix(legs[n][1], g[1], w), mix(legs[n][2], g[2], w)];
            }
            const c = Math.cos(TAU * ph), sn = Math.sin(TAU * ph);
            bodyZ += 0.075 * c * w;
            bodyY += (0.07 * Math.sin(TAU * (ph - 0.15)) + 0.03) * w;
            neckZ += (-0.16 - 0.14 * c) * w;
            headZ += (0.12 * c + 0.18) * w;
            tail1z += (-1.0 + 0.08 * sn) * w; tail2z += (-0.25 + 0.15 * Math.sin(TAU * ph * 2)) * w;
            tail1y += Math.sin(TAU * ph) * 0.08 * w;
        }
        // rear: pitch the whole horse up round its hind feet, fold the forelegs, fling the head
        if (this.mode === 'rear') {
            const k = Math.sin(Math.PI * clamp(this.modeT / 0.95, 0, 1));
            const e = Math.pow(k, 0.8);
            rootZ = 0.62 * e;
            for (const n of ['FR', 'FL']) legs[n] = [mix(legs[n][0], 1.0 + (n === 'FL' ? 0.25 : 0) * Math.sin(t * 14), e), mix(legs[n][1], -1.9, e), mix(legs[n][2], -0.8, e)];
            for (const n of ['HR', 'HL']) legs[n][0] = mix(legs[n][0], -0.5, e);
            neckZ += 0.35 * e; headZ -= 0.3 * e; bodyZ -= 0.12 * e; tail1z -= 0.4 * e;
        }
        // celebration: a proud prance and head toss
        if (this.celebrate > 0) {
            const k = this.celebrate * iw;
            const pr = Math.max(0, Math.sin(t * 3.2));
            rootZ += 0.18 * pr * pr * k;
            for (const n of ['FR', 'FL']) { const kk = Math.max(0, Math.sin(t * 3.2 + (n === 'FL' ? 1.2 : 0))) * k; legs[n] = [legs[n][0] + 0.7 * kk, legs[n][1] - 1.5 * kk, legs[n][2] - 0.6 * kk]; }
            neckZ += 0.2 * Math.sin(t * 2.4) * k;
        }
        B.root.rotation.z = rootZ;
        B.body.position.y += bodyY; B.body.rotation.z = bodyZ;
        B.rump.rotation.z = -bodyZ * 0.35;
        setRot(B.neck, neckX, neckY * 0.5, neckZ);
        setRot(B.head, 0, neckY * 0.4, headZ);
        for (const n of LEG_NAMES) {
            const [u, l, f] = legs[n];
            // forelegs hang from the body bone: cancel its pitch so the swing is in world terms
            B[n + 'u'].rotation.z = u - (LEG[n].front ? bodyZ : -bodyZ * 0.35 + bodyZ) * 0.5;
            B[n + 'l'].rotation.z = l; B[n + 'f'].rotation.z = f;
        }
        setRot(B.tail1, 0, tail1y, tail1z); setRot(B.tail2, 0, tail1y * 0.6, tail2z);
        // jockey: stays level while the horse rocks beneath him, crouches lower at the gallop
        this.jockeyPivot.rotation.z = -bodyZ * 0.75 - 0.04 * w;
        this.jockeyPivot.position.y = 1.68 - bodyY * 0.55 - 0.03 * w + (this.mode === 'rear' ? 0.05 : 0);
        this.jockeyPivot.position.x = 0.05 + 0.03 * Math.sin(TAU * ph) * w;
        // footfall callbacks for turf kick
        if (this.onStride && w > 0.4) {
            for (const n of LEG_NAMES) {
                const tt = (ph + GALLOP_OFF[n]) % 1, down = tt < 0.08;
                if (down && !this.footPrev[n]) this.onStride(this, n);
                this.footPrev[n] = down;
            }
        }
    }

    footWorld(n, out) { return this.b[n + 'f'].getWorldPosition(out); }

    dispose() {
        this.clothTex.dispose(); this.mat.dispose(); this.tailMat.dispose(); this.maneMat.dispose(); this.jockeyMat.dispose(); this.cloth.material.dispose();
        this.reins[0].geometry.dispose(); this.reins[0].material.dispose();
        this.blob.geometry.dispose(); this.blob.material.dispose();
    }
}
const _va = new THREE.Vector3(), _vb = new THREE.Vector3(), _vc = new THREE.Vector3();
