// Boot: build the yard, the towers and the crane, then run the frame loop.
// With game state (the host's SYNC_STATE, or ?demo=1 for a simulated game) the towers follow the game.
// Without it, a look-dev script strikes the hero tower on a loop and rebuilds it.
//   ?demo=1  simulated game (?players=2..6 ?speed=n ?seed=n)
//   ?players=2..6  lanes          ?hero=i       which tower the crane works
//   ?shot=wide|establish|hero|low|close|strike|crane   hold one shot (default: a cut sequence)
//   ?loop=0        no automatic strikes          ?capture=1   no rAF; drive frames with __demolition.step(n, dt)
//   ?dpr=n  ?quality=low  (engine)
import * as THREE from 'three';
import { Intro, holdDemo } from '../lib3d/kit/intro.js';
import { INTRO } from './intro.js';
import { Engine, PRESETS } from '../lib3d/engine.js';
import { blockMaterial, blockMesh, BLOCK } from './blocks.js';
import { Tower } from './tower.js';
import { Yard } from './yard.js';
import { TowerCrane, BallRig } from './crane.js';
import { World } from '../lib3d/physics.js';
import { Fx } from './fx.js';
import { Wrecker } from './attacks.js';
import { Director } from './director.js';
import { Hud } from './hud.js';
import { Game } from './game.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('stage');
let engine;
try { engine = new Engine(canvas, PRESETS.night); } catch (e) {
    console.error('[demolition] WebGL unavailable', e);
    document.body.classList.add('no-webgl');
    throw e;
}
const fit = () => engine.resize(canvas.clientWidth || innerWidth, canvas.clientHeight || innerHeight);
fit();
addEventListener('resize', fit);
const S = engine.scene;
engine.dof.far = true;

// ---------------------------------------------------------------- set
const yard = new Yard(engine);
const PALETTE = ['#8FD91B', '#2BA4FF', '#FF7A18', '#B44AFF', '#FF2E55', '#F0C400', '#00C97B', '#E1008C'];
const teamColor = (i) => ((window.FC_PLAYER_COLORS && window.FC_PLAYER_COLORS[i % 8]) || PALETTE[i % 8]);
const NAMES = ['Alice', 'Ben', 'Chloe', 'Dev', 'Ella', 'Finn'];
const nLanes = THREE.MathUtils.clamp(Number(params.get('players')) || 4, 1, 6);
const blockMat = blockMaterial(engine, { low: engine.low });

export function laneLayout(n) {
    const sp = n > 4 ? 8.2 : 8.8;
    return Array.from({ length: n }, (_, i) => {
        const x = (i - (n - 1) / 2) * sp, z = -0.03 * x * x;
        return { x, z, yaw: Math.atan2(-x, 44 - z) };
    });
}
const towers = laneLayout(nLanes).map((L, i) => {
    const t = new Tower(engine, blockMat, { index: i, color: teamColor(i), name: params.get('name' + i) || NAMES[i] });
    t.place(L.x, L.z, L.yaw);
    S.add(t.group);
    return t;
});
// look-dev: towers at a spread of scores so the wide reads like a game in progress
const START = [180, 132, 157, 96, 171, 60];
towers.forEach((t, i) => t.setStanding(START[i] ?? 180));
const hero = THREE.MathUtils.clamp(Number(params.get('hero') ?? Math.min(1, nLanes - 1)), 0, nLanes - 1);
towers[hero].setStanding(180);

const crane = new TowerCrane(S, yard.beacons, V3(0, 0, -16), { mast: 26, jib: 34, counter: 12 });
new TowerCrane(S, yard.beacons, V3(-70, 0, -78), { mast: 44, jib: 40, counter: 14 }).aimAt(-30, -60, true);
new TowerCrane(S, yard.beacons, V3(62, 0, -95), { mast: 52, jib: 46, counter: 15 }).aimAt(80, -50, true);
const rig = new BallRig(S, crane);
yard.beacons.build();

engine.bakeEnvironment(yard.envScene());
yard.drawJumbo(towers.map((t) => ({ name: t.name, color: '#' + t.color.getHexString(), score: t.standing })));

