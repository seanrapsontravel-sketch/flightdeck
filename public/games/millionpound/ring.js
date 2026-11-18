// The oche ring — the hero. A 2.4 m regulation dartboard centre stage, set in a great ring of light.
//
//   - the board: exact beds at regulation radii (kit/darts RADII × K). Singles black and pewter; the treble and
//     double rings royal blue and violet (never red/green: in this show green MEANS correct and amber means locked
//     in, so the board keeps those colours free); the outer bull silver, the bull GOLD (the free pass, gold = money)
//   - the spider: raised silver wires, and the four quadrant seams (the radials at 18|4, 15|2, 7|16, 9|12) as
//     brighter, thicker light lines, so the four answers read on the board itself
//   - the ring of light: a chrome bezel with four lit arcs, one per quadrant, and a big gold-edged diamond badge
//     carrying each letter at 12, 3, 6 and 9 o'clock
//   - quadrant glow: each quadrant's five wedges can glow (soft ice when the question is live, AMBER locked in,
//     GREEN correct, dim otherwise) — the show's grammar on the thing you threw at
//
// API (group.userData): setQuad(key, state) state ∈ idle | live | locked | right | dim ;  setBull(state) idle | pass ;
//                       setStakes(s 0..1) ;  update(dt) ;  centre ;  badge(key) world position
import * as THREE from 'three';
import { RADII, SLICE, WHEEL, wedgeAngle } from '../lib3d/kit/darts.js';
import { AMBER, BOARD_Y, GREEN, ICE, GOLDC, K, LETTERS, QUAD_ANGLE, R_BEZEL, R_HALO, R_NUMBERS, ZONES, canvasTex, glowMat, sectorGeo } from './common.js';

const N = 2048, C = N / 2, px = (m) => (m / R_NUMBERS) * (N / 2);
const FONT = (s, w = 900) => `${w} ${px(s)}px "Avenir Next Condensed", "DIN Condensed", "Roboto Condensed", Impact, sans-serif`;
function arc(g, r0, r1, a0, a1) { g.beginPath(); g.arc(C, C, px(r1), -a1, -a0); g.arc(C, C, px(r0), -a0, -a1, true); g.closePath(); }

