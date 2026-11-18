// Shared constants and helpers for 3D Limbo.
//
// The height scale (the one thing that must never lie): 1 point = 10 cm. The ball's BASE rides at
//   deck + total × 0.1
// and the burning bar's UNDERSIDE sits at
//   deck + bar × 0.1 + BALL_D
// so the measure runs off the ball's top: when the total equals the bar, the ball's top just kisses the bar;
// one point more and they overlap (burned). The glyphs on the posts mark the same scale. A low bar (3) still
// leaves a visible 30 cm gap above a resting ball, which is what makes the low-bar climax readable.
import * as THREE from 'three';

export const DECK_Y = 0.85;          // deck top above the lagoon's surface (y = 0)
export const PT = 0.1;               // metres per point
export const BALL_R = 0.42, BALL_D = BALL_R * 2;
export const BAR_R = 0.13;           // bamboo radius
export const POST_X = 3.7;           // posts at ±POST_X (inner faces at ±(POST_X − POST_W/2))
export const POST_W = 0.86;
export const POST_H = 8.4;           // above the deck
export const BAR_START = 60;

/** y of the ball's centre for a running total */
export const ballY = (total) => DECK_Y + total * PT + BALL_R;
/** y of the bar's axis for a bar value (underside = the ball's top at total = bar) */
export const barY = (bar) => DECK_Y + bar * PT + BALL_D + BAR_R;
/** 0 at the start bar (60), 1 at the lowest possible bar (3) */
export const heatOf = (bar) => THREE.MathUtils.clamp((BAR_START - bar) / 57, 0, 1);

export const PALETTE = ['#8FD91B', '#2BA4FF', '#FF7A18', '#B44AFF', '#FF2E55', '#F0C400', '#00C97B', '#E1008C'];
export const teamColor = (i) => ((window.FC_PLAYER_COLORS && window.FC_PLAYER_COLORS[i % 8]) || PALETTE[i % 8]);

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
export const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
export const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);
export const easeIn = (t) => Math.pow(clamp01(t), 3);
/** ease-out with an overshoot of about `s`·10% past the target */
export const easeOutBack = (t, s = 1.70158) => { t = clamp01(t) - 1; return 1 + t * t * ((s + 1) * t + s); };

/** seeded random: `const r = rng(7); r()` */
export function rng(seed = 1) { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; }

// noise for shaders: gh hash, gn value noise, gf 4-octave fbm. Every pow/sqrt base in Limbo shaders is clamped
// (Demolition lesson: a NaN goes black and spreads through bloom).
export const NOISE = `float gh(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float gn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(gh(i),gh(i+vec2(1,0)),f.x),mix(gh(i+vec2(0,1)),gh(i+vec2(1,1)),f.x),f.y);}
float gf(vec2 p){return gn(p)*.5+gn(p*2.03+3.1)*.25+gn(p*4.11+7.7)*.15+gn(p*8.3+1.3)*.1;}`;

/** shoreline: z of the waterline at x (sand rises toward +z, the lagoon lies toward −z) */
export const shoreZ = (x) => -3.0 + 1.8 * Math.sin(x * 0.045 + 1.1) + 1.1 * Math.sin(x * 0.13 + 0.4) - Math.max(0, Math.abs(x) - 30) * 0.18;
export const SHORE_GLSL = `float shoreZ(float x){return -3.+1.8*sin(x*.045+1.1)+1.1*sin(x*.13+.4)-max(0.,abs(x)-30.)*.18;}`;
/** sand height at (x, z): under water toward the lagoon, a gentle beach rising inland */
export function sandH(x, z) {
    const d = z - shoreZ(x);
    const beach = d < 0 ? d * 0.12 : Math.min(d * 0.07, 0.35 + d * 0.025);
    const dunes = 0.18 * Math.sin(x * 0.11 + z * 0.07) * Math.sin(z * 0.13 - x * 0.05) * THREE.MathUtils.smoothstep(d, 4, 14);
    return Math.max(-1.4, beach + dunes);
}

/** concatenate geometries (same attribute set, all indexed or all not) into one */
export function merge(geos) {
    const list = geos.map((g) => (g.index ? g : g)).filter(Boolean);
    const names = Object.keys(list[0].attributes);
    const out = new THREE.BufferGeometry();
    for (const n of names) {
        const size = list[0].attributes[n].itemSize;
        const total = list.reduce((s, g) => s + g.attributes[n].count * size, 0);
        const arr = new Float32Array(total); let o = 0;
        for (const g of list) { const a = g.attributes[n]; for (let i = 0; i < a.count; i++) for (let k = 0; k < size; k++) arr[o++] = a.getComponent(i, k); }
        out.setAttribute(n, new THREE.BufferAttribute(arr, size));
    }
    if (list.every((g) => g.index)) {
        const idx = []; let base = 0;
        for (const g of list) { const I = g.index; for (let i = 0; i < I.count; i++) idx.push(I.getX(i) + base); base += g.attributes.position.count; }
        out.setIndex(idx);
    }
    return out;
}
/** a geometry transformed: position / Euler rotation / scale */
export function xf(geo, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } = {}) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...s));
    return geo.applyMatrix4(m);
}

export const FONT = '"Avenir Next Condensed","DIN Condensed","Roboto Condensed","Arial Narrow",Arial,sans-serif';

/** initials for a name (no avatar, or a cross-origin one that would taint WebGL) */
export function initials(name) {
    return String(name || '?').split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';
}