// ---------------------------------------------------------------- systems
const world = new World(S, blockMesh(blockMat, engine.low ? 300 : 600), BLOCK);
world.statics = towers;
const fx = new Fx(S);
for (const b of yard.beams) fx.beams.push({ from: b.from, dir: b.dir, len: b.len, rad: b.rad, col: b.U.uCol.value.clone().multiplyScalar(0.6) });
fx.matter.floor = 0.02;

const feel = {
    stop: 0, scale: 1, flashV: 0,
    hitStop(s) { this.stop = Math.max(this.stop, s); },
    flash(a) { this.flashV = Math.min(0.5, Math.max(this.flashV, a)); },
};
const ctx = { towers, active: hero, world };

/** replace the towers (new game, playoff): list = [{name, color}] */
function buildTowers(list, playoff, scores) {
    for (const T of towers) { S.remove(T.group); T.dispose(blockMat); }
    towers.length = 0;
    laneLayout(list.length).forEach((L, i) => {
        const t = new Tower(engine, blockMat, { index: i, color: list[i].color, name: list[i].name, layout: playoff ? 'playoff' : 'main' });
        t.place(L.x, L.z, L.yaw);
        t.setStanding(scores[i]); t.target = scores[i];
        S.add(t.group);
        towers.push(t);
    });
    ctx.active = 0;
    wrecker.serve(towers[0], 8, true);
    yard.drawJumbo(towers.map((t) => ({ name: t.name, color: '#' + t.color.getHexString(), score: t.target })));
}
const director = new Director(engine.camera, ctx);
const wrecker = new Wrecker({ crane, rig, world, fx, feel, director });
wrecker.serve(towers[hero], 8, true);

// ---------------------------------------------------------------- game (host state or demo)
let mode = 'lookdev';
let hud = null, game = null;
const queue = [];
function apply(gd) {
    if (!gd || gd.gameType !== 'demolition') return;
    // every state is kept (not latest-wins): each dart has to be seen
    queue.push(gd);
}
window.addEventListener('message', (event) => {
    if (event.origin !== location.origin || event.source !== window.parent) return;
    const m = event.data;
    if (!m || m.type !== 'SYNC_STATE' || !m.state || !m.state.gameData) return;
    apply(m.state.gameData);
});
// "How to play": up while the game is fresh, gone the moment the first dart lands (docs/plans/GAME-INTROS-3D.md)
const intro = new Intro(INTRO);
let demo = null;
if (params.has('demo')) {
    import('./demo.js').then(({ startDemo }) => {
        demo = startDemo(apply, { players: nLanes, speed: Number(params.get('speed')) || 1, seed: params.has('seed') ? Number(params.get('seed')) : undefined });
        window.__demolitionDemo = demo;
        holdDemo(demo, intro);
    });
}
function enterGame() {
    mode = 'game';
    hud = new Hud();
    game = new Game({ engine, yard, world, fx, wrecker, director, hud, feel, ctx, get towers() { return towers; }, buildTowers });
    lookdev.pendingStrike = -1;
    document.body.classList.add('live');
}

// ---------------------------------------------------------------- look-dev script
const fixedShot = params.get('shot');
const auto = params.get('loop') !== '0';
const SEQ = [['establish', 3.2], ['strike', 3.4], ['low', 2.6], ['strike2', 3.4], ['close', 2.6], ['wide', 3], ['strike', 3.4], ['hero', 3]];
const HITS = [14, 18, 9, 20, 11, 16, 7, 12];
const lookdev = { t: 0, i: 0, shotT: 0, si: 0, hits: 0, pendingStrike: -1 };
director.set(fixedShot || SEQ[0][0], {}, true);

