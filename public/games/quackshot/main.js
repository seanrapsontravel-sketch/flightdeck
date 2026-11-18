// 3D Quackshot ("Duck Row") — boot, the frame loop, game state.
// It plays the host's state (SYNC_STATE from viewer.html) or ?demo=1 (a simulated game). With neither it waits on
// the stall, lights low, until the first state arrives.
//   ?demo=1         simulated game: &players=2..6 &speed=2 &seed=n &doubles=1 &long=1
//                   (window.__quackshotDemo.force(kind), .set(i, {...}))
//   ?shot=name      hold one camera (master, bed, bull, fire, station, round, winner)
//   ?capture=1      no rAF: drive frames with window.__quackshot.step(n, dt)
//   ?dpr=1 ?quality=low   (engine)
import * as THREE from 'three';
import { Engine, withPreset } from '../lib3d/engine.js';
import { stateInbox } from '../lib3d/kit/queue.js';
import { createLoop } from '../lib3d/kit/loop.js';
import { Intro, holdDemo } from '../lib3d/kit/intro.js';
import { INTRO } from './intro.js';
import { Target } from './target.js';
import { Stall } from './stall.js';
import { Darts } from './darts.js';
import { Fair } from './fair.js';
import { Fx } from './fx.js';
import { Pool } from './pool.js';
import { Prizes } from './prize.js';
import { Director } from './director.js';
import { Hud } from './hud.js';
import { Game } from './game.js';
import { BOARD_Y } from './common.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('stage');
// fairground blue hour: a cool sky key from high behind the camera, warm practicals (the awning spot, the bulbs)
const PRESET = withPreset('dusk', {
    key: { az: 168, el: 48, color: '#9fb4ff', intensity: 0.9, extent: 10, map: 2048, far: 120, dist: 50 },
    fog: { away: '#0b1638', toward: '#2a2048', density: 0.004, height: 30, ramp: 30, az: 0, el: 4 },
    hemi: { sky: '#4a63a8', ground: '#2a1410', intensity: 0.35 },
    rim: null,
    envFloor: [0.02, 0.01, 0.012],
    grade: { sat: 1.06, warm: 0.04, lift: 0.002 },
    bloom: 0.1, vignette: 0.42, ca: 0.4,
});
let engine;
try { engine = new Engine(canvas, PRESET); } catch (e) {
    console.error('[quackshot] WebGL unavailable', e);
    document.body.classList.add('no-webgl');
    throw e;
}
let director = null;
const fit = () => { engine.resize(canvas.clientWidth || innerWidth, canvas.clientHeight || innerHeight); if (director) director.aspect = engine.camera.aspect; };
fit();
addEventListener('resize', fit);
engine.camera.near = 0.3; engine.camera.far = 220; engine.camera.updateProjectionMatrix();
engine.dof.far = true;

const fair = new Fair(engine);
const target = new Target(engine);
const stall = new Stall(engine);
const darts = new Darts(engine.scene);
const fx = new Fx(engine.scene);
const pool = new Pool(engine);
const prizes = new Prizes(engine.scene, fx);
target.fx = fx; darts.pool = pool;
{
    // image-based light: the blue-hour sky and warm bulb strings, so the gloss catches the stall's lights
    const env = new THREE.Group();
    const c = document.createElement('canvas'); c.width = 4; c.height = 256;
    const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
    [[0, '#071033'], [0.42, '#1b2d6e'], [0.5, '#3a2a40'], [0.56, '#180a0c'], [1, '#080406']].forEach(([t, col]) => gr.addColorStop(t, col));
    g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    env.add(new THREE.Mesh(new THREE.SphereGeometry(80, 32, 16), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide })));
    const bm = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc477').multiplyScalar(30) });
    for (let i = 0; i < 48; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), bm); const a = (i / 48) * Math.PI * 2; b.position.set(Math.cos(a) * 8, 7 + Math.sin(i * 1.7) * 0.8, Math.sin(a) * 8); env.add(b); }
    // the valance row in front, and the fair's warm glow low behind
    for (let i = 0; i < 19; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), bm); b.position.set(-7.8 + i * 0.86, 8.8, 7); env.add(b); }
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(80, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff9a50').multiplyScalar(0.6), side: THREE.DoubleSide })); glow.position.set(0, 3, -40); env.add(glow);
    engine.bakeEnvironment(env);
}

const ctx = { stall, target };
director = new Director(engine.camera, ctx);
director.aspect = engine.camera.aspect;
const fixedShot = params.get('shot');
director.set(fixedShot || 'master', {}, true);
const feel = { flash: 0 };
const hud = new Hud();
const game = new Game({ engine, target, stall, fair, fx, pool, prizes, darts, director, hud, feel, fireworksAt: new THREE.Vector3(-33, 17, -48) });
hud.onTitle = (main, kind) => game.note('title', { main, kind });
if (fixedShot) { const set = director.set.bind(director); director.set = (name, p, cut) => set(fixedShot, p, cut); }

// ---------------------------------------------------------------- state (host or demo)
// "How to play": up while the game is fresh, gone the moment the first dart lands (docs/plans/GAME-INTROS-3D.md)
const intro = new Intro(INTRO);
const inbox = stateInbox('quackshot', { onState: (state) => game.onState(state) });
if (params.has('demo')) {
    import('./demo.js').then(({ startDemo }) => {
        window.__quackshotDemo = startDemo(inbox.apply, {
            players: Math.max(2, Math.min(6, Number(params.get('players')) || 4)), speed: Number(params.get('speed')) || 1,
            doubles: params.get('doubles') === '1', longNames: params.get('long') === '1',
            seed: params.has('seed') ? Number(params.get('seed')) : undefined,
        });
        holdDemo(window.__quackshotDemo, intro);
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
    target.update(dt);
    stall.update(dt);
    darts.update(dt);
    fair.update(dt);
    pool.update(dt);
    prizes.update(dt);
    fx.update(dt);
    director.update(dt);
}
function after(ms) {
    engine.placeShadow(new THREE.Vector3(0, BOARD_Y - 1, 3));
    target.lod(engine.camera);
    engine.dof.focus = director.dofFocus; engine.dof.aperture = director.dofAp;
    feel.flash = Math.max(0, feel.flash - Math.min(0.5, ms / 1000) * 3); engine.flash = feel.flash;
    const P = engine.camera.projectionMatrix.elements[5], H = engine.renderer.domElement.height, W = engine.renderer.domElement.width;
    fx.setScale(H * P * 0.5, W, H);
    const bs = H * P * 0.5;
    for (const b of [fair.lights, stall.beacons, target.halo]) b.mat.uniforms.uScale.value = bs;
}
const frames = createLoop({ engine, before, simulate, after });

window.__quackshot = {
    engine, target, stall, fair, fx, pool, prizes, darts, director, hud, intro, THREE,
    get game() { return game; },
    /** what's on screen now for the nothing-lies check */
    truth: () => game.truth(),
    shot: (name, p = {}) => director.set(name, p, true),
    step: frames.step,
};
