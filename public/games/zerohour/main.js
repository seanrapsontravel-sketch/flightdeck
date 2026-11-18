// Zero Hour ("Salle Zéro") — boot, the frame loop, game state. It plays the host's state (SYNC_STATE from
// viewer.html) or ?demo=1 (a simulated game on the same rules module the server uses).
//   ?demo=1         simulated game: &players=2..6 &speed=2 &seed=n &doubles=1 &long=1 &skip=n (visits played at once)
//                   window.__zerohourDemo.force(kind) / .queue([...]) / .skip(n) / .toSpin()
//   ?fast=1         animations at double speed (testing; the server's windows are its own: ZEROHOUR_PACE=fast)
//   ?shot=name      hold one camera (master, board, visit, table, wheel, ball, cell)
//   ?capture=1      no rAF: drive frames with window.__zerohour.step(n, dt)
//   ?dpr=1 ?quality=low   (engine)
import * as THREE from 'three';
import { Engine, withPreset } from '../lib3d/engine.js';
import { stateInbox } from '../lib3d/kit/queue.js';
import { createLoop } from '../lib3d/kit/loop.js';
import { Intro, holdDemo } from '../lib3d/kit/intro.js';
import { INTRO } from './intro.js';
import { Table } from './table.js';
import { Chips } from './chips.js';
import { Wheel } from './wheel.js';
import { Board } from './board.js';
import { Room } from './room.js';
import { Director } from './director.js';
import { Hud } from './hud.js';
import { Game } from './game.js';
import { V } from './common.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('stage');
// a dark salon at midnight: the key is the lamp over the table (warm, high, nearly straight down, it casts the chips'
// contact shadows in a small sharp shadow box); a faint warm fill; a cool kicker from the windows behind
const PRESET = withPreset('night', {
    key: { az: 200, el: 72, color: '#ffd9a6', intensity: 3.2, extent: 1.9, map: 4096, far: 30, dist: 12 },
    fog: { away: '#120a0a', toward: '#2a160e', density: 0.012, height: 6, ramp: 3 },
    hemi: { sky: '#6a4a3a', ground: '#140c08', intensity: 0.32 },
    rim: { color: '#7d8ec8', intensity: 0.35 },
    envFloor: [0.02, 0.012, 0.008],
    grade: { sat: 1.04, warm: 0.12, lift: 0.004 },
    bloom: 0.09, vignette: 0.5, ca: 0.25,
});
let engine;
try { engine = new Engine(canvas, PRESET); } catch (e) {
    console.error('[zerohour] WebGL unavailable', e);
    document.body.classList.add('no-webgl');
    throw e;
}
let director = null;
const fit = () => { engine.resize(canvas.clientWidth || innerWidth, canvas.clientHeight || innerHeight); if (director) director.aspect = engine.camera.aspect; };
fit();
addEventListener('resize', fit);
engine.camera.near = 0.05; engine.camera.far = 60; engine.camera.updateProjectionMatrix();
engine.scene.fog = new THREE.FogExp2(0, 0.001);
engine.scene.background = new THREE.Color('#0a0606');

const room = new Room(engine);
const table = new Table(engine);
const chips = new Chips(engine.scene);
const wheel = new Wheel(engine.scene);
const board = new Board(engine.scene);
board.makeInset(engine);
// render layer 2 = what the porthole's board camera draws (the board, its darts, the wall) — and every light, so both
// views light alike. Everything else (the chips above all) stays out of that second render.
for (const L of [engine.sun, engine.hemi, engine.rim, room.wheelSpot]) if (L) L.layers.enable(2);
room.root.traverse((o) => o.layers.enable(2));
board.root.traverse((o) => o.layers.enable(2));
director = new Director(engine.camera, { wheel, board });
director.aspect = engine.camera.aspect;
const fixedShot = params.get('shot');
director.set(fixedShot || 'master', {}, true);
if (fixedShot) { const set = director.set.bind(director); director.set = (name, p, cut) => set(fixedShot, p, cut); }
const hud = new Hud();
const game = new Game({ engine, table, chips, wheel, board, room, director, hud, fast: params.get('fast') === '1' });
hud.onTitle = (main, kind) => game.note('title', { main, kind });

// image-based light: warm panels (the lamp, the sconces) so lacquer, brass and chips have something to reflect
{
    const extra = new THREE.Group();
    const panel = (w, h, color, k, pos, rx = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide })); m.position.copy(pos); m.rotation.x = rx; extra.add(m); };
    panel(6, 1.2, '#ffd8a0', 3.2, V(0, 6, 0), Math.PI / 2);
    panel(2, 1, '#ffb070', 1.4, V(-4, 2, -6));
    panel(2, 1, '#ffb070', 1.4, V(4, 2, -6));
    panel(8, 3, '#3a4a70', 0.25, V(0, 2, 8));
    engine.bakeEnvironment(extra);
}
// compile every material now, not on first sight mid-game
try { engine.renderer.compile(engine.scene, engine.camera); } catch (e) { console.warn('[zerohour] precompile', e); }

// ---------------------------------------------------------------- state (host or demo)
const intro = new Intro(INTRO);
const inbox = stateInbox('zerohour', { onState: (state) => game.onState(state) });
if (params.has('demo')) {
    import('./demo.js').then(({ startDemo }) => {
        window.__zerohourDemo = startDemo(inbox.apply, {
            players: Math.max(2, Math.min(6, Number(params.get('players')) || 4)), speed: Number(params.get('speed')) || 1,
            doubles: params.get('doubles') === '1', longNames: params.get('long') === '1',
            seed: params.has('seed') ? Number(params.get('seed')) : undefined, fast: params.get('fast') === '1',
        });
        const skip = Number(params.get('skip')) || 0;
        if (skip) window.__zerohourDemo.skip(skip); else holdDemo(window.__zerohourDemo, intro);
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
    table.update(dt);
    board.update(dt);
    room.update(dt);
    director.update(dt);
    board.placeInset(dt);
}
function after() {
    engine.placeShadow(V(0, 0, 0));
    engine.dof.focus = director.dofFocus; engine.dof.aperture = director.dofAp;
}
const frames = createLoop({ engine, before, simulate, after });

window.__zerohour = {
    engine, table, chips, wheel, board, room, director, hud, intro, THREE,
    get game() { return game; },
    truth: () => game.truth(),
    shot: (name, p = {}) => director.set(name, p, true),
    step: frames.step,
};
