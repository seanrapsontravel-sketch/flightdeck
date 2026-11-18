// 3D Limbo — boot, frame loop, game state, look-dev loop.
// With game state (the host's SYNC_STATE from viewer.html, or ?demo=1 for a simulated game) the beach plays the game.
// With neither, it runs the look-dev loop (scripted visits).
//   ?demo=1         simulated game: &players=2..6 &speed=2 &seed=n &doubles=1   (window.__limboDemo.force(kind), .set(i, {lives, bar}))
//   ?players=2..6   totems for the look-dev loop (default 2)
//   ?shot=name      hold one camera (establish, wide, rig, low, gap, flames, totem, limbo, burn)
//   ?bar=n          look-dev: start the bar at n          ?loop=0  stop the look-dev visits
//   ?capture=1      no rAF: drive frames with window.__limbo.step(n, dt) (docs/plans/tools/dcap.cjs)
//   ?dpr=1 ?quality=low   (engine)
import * as THREE from 'three';
import { Intro, holdDemo } from '../lib3d/kit/intro.js';
import { INTRO } from './intro.js';
import { Engine, PRESETS } from '../lib3d/engine.js';
import { Beach } from './beach.js';
import { Flames, FireLight } from './fire.js';
import { Rig } from './rig.js';
import { Totem } from './totem.js';
import { Ball } from './ball.js';
import { Fx } from './fx.js';
import { Director } from './director.js';
import { Hud } from './hud.js';
import { Game } from './game.js';
import { createAudio } from './audio.js';
import { BAR_START, V, rng, teamColor, sandH } from './common.js';
import { stateInbox } from '../lib3d/kit/queue.js';
import { createLoop } from '../lib3d/kit/loop.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('stage');
let engine;
try { engine = new Engine(canvas, PRESETS.dusk); } catch (e) {
    console.error('[limbo] WebGL unavailable', e);
    document.body.classList.add('no-webgl');
    throw e;
}
const fit = () => engine.resize(canvas.clientWidth || innerWidth, canvas.clientHeight || innerHeight);
fit();
addEventListener('resize', fit);
engine.dof.far = true;
const S = engine.scene;

// ---------------------------------------------------------------- set
const beach = new Beach(engine);
const flames = new Flames(S, engine.time, 200);
for (const p of beach.torchSpots) flames.add({ p, w: 0.36, h: 0.85 });
// a few of the ambient torches get real light: the two at the front of the deck
const torchLights = [0, 1].map((i) => new FireLight(S, beach.torchSpots[i].clone().add(V(0, 0.35, 0.2)), { intensity: 7, color: '#ff9446' }));
const rig = new Rig(engine, flames);
const fx = new Fx(S);
const ball = new Ball(engine, fx);

// totems in a shallow arc on the sand either side of the deck, turned toward the audience side of the rig
const NAMES = ['Alice', 'Ben', 'Chloe', 'Dev', 'Ella', 'Finn'];
export function totemLayout(n) {
    const left = Math.ceil(n / 2), right = n - left, out = [];
    const angles = (k) => (k === 1 ? [57] : k === 2 ? [46, 70] : [40, 57.5, 75]);
    angles(left).forEach((a) => out.push(-a));
    angles(right).reverse().forEach((a) => out.push(a));
    // left side runs outside → in, right side in → out: player order reads left to right
    return out.sort((a, b) => a - b).map((deg) => { const r = THREE.MathUtils.degToRad(deg); return V(Math.sin(r) * 10.5, 0, -1 + Math.cos(r) * 10.5); });
}
const totems = [];
/** (re)build the totems for a roster: [{ name, avatar, color }] */
function buildTotems(players) {
    for (const T of totems) T.dispose();
    totems.length = 0;
    totemLayout(players.length).forEach((p, i) => {
        const y = Math.max(0.02, sandH(p.x, p.z));
        totems.push(new Totem(engine, flames, { pos: V(p.x, y - 0.06, p.z), face: V(0, 0, 4.5), color: players[i].color || teamColor(i), name: players[i].name, avatar: players[i].avatar, index: i }));
    });
}
const nPlayers = THREE.MathUtils.clamp(Number(params.get('players')) || (params.has('demo') ? 4 : 2), 2, 6);
buildTotems(NAMES.slice(0, nPlayers).map((name, i) => ({ name, color: teamColor(i) })));

beach.beacons.build();
engine.bakeEnvironment(beach.envScene());

const ctx = { ball, rig, totems, beach, active: 0 };
const director = new Director(engine.camera, ctx);
const fixedShot = params.get('shot');
director.set(fixedShot || 'establish', {}, true);
const feel = { flash: 0 };
// sound: procedural, starts with the lagoon and the groove (null with ?sound=0)
const audio = createAudio(params);
if (audio) { audio.startAmbience(audio.now + 0.2); audio.startGroove(audio.now + 2.5); }

// ---------------------------------------------------------------- game (host state or demo)
let mode = 'lookdev';
let hud = null, game = null;
// "How to play": up while the game is fresh, gone the moment the first dart lands (docs/plans/GAME-INTROS-3D.md)
const intro = new Intro(INTRO);
const inbox = stateInbox('limbo');
const queue = inbox.list, apply = inbox.apply;
if (params.has('demo')) {
    import('./demo.js').then(({ startDemo }) => {
        window.__limboDemo = startDemo(apply, {
            players: nPlayers, speed: Number(params.get('speed')) || 1, doubles: params.get('doubles') === '1',
            seed: params.has('seed') ? Number(params.get('seed')) : undefined,
        });
        holdDemo(window.__limboDemo, intro);
    });
}
function enterGame() {
    mode = 'game';
    hud = new Hud();
    game = new Game({ engine, flames, rig, ball, fx, director, hud, ctx, totems, buildTotems, feel, scene: S, audio });
    rig.onTooth = (n, m) => { director.addTrauma(m === 'drop' ? (rig.heat > 0.5 ? 0.04 : 0.025) : 0.008); audio?.tooth(m, n === rig.value); };
    document.body.classList.add('live');
}

