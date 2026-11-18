// 3D Shanghai ("The Lantern Pagoda") — boot, the frame loop, game state.
// It plays the host's state (SYNC_STATE from viewer.html) or ?demo=1 (a simulated game).
//   ?demo=1         simulated game: &players=2..6 &speed=2 &seed=n &doubles=1 &long=1
//                   (window.__shanghaiDemo.force(kind), .queue([...]), .set(i, {...}))
//   ?shot=name      hold one camera (master, bed, station, crane, winner)
//   ?capture=1      no rAF: drive frames with window.__shanghai.step(n, dt)
//   ?dpr=1 ?quality=low   (engine)
import * as THREE from 'three';
import { Engine, withPreset } from '../lib3d/engine.js';
import { stateInbox } from '../lib3d/kit/queue.js';
import { createLoop } from '../lib3d/kit/loop.js';
import { Intro, holdDemo } from '../lib3d/kit/intro.js';
import { INTRO } from './intro.js';
import { Courtyard } from './courtyard.js';
import { Darts } from './darts.js';
import { Sky } from './sky.js';
import { Director } from './director.js';
import { Hud } from './hud.js';
import { Game } from './game.js';
import { Fx } from './fx.js';
import { LanternField } from './lanterns.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('stage');
// the courtyard at sunset → night: the sky module drives key, fill, rim and haze per round
const PRESET = withPreset('dusk', {
    key: { az: 232, el: 8, color: '#ffb06a', intensity: 3, extent: 28, map: 4096, far: 300, dist: 140 },
    fog: { away: '#7a6a8c', toward: '#ff9a55', density: 0.0012, height: 40, ramp: 60, az: 18, el: 2 },
    hemi: { sky: '#6a7ab8', ground: '#2a1a14', intensity: 0.35 },
    rim: { color: '#ff9a6a', intensity: 0.4 },
    envFloor: [0.03, 0.02, 0.018],
    grade: { sat: 1.06, warm: 0.04, lift: 0.002 },
    bloom: 0.08, vignette: 0.38, ca: 0.35,
});
let engine;
try { engine = new Engine(canvas, PRESET); } catch (e) {
    console.error('[shanghai] WebGL unavailable', e);
    document.body.classList.add('no-webgl');
    throw e;
}
let director = null;
const fit = () => { engine.resize(canvas.clientWidth || innerWidth, canvas.clientHeight || innerHeight); if (director) { director.aspect = engine.camera.aspect; director.masterKey = null; } };
fit();
addEventListener('resize', fit);
engine.camera.near = 0.3; engine.camera.far = 3500; engine.camera.updateProjectionMatrix();
engine.scene.fog = new THREE.FogExp2(0, 0.001); // switches the engine's haze chunk on
engine.dof.far = true;

const sky = new Sky(engine);
const court = new Courtyard(engine);
const darts = new Darts(engine.scene);
const fx = new Fx(engine.scene);
const field = new LanternField(engine.scene);
director = new Director(engine.camera, court);
director.aspect = engine.camera.aspect;
const fixedShot = params.get('shot');
director.set(fixedShot || 'master', {}, true);
const hud = new Hud();
const game = new Game({ engine, court, sky, darts, director, hud, fx, field });
hud.onTitle = (main, kind) => game.note('title', { main, kind });
if (fixedShot) { const set = director.set.bind(director); director.set = (name, p, cut) => set(fixedShot, p, cut); }
// round 1 until a state says otherwise
sky.set(0); sky.bake(null); court.setTiers(1); court.setNight(0);
// compile every material now, not on first sight mid-game (the first seconds after load were janky)
try { engine.renderer.compile(engine.scene, engine.camera); } catch (e) { console.warn('[shanghai] precompile', e); }

// ---------------------------------------------------------------- state (host or demo)
const intro = new Intro(INTRO);
const inbox = stateInbox('shanghai', { onState: (state) => game.onState(state) });
if (params.has('demo')) {
    import('./demo.js').then(({ startDemo }) => {
        window.__shanghaiDemo = startDemo(inbox.apply, {
            players: Math.max(2, Math.min(6, Number(params.get('players')) || 4)), speed: Number(params.get('speed')) || 1,
            doubles: params.get('doubles') === '1', longNames: params.get('long') === '1',
            seed: params.has('seed') ? Number(params.get('seed')) : undefined,
        });
        holdDemo(window.__shanghaiDemo, intro);
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
    court.update(dt);
    darts.update(dt);
    fx.update(dt);
    director.update(dt);
    field.update(dt, engine.camera);
}
function after() {
    engine.placeShadow(new THREE.Vector3(0, 3, 4));
    engine.dof.focus = director.dofFocus; engine.dof.aperture = director.dofAp;
    const P = engine.camera.projectionMatrix.elements[5], H = engine.renderer.domElement.height, W = engine.renderer.domElement.width;
    fx.setScale(H * P * 0.5, W, H);
}
const frames = createLoop({ engine, before, simulate, after });

window.__shanghai = {
    engine, court, sky, darts, fx, field, director, hud, intro, THREE,
    get game() { return game; },
    truth: () => game.truth(),
    shot: (name, p = {}) => director.set(name, p, true),
    step: frames.step,
};
