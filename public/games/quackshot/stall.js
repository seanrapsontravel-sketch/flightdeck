// The stall around the target — the bg photo's duck stall, built:
//   back panel  a painted sunburst behind the target (navy and teal rays, gilt stars), framed in gold
//   pillars     barber-pole posts either side with bulb strips
//   awning      striped underside; a scalloped valance along the front with a big bulb at every scallop
//   hanging     rubber ducks hanging on strings either side of the target, lit warm (the bg photo)
//   counter     red lacquer top with a gilt edge, candy stripes down the front; one station per player along it
//   stations    each: a coloured stool, an ADMIT ONE ticket with the name, a lamp (lit for the thrower) and a prize
//               shelf where that player's won ducks sit, one per bullseye, in the player's colour
//   marquee     the stall's header: each name sign-painted, each score in bulbs (red bulbs when negative), the round as
//               six bulbs, ×2 FINAL in red bulbs; chasing bulbs round the frame. A second display — the DOM columns are
//               the truth — but it must match them (game.truth reads marqueeShown).
import * as THREE from 'three';
import { Beacons } from '../lib3d/beacons.js';
import { rubberDuckInstances } from './duck.js';
import { BOARD_Y, COUNTER_Z, COUNTER_TOP, RIM_R, MAX_ROUNDS, FONT, rng, teamColor } from './common.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
export const SHELF_MAX = 12;           // prize ducks drawn per station (the HUD counts beyond that)
const MARQUEE_Y = BOARD_Y + RIM_R + 0.82, MARQUEE_W = 9.6, MARQUEE_H = 1.15;
const RAIL_Y = MARQUEE_Y - MARQUEE_H / 2 - 0.42;   // the hanging rail beside the board, just under the marquee
export const STALL_W = 13.6, AWNING_Y = 9.4, PILLAR_X = STALL_W / 2;
const WARM = ['#ffd38a', '#ffe9b8', '#ffc070'];

