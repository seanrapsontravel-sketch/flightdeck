// The moon gate — the dartboard. A round gateway in the red courtyard wall; the board fills it: lacquer and bronze
// beds at the exact regulation radii (kit/darts RADII × K), a raised gilt wire spider, a gilt number ring, a carved
// stone surround. Above it, a raised gatehouse section of wall with its own tiled roof, and the bronze gong.
//
// Only the round's number scores, so only its wedge glows: setTarget(n) paints that number's singles, treble and
// double (and its numeral) into the face's emissive map. Everything else stays dim lacquer.
import * as THREE from 'three';
import { RADII, SLICE, WHEEL, wedgeAngle } from '../lib3d/kit/darts.js';
import { BOARD_Y, Builder, K, PAL, R_GATE, R_NUMBERS, R_STONE, canvasTex, mat, sweep } from './common.js';

const N = 2048, px = (m) => (m / R_NUMBERS) * (N / 2), C = N / 2;

function ring(g, r0, r1, a0, a1) { g.beginPath(); g.arc(C, C, px(r1), -a1, -a0); g.arc(C, C, px(r0), -a0, -a1, true); g.closePath(); }
const FONT = (s) => `900 ${px(s)}px "Avenir Next Condensed", "DIN Condensed", Impact, sans-serif`;

/** the board's colours: dim lacquer (singles black / cinnabar, rings jade / bronze-red) */
function faceTexture() {
    return canvasTex(N, N, (g) => {
        g.fillStyle = '#120a08'; g.fillRect(0, 0, N, N);
        ring(g, RADII.doubleOut * K, R_NUMBERS, 0, Math.PI * 2); g.fillStyle = '#1a0d0b'; g.fill();
        for (let i = 0; i < 20; i++) {
            const n = WHEEL[i], a = wedgeAngle(n), a0 = a - SLICE / 2, a1 = a + SLICE / 2, even = i % 2 === 0;
            const sCol = even ? '#17100d' : '#5a1712', rCol = even ? '#7a1a14' : '#1d4d3c';
            ring(g, RADII.outerBull * K, RADII.trebleIn * K, a0, a1); g.fillStyle = sCol; g.fill();
            ring(g, RADII.trebleIn * K, RADII.trebleOut * K, a0, a1); g.fillStyle = rCol; g.fill();
            ring(g, RADII.trebleOut * K, RADII.doubleIn * K, a0, a1); g.fillStyle = sCol; g.fill();
            ring(g, RADII.doubleIn * K, RADII.doubleOut * K, a0, a1); g.fillStyle = rCol; g.fill();
        }
        // lacquer depth: a faint radial sheen and fine brush grain
        const gr = g.createRadialGradient(C, C, 0, C, C, px(2.0)); gr.addColorStop(0, 'rgba(255,200,150,0.05)'); gr.addColorStop(1, 'rgba(0,0,0,0.1)');
        g.fillStyle = gr; g.fillRect(0, 0, N, N);
        // bulls: jade outer bull, cinnabar bull, a gilt ring between
        ring(g, RADII.bull * K, RADII.outerBull * K, 0, Math.PI * 2); g.fillStyle = '#1f5a45'; g.fill();
        ring(g, 0, RADII.bull * K, 0, Math.PI * 2); g.fillStyle = '#9a1b16'; g.fill();
        // number ring: gilt numerals, a gilt fret line inside and outside
        g.strokeStyle = PAL.gold; g.lineWidth = px(0.025);
        for (const r of [RADII.doubleOut * K + 0.06, R_NUMBERS - 0.06]) { g.beginPath(); g.arc(C, C, px(r), 0, Math.PI * 2); g.stroke(); }
        g.fillStyle = PAL.gold; g.font = FONT(0.3); g.textAlign = 'center'; g.textBaseline = 'middle';
        for (const n of WHEEL) { const a = wedgeAngle(n), r = px((RADII.doubleOut * K + R_NUMBERS) / 2); g.save(); g.translate(C + r * Math.cos(a), C - r * Math.sin(a)); g.fillText(String(n), 0, px(0.012)); g.restore(); }
    });
}

