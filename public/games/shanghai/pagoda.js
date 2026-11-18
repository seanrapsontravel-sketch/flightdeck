// The eight-tier pagoda — the round tracker. Tier n lights as round n begins; its plaque shows n.
//
// Built procedurally, not from primitives: every roof is a lofted octagonal surface. Across each facet the eave line
// sweeps up toward the corners (lift ∝ |u|^q · v^p) and pokes out in plan (the corner extension), and down the
// slope the profile is concave (steep at the top, flattening to the eave). Real tile rolls run down every facet
// (they scallop the eave's silhouette), with round tile ends along the edge, hip ridges that run on past the eave
// into upturned hooks, a bronze bell under each hook, bracket sets under the eaves, a balcony with a red railing on
// every tier, and a spire of rings, a canopy, chains and a gold gourd finial.
//
// Plan: an octagon whose facet 0 faces +z (the camera); u ∈ [−1, 1] runs across a facet, v ∈ [0, 1] from the
// roof's top edge out to its eave. Variants (Milestone 0) change only the profile numbers.
import * as THREE from 'three';
import { Builder, PAL, canvasTex, mat, sweep } from './common.js';

const SIDES = 8, HALF = Math.PI / SIDES, TAN = Math.tan(HALF);
const DEG = Math.PI / 180;

export const VARIANTS = {
    // the bg photo / Suzhou: slim eaves, a deep concave sweep and tall horn-like corner hooks
    A: { label: 'A · Jiangnan sweep', a0: 4.8, a1: 3.5, topRise: 1.55, wall0: 2.3, wall1: 1.85, over0: 2.35, over1: 1.95, rise: 0.5, concave: 0.7, lift: 1.25, q: 3.0, out: 0.5, hookAng: 78, hookLen: 1.0, hookR: 0.12, hookPow: 1.0, thick: 0.2, brackets: 2, bScale: 1, spire: 1.4, balc: 0.75 },
    // Song / Liao northern: broad, flatter, heavier eaves, deep bracket sets, corners only gently raised
    B: { label: 'B · Northern', a0: 5.6, a1: 4.05, wall0: 2.65, wall1: 2.2, over0: 2.9, over1: 2.5, rise: 0.31, concave: 0.32, lift: 0.32, q: 2.2, out: 0.22, hookAng: 42, hookLen: 0.55, hookR: 0.11, hookPow: 1.2, thick: 0.34, brackets: 4, bScale: 1.45, spire: 0.72, balc: 0.85 },
    // slender tower: tighter plan, a faster taper, a tall spire, the Jiangnan hooks a little calmer
    C: { label: 'C · Slender', a0: 3.9, a1: 2.45, wall0: 2.6, wall1: 2.1, over0: 1.85, over1: 1.5, rise: 0.5, concave: 0.62, lift: 0.95, q: 3.0, out: 0.45, hookAng: 70, hookLen: 0.85, hookR: 0.1, hookPow: 1.1, thick: 0.22, brackets: 2, bScale: 0.9, spire: 1.3, balc: 0.65 },
};

const mix = (a, b, t) => a + (b - a) * t;
const facetM = (k) => { const f = k * 2 * HALF; return [Math.sin(f), Math.cos(f)]; };
const facetT = (k) => { const f = k * 2 * HALF; return [Math.cos(f), -Math.sin(f)]; };

/** a point on facet k at apothem r, across-parameter u: [x, z] */
function planPt(k, r, u) {
    const [mx, mz] = facetM(k), [tx, tz] = facetT(k), e = r * TAN * u;
    return [mx * r + tx * e, mz * r + tz * e];
}