function canvasTex(w, h, draw, { srgb = true, repeat = null } = {}) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
    return t;
}
/** a fine noise texture for enamel/lacquer roughness (g channel) */
export function grainTexture(seed = 3, base = 0.35, amp = 0.18) {
    const R = rng(seed);
    return canvasTex(256, 256, (g, w, h) => {
        const img = g.createImageData(w, h);
        for (let i = 0; i < w * h; i++) { const v = Math.max(0, Math.min(255, (base + (R() - 0.5) * amp) * 255)); img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
        g.putImageData(img, 0, 0);
    }, { srgb: false, repeat: [6, 6] });
}

export class Stall {
    constructor(engine) {
        this.engine = engine;
        const S = engine.scene;
        this.group = new THREE.Group(); S.add(this.group);
        const G = this.group, M = new THREE.Matrix4();
        this.beacons = new Beacons(S, engine.time);
        const gold = new THREE.MeshStandardMaterial({ color: '#e2b24e', roughness: 0.28, metalness: 0.95 });
        this.gold = gold;
        // ---------------------------------------------------------------- back panel: a painted sunburst
        const panelH = AWNING_Y;
        const cy = BOARD_Y / panelH;
        const panelTex = canvasTex(2048, 1416, (g, w, h) => {
            const ox = w / 2, oy = h * (1 - cy);
            g.fillStyle = '#10163a'; g.fillRect(0, 0, w, h);
            for (let i = 0; i < 36; i++) {
                const a0 = (i / 36) * TAU, a1 = ((i + 1) / 36) * TAU;
                g.beginPath(); g.moveTo(ox, oy); g.lineTo(ox + Math.cos(a0) * 3000, oy + Math.sin(a0) * 3000); g.lineTo(ox + Math.cos(a1) * 3000, oy + Math.sin(a1) * 3000); g.closePath();
                g.fillStyle = i % 2 ? '#152a5c' : '#0e1a40'; g.fill();
            }
            const R = rng(9); g.fillStyle = '#e8c070';
            for (let i = 0; i < 90; i++) { const x = R() * w, y = R() * h; if (Math.hypot(x - ox, y - oy) < h * 0.36) continue; const r = 4 + R() * 7; g.beginPath(); for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU - Math.PI / 2, rr = k % 2 ? r * 0.42 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.fill(); }
            g.strokeStyle = '#e2b24e'; g.lineWidth = 26; g.strokeRect(13, 13, w - 26, h - 26);
            g.strokeStyle = '#7a1d1d'; g.lineWidth = 8; g.strokeRect(44, 44, w - 88, h - 88);
        });
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(STALL_W, panelH), new THREE.MeshStandardMaterial({ map: panelTex, roughness: 0.7, roughnessMap: grainTexture(5, 0.7, 0.2) }));
        panel.position.set(0, panelH / 2, -0.3); panel.receiveShadow = true; G.add(panel);
        // ---------------------------------------------------------------- pillars: barber poles with bulb strips
        const poleTex = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#f4ead2'; g.fillRect(0, 0, w, h); g.fillStyle = '#c8202e'; for (let k = -2; k < 4; k++) { g.beginPath(); g.moveTo(k * 128, 0); g.lineTo(k * 128 + 64, 0); g.lineTo(k * 128 + 64 + 256, h); g.lineTo(k * 128 + 256, h); g.closePath(); g.fill(); } }, { repeat: [1, 9] });
        const poleMat = new THREE.MeshPhysicalMaterial({ map: poleTex, roughness: 0.35, clearcoat: 0.6 });
        for (const s of [-1, 1]) {
            const p = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, AWNING_Y, 24), poleMat); p.position.set(s * PILLAR_X, AWNING_Y / 2, COUNTER_Z - 0.2); p.castShadow = true; G.add(p);
            const cap = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 10), gold); cap.position.set(s * PILLAR_X, AWNING_Y - 0.4, COUNTER_Z - 0.2); G.add(cap);
            const back = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, AWNING_Y, 24), poleMat); back.position.set(s * PILLAR_X, AWNING_Y / 2, -0.1); G.add(back);
            for (let k = 0; k < 22; k++) this.beacons.add(V(s * (PILLAR_X - 0.28), 1.6 + k * 0.33, COUNTER_Z - 0.2), { color: WARM[k % 3], size: 0.11, rate: 1.1, phase: k / 22, steady: 0.55 });
        }
        // ---------------------------------------------------------------- awning + scalloped valance + big bulbs
        const stripe = (a, b, n) => canvasTex(1024, 16, (g, w, h) => { for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect((i * w) / n, 0, w / n + 1, h); } });
        const under = new THREE.Mesh(new THREE.PlaneGeometry(STALL_W + 2, COUNTER_Z + 1.2), new THREE.MeshStandardMaterial({ map: stripe('#b81c2b', '#efe2c4', 22), roughness: 0.85, side: THREE.DoubleSide }));
        under.rotation.x = Math.PI / 2; under.position.set(0, AWNING_Y, (COUNTER_Z + 0.6) / 2 - 0.3); G.add(under);
        const sc = 18, scW = (STALL_W + 2) / sc, vH = 0.62;
        const vs = new THREE.Shape(); vs.moveTo(-(STALL_W + 2) / 2, 0); vs.lineTo((STALL_W + 2) / 2, 0);
        for (let i = sc - 1; i >= 0; i--) { const x0 = -(STALL_W + 2) / 2 + i * scW; vs.absarc(x0 + scW / 2, -vH, scW / 2, 0, -Math.PI, true); }
        vs.lineTo(-(STALL_W + 2) / 2, 0);
        const vg = new THREE.ShapeGeometry(vs, 12);
        const uv = vg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, (vg.attributes.position.getX(i) + (STALL_W + 2) / 2) / (STALL_W + 2), 0.5);
        const valance = new THREE.Mesh(vg, new THREE.MeshStandardMaterial({ map: stripe('#c8202e', '#f4ead2', sc), roughness: 0.7, side: THREE.DoubleSide, emissive: new THREE.Color('#ffb070'), emissiveIntensity: 0.05 }));
        valance.position.set(0, AWNING_Y, COUNTER_Z + 0.6); G.add(valance);
        const bulbGlass = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd9a0').multiplyScalar(6) });
        const big = new THREE.InstancedMesh(new THREE.SphereGeometry(0.085, 14, 10), bulbGlass, sc + 1);
        for (let i = 0; i <= sc; i++) { const x = -(STALL_W + 2) / 2 + i * scW; M.makeTranslation(x, AWNING_Y - vH + 0.02, COUNTER_Z + 0.66); big.setMatrixAt(i, M); this.beacons.add(V(x, AWNING_Y - vH + 0.02, COUNTER_Z + 0.7), { color: '#ffe2b0', size: 0.5, steady: 1 }); }
        G.add(big);
        // bulb strings along the awning's sides
        const strings = [[V(-PILLAR_X + 0.3, AWNING_Y - 0.15, COUNTER_Z), V(-PILLAR_X + 0.3, AWNING_Y - 0.15, 0.2)], [V(PILLAR_X - 0.3, AWNING_Y - 0.15, COUNTER_Z), V(PILLAR_X - 0.3, AWNING_Y - 0.15, 0.2)]];
        const smallBulb = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 10, 8), bulbGlass, 160); let nb = 0;
        const wire = [];
        for (const [a, b] of strings) for (let i = 0; i <= 24; i++) {
            const u = i / 24, p = a.clone().lerp(b, u); p.y -= Math.sin(u * Math.PI) * 0.6;
            M.makeTranslation(p.x, p.y, p.z); smallBulb.setMatrixAt(nb++, M);
            this.beacons.add(p, { color: WARM[i % 3], size: 0.22, steady: 1 });
            if (i) { const q = a.clone().lerp(b, (i - 1) / 24); q.y -= Math.sin(((i - 1) / 24) * Math.PI) * 0.6; wire.push(q.x, q.y, q.z, p.x, p.y, p.z); }
        }
        smallBulb.count = nb; G.add(smallBulb);
        // ---------------------------------------------------------------- hanging ducks
        const nh = 26, R = rng(17);
        this.hang = rubberDuckInstances(nh, { variant: 'A', lod: 2 });
        this.hang.castShadow = false;
        this.hangBase = [];
        for (let i = 0; i < nh; i++) {
            const side = i < nh / 2 ? -1 : 1, j = i % (nh / 2);
            // either side of the target, clear of the marquee: a column of four beside the board, more above outboard
            const col = j % 3, row = Math.floor(j / 3);
            const s = 0.55 + R() * 0.28;
            const x = row < 2 ? 5.2 + col * 0.62 : 3.35 + col * 1.05 + (row % 2) * 0.4;
            const y = row < 2 ? 8.4 - row * 0.95 - col * 0.25 : 5.35 - (row - 2) * 0.92 - R() * 0.2;
            const p = V(side * x, y, 0.6 + col * 1.2 + R() * 0.4);
            this.hangBase.push({ p, s, yaw: side < 0 ? -0.35 - R() * 0.4 : Math.PI + 0.35 + R() * 0.4, ph: R() * TAU });
            // the outboard ducks hang from the awning; the ones beside the board from a rail under the marquee, so no
            // string crosses the scores
            wire.push(p.x, p.y + s * 0.9, p.z, p.x, row < 2 ? AWNING_Y : RAIL_Y, p.z);
        }
        for (const side of [-1, 1]) {
            const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.6, 8).rotateZ(Math.PI / 2), gold);
            rail.position.set(side * 4.75, RAIL_Y, 1.4); rail.rotation.y = side * 0.35; G.add(rail);
        }
        G.add(this.hang);
        const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
        G.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: '#8a7a5a' })));
        // ---------------------------------------------------------------- the counter
        const lac = new THREE.MeshPhysicalMaterial({ color: '#b3122e', roughness: 0.3, roughnessMap: grainTexture(7, 0.6, 0.25), clearcoat: 0.8, clearcoatRoughness: 0.12 });
        const top = new THREE.Mesh(new THREE.BoxGeometry(STALL_W - 0.2, 0.1, 1.1), lac);
        top.position.set(0, COUNTER_TOP - 0.05, COUNTER_Z - 0.55); top.receiveShadow = true; top.castShadow = true; G.add(top);
        const edge = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, STALL_W - 0.2, 12).rotateZ(Math.PI / 2), gold);
        edge.position.set(0, COUNTER_TOP - 0.05, COUNTER_Z); G.add(edge);
        const frontTex = canvasTex(2048, 64, (g, w, h) => { const cs = ['#f4c430', '#1f6fd1', '#e8457a', '#2fa36a']; for (let i = 0; i < 28; i++) { g.fillStyle = cs[i % 4]; g.fillRect((i * w) / 28, 0, w / 28 + 1, h); } });
        const front = new THREE.Mesh(new THREE.PlaneGeometry(STALL_W - 0.2, COUNTER_TOP - 0.25), new THREE.MeshPhysicalMaterial({ map: frontTex, roughness: 0.45, clearcoat: 0.4 }));
        front.position.set(0, (COUNTER_TOP - 0.25) / 2 + 0.15, COUNTER_Z + 0.01); G.add(front);
        const kick = new THREE.Mesh(new THREE.BoxGeometry(STALL_W - 0.2, 0.15, 0.08), new THREE.MeshStandardMaterial({ color: '#1a1018', roughness: 0.6 })); kick.position.set(0, 0.075, COUNTER_Z); G.add(kick);
        // ---------------------------------------------------------------- lights
        // the awning spot on the target (warm key, casts the target's shadows)
        this.key = new THREE.SpotLight('#ffd09a', 220, 0, 0.6, 0.7, 2);
        this.key.position.set(0, AWNING_Y - 0.3, COUNTER_Z + 0.4); this.key.target.position.set(0, BOARD_Y - 0.2, 0);
        this.key.castShadow = true; this.key.shadow.mapSize.set(2048, 2048); this.key.shadow.bias = -0.0004; this.key.shadow.normalBias = 0.02;
        G.add(this.key, this.key.target);
        // warm fill down onto the counter and stations from the valance bulbs
        const fill = new THREE.SpotLight('#ffc890', 70, 0, 1.0, 0.9, 2);
        fill.position.set(0, AWNING_Y - 0.6, COUNTER_Z + 2.2); fill.target.position.set(0, COUNTER_TOP, COUNTER_Z - 0.6); G.add(fill, fill.target);
        // the hanging ducks' bulbs
        for (const s of [-1, 1]) { const l = new THREE.PointLight('#ffc27a', 26, 9, 1.6); l.position.set(s * 5.4, 7.4, 3.2); G.add(l); }
        // ---------------------------------------------------------------- the marquee
        this.mqBase = document.createElement('canvas'); this.mqBase.width = 2048; this.mqBase.height = 246;
        this.mqGlow = document.createElement('canvas'); this.mqGlow.width = 2048; this.mqGlow.height = 246;
        this.mqBaseTex = new THREE.CanvasTexture(this.mqBase); this.mqBaseTex.colorSpace = THREE.SRGBColorSpace; this.mqBaseTex.anisotropy = 8;
        this.mqGlowTex = new THREE.CanvasTexture(this.mqGlow); this.mqGlowTex.colorSpace = THREE.SRGBColorSpace; this.mqGlowTex.anisotropy = 8;
        const mq = new THREE.Mesh(new THREE.PlaneGeometry(MARQUEE_W, MARQUEE_H), new THREE.MeshStandardMaterial({ map: this.mqBaseTex, emissiveMap: this.mqGlowTex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 3.2, roughness: 0.6 }));
        mq.position.set(0, MARQUEE_Y, 0.25); G.add(mq);
        const frame = new THREE.Mesh(new THREE.BoxGeometry(MARQUEE_W + 0.36, MARQUEE_H + 0.36, 0.2), gold);
        frame.position.set(0, MARQUEE_Y, 0.12); G.add(frame);
        const NB = 46;
        for (let i = 0; i < NB * 2; i++) {
            const u = (i % NB) / (NB - 1), top_ = i < NB;
            this.beacons.add(V(-MARQUEE_W / 2 - 0.05 + u * (MARQUEE_W + 0.1), MARQUEE_Y + (top_ ? 1 : -1) * (MARQUEE_H / 2 + 0.11), 0.28), { color: '#ffd890', size: 0.16, rate: 0.9, phase: ((top_ ? u : 1 - u) * 3) % 1, steady: 0.25 });
        }
        this.marqueeShown = null;
        this.marqueeBox = new THREE.Box3().setFromCenterAndSize(V(0, MARQUEE_Y, 0.25), V(MARQUEE_W + 0.3, MARQUEE_H + 0.3, 0.2));
        this.beacons.build();
        this.beacons.mat.uniforms.uScale.value = 1100;
        // ---------------------------------------------------------------- stations
        this.stations = [];
        this.prize = rubberDuckInstances(6 * SHELF_MAX, { variant: 'A', lod: 1 });
        this.prize.count = 0; this.prize.castShadow = true;
        G.add(this.prize);
        this.stationGroup = new THREE.Group(); G.add(this.stationGroup);
        this.chrome = new THREE.MeshStandardMaterial({ color: '#d8dce2', metalness: 1, roughness: 0.22 });
        this.wood = new THREE.MeshStandardMaterial({ color: '#6b3f1d', roughness: 0.55 });
        this.paperRough = grainTexture(11, 0.75, 0.15);
        // the thrower's station light (made up front: changing the light count recompiles every shader)
        this.activeLight = new THREE.PointLight('#ffffff', 0, 3.2, 1.8); G.add(this.activeLight);
        this.active = -1;
        this.time = 0;
    }

    /** where each station stands along the counter, for n players */
    static stationX(i, n) { const span = Math.min(9.4, 1.88 * n); return n <= 1 ? 0 : -span / 2 + (span * i) / (n - 1); }

    /** (re)build the stations for a roster: [{ name, color }] */
    setPlayers(players) {
        for (const s of this.stations) { this.stationGroup.remove(s.group); s.ticketTex.dispose(); }
        this.stations = [];
        this.lit = new Set(); this.winner = -1;
        const n = players.length;
        players.forEach((p, i) => {
            const g = new THREE.Group(); g.position.set(Stall.stationX(i, n), COUNTER_TOP, COUNTER_Z - 0.55);
            const col = new THREE.Color(p.color || teamColor(i));
            // the stool, on the player's side of the counter: glossy seat, chrome stem and foot ring
            const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.28, 0.14, 32), new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.1 }));
            seat.position.set(0, -0.3, 1.3); seat.castShadow = true; g.add(seat);
            const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.75, 12), this.chrome); stem.position.set(0, -0.72, 1.3); g.add(stem);
            const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.018, 8, 24).rotateX(Math.PI / 2), this.chrome); ring.position.set(0, -0.78, 1.3); g.add(ring);
            // the ADMIT ONE ticket on a little brass easel
            const c = document.createElement('canvas'); c.width = 512; c.height = 224;
            const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
            const ticket = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.42), new THREE.MeshStandardMaterial({ map: tex, roughness: 1, roughnessMap: this.paperRough, emissive: new THREE.Color('#ffffff'), emissiveMap: tex, emissiveIntensity: 0.08 }));
            ticket.position.set(0, 0.26, 0.2); ticket.rotation.x = -0.2; ticket.castShadow = true; g.add(ticket);
            const easel = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.34, 0.03), this.gold); easel.position.set(0, 0.15, 0.08); easel.rotation.x = -0.55;   // leans back, behind the ticket g.add(easel);
            // the dart rest: a brass block with three slots
            const rest = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.07, 0.14), this.gold); rest.position.set(0.66, 0.035, 0.3); g.add(rest);
            // the prize shelf: a wooden riser with a brass lip, behind the ticket
            const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.34), this.wood);
            shelf.position.set(0, 0.62, -0.25); shelf.castShadow = true; shelf.receiveShadow = true; g.add(shelf);
            const lip = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.035, 0.02), this.gold); lip.position.set(0, 0.64, -0.08); g.add(lip);
            const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.62, 0.05), this.wood); post.position.set(0, 0.31, -0.25); g.add(post);
            // the thrower's lamp: a pool of their colour on the counter (and a real light, below)
            const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.85, 40), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(1.4), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
            lamp.rotation.x = -Math.PI / 2; lamp.position.y = 0.006; g.add(lamp);
            this.stationGroup.add(g);
            const s = { group: g, i, name: p.name, color: col, ticketCanvas: c, ticketTex: tex, ticket, lamp, on: 0, prizes: 0, hopT: -1, punchT: -1, bounce: false };
            this.drawTicket(s, false);
            this.stations.push(s);
        });
        this.setPrizes(players.map(() => 0));
    }

    drawTicket(s, active) {
        const c = s.ticketCanvas, g = c.getContext('2d');
        g.fillStyle = active ? '#ffeeb8' : '#efe1bf'; g.fillRect(0, 0, c.width, c.height);
        // perforated ends
        g.fillStyle = '#1a1018'; for (let y = 14; y < c.height; y += 26) { g.beginPath(); g.arc(0, y, 8, 0, TAU); g.arc(c.width, y, 8, 0, TAU); g.fill(); }
        g.strokeStyle = '#' + s.color.getHexString(); g.lineWidth = 14; g.strokeRect(18, 10, c.width - 36, c.height - 20);
        g.setLineDash([8, 10]); g.lineWidth = 3; g.strokeStyle = '#7a5a2a'; g.strokeRect(36, 30, c.width - 72, c.height - 60); g.setLineDash([]);
        g.fillStyle = '#7a1d1d'; g.textAlign = 'center'; g.font = `800 34px ${FONT}`; g.fillText('★ ADMIT ONE ★', c.width / 2, 72);
        g.fillStyle = '#1a1208'; let size = 78; g.font = `900 ${size}px ${FONT}`;
        const name = String(s.name || '').toUpperCase();
        while (g.measureText(name).width > c.width - 90 && size > 30) { size -= 4; g.font = `900 ${size}px ${FONT}`; }
        g.fillText(name, c.width / 2, 160);
        s.ticketTex.needsUpdate = true;
        s.ticket.material.emissiveIntensity = active ? 0.35 : 0.08;
    }

    setActive(i) {
        if (i === this.active) return;
        const prev = this.stations[this.active]; if (prev) this.drawTicket(prev, false);
        this.active = i;
        const s = this.stations[i]; if (s) this.drawTicket(s, true);
    }

    /** world position of prize slot j on station i's shelf */
    slotPoint(i, j) {
        const s = this.stations[i]; if (!s) return V();
        const row = Math.floor(Math.min(j, SHELF_MAX - 1) / 6), col = Math.min(j, SHELF_MAX - 1) % 6;
        return V(s.group.position.x - 0.6 + col * 0.24 + row * 0.12, COUNTER_TOP + 0.65, COUNTER_Z - 0.55 - 0.25 - row * 0.12 + 0.06);
    }
    /** each station's shelf shows that player's bullseye ducks (capped at SHELF_MAX) */
    setPrizes(counts) {
        this.stations.forEach((s, i) => { s.prizes = Math.min(SHELF_MAX, Math.max(0, counts[i] || 0)); });
        this.layoutPrizes();
    }
    layoutPrizes() {
        const o = new THREE.Object3D();
        let k = 0;
        this.stations.forEach((s, i) => {
            for (let j = 0; j < s.prizes; j++) {
                o.position.copy(this.slotPoint(i, j));
                // a hop on a new arrival (the whole shelf), a happy bounce for the winner
                const hop = s.hopT >= 0 ? Math.sin(Math.min(1, s.hopT / 0.45) * Math.PI) * 0.06 * (j === s.prizes - 1 ? 0.3 : 1) : 0;
                const win = s.bounce ? Math.max(0, Math.sin(this.time * 7 - j * 0.6)) * 0.08 : 0;
                o.position.y += hop + win;
                o.rotation.set(0, -Math.PI / 2 + 0.5, 0); o.scale.setScalar(0.2); o.updateMatrix();
                this.prize.setMatrixAt(k, o.matrix); this.prize.setColorAt(k, s.color); k++;
            }
        });
        this.prize.count = k;
        this.prize.instanceMatrix.needsUpdate = true; if (this.prize.instanceColor) this.prize.instanceColor.needsUpdate = true;
    }
    /** a duck just landed on station i's shelf: the shelf hops */
    hop(i) { const s = this.stations[i]; if (s) s.hopT = 0; }
    /** intermission: the station's ticket is stamped ADMITTED, with a punch */
    stamp(i) {
        const s = this.stations[i]; if (!s) return;
        this.drawTicket(s, true);
        const g = s.ticketCanvas.getContext('2d');
        g.save(); g.translate(s.ticketCanvas.width - 92, 58); g.rotate(-0.32);   // top-right corner, clear of the name
        g.strokeStyle = 'rgba(190,20,30,0.85)'; g.lineWidth = 5; g.strokeRect(-74, -24, 148, 48);
        g.fillStyle = 'rgba(190,20,30,0.85)'; g.font = `900 28px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('ADMITTED', 0, 1);
        g.restore();
        s.ticketTex.needsUpdate = true;
        s.punchT = 0;
    }
    /** light these stations (a draw's contenders), or none */
    setLit(list) { this.lit = new Set(list || []); }
    /** the winner's station: gold light, its shelf bounces */
    setWinner(i) { this.stations.forEach((s, k) => { s.bounce = k === i; }); this.winner = i; }
    get prizeCounts() { return this.stations.map((s) => s.prizes); }

    /** the marquee: names painted, scores in bulbs (red when negative), round bulbs, ×2 FINAL. Redrawn on change. */
    setMarquee(rows, round, final) {
        const key = JSON.stringify([rows, round, final]);
        if (key === this.marqueeKey) return;
        this.marqueeKey = key; this.marqueeShown = { scores: rows.map((r) => r.score), round, final };
        const W = this.mqBase.width, H = this.mqBase.height;
        const b = this.mqBase.getContext('2d'), e = this.mqGlow.getContext('2d');
        b.fillStyle = '#160c26'; b.fillRect(0, 0, W, H); e.fillStyle = '#000'; e.fillRect(0, 0, W, H);
        const CELL = 9;
        // a bulb: a socket on the base, a glow on the emissive map if lit
        const bulb = (x, y, on, col, r = CELL * 0.42) => {
            b.fillStyle = on ? '#5a4a30' : '#2a2236'; b.beginPath(); b.arc(x, y, r, 0, TAU); b.fill();
            if (!on) return;
            const gr = e.createRadialGradient(x, y, 0, x, y, r * 1.25);
            gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.35, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
            e.fillStyle = gr; e.beginPath(); e.arc(x, y, r * 1.25, 0, TAU); e.fill();
        };
        /** text drawn as lit bulbs on a grid inside the box (x, y, w, h) */
        const bulbText = (text, x, y, w, h, col) => {
            const gw = Math.floor(w / CELL), gh = Math.floor(h / CELL);
            const m = document.createElement('canvas'); m.width = gw; m.height = gh;
            const g = m.getContext('2d'); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
            let size = gh; g.font = `900 ${size}px ${FONT}`;
            while (g.measureText(text).width > gw - 1 && size > 6) { size -= 1; g.font = `900 ${size}px ${FONT}`; }
            g.fillText(text, gw / 2, gh / 2 + 1);
            const px = g.getImageData(0, 0, gw, gh).data;
            for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) bulb(x + (i + 0.5) * CELL, y + (j + 0.5) * CELL, px[(j * gw + i) * 4 + 3] > 110, col);
        };
        // left: ROUND and six round bulbs, ×2 FINAL in red bulbs
        b.textAlign = 'left'; b.font = `800 30px ${FONT}`; b.fillStyle = '#e8c070'; b.fillText('ROUND', 40, 58);
        for (let r = 1; r <= MAX_ROUNDS; r++) bulb(52 + (r - 1) * 36, 98, r <= round, r === round ? '#ffe28a' : '#c8a050', 12);
        if (final) {
            // a glowing painted sign (a bulb grid this small doesn't read)
            for (const [g, col] of [[b, '#6a1010'], [e, '#ff5a40']]) { g.textAlign = 'left'; g.font = `900 68px ${FONT}`; g.fillStyle = col; g.fillText('×2 FINAL', 34, 196); }
        }
        // a column per player: name painted (cream), score in bulbs
        const x0 = 300, w = (W - x0 - 30) / Math.max(1, rows.length);
        rows.forEach((r, i) => {
            const cx = x0 + w * i;
            b.fillStyle = r.winner ? 'rgba(255,200,80,0.35)' : r.active ? 'rgba(255,220,120,0.12)' : 'rgba(255,255,255,0.025)'; b.fillRect(cx + 8, 12, w - 16, H - 24);
            b.fillStyle = r.color; b.fillRect(cx + 8, 12, w - 16, 7);
            b.textAlign = 'center';
            let size = 36; b.font = `800 ${size}px ${FONT}`;
            const nm = String(r.name || '').toUpperCase();
            while (b.measureText(nm).width > w - 30 && size > 16) { size -= 2; b.font = `800 ${size}px ${FONT}`; }
            b.fillStyle = '#f4ead2'; b.fillText(nm, cx + w / 2, 58);
            if (r.winner) { e.textAlign = 'center'; e.font = b.font; e.fillStyle = '#ffd86a'; e.fillText(nm, cx + w / 2, 58); }
            bulbText((r.score < 0 ? '−' : '') + Math.abs(r.score), cx + 20, 76, w - 40, H - 92, r.score < 0 ? '#ff4a3a' : '#ffd86a');
        });
        this.mqBaseTex.needsUpdate = true; this.mqGlowTex.needsUpdate = true;
    }

    update(dt) {
        this.time += dt;
        const o = new THREE.Object3D();
        // hanging ducks sway a little on their strings
        this.hangBase.forEach((h, i) => {
            const sw = Math.sin(this.time * 0.9 + h.ph) * 0.05;
            o.position.copy(h.p); o.rotation.set(sw * 0.4, h.yaw + Math.sin(this.time * 0.5 + h.ph) * 0.12, sw); o.scale.setScalar(h.s); o.updateMatrix();
            this.hang.setMatrixAt(i, o.matrix);
        });
        this.hang.instanceMatrix.needsUpdate = true;
        let relayout = false;
        for (const s of this.stations) {
            const want = s.i === this.active || (this.lit && this.lit.has(s.i)) ? 1 : 0;
            s.on += (want - s.on) * (1 - Math.exp(-6 * dt));
            s.lamp.material.opacity = s.on * (0.5 + 0.08 * Math.sin(this.time * 3));
            if (s.hopT >= 0) { s.hopT += dt; relayout = true; if (s.hopT > 0.45) { s.hopT = -1; } }
            if (s.bounce) relayout = true;
            if (s.punchT >= 0) { s.punchT += dt; const u = Math.min(1, s.punchT / 0.35); s.ticket.scale.setScalar(1 + Math.sin(u * Math.PI) * 0.22); if (u >= 1) { s.punchT = -1; s.ticket.scale.setScalar(1); } }
        }
        if (relayout) this.layoutPrizes();
        const a = this.stations[this.active];
        if (this.activeLight) {
            this.activeLight.intensity += ((a ? 5 : 0) - this.activeLight.intensity) * (1 - Math.exp(-5 * dt));
            if (a) { this.activeLight.position.copy(a.group.position).add(V(0, 1.4, 0.6)); this.activeLight.color.copy(this.winner === this.active ? new THREE.Color('#ffc94a') : a.color).lerp(new THREE.Color('#ffffff'), this.winner === this.active ? 0.15 : 0.5); }
        }
    }
}
