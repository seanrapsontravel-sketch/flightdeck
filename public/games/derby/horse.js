// Racehorse + jockey. One sculpted, skinned horse mesh is built at load (signed-distance sculpt → surface nets →
// distance-weighted skin over a 19-bone rig) and shared by every runner; each runner gets its own skeleton, coat,
// silks, saddle cloth and a procedural gait (transverse gallop, rear, rewind, idle).
import * as THREE from 'three';
import { clamp, ellipsoid, mix, roundCone, segDist, smin, smoothstep, sphere, surfaceNets } from './sdf.js';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------- anatomy (metres, +x forward, +y up, +z right)
const LEG = {
    FR: { s: [0.46, 1.04], k: [0.47, 0.56], f: [0.47, 0.18], h: [0.505, 0.075], g: [0.52, 0.0], z: 0.15, front: true },
    FL: { s: [0.46, 1.04], k: [0.47, 0.56], f: [0.47, 0.18], h: [0.505, 0.075], g: [0.52, 0.0], z: -0.15, front: true },
    HR: { s: [-0.46, 0.98], k: [-0.66, 0.58], f: [-0.6, 0.18], h: [-0.565, 0.075], g: [-0.55, 0.0], z: 0.16, front: false },
    HL: { s: [-0.46, 0.98], k: [-0.66, 0.58], f: [-0.6, 0.18], h: [-0.565, 0.075], g: [-0.55, 0.0], z: -0.16, front: false },
};
const LEG_NAMES = ['FR', 'FL', 'HR', 'HL'];
const v3 = (p, z = 0) => [p[0], p[1], z];
const TAIL_A = [-0.84, 1.42, 0], TAIL_B = [-0.98, 1.1, 0], TAIL_C = [-1.02, 0.6, 0];
const NECK_A = [0.5, 1.3, 0], NECK_B = [0.97, 1.9, 0];
const HEAD_A = [1.0, 1.94, 0], HEAD_B = [1.35, 1.53, 0];