/** roughness (G) / metalness (B): the gilt numerals and fret are metal, the lacquer glossy */
function ormTexture() {
    return canvasTex(N / 2, N / 2, (g, w) => {
        const s = w / N; g.scale(s, s);
        g.fillStyle = 'rgb(0,90,0)'; g.fillRect(0, 0, N, N);
        ring(g, RADII.doubleOut * K, R_NUMBERS, 0, Math.PI * 2); g.fillStyle = 'rgb(0,120,0)'; g.fill();
        g.strokeStyle = 'rgb(0,70,255)'; g.lineWidth = px(0.025);
        for (const r of [RADII.doubleOut * K + 0.06, R_NUMBERS - 0.06]) { g.beginPath(); g.arc(C, C, px(r), 0, Math.PI * 2); g.stroke(); }
        g.fillStyle = 'rgb(0,70,255)'; g.font = FONT(0.3); g.textAlign = 'center'; g.textBaseline = 'middle';
        for (const n of WHEEL) { const a = wedgeAngle(n), r = px((RADII.doubleOut * K + R_NUMBERS) / 2); g.fillText(String(n), C + r * Math.cos(a), C - r * Math.sin(a) + px(0.012)); }
    }, { srgb: false });
}

/** the live wedge: white where number n's beds and numeral are (the material's emissive colour is the gold) */
function drawLive(g, n) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#000'; g.fillRect(0, 0, g.canvas.width, g.canvas.height);
    const s = g.canvas.width / N; g.scale(s, s);
    g.fillStyle = '#2a2a2a'; g.font = FONT(0.3); g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const m of WHEEL) { const am = wedgeAngle(m), rm = px((RADII.doubleOut * K + R_NUMBERS) / 2); g.fillText(String(m), C + rm * Math.cos(am), C - rm * Math.sin(am) + px(0.012)); }
    if (!n) return;
    const a = wedgeAngle(n), a0 = a - SLICE / 2 + 0.004, a1 = a + SLICE / 2 - 0.004;
    // singles a warm gold, the treble and double brightest (the beds worth more glow more)
    ring(g, RADII.outerBull * K, RADII.trebleIn * K, a0, a1); g.fillStyle = '#b8b8b8'; g.fill();
    ring(g, RADII.trebleOut * K, RADII.doubleIn * K, a0, a1); g.fill();
    ring(g, RADII.trebleIn * K, RADII.trebleOut * K, a0, a1); g.fillStyle = '#ffffff'; g.fill();
    ring(g, RADII.doubleIn * K, RADII.doubleOut * K, a0, a1); g.fill();
    // gold leaf: the mask is broken up by flecks and a sheen across the wedge, so it reads as gilt, not paper
    g.save(); ring(g, RADII.outerBull * K, RADII.doubleOut * K, a0, a1); g.clip();
    for (let i = 0; i < 2200; i++) { const rr = px(RADII.outerBull * K + ((i * 0.6180339) % 1) * (RADII.doubleOut - RADII.outerBull) * K), aa = a0 + ((i * 0.7548777) % 1) * (a1 - a0); g.fillStyle = i % 3 ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.5)'; g.fillRect(C + rr * Math.cos(aa), C - rr * Math.sin(aa), 3 + (i % 4), 2 + (i % 3)); }
    const sh = g.createLinearGradient(C + px(2) * Math.cos(a0), C - px(2) * Math.sin(a0), C + px(2) * Math.cos(a1), C - px(2) * Math.sin(a1));
    sh.addColorStop(0, 'rgba(0,0,0,0.25)'); sh.addColorStop(0.5, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.3)'); g.fillStyle = sh; g.fillRect(0, 0, N, N);
    g.restore();
    g.fillStyle = '#ffffff'; g.font = FONT(0.3); g.textAlign = 'center'; g.textBaseline = 'middle';
    const r = px((RADII.doubleOut * K + R_NUMBERS) / 2);
    g.fillText(String(n), C + r * Math.cos(a), C - r * Math.sin(a) + px(0.012));
}

