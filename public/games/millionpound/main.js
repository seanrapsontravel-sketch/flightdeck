// Million Pound Oche ("The Hot Oche") — boot, the frame loop, game state.
// It plays the host's state (SYNC_STATE from viewer.html) or ?demo=1 (a simulated game).
//   ?demo=1         simulated game: &players=1..6 &speed=2 &seed=n &doubles=1 &long=1
//                   (window.__millionpoundDemo.force(kind), .queue([...]), .set(i, {...}); keys A B C D X M; click)
//   ?shot=name      hold one camera (master, lock, reveal, tower, crane, winner)
//   ?capture=1      no rAF: drive frames with window.__millionpound.step(n, dt)
//   ?dpr=1 ?quality=low   (engine)
import * as THREE from 'three';
import { Engine, withPreset } from '../lib3d/engine.js';
import { stateInbox } from '../lib3d/kit/queue.js';
import { createLoop } from '../lib3d/kit/loop.js';
import { Intro, holdDemo } from '../lib3d/kit/intro.js';
import { hitAt } from '../lib3d/kit/darts.js';
import { INTRO } from './intro.js';
import { BOARD_Y, K } from './common.js';
import { ocheRing } from './ring.js';
import { Studio } from './studio.js';
import { Towers } from './towers.js';
import { Darts } from './darts.js';
import { Director } from './director.js';
import { Hud } from './hud.js';
import { Game } from './game.js';
import { Fx } from './fx.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('stage');
// a television studio in the dark: no sky, deep navy haze, a violet kicker; the studio adds its own spots and washes
const PRESET = withPreset('night', {
    key: { az: 180, el: 55, color: '#c8d6ff', intensity: 0.35, extent: 14, map: 2048, far: 120, dist: 50 },
    fog: { away: '#050a2a', toward: '#120a3a', density: 0.012, height: 30, ramp: 14 },
    hemi: { sky: '#2a3a8a', ground: '#06060c', intensity: 0.22 },
    rim: { color: '#7a5cff', intensity: 0.9 },
    envFloor: [0.004, 0.005, 0.012],
    grade: { sat: 1.08, warm: -0.06, lift: 0.004 },
    bloom: 0.16, vignette: 0.5, ca: 0.4,
});
let engine;
try { engine = new Engine(canvas, PRESET); } catch (e) {
    console.error('[millionpound] WebGL unavailable', e);
    document.body.classList.add('no-webgl');
    throw e;
}
let director = null;
const fit = () => { engine.resize(canvas.clientWidth || innerWidth, canvas.clientHeight || innerHeight); if (director) { director.aspect = engine.camera.aspect; director.masterKey = null; } };
fit();
addEventListener('resize', fit);
engine.camera.near = 0.2; engine.camera.far = 400; engine.camera.updateProjectionMatrix();
engine.scene.fog = new THREE.FogExp2(0, 0.001); // switches the engine's haze chunk on

// image-based light: a dark studio with a few bright panels (the LED wall, the rig) so chrome and glass catch light
{
    const env = new THREE.Group();
    const panel = (w, h, x, y, z, c, k) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 3, 0); env.add(m); };
    panel(40, 10, 0, 8, -30, '#1e3cff', 0.5); panel(30, 6, -30, 10, 10, '#6a3cff', 0.6); panel(30, 6, 30, 10, 10, '#2f6bff', 0.6);
    panel(20, 2, 0, 30, 0, '#ffffff', 1.4); panel(10, 3, 0, 6, 30, '#c8d6ff', 0.8);
    engine.bakeEnvironment(env);
}

const studio = new Studio(engine);
const ring = ocheRing(); engine.scene.add(ring);
const towers = new Towers(engine.scene);
const darts = new Darts(engine.scene);
const fx = new Fx(engine.scene);
director = new Director(engine.camera, towers);
director.aspect = engine.camera.aspect;
const fixedShot = params.get('shot');
director.set(fixedShot || 'master', {}, true);
if (fixedShot) { const set = director.set.bind(director); director.set = (name, p, cut) => set(fixedShot, p, cut); }
const hud = new Hud();
const game = new Game({ engine, studio, ring, towers, darts, director, hud, fx });
try { engine.renderer.compile(engine.scene, engine.camera); } catch (e) { console.warn('[millionpound] precompile', e); }

// ---------------------------------------------------------------- state (host or demo)
const intro = new Intro(INTRO);
const inbox = stateInbox('millionpound', { onState: (state) => game.onState(state) });
if (params.has('demo')) {
    import('./demo.js').then(({ startDemo }) => {
        const demo = startDemo(inbox.apply, {
            players: Math.max(1, Math.min(6, Number(params.get('players')) || 4)), speed: Number(params.get('speed')) || 1,
            doubles: params.get('doubles') === '1', longNames: params.get('long') === '1',
            seed: params.has('seed') ? Number(params.get('seed')) : undefined,
        });
        window.__millionpoundDemo = demo;
        holdDemo(demo, intro);
        // a click on the board throws exactly there
        // demo-only simulation: A B C D a single at that answer (shift: a treble), X the inner bull, M a miss
        addEventListener('keydown', (e) => { const k = e.key.toUpperCase(); if (k.length === 1 && 'ABCDXM'.includes(k)) demo.key(k, e.shiftKey); });
        canvas.addEventListener('pointerdown', (e) => {
            const r = canvas.getBoundingClientRect(), ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
            const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, engine.camera);
            const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), new THREE.Vector3());
            if (!hit) return;
            const b = hitAt(hit.x / K, (hit.y - BOARD_Y) / K);
            if (b.bed === 'miss') return demo.throwAt({ miss: true });
            if (b.bed === 'bull' || b.bed === 'outer_bull') return demo.throwAt({ number: 'bull', multiplier: b.bed === 'bull' ? 2 : 1, sector: b.bed === 'bull' ? 'Bull' : '25' });
            const m = b.bed === 'treble' ? 3 : b.bed === 'double' ? 2 : 1;
            demo.throwAt({ number: b.number, multiplier: m, sector: (m === 3 ? 'T' : m === 2 ? 'D' : b.bed === 'single_inner' ? 's' : 'S') + b.number });
        });
    });
}

// ---------------------------------------------------------------- frame
function before() {
    if (inbox.list.length) document.body.classList.add('live');
    while (inbox.list.length) { const gd = inbox.list.shift(); intro.sync(gd); game.sync(gd); }
}
function simulate(dt) {
    engine.time.value += dt;
    game.update(dt);
    studio.update(dt);
    ring.userData.update(dt);
    towers.update(dt);
    darts.update(dt);
    fx.update(dt);
    director.update(dt);
}
function after() {
    engine.placeShadow(new THREE.Vector3(0, 2, 2));
    engine.dof.focus = director.dofFocus; engine.dof.aperture = director.dofAp;
    const P = engine.camera.projectionMatrix.elements[5], H = engine.renderer.domElement.height, W = engine.renderer.domElement.width;
    fx.setScale(H * P * 0.5, W, H);
}
const frames = createLoop({ engine, before, simulate, after });

window.__millionpound = {
    engine, studio, ring, towers, darts, fx, director, hud, intro, THREE,
    get game() { return game; },
    truth: () => game.truth(),
    shot: (name, p = {}) => director.set(name, p, true),
    step: frames.step,
};
