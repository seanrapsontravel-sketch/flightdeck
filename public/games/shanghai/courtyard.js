// The courtyard: stone paving and steps, the moon gate (the board) in its red wall, the pagoda behind it on a
// stone terrace (offset right so its lowest tier — round 1 — clears the wall), braziers, and one station per player.
//
// Stations (no people): three either side of the board so nothing stands between the lens and the gate. Each is a
// lacquered post with a hanging lantern in the player's colour, a hanging scroll with their name, total and the
// eight round cells (the 2D page's score table, made physical) and a stone step that lights on their turn. The DOM
// HUD is the readable truth; the scrolls show the same numbers.
import * as THREE from 'three';
import { Flames } from '../limbo/fire.js';
import { BOARD_Y, Builder, PAL, canvasTex, mat, rng, sweep } from './common.js';
import { moonGate, tiledStrip } from './gate.js';
import { pagoda } from './pagoda.js';
import { skyLantern } from './lanterns.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const STATION_Z = 5.6, STEP_Y = 0.36;
export const PAGODA_AT = V(26, 7, -62);
const FONT = '"Avenir Next Condensed","DIN Condensed","Roboto Condensed","Arial Narrow",Arial,sans-serif';

/** where station i of n stands: left half then right half, in HUD column order */
export function stationX(i, n) {
    const left = Math.ceil(n / 2), right = n - left;
    if (i < left) return -(4.6 + (left - 1 - i) * 2.45);
    return 4.6 + (i - left) * 2.45 * (right ? 1 : 0);
}