/** plaster for the red courtyard wall (world-scaled UVs: 1 unit = 1 m, repeat every 4 m) */
function plasterTexture(base) {
    const t = canvasTex(512, 512, (g, w, h) => {
        g.fillStyle = base; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 2600; i++) { const x = (i * 197) % w, y = (i * 389 + (i >> 3) * 7) % h, a = ((i * 31) % 10) / 120; g.fillStyle = i % 3 ? `rgba(40,8,4,${a})` : `rgba(255,170,130,${a * 0.6})`; g.fillRect(x, y, 2 + (i % 7), 1 + (i % 4)); }
        for (let i = 0; i < 40; i++) { const x = (i * 131) % w, y = (i * 263) % h, r = 30 + (i % 5) * 18; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, i % 2 ? 'rgba(30,5,0,0.07)' : 'rgba(255,190,150,0.05)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); }
    }, { repeat: true });
    t.repeat.set(0.25, 0.25);
    return t;
}

/**
 * A straight tiled roof strip (a gable: two slopes and a ridge), length L along x, centred at the origin,
 * eaves `w` out each side of the ridge, `rise` high; `lift` raises the eave at both ends (the corners sweep up).
 */
export function tiledStrip(L, w, rise, { lift = 0.25, flick = 0.5 } = {}) {
    const tiles = new Builder(), ridge = new Builder(), under = new Builder();
    const nT = Math.round(L / 0.3), per = 6, NU = nT * per, NV = 8;
    const yAt = (x, v) => { const e = Math.abs(x) / (L / 2); return rise * (1 - v) * (1 - 0.35 * v) + lift * Math.pow(e, 6) * v * v; };
    for (const side of [1, -1]) {
        tiles.grid(NU, NV, (iu, jv) => {
            const x = -L / 2 + (L * iu) / NU, v = jv / NV, d = Math.abs(((iu / per) % 1) - 0.5);
            const hh = d < 0.26 ? 0.055 * Math.sqrt(1 - (d / 0.26) ** 2) : 0;
            const xe = x * (1 + 0.03 * Math.pow(Math.abs(x) / (L / 2), 6) * v);
            return [xe, yAt(x, v) + hh, side * (v * w), iu / per, v * w / 0.32];
        }, side > 0);
        under.grid(8, 1, (iu, jv) => { const x = -L / 2 + (L * iu) / 8; return [x, yAt(x, jv) - 0.16 - (1 - jv) * 0.1, side * jv * w]; }, side < 0);
    }
    // ridge along the top, with a flick up at each end
    const pts = [], rad = [];
    for (let j = 0; j <= 20; j++) { const x = -L / 2 + (L * j) / 20; pts.push(new THREE.Vector3(x * 0.99, rise + 0.08, 0)); rad.push(0.12); }
    for (const s of [-1, 1]) {
        const tip = [], tr = [];
        for (let j = 0; j <= 8; j++) { const f = j / 8, a = f * 1.4; tip.push(new THREE.Vector3(s * (L / 2 * 0.99 + Math.sin(a) * flick * 0.6), rise + 0.08 + (1 - Math.cos(a)) * flick, 0)); tr.push(0.12 * (1 - 0.6 * f)); }
        ridge.add(sweep(tip, tr, 8));
    }
    ridge.add(sweep(pts, rad, 8));
    return { tiles, ridge, under };
}

/**
 * @returns THREE.Group — userData: { setTarget(n), setGlow(k), face, gong, centre (world), wall }
 */
