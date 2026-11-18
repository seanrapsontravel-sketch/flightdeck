// Boot: build the course and runners, listen for the host's state, run the frame loop.
import * as THREE from 'three';
import { Intro, holdDemo } from '../lib3d/kit/intro.js';
import { INTRO } from './intro.js';
import { Engine } from './engine.js';
import { Course } from './course.js';
import { prepareHorses } from './horse.js';
import { Fx } from './fx.js';
import { Director } from './director.js';
import { Hud } from './hud.js';
import { Race } from './race.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('stage');
let engine;
try { engine = new Engine(canvas); } catch (e) {
    console.error('[derby] WebGL unavailable', e);
    document.body.classList.add('no-webgl');
    throw e;
}
const fit = () => engine.resize(canvas.clientWidth || innerWidth, canvas.clientHeight || innerHeight);
fit();
addEventListener('resize', fit);

const course = new Course(engine);
engine.bakeEnvironment();
prepareHorses();
const fx = new Fx(engine.scene, engine);
fx.fountainOn = course.fountain;
const director = new Director(engine.camera);
director.set('establish', {}, true);
const hud = new Hud();
const race = new Race({ engine, course, fx, director, hud });

let pending = null;
function apply(gd) {
    if (!gd || gd.gameType !== 'derby') return;
    pending = gd;
}

window.addEventListener('message', (event) => {
    if (event.origin !== location.origin || event.source !== window.parent) return;
    const m = event.data;
    if (!m || m.type !== 'SYNC_STATE' || !m.state || !m.state.gameData) return;
    if (window.FlightDeckWinnerVideo) {
        window.FlightDeckWinnerVideo.applyFromState(m.state);
        window.FlightDeckWinnerVideo.applyScreenClass(document.getElementById('matchWinnerScreen'));
    }
    apply(m.state.gameData);
});

if (params.has('demo')) {
    import('./demo.js').then(({ startDemo }) => {
        const d = startDemo(apply, {
            players: Number(params.get('players')) || 4,
            speed: Number(params.get('speed')) || 1,
            seed: params.has('seed') ? Number(params.get('seed')) : undefined,
        });
        holdDemo(d, intro);
    });
}

// "How to play": up while the game is fresh, gone the moment the first dart lands (docs/plans/GAME-INTROS-3D.md)
const intro = new Intro(INTRO);
let last = performance.now(), ready = false;
function frame(now) {
    requestAnimationFrame(frame);
    const ms = now - last; last = now;
    const raw = Math.min(0.05, ms / 1000);
    if (pending) {
        const gd = pending; pending = null;
        intro.sync(gd);
        race.sync(gd);
        if (!ready) { ready = true; document.body.classList.add('live'); }
    }
    engine.time.value += raw;
    const dt = race.update(raw);
    fx.update(dt, engine.time.value);
    course.update(raw, engine.time.value);
    director.update(race, raw);
    engine.placeShadow(director.look);
    engine.dof.focus = director.dofFocus || 10; engine.dof.aperture = director.dofAp || 0;
    const P = engine.camera.projectionMatrix.elements[5];
    fx.setScale(engine.renderer.domElement.height * P * 0.5);
    hud.tagsFrame(race, engine.camera, director.shot.name);
    hud.mapFrame(race);
    engine.render();
    engine.adapt(ms);
}
requestAnimationFrame(frame);
document.body.classList.add('booted');

window.__derby = { engine, course, race, director, hud, fx, THREE };
