// The chips (docs/plans/ZERO-HOUR.md §7.2) and the sweep (§8). One InstancedMesh draws every chip on the table, in
// the trays and in flight. A chip is a lathed disc with a bevelled edge; its decoration is procedural (no textures):
// the player's colour, ivory edge inserts round the rim and down the side, a gold ring, and an ivory medallion with
// the seat's pips (1–6), the second cue after colour.
//
// The layout is derived from the state only: every drop the engine recorded (players[].drops, each with its pocket)
// becomes `chips` chips keyed player|round|k|j, stacked in seat order in the drop's cell. So a refresh or a reconnect
// builds the whole table in one frame; a correction that removes chips lifts them away; nothing else moves.
//
// The sweep: after a visit's third dart, that visit's drops leave the thrower's tray in a staggered fan, slide in low
// arcs across the felt, and settle on their stacks with a small bounce. onLand(drop) fires as each drop settles.
import * as THREE from 'three';
import { V, CHIP_R, CHIP_H, STACK_CAP, stackSpot, trayAt, clamp01, easeOut, hash01, IVORY } from './common.js';

const MAX = 6000;
const TRAY_STACK = 12; // chips per tray stack before the next stack starts

function chipGeometry() {
    const R = CHIP_R, H = CHIP_H, b = 0.0009;
    const pts = [[0, 0], [R - b, 0], [R - b * 0.3, b * 0.3], [R, b], [R, H - b], [R - b * 0.3, H - b * 0.3], [R - b, H], [0, H]].map(([x, y]) => new THREE.Vector2(x, y));
    const g = new THREE.LatheGeometry(pts, 28);
    g.computeVertexNormals();
    return g;
}

function chipMaterial() {
    const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.32, metalness: 0 });
    m.onBeforeCompile = (sh) => {
        sh.uniforms.uR = { value: CHIP_R };
        sh.uniforms.uH = { value: CHIP_H };
        sh.uniforms.uIvory = { value: new THREE.Color(IVORY) };
        sh.vertexShader = sh.vertexShader
            .replace('#include <common>', '#include <common>\nattribute float aSeat;\nvarying float vSeat;\nvarying vec3 vObj;\nvarying vec3 vObjN;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSeat = aSeat; vObj = position; vObjN = normal;');
        sh.fragmentShader = sh.fragmentShader
            .replace('#include <common>', '#include <common>\nuniform float uR, uH; uniform vec3 uIvory;\nvarying float vSeat;\nvarying vec3 vObj;\nvarying vec3 vObjN;\nfloat zhRough = 0.32;')
            .replace('#include <color_fragment>', `
                vec3 pc = vec3(1.0);
                #if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
                    pc = vColor.rgb;
                #endif
                float r = length(vObj.xz) / uR;
                float ang = atan(vObj.z, vObj.x) / 6.2831853 + 0.5;
                float insert = step(0.5, fract(ang * 8.0 + 0.25));
                vec3 gold = vec3(0.78, 0.58, 0.24);
                // a pale player colour (ivory) gets charcoal inserts and dark-gold pips, like a classic white chip
                // (burgundy read too close to the scarlet player's red-and-ivory chips at TV distance)
                float pale = step(0.6, dot(pc, vec3(0.2126, 0.7152, 0.0722)));
                vec3 ins = mix(uIvory, vec3(0.09, 0.09, 0.1), pale);
                vec3 pipC = mix(pc, vec3(0.45, 0.3, 0.1), pale);
                vec3 col = pc;
                if (abs(vObjN.y) > 0.6) {
                    // a face: edge band with inserts, gold ring, colour ring, ivory medallion with the seat's pips
                    if (r > 0.82) col = mix(pc, ins, insert);
                    else if (r > 0.77) col = gold;
                    else if (r > 0.5) col = pc;
                    else if (r > 0.46) col = uIvory * 0.92;
                    else {
                        col = uIvory;
                        float n = floor(vSeat + 0.5) + 1.0;
                        float pip = 1.0;
                        if (n < 1.5) pip = length(vObj.xz / uR);
                        else for (int k = 0; k < 6; k++) {
                            if (float(k) >= n) break;
                            float a = 6.2831853 * float(k) / n + 1.5708;
                            pip = min(pip, length(vObj.xz / uR - 0.24 * vec2(cos(a), sin(a))));
                        }
                        col = mix(pipC, col, smoothstep(0.075, 0.095, pip));
                        zhRough = 0.4;
                    }
                } else {
                    // the side: ivory inserts across the middle of the edge
                    float h = vObj.y / uH;
                    col = mix(pc, ins, insert * step(0.22, h) * step(h, 0.78));
                }
                diffuseColor.rgb = col;
            `)
            .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = zhRough;');
    };
    return m;
}