// ---------------------------------------------------------------- look-dev loop: one full visit at a time
const startBar = THREE.MathUtils.clamp(Number(params.get('bar')) || BAR_START, 3, 60);
rig.setBar(startBar, 'snap');
const loop = params.get('loop') !== '0' && !params.has('demo');
const r = rng(Number(params.get('seed')) || 4);
const L = { t: 0, events: [], player: 0, visits: 0 };
ball.setPlayer(teamColor(0), NAMES[0]);
ball.snap(0);
totems[0].setActive(true);

function cut(name, p = {}) { if (!fixedShot) director.set(name, p, true); }
function planVisit() {
    const bar = rig.value, P = L.player, T = totems[P];
    // the low-bar climax resets after it has been seen: show the ratchet run back up to 60
    if (bar <= 6) {
        L.events = [[0, () => cut('rig')], [0.6, () => rig.setBar(60, 'reset')], [2.4, () => planVisit()]];
        L.t = 0; return;
    }
    const total = Math.max(1, Math.min(bar - 1, Math.round(bar * (0.62 + r() * 0.2))));
    const d1 = Math.max(0, Math.round(total * (0.3 + r() * 0.2))), d2 = Math.max(0, Math.round((total - d1) * (0.4 + r() * 0.3))), d3 = total - d1 - d2;
    const darts = [d1, d1 + d2, d1 + d2 + d3];
    const low = rig.heat > 0.55;
    L.t = 0;
    L.events = [
        [0, () => { totems.forEach((t, i) => t.setActive(i === P)); ball.setPlayer(teamColor(P), NAMES[P]); ctx.active = P; cut('totem', { totem: T }); }],
        [0.2, () => { ball.clear(); ball.perch(T.top); }],
        [0.9, () => ball.leap(T.top, 0)],
        [1.35, () => { cut('rig'); }],
        [2.3, () => ball.rise(darts[0], { onArrive: () => director.addTrauma(0.08) })],
        [3.7, () => cut(low ? 'gap' : 'low')],
        [4.0, () => ball.rise(darts[1], { onArrive: () => director.addTrauma(0.08) })],
        [5.4, () => cut('gap')],
        [5.7, () => ball.rise(darts[2], { onArrive: () => director.addTrauma(0.12) })],
        [7.1, () => cut('limbo')],
        [7.3, () => ball.limbo({ onSplash: () => director.addTrauma(0.15) })],
        [9.3, () => { cut(low ? 'low' : 'rig'); rig.setBar(total, 'drop'); }],
        [11.8, () => { L.player = (L.player + 1) % totems.length; L.visits++; planVisit(); }],
    ];
}
rig.onTooth = () => director.addTrauma(rig.heat > 0.5 ? 0.05 : 0.03);
if (loop) planVisit();

function lookdevUpdate(dt) {
    if (!loop) return;
    const t0 = L.t; L.t += dt;
    for (const [at, fn] of L.events) if (at >= t0 && at < L.t) fn();
    // flames lean toward the ball when it's near the bar
    const gap = rig.y - ball.pos.y;
    rig.lean = ball.visible ? Math.max(0, 1 - gap / 1.6) : 0; rig.leanX = ball.pos.x;
}

// ---------------------------------------------------------------- frame
const P0 = V(0, 3.2, 0);
/** one simulation step (≤ 1/30 s) */
function simulate(dt) {
    engine.time.value += dt;
    const t = engine.time.value;
    if (mode === 'game') game.update(dt); else lookdevUpdate(dt);
    ball.update(dt, engine.camera.position);
    rig.update(dt, t);
    for (const T of totems) T.update(dt, t);
    for (const Lt of torchLights) Lt.update(t);
    fx.update(dt);
    beach.update(dt, t);
    director.update(dt);
}
function before() {
    if (queue.length && mode !== 'game') enterGame();
    while (queue.length) { const gd = queue.shift(); intro.sync(gd); game.sync(gd); }
}
function after(ms) {
    flames.flush();
    engine.placeShadow(P0);
    if (audio) { if (mode !== 'game') audio.setHeat(rig.heat); audio.update(); }
    engine.dof.focus = director.dofFocus; engine.dof.aperture = director.dofAp;
    feel.flash = Math.max(0, feel.flash - Math.min(0.5, ms / 1000) * 4); engine.flash = feel.flash;
    const P = engine.camera.projectionMatrix.elements[5], H = engine.renderer.domElement.height, W = engine.renderer.domElement.width;
    fx.setScale(H * P * 0.5, W, H); rig.embers.setScale(H * P * 0.5, W, H);
    beach.beacons.setScale(H * P * 0.5);
}
// wall-clock sub-stepping, ?capture=1, dynamic resolution: lib3d/kit/loop.js
const frames = createLoop({ engine, before, simulate, after });

window.__limbo = {
    engine, beach, rig, totems, ball, fx, flames, director, THREE, L, audio,
    get game() { return game; }, get hud() { return hud; },
    /** what's on screen now (bar, ball, lit torches) for the nothing-lies check */
    truth: () => (game ? game.truth() : null),
    shot: (name, p = {}) => director.set(name, p, true),
    /** capture mode: advance n frames of dt seconds each (renders every frame) */
    step: frames.step,
};
