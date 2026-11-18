// Shanghai 3D ("The Lantern Pagoda") — shared scale, palette, materials and the round → sky table.
//
// Scale: metres. The moon gate is the dartboard: the double ring's outer edge (170 mm on a real board) is 2.0 m,
// the gilt number ring runs to 2.5 m and the carved stone surround to 3.0 m. The pagoda is a real-size tower
// (~45 m to the finial) standing behind the courtyard wall.
import * as THREE from 'three';
import { RADII } from '../lib3d/kit/darts.js';

export const R_DOUBLE = 2.0;
export const K = R_DOUBLE / RADII.doubleOut; // board mm → scene metres
export const R_NUMBERS = 2.5;
export const R_GATE = 2.56; // the opening in the wall (just outside the number ring)
export const R_STONE = 3.05; // the carved stone surround
export const BOARD_Y = 3.3; // the board's centre above the courtyard paving

/** the bg photo's palette */
export const PAL = {
    lacquer: '#a3161b', // red lacquer: posts, railings, the gate wall's trim
    lacquerDeep: '#5c0d10',
    wall: '#e9ae2a', // imperial yellow plaster
    courtyard: '#8f2a1e', // the red courtyard wall
    tile: '#34373a', // dark grey glazed tile
    tileDark: '#1f2123',
    gold: '#e8b54c',
    bronze: '#8a6334',
    stone: '#9a948a',
    jade: '#1f5a45',
    ink: '#120c0a',
};

/** player colours, as the other 3D games (kit roster) */
export const PLAYER_COLOURS = ['#e63946', '#2a9df4', '#f4c430', '#3ddc84', '#b06cff', '#ff8a3d'];

const cache = new Map();
/** shared materials (one per name; the pagoda and the gate draw from the same set so they read as one place) */
export function mat(name) {
    if (cache.has(name)) return cache.get(name);
    let m;
    switch (name) {
        case 'tile': m = new THREE.MeshPhysicalMaterial({ color: PAL.tile, roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.4, envMapIntensity: 0.9 }); break;
        case 'ridge': m = new THREE.MeshPhysicalMaterial({ color: '#3b3e41', roughness: 0.58, clearcoat: 0.2, clearcoatRoughness: 0.5 }); break;
        case 'lacquer': m = new THREE.MeshPhysicalMaterial({ color: PAL.lacquer, roughness: 0.48, clearcoat: 0.4, clearcoatRoughness: 0.38 }); break;
        case 'lacquerDeep': m = new THREE.MeshPhysicalMaterial({ color: PAL.lacquerDeep, roughness: 0.68, clearcoat: 0.08, clearcoatRoughness: 0.6 }); break;
        case 'wall': m = new THREE.MeshStandardMaterial({ color: PAL.wall, roughness: 0.92, envMapIntensity: 0.7 }); break;
        case 'gold': m = new THREE.MeshStandardMaterial({ color: PAL.gold, roughness: 0.26, metalness: 1 }); break;
        case 'bronze': m = new THREE.MeshStandardMaterial({ color: PAL.bronze, roughness: 0.38, metalness: 1 }); break;
        case 'iron': m = new THREE.MeshStandardMaterial({ color: '#3a3532', roughness: 0.5, metalness: 0.9 }); break;
        case 'stone': m = new THREE.MeshStandardMaterial({ color: PAL.stone, roughness: 0.88 }); break;
        case 'courtyard': m = new THREE.MeshStandardMaterial({ color: PAL.courtyard, roughness: 0.9 }); break;
        default: throw new Error('no material ' + name);
    }
    cache.set(name, m);
    return m;
}

/**
 * The sky clock: round 1 is late sunset, round 8 full night. `t` = (round − 1) / 7.
 * Each row: sun/moon key light, sky colours, haze, star amount; sky.js and the page lerp between rows.
 */
export const SKY = [
    // t   key az/el  key colour  key int  zenith     horizon(sun side)  horizon(away)  haze away   haze toward  stars moon
    { t: 0.0, az: 232, el: 7, key: '#ffb06a', ki: 3.4, zen: '#33569e', horSun: '#ffae5c', horAway: '#c58aa0', away: '#7a6a8c', toward: '#ff9a55', stars: 0, moon: 0, hemi: 0.42, sunUp: 1 },
    { t: 0.3, az: 236, el: 2, key: '#ff8a4c', ki: 2.2, zen: '#22397a', horSun: '#ff7a3c', horAway: '#7a5a88', away: '#463c62', toward: '#d0603a', stars: 0.15, moon: 0.1, hemi: 0.32, sunUp: 0.6 },
    { t: 0.6, az: 150, el: 34, key: '#8fa6ff', ki: 0.9, zen: '#0f1c4a', horSun: '#7a3a4a', horAway: '#2a2c5c', away: '#1c2248', toward: '#4a2a3e', stars: 0.6, moon: 0.7, hemi: 0.22, sunUp: 0 },
    { t: 1.0, az: 140, el: 42, key: '#9fb6ff', ki: 1.5, zen: '#060c24', horSun: '#2a2046', horAway: '#1c2450', away: '#0c1230', toward: '#1a1630', stars: 1, moon: 1, hemi: 0.3, sunUp: 0 },
];