function lookdevUpdate(dt) {
    const T = towers[hero];
    lookdev.t += dt;
    if (!fixedShot) {
        lookdev.shotT += dt;
        if (lookdev.shotT > SEQ[lookdev.si][1]) {
            lookdev.shotT = 0; lookdev.si = (lookdev.si + 1) % SEQ.length;
            const name = SEQ[lookdev.si][0];
            director.set(name, name.startsWith('strike') ? { y: wrecker.impactY } : {}, true);
            if (name.startsWith('strike') && auto) lookdev.pendingStrike = 0.7;
            if (name === 'wide' && T.standing < 70) rebuild();
        }
    } else if (auto && wrecker.ready && lookdev.t > 1.6) {
        lookdev.t = 0;
        if (T.standing < 50) rebuild(); else strike();
    }
    if (lookdev.pendingStrike >= 0) { lookdev.pendingStrike -= dt; if (lookdev.pendingStrike < 0) strike(); }
}
function strike(n) {
    const T = towers[hero];
    n = n ?? HITS[lookdev.hits++ % HITS.length];
    return wrecker.strike(Math.min(n, T.standing), (k) => yard.drawJumbo(towers.map((t) => ({ name: t.name, color: '#' + t.color.getHexString(), score: t.standing }))));
}
function rebuild() {
    world.sink();
    towers[hero].dropIn(180);
    yard.drawJumbo(towers.map((t) => ({ name: t.name, color: '#' + t.color.getHexString(), score: t.standing })));
}

// ---------------------------------------------------------------- frame
function tick(ms) {
    const raw = Math.min(0.05, ms / 1000);
    engine.time.value += raw;
    // hit-stop freezes the simulation (not the camera) for a few frames
    let sim = raw;
    if (feel.stop > 0) { feel.stop -= raw; sim = 0; }
    sim *= feel.scale;
    if (queue.length && mode !== 'game') enterGame();
    while (queue.length) { const gd = queue.shift(); intro.sync(gd); game.sync(gd); }
    if (mode === 'game') { game.update(sim); hud.frame(raw); } else lookdevUpdate(raw);
    crane.update(sim);
    wrecker.update(sim);
    world.step(sim);
    for (const e of world.events) if (e.speed > 4.5) { fx.landing(e, e.speed); if (e.speed > 9) director.addTrauma(0.04); }
    world.events.length = 0;
    world.render();
    for (const T of towers) T.update(sim, engine.time.value);
    fx.update(sim);
    director.update(raw);
    engine.placeShadow(V3(0, 0, -4));
    engine.dof.focus = director.dofFocus; engine.dof.aperture = director.dofAp;
    feel.flashV = Math.max(0, feel.flashV - raw * 4);
    engine.flash = feel.flashV;
    const P = engine.camera.projectionMatrix.elements[5], H = engine.renderer.domElement.height, W = engine.renderer.domElement.width;
    fx.setScale(H * P * 0.5, W, H);
    yard.beacons.setScale(H * P * 0.5);
    engine.render();
}

const capture = params.has('capture');
let last = performance.now();
function frame(now) {
    requestAnimationFrame(frame);
    const ms = now - last; last = now;
    tick(ms);
    engine.adapt(ms);
}
if (!capture) requestAnimationFrame(frame);
else tick(16);
document.body.classList.add('booted');

window.__demolition = {
    engine, yard, towers, crane, rig, world, fx, director, wrecker, feel, THREE,
    get game() { return game; }, get hud() { return hud; },
    strike, rebuild,
    /** what's on screen now, for the nothing-lies check (tests/browser/demolition.spec.cjs): blocks standing per
     *  lane, the lane strip's numbers, and whether every swing / drop-in has finished */
    truth: () => {
        if (!game) return null;
        const busy = towers.filter((t) => t.anim || wrecker.pending(t) || t.standing !== t.target).map((t) => t.name);
        if (game.waiting) busy.push('waiting');
        return {
            settled: !busy.length && hud.lanes.every((L) => L.shown === L.target), busy,
            standing: towers.map((t) => t.standing), lanes: hud.lanes.map((L) => Number(L.score.textContent)),
            names: hud.lanes.map((L) => L.name.textContent),
        };
    },
    shot: (name, p = {}) => director.set(name, p, true),
    /** capture mode: advance n frames of dt seconds each (renders every frame) */
    step(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) tick(dt * 1000); },
};

function V3(x, y, z) { return new THREE.Vector3(x, y, z); }
