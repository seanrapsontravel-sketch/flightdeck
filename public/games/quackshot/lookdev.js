// Quackshot Milestone 0 look-dev: the ducks on a turntable, in neutral studio light, in a rough blue-hour light and
// as solid silhouettes; plus one rough still of the target concept. Driven by docs/plans/tools/quackshot-lookdev.cjs
// through window.__ld.show({...}); also usable by hand: quackshot-3d.html?lookdev=duck&variant=B&view=34&light=blue
import * as THREE from 'three';
import { Engine, withPreset } from '../lib3d/engine.js';
import { RADII, SLICE, WHEEL, wedgeAngle } from '../lib3d/kit/darts.js';
import { Flames } from '../limbo/fire.js';
import { VARIANTS, rubberDuck, rubberDuckInstances, tinDuck } from './duck.js';

const Q = new URLSearchParams(location.search);
const canvas = document.getElementById('stage');

// studio: a soft key from the camera's upper left, white fill, a neutral rim; grey sweep
const STUDIO = withPreset('dusk', {
    key: { az: 228, el: 38, color: '#fff6ec', intensity: 2.6, extent: 2.5, map: 2048, far: 30, dist: 12 },
    fog: { away: '#808080', toward: '#808080', density: 0.00001, height: 40, ramp: 200 },
    hemi: { sky: '#e8eef6', ground: '#4a4744', intensity: 0.35 },
    rim: { color: '#ffffff', intensity: 1.1 },
    envFloor: [0.09, 0.09, 0.09],
    grade: { sat: 1.12, warm: 0, lift: 0 },
    bloom: 0.025, vignette: 0.18, ca: 0,
});
// blue hour: cool sky key from high behind, warm bulb practicals in front and overhead (the bg photo's light)
const BLUE = withPreset('dusk', {
    key: { az: 160, el: 42, color: '#8fa8ff', intensity: 1.1, extent: 2.5, map: 2048, far: 30, dist: 12 },
    fog: { away: '#0d1a44', toward: '#1d2550', density: 0.00002, height: 40, ramp: 200 },
    hemi: { sky: '#3d5aa8', ground: '#2a1410', intensity: 0.35 },
    rim: null,
    envFloor: [0.02, 0.008, 0.01],
    grade: { sat: 1.06, warm: 0.05, lift: 0.002 },
    bloom: 0.09, vignette: 0.4, ca: 0.4,
});

const light = Q.get('light') || 'studio';
const engine = new Engine(canvas, light === 'blue' ? BLUE : STUDIO);
const { scene, camera, renderer } = engine;
camera.fov = 22; camera.near = 0.05; camera.far = 400;
scene.fog = null;
// the engine's shadow biases are sized for 50 m scenes; a 1 m duck needs millimetres, or a ring prints round the base
engine.sun.shadow.normalBias = 0.003; engine.sun.shadow.bias = -0.0002;

function gradientTexture(stops, h = 512) {
    const c = document.createElement('canvas'); c.width = 4; c.height = h;
    const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, h);
    for (const [t, col] of stops) gr.addColorStop(t, col);
    g.fillStyle = gr; g.fillRect(0, 0, 4, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
}