export class Courtyard {
    constructor(engine) {
        this.engine = engine;
        const S = engine.scene;
        this.group = new THREE.Group(); S.add(this.group);
        // paving
        const pave = canvasTex(512, 512, (g, w) => {
            g.fillStyle = '#5d5852'; g.fillRect(0, 0, w, w);
            const r = rng(7);
            for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) { const o = (y % 2) * 64, l = 100 + r() * 12; g.fillStyle = `rgb(${l},${l - 4},${l - 10})`; g.fillRect(x * 128 + o + 3, y * 64 + 3, 122, 58); }
            for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.08})`; g.fillRect(r() * w, r() * w, 2, 2); }
        }, { repeat: true });
        pave.repeat.set(60, 60);
        const ground = new THREE.Mesh(new THREE.CircleGeometry(300, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: pave, roughness: 0.82, envMapIntensity: 0.6 }));
        ground.receiveShadow = true; this.group.add(ground);
        // the gate
        this.gate = moonGate({ target: 1 }); this.group.add(this.gate);
        // the pagoda on its terrace
        this.pagoda = pagoda({ variant: 'A', lod: 1 });
        this.pagoda.position.copy(PAGODA_AT); this.pagoda.rotation.y = -0.12; this.group.add(this.pagoda);
        // it stands outside the key light's shadow box (sized to the courtyard), so it can't cast into it: skip the pass
        this.pagoda.traverse((m) => { if (m.isMesh) m.castShadow = false; });
        const terrace = new THREE.Mesh(new THREE.CylinderGeometry(16, 19, PAGODA_AT.y, 8, 1, false, Math.PI / 8), new THREE.MeshStandardMaterial({ color: '#6e675e', roughness: 0.95 }));
        terrace.position.set(PAGODA_AT.x, PAGODA_AT.y / 2, PAGODA_AT.z); terrace.receiveShadow = terrace.castShadow = true; this.group.add(terrace);
        // the steps the stations stand along
        const stone = new THREE.MeshStandardMaterial({ color: '#7b766e', roughness: 0.9 });
        for (let s = 0; s < 2; s++) { const st = new THREE.Mesh(new THREE.BoxGeometry(30, 0.18, 1.3), stone); st.position.set(0, 0.09 + s * 0.18, 6.9 - s * 1.3); st.receiveShadow = st.castShadow = true; this.group.add(st); }
        // braziers either side of the gate (their fire is a practical: emissive + bloom, no new lights)
        this.flames = new Flames(S, engine.time, 40);
        for (const s of [-1, 1]) {
            const b = new THREE.Group(); b.position.set(s * 3.6, 0, 1.4); this.group.add(b);
            const bowl = new THREE.Mesh(new THREE.LatheGeometry([[0.05, 0], [0.5, 0.1], [0.62, 0.38], [0.58, 0.4]].map(([x, y]) => new THREE.Vector2(x, y)), 24), new THREE.MeshStandardMaterial({ color: '#6a4a26', metalness: 1, roughness: 0.4, side: THREE.DoubleSide }));
            bowl.position.y = 1.0; b.add(bowl);
            for (let l = 0; l < 3; l++) { const a = (l / 3) * Math.PI * 2; const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.05, 6), bowl.material); leg.position.set(Math.cos(a) * 0.32, 0.5, Math.sin(a) * 0.32); leg.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25); b.add(leg); }
            for (let f = 0; f < 5; f++) this.flames.add({ p: V(s * 3.6 + (f - 2) * 0.12, 1.3, 1.4 + ((f % 2) - 0.5) * 0.15), w: 0.45, h: 1.1, seed: f * 0.21 + (s > 0 ? 0.5 : 0), speed: 0.4 + f * 0.1, intensity: 1 });
        }
        this.flames.flush();
        this.stations = [];
        this.stationRoot = new THREE.Group(); this.group.add(this.stationRoot);
        this.lit = 0; this.tierAnim = null; this.night = 0;
        this.dress();
        // lantern spill on the gong and the board (made at load, like every light: adding one later recompiles every
        // shader); it rises as the night falls so the gong never goes dark
        this.spill = new THREE.SpotLight('#ffc47a', 0, 0, 0.42, 0.65, 2);
        this.spill.position.set(0, 12.5, 9); this.spill.target.position.set(0, 6.2, 0);
        S.add(this.spill, this.spill.target);
    }

    // ------------------------------------------------------------ dressing (quiet; it frames the gate and the tower)
    dress() {
        const G = this.group, R = rng(21);
        // red palace lanterns: under the gatehouse roof's corners and along the low wall
        const pl = new THREE.LatheGeometry([[0.06, -0.36], [0.24, -0.3], [0.36, -0.12], [0.38, 0.02], [0.34, 0.18], [0.2, 0.3], [0.06, 0.34]].map(([x, y]) => new THREE.Vector2(x, y)), 20);
        this.palaceMat = new THREE.MeshStandardMaterial({ color: '#c8241c', roughness: 0.7, emissive: new THREE.Color('#ff5a2a'), emissiveIntensity: 0.8 });
        const capGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.08, 14), tassel = new THREE.ConeGeometry(0.05, 0.3, 8);
        const spots = [[-4.6, 9.1, 0.9], [4.6, 9.1, 0.9]];
        for (let x = -16; x <= 16; x += 3.2) if (Math.abs(x) > 5.5) spots.push([x, 4.35, 0.75]);
        this.palace = [];
        for (const [x, y, z] of spots) {
            const g = new THREE.Group(); g.position.set(x, y, z); G.add(g);
            const body = new THREE.Mesh(pl, this.palaceMat); g.add(body);
            for (const yy of [0.37, -0.39]) { const c = new THREE.Mesh(capGeo, mat('gold')); c.position.y = yy; g.add(c); }
            const t = new THREE.Mesh(tassel, this.palaceMat); t.position.y = -0.62; t.rotation.x = Math.PI; g.add(t);
            const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 5), mat('iron')); cord.position.y = 0.65; g.add(cord);
            this.palace.push(g);
        }
        // the bg photo's own foreground eave: a dark tiled roof corner crossing the top left of the frame
        {
            const s = tiledStrip(16, 2.4, 1.0, { lift: 1.6, flick: 1.0 });
            const eave = new THREE.Group(); eave.position.set(-9.5, 9.8, 16.2); eave.rotation.set(0.34, 0.66, -0.24); G.add(eave);
            for (const [B, m] of [[s.tiles, mat('tile')], [s.ridge, mat('ridge')], [s.under, mat('lacquerDeep')]]) { const mesh = new THREE.Mesh(B.build(), m); eave.add(mesh); }
            // rafters under it, red, catching the lanterns' light
            const raf = new Builder();
            for (let i = 0; i < 24; i++) raf.add(new THREE.BoxGeometry(0.12, 0.12, 2.6), new THREE.Matrix4().makeTranslation(-7.6 + i * 0.66, -0.35, 1.1));
            eave.add(new THREE.Mesh(raf.build(), mat('lacquer')));
        }
        // plum trees in blossom either side, beyond the outer stations
        const bark = new THREE.MeshStandardMaterial({ color: '#2a1a14', roughness: 0.9 });
        const blossom = new THREE.MeshStandardMaterial({ color: '#f4b8c8', roughness: 0.8, emissive: new THREE.Color('#ff9ab4'), emissiveIntensity: 0.12 });
        this.blossomMat = blossom;
        for (const [x, z, sd] of [[-16.6, 1.4, 5], [16.8, 1.0, 9]]) {
            const T = rng(sd), wood = new Builder(), tips = [];
            const grow = (p, d, len, r, depth) => {
                const pts = [p.clone()], rad = [r];
                let q = p.clone(), dir = d.clone();
                for (let k = 1; k <= 5; k++) { dir.add(new THREE.Vector3((T() - 0.5) * 0.5, (T() - 0.35) * 0.3, (T() - 0.5) * 0.4)).normalize(); q = q.clone().addScaledVector(dir, len / 5); pts.push(q); rad.push(r * (1 - k / 6.5)); }
                wood.add(sweep(pts, rad, 6));
                if (depth <= 0) { tips.push(q); return; }
                const nb = 2 + (T() < 0.4 ? 1 : 0);
                for (let b = 0; b < nb; b++) { const nd = dir.clone().add(new THREE.Vector3((T() - 0.5) * 1.6, T() * 0.5, (T() - 0.5) * 1.2)).normalize(); grow(q, nd, len * 0.7, r * 0.6, depth - 1); }
                tips.push(q);
            };
            grow(new THREE.Vector3(x, 0, z), new THREE.Vector3(x > 0 ? -0.25 : 0.25, 1, 0.1).normalize(), 3.2, 0.22, 4);
            const tree = new THREE.Mesh(wood.build(), bark); tree.castShadow = true; G.add(tree);
            // blossom: small clusters round every branch tip
            const n = tips.length * 14, inst = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.07, 0), blossom, n);
            inst.frustumCulled = false;
            const M = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
            let k = 0;
            for (const t of tips) for (let m = 0; m < 14; m++, k++) { const o = new THREE.Vector3((T() - 0.5) * 0.9, (T() - 0.3) * 0.6, (T() - 0.5) * 0.9); q.setFromEuler(new THREE.Euler(T() * 6, T() * 6, 0)); sc.setScalar(0.7 + T() * 0.9); M.compose(t.clone().add(o), q, sc); inst.setMatrixAt(k, M); }
            G.add(inst);
        }
        // distant halls behind the wall on the left (the pagoda has the right): low red walls, swept tiled roofs
        for (const [x, z, L, h] of [[-22, -34, 18, 5.5], [-6, -46, 14, 6.5], [-36, -58, 20, 7]]) {
            const hall = new THREE.Mesh(new THREE.BoxGeometry(L, h, 8), mat('courtyard')); hall.position.set(x, h / 2, z); hall.receiveShadow = true; G.add(hall);
            const s = tiledStrip(L + 2.4, 5.2, 2.6, { lift: 0.9, flick: 0.8 });
            for (const [B, m] of [[s.tiles, mat('tile')], [s.ridge, mat('ridge')], [s.under, mat('lacquerDeep')]]) { const mesh = new THREE.Mesh(B.build(), m); mesh.position.set(x, h, z); G.add(mesh); }
        }
        // the spire's light (round 8): a gold glow at the finial
        const gc = document.createElement('canvas'); gc.width = gc.height = 128;
        const gg = gc.getContext('2d'), gr = gg.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); gg.fillStyle = gr; gg.fillRect(0, 0, 128, 128);
        this.spireGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(gc), color: new THREE.Color('#ffc861').multiplyScalar(3), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
        this.spireGlow.scale.setScalar(3.6);
        this.pagoda.updateMatrixWorld(true);
        this.spireGlow.position.copy(new THREE.Vector3(0, this.pagoda.userData.spireY + 9.5, 0).applyMatrix4(this.pagoda.matrixWorld));
        G.add(this.spireGlow);
        void R;
    }
    /** how far into the night (0 round 1 … 1 round 8): practicals glow harder as it darkens */
    setNight(t) {
        this.night = t;
        this.palaceMat.emissiveIntensity = 0.7 + 2.6 * t;
        if (this.spill) this.spill.intensity = 25 + 140 * t;
        this.blossomMat.emissiveIntensity = 0.1 + 0.25 * t;
        for (const st of this.stations) st.lamp.userData.paper.material.emissiveIntensity = 1.2 + 1.4 * t + (st.active ? 1.2 : 0);
    }

    // ------------------------------------------------------------ stations
    /** players: [{ name, color }] */
    setPlayers(players) {
        for (const s of this.stations) this.stationRoot.remove(s.group);
        const n = players.length;
        this.stations = players.map((p, i) => this.makeStation(p, i, n));
    }
    makeStation(p, i, n) {
        const g = new THREE.Group(); g.position.set(stationX(i, n), STEP_Y, STATION_Z); this.stationRoot.add(g);
        const lac = mat('lacquer');
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.4, 10), lac); pole.position.set(-0.9, 1.7, 0); pole.castShadow = true; g.add(pole);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.07, 0.07), lac); arm.position.set(-0.45, 3.35, 0); g.add(arm);
        // the lantern tree: a second arm on the pole carrying four strings beside the scroll (lanterns.js fills them)
        const tree = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.06, 0.06), lac); tree.position.set(1.0, 3.35, -0.2); g.add(tree);
        const cords = new Builder();
        for (let c = 0; c < 4; c++) cords.add(new THREE.CylinderGeometry(0.006, 0.006, 2.65, 4), new THREE.Matrix4().makeTranslation(0.78 + c * 0.25, 2.02, -0.15 - (c % 2) * 0.12));
        g.add(new THREE.Mesh(cords.build(), new THREE.MeshStandardMaterial({ color: '#d8c8a0', roughness: 0.8 })));
        const lamp = skyLantern(p.color, { glow: 1.2, halo: true }); lamp.scale.setScalar(0.55); lamp.position.set(0, 2.9, 0); g.add(lamp);
        // the scroll: a canvas redrawn when its numbers change
        const c = document.createElement('canvas'); c.width = 256; c.height = 512;
        const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
        const scrollMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, side: THREE.DoubleSide, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.12 });
        const scroll = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.8), scrollMat); scroll.position.set(0.15, 1.6, 0.05); g.add(scroll);
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 8).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#3a2416' })); rod.position.set(0.15, 2.52, 0.05); g.add(rod);
        // the step that lights on their turn
        const padMat = new THREE.MeshStandardMaterial({ color: '#57524b', roughness: 0.8, emissive: new THREE.Color(p.color), emissiveIntensity: 0 });
        const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.04, 32), padMat); pad.position.set(0, 0.02, 0.4); pad.receiveShadow = true; g.add(pad);
        const st = { group: g, name: p.name, color: p.color, canvas: c, tex, scroll, scrollMat, padMat, lamp, unroll: null, score: 0, rounds: Array(8).fill(null), round: 1, active: false, winner: false };
        this.drawScroll(st);
        return st;
    }
    drawScroll(st) {
        const g = st.canvas.getContext('2d'), w = 256, h = 512;
        g.fillStyle = st.winner ? '#f6dc8a' : '#efe3c4'; g.fillRect(0, 0, w, h);
        g.fillStyle = st.color; g.fillRect(0, 0, w, 24); g.fillRect(0, h - 24, w, 24);
        g.fillStyle = '#2a1a10'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        let fs = 46; g.font = `800 ${fs}px ${FONT}`;
        while (g.measureText(st.name).width > w - 24 && fs > 18) { fs -= 2; g.font = `800 ${fs}px ${FONT}`; }
        g.fillText(st.name, w / 2, 80);
        g.font = `900 140px ${FONT}`; g.fillStyle = '#8a1a14'; g.fillText(String(st.score), w / 2, 240);
        // the eight round cells
        for (let r = 0; r < 8; r++) {
            const y = 276 + r * 26, cur = r + 1 === st.round;
            g.fillStyle = cur ? 'rgba(232,181,76,0.45)' : 'rgba(0,0,0,0.04)'; g.fillRect(28, y, w - 56, 24);
            g.strokeStyle = 'rgba(40,20,10,0.35)'; g.lineWidth = 2; g.strokeRect(28, y, w - 56, 24);
            g.font = `700 20px ${FONT}`; g.fillStyle = '#5a3a20'; g.textAlign = 'left'; g.fillText(String(r + 1), 38, y + 19);
            g.textAlign = 'right'; g.fillStyle = '#2a1a10'; g.fillText(st.rounds[r] == null ? '' : String(st.rounds[r]), w - 38, y + 19);
        }
        g.textAlign = 'center';
        st.tex.needsUpdate = true;
    }
    /** numbers from the state (redraws only on change) */
    setScore(i, score, rounds, round) {
        const st = this.stations[i]; if (!st) return;
        const r = (rounds || []).slice(0, 8);
        if (st.score === score && st.round === round && r.every((v, k) => v === st.rounds[k])) return;
        st.score = score; st.round = round; st.rounds = Array.from({ length: 8 }, (_, k) => (r[k] == null ? null : r[k]));
        this.drawScroll(st);
    }
    setActive(i) {
        this.stations.forEach((st, k) => { st.active = k === i; st.padMat.emissiveIntensity = st.active ? 1.4 : 0; st.scrollMat.emissiveIntensity = st.active ? 0.32 : 0.12; });
        this.setNight(this.night);
    }
    /** intermission: the next player's scroll unrolls */
    unroll(i) { const st = this.stations[i]; if (st) st.unroll = 0; }
    /** where player i's lanterns gather (above their station's lantern) */
    cloudAnchor(i) { const st = this.stations[i]; return st ? st.group.position.clone().add(V(0, 2.9, 0)) : V(0, 3.3, STATION_Z); }
    setWinner(i) { this.stations.forEach((st, k) => { const w = k === i; if (st.winner !== w) { st.winner = w; this.drawScroll(st); } }); }
    setLitStations(list) { this.stations.forEach((st, k) => { st.padMat.emissiveIntensity = list.includes(k) ? 1.4 : st.active ? 1.4 : 0; }); }
    /** a station's world anchor (its scroll's centre) */
    anchor(i) { const st = this.stations[i]; return st ? st.group.position.clone().add(V(0.15, 1.6, 0)) : V(0, 1.6, STATION_Z); }

    // ------------------------------------------------------------ the round tracker
    /** tiers 1..n lit (n = the current round); a Shanghai or the last round keeps them all */
    setTiers(n, animate = false) {
        const P = this.pagoda.userData;
        this.lit = n;
        for (let i = 0; i < P.tiers.length; i++) P.setLit(i, i < n ? (animate && i === n - 1 ? 0 : 1) : 0);
        // the newest tier ramps up (a flicker, then full) rather than snapping on
        this.tierAnim = animate ? { i: n - 1, t: 0 } : null;
        this.spireOn = n >= P.tiers.length;
    }
    get tiersLit() { return this.pagoda.userData.lit.filter((k) => k > 0.5).length; }
    /** world points of the pagoda's tower (base of tier 1, top roof's corners) for camera framing */
    pagodaPoints() {
        const P = this.pagoda, T = P.userData.tiers, top = T[T.length - 1], base = T[0];
        P.updateMatrixWorld(true);
        const w = (v) => v.applyMatrix4(P.matrixWorld);
        // (and most of the spire, so the tower doesn't read as cut off)
        return [w(V(-base.re, base.y, 0)), w(V(base.re, base.y, 0)), w(V(-top.re, top.yTop, 0)), w(V(top.re, top.yTop, 0)), w(V(0, P.userData.spireY + 6.5, 0))];
    }
    /** a point on tier n's front (its plaque), world */
    tierPoint(n) {
        const P = this.pagoda, t = P.userData.tiers[Math.max(0, Math.min(7, n - 1))];
        P.updateMatrixWorld(true);
        return V(0, t.yLintel, t.a + 0.4).applyMatrix4(P.matrixWorld);
    }
    update(dt) {
        const t = this.engine.time.value;
        for (const st of this.stations) {
            st.lamp.rotation.y = Math.sin(t * 0.6 + st.group.position.x) * 0.15;
            if (st.unroll != null) { st.unroll = Math.min(1, st.unroll + dt * 2.2); const e = 1 - Math.pow(1 - st.unroll, 3); st.scroll.scale.y = 0.08 + 0.92 * e; st.scroll.position.y = 2.5 - 0.9 * st.scroll.scale.y; if (st.unroll >= 1) st.unroll = null; }
        }
        for (const g of this.palace) g.rotation.z = Math.sin(t * 0.8 + g.position.x) * 0.03;
        if (this.tierAnim) {
            const A = this.tierAnim; A.t += dt;
            const k = A.t < 0.25 ? (Math.sin(A.t * 70) > 0 ? 0.6 : 0.1) : Math.min(1, 0.4 + (A.t - 0.25) * 1.5);
            this.pagoda.userData.setLit(A.i, k);
            if (k >= 1) this.tierAnim = null;
        }
        const so = this.spireGlow.material, want = this.spireOn ? 0.55 + 0.1 * Math.sin(t * 2.3) : 0;
        so.opacity += (want - so.opacity) * Math.min(1, dt * 2);
    }
}
export { BOARD_Y, PAL };