function faceTexture() {
    return canvasTex(N, N, (g) => {
        g.fillStyle = '#05060c'; g.fillRect(0, 0, N, N);
        for (let i = 0; i < 20; i++) {
            const n = WHEEL[i], a = wedgeAngle(n), a0 = a - SLICE / 2, a1 = a + SLICE / 2, even = i % 2 === 0;
            const sCol = even ? '#0b0c12' : '#8e94a4', rCol = even ? '#1534d0' : '#5a1cc4';
            arc(g, RADII.outerBull * K, RADII.trebleIn * K, a0, a1); g.fillStyle = sCol; g.fill();
            arc(g, RADII.trebleIn * K, RADII.trebleOut * K, a0, a1); g.fillStyle = rCol; g.fill();
            arc(g, RADII.trebleOut * K, RADII.doubleIn * K, a0, a1); g.fillStyle = sCol; g.fill();
            arc(g, RADII.doubleIn * K, RADII.doubleOut * K, a0, a1); g.fillStyle = rCol; g.fill();
        }
        // sisal fibre: fine radial grain over the beds
        g.save(); arc(g, RADII.outerBull * K, RADII.doubleOut * K, 0, Math.PI * 2); g.clip();
        for (let i = 0; i < 9000; i++) {
            const a = (i * 2.399963) % (Math.PI * 2), r = px(RADII.outerBull * K + ((i * 0.618034) % 1) * (RADII.doubleOut - RADII.outerBull) * K);
            g.fillStyle = i % 2 ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.05)';
            g.fillRect(C + r * Math.cos(a), C - r * Math.sin(a), 2, 2);
        }
        g.restore();
        // bulls: silver outer bull, a gold bull (the free pass)
        arc(g, RADII.bull * K, RADII.outerBull * K, 0, Math.PI * 2); g.fillStyle = '#8f9ab3'; g.fill();
        arc(g, 0, RADII.bull * K, 0, Math.PI * 2); g.fillStyle = '#e0a838'; g.fill();
        // the number ring: black, silver numerals
        g.fillStyle = '#c9d2e6'; g.font = FONT(0.15); g.textAlign = 'center'; g.textBaseline = 'middle';
        for (const n of WHEEL) { const a = wedgeAngle(n), r = px((RADII.doubleOut * K + R_NUMBERS) / 2); g.fillText(String(n), C + r * Math.cos(a), C - r * Math.sin(a) + px(0.006)); }
    });
}
/** where the bull is gold and the numerals silver, metal; the beds a matte fibre */
function ormTexture() {
    return canvasTex(N / 2, N / 2, (g, w) => {
        const s = w / N; g.scale(s, s);
        g.fillStyle = 'rgb(0,215,0)'; g.fillRect(0, 0, N, N);
        arc(g, RADII.doubleOut * K, R_NUMBERS, 0, Math.PI * 2); g.fillStyle = 'rgb(0,120,0)'; g.fill();
        arc(g, 0, RADII.outerBull * K, 0, Math.PI * 2); g.fillStyle = 'rgb(0,60,255)'; g.fill();
        g.fillStyle = 'rgb(0,60,255)'; g.font = FONT(0.15); g.textAlign = 'center'; g.textBaseline = 'middle';
        for (const n of WHEEL) { const a = wedgeAngle(n), r = px((RADII.doubleOut * K + R_NUMBERS) / 2); g.fillText(String(n), C + r * Math.cos(a), C - r * Math.sin(a) + px(0.006)); }
    }, { srgb: false });
}