// ---------------------------------------------------------------- sets
const studioSet = new THREE.Group();
{
    // a photographic sweep: floor curving up into a back wall
    const g = new THREE.PlaneGeometry(40, 30, 1, 60), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
        const v = (p.getY(i) + 15) / 30; // 0 front .. 1 top
        const s = v * 30;                 // arc length
        let y, z;
        if (s < 14) { y = 0; z = 8 - s; } else if (s < 14 + Math.PI * 2) { const a = (s - 14) / 4; y = 4 - Math.cos(a) * 4; z = -6 - Math.sin(a) * 4; } else { y = 4 + (s - 14 - Math.PI * 2); z = -10; }
        p.setXYZ(i, p.getX(i), y, z);
    }
    g.computeVertexNormals();
    const sweep = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#8a8c90', roughness: 0.92, envMapIntensity: 0.6 }));
    sweep.receiveShadow = true;
    studioSet.add(sweep);
}
const blueSet = new THREE.Group();
const blueBulbs = [];
{
    // a red-lacquered counter top (the bg photo's), stripes on the front edge
    const top = new THREE.Mesh(new THREE.BoxGeometry(14, 0.08, 4), new THREE.MeshPhysicalMaterial({ color: '#b3122e', roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.2 }));
    top.position.y = -0.04; top.receiveShadow = true; blueSet.add(top);
    // background bulb strings (they go out of focus) and a couple of warm practicals that actually light the duck
    const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc477').multiplyScalar(6), toneMapped: true });
    const bulbGeo = new THREE.SphereGeometry(0.05, 12, 8);
    for (let row = 0; row < 3; row++) for (let i = 0; i < 26; i++) {
        const b = new THREE.Mesh(bulbGeo, bulbMat);
        const x = -9 + i * 0.72 + row * 0.3, sag = Math.sin((i / 25) * Math.PI) * 0.5;
        b.position.set(x, 3.4 + row * 0.9 - sag, -4.5 - row * 2.5);
        blueSet.add(b); blueBulbs.push(b);
    }
    const p1 = new THREE.PointLight('#ffb35c', 9, 0, 2); p1.position.set(-1.2, 2.2, 1.6); blueSet.add(p1);
    const p2 = new THREE.PointLight('#ffb35c', 6, 0, 2); p2.position.set(1.4, 2.0, -1.4); blueSet.add(p2);
    const p3 = new THREE.PointLight('#ff9a40', 2.5, 0, 2); p3.position.set(0.3, 0.6, 2.2); blueSet.add(p3);
}

function envFor(mode) {
    const g = new THREE.Group();
    if (mode === 'studio') {
        // two large softboxes and a strip: the shapes the gloss reflects
        const box = (w, h, pos, k) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(k), side: THREE.DoubleSide })); m.position.copy(pos); m.lookAt(0, 0.5, 0); g.add(m); };
        box(4, 3, new THREE.Vector3(-6, 6, 5), 7);
        box(3, 3, new THREE.Vector3(6, 3, 4), 2.5);
        box(1, 6, new THREE.Vector3(2, 4, -7), 4);
        const dome = new THREE.Mesh(new THREE.SphereGeometry(60, 32, 16), new THREE.MeshBasicMaterial({ map: gradientTexture([[0, '#6f7378'], [0.55, '#55585c'], [1, '#2c2d2f']]), side: THREE.BackSide }));
        g.add(dome);
    } else {
        const dome = new THREE.Mesh(new THREE.SphereGeometry(60, 32, 16), new THREE.MeshBasicMaterial({ map: gradientTexture([[0, '#071033'], [0.42, '#1b2d6e'], [0.5, '#3a2a40'], [0.56, '#180a0c'], [1, '#080406']]), side: THREE.BackSide }));
        g.add(dome);
        // bulb strings overhead and behind, as the gloss should catch them
        const bm = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc477').multiplyScalar(30) });
        for (let i = 0; i < 40; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), bm); const a = (i / 40) * Math.PI * 2; b.position.set(Math.cos(a) * 6, 4 + Math.sin(i * 1.7) * 0.6, Math.sin(a) * 6); g.add(b); }
        const warm = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff9440').multiplyScalar(1.6), side: THREE.DoubleSide }));
        warm.position.set(0, 5, 2); warm.lookAt(0, 0, 0); g.add(warm);
    }
    return g;
}

let currentLight = null;
function setLight(mode) {
    if (mode === currentLight) return;
    currentLight = mode;
    scene.remove(studioSet, blueSet);
    if (mode === 'studio') { scene.add(studioSet); scene.background = new THREE.Color('#77797d'); }
    if (mode === 'blue') { scene.add(blueSet); scene.background = gradientTexture([[0, '#06102e'], [0.55, '#1a2c6a'], [0.8, '#2b2648'], [1, '#120a10']]); }
    if (mode !== 'sil') engine.bakeEnvironment(envFor(mode));
}

