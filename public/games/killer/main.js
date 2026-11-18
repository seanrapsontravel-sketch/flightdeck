// 3D Killer ("The Ledger") — boot, the frame loop, game state.
// It plays the host's state (SYNC_STATE from viewer.html) or ?demo=1 (a simulated game). With neither it waits on
// the board, lights low, until the first state arrives.
//   ?demo=1         simulated game: &players=2..6 &speed=2 &seed=n &doubles=1 &video=1 &long=1
//                   (window.__killerDemo.force(kind), .set(i, {...}))
//   ?shot=name      hold one camera (master, round, agent, wedge, ...)
//   ?capture=1      no rAF: drive frames with window.__killer.step(n, dt) (docs/plans/tools/dcap.cjs)
//   ?dpr=1 ?quality=low   (engine)
import * as THREE from 'three';
import { Engine, withPreset } from '../lib3d/engine.js';
import { Reflection } from '../lib3d/reflection.js';
import { World } from '../lib3d/physics.js';
import { stateInbox } from '../lib3d/kit/queue.js';
import { createLoop } from '../lib3d/kit/loop.js';
import { Intro, holdDemo } from '../lib3d/kit/intro.js';
import { INTRO } from './intro.js';
import { Room } from './room.js';
import { Board } from './board.js';
import { Agent } from './agents.js';
import { Darts } from './darts.js';
import { Fx } from './fx.js';
import { Director } from './director.js';
import { Hud } from './hud.js';
import { Game } from './game.js';
import { V, teamColor } from './common.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('stage');
// noir interior: a warm key high overhead (the big pendant over the board), cool city light as the rim
const PRESET = withPreset('night', {
    key: { az: 200, el: 62, color: '#ffd9ad', intensity: 1.1, extent: 9, map: 2048, far: 120, dist: 50 },
    fog: { away: '#06070b', toward: '#0b0c12', density: 0.006, height: 30, ramp: 18 },
    hemi: { sky: '#3a4a6a', ground: '#120c0a', intensity: 0.18 },
    rim: null, // a cool kicker's highlight glares off the polished board at the master lens; the glass's city light rims instead
    envFloor: [0.004, 0.0035, 0.003],
    grade: { sat: 1.02, warm: 0.05, lift: 0.002 },
    bloom: 0.11, vignette: 0.55, ca: 0.5,
});
let engine;
try { engine = new Engine(canvas, PRESET); } catch (e) {
    console.error('[killer] WebGL unavailable', e);
    document.body.classList.add('no-webgl');
    throw e;
}
const fit = () => { engine.resize(canvas.clientWidth || innerWidth, canvas.clientHeight || innerHeight); director && (director.aspect = engine.camera.aspect); };
let director = null;
fit();
addEventListener('resize', fit);
engine.dof.far = true;
// an interior: a tight depth range (the default 9 km far plane z-fights the inlays at this distance)
engine.camera.near = 0.5; engine.camera.far = 160; engine.camera.updateProjectionMatrix();
const S = engine.scene;

// ---------------------------------------------------------------- set
const refl = new Reflection(engine, { height: 0 });
const room = new Room(engine, refl);
const board = new Board(engine, refl);
const fx = new Fx(S);
const darts = new Darts(S, fx);
// the shatter chunks: one instanced draw, real rigid bodies
const chunkMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 });
const chunkMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), chunkMat, 120);
chunkMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(120 * 3), 3);
chunkMesh.castShadow = true; chunkMesh.receiveShadow = true; chunkMesh.frustumCulled = false;
const world = new World(S, chunkMesh, { w: 1, h: 1, d: 1 }, { sinkAfter: Infinity });

const agents = [];
/** (re)build the agents for a roster: [{ name, avatar, color, number }] */
function buildAgents(players) {
    for (const A of agents) A.dispose();
    agents.length = 0;
    players.forEach((p, i) => agents.push(new Agent(engine, { index: i, color: p.color || teamColor(i), name: p.name, avatar: p.avatar, number: p.number })));
}
engine.bakeEnvironment(room.envScene());

const ctx = { agents, active: 0 };
director = new Director(engine.camera, ctx);
director.aspect = engine.camera.aspect;
const fixedShot = params.get('shot');
director.set(fixedShot || 'master', {}, true);
const feel = { flash: 0 };
const hud = new Hud();
const game = new Game({ engine, board, darts, fx, director, hud, room, world, ctx, agents, buildAgents, feel, audio: null });
if (fixedShot) { const set = director.set.bind(director); director.set = (name, p, cut) => set(fixedShot, p, cut); }

// ---------------------------------------------------------------- state (host or demo)
// "How to play": up while the game is fresh, gone the moment the first dart lands (docs/plans/GAME-INTROS-3D.md)
const intro = new Intro(INTRO);
const inbox = stateInbox('killer', { onState: (state) => game.onState(state) });
if (params.has('demo')) {
    import('./demo.js').then(({ startDemo }) => {
        game.video = params.get('video') === '1';
        window.__killerDemo = startDemo(inbox.apply, {
            players: Math.max(2, Math.min(6, Number(params.get('players')) || 4)), speed: Number(params.get('speed')) || 1,
            doubles: params.get('doubles') === '1', video: game.video, longNames: params.get('long') === '1',
            seed: params.has('seed') ? Number(params.get('seed')) : undefined,
        });
        holdDemo(window.__killerDemo, intro);
    });
}

// ---------------------------------------------------------------- frame
function before() {
    if (inbox.list.length) document.body.classList.add('live');
    while (inbox.list.length) { const gd = inbox.list.shift(); intro.sync(gd); game.sync(gd); }
}
function simulate(dt) {
    engine.time.value += dt;
    const t = engine.time.value;
    game.update(dt);
    board.update(dt);
    darts.update(dt);
    for (const A of agents) A.update(dt, t);
    world.step(dt);
    fx.update(dt);
    room.spotScaleTo = director.shot.name === 'master' || director.shot.name === 'round' ? 0.3 : 1;
    room.update(dt, t);
    director.update(dt);
}
function after(ms) {
    world.render();
    engine.placeShadow(V(0, 0, 0));
    engine.dof.focus = director.dofFocus; engine.dof.aperture = director.dofAp;
    feel.flash = Math.max(0, feel.flash - Math.min(0.5, ms / 1000) * 3); engine.flash = feel.flash;
    const P = engine.camera.projectionMatrix.elements[5], H = engine.renderer.domElement.height, W = engine.renderer.domElement.width;
    fx.setScale(H * P * 0.5, W, H);
}
const frames = createLoop({ engine, before, simulate, after });

window.__killer = {
    engine, room, board, agents, darts, fx, world, director, hud, THREE,
    get game() { return game; },
    /** what's on screen now for the nothing-lies check */
    truth: () => game.truth(),
    shot: (name, p = {}) => director.set(name, p, true),
    step: frames.step,
};