/** the sky row for game progress t (0 = round 1, 1 = round 8), every field lerped */
export function skyAt(t) {
    t = Math.min(1, Math.max(0, t));
    let i = 0;
    while (i < SKY.length - 2 && t > SKY[i + 1].t) i++;
    const a = SKY[i], b = SKY[i + 1], u = (t - a.t) / (b.t - a.t);
    const out = { t };
    for (const k of Object.keys(a)) {
        if (k === 't') continue;
        if (typeof a[k] === 'string') out[k] = new THREE.Color(a[k]).lerp(new THREE.Color(b[k]), u);
        else if (k === 'az') { let d = b.az - a.az; out.az = a.az + d * u; }
        else out[k] = a[k] + (b[k] - a[k]) * u;
    }
    return out;
}
export const roundT = (round) => (Math.min(8, Math.max(1, round)) - 1) / 7;

/** a small seeded random (mulberry32); never Math.random in shared code */
export function rng(seed = 1) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** accumulate triangles into one BufferGeometry (so a whole pagoda's tiles are one draw) */
export class Builder {
    constructor() { this.p = []; this.n = []; this.uv = []; this.idx = []; }
    get count() { return this.p.length / 3; }
    vert(x, y, z, u = 0, v = 0) { this.p.push(x, y, z); this.uv.push(u, v); return this.count - 1; }
    tri(a, b, c) { this.idx.push(a, b, c); }
    quad(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }
    /** a grid of (nu+1)×(nv+1) vertices from f(i, j) → [x, y, z, u, v]; quads wound so the normal faces `flip ? −` : `+` of du × dv */
    grid(nu, nv, f, flip = false) {
        const base = this.count;
        for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const r = f(i, j); this.vert(r[0], r[1], r[2], r[3] ?? i / nu, r[4] ?? j / nv); }
        for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
            const a = base + j * (nu + 1) + i, b = a + 1, c = a + nu + 2, d = a + nu + 1;
            if (flip) this.quad(a, d, c, b); else this.quad(a, b, c, d);
        }
    }
    /** append another geometry (non-indexed or indexed), transformed by matrix m */
    add(geo, m) {
        const g = geo.index ? geo : geo, base = this.count;
        const P = g.attributes.position, UV = g.attributes.uv, v = new THREE.Vector3();
        for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i); if (m) v.applyMatrix4(m); this.vert(v.x, v.y, v.z, UV ? UV.getX(i) : 0, UV ? UV.getY(i) : 0); }
        if (g.index) for (let i = 0; i < g.index.count; i++) this.idx.push(base + g.index.getX(i));
        else for (let i = 0; i < P.count; i++) this.idx.push(base + i);
    }
    build() {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
        g.setIndex(this.idx);
        g.computeVertexNormals();
        g.computeBoundingSphere();
        return g;
    }
}

/** a tube along points with per-point radius (TubeGeometry has one radius), capped at the end */
export function sweep(points, radii, radial = 10) {
    const B = new Builder(), n = points.length;
    const T = [], N = [], Bn = [];
    for (let i = 0; i < n; i++) {
        const a = points[Math.max(0, i - 1)], b = points[Math.min(n - 1, i + 1)];
        T.push(b.clone().sub(a).normalize());
    }
    // parallel transport frames
    let nrm = new THREE.Vector3(0, 1, 0);
    if (Math.abs(nrm.dot(T[0])) > 0.9) nrm.set(1, 0, 0);
    nrm.sub(T[0].clone().multiplyScalar(nrm.dot(T[0]))).normalize();
    for (let i = 0; i < n; i++) {
        if (i > 0) { const ax = new THREE.Vector3().crossVectors(T[i - 1], T[i]); const s = ax.length(); if (s > 1e-6) nrm.applyAxisAngle(ax.normalize(), Math.asin(Math.min(1, s))); }
        N.push(nrm.clone()); Bn.push(new THREE.Vector3().crossVectors(T[i], nrm));
    }
    B.grid(radial, n - 1, (i, j) => {
        const a = (i / radial) * Math.PI * 2, r = radii[j];
        const p = points[j].clone().addScaledVector(N[j], Math.cos(a) * r).addScaledVector(Bn[j], Math.sin(a) * r);
        return [p.x, p.y, p.z];
    }, true);
    // end cap
    const c = B.vert(points[n - 1].x, points[n - 1].y, points[n - 1].z), ring = B.count - (radial + 1) - 1;
    for (let i = 0; i < radial; i++) B.tri(ring + i, ring + i + 1, c);
    return B.build();
}

/** a canvas texture helper */
export function canvasTex(w, h, draw, { srgb = true, repeat = false } = {}) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
}
