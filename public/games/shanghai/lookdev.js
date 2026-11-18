// Shanghai Milestone 0 look-dev: the pagoda (three eave/profile variants), the moon-gate board with its live
// wedge, one sky lantern, and a rough still of the whole courtyard at round 1 and round 8. Lights: neutral studio,
// round-1 sunset, round-8 night, and solid silhouette. Driven by docs/plans/tools/shanghai-lookdev.cjs through
// window.__ld.show({...}); by hand: shanghai-3d.html?lookdev=pagoda&variant=B&view=34&light=sunset
import * as THREE from 'three';
import { Engine, withPreset } from '../lib3d/engine.js';
import { Flames } from '../limbo/fire.js';
import { BOARD_Y, PAL, PLAYER_COLOURS, canvasTex, rng, roundT } from './common.js';
import { VARIANTS, pagoda } from './pagoda.js';
import { moonGate } from './gate.js';
import { LanternFlock, skyLantern } from './lanterns.js';
import { Sky } from './sky.js';

const Q = new URLSearchParams(location.search);
const canvas = document.getElementById('stage');

const BASE = withPreset('dusk', {
    key: { az: 232, el: 8, color: '#ffb06a', intensity: 3, extent: 36, map: 4096, far: 300, dist: 140 },
    fog: { away: '#7a6a8c', toward: '#ff9a55', density: 0.0012, height: 40, ramp: 60, az: 232, el: 2 },
    hemi: { sky: '#6a7ab8', ground: '#2a1a14', intensity: 0.35 },
    rim: { color: '#ff9a6a', intensity: 0.4 },
    envFloor: [0.03, 0.02, 0.018],
    grade: { sat: 1.06, warm: 0.04, lift: 0.002 },
    bloom: 0.08, vignette: 0.38, ca: 0.35,
});
const engine = new Engine(canvas, BASE);
const { scene, camera, renderer } = engine;
camera.near = 0.1; camera.far = 4000;
const sky = new Sky(engine);

// ---------------------------------------------------------------- sets
function gradientTexture(stops, h = 512) {
    return canvasTex(4, h, (g, w, hh) => { const gr = g.createLinearGradient(0, 0, 0, hh); for (const [t, c] of stops) gr.addColorStop(t, c); g.fillStyle = gr; g.fillRect(0, 0, w, hh); });
}
const studioSet = new THREE.Group();
{
    const floor = new THREE.Mesh(new THREE.CircleGeometry(400, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#8a8c90', roughness: 0.95 }));
    floor.receiveShadow = true; studioSet.add(floor);
}
const studioEnv = () => {
    const g = new THREE.Group();
    const box = (w, h, pos, k) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(k), side: THREE.DoubleSide })); m.position.copy(pos); m.lookAt(0, 20, 0); g.add(m); };
    box(60, 40, new THREE.Vector3(-90, 90, 80), 6); box(40, 40, new THREE.Vector3(90, 40, 60), 2.2); box(15, 80, new THREE.Vector3(30, 50, -100), 3.5);
    g.add(new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), new THREE.MeshBasicMaterial({ map: gradientTexture([[0, '#6f7378'], [0.55, '#55585c'], [1, '#2c2d2f']]), side: THREE.BackSide })));
    return g;
};