/** a letter badge: a navy diamond with a gold edge and a white letter (emissive map so it can light up) */
function badgeTexture(L) {
    return canvasTex(512, 512, (g, w) => {
        g.translate(w / 2, w / 2); g.rotate(Math.PI / 4);
        const s = w * 0.33;
        const grd = g.createLinearGradient(-s, -s, s, s); grd.addColorStop(0, '#1b2a8a'); grd.addColorStop(1, '#070b33');
        g.fillStyle = grd; g.fillRect(-s, -s, 2 * s, 2 * s);
        g.lineWidth = w * 0.035; g.strokeStyle = '#ffd36a'; g.strokeRect(-s, -s, 2 * s, 2 * s);
        g.lineWidth = w * 0.008; g.strokeStyle = 'rgba(255,240,200,0.7)'; g.strokeRect(-s * 0.86, -s * 0.86, 1.72 * s, 1.72 * s);
        g.rotate(-Math.PI / 4);
        g.fillStyle = '#ffffff'; g.font = `900 ${w * 0.42}px "Avenir Next Condensed","DIN Condensed",Impact,sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.shadowColor = 'rgba(120,170,255,0.9)'; g.shadowBlur = w * 0.04;
        g.fillText(L, 0, w * 0.025);
    });
}

const STATE_COL = { idle: ICE, live: ICE, locked: AMBER, right: GREEN, dim: ICE };
const STATE_OP = { idle: 0.0, live: 0.14, locked: 0.62, right: 0.7, dim: 0.0 };
const ARC_K = { idle: 0.55, live: 0.85, locked: 2.6, right: 2.8, dim: 0.18 };

export function ocheRing() {
    const G = new THREE.Group(); G.name = 'oche-ring';
    const cy = BOARD_Y;

    // ---- the board face
    const faceMat = new THREE.MeshPhysicalMaterial({ map: faceTexture(), roughnessMap: ormTexture(), roughness: 1, metalness: 1, clearcoat: 0.2, clearcoatRoughness: 0.55, envMapIntensity: 0.35 });
    faceMat.metalnessMap = faceMat.roughnessMap;
    const face = new THREE.Mesh(new THREE.CircleGeometry(R_NUMBERS + 0.01, 220), faceMat);
    face.position.set(0, cy, 0); face.receiveShadow = true; G.add(face);

    // ---- answer glows, one per wedge (the zones shrink: only a zone's wedges light), and a shade over the
    //      wedges that aren't in play this visit, so the live targets read from across a bar
    const quads = {};
    const shadeMat = () => new THREE.MeshBasicMaterial({ color: '#01020a', transparent: true, opacity: 0, depthWrite: false, fog: false });
    for (const L of LETTERS) quads[L] = { wedges: [], m: glowMat(ICE, 0), state: 'idle', op: 0, target: 0, col: ICE.clone(), arcK: ARC_K.idle, arcT: ARC_K.idle, pulse: 0 };
    for (const n of WHEEL) {
        const L = LETTERS.find((k) => ZONES[5][k].includes(n)), a = wedgeAngle(n);
        const glow = new THREE.Mesh(sectorGeo(RADII.outerBull * K + 0.004, RADII.doubleOut * K, a - SLICE / 2, a + SLICE / 2, 160), quads[L].m);
        glow.position.set(0, cy, 0.006); glow.renderOrder = 2; G.add(glow);
        const sm = shadeMat();
        const shade = new THREE.Mesh(sectorGeo(RADII.outerBull * K + 0.002, R_NUMBERS - 0.004, a - SLICE / 2, a + SLICE / 2, 160), sm);
        shade.position.set(0, cy, 0.005); shade.renderOrder = 1; G.add(shade);
        quads[L].wedges.push({ n, glow, shade, sm, active: true, sh: 0 });
    }

    // ---- the spider: silver wire rings and radials, the quadrant seams brighter and thicker
    const wireMat = new THREE.MeshStandardMaterial({ color: '#d8deea', metalness: 1, roughness: 0.22 });
    const wires = new THREE.Group(); wires.position.set(0, cy, 0.008); G.add(wires);
    for (const r of [RADII.bull, RADII.outerBull, RADII.trebleIn, RADII.trebleOut, RADII.doubleIn, RADII.doubleOut]) wires.add(new THREE.Mesh(new THREE.TorusGeometry(r * K, 0.0055, 6, 240), wireMat));
    const seamAt = new Set([45, 135, 225, 315]);
    const seamMat = glowMat('#cfe0ff', 0.95);
    for (let i = 0; i < 20; i++) {
        const a = wedgeAngle(WHEEL[i]) + SLICE / 2, deg = Math.round(THREE.MathUtils.radToDeg(((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)));
        const r0 = RADII.outerBull * K, r1 = RADII.doubleOut * K, rm = (r0 + r1) / 2;
        const seam = seamAt.has(deg);
        const box = new THREE.Mesh(new THREE.BoxGeometry(seam ? (R_NUMBERS - r0) : r1 - r0, seam ? 0.016 : 0.008, 0.009), seam ? seamMat : wireMat);
        const rr = seam ? (r0 + R_NUMBERS) / 2 : rm;
        box.position.set(Math.cos(a) * rr, Math.sin(a) * rr, seam ? 0.004 : 0); box.rotation.z = a; wires.add(box);
    }
    wires.add(new THREE.Mesh(new THREE.TorusGeometry(R_NUMBERS, 0.022, 10, 240), wireMat));

    // ---- the ring of light: a chrome lathe bezel, a recessed diffuser, four lit arcs and a dark outer lip
    const chrome = new THREE.MeshPhysicalMaterial({ color: '#2a2f3d', metalness: 1, roughness: 0.18, clearcoat: 0.6, clearcoatRoughness: 0.12 });
    const prof = [[R_NUMBERS + 0.005, -0.06], [R_NUMBERS + 0.02, 0.06], [R_BEZEL - 0.02, 0.1], [R_BEZEL, 0.05], [R_HALO - 0.03, 0.05], [R_HALO, 0.11], [R_HALO + 0.07, 0.13], [R_HALO + 0.1, 0.05], [R_HALO + 0.1, -0.25]];
    const bezel = new THREE.Mesh(new THREE.LatheGeometry(prof.map(([r, z]) => new THREE.Vector2(r, z)), 220).rotateX(Math.PI / 2), chrome);
    bezel.position.set(0, cy, 0); bezel.castShadow = true; G.add(bezel);
    const diffuserMat = new THREE.MeshStandardMaterial({ color: '#0a0d1c', roughness: 0.4, metalness: 0.2, emissive: new THREE.Color('#2a3c8a'), emissiveIntensity: 0.6 });
    const diffuser = new THREE.Mesh(new THREE.RingGeometry(R_BEZEL + 0.01, R_HALO - 0.04, 220), diffuserMat);
    diffuser.position.set(0, cy, 0.051); G.add(diffuser);
    // four arcs, one per answer, as wide as its zone (they narrow as the zones shrink), an inner and an outer band
    const arcGroup = new THREE.Group(); G.add(arcGroup);
    let zoneSize = 5;
    function buildArcs(size) {
        for (const c of [...arcGroup.children]) { arcGroup.remove(c); c.geometry.dispose(); }
        for (const L of LETTERS) {
            const a = QUAD_ANGLE[L] + (size === 2 ? -SLICE / 2 : 0), half = THREE.MathUtils.degToRad(Math.max(7, size * 9 - 1.5));
            if (!quads[L].arcMat) quads[L].arcMat = glowMat(ICE, 1);
            const m = quads[L].arcMat;
            const inner = new THREE.Mesh(sectorGeo(R_BEZEL + 0.04, R_BEZEL + 0.085, a - half, a + half, 200), m);
            const outer = new THREE.Mesh(sectorGeo(R_HALO - 0.1, R_HALO - 0.065, a - half, a + half, 200), m);
            for (const sm of [inner, outer]) { sm.position.set(0, cy, 0.056); sm.renderOrder = 2; arcGroup.add(sm); }
        }
    }
    buildArcs(5);
    function setZones(size) {
        zoneSize = size;
        for (const L of LETTERS) for (const w of quads[L].wedges) w.active = (ZONES[size] || ZONES[5])[L].includes(w.n);
        buildArcs(size);
    }
    // a soft halo in the air round the ring (additive, behind)
    const haloTex = canvasTex(512, 512, (g, w) => { const gr = g.createRadialGradient(w / 2, w / 2, w * 0.3, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); });
    const haloMat = new THREE.MeshBasicMaterial({ map: haloTex, color: new THREE.Color('#3a5cff'), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(R_HALO * 3.2, R_HALO * 3.2), haloMat);
    halo.position.set(0, cy, -0.3); halo.renderOrder = -1; G.add(halo);

    // ---- letter badges at 12, 3, 6, 9 o'clock, just outside the ring
    const badges = {};
    const RB = R_HALO + 0.42;
    for (const L of LETTERS) {
        const a = QUAD_ANGLE[L];
        const tex = badgeTexture(L);
        const m = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.5, transparent: true, roughness: 0.35, metalness: 0.3, alphaTest: 0.02 });
        const b = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.78), m);
        b.position.set(Math.cos(a) * RB, cy + Math.sin(a) * RB, 0.14); b.renderOrder = 3; G.add(b);
        badges[L] = { mesh: b, m };
        quads[L].badge = badges[L];
    }

    // ---- the bull: a gold glow for the free pass
    const bullGlow = new THREE.Mesh(new THREE.CircleGeometry(RADII.outerBull * K * 2.2, 48), glowMat(GOLDC, 0));
    bullGlow.position.set(0, cy, 0.012); bullGlow.renderOrder = 2; G.add(bullGlow);
    let bull = { state: 'idle', k: 0, target: 0 };

    // ---- a back plate the ring stands in front of (dark, catches the halo)
    const back = new THREE.Mesh(new THREE.CircleGeometry(R_HALO + 0.12, 96), new THREE.MeshStandardMaterial({ color: '#04050c', roughness: 0.6, metalness: 0.5 }));
    back.position.set(0, cy, -0.26); G.add(back);

    let stakes = 0, clock = 0;
    function setQuad(L, state) {
        const q = quads[L]; if (!q) return;
        q.state = state; q.target = STATE_OP[state] ?? 0; q.arcT = ARC_K[state] ?? 0.6;
        q.col.copy(STATE_COL[state] || ICE);
        if (state === 'locked' || state === 'right') q.pulse = 1;
    }
    function setBull(state) { bull.state = state; bull.target = state === 'pass' ? 1.2 : 0; if (state === 'pass') bull.k = 2; }
    function update(dt) {
        clock += dt;
        const breathe = 0.5 + 0.5 * Math.sin(clock * 1.6);
        for (const L of LETTERS) {
            const q = quads[L];
            q.pulse = Math.max(0, q.pulse - dt * 1.4);
            q.op += (q.target - q.op) * (1 - Math.exp(-dt * 7));
            const flick = q.state === 'locked' ? 0.08 * Math.sin(clock * 9) : q.state === 'right' ? 0.12 * Math.sin(clock * 6) : 0;
            q.m.color.copy(q.col).multiplyScalar(1.6 + 0.8 * q.pulse);
            q.m.opacity = Math.max(0, q.op + flick + (q.state === 'live' ? 0.03 * breathe : 0));
            for (const w of q.wedges) {
                w.glow.visible = w.active;
                w.sh += ((w.active ? 0 : 0.84) - w.sh) * (1 - Math.exp(-dt * 5));
                w.sm.opacity = w.sh; w.shade.visible = w.sh > 0.01;
            }
            q.arcK += (q.arcT - q.arcK) * (1 - Math.exp(-dt * 6));
            const arcCol = q.state === 'locked' ? AMBER : q.state === 'right' ? GREEN : ICE;
            q.arcMat.color.copy(arcCol).multiplyScalar(q.arcK * (q.state === 'live' || q.state === 'idle' ? (0.85 + 0.25 * breathe) * (1 - 0.35 * stakes) : 1) + 1.4 * q.pulse);
            q.badge.m.emissiveIntensity = q.state === 'dim' ? 0.18 : q.state === 'locked' || q.state === 'right' ? 1.6 + q.pulse : 0.55 + 0.15 * breathe;
            q.badge.m.emissive.copy(q.state === 'locked' ? AMBER : q.state === 'right' ? GREEN : new THREE.Color('#ffffff'));
            q.badge.mesh.scale.setScalar(1 + 0.18 * q.pulse);
        }
        bull.k += (bull.target - bull.k) * (1 - Math.exp(-dt * 4));
        bullGlow.material.opacity = Math.min(1, bull.k * (0.7 + 0.3 * Math.sin(clock * 8)));
        bullGlow.scale.setScalar(1 + 0.4 * Math.max(0, bull.k - 1));
        haloMat.opacity = 0.35 + 0.25 * breathe * (1 - stakes * 0.5);
        diffuserMat.emissiveIntensity = 0.45 + 0.25 * breathe;
    }
    G.userData = {
        setQuad, setBull, update, quads, badges, setZones, get zoneSize() { return zoneSize; },
        activeWedges: () => LETTERS.flatMap((L) => quads[L].wedges.filter((w) => w.active).map((w) => w.n)),
        setStakes(s) { stakes = s; },
        get bullState() { return bull.state; },
        centre: new THREE.Vector3(0, cy, 0),
        badge: (L) => badges[L].mesh.getWorldPosition(new THREE.Vector3()),
    };
    return G;
}
