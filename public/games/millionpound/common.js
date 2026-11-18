// Million Pound Oche ("The Hot Oche") — shared scale, palette, rules mirror and small builders.
//
// Scale: metres. The dartboard is the hero, a 2.4 m board (double ring's outer edge 1.2 m) standing centre stage in
// a great ring of light. Its centre is BOARD_Y above the studio floor. Prize towers stand in an arc either side.
//
// The rules mirror (QUADRANTS, ANCHORS, LADDER, quadrantOf) must match src/engines/millionpound.js exactly:
// tests/millionpound-quadrants.test.cjs imports both and compares every bed.
import * as THREE from 'three';
import { RADII } from '../lib3d/kit/darts.js';

export const R_DOUBLE = 1.2;
export const K = R_DOUBLE / RADII.doubleOut; // board mm → scene metres
export const R_NUMBERS = 1.5;                // the silver number ring
export const R_BEZEL = 1.62;                 // the ring of light's inner edge
export const R_HALO = 2.05;                  // the ring of light's outer edge
export const BOARD_Y = 3.2;

/** the rules, as src/engines/millionpound.js */
export const QUADRANTS = { A: [12, 5, 20, 1, 18], B: [4, 13, 6, 10, 15], C: [2, 17, 3, 19, 7], D: [16, 8, 11, 14, 9] };
export const ANCHORS = { A: 20, B: 6, C: 3, D: 11 };
export const LETTERS = ['A', 'B', 'C', 'D'];
export const LADDER = [100, 200, 300, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 125000, 250000, 500000, 1000000];
export const ROUNDS = 5, PER_TURN = 3, QUESTIONS = 15;
export const CHECKPOINTS = [5, 10];
export const ZONE_SIZES = [5, 5, 3, 3, 2];
/** answer zones by size (numbers per answer): 5 the quadrant, 3 the anchor ± 1, 2 the anchor and its clockwise neighbour */
export const ZONES = { 5: { A: [12, 5, 20, 1, 18], B: [4, 13, 6, 10, 15], C: [2, 17, 3, 19, 7], D: [16, 8, 11, 14, 9] }, 3: { A: [5, 20, 1], B: [13, 6, 10], C: [17, 3, 19], D: [8, 11, 14] }, 2: { A: [20, 1], B: [6, 10], C: [3, 19], D: [11, 14] }, 1: { A: [20], B: [6], C: [3], D: [11] } };
/** the answer a dart names with zones of `size`, or null (inactive, bull, miss) */
export function answerOf(t, size = 5) { if (!t || t.miss || t.number === 'bull') return null; const n = Number(t.number); for (const [k, ns] of Object.entries(ZONES[size] || ZONES[5])) if (ns.includes(n)) return k; return null; }
const Q_OF = {};
Object.entries(QUADRANTS).forEach(([k, ns]) => ns.forEach((n) => { Q_OF[n] = k; }));
/** 'A'…'D' for a lastThrow-shaped dart, or null (bull, outer bull, miss) */
export function quadrantOf(t) { if (!t || t.miss) return null; return Q_OF[Number(t.number)] || null; }
/** a quadrant's centre as a math angle (radians from +x, ccw): A up, B right, C down, D left */
export const QUAD_ANGLE = { A: Math.PI / 2, B: 0, C: -Math.PI / 2, D: Math.PI };
export const money = (n) => (n >= 1000000 ? '£1 MILLION' : '£' + Number(n || 0).toLocaleString('en-GB'));
export const moneyShort = (n) => '£' + Number(n || 0).toLocaleString('en-GB');
export const prizeFor = (rung) => (rung > 0 ? LADDER[Math.min(rung, LADDER.length) - 1] : 0);
/** stakes 0 (question 1) → 1 (the million question): the studio tightens with it */
export const stakesOf = (questionNo) => Math.min(1, Math.max(0, ((questionNo || 1) - 1) / (QUESTIONS - 1)));

/** the studio palette: navy and black, violet and electric blue light, silver edges, gold only for money */
export const PAL = {
    navy: '#0a1240', ink: '#03040f', violet: '#5b2bd6', blue: '#2f6bff', ice: '#9fc4ff', silver: '#c9d2e6',
    gold: '#f2c14e', amber: '#ff9a1a', green: '#22d36b', red: '#ff3b4a',
};
export const AMBER = new THREE.Color('#ff9a1a'), GREEN = new THREE.Color('#1fe070'), ICE = new THREE.Color('#8fb6ff'), GOLDC = new THREE.Color('#ffc75a');

/** player colours, as the other 3D games */
const PALETTE = ['#e63946', '#2a9df4', '#f4c430', '#3ddc84', '#b06cff', '#ff8a3d', '#00c9c9', '#ff4fb4'];
export const teamColor = (i) => ((typeof window !== 'undefined' && window.FC_PLAYER_COLORS && window.FC_PLAYER_COLORS[i % 8]) || PALETTE[i % 8]);

/** a small seeded random (mulberry32); never Math.random in shared code */
export function rng(seed = 1) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** a stable 31-bit hash (the same dart always lands in the same place, even after a reload) */
export function hash(...parts) {
    let h = 2166136261;
    for (const c of parts.join('|')) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
    return (h >>> 0) % 2147483646 + 1;
}

export function canvasTex(w, h, draw, { srgb = true, repeat = false } = {}) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
}

/** an annulus sector (r0..r1, a0..a1 math angles) in the XY plane */
export function sectorGeo(r0, r1, a0, a1, seg = 48) {
    const g = new THREE.RingGeometry(r0, r1, Math.max(3, Math.round(seg * (a1 - a0) / (Math.PI * 2)) + 2), 1, a0, a1 - a0);
    return g;
}

/** an additive glow material (an emissive light surface: bloom picks it up) */
export function glowMat(color, opacity = 1) {
    return new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
}