function legSDF(x, y, z, L) {
    const S = v3(L.s, L.z), K = v3(L.k, L.z), F = v3(L.f, L.z), H = v3(L.h, L.z), G = [L.g[0], 0.012, L.z];
    let d = L.front ? roundCone(x, y, z, S, K, 0.105, 0.058) : roundCone(x, y, z, S, K, 0.12, 0.06);
    // the forearm's muscle sits forward and high; the gaskin's behind
    if (L.front) d = smin(d, ellipsoid(x, y, z, [S[0] + 0.03, 0.86, L.z], [0.085, 0.16, 0.075]), 0.05);
    else d = smin(d, ellipsoid(x, y, z, [K[0] + 0.07, 0.78, L.z], [0.085, 0.17, 0.07]), 0.05);
    d = smin(d, sphere(x, y, z, K, L.front ? 0.058 : 0.06), 0.04);
    if (!L.front) d = smin(d, sphere(x, y, z, [K[0] - 0.05, K[1] + 0.02, L.z], 0.045), 0.03); // point of hock
    d = smin(d, roundCone(x, y, z, K, F, 0.046, 0.041), 0.03);
    d = smin(d, sphere(x, y, z, F, 0.05), 0.03);
    d = smin(d, roundCone(x, y, z, F, H, 0.041, 0.043), 0.02);
    d = smin(d, roundCone(x, y, z, H, G, 0.047, 0.063), 0.02);
    return d;
}
function tailSDF(x, y, z) {
    // only the dock is solid; the hair is strand cards (tailCards)
    return roundCone(x, y, z, TAIL_A, [-0.95, 1.18, 0], 0.065, 0.06);
}
function maneSDF(x, y, z) {
    // a crest of hair falling to the off side, and a forelock between the ears
    let d = 1e9;
    for (let i = 0; i <= 5; i++) {
        const t = i / 5, cx = 0.93 - t * 0.5, cy = 2.0 - t * 0.43;
        d = smin(d, ellipsoid(x, y, z, [cx + 0.01, cy - 0.03, 0.035], [0.075, 0.1 + t * 0.03, 0.035]), 0.04);
    }
    d = smin(d, ellipsoid(x, y, z, [1.05, 1.99, 0], [0.05, 0.035, 0.035]), 0.02);
    return d;
}
function crestSDF(x, y, z) { return roundCone(x, y, z, [0.45, 1.56, 0], [0.92, 2.0, 0], 0.08, 0.05); }
function headSDF(x, y, z) {
    let d = roundCone(x, y, z, HEAD_A, HEAD_B, 0.1, 0.068);
    d = smin(d, ellipsoid(x, y, z, [1.04, 1.81, 0], [0.15, 0.13, 0.1]), 0.07);           // broad jowl
    d = smin(d, ellipsoid(x, y, z, [1.04, 1.95, 0], [0.09, 0.07, 0.1]), 0.05);           // flat forehead
    d = smin(d, ellipsoid(x, y, z, [1.33, 1.53, 0], [0.09, 0.085, 0.078]), 0.06);         // muzzle
    d = Math.max(d, -Math.min(sphere(x, y, z, [1.4, 1.52, 0.05], 0.022), sphere(x, y, z, [1.4, 1.52, -0.05], 0.022))); // nostrils
    d = smin(d, roundCone(x, y, z, [0.99, 2.03, 0.055], [0.965, 2.17, 0.075], 0.035, 0.009), 0.025);
    d = smin(d, roundCone(x, y, z, [0.99, 2.03, -0.055], [0.965, 2.17, -0.075], 0.035, 0.009), 0.025);
    d = Math.min(d, sphere(x, y, z, [1.08, 1.915, 0.088], 0.024), sphere(x, y, z, [1.08, 1.915, -0.088], 0.024));
    return d;
}
function torsoSDF(x, y, z) {
    let d = ellipsoid(x, y, z, [0.0, 1.23, 0], [0.6, 0.33, 0.27]);
    d = smin(d, ellipsoid(x, y, z, [0.46, 1.18, 0], [0.3, 0.33, 0.25]), 0.15);
    d = smin(d, ellipsoid(x, y, z, [-0.5, 1.29, 0], [0.38, 0.3, 0.29]), 0.15);
    d = smin(d, ellipsoid(x, y, z, [0.34, 1.43, 0], [0.32, 0.16, 0.12]), 0.12);
    d = smin(d, ellipsoid(x, y, z, [-0.74, 1.2, 0], [0.18, 0.26, 0.22]), 0.1);
    for (const s of [1, -1]) {
        d = smin(d, roundCone(x, y, z, [0.3, 1.46, 0.12 * s], [0.6, 1.12, 0.15 * s], 0.11, 0.1), 0.08);       // shoulder blade
        d = smin(d, ellipsoid(x, y, z, [0.45, 1.06, 0.135 * s], [0.15, 0.22, 0.1]), 0.08);
        d = smin(d, ellipsoid(x, y, z, [-0.55, 1.22, 0.13 * s], [0.32, 0.3, 0.17]), 0.1);                    // quarters
        d = smin(d, roundCone(x, y, z, [-0.8, 1.3, 0.11 * s], [-0.64, 0.76, 0.13 * s], 0.12, 0.07), 0.08);    // second thigh
    }
    d = smin(d, roundCone(x, y, z, NECK_A, NECK_B, 0.27, 0.13), 0.13);
    d = smin(d, ellipsoid(x, y, z, [0.66, 1.45, 0], [0.22, 0.2, 0.17]), 0.1);                                  // neck root
    return d;
}
function horseSDF(x, y, z) {
    let d = torsoSDF(x, y, z);
    d = smin(d, crestSDF(x, y, z), 0.05);
    d = smin(d, maneSDF(x, y, z), 0.02);
    d = smin(d, headSDF(x, y, z), 0.08);
    for (const n of LEG_NAMES) {
        const L = LEG[n];
        if (Math.abs(x - (L.s[0] + L.k[0]) * 0.5) > 0.42) continue;
        d = smin(d, legSDF(x, y, z, L), 0.07);
    }
    d = smin(d, tailSDF(x, y, z), 0.035);
    return Math.max(d, -y);
}

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