// ---------------------------------------------------------------- subjects
const stage = new THREE.Group(); scene.add(stage);
const box = new THREE.Box3(), tmp = new THREE.Vector3();

function clear() { while (stage.children.length) stage.remove(stage.children[0]); }

// rotation about y so the duck (which faces +x) faces: side = left, front = camera, 34 = front-left, back = away
const YAW = { side: Math.PI, front: -Math.PI / 2, '34': -Math.PI * 0.75, back: Math.PI / 2, top: Math.PI, head: -Math.PI * 0.72, far: -Math.PI * 0.8, '34r': -Math.PI * 0.25 };

/** aim the camera at a box from the front (+z), slightly raised; `fill` = fraction of frame the box spans */
function frame(b, { elev = 7, fill = 0.8, top = false } = {}) {
    const c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
    const vf = THREE.MathUtils.degToRad(camera.fov), hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
    if (top) {
        const d = Math.max(s.z / 2 / Math.tan(vf / 2), s.x / 2 / Math.tan(hf / 2)) / fill + s.y / 2;
        camera.up.set(0, 0, -1); camera.position.set(c.x, c.y + d, c.z); camera.lookAt(c);
        return d;
    }
    const d = Math.max(s.y / 2 / Math.tan(vf / 2), s.x / 2 / Math.tan(hf / 2)) / fill + s.z / 2;
    const e = THREE.MathUtils.degToRad(elev);
    camera.up.set(0, 1, 0);
    camera.position.set(c.x, c.y + Math.sin(e) * d, c.z + Math.cos(e) * d);
    camera.lookAt(c);
    return d;
}

let flames = null;
function showDuck(o) {
    const duck = rubberDuck({ variant: o.variant || 'A', lod: o.lod ?? 0, body: o.body });
    duck.rotation.y = YAW[o.view] ?? YAW.side;
    stage.add(duck);
    duck.updateMatrixWorld(true);
    box.setFromObject(duck, true);
    if (o.view === 'head') {
        // tight on the head and bill: the bed-shot close-up
        const h = duck.geometry.userData.head;
        const c = h.c.clone().add(new THREE.Vector3(0.12, -0.02, 0)).applyMatrix4(duck.matrixWorld);
        const r = h.r * 1.45;
        const hb = new THREE.Box3(c.clone().subScalar(r), c.clone().addScalar(r));
        engine.dof.focus = frame(hb, { elev: 6, fill: 0.95 });
    } else if (o.view === 'far') {
        // master distance: a 0.25 m parade duck from 12 m with the master lens is ~40 px long at 1080p
        duck.scale.setScalar(0.25); duck.updateMatrixWorld(true); box.setFromObject(duck, true);
        camera.fov = 34; camera.updateProjectionMatrix();
        const c = box.getCenter(new THREE.Vector3());
        camera.up.set(0, 1, 0); camera.position.set(c.x, c.y + 1.6, c.z + 12); camera.lookAt(c);
        engine.dof.focus = 12;
    } else {
        engine.dof.focus = frame(box, { top: o.view === 'top', fill: o.fill ?? 0.78 });
    }
    engine.dof.aperture = o.light === 'blue' ? 0.25 : 0;
    engine.placeShadow(box.getCenter(tmp));
}

function showLineup(o) {
    const keys = Object.keys(VARIANTS);
    keys.forEach((k, i) => {
        const d = rubberDuck({ variant: k, lod: 0 });
        d.rotation.y = YAW[o.view] ?? YAW.side;
        d.position.x = (i - (keys.length - 1) / 2) * 1.35;
        stage.add(d);
    });
    stage.updateMatrixWorld(true);
    box.setFromObject(stage, true);
    engine.dof.focus = frame(box, { fill: 0.86 });
    engine.dof.aperture = 0;
    engine.placeShadow(box.getCenter(tmp));
}