export function moonGate(o = {}) {
    const G = new THREE.Group(); G.name = 'moon-gate';
    const wallW = o.wallWidth ?? 36, wallH = o.wallHeight ?? 4.8, wallD = 0.7, gateH = 10.2, gateW = 9.0;
    const cy = BOARD_Y;

    // ---- the board face
    const liveCanvas = document.createElement('canvas'); liveCanvas.width = liveCanvas.height = 1024;
    const liveTex = new THREE.CanvasTexture(liveCanvas);
    const faceMat = new THREE.MeshPhysicalMaterial({
        map: faceTexture(), roughnessMap: ormTexture(), metalnessMap: null, roughness: 1, metalness: 1,
        clearcoat: 0.55, clearcoatRoughness: 0.18, emissive: new THREE.Color('#ff9418'), emissiveMap: liveTex, emissiveIntensity: 1.1,
    });
    faceMat.metalnessMap = faceMat.roughnessMap;
    const face = new THREE.Mesh(new THREE.CircleGeometry(R_NUMBERS + 0.02, 200), faceMat);
    face.position.set(0, cy, -0.12); face.receiveShadow = true; G.add(face);
    // a dark recess behind the face (the gate's depth) and its lip
    const recess = new THREE.Mesh(new THREE.CylinderGeometry(R_GATE, R_GATE, wallD + 0.1, 96, 1, true).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#2a0d0a', roughness: 0.8, side: THREE.BackSide }));
    recess.position.set(0, cy, -0.12 + (wallD + 0.1) / 2 - 0.1); G.add(recess);

    // ---- the gilt spider: raised wire rings and radials, and a gilt lip round the number ring
    const wire = new Builder();
    for (const r of [RADII.bull, RADII.outerBull, RADII.trebleIn, RADII.trebleOut, RADII.doubleIn, RADII.doubleOut]) wire.add(new THREE.TorusGeometry(r * K, 0.011, 6, 220));
    const M = new THREE.Matrix4();
    for (let i = 0; i < 20; i++) {
        const a = wedgeAngle(WHEEL[i]) + SLICE / 2, r0 = RADII.outerBull * K, r1 = RADII.doubleOut * K, rm = (r0 + r1) / 2;
        M.makeRotationZ(a).setPosition(Math.cos(a) * rm, Math.sin(a) * rm, 0);
        wire.add(new THREE.BoxGeometry(r1 - r0, 0.016, 0.016), M);
    }
    wire.add(new THREE.TorusGeometry(R_NUMBERS, 0.05, 10, 200));
    const wireMesh = new THREE.Mesh(wire.build(), mat('gold'));
    wireMesh.position.set(0, cy, -0.1); wireMesh.castShadow = true; G.add(wireMesh);

    // ---- the carved stone surround (a lathe about the gate's axis)
    const prof = [[R_GATE - 0.02, -0.5], [R_GATE - 0.02, 0.08], [R_GATE + 0.05, 0.2], [R_GATE + 0.12, 0.24], [R_STONE - 0.18, 0.26], [R_STONE - 0.1, 0.32], [R_STONE - 0.02, 0.3], [R_STONE, 0.22], [R_STONE + 0.02, 0.02], [R_STONE + 0.02, -0.02]];
    const stoneGeo = new THREE.LatheGeometry(prof.map(([r, z]) => new THREE.Vector2(r, z)), 160).rotateX(Math.PI / 2);
    const stoneMat = mat('stone').clone(); stoneMat.side = THREE.DoubleSide; stoneMat.color.set('#b3aca0');
    const stoneRing = new THREE.Mesh(stoneGeo, stoneMat);
    stoneRing.position.set(0, cy, wallD / 2 - 0.3); stoneRing.castShadow = stoneRing.receiveShadow = true; G.add(stoneRing);

    // ---- the wall: a long low run either side, a raised gatehouse section over the gate, a hole for the board
    const wallMat = mat('courtyard').clone(); wallMat.map = plasterTexture('#7e2519'); wallMat.color.set('#ffffff');
    const shape = new THREE.Shape();
    shape.moveTo(-wallW / 2, 0); shape.lineTo(wallW / 2, 0); shape.lineTo(wallW / 2, wallH); shape.lineTo(gateW / 2, wallH); shape.lineTo(gateW / 2, gateH); shape.lineTo(-gateW / 2, gateH); shape.lineTo(-gateW / 2, wallH); shape.lineTo(-wallW / 2, wallH); shape.closePath();
    const hole = new THREE.Path(); hole.absarc(0, cy, R_GATE, 0, Math.PI * 2, true); shape.holes.push(hole);
    const wallGeo = new THREE.ExtrudeGeometry(shape, { depth: wallD, bevelEnabled: false, curveSegments: 96 });
    wallGeo.translate(0, 0, -wallD / 2 - 0.3 + 0.0);
    const wall = new THREE.Mesh(wallGeo, wallMat); wall.castShadow = wall.receiveShadow = true; G.add(wall);
    // a grey stone dado along the foot, and a lacquer band under the coping
    const dado = new THREE.Mesh(new THREE.BoxGeometry(wallW + 0.1, 0.7, wallD + 0.12), mat('stone')); dado.position.set(0, 0.35, -0.3); dado.receiveShadow = true; G.add(dado);
    for (const [x0, x1, y] of [[-wallW / 2, -gateW / 2, wallH], [gateW / 2, wallH ? wallW / 2 : 0, wallH], [-gateW / 2, gateW / 2, gateH]]) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.32, wallD + 0.06), mat('lacquerDeep')); band.position.set((x0 + x1) / 2, y - 0.16, -0.3); G.add(band);
    }
    // lacquered pilasters: every 6 m along the runs, and framing the gatehouse
    for (let x = -wallW / 2 + 1; x <= wallW / 2 - 1 + 1e-6; x += (wallW - 2) / 6) {
        const atGate = Math.abs(Math.abs(x) - gateW / 2) < 1.2;
        if (Math.abs(x) < gateW / 2 + 0.6 && !atGate) continue;
        const px0 = atGate ? Math.sign(x) * (gateW / 2 - 0.25) : x, h = atGate ? gateH - 0.32 : wallH - 0.32;
        const pil = new THREE.Mesh(new THREE.BoxGeometry(0.5, h - 0.7, 0.14), mat('lacquerDeep')); pil.position.set(px0, 0.7 + (h - 0.7) / 2, wallD / 2 - 0.3 + 0.07); pil.castShadow = true; G.add(pil);
    }
    // the gatehouse frieze: a lacquer beam under its roof with a row of gilt studs, and a painted band
    { const fr = new THREE.Mesh(new THREE.BoxGeometry(gateW + 0.3, 0.55, 0.2), mat('lacquerDeep')); fr.position.set(0, gateH - 0.6, wallD / 2 - 0.3 + 0.1); G.add(fr);
      const band = new THREE.Mesh(new THREE.BoxGeometry(gateW - 0.6, 0.12, 0.22), mat('gold')); band.position.set(0, gateH - 0.95, wallD / 2 - 0.3 + 0.1); G.add(band);
      const studs = new Builder(); for (let i = 0; i < 17; i++) studs.add(new THREE.SphereGeometry(0.06, 10, 6), new THREE.Matrix4().makeTranslation(-gateW / 2 + 0.55 + i * (gateW - 1.1) / 16, gateH - 0.6, wallD / 2 - 0.3 + 0.22));
      const sm = new THREE.Mesh(studs.build(), mat('gold')); G.add(sm); }
    // the copings: tiled strips on the low runs, a bigger roof with swept ends on the gatehouse
    const addStrip = (L, w, rise, x, y, opt) => {
        const s = tiledStrip(L, w, rise, opt);
        const tileMat = mat('tile');
        for (const [B, m] of [[s.tiles, tileMat], [s.ridge, mat('ridge')], [s.under, mat('lacquerDeep')]]) { const mesh = new THREE.Mesh(B.build(), m); mesh.position.set(x, y, -0.3); mesh.castShadow = mesh.receiveShadow = true; G.add(mesh); }
    };
    const runL = (wallW - gateW) / 2;
    addStrip(runL + 0.4, 0.75, 0.42, -(gateW / 2 + runL / 2), wallH, { lift: 0.05, flick: 0.15 });
    addStrip(runL + 0.4, 0.75, 0.42, gateW / 2 + runL / 2, wallH, { lift: 0.05, flick: 0.15 });
    addStrip(gateW + 1.6, 1.5, 0.95, 0, gateH, { lift: 0.6, flick: 0.7 });

    // ---- the gong: a bronze nipple gong on cords from a lacquered beam on two brackets, over the gate
    const gongY = BOARD_Y + R_STONE + 1.85, gongR = 0.98;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.2, 0.2), mat('lacquer')); beam.position.set(0, gongY + gongR + 0.55, 0.55); beam.castShadow = true; G.add(beam);
    for (const s of [-1, 1]) {
        const br = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.9), mat('lacquer')); br.position.set(s * 1.05, gongY + gongR + 0.55, 0.1); G.add(br);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.04), mat('gold')); cap.position.set(s * 1.05, gongY + gongR + 0.55, 0.56); G.add(cap);
    }
    const gong = new THREE.Group(); gong.position.set(0, gongY, 0.6); G.add(gong);
    const gp = [[0.0, 0.1], [0.11, 0.1], [0.16, 0.06], [0.2, 0.0], [gongR * 0.92, 0.0], [gongR * 0.97, -0.02], [gongR, -0.08], [gongR, -0.14], [gongR - 0.03, -0.14], [gongR - 0.03, -0.06]];
    const gongGeo = new THREE.LatheGeometry(gp.map(([r, z]) => new THREE.Vector2(r, z)), 64).rotateX(Math.PI / 2);
    const hammered = canvasTex(512, 512, (g, w) => {
        g.fillStyle = '#9a7a4a'; g.fillRect(0, 0, w, w);
        // a few broad lathe bands (not grooves) and a dark patina toward the rim
        for (const [r, a] of [[60, 0.18], [150, 0.12], [205, 0.2], [238, 0.3]]) { g.strokeStyle = `rgba(60,35,15,${a})`; g.lineWidth = 10; g.beginPath(); g.arc(w / 2, w / 2, r, 0, Math.PI * 2); g.stroke(); }
        for (let i = 0; i < 520; i++) { const a = i * 2.39996 + (i % 7) * 0.3, r = Math.sqrt(i / 520) * w / 2 * (0.94 + 0.06 * ((i * 37) % 10) / 10); const gr = g.createRadialGradient(w / 2 + Math.cos(a) * r - 3, w / 2 + Math.sin(a) * r - 3, 0, w / 2 + Math.cos(a) * r, w / 2 + Math.sin(a) * r, 9 + (i % 5)); gr.addColorStop(0, 'rgba(255,225,160,0.22)'); gr.addColorStop(1, 'rgba(40,20,5,0.12)'); g.fillStyle = gr; g.beginPath(); g.arc(w / 2 + Math.cos(a) * r, w / 2 + Math.sin(a) * r, 9 + (i % 5), 0, Math.PI * 2); g.fill(); }
    });
    // planar UVs for the hammer marks
    { const p = gongGeo.attributes.position, uv = gongGeo.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + p.getX(i) / (2 * gongR), 0.5 + p.getY(i) / (2 * gongR)); }
    const gongMat = new THREE.MeshStandardMaterial({ color: '#c89a55', map: hammered, roughness: 0.32, metalness: 1, side: THREE.DoubleSide, emissive: new THREE.Color('#ffb060'), emissiveIntensity: 0 });
    const disc = new THREE.Mesh(gongGeo, gongMat); disc.castShadow = true; gong.add(disc);
    const boss = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), gongMat); boss.position.z = 0.1; gong.add(boss);
    // cords: from the rim's top to the beam
    const cordMat = new THREE.MeshStandardMaterial({ color: '#c0281e', roughness: 0.8 });
    for (const s of [-1, 1]) {
        const a = new THREE.Vector3(s * gongR * 0.62, gongR * 0.78, 0), b = new THREE.Vector3(s * 0.75, gongR + 0.45, -0.05);
        gong.add(new THREE.Mesh(sweep([a, a.clone().lerp(b, 0.5), b], [0.018, 0.018, 0.018], 5), cordMat));
        const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.35, 8), cordMat); tassel.position.set(s * 0.95, gongR + 0.1, 0); gong.add(tassel);
    }

    let target = 0;
    function setTarget(n) {
        target = n;
        drawLive(liveCanvas.getContext('2d'), n);
        liveTex.needsUpdate = true;
    }
    setTarget(o.target ?? 0);
    G.userData = {
        setTarget, get target() { return target; }, setGlow(k) { faceMat.emissiveIntensity = k; },
        face, faceMat, gong, gongMat, centre: new THREE.Vector3(0, cy, -0.1), wall, gateH, wallH,
    };
    return G;
}