// ---------------------------------------------------------------- textures
let TEX = null;
function textures() {
    if (TEX) return TEX;
    // tile: one tile wide (u) × one course long (v); rolls a touch lighter, a dark overlap line at each course's foot
    const tile = canvasTex(64, 64, (g, w, h) => {
        for (let x = 0; x < w; x++) {
            const d = Math.abs(x / w - 0.5), roll = d < 0.25;
            const l = roll ? 74 - d * 60 : 54;
            g.fillStyle = `rgb(${l},${l + 2},${l + 5})`; g.fillRect(x, 0, 1, h);
        }
        const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.18, 'rgba(0,0,0,0)'); gr.addColorStop(0.9, 'rgba(255,255,255,0.05)'); gr.addColorStop(1, 'rgba(0,0,0,0.2)');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }, { repeat: true });
    // under the eaves: red rafters on a dark board (u runs across the facet)
    const rafters = canvasTex(64, 16, (g, w, h) => {
        g.fillStyle = '#2a0b09'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#7d1614'; g.fillRect(w * 0.25, 0, w * 0.5, h);
        g.fillStyle = 'rgba(255,200,120,0.25)'; g.fillRect(w * 0.25, 0, w * 0.06, h);
    }, { repeat: true });
    // a wall facet: yellow plaster, an arched door (even facets) or a round-headed window (odd), red frames
    const plaster = (g, w, h) => {
        g.fillStyle = PAL.wall; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 1400; i++) { const x = (i * 97) % w, y = (i * 389) % h, a = ((i * 31) % 10) / 160; g.fillStyle = `rgba(${i % 2 ? 255 : 120},${i % 2 ? 220 : 70},40,${a})`; g.fillRect(x, y, 3 + (i % 5), 2 + (i % 3)); }
        const gr = g.createLinearGradient(0, h, 0, h * 0.85); gr.addColorStop(0, 'rgba(60,30,10,0.35)'); gr.addColorStop(1, 'rgba(60,30,10,0)'); g.fillStyle = gr; g.fillRect(0, h * 0.85, w, h * 0.15);
    };
    const arch = (g, w, h, door, fill) => {
        const cx = w / 2, bw = door ? w * 0.36 : w * 0.26, top = door ? h * 0.16 : h * 0.24, bot = door ? h : h * 0.66;
        g.beginPath(); g.moveTo(cx - bw / 2, bot); g.lineTo(cx - bw / 2, top + bw / 2); g.arc(cx, top + bw / 2, bw / 2, Math.PI, 0); g.lineTo(cx + bw / 2, bot); g.closePath();
        g.fillStyle = fill; g.fill();
        return { cx, bw, top, bot };
    };
    const wallMap = (door) => canvasTex(256, 512, (g, w, h) => {
        plaster(g, w, h);
        g.save(); g.lineWidth = 14; g.strokeStyle = PAL.lacquer;
        const a = arch(g, w, h, door, '#140805'); g.restore();
        // the red frame round the opening, and a lattice in a window
        g.lineWidth = 12; g.strokeStyle = PAL.lacquer; g.beginPath(); g.moveTo(a.cx - a.bw / 2, a.bot); g.lineTo(a.cx - a.bw / 2, a.top + a.bw / 2); g.arc(a.cx, a.top + a.bw / 2, a.bw / 2, Math.PI, 0); g.lineTo(a.cx + a.bw / 2, a.bot); g.stroke();
        if (!door) { g.strokeStyle = 'rgba(150,30,20,0.9)'; g.lineWidth = 4; for (let x = a.cx - a.bw / 2 + 10; x < a.cx + a.bw / 2; x += 14) { g.beginPath(); g.moveTo(x, a.top + 8); g.lineTo(x, a.bot - 4); g.stroke(); } }
        // a pair of red door leaves standing open inside a door
        if (door) { g.fillStyle = '#5a0f0c'; g.fillRect(a.cx - a.bw / 2 + 6, a.top + a.bw * 0.55, a.bw * 0.16, a.bot - a.top - a.bw * 0.55); g.fillRect(a.cx + a.bw / 2 - 6 - a.bw * 0.16, a.top + a.bw * 0.55, a.bw * 0.16, a.bot - a.top - a.bw * 0.55); }
    });
    // the openings' glow when the tier is lit: warm inside, brighter low
    const glowMap = (door) => canvasTex(256, 512, (g, w, h) => {
        g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
        const gr = g.createLinearGradient(0, h * 0.2, 0, h); gr.addColorStop(0, '#ff9a3a'); gr.addColorStop(1, '#ffd890');
        arch(g, w, h, door, gr);
        if (door) { g.fillStyle = '#000'; g.fillRect(w / 2 - w * 0.18 + 6, h * 0.16 + w * 0.36 * 0.55, w * 0.36 * 0.16, h); g.fillRect(w / 2 + w * 0.18 - 6 - w * 0.36 * 0.16, h * 0.16 + w * 0.36 * 0.55, w * 0.36 * 0.16, h); }
    });
    TEX = { tile, rafters, wallDoor: wallMap(true), wallWin: wallMap(false), glowDoor: glowMap(true), glowWin: glowMap(false) };
    return TEX;
}