function showTin(o) {
    const g = new THREE.Group();
    const finishes = o.finish ? [o.finish] : ['enamel', 'gold'];
    finishes.forEach((f, i) => {
        const t = tinDuck({ finish: f, height: 0.5 });
        t.position.x = (i - (finishes.length - 1) / 2) * 0.72;
        g.add(t);
    });
    g.rotation.y = o.view === '34' ? -0.55 : 0;
    stage.add(g); g.updateMatrixWorld(true);
    // lift off the sweep onto a brass ledge like the bull boss's
    const ledge = new THREE.Mesh(new THREE.BoxGeometry(finishes.length * 0.75, 0.04, 0.2), new THREE.MeshStandardMaterial({ color: '#7b5a26', roughness: 0.45, metalness: 1 }));
    ledge.position.y = -0.04; g.add(ledge); ledge.receiveShadow = true;
    g.position.y = 0.06; g.updateMatrixWorld(true);
    box.setFromObject(g, true);
    engine.dof.focus = frame(box, { fill: 0.82 });
    engine.dof.aperture = 0;
    engine.placeShadow(box.getCenter(tmp));
}

// ---------------------------------------------------------------- rough target concept
// Scale: the double ring's outer edge (170 mm on a real board) is 2.0 m; the number ring runs to 2.5 m.
const K = 2.0 / RADII.doubleOut;
function targetFace() {
    const N = 2048, R = 2.5, px = (m) => (m / R) * (N / 2);
    const c = document.createElement('canvas'); c.width = c.height = N;
    const g = c.getContext('2d'), cx = N / 2, cy = N / 2;
    const ring = (r0, r1, a0, a1, fill) => { g.beginPath(); g.arc(cx, cy, px(r1), -a1, -a0); g.arc(cx, cy, px(r0), -a0, -a1, true); g.closePath(); g.fillStyle = fill; g.fill(); };
    // number ring: navy enamel
    ring(RADII.doubleOut * K, R, 0, Math.PI * 2, '#141c3c');
    for (let i = 0; i < 20; i++) {
        const n = WHEEL[i], a = wedgeAngle(n), a0 = a - SLICE / 2, a1 = a + SLICE / 2, even = i % 2 === 0;
        // outer board = painted water: alternate deep / bright sea so every bed still reads
        ring(RADII.doubleIn * K, RADII.doubleOut * K, a0, a1, even ? '#0b3d78' : '#0d7f9e');
        ring(RADII.trebleOut * K, RADII.doubleIn * K, a0, a1, even ? '#145a9c' : '#2aa7c4');
        // treble = the brass pipe of the flame ring (scorched enamel either side)
        ring(RADII.trebleIn * K, RADII.trebleOut * K, a0, a1, even ? '#3a1d10' : '#5a2a12');
        // inner singles = the carnival: cream and red, like the counter's stripes
        ring(RADII.outerBull * K, RADII.trebleIn * K, a0, a1, even ? '#f2e6c9' : '#c8202e');
    }
    // wave crests painted across the water beds
    g.save(); g.globalAlpha = 0.35; g.strokeStyle = '#d9f6ff'; g.lineWidth = 4;
    for (let r = RADII.trebleOut * K + 0.05; r < RADII.doubleOut * K; r += 0.09) {
        g.beginPath();
        for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.01) { const rr = r + Math.sin(a * 60 + r * 20) * 0.012; const x = cx + px(rr) * Math.cos(a), y = cy - px(rr) * Math.sin(a); a ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.stroke();
    }
    g.restore();
    // bulls: brass boss (painted base; geometry sits on top)
    ring(RADII.bull * K, RADII.outerBull * K, 0, Math.PI * 2, '#1f7a3a');
    ring(0, RADII.bull * K, 0, Math.PI * 2, '#c8202e');
    // the spider: thin gilt wire
    g.strokeStyle = '#e0c27a'; g.lineWidth = 5;
    for (const r of [RADII.bull, RADII.outerBull, RADII.trebleIn, RADII.trebleOut, RADII.doubleIn, RADII.doubleOut]) { g.beginPath(); g.arc(cx, cy, px(r * K), 0, Math.PI * 2); g.stroke(); }
    for (let i = 0; i < 20; i++) { const a = wedgeAngle(WHEEL[i]) + SLICE / 2; g.beginPath(); g.moveTo(cx + px(RADII.outerBull * K) * Math.cos(a), cy - px(RADII.outerBull * K) * Math.sin(a)); g.lineTo(cx + px(RADII.doubleOut * K) * Math.cos(a), cy - px(RADII.doubleOut * K) * Math.sin(a)); g.stroke(); }
    // numbers in gilt circus type
    g.fillStyle = '#f3c45a'; g.font = `900 ${px(0.3)}px "Avenir Next Condensed", "DIN Condensed", Impact, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const n of WHEEL) { const a = wedgeAngle(n), r = px(2.24); g.fillText(String(n), cx + r * Math.cos(a), cy - r * Math.sin(a)); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return t;
}

function showTarget(o) {
    scene.background = gradientTexture([[0, '#050c2a'], [0.5, '#16286a'], [0.75, '#2c2a55'], [1, '#100808']]);
    const T = new THREE.Group(); T.position.set(0, 3.15, 0); stage.add(T);
    const face = new THREE.Mesh(new THREE.CircleGeometry(2.5, 160), new THREE.MeshPhysicalMaterial({ map: targetFace(), roughness: 0.42, clearcoat: 0.4, clearcoatRoughness: 0.25 }));
    face.receiveShadow = true; T.add(face);
    const rimM = new THREE.MeshStandardMaterial({ color: '#c79a45', roughness: 0.3, metalness: 1 });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(2.52, 0.07, 16, 160), rimM); T.add(rim);
    // number-ring bulbs
    const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd28a').multiplyScalar(5) }), 80);
    const M = new THREE.Matrix4();
    for (let i = 0; i < 80; i++) { const a = (i / 80) * Math.PI * 2; M.makeTranslation(Math.cos(a) * 2.42, Math.sin(a) * 2.42, 0.06); bulbs.setMatrixAt(i, M); }
    T.add(bulbs);
    // the flame ring: a brass pipe on the treble with gas flames standing off it
    const rT = ((RADII.trebleIn + RADII.trebleOut) / 2) * K;
    const pipe = new THREE.Mesh(new THREE.TorusGeometry(rT, 0.028, 12, 200), rimM); pipe.position.z = 0.03; T.add(pipe);
    if (flames) scene.remove(flames.mesh);
    flames = new Flames(scene, engine.time, 200);
    for (let i = 0; i < 60; i++) {
        const a = (i / 60) * Math.PI * 2;
        const p = new THREE.Vector3(Math.cos(a) * rT, Math.sin(a) * rT + 3.15, 0.07);
        // at rest the ring is pilot lights; a treble hit roars it up (o.fire shows that)
        flames.add({ p, w: o.fire ? 0.2 : 0.06, h: o.fire ? 0.6 : 0.09, seed: i * 0.137, intensity: o.fire ? 1.1 : 0.7 });
    }
    flames.flush();
    // the parade: rubber ducks riding a rail near the outer edge of the inner-single ring
    const rP = (RADII.trebleIn - 14) * K;
    const rail = new THREE.Mesh(new THREE.TorusGeometry(rP - 0.03, 0.015, 8, 200), rimM); rail.position.z = 0.05; T.add(rail);
    const n = 20, ducks = rubberDuckInstances(n, { variant: o.variant || 'A', lod: 1 });
    const s = 0.24, D = new THREE.Object3D();
    for (let i = 0; i < n; i++) {
        // gondola-style: every duck stays upright on its perch (like a Ferris-wheel car) and shows its profile,
        // facing the way the parade runs (clockwise: rightward across the top, leftward along the bottom)
        const a = (i / n) * Math.PI * 2 + 0.08;
        D.position.set(Math.cos(a) * rP, Math.sin(a) * rP - 0.02, 0.1);
        D.rotation.set(0, Math.sin(a) >= 0 ? 0 : Math.PI, 0);
        D.scale.setScalar(s); D.updateMatrix();
        ducks.setMatrixAt(i, D.matrix);
    }
    T.add(ducks);
    // the bull: brass boss with a ledge, two tin prize ducks standing on it
    const boss = new THREE.Mesh(new THREE.CylinderGeometry(RADII.outerBull * K, RADII.outerBull * K * 1.05, 0.12, 48).rotateX(Math.PI / 2), rimM); boss.position.z = 0.06; T.add(boss);
    const ledge = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.035, 0.32), rimM); ledge.position.set(0, RADII.bull * K * 0.2, 0.22); T.add(ledge);
    const t1 = tinDuck({ finish: 'enamel', height: 0.38 }); t1.position.set(-0.26, ledge.position.y + 0.03, 0.26); t1.rotation.y = Math.PI; T.add(t1);
    const t2 = tinDuck({ finish: 'gold', height: 0.38 }); t2.position.set(0.26, ledge.position.y + 0.03, 0.26); T.add(t2);
    // a warm key from the awning, cool sky fill; a few practicals
    const key = new THREE.SpotLight('#ffcf8a', 120, 0, 0.6, 0.6, 2); key.position.set(0, 8.5, 6); key.target.position.set(0, 3.1, 0); stage.add(key, key.target);
    // the counter and six stations (block-out only)
    const counter = new THREE.Mesh(new THREE.BoxGeometry(14, 1.1, 1.0), new THREE.MeshPhysicalMaterial({ color: '#b3122e', roughness: 0.4, clearcoat: 0.5 }));
    counter.position.set(0, 0.55, 7.2); counter.receiveShadow = true; stage.add(counter);
    const cols = ['#e63946', '#2a9df4', '#f4c430', '#3ddc84', '#b06cff', '#ff8a3d'];
    cols.forEach((col, i) => {
        const st = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.12, 24), new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.3, clearcoat: 0.6 }));
        st.position.set(-5 + i * 2, 0.8, 8.3); stage.add(st);
    });
    // the marquee over the target (block-out: a lit header board)
    const mq = new THREE.Mesh(new THREE.BoxGeometry(9, 0.9, 0.2), new THREE.MeshStandardMaterial({ color: '#1a1030', roughness: 0.6 }));
    mq.position.set(0, 6.4, 0.3); stage.add(mq);
    const mb = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffcf80').multiplyScalar(5) }), 90);
    for (let i = 0; i < 90; i++) { const u = i / 89; M.makeTranslation(-4.4 + u * 8.8, 6.4 + (i % 2 ? 0.38 : -0.38), 0.42); mb.setMatrixAt(i, M); }
    stage.add(mb);
    // hanging ducks under the awning, either side
    const hang = rubberDuckInstances(16, { variant: o.variant || 'A', lod: 1 });
    for (let i = 0; i < 16; i++) {
        const side = i < 8 ? -1 : 1, j = i % 8;
        D.position.set(side * (3.4 + (j % 4) * 0.75), 5.6 - Math.floor(j / 4) * 0.9 - (j % 2) * 0.2, 1.5 + (j % 3) * 0.6);
        D.rotation.set(0, side < 0 ? -0.5 : Math.PI + 0.5, 0); D.scale.setScalar(0.55); D.updateMatrix(); hang.setMatrixAt(i, D.matrix);
    }
    hang.castShadow = false;
    stage.add(hang);
    // strings for the hanging ducks, and the awning they hang from (block-out)
    const strings = [];
    for (let i = 0; i < 16; i++) { hang.getMatrixAt(i, M); const p = new THREE.Vector3().setFromMatrixPosition(M); strings.push(p.x, p.y + 0.5, p.z, p.x, 7.6, p.z); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(strings, 3));
    stage.add(new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: '#d8c8a0' })));
    const awning = new THREE.Mesh(new THREE.BoxGeometry(16, 0.12, 8), new THREE.MeshStandardMaterial({ color: '#2a0f1a', roughness: 0.8 }));
    awning.position.set(0, 7.65, 3); stage.add(awning);
    const stripes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.8, 0.9, 0.04), new THREE.MeshStandardMaterial({ roughness: 0.7 }), 20);
    for (let i = 0; i < 20; i++) { M.makeTranslation(-7.6 + i * 0.8, 7.2, 7.0); stripes.setMatrixAt(i, M); stripes.setColorAt(i, new THREE.Color(i % 2 ? '#f4efe0' : '#c8202e')); }
    stage.add(stripes);
    const ab = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffcf80').multiplyScalar(5) }), 60);
    for (let i = 0; i < 60; i++) { M.makeTranslation(-7.8 + i * 0.265, 6.72, 7.05); ab.setMatrixAt(i, M); }
    stage.add(ab);
    // the stall's back wall either side of the target, so the target isn't floating in sky
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(16, 7.6), new THREE.MeshStandardMaterial({ color: '#1b1430', roughness: 0.85 }));
    wall.position.set(0, 3.8, -0.15); wall.receiveShadow = true; stage.add(wall);
    camera.fov = 42; camera.updateProjectionMatrix();
    camera.up.set(0, 1, 0);
    if (o.view === 'bull') { camera.fov = 30; camera.updateProjectionMatrix(); camera.position.set(0.9, 3.5, 4.2); camera.lookAt(0, 3.2, 0); engine.dof.focus = 4.3; }
    else { camera.position.set(0, 2.1, 10.8); camera.lookAt(0, 3.4, 0); engine.dof.focus = 10.5; } engine.dof.aperture = 0.12; engine.dof.far = true;
    engine.placeShadow(new THREE.Vector3(0, 3, 0));
}

// ---------------------------------------------------------------- driver
let silMat = null;
function render() {
    if (currentLight === 'sil') {
        silMat = silMat || new THREE.MeshBasicMaterial({ color: 0x000000 });
        const bg = scene.background, env = scene.environment;
        scene.overrideMaterial = silMat; scene.background = new THREE.Color(0xffffff); scene.environment = null;
        if (flames) flames.mesh.visible = false;
        const tm = renderer.toneMapping; renderer.toneMapping = THREE.NoToneMapping;
        renderer.setRenderTarget(null); renderer.render(scene, camera);
        renderer.toneMapping = tm; scene.overrideMaterial = null; scene.background = bg; scene.environment = env;
        if (flames) flames.mesh.visible = true;
        return;
    }
    engine.render();
}

function resize() { engine.resize(innerWidth, innerHeight); }
addEventListener('resize', resize); resize();

const api = {
    ready: false,
    /** subject: duck | lineup | tin | target; variant A|B|C; view side|front|34|34r|back|top|head|far; light studio|blue|sil */
    show(o) {
        clear();
        camera.fov = 22; camera.updateProjectionMatrix();
        setLight(o.subject === 'target' ? 'blue' : (o.light || 'studio'));
        if (o.subject === 'target') { scene.remove(studioSet, blueSet); showTarget(o); }
        else if (o.subject === 'lineup') showLineup(o);
        else if (o.subject === 'tin') showTin(o);
        else showDuck(o);
        if (o.light === 'sil') currentLight = 'sil';
        engine.time.value = o.t ?? 1.3;
        render();
        if (o.light === 'sil') currentLight = null;
        return true;
    },
    variants: Object.fromEntries(Object.entries(VARIANTS).map(([k, v]) => [k, v.label])),
};
window.__ld = api;

// by hand: ?lookdev=duck&variant=A&view=34&light=blue (keeps rendering so the flames move)
const o = { subject: Q.get('lookdev') || 'duck', variant: Q.get('variant') || 'A', view: Q.get('view') || '34', light, finish: Q.get('finish') || undefined };
api.show(o);
document.body.classList.add('booted');
api.ready = true;
if (!Q.has('capture')) {
    const loop = (t) => { engine.time.value = t / 1000; if (o.subject === 'target') render(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
}