function buildHorseGeometry() {
    const t0 = performance.now();
    const net = surfaceNets(horseSDF, [-1.12, -0.012, -0.37], [1.46, 2.22, 0.37], 0.0185);
    const { positions: P, normals: N, indices } = net;
    const n = P.length / 3;
    const mark = new Float32Array(n * 4), mark2 = new Float32Array(n * 4);
    const skinIndex = new Uint16Array(n * 4), skinWeight = new Float32Array(n * 4);
    const headDir = [HEAD_B[0] - HEAD_A[0], HEAD_B[1] - HEAD_A[1]];
    const hl = Math.hypot(headDir[0], headDir[1]); headDir[0] /= hl; headDir[1] /= hl;
    const cand = [];
    for (let v = 0; v < n; v++) {
        const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2], p = [x, y, z];
        // regions
        const tailD = tailSDF(x, y, z), maneD = maneSDF(x, y, z);
        const restD = Math.min(torsoSDF(x, y, z), headSDF(x, y, z));
        const tail = x < -0.78 ? 1 - smoothstep(-0.02, 0.025, tailD - restD) : 0;
        const mane = 1 - smoothstep(-0.008, 0.01, maneD - Math.min(restD, crestSDF(x, y, z)));
        const hoof = 1 - smoothstep(0.058, 0.074, y);
        // blaze down the front of the face
        const [bd] = segDist([x, y, 0], [1.07, 2.0, 0], [1.4, 1.56, 0]);
        const blaze = (1 - smoothstep(0.028, 0.042, Math.abs(z))) * (x > 1.03 ? 1 : 0) * (1 - smoothstep(0.09, 0.13, bd)) * (y < 1.99 ? 1 : 0);
        const eD = Math.min(Math.hypot(x - 1.08, y - 1.915, z - 0.088), Math.hypot(x - 1.08, y - 1.915, z + 0.088));
        const eye = 1 - smoothstep(0.022, 0.03, eD);
        // bridle: noseband, headpiece and cheek straps
        const along = (px, py) => (x - px) * headDir[0] + (y - py) * headDir[1];
        let bridle = 0;
        if (x > 0.93 && y > 1.45) {
            bridle = Math.max(bridle, 1 - smoothstep(0.011, 0.018, Math.abs(along(1.22, 1.67))));
            bridle = Math.max(bridle, (1 - smoothstep(0.011, 0.018, Math.abs(along(0.975, 1.965)))) * (y > 1.78 ? 1 : 0));
            const [cd] = segDist([x, y, 0], [0.985, 1.96, 0], [1.2, 1.69, 0]);
            bridle = Math.max(bridle, (1 - smoothstep(0.01, 0.017, cd)) * smoothstep(0.05, 0.07, Math.abs(z)));
            bridle *= 1 - eye;
        }
        let legIdx = -1;
        if (y < 0.75) legIdx = x > 0 ? (z > 0 ? 0 : 1) : (z > 0 ? 2 : 3);
        mark.set([Math.max(tail, mane), hoof, blaze, eye], v * 4);
        mark2.set([bridle, y, legIdx, fieldAO(horseSDF, x, y, z, N[v * 3], N[v * 3 + 1], N[v * 3 + 2])], v * 4);
        // skin weights
        cand.length = 0;
        const tailOnly = tail > 0.5;
        for (let b = 1; b < BONES.length; b++) {
            const [name, , head, end, start] = BONES[b];
            const isTail = name.startsWith('tail');
            if (tailOnly !== isTail && !(tailOnly && name === 'rump')) continue;
            let [d] = segDist(p, start || head, end);
            let w = 1 / Math.pow(Math.max(d, 0.006), 4);
            const leg = LEG[name.slice(0, 2)];
            if (leg && name.length === 3) {
                const side = z * Math.sign(leg.z);
                w *= smoothstep(-0.005, 0.05, side);
                if (name[2] === 'u') w *= 1 - smoothstep(leg.front ? 0.9 : 0.86, leg.front ? 1.1 : 1.06, y);
            }
            if (name === 'neck') w *= smoothstep(0.55, 0.75, x);
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
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    g.setAttribute('aMark', new THREE.BufferAttribute(mark, 4));
    g.setAttribute('aMark2', new THREE.BufferAttribute(mark2, 4));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
    g.setIndex(new THREE.BufferAttribute(indices, 1));
    g.computeBoundingSphere();
    g.boundingSphere.radius += 0.6;
    console.info(`[derby] horse sculpt: ${n} verts, ${indices.length / 3} tris, ${(performance.now() - t0) | 0} ms`);
    return g;
}

// ---------------------------------------------------------------- jockey
const J = {
    hip: [0.0, 1.81, 0], chest: [0.34, 1.93, 0], head: [0.58, 2.03, 0],
    sh: (s) => [0.37, 1.92, 0.15 * s], el: (s) => [0.5, 1.8, 0.185 * s], ha: (s) => [0.73, 1.87, 0.075 * s],
    th: (s) => [0.02, 1.79, 0.1 * s], kn: (s) => [0.34, 1.61, 0.225 * s], an: (s) => [0.16, 1.29, 0.24 * s], toe: (s) => [0.28, 1.25, 0.24 * s],
};
// region ids: 0 silks body, 1 sleeves, 2 breeches, 3 boots, 4 gloves, 5 cap, 6 face, 7 goggles
function jockeyParts(x, y, z) {
    const out = [], H = J.head;
    out.push([0, smin(ellipsoid(x, y, z, J.hip, [0.14, 0.11, 0.13]), smin(roundCone(x, y, z, J.hip, J.chest, 0.125, 0.15), ellipsoid(x, y, z, [J.chest[0] - 0.05, J.chest[1] - 0.01, 0], [0.22, 0.12, 0.175]), 0.08), 0.08)]);
    out.push([6, smin(roundCone(x, y, z, [H[0] - 0.13, H[1] - 0.08, 0], [H[0] - 0.04, H[1] - 0.04, 0], 0.055, 0.05), sphere(x, y, z, H, 0.1), 0.04)]);
    out.push([5, Math.min(Math.max(sphere(x, y, z, [H[0] - 0.01, H[1] + 0.025, 0], 0.113), -(y - H[1] + 0.015) - (x - H[0]) * 0.35),
        ellipsoid(x, y, z, [H[0] + 0.09, H[1] + 0.015, 0], [0.07, 0.014, 0.08]))]);
    out.push([7, Math.max(ellipsoid(x, y, z, [H[0] + 0.06, H[1] - 0.015, 0], [0.06, 0.03, 0.095]), -(x - H[0] - 0.02))]);
    for (const s of [1, -1]) {
        out.push([1, smin(roundCone(x, y, z, J.sh(s), J.el(s), 0.058, 0.046), roundCone(x, y, z, J.el(s), J.ha(s), 0.046, 0.038), 0.03)]);
        out.push([4, sphere(x, y, z, J.ha(s), 0.042)]);
        out.push([2, roundCone(x, y, z, J.th(s), J.kn(s), 0.088, 0.062)]);
        out.push([3, smin(roundCone(x, y, z, J.kn(s), J.an(s), 0.058, 0.046), roundCone(x, y, z, J.an(s), J.toe(s), 0.048, 0.036), 0.03)]);
    }
    return out;
}
function jockeySDF(x, y, z) {
    const parts = jockeyParts(x, y, z);
    let d = parts[0][1];
    for (let i = 1; i < parts.length; i++) d = smin(d, parts[i][1], parts[i][0] === 7 || parts[i][0] === 4 ? 0.01 : 0.045);
    return d;
}
function buildJockeyGeometry() {
    const net = surfaceNets(jockeySDF, [-0.2, 1.15, -0.34], [0.86, 2.22, 0.34], 0.013);
    const P = net.positions, Nn = net.normals, n = P.length / 3, reg = new Float32Array(n), ao = new Float32Array(n);
    for (let v = 0; v < n; v++) {
        ao[v] = Math.min(fieldAO(jockeySDF, P[v * 3], P[v * 3 + 1], P[v * 3 + 2], Nn[v * 3], Nn[v * 3 + 1], Nn[v * 3 + 2]),
            fieldAO(horseSDF, P[v * 3], P[v * 3 + 1], P[v * 3 + 2], Nn[v * 3], Nn[v * 3 + 1], Nn[v * 3 + 2]));
        const parts = jockeyParts(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
        let best = 0, bd = 1e9;
        for (const [r, d] of parts) if (d < bd - (r === 5 || r === 7 ? 0.004 : 0)) { bd = d; best = r; }
        reg[v] = best;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(net.normals, 3));
    g.setAttribute('aReg', new THREE.BufferAttribute(reg, 1));
    g.setAttribute('aAO', new THREE.BufferAttribute(ao, 1));
    g.setIndex(new THREE.BufferAttribute(net.indices, 1));
    g.computeBoundingSphere();
    return g;
}

// saddle cloth: a grid shrink-wrapped onto the sculpted barrel
function buildClothGeometry() {
    const U = 34, V = 10, x0 = -0.2, x1 = 0.3, cy = 1.24;
    const pos = [], uv = [], nrm = [], idx = [];
    for (let j = 0; j <= V; j++) for (let i = 0; i <= U; i++) {
        const u = i / U, v = j / V, phi = (u - 0.5) * 2 * 1.92;
        const x = mix(x0, x1, v), dy = Math.cos(phi), dz = Math.sin(phi);
        // march in from outside to the surface
        let t = 0.6;
        for (let it = 0; it < 60; it++) { const d = torsoSDF(x, cy + dy * t, dz * t); if (Math.abs(d) < 1e-4) break; t -= d * 0.9; }
        const e = 0.004, px = x, py = cy + dy * t, pz = dz * t;
        let gx = torsoSDF(px + e, py, pz) - torsoSDF(px - e, py, pz), gy = torsoSDF(px, py + e, pz) - torsoSDF(px, py - e, pz), gz = torsoSDF(px, py, pz + e) - torsoSDF(px, py, pz - e);
        const gl = Math.hypot(gx, gy, gz); gx /= gl; gy /= gl; gz /= gl;
        const off = 0.014 + 0.006 * Math.cos(phi);
        pos.push(px + gx * off, py + gy * off, pz + gz * off); nrm.push(gx, gy, gz); uv.push(u, v);
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
    return g;
}

// tail: crossed strand cards hung from the dock, skinned to the tail bones
function buildTailGeometry() {
    const chain = [TAIL_A, [-0.95, 1.2, 0], TAIL_B, [-1.01, 0.85, 0], TAIL_C, [-0.99, 0.4, 0]];
    const W = [0.05, 0.1, 0.15, 0.2, 0.24, 0.2];
    const pos = [], uv = [], nrm = [], idx = [], si = [], sw = [];
    const cards = 5;
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
    // tiny racing saddle and girth across the top
    g.fillStyle = '#1b120c';
    g.beginPath(); g.ellipse(W / 2, H * 0.62, 70, H * 0.3, 0, 0, TAU); g.fill();
    g.fillStyle = '#3a2416'; g.beginPath(); g.ellipse(W / 2, H * 0.62, 56, H * 0.24, 0, 0, TAU); g.fill();
    g.fillStyle = '#efe6d2'; g.fillRect(W / 2 - 230, H * 0.72, 18, H * 0.28); g.fillRect(W / 2 + 212, H * 0.72, 18, H * 0.28);
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
        color: 0xffffff, roughness: 0.5, metalness: 0, clearcoat: 0.14, clearcoatRoughness: 0.42,
        sheen: 0.35, sheenRoughness: 0.45, sheenColor: new THREE.Color(coat.coat).lerp(new THREE.Color('#ffd9a8'), 0.3), envMapIntensity: 0.85,
    });
    const u = {
        uCoat: { value: new THREE.Color(coat.coat) }, uPoints: { value: new THREE.Color(coat.points) }, uHair: { value: new THREE.Color(coat.hair) },
        uSocks: { value: new THREE.Vector4(...coat.socks) }, uBlaze: { value: coat.blaze }, uDapple: { value: coat.dapple }, uGlow: { value: new THREE.Color(0) },
    };
    m.userData.u = u;
    m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, u);
        sh.vertexShader = sh.vertexShader
            .replace('#include <common>', '#include <common>\nattribute vec4 aMark;attribute vec4 aMark2;varying vec4 vMark;varying vec4 vMark2;varying vec3 vRest;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMark=aMark;vMark2=aMark2;vRest=position;');
        sh.fragmentShader = sh.fragmentShader
            .replace('#include <common>', `#include <common>
uniform vec3 uCoat,uPoints,uHair,uGlow;uniform vec4 uSocks;uniform float uBlaze,uDapple;varying vec4 vMark;varying vec4 vMark2;varying vec3 vRest;
float hh(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float vn3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(mix(hh(i),hh(i+vec3(1,0,0)),f.x),mix(hh(i+vec3(0,1,0)),hh(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hh(i+vec3(0,0,1)),hh(i+vec3(1,0,1)),f.x),mix(hh(i+vec3(0,1,1)),hh(i+vec3(1,1,1)),f.x),f.y),f.z);}`)
            .replace('#include <color_fragment>', `#include <color_fragment>
{ vec3 col=uCoat;
  float legM=step(-.5,vMark2.z);
  // counter-shading: a lighter belly and flank, the topline a touch deeper
  col*=mix(1.06,.9,smoothstep(1.05,1.55,vRest.y));
  col*=.94+.12*vn3(vRest*7.);
  // dapples (greys): rings of lighter coat
  float dp=vn3(vRest*13.);col=mix(col,col*mix(.62,1.15,smoothstep(.35,.62,dp)),uDapple*smoothstep(.5,1.3,vRest.y));
  col=mix(col,uPoints,legM*(1.-smoothstep(.36,.6,vRest.y)));
  float sock=0.;int li=int(vMark2.z+.5);
  float sh=li==0?uSocks.x:li==1?uSocks.y:li==2?uSocks.z:uSocks.w;
  sock=legM*step(.01,sh)*(1.-smoothstep(sh-.02,sh+.02,vRest.y+.015*sin(atan(vRest.z,vRest.x)*9.)));
  col=mix(col,vec3(.86,.84,.8),sock);
  col=mix(col,vec3(.88,.86,.82),vMark.z*uBlaze);
  col=mix(col,uHair*(.7+.6*vn3(vRest*vec3(55.,9.,55.))*vn3(vRest*vec3(23.,5.,31.)+3.)),vMark.x);
  col=mix(col,vec3(.07,.065,.06),vMark.y);
  col=mix(col,vec3(.11,.07,.045),vMark2.x);
  col=mix(col,vec3(.012),vMark.w);
  // creases and the undersides close in on themselves
  float ao=mix(.38,1.,vMark2.w);col*=ao;
  diffuseColor.rgb=col; }`)
            .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor=mix(roughnessFactor,.72,vMark.x);roughnessFactor=mix(1.,roughnessFactor,vMark2.w*.6+.4);roughnessFactor=mix(roughnessFactor,.32,vMark.y);roughnessFactor=mix(roughnessFactor,.08,vMark.w);roughnessFactor=mix(roughnessFactor,.55,vMark2.x);`)
            .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance+=uGlow;');
    };
    m.customProgramCacheKey = () => 'horse';
    return m;
}

export const SILKS = ['hoops', 'sash', 'diamonds', 'quartered', 'stars', 'chevrons', 'braces', 'spots'];
function jockeyMaterial(primary, secondary, pattern) {
    const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.38, sheen: 1, sheenRoughness: 0.35, sheenColor: new THREE.Color('#ffffff'), envMapIntensity: 1.0 });
    const u = { uP: { value: new THREE.Color(primary) }, uS: { value: new THREE.Color(secondary) }, uPat: { value: pattern } };
    m.userData.u = u;
    m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, u);
        sh.vertexShader = sh.vertexShader
            .replace('#include <common>', '#include <common>\nattribute float aReg;attribute float aAO;varying float vReg;varying float vAO;varying vec3 vRest;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvReg=aReg;vAO=aAO;vRest=position;');
        sh.fragmentShader = sh.fragmentShader
            .replace('#include <common>', '#include <common>\nuniform vec3 uP,uS;uniform float uPat;varying float vReg;varying float vAO;varying vec3 vRest;')
            .replace('#include <color_fragment>', `#include <color_fragment>
{ float r=floor(vReg+.5);vec3 p=vRest;float m=0.;int pat=int(uPat+.5);
  if(pat==0)m=step(.5,fract(p.x*9.));
  else if(pat==1)m=1.-step(.07,abs(fract((p.x-p.z*1.3+p.y*.4)*1.6)-.5));
  else if(pat==2){vec2 q=abs(fract(vec2(p.x*7.,p.z*7.+p.y*3.))-.5);m=step(q.x+q.y,.3);}
  else if(pat==3)m=step(0.,(p.x-.24)*p.z);
  else if(pat==4){vec2 q=fract(vec2(p.x*8.,(p.z+p.y)*8.))-.5;float a=atan(q.y,q.x),rr=length(q);m=step(rr,.18+.08*cos(a*5.));}
  else if(pat==5)m=step(.5,fract(p.x*6.+abs(p.z)*6.));
  else if(pat==6)m=1.-step(.06,abs(abs(p.z)-.085));
  else m=step(length(fract(vec2(p.x*8.,(p.z+p.y)*8.))-.5),.2);
  vec3 silk=mix(uP,uS,m);
  vec3 col=silk;
  if(r==1.)col=pat==3||pat==6?uS:mix(uP,uS,step(.5,fract(p.x*10.)));
  if(r==2.)col=vec3(.92,.9,.86);
  if(r==3.)col=mix(vec3(.03),vec3(.42,.27,.14),smoothstep(1.52,1.55,p.y));
  if(r==4.)col=vec3(.9);
  if(r==5.)col=mix(uS,uP,step(.5,fract(atan(p.z,p.x-.57)*1.27+.25)));
  if(r==6.)col=vec3(.62,.42,.31);
  if(r==7.)col=vec3(.02);
  diffuseColor.rgb=col*mix(.4,1.,vAO); }`)
            .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n{float r=floor(vReg+.5);if(r==3.)roughnessFactor=.25;if(r==7.)roughnessFactor=.05;if(r==2.||r==6.)roughnessFactor=.7;}');
    };
    m.customProgramCacheKey = () => 'jockey';
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

export function prepareHorses() {
    if (!SHARED) SHARED = { horse: buildHorseGeometry(), jockey: buildJockeyGeometry(), cloth: buildClothGeometry(), tail: buildTailGeometry() };
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
        // reins: hands → bit
        this.reins = [1, -1].map((s) => {
            const m = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 1, 5, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#1a120c', roughness: 0.6 }));
            m.userData.hand = new THREE.Object3D(); m.userData.hand.position.set(0.73 - 0.05, 1.87 - 1.68, 0.07 * s); this.jockeyPivot.add(m.userData.hand);
            const hd = BONES[BI.head][2];
            m.userData.bit = new THREE.Object3D(); m.userData.bit.position.set(1.27 - hd[0], 1.57 - hd[1], 0.075 * s); this.b.head.add(m.userData.bit);
            m.castShadow = false; this.group.add(m); return m;
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
        for (const r of this.reins) {
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
        this.clothTex.dispose(); this.mat.dispose(); this.tailMat.dispose(); this.jockeyMat.dispose(); this.cloth.material.dispose();
        this.reins.forEach((r) => { r.geometry.dispose(); r.material.dispose(); });
        this.blob.geometry.dispose(); this.blob.material.dispose();
    }
}
const _va = new THREE.Vector3(), _vb = new THREE.Vector3(), _vc = new THREE.Vector3();