/** the plaque on tier n's front facet: a gilt-framed board with the round number */
function plaqueTex(n) {
    return canvasTex(256, 160, (g, w, h) => {
        g.fillStyle = '#16264f'; g.fillRect(0, 0, w, h);
        g.strokeStyle = PAL.gold; g.lineWidth = 14; g.strokeRect(7, 7, w - 14, h - 14);
        g.strokeStyle = '#8a5a1c'; g.lineWidth = 3; g.strokeRect(20, 20, w - 40, h - 40);
        g.fillStyle = '#ffd36a'; g.font = '900 118px "Avenir Next Condensed", "DIN Condensed", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(String(n), w / 2, h / 2 + 6);
    });
}

// ---------------------------------------------------------------- small parts
function bellGeo() {
    const pts = [[0, 0.3], [0.035, 0.29], [0.05, 0.26], [0.07, 0.2], [0.09, 0.08], [0.115, 0.01], [0.12, 0], [0.105, 0.005]].map(([x, y]) => new THREE.Vector2(x, y - 0.3));
    return new THREE.LatheGeometry(pts, 14);
}
function gourdGeo(h) {
    const P = [];
    for (let i = 0; i <= 40; i++) {
        const t = i / 40, y = t * h;
        // two bulbs (a gourd) on a short neck, finishing in a point
        const r = h * (0.2 * Math.sin(Math.min(1, t / 0.55) * Math.PI) * (t < 0.55 ? 1 : 0) + (t > 0.5 ? 0.14 * Math.sin(Math.min(1, (t - 0.5) / 0.42) * Math.PI) : 0) + (t < 0.06 ? 0.08 : 0)) + 0.02 * (1 - t);
        P.push(new THREE.Vector2(Math.max(0.001, r), y));
    }
    return new THREE.LatheGeometry(P, 20);
}

// ---------------------------------------------------------------- the pagoda
/**
 * @param {object} o  variant 'A'|'B'|'C', tiers (8)
 * @returns THREE.Group with userData: { tiers: [{ y, a, eave, plaque }], height, setLit(n, k), lit }
 */