export class Chips {
    constructor(scene) {
        this.scene = scene;
        const geo = chipGeometry();
        this.seatAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1);
        geo.setAttribute('aSeat', this.seatAttr);
        this.mesh = new THREE.InstancedMesh(geo, chipMaterial(), MAX);
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.mesh.setColorAt(0, new THREE.Color('#ffffff'));
        // the chips receive shadows; a cheap 10-sided stand-in casts them, sharing the chips' instance matrices, so the
        // shadow pass doesn't redraw every lathed chip. The stand-in writes no colour or depth in the main pass (three
        // r160's shadow pass tests layers against the MAIN camera, so a shadow-only layer isn't an option)
        this.mesh.castShadow = false; this.mesh.receiveShadow = true;
        this.mesh.frustumCulled = false;
        this.mesh.count = 0;
        scene.add(this.mesh);
        const proxyGeo = new THREE.CylinderGeometry(CHIP_R * 0.98, CHIP_R * 0.98, CHIP_H, 10, 1).translate(0, CHIP_H / 2, 0);
        this.shadow = new THREE.InstancedMesh(proxyGeo, new THREE.MeshBasicMaterial({ color: '#000', colorWrite: false, depthWrite: false }), MAX);
        this.shadow.instanceMatrix = this.mesh.instanceMatrix;
        this.shadow.castShadow = true; this.shadow.frustumCulled = false; this.shadow.count = 0;
        scene.add(this.shadow);
        this.chips = new Map();    // key → chip
        this.order = [];           // instance order
        this.tray = new Map();     // seat → tray chips shown (the visit so far)
        this.colors = [];
        this.n = 0;
        this.dirty = true;
        this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3();
        this._c = new THREE.Color();
        this.landed = 0;
    }

    setPlayers(colors) { this.colors = colors.slice(); this.n = colors.length; this.chips.clear(); this.tray.clear(); this.dirty = true; }

    /** where tray chip i sits for seat s */
    trayPos(s, i) {
        const t = trayAt(s, this.n), stack = Math.floor(i / TRAY_STACK), lvl = i % TRAY_STACK;
        const col = stack % 5, row = Math.floor(stack / 5) % 2, layer = Math.floor(stack / 10);
        return V(t.x - 0.08 + col * 0.04, 0.014 + (lvl + layer * TRAY_STACK) * CHIP_H, t.z - 0.012 + row * 0.024);
    }

    /** the visit so far, as chips in the thrower's tray (Beat 2): floor(points / 5) chips */
    setTray(seat, points) {
        for (const [s] of this.tray) if (s !== seat) this.tray.delete(s);
        const want = seat >= 0 ? Math.min(240, Math.floor(points / 5)) : 0;
        const had = this.tray.get(seat) || 0;
        if (seat >= 0) this.tray.set(seat, want);
        if (want !== had) { this.dirty = true; this.trayPop = { seat, from: had, at: performance.now() }; }
        return want - had;
    }
    clearTray() { if (this.tray.size) { this.tray.clear(); this.dirty = true; } }

    /**
     * Bring the table to the state. players: [{ id, seat, drops }]. sweep: { playerId, round, onLand(drop), onDone }
     * animates that visit's drops from the tray (the rest snap). Returns the number of chips that will fly.
     */
    sync(players, sweep = null) {
        const want = new Map();
        const height = new Map();
        let flying = 0;
        const sweepDrops = [];
        for (const p of players) {
            for (const d of p.drops || []) {
                const sk = d.pocket + '|' + p.seat;
                for (let j = 0; j < d.chips; j++) {
                    const key = `${p.id}|${d.round}|${d.k}|${j}`;
                    const h = height.get(sk) || 0; height.set(sk, h + 1);
                    want.set(key, { key, seat: p.seat, pocket: d.pocket, h, small: !!d.rem, drop: d });
                }
                if (sweep && p.id === sweep.playerId && d.round === sweep.round) sweepDrops.push({ p, d });
            }
        }
        // chips no longer in the state (a correction): lift away
        for (const [key, c] of this.chips) if (!want.has(key) && c.phase !== 'leave') { c.phase = 'leave'; c.t = 0; c.fromP = c.pos.clone(); }
        // new chips: fly in the sweep, or snap
        const stagger = sweepDrops.length > 1 ? Math.min(0.16, 1.7 / sweepDrops.length) : 0;
        const sweepIdx = new Map(sweepDrops.map((x, i) => [x.p.id + '|' + x.d.round + '|' + x.d.k, i]));
        let trayI = 0;
        for (const [key, w] of want) {
            const to = this.restPos(w);
            const c = this.chips.get(key);
            if (c) {
                if (!c.to.equals(to)) { c.to = to; if (c.phase === 'rest') { c.phase = 'shift'; c.t = 0; c.fromP = c.pos.clone(); } }
                continue;
            }
            const di = sweepIdx.get(w.drop && `${key.split('|')[0]}|${w.drop.round}|${w.drop.k}`);
            const nc = { key, seat: w.seat, pocket: w.pocket, small: w.small, to, pos: to.clone(), rot: hash01(key) * Math.PI * 2, phase: 'rest', t: 0 };
            if (di != null && sweep) {
                const j = Number(key.split('|')[3]);
                nc.phase = 'fly'; nc.t = -(0.25 + di * stagger + j * 0.035);
                nc.fromP = this.trayPos(w.seat, trayI++); nc.pos = nc.fromP.clone();
                nc.dur = 0.62 + hash01(key + 'd') * 0.08;
                nc.lift = 0.06 + 0.05 * hash01(key + 'l');
                nc.landKey = j === w.drop.chips - 1 ? w.drop : null; // the drop's top chip reports the landing
                flying++;
            }
            this.chips.set(key, nc);
        }
        this.onLand = sweep && sweep.onLand;
        this.onDone = sweep && sweep.onDone;
        if (sweep) this.clearTray();
        this.dirty = true;
        return flying;
    }

    restPos(w) {
        const s = stackSpot(w.pocket, w.seat), j = hash01(w.key + 'j');
        return V(s.x + (j - 0.5) * 0.0024, Math.min(w.h, STACK_CAP + 4) * CHIP_H, s.z + (hash01(w.key + 'k') - 0.5) * 0.0024);
    }

    /** jump every animation to its end (a new state arrived mid-sweep, or the queue was skipped) */
    finish() {
        for (const [key, c] of this.chips) {
            if (c.phase === 'leave') this.chips.delete(key);
            else if (c.phase !== 'rest') { if (c.phase === 'fly' && c.landKey && this.onLand) this.onLand(c.landKey, c); c.phase = 'rest'; c.pos.copy(c.to); }
        }
        this.dirty = true;
    }

    get busy() { for (const c of this.chips.values()) if (c.phase !== 'rest') return true; return false; }

    /** chips shown per seat per pocket (for the nothing-lies check): { 'pocket|seat': count } */
    shown() {
        const out = {};
        for (const c of this.chips.values()) if (c.phase !== 'leave') { const k = c.pocket + '|' + c.seat; out[k] = (out[k] || 0) + 1; }
        return out;
    }

    update(dt) {
        let moving = false;
        for (const [key, c] of this.chips) {
            if (c.phase === 'rest') continue;
            moving = true;
            c.t += dt;
            if (c.phase === 'fly') {
                if (c.t < 0) continue;
                const u = clamp01(c.t / c.dur), e = easeOut(u);
                c.pos.lerpVectors(c.fromP, c.to, e);
                c.pos.y = c.fromP.y + (c.to.y - c.fromP.y) * e + Math.sin(Math.PI * Math.min(1, u * 1.05)) * c.lift;
                c.spin = (1 - e) * 5;
                if (u >= 1) {
                    c.phase = 'settle'; c.t = 0;
                    if (c.landKey && this.onLand) this.onLand(c.landKey, c);
                    this.landed++;
                }
            } else if (c.phase === 'settle') {
                const u = clamp01(c.t / 0.18);
                c.pos.copy(c.to); c.pos.y += Math.sin(u * Math.PI) * 0.004 * (1 - u);
                c.spin = 0;
                if (u >= 1) c.phase = 'rest';
            } else if (c.phase === 'shift') {
                const u = clamp01(c.t / 0.3);
                c.pos.lerpVectors(c.fromP, c.to, easeOut(u));
                if (u >= 1) c.phase = 'rest';
            } else if (c.phase === 'leave') {
                const u = clamp01(c.t / 0.5);
                c.pos.copy(c.fromP); c.pos.y += easeOut(u) * 0.25;
                c.fade = 1 - u;
                if (u >= 1) this.chips.delete(key);
            }
        }
        if (moving) this.dirty = true;
        if (this.onDone && !this.busy) { const f = this.onDone; this.onDone = null; f(); }
        if (this.dirty) this.write();
    }

    write() {
        this.dirty = false;
        const M = this._m, Q = this._q, S = this._s, mesh = this.mesh;
        let i = 0;
        const put = (p, seat, rot, small, tilt = 0, fade = 1) => {
            if (i >= MAX) return;
            Q.setFromEuler(new THREE.Euler(tilt, rot, tilt * 0.6));
            const k = small ? 0.78 : 1;
            S.set(k * fade, fade, k * fade);
            M.compose(p, Q, S);
            mesh.setMatrixAt(i, M);
            mesh.setColorAt(i, this._c.set(this.colors[seat] || '#ffffff'));
            this.seatAttr.array[i] = seat;
            i++;
        };
        for (const c of this.chips.values()) {
            if (c.phase === 'rest' && c.to.y >= STACK_CAP * CHIP_H) continue; // past the cap: the DOM has the number
            put(c.pos, c.seat, c.rot + (c.spin || 0), c.small, c.phase === 'fly' ? Math.sin(c.t * 9) * 0.25 * (1 - clamp01(c.t / c.dur)) : 0, c.phase === 'leave' ? Math.max(0.01, c.fade) : 1);
        }
        for (const [seat, count] of this.tray) for (let k = 0; k < count; k++) put(this.trayPos(seat, k), seat, hash01('t' + seat + k) * 6.28, false);
        mesh.count = i; this.shadow.count = i; this.shadow.visible = mesh.visible;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        this.seatAttr.needsUpdate = true;
    }
}