// the courtyard paving (stone flags), shared by the sunset/night sets and the concept still
const paving = (() => {
    const t = canvasTex(512, 512, (g, w) => {
        g.fillStyle = '#5d5852'; g.fillRect(0, 0, w, w);
        const r = rng(7);
        for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) {
            const o = (y % 2) * 64, l = 100 + r() * 12;
            g.fillStyle = `rgb(${l},${l - 4},${l - 10})`; g.fillRect(x * 128 + o + 3, y * 64 + 3, 122, 58);
        }
        for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.08})`; g.fillRect(r() * w, r() * w, 2, 2); }
    }, { repeat: true });
    t.repeat.set(60, 60);
    const m = new THREE.Mesh(new THREE.CircleGeometry(300, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: t, roughness: 0.82, envMapIntensity: 0.6 }));
    m.receiveShadow = true;
    return m;
})();

// ---------------------------------------------------------------- framing from projected points
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const tmpCam = new THREE.PerspectiveCamera();
function boxPoints(b) { const P = []; for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) P.push(V3(x, y, z)); return P; }
/** place the camera along `dir` from the points' centre at the nearest distance where they fit `win` (NDC) */
function fit(points, dir, fov, win = { x0: -0.86, x1: 0.86, y0: -0.86, y1: 0.86 }, up = V3(0, 1, 0)) {
    const cam = tmpCam; cam.fov = fov; cam.aspect = camera.aspect; cam.near = 0.05; cam.far = 4000; cam.up.copy(up); cam.updateProjectionMatrix();
    const n = dir.clone().normalize(), look = points.reduce((a, p) => a.add(p), V3()).multiplyScalar(1 / points.length), q = V3();
    const span = (d) => { cam.position.copy(look).addScaledVector(n, d); cam.lookAt(look); cam.updateMatrixWorld(); let x0 = 9, x1 = -9, y0 = 9, y1 = -9; for (const p of points) { q.copy(p).project(cam); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); } return { x0, x1, y0, y1 }; };
    let d = 30;
    for (let it = 0; it < 6; it++) {
        let lo = 0.5, hi = 2000;
        for (let k = 0; k < 32; k++) { const m = (lo + hi) / 2, s = span(m); if (s.x1 - s.x0 <= win.x1 - win.x0 && s.y1 - s.y0 <= win.y1 - win.y0) hi = m; else lo = m; }
        d = hi;
        const s = span(d), t = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
        const ey = (s.y0 + s.y1) / 2 - (win.y0 + win.y1) / 2, ex = (s.x0 + s.x1) / 2 - (win.x0 + win.x1) / 2;
        const upv = up.clone().sub(n.clone().multiplyScalar(n.dot(up))).normalize(), right = V3().crossVectors(upv, n).normalize();
        look.addScaledVector(upv, ey * t * d).addScaledVector(right, ex * t * d * camera.aspect);
    }
    camera.fov = fov; camera.up.copy(up); camera.updateProjectionMatrix();
    camera.position.copy(look).addScaledVector(n, d); camera.lookAt(look);
    return d;
}
const dirOf = (yawDeg, elDeg) => { const a = THREE.MathUtils.degToRad(yawDeg), e = THREE.MathUtils.degToRad(elDeg); return V3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)); };

// ---------------------------------------------------------------- light modes
let mode = null;
function setLight(m, t = 0) {
    mode = m;
    scene.remove(studioSet, paving);
    sky.mesh.visible = m !== 'studio' && m !== 'sil';
    if (m === 'studio') {
        scene.add(studioSet);
        scene.background = new THREE.Color('#77797d');
        engine.sunDir.copy(dirOf(-40, 38)); engine.sun.color.set('#fff6ec'); engine.sun.intensity = 2.8;
        engine.hemi.color.set('#e8eef6'); engine.hemi.groundColor.set('#4a4744'); engine.hemi.intensity = 0.35;
        if (engine.rim) { engine.rim.color.set('#ffffff'); engine.rim.intensity = 0.8; engine.rim.position.set(60, 60, -80); }
        scene.fog = null;
        engine.bakeEnvironment(studioEnv());
        engine.grade.uWarm.value = 0; engine.bloom = 0.03; engine.vignette = 0.2; engine.ca = 0;
    } else if (m === 'sil') {
        scene.background = new THREE.Color('#ffffff');
    } else {
        scene.add(paving);
        scene.background = null;
        scene.fog = new THREE.FogExp2(0, 0.001);
        sky.set(t);
        sky.bake(null);
        engine.grade.uWarm.value = 0.04; engine.bloom = 0.08 + 0.05 * t; engine.vignette = 0.38; engine.ca = 0.35;
    }
}

// ---------------------------------------------------------------- subjects
const stage = new THREE.Group(); scene.add(stage);
function clear() { while (stage.children.length) stage.remove(stage.children[0]); if (flames) { scene.remove(flames.mesh); flames = null; } }
const built = {};
const getPagoda = (v) => built['p' + v] || (built['p' + v] = pagoda({ variant: v }));
let flames = null;

function lightTiers(P, lit, spire = false) {
    const T = P.userData.tiers.length;
    for (let i = 0; i < T; i++) P.userData.setLit(i, i < lit ? 1 : 0);
}

function showPagoda(o) {
    const P = getPagoda(o.variant || 'A');
    P.rotation.set(0, o.view === 'corner' ? Math.PI / 8 : o.view === 'back' ? Math.PI : 0, 0);
    P.position.set(0, 0, 0);
    stage.add(P); P.updateMatrixWorld(true);
    lightTiers(P, o.lit ?? (mode === 'night' ? 3 : 0));
    const b = new THREE.Box3().setFromObject(P, true);
    // the plinth is wide; frame the tower (from the first roof up) so the variants compare at the same height
    const pts = boxPoints(b);
    engine.dof.aperture = 0;
    if (o.view === 'top') {
        fit(pts, V3(0, 1, 0.0001), 30, undefined, V3(0, 0, -1));
    } else if (o.view === 'low') {
        // the bg photo's view: from the courtyard, close to the tower, looking steeply up (portrait framing)
        // (the photo is a long lens from well back: little convergence, tiers stacked evenly)
        camera.fov = 25; camera.up.set(0, 1, 0); camera.updateProjectionMatrix();
        camera.position.set(0, 1.6, (o.dist ?? 62)); camera.lookAt(0, P.userData.height * 0.66, 0);
    } else if (o.view === 'eave') {
        // 1:1 close-up of one corner of tier 4: hook, bell, tile ends, brackets
        const tier = o.tier ?? 4, k = 0, tip = P.userData.hookTips[tier * 8 + k].clone().applyMatrix4(P.matrixWorld);
        const t = P.userData.tiers[tier];
        const ang = Math.PI / 8, out = V3(Math.sin(ang), 0, Math.cos(ang));
        const corner = V3(out.x * (t.re + 0.6), t.yEave, out.z * (t.re + 0.6)).applyMatrix4(P.matrixWorld);
        const look = corner.clone().lerp(tip, 0.35).add(V3(0, -0.5, 0));
        camera.fov = 30; camera.up.set(0, 1, 0); camera.updateProjectionMatrix();
        const side = V3(out.z, 0, -out.x);
        camera.position.copy(look).addScaledVector(out, 5.2).addScaledVector(side, 3.4).add(V3(0, -1.6, 0));
        camera.lookAt(look);
        engine.dof.focus = camera.position.distanceTo(look); engine.dof.aperture = mode === 'studio' ? 0 : 0.06;
    } else if (o.view === 'far') {
        // master distance: ~110 m away with a 36° lens — how big the tower reads behind the gate
        camera.fov = 36; camera.up.set(0, 1, 0); camera.updateProjectionMatrix();
        camera.position.set(0, 2.4, 110); camera.lookAt(0, 16, 0);
    } else {
        const dir = o.view === '34' ? dirOf(-35, 16) : dirOf(0, 5);
        fit(pts, dir, 30);
    }
    engine.placeShadow(V3(0, 18, 0));
}

function showLineup(o) {
    const keys = Object.keys(VARIANTS);
    keys.forEach((k, i) => { const P = getPagoda(k); P.rotation.set(0, o.view === 'corner' ? Math.PI / 8 : 0, 0); P.position.set((i - 1) * 22, 0, 0); stage.add(P); lightTiers(P, o.lit ?? (mode === 'night' ? 3 : 0)); });
    stage.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(stage, true);
    fit(boxPoints(b), dirOf(0, 4), 30, { x0: -0.92, x1: 0.92, y0: -0.9, y1: 0.86 });
    engine.dof.aperture = 0;
    engine.placeShadow(V3(0, 18, 0));
}

let gateObj = null;
function showGate(o) {
    gateObj = gateObj || moonGate({ target: 20 });
    gateObj.userData.setTarget(o.target ?? 20);
    gateObj.userData.setGlow(o.glow ?? 1.6);
    stage.add(gateObj); gateObj.updateMatrixWorld(true);
    engine.dof.aperture = 0;
    const c = V3(0, BOARD_Y, 0);
    if (o.view === 'wedge') {
        camera.fov = 30; camera.up.set(0, 1, 0); camera.updateProjectionMatrix();
        camera.position.set(1.2, BOARD_Y + 1.3, 4.6); camera.lookAt(0, BOARD_Y + 1.15, 0);
        engine.dof.focus = 4.8; engine.dof.aperture = mode === 'studio' ? 0 : 0.05;
    } else if (o.view === 'gong') {
        camera.fov = 28; camera.up.set(0, 1, 0); camera.updateProjectionMatrix();
        camera.position.set(-1.6, BOARD_Y + 3.6, 5.6); camera.lookAt(0, BOARD_Y + 4.5, 0.5);
    } else {
        const pts = [V3(-3.4, 0.2, 0.4), V3(3.4, 0.2, 0.4), V3(-3.4, 10.4, 0.4), V3(3.4, 10.4, 0.4)];
        fit(pts, o.view === '34' ? dirOf(-32, 6) : dirOf(0, 4), 32);
    }
    engine.placeShadow(c);
}

function showLantern(o) {
    const g = new THREE.Group(); stage.add(g);
    const L = skyLantern(o.colour || PLAYER_COLOURS[0]); L.position.set(0, 20, 0); g.add(L);
    if (o.view === 'flock') {
        const r = rng(3), F = new LanternFlock(40);
        F.face(new THREE.Quaternion());
        for (let i = 0; i < 40; i++) F.place(i, V3((r() - 0.5) * 14, 18 + r() * 12, -6 - r() * 20), PLAYER_COLOURS[i % 6], 0.9 + r() * 0.3, (r() - 0.5) * 0.2);
        g.add(F.group);
        camera.fov = 40; camera.up.set(0, 1, 0); camera.updateProjectionMatrix();
        camera.position.set(0, 19, 5); camera.lookAt(0, 22, -10);
        F.face(camera.quaternion);
        for (let i = 0; i < 40; i++) F.place(i, V3((r() - 0.5) * 16, 17 + r() * 14, -4 - r() * 26), PLAYER_COLOURS[i % 6], 0.9 + r() * 0.3, (r() - 0.5) * 0.2);
    } else if (o.view === 'colours') {
        // the six player colours side by side (each player's points are their colour)
        L.visible = false;
        PLAYER_COLOURS.forEach((c, i) => { const l = skyLantern(c, { halo: true }); l.position.set((i - 2.5) * 1.05, 20, 0); g.add(l); });
        camera.fov = 30; camera.up.set(0, 1, 0); camera.updateProjectionMatrix();
        camera.position.set(0, 19.6, 9.5); camera.lookAt(0, 20.45, 0);
    } else {
        // from a little below, so the flame shows through the open foot
        camera.fov = 26; camera.up.set(0, 1, 0); camera.updateProjectionMatrix();
        camera.position.set(1.1, 19.1, 3.4); camera.lookAt(0, 20.42, 0);
    }
    engine.dof.aperture = 0;
}

// ---------------------------------------------------------------- the rough courtyard concept
function scrollTex(name, score, colour) {
    return canvasTex(256, 512, (g, w, h) => {
        g.fillStyle = '#efe3c4'; g.fillRect(0, 0, w, h);
        g.fillStyle = colour; g.fillRect(0, 0, w, 26); g.fillRect(0, h - 26, w, 26);
        g.fillStyle = '#2a1a10'; g.font = '700 46px "Avenir Next Condensed", "DIN Condensed", sans-serif'; g.textAlign = 'center';
        g.fillText(name, w / 2, 86);
        g.font = '900 150px "Avenir Next Condensed", "DIN Condensed", Impact, sans-serif'; g.fillStyle = '#8a1a14'; g.fillText(String(score), w / 2, 270);
        g.strokeStyle = 'rgba(40,20,10,0.4)'; g.lineWidth = 2;
        for (let r = 0; r < 8; r++) { const y = 320 + r * 22; g.strokeRect(30, y, w - 60, 20); }
    });
}
function showConcept(o) {
    const round = o.round ?? 1, t = roundT(round);
    const g = new THREE.Group(); stage.add(g);
    const gate = gateObj || (gateObj = moonGate({ target: round }));
    gate.userData.setTarget(round); gate.userData.setGlow(1.6 + t * 0.8); g.add(gate);
    // the pagoda: behind the courtyard wall, offset to the right so it rises clear of the board
    // it stands on a stone terrace (a hill behind the temple) so its lowest tier — round 1 — clears the wall
    const TY = o.ty ?? 7;
    const P = getPagoda(o.variant || 'A'); P.rotation.set(0, -0.12, 0); P.position.set(o.px ?? 26, TY, o.pz ?? -62); g.add(P);
    const terrace = new THREE.Mesh(new THREE.CylinderGeometry(16, 19, TY, 8, 1, false, Math.PI / 8), new THREE.MeshStandardMaterial({ color: '#6e675e', roughness: 0.95 }));
    terrace.position.set(P.position.x, TY / 2, P.position.z); terrace.receiveShadow = terrace.castShadow = true; g.add(terrace);
    lightTiers(P, round);
    // the steps and six player stations along them
    const stone = new THREE.MeshStandardMaterial({ color: '#7b766e', roughness: 0.9 });
    for (let s = 0; s < 3; s++) { const st = new THREE.Mesh(new THREE.BoxGeometry(30, 0.18, 1.1), stone); st.position.set(0, 0.09 + s * 0.18, 7.6 - s * 1.1 + 2.2); st.receiveShadow = st.castShadow = true; g.add(st); }
    const names = ['Sean', 'Priya', 'Tom', 'Aisha', 'Christopher', 'Mei'];
    const scores = [round * 7, round * 5, round * 9, round * 3, round * 6, round * 4];
    const active = 2;
    for (let i = 0; i < 6; i++) {
        // three either side of the board: nothing stands between the lens and the gate
        const x = i < 3 ? -(5.6 + (2 - i) * 3.2) : 5.6 + (i - 3) * 3.2, z = 8.6, col = PLAYER_COLOURS[i];
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.4, 10), new THREE.MeshPhysicalMaterial({ color: PAL.lacquer, roughness: 0.4, clearcoat: 0.6 }));
        pole.position.set(x - 0.9, 1.7 + 0.54, z); pole.castShadow = true; g.add(pole);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.07, 0.07), pole.material); arm.position.set(x - 0.45, 3.35 + 0.54, z); g.add(arm);
        const lamp = skyLantern(col, { glow: 1.2 + (i === active ? 1.4 : 0), halo: true }); lamp.scale.setScalar(0.55); lamp.position.set(x, 2.9 + 0.54, z); g.add(lamp);
        const scroll = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.8), new THREE.MeshStandardMaterial({ map: scrollTex(names[i], scores[i], col), roughness: 0.9, side: THREE.DoubleSide, emissive: '#ffffff', emissiveMap: null, emissiveIntensity: 0 }));
        scroll.material.emissiveMap = scroll.material.map; scroll.material.emissiveIntensity = 0.08 + t * 0.12 + (i === active ? 0.25 : 0);
        scroll.position.set(x + 0.15, 1.6 + 0.54, z + 0.05); g.add(scroll);
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 8).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#3a2416' })); rod.position.set(x + 0.15, 2.52 + 0.54, z + 0.05); g.add(rod);
        if (i === active) { const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.03, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(1.6) })); pad.position.set(x, 0.56, z + 0.4); g.add(pad); }
    }
    // braziers either side of the gate
    flames = new Flames(scene, engine.time, 40);
    for (const s of [-1, 1]) {
        const b = new THREE.Group(); b.position.set(s * 4.2, 0, 1.6); g.add(b);
        const bowl = new THREE.Mesh(new THREE.LatheGeometry([[0.05, 0], [0.5, 0.1], [0.62, 0.38], [0.58, 0.4]].map(([x, y]) => new THREE.Vector2(x, y)), 24), new THREE.MeshStandardMaterial({ color: '#6a4a26', metalness: 1, roughness: 0.4, side: THREE.DoubleSide }));
        bowl.position.y = 1.0; b.add(bowl);
        for (let l = 0; l < 3; l++) { const a = (l / 3) * Math.PI * 2; const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.05, 6), bowl.material); leg.position.set(Math.cos(a) * 0.32, 0.5, Math.sin(a) * 0.32); leg.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25); b.add(leg); }
        for (let f = 0; f < 5; f++) flames.add({ p: V3(s * 4.2 + (f - 2) * 0.12, 1.3, 1.6 + ((f % 2) - 0.5) * 0.15), w: 0.45, h: 1.1, seed: f * 0.21 + (s > 0 ? 0.5 : 0), speed: 0.4 + f * 0.1, intensity: 1 });
    }
    flames.flush();
    // lanterns rising from the live wedge toward the active player's string, plus a few already up
    const r = rng(11), F = new LanternFlock(60);
    g.add(F.group);
    // the foreground eave framing the top of the frame (the bg photo's own foreground roof)
    camera.fov = 38; camera.up.set(0, 1, 0); camera.updateProjectionMatrix();
    camera.position.set(o.cx ?? -1.0, o.cy ?? 4.4, o.cz ?? 21); camera.lookAt(o.lx ?? 1.6, o.ly ?? 6.8, 0);
    F.face(camera.quaternion);
    for (let i = 0; i < 60; i++) {
        const k = i / 60, rise = i < 18 ? 0.2 + k * 2.5 : 1;
        const p = i < 18 ? V3(0.2 + (r() - 0.5) * 1.4 + k * 6, BOARD_Y + 1.5 + rise * 3 + r() * 1.5, 0.6 + k * 4) : V3((r() - 0.5) * 60, 14 + r() * 26, -10 - r() * 50);
        F.place(i, p, PLAYER_COLOURS[i < 18 ? active : i % 6], i < 18 ? 0.55 : 0.8, (r() - 0.5) * 0.25);
    }
    sky.bake(null);
    engine.dof.aperture = 0.05; engine.dof.focus = 18; engine.dof.far = true;
    engine.placeShadow(V3(0, 3, 2));
}

// ---------------------------------------------------------------- driver
let silMat = null;
function render() {
    if (mode === 'sil') {
        silMat = silMat || new THREE.MeshBasicMaterial({ color: 0x000000 });
        const env = scene.environment;
        scene.overrideMaterial = silMat; scene.environment = null;
        const tm = renderer.toneMapping; renderer.toneMapping = THREE.NoToneMapping;
        renderer.setRenderTarget(null); renderer.render(scene, camera);
        renderer.toneMapping = tm; scene.overrideMaterial = null; scene.environment = env;
        return;
    }
    engine.render();
}
function resize() { engine.resize(innerWidth, innerHeight); }
addEventListener('resize', resize); resize();

const LIGHT_T = { sunset: 0, night: 1 };
const api = {
    ready: false,
    /** subject: pagoda | lineup | gate | lantern | concept; light: studio | sunset | night | sil */
    show(o) {
        clear();
        const light = o.subject === 'concept' ? 'concept' : (o.light || 'studio');
        if (light === 'concept') setLight('sunset', roundT(o.round ?? 1));
        else setLight(light, o.t ?? LIGHT_T[light] ?? 0);
        if (light === 'concept') mode = 'concept';
        engine.dof.far = false;
        ({ pagoda: showPagoda, lineup: showLineup, gate: showGate, lantern: showLantern, concept: showConcept }[o.subject] || showPagoda)(o);
        engine.time.value = o.time ?? 2.0;
        render();
        return true;
    },
    variants: Object.fromEntries(Object.entries(VARIANTS).map(([k, v]) => [k, v.label])),
    box(v) { const P = getPagoda(v); P.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(P, true); return [b.min.toArray().map((x) => +x.toFixed(1)), b.max.toArray().map((x) => +x.toFixed(1)), P.userData.height.toFixed(1)]; },
    stats() { const r = renderer.info.render; return { calls: r.calls, triangles: r.triangles, cam: camera.position.toArray().map((x) => +x.toFixed(1)), fov: camera.fov, aspect: +camera.aspect.toFixed(2) }; },
};
window.__ld = api;

const o = { subject: Q.get('lookdev') || 'pagoda', variant: Q.get('variant') || 'A', view: Q.get('view') || 'front', light: Q.get('light') || 'sunset', round: Number(Q.get('round') || 1), target: Number(Q.get('target') || 20) };
api.show(o);
document.body.classList.add('booted');
api.ready = true;
if (!Q.has('capture')) {
    const loop = (t) => { engine.time.value = t / 1000; render(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
}