export function pagoda(o = {}) {
    const V = { ...VARIANTS[o.variant || 'A'], ...(o.params || {}) };
    // lod 1: the game's tower, seen from the courtyard (≥ 60 m): tile rolls kept (they make the eave silhouette) at
    // half the cross-section, fewer slope rows, balusters thinned, no tile-end caps
    const lod = o.lod ?? 0;
    const T = o.tiers || 8;
    const tx = textures();
    const G = new THREE.Group(); G.name = 'pagoda';
    const tiles = new Builder(), ridges = new Builder(), under = new Builder(), fascia = new Builder();
    const lacq = new Builder(), deep = new Builder(), gold = new Builder(), bronze = new Builder(), iron = new Builder(), stone = new Builder(), jade = new Builder();
    const box = (B, w, h, d, m) => B.add(new THREE.BoxGeometry(w, h, d), m);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(1, 1, 1), P3 = new THREE.Vector3();
    const place = (x, y, z, yaw = 0, pitch = 0, sx = 1, sy = 1, sz = 1) => M.compose(P3.set(x, y, z), Q.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ')), S.set(sx, sy, sz)).clone();
    const yawOf = (k) => k * 2 * HALF; // a facet's outward direction as a yaw about y (+z at 0)

    const info = [];
    const hookTips = [];
    const bulbs = []; // eave-light positions [x, y, z, tier]

    // the stone plinth
    const a0 = V.a0;
    const plinthH = 1.4;
    const oct = (B, apo, y0, h) => B.add(new THREE.CylinderGeometry(apo / Math.cos(HALF), apo / Math.cos(HALF), h, SIDES, 1, false, HALF), place(0, y0 + h / 2, 0));
    oct(stone, a0 + V.over0 * 0.9, 0, 0.85);
    oct(stone, a0 + V.over0 * 0.45, 0.85, plinthH - 0.85);
    // front steps
    for (let s = 0; s < 4; s++) { const h = plinthH * (1 - s / 4); box(stone, 3.2, h, 0.45, place(0, h / 2, a0 + V.over0 * 0.45 + 0.225 + s * 0.45)); }

    let Y = plinthH;
    for (let i = 0; i < T; i++) {
        const s = i / (T - 1), top = i === T - 1;
        const a = mix(V.a0, V.a1, Math.pow(s, 1.1));
        const aNext = top ? 0 : mix(V.a0, V.a1, Math.pow((i + 1) / (T - 1), 1.1));
        const wallH = mix(V.wall0, V.wall1, s);
        const over = mix(V.over0, V.over1, s);
        const bH = 0.62 * V.bScale, bOut = Math.min(over * 0.42, 0.55 * V.bScale + 0.2);
        const re = a + over; // eave apothem at mid-facet
        const yLintel = Y + wallH;
        const yBT = yLintel + bH; // bracket tops
        const sigma = 0.22; // the rafters rise toward the wall
        const yUE = yBT - sigma * (re - a - bOut); // eave underside at the edge
        const yU0 = yBT + sigma * bOut; // underside where it meets the wall
        const yE = yUE + V.thick; // eave top edge
        const r0 = top ? 0.62 : aNext + V.balc - 0.12; // roof's top edge (tucked under the balcony above)
        const rise = V.rise * (re - r0) * (top ? (V.topRise ?? 1.3) : 1);
        const yTop = yE + rise;

        const lift = V.lift * (0.85 + 0.3 * s), outM = V.out * over;
        const corner = (u, v) => Math.pow(Math.abs(u), V.q) * v * v * (0.4 + 0.6 * v);
        // the top surface: (k, u, v) → [x, y, z]
        const topPt = (k, u, v) => {
            const r = mix(r0, re, v), w = corner(u, v);
            let [x, z] = planPt(k, r, u);
            const ext = 1 + (outM * w) / Math.max(1, Math.hypot(x, z));
            x *= ext; z *= ext;
            const c = V.concave, f = 1 - v;
            const y = yE + rise * (f * (1 - c) + c * f * f) + lift * w;
            return [x, y, z];
        };
        const underPt = (k, u, v) => {
            const r = mix(a - 0.02, re, v), w = corner(u, v);
            let [x, z] = planPt(k, r, u);
            const ext = 1 + (outM * w) / Math.max(1, Math.hypot(x, z));
            x *= ext; z *= ext;
            return [x, mix(yU0, yUE, v) + lift * w, z];
        };

        // ---- roof top: tile rolls across each facet
        const edgeLen = 2 * re * TAN, nT = Math.max(10, Math.round(edgeLen / 0.3));
        const per = lod ? 3 : 6, NU = nT * per, NV = lod ? 12 : 26, slope = Math.hypot(re - r0, rise);
        const rollH = 0.07, courseLen = 0.32;
        for (let k = 0; k < SIDES; k++) {
            tiles.grid(NU, NV, (iu, jv) => {
                const u = -1 + (2 * iu) / NU, v = jv / NV;
                const p = topPt(k, u, v);
                const sT = (iu / per) % 1, d = Math.abs(sT - 0.5);
                // rolls are half-round (proud); between them the pans sag a little
                const hh = d < 0.26 ? rollH * Math.sqrt(1 - (d / 0.26) ** 2) : -0.012 * Math.sin(((d - 0.26) / 0.24) * Math.PI);
                p[1] += hh * (0.35 + 0.65 * Math.min(1, v * 4));
                return [p[0], p[1], p[2], iu / per, (v * slope) / courseLen];
            }, true);
            // round tile ends along the eave, one per roll, faced down the slope
            for (let t = 0; t < nT; t++) {
                const u = -1 + (2 * (t + 0.5)) / nT;
                const p = topPt(k, u, 1), q = topPt(k, u, 0.96);
                const dir = new THREE.Vector3(p[0] - q[0], p[1] - q[1], p[2] - q[2]).normalize();
                const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), dir, new THREE.Vector3(0, 1, 0));
                // flush with the roll's end (the roll's axis sits half its height above the surface)
                m.setPosition(p[0] + dir.x * 0.015, p[1] + rollH * 0.45, p[2] + dir.z * 0.015);
                if (!lod) ridges.add(new THREE.CylinderGeometry(0.068, 0.068, 0.04, 12).rotateX(Math.PI / 2), m);
            }
            // underside: rafters
            under.grid(16, 10, (iu, jv) => {
                const u = -1 + (2 * iu) / 16, v = jv / 10;
                const p = underPt(k, u, v);
                return [p[0], p[1], p[2], ((u + 1) / 2) * edgeLen / 0.32, v];
            });
            // fascia: the red board between tile edge and underside, along the eave
            fascia.grid(Math.round(NU / 2), 1, (iu, jv) => {
                const u = -1 + (2 * iu) / Math.round(NU / 2);
                const p = jv ? topPt(k, u, 1) : underPt(k, u, 1);
                if (jv) p[1] -= 0.02;
                return [p[0], p[1], p[2], iu / 8, jv];
            });
            // closure between the roof's top edge and the wall (hidden under the balcony: keeps light from leaking)
            deep.grid(8, 1, (iu, jv) => {
                const u = -1 + (2 * iu) / 8;
                const p = jv ? topPt(k, u, 0) : underPt(k, u, 0);
                return [p[0], p[1] - (jv ? 0.02 : 0), p[2]];
            }, true);
            // eave lights (the tier's "lit" outline), just under the fascia
            const nb = Math.round(edgeLen / 0.55);
            for (let b = 0; b < nb; b++) {
                const u = -1 + (2 * (b + 0.5)) / nb, p = underPt(k, u, 1), q = topPt(k, u, 1), f = 1 + 0.05 / Math.hypot(p[0], p[2]);
                bulbs.push([p[0] * f, (p[1] + q[1]) / 2, p[2] * f, i]);
            }
        }

        // ---- hip ridges + hooks + bells, one per corner (between facet k and k+1, at u = +1 of facet k)
        for (let k = 0; k < SIDES; k++) {
            const pts = [], rad = [];
            const N1 = 16;
            for (let j = 0; j <= N1; j++) {
                const v = j / N1, p = topPt(k, 1, v);
                pts.push(new THREE.Vector3(p[0], p[1] + 0.1, p[2]));
                rad.push(V.hookR * (1.05 - 0.15 * v));
            }
            // the hook: carry on along the ridge, turning up by hookAng over hookLen (tapering to a horn tip)
            const tEnd = pts[N1].clone().sub(pts[N1 - 1]).normalize();
            const hor = new THREE.Vector3(tEnd.x, 0, tEnd.z).normalize();
            const a0r = Math.atan2(tEnd.y, Math.hypot(tEnd.x, tEnd.z));
            const NH = 14, ds = V.hookLen / NH;
            let p = pts[N1].clone();
            for (let j = 1; j <= NH; j++) {
                const f = j / NH, ang = a0r + V.hookAng * DEG * Math.pow(f, V.hookPow ?? 1.3);
                p = p.clone().addScaledVector(hor, Math.cos(ang) * ds).addScaledVector(new THREE.Vector3(0, 1, 0), Math.sin(ang) * ds);
                pts.push(p); rad.push(V.hookR * mix(0.9, 0.32, Math.pow(f, 0.8)));
            }
            ridges.add(sweep(pts, rad, lod ? 6 : 10));
            hookTips.push(p.clone());
            // the ridge's base, where it dies into the balcony / spire: a small block
            // a bronze bell hanging under the ridge's end, on a short rod
            const e = topPt(k, 1, 1);
            const bx = e[0] + hor.x * 0.12, bz = e[2] + hor.z * 0.12, by = e[1] - V.thick - 0.12;
            bronze.add(bellGeo(), place(bx, by - 0.12, bz));
            iron.add(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 5), place(bx, by + 0.03, bz));
        }

        // ---- the walls (per tier: their own material, so the door glow can light per round)
        const wb = new Builder(), wbWin = new Builder();
        const col = 0.17;
        for (let k = 0; k < SIDES; k++) {
            const B = k % 2 ? wbWin : wb;
            B.grid(1, 1, (iu, jv) => {
                const u = iu ? 1 : -1, [x, z] = planPt(k, a, u * (1 - (col * 1.2) / (a * TAN)));
                return [x, jv ? yLintel : Y, z, iu, jv];
            });
            // bracket backing: dark lacquer from the lintel to where the rafters meet the wall
            deep.grid(1, 1, (iu, jv) => { const [x, z] = planPt(k, a - 0.01, iu ? 1 : -1); return [x, jv ? yU0 + 0.05 : yLintel, z]; });
            // the lintel beam
            const [lx, lz] = planPt(k, a + 0.05, 0);
            box(lacq, 2 * a * TAN, 0.34, 0.16, place(lx, yLintel - 0.17 + 0.02, lz, yawOf(k)));
            // a corner column at the facet's +u end
            const [cx, cz] = planPt(k, a + 0.04, 1);
            lacq.add(new THREE.CylinderGeometry(col, col * 1.05, yLintel - Y, 12), place(cx, (Y + yLintel) / 2, cz));
            // the bracket frieze: identical units at an even rhythm along the facet (dou block, cross-arm, two small
            // blocks at its ends) under a continuous beam, with a diagonal unit at each corner — no loose pieces
            const sc = V.bScale, yaw = yawOf(k), fx = Math.sin(yaw), fz = Math.cos(yaw), cxs = Math.cos(yaw), czs = -Math.sin(yaw);
            const half = a * TAN, pitch = 0.95 * sc, nU = Math.max(1, Math.floor((2 * half - 0.9) / pitch));
            const unit = (u, diag) => {
                const [bx, bz] = planPt(k, a + 0.1, u), uy = diag ? yaw + HALF : yaw;
                const ax = Math.cos(uy), az = -Math.sin(uy), w = (diag ? 0.55 : 0.78) * sc;
                box(lacq, 0.26 * sc, 0.2 * sc, 0.26 * sc, place(bx, yLintel + 0.1 * sc, bz, uy));
                box(deep, w, 0.13 * sc, 0.16 * sc, place(bx, yLintel + 0.265 * sc, bz, uy));
                for (const s2 of [-1, 1]) box(lacq, 0.17 * sc, 0.14 * sc, 0.2 * sc, place(bx + ax * s2 * (w / 2 - 0.08), yLintel + 0.4 * sc, bz + az * s2 * (w / 2 - 0.08), uy));
                box(lacq, 0.2 * sc, 0.14 * sc, 0.2 * sc, place(bx, yLintel + 0.4 * sc, bz, uy));
                box(gold, 0.08 * sc, 0.08 * sc, 0.02, place(bx + fx * 0.14 * sc, yLintel + 0.1 * sc, bz + fz * 0.14 * sc, uy));
            };
            for (let b = 0; b < nU; b++) {
                const u = ((b + 0.5) / nU) * 2 - 1;
                if (k === 0 && Math.abs(u * half) < 0.75) continue; // the plaque hangs here
                unit(u * (1 - 0.45 / half), false);
            }
            unit(1, true);
            // the beam the units carry, gilt-edged, running the facet
            const [mx2, mz2] = planPt(k, a + 0.1, 0);
            box(deep, 2 * half, Math.max(0.12, bH - 0.48 * sc), 0.2, place(mx2, yLintel + 0.47 * sc + Math.max(0.12, bH - 0.48 * sc) / 2, mz2, yaw));
            box(gold, 2 * half, 0.03, 0.21, place(mx2, yLintel + 0.475 * sc, mz2, yaw));
        }
        const wMat = mat('wall').clone();
        wMat.map = tx.wallDoor; wMat.emissiveMap = tx.glowDoor; wMat.emissive = new THREE.Color('#ffb060'); wMat.emissiveIntensity = 0;
        const wMatW = wMat.clone(); wMatW.map = tx.wallWin; wMatW.emissiveMap = tx.glowWin;
        const wallMesh = new THREE.Mesh(wb.build(), wMat), winMesh = new THREE.Mesh(wbWin.build(), wMatW);
        for (const m of [wallMesh, winMesh]) { m.castShadow = m.receiveShadow = true; G.add(m); }

        // ---- the plaque over the front door (facet 0)
        const pq = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.66), new THREE.MeshStandardMaterial({ map: plaqueTex(i + 1), roughness: 0.75, metalness: 0, emissive: '#ffffff', emissiveMap: null, emissiveIntensity: 0 }));
        pq.material.emissiveMap = pq.material.map;
        // it hangs under the eave in front of the bracket band, tipped forward a little (as real plaques are)
        pq.position.set(0, yLintel + 0.12, a + 0.31); pq.rotation.x = 0.12;
        G.add(pq);
        box(gold, 1.15, 0.76, 0.05, place(0, pq.position.y, a + 0.225, 0, 0.12));

        // ---- the balcony this tier stands on (tier 0 stands on the plinth)
        if (i > 0) {
            const ab = a + V.balc;
            oct(deep, ab, Y - 0.17, 0.17);
            oct(stone, ab - 0.04, Y - 0.005, 0.01);
            const railH = 0.92;
            for (let k = 0; k < SIDES; k++) {
                const [c0x, c0z] = planPt(k, ab - 0.06, -1), [c1x, c1z] = planPt(k, ab - 0.06, 1);
                const len = Math.hypot(c1x - c0x, c1z - c0z), yaw = yawOf(k), mx = (c0x + c1x) / 2, mz = (c0z + c1z) / 2;
                box(lacq, len, 0.09, 0.1, place(mx, Y + railH, mz, yaw));
                box(lacq, len, 0.07, 0.07, place(mx, Y + 0.12, mz, yaw));
                box(lacq, len, 0.05, 0.05, place(mx, Y + railH * 0.62, mz, yaw));
                box(lacq, 0.12, railH + 0.12, 0.12, place(c1x, Y + (railH + 0.12) / 2, c1z, yaw + HALF));
                const nbal = Math.max(4, Math.round(len / (lod ? 0.6 : 0.24)));
                for (let b = 1; b < nbal; b++) { const f = b / nbal; box(lacq, 0.04, railH * 0.62 - 0.12, 0.04, place(mix(c0x, c1x, f), Y + 0.12 + (railH * 0.62 - 0.12) / 2, mix(c0z, c1z, f), yaw)); }
            }
        }

        info.push({ index: i, y: Y, yLintel, yEave: yE, yTop, a, re, wallMesh, winMesh, plaque: pq, mats: [wMat, wMatW] });
        Y = top ? yTop : yTop + 0.1;
    }

    // ---- the spire: base, lotus bowl, mast with seven rings, canopy, chains to the top hooks, gold gourd
    const yS = Y, sc = V.spire;
    oct(deep, 0.72, yS - 0.2, 0.75);
    bronze.add(new THREE.LatheGeometry([[0.25, 0], [0.7, 0.12], [0.9, 0.38], [0.86, 0.46], [0.5, 0.4], [0.3, 0.5]].map(([x, y]) => new THREE.Vector2(x, y)), 24), place(0, yS + 0.55, 0));
    const mastH = 7.2 * sc;
    iron.add(new THREE.CylinderGeometry(0.16, 0.22, mastH, 12), place(0, yS + 1 + mastH / 2, 0));
    // an inverted bowl (fubo) at the mast's foot, then the seven rings stacking up and in
    iron.add(new THREE.LatheGeometry([[0.2, 0], [0.75, 0.05], [0.95, 0.3], [0.82, 0.62], [0.3, 0.8]].map(([x, y]) => new THREE.Vector2(x, y)), 20), place(0, yS + 0.95, 0));
    for (let r = 0; r < 7; r++) {
        const yr = yS + 2.05 + r * 0.6 * sc, rr = mix(1.0, 0.55, r / 6);
        bronze.add(new THREE.TorusGeometry(rr, 0.1, 8, 28).rotateX(Math.PI / 2), place(0, yr, 0));
        iron.add(new THREE.CylinderGeometry(rr * 0.92, rr * 0.92, 0.08, 20), place(0, yr, 0));
    }
    const yC = yS + 2.05 + 7 * 0.6 * sc + 0.2;
    bronze.add(new THREE.LatheGeometry([[0.08, 0.32], [0.5, 0.18], [0.95, 0], [0.98, -0.06], [0.92, -0.04]].map(([x, y]) => new THREE.Vector2(x, y)), 24), place(0, yC, 0));
    for (let k = 0; k < 8; k++) { const a = (k + 0.5) * 2 * HALF; bronze.add(new THREE.CylinderGeometry(0.03, 0.05, 0.32, 6), place(Math.sin(a) * 0.93, yC - 0.2, Math.cos(a) * 0.93)); }
    const yG = yC + 0.35;
    gold.add(gourdGeo(1.9 * Math.max(0.85, sc)), place(0, yG, 0));
    // chains: from the canopy rim to the top roof's hook tips, sagging
    const topHooks = hookTips.slice(-SIDES);
    for (let k = 0; k < SIDES; k++) {
        const a = (k + 0.5) * 2 * HALF, A = new THREE.Vector3(Math.sin(a) * 0.92, yC - 0.05, Math.cos(a) * 0.92), Bp = topHooks[k].clone().add(new THREE.Vector3(0, -0.1, 0));
        const pts = [], rad = [];
        for (let j = 0; j <= 16; j++) { const f = j / 16, q = A.clone().lerp(Bp, f); q.y -= Math.sin(f * Math.PI) * 0.45; pts.push(q); rad.push(0.022); }
        iron.add(sweep(pts, rad, 5));
    }

    // ---- assemble
    const add = (B, m, shadow = true) => { if (!B.count) return null; const mesh = new THREE.Mesh(B.build(), m); mesh.castShadow = shadow; mesh.receiveShadow = true; G.add(mesh); return mesh; };
    const tileMat = mat('tile').clone(); tileMat.map = tx.tile; tileMat.color.set('#ffffff'); tileMat.roughness = 0.5;
    const underMat = new THREE.MeshStandardMaterial({ map: tx.rafters, roughness: 0.75 });
    add(tiles, tileMat); add(ridges, mat('ridge')); add(under, underMat); add(fascia, mat('lacquer')); add(deep, mat('lacquerDeep'));
    add(lacq, mat('lacquer')); add(gold, mat('gold')); add(bronze, mat('bronze')); add(iron, mat('iron')); add(stone, mat('stone'));
    add(jade, new THREE.MeshPhysicalMaterial({ color: '#2b5b50', roughness: 0.5, clearcoat: 0.4 }));

    // eave lights: one instanced set for every tier, coloured per tier by setLit
    const bulbGeo = new THREE.SphereGeometry(0.035, 8, 6);
    const bulbMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: true });
    const bulbMesh = new THREE.InstancedMesh(bulbGeo, bulbMat, bulbs.length);
    bulbMesh.frustumCulled = false; // instances sit far from the origin
    bulbs.forEach(([x, y, z], i) => { M.makeTranslation(x, y, z); bulbMesh.setMatrixAt(i, M); });
    G.add(bulbMesh);

    const lit = new Array(T).fill(0);
    const OFF = new THREE.Color('#4a1410'), ON = new THREE.Color('#ffc46a').multiplyScalar(7), tmpC = new THREE.Color();
    function setLit(n, k = 1) {
        lit[n] = k;
        const t = info[n];
        t.mats.forEach((m) => { m.emissiveIntensity = 2.2 * k; });
        t.plaque.material.emissiveIntensity = 0.15 + 1.6 * k;
        bulbs.forEach((b, i) => { if (b[3] === n) bulbMesh.setColorAt(i, tmpC.copy(OFF).lerp(ON, k)); });
        bulbMesh.instanceColor.needsUpdate = true;
    }
    for (let i = 0; i < T; i++) { bulbs.forEach((b, j) => { if (b[3] === i) bulbMesh.setColorAt(j, OFF); }); }
    for (let i = 0; i < T; i++) setLit(i, 0);

    G.userData = { tiers: info, height: yG + 1.9 * Math.max(0.85, sc), spireY: yS, hookTips, setLit, lit, variant: V, bulbs: bulbMesh };
    return G;
}
