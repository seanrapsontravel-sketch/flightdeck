// The limbo rig, centre stage: two carved tiki posts, a ratchet rack on each inner face with ONE TOOTH PER POINT
// (so the bar literally drops tooth by tooth), a glowing glyph every 10 points, bronze clamps riding the racks, and
// the bamboo bar on fire along its length with a carved number plaque standing on it.
//
// rig.setBar(value, mode) moves the bar: 'drop' ratchets down tooth by tooth (clunk, clunk), 'reset' runs it back up
// fast, 'snap' jumps (forced debug states). rig.shown is the value the bar is physically at right now; the plaque
// always shows that. Heat (0 at 60 → 1 at 3) scales the flames, embers and fire light.
import * as THREE from 'three';
import { Pool } from '../lib3d/particles.js';
import { DECK_Y, PT, BALL_D, BAR_R, POST_X, POST_W, POST_H, BAR_START, barY, heatOf, merge, rng, V, FONT, NOISE, easeOutBack, clamp01 } from './common.js';
import { FireLight } from './fire.js';
import { woodMaterial } from './beach.js';

const INNER = POST_X - POST_W / 2;          // inner face x of the right post
const BAR_L = INNER * 2 - 0.2;               // the pole ends inside both clamps

/** the burning bamboo: charred, with ember cracks that glow brighter as the heat rises */
function bambooMaterial(heatU, time) {
    const m = new THREE.MeshStandardMaterial({ color: '#8a7a44', roughness: 0.66, metalness: 0, emissive: '#ffffff', emissiveIntensity: 1 });
    m.onBeforeCompile = (sh) => {
        sh.uniforms.uHeat = heatU; sh.uniforms.uTime = time;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLP;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLP=position;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nuniform float uHeat,uTime;varying vec3 vLP;\n${NOISE}`)
            .replace('#include <color_fragment>', `#include <color_fragment>
float a=atan(vLP.z,vLP.y);vec2 q=vec2(vLP.x*3.,a*1.2);
float char=smoothstep(.35,.75,gf(q*1.5+3.));
// bamboo fibres along the culm, and darker nodes every 0.62 m
float fib=gn(vec2(vLP.x*.8,a*40.))*.5+gn(vec2(vLP.x*2.,a*90.))*.5;
float nd=fract((vLP.x+${(BAR_L / 2 - 0.31).toFixed(3)})/.62);float node=1.-smoothstep(.0,.06,min(nd,1.-nd));
diffuseColor.rgb*=.8+.35*fib;diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.18,.13,.06),node*.7);
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.03,.025,.02),char*.85);`)
            .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
float ck=gf(q*4.+vec2(0.,uTime*.15));float crack=smoothstep(.6,.66,ck)*(1.-smoothstep(.66,.74,ck));
float flick=.75+.25*sin(uTime*7.+vLP.x*5.);
totalEmissiveRadiance=vec3(3.,.75,.12)*(crack*char*(.6+2.2*uHeat)*flick+char*.04*(1.+uHeat));`);
    };
    m.customProgramCacheKey = () => 'limbo-bamboo';
    return m;
}

/** a carved tiki post, built along +y from 0 to POST_H: stacked faces with glowing eyes, painted bands, headdress */
function postGeometry() {
    const W = POST_W, tiers = 6, th = POST_H / tiers;
    const wood = [], paint = [], bone = [], eyes = [];
    const box = (w, h, d, x, y, z, list) => list.push(new THREE.BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed());
    for (let i = 0; i < tiers; i++) {
        const y0 = i * th, face = i % 2 === 0;
        box(W, th, W, 0, y0 + th / 2, 0, wood);
        // brow ridge and a chin ledge on every tier
        box(W + 0.16, 0.16, W + 0.16, 0, y0 + th - 0.12, 0, paint);
        box(W + 0.08, 0.08, W + 0.08, 0, y0 + 0.06, 0, bone);
        for (const s of [1, -1]) {
            const z = s * (W / 2);
            if (face) {
                // a face: eye sockets (glowing), a wedge nose, a wide mouth with bone teeth
                for (const ex of [-0.19, 0.19]) { box(0.24, 0.14, 0.06, ex, y0 + th * 0.68, z + s * 0.02, bone); box(0.14, 0.07, 0.05, ex, y0 + th * 0.68, z + s * 0.05, eyes); }
                const nose = new THREE.ConeGeometry(0.11, 0.36, 4).rotateY(Math.PI / 4).translate(0, y0 + th * 0.48, z + s * 0.06).toNonIndexed();
                wood.push(nose);
                box(0.56, 0.17, 0.08, 0, y0 + th * 0.27, z + s * 0.03, paint);
                for (let k = -2; k <= 2; k++) box(0.06, 0.07, 0.04, k * 0.1, y0 + th * 0.27, z + s * 0.08, bone);
            } else {
                // a band of chevrons
                for (let k = -2; k <= 2; k++) {
                    const c = new THREE.BoxGeometry(0.12, 0.05, 0.05).rotateZ(Math.PI / 4).translate(k * 0.15 - 0.03, y0 + th * 0.5, z + s * 0.02).toNonIndexed();
                    const c2 = new THREE.BoxGeometry(0.12, 0.05, 0.05).rotateZ(-Math.PI / 4).translate(k * 0.15 + 0.05, y0 + th * 0.5, z + s * 0.02).toNonIndexed();
                    bone.push(c, c2);
                }
                box(W + 0.02, 0.1, 0.03, 0, y0 + th * 0.3, z + s * 0.005, paint);
                box(W + 0.02, 0.1, 0.03, 0, y0 + th * 0.7, z + s * 0.005, paint);
            }
        }
    }
    // headdress: a fan of carved planks and a cap
    box(W + 0.3, 0.22, W + 0.3, 0, POST_H + 0.11, 0, paint);
    for (let k = -3; k <= 3; k++) {
        const p = new THREE.BoxGeometry(0.16, 1.05 - Math.abs(k) * 0.12, 0.08).translate(0, 0.5, 0).rotateZ(k * 0.2).translate(k * 0.04, POST_H + 0.2, 0).toNonIndexed();
        (Math.abs(k) % 2 ? bone : wood).push(p);
    }
    return { wood: merge(wood), paint: merge(paint), bone: merge(bone), eyes: merge(eyes) };
}

/** one tooth of the ratchet rack: a sawtooth wedge (vertical face on top: the pawl drops onto it) */
function toothGeometry() {
    const s = new THREE.Shape();
    s.moveTo(0, 0); s.lineTo(0.09, PT * 0.92); s.lineTo(0, PT * 0.92); s.lineTo(0, 0);
    return new THREE.ExtrudeGeometry(s, { depth: 0.22, bevelEnabled: false }).translate(0, 0, -0.11);
}

function plaqueTexture() {
    const c = document.createElement('canvas'); c.width = 512; c.height = 320;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    return { c, ctx: c.getContext('2d'), tex };
}
function drawPlaque(P, n) {
    const { ctx, c } = P, W = c.width, H = c.height;
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#5a3c22'); g.addColorStop(1, '#3a2614');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.18;
    for (let i = 0; i < 36; i++) { ctx.fillStyle = i % 2 ? '#2a1a0c' : '#6e4a2a'; ctx.fillRect(0, (i * 37) % H, W, 2 + (i % 3)); }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#d8b46a'; ctx.lineWidth = 10; ctx.strokeRect(14, 14, W - 28, H - 28);
    ctx.font = `900 ${n >= 10 ? 236 : 250}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 16; ctx.strokeStyle = '#1a0f06'; ctx.strokeText(String(n), W / 2, H / 2 + 14);
    ctx.fillStyle = '#ffe2a8'; ctx.fillText(String(n), W / 2, H / 2 + 14);
    P.tex.needsUpdate = true;
}
function glyphTexture(n) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 128, 128);
    ctx.font = `900 74px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
    ctx.fillText(String(n), 64, 70);
    const t = new THREE.CanvasTexture(c); return t;
}

export class Rig {
    constructor(engine, flames) {
        this.engine = engine; this.flames = flames;
        const S = engine.scene;
        this.group = new THREE.Group(); S.add(this.group);
        this.heatU = { value: 0 };
        this.value = BAR_START; this.shown = BAR_START; this.y = barY(BAR_START);
        this.queue = []; this.mode = 'idle'; this.toothT = 0; this.onTooth = null;

        // ---- posts
        const G = postGeometry();
        const teak = woodMaterial('#4a2f1d', { rough: 0.6, grain: 0.4, axis: 'y', scale: 1.4 });
        const ochre = new THREE.MeshStandardMaterial({ color: '#6e2a18', roughness: 0.55 });
        const bone = new THREE.MeshStandardMaterial({ color: '#c9b48c', roughness: 0.5 });
        this.eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffae4a').multiplyScalar(3) });
        this.posts = [];
        for (const s of [-1, 1]) {
            const g = new THREE.Group(); g.position.set(s * POST_X, DECK_Y, 0);
            for (const [geo, mat] of [[G.wood, teak], [G.paint, ochre], [G.bone, bone], [G.eyes, this.eyeMat]]) {
                const m = new THREE.Mesh(geo, mat); m.castShadow = mat !== this.eyeMat; m.receiveShadow = true; g.add(m);
            }
            this.group.add(g); this.posts.push(g);
        }

        // ---- racks: one tooth per point on each inner face, from 0 to the top of the post
        const maxPts = Math.floor((POST_H - BALL_D - 0.3) / PT);
        const tooth = toothGeometry();
        const bronze = new THREE.MeshStandardMaterial({ color: '#b07a3a', roughness: 0.32, metalness: 1 });
        this.bronze = bronze;
        const rack = new THREE.InstancedMesh(tooth, bronze, (maxPts + 1) * 2);
        const m = new THREE.Matrix4(), q = new THREE.Quaternion();
        let k = 0;
        for (const s of [-1, 1]) for (let n = 0; n <= maxPts; n++) {
            // the tooth's flat top is at the bar's underside height for value n
            const y = DECK_Y + n * PT + BALL_D - PT * 0.92;
            q.setFromEuler(new THREE.Euler(0, s > 0 ? Math.PI : 0, 0));
            m.compose(V(s * INNER, y, 0), q, V(1, 1, 1)); rack.setMatrixAt(k++, m);
        }
        rack.castShadow = true; this.group.add(rack);
        // rails either side of the teeth
        const rails = [];
        for (const s of [-1, 1]) for (const z of [-0.15, 0.15]) rails.push(new THREE.BoxGeometry(0.06, POST_H - 0.3, 0.05).translate(s * (INNER - 0.03), DECK_Y + (POST_H - 0.3) / 2 + 0.15, z).toNonIndexed());
        const railMesh = new THREE.Mesh(merge(rails), bronze); railMesh.castShadow = true; this.group.add(railMesh);

        // ---- glyphs every 10 points: a glowing diamond and the number, on both posts
        this.glyphs = [];
        // a bronze tag hangs in front of each rack (clear of the clamps, which ride behind it) with the number glowing
        // on it, and a hot tick runs across the rack at that tooth
        const tagGeo = new THREE.BoxGeometry(0.3, 0.24, 0.03), tickGeo = new THREE.BoxGeometry(0.1, 0.018, 0.24);
        for (let n = 0; n <= maxPts; n += 10) {
            const y = DECK_Y + n * PT + BALL_D;
            const dm = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb04a').multiplyScalar(3), alphaMap: glyphTexture(n), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
            const tk = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb04a').multiplyScalar(3) });
            for (const s of [-1, 1]) {
                const tag = new THREE.Mesh(tagGeo, bronze); tag.position.set(s * (INNER - 0.17), y, POST_W / 2 - 0.01); tag.castShadow = true; this.group.add(tag);
                const t = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.24), dm); t.position.set(s * (INNER - 0.17), y, POST_W / 2 + 0.008); this.group.add(t);
                const tick = new THREE.Mesh(tickGeo, tk); tick.position.set(s * (INNER - 0.05), y + 0.005, 0); this.group.add(tick);
                this.glyphs.push({ n, mats: [dm, tk] });
            }
        }

        // ---- clamps (they ride the racks) and the burning bar between them
        this.clamps = [];
        for (const s of [-1, 1]) {
            const g = new THREE.Group();
            const body = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.42, 0.6), bronze);
            body.position.set(-s * 0.08, 0, 0);
            const collar = new THREE.Mesh(new THREE.CylinderGeometry(BAR_R * 1.45, BAR_R * 1.45, 0.3, 14).rotateZ(Math.PI / 2), bronze);
            collar.position.set(-s * 0.32, 0, 0);
            const pawl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.26), bronze);
            pawl.position.set(s * 0.12, -BAR_R - 0.02, 0); pawl.rotation.z = s * 0.4;
            const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.66, 8).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#2a2622', roughness: 0.4, metalness: 1 }));
            bolt.position.set(-s * 0.08, 0.1, 0);
            for (const o of [body, collar, pawl, bolt]) { o.castShadow = true; g.add(o); }
            g.position.x = s * (INNER - 0.18);
            this.group.add(g); this.clamps.push(g);
        }
        this.bar = new THREE.Group(); this.group.add(this.bar);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(BAR_R, BAR_R, BAR_L, 18, 1).rotateZ(Math.PI / 2), bambooMaterial(this.heatU, engine.time));
        pole.castShadow = true; this.bar.add(pole);
        const nodes = [];
        // node ridges: a slight swelling at each joint, in the same charred bamboo
        for (let x = -BAR_L / 2 + 0.31; x < BAR_L / 2; x += 0.62) nodes.push(new THREE.CylinderGeometry(BAR_R * 1.07, BAR_R * 1.07, 0.05, 18).rotateZ(Math.PI / 2).translate(x, 0, 0).toNonIndexed());
        const nodeMesh = new THREE.Mesh(merge(nodes), new THREE.MeshStandardMaterial({ color: '#3a2c18', roughness: 0.75 }));
        this.bar.add(nodeMesh);

        // ---- the plaque, standing on the bar's centre on two pegs
        this.plaqueT = plaqueTexture(); drawPlaque(this.plaqueT, BAR_START);
        const pm = new THREE.MeshStandardMaterial({ map: this.plaqueT.tex, roughness: 0.55, emissive: '#ffffff', emissiveMap: this.plaqueT.tex, emissiveIntensity: 0.25 });
        const plaque = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.75, 0.08), [teak, teak, teak, teak, pm, teak]);
        plaque.position.set(0, BAR_R + 0.5, 0); plaque.castShadow = true;
        const pegs = [-0.35, 0.35].map((x) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 6), bronze); p.position.set(x, BAR_R + 0.08, 0); return p; });
        this.bar.add(plaque, ...pegs);
        this.plaque = plaque;

        // ---- fire along the bar: tongues on top, skipping the plaque, plus smaller ones licking the underside
        this.tongues = [];
        const r = rng(9);
        for (let x = -BAR_L / 2 + 0.25; x <= BAR_L / 2 - 0.25; x += 0.26) {
            const behind = Math.abs(x) < 0.7;
            // uneven heights, jittered spacing and depth so the tongues merge into a ragged sheet, not a fence
            const big = r() < 0.25;
            this.tongues.push({ x: x + (r() - 0.5) * 0.12, off: behind ? -0.12 : (r() - 0.5) * 0.14, k: behind ? 0.5 : big ? 1.25 + r() * 0.3 : 0.6 + r() * 0.45, wk: 0.8 + r() * 0.5, f: flames.add({ p: V(x, 0, 0), w: 0.62, h: 1, seed: r(), speed: r() }) });
        }
        for (let x = -BAR_L / 2 + 0.5; x <= BAR_L / 2 - 0.5; x += 0.55) this.tongues.push({ x, off: 0.06, k: 0.32 + r() * 0.15, low: true, f: flames.add({ p: V(x, 0, 0), w: 0.3, h: 0.4, seed: r(), speed: r() }) });
        this.lean = 0; this.leanX = 0; this.jolt = 0; this.flare = 0; this.clock = 0;

        // ---- fire light (two flickering points riding the bar) and embers
        this.lights = [new FireLight(S, V(-1.5, 0, 0.4), { intensity: 26 }), new FireLight(S, V(1.5, 0, 0.4), { intensity: 26 })];
        this.embers = new Pool(500, THREE.AdditiveBlending, S, new THREE.Vector3(1, 1, 1));
        this.emberAcc = 0;
        this.place(this.y);
        this.setHeat(BAR_START);
    }

    /** vertical position of everything that rides the bar */
    /** an impact on the bar (a ball slams it, a kiss): the bamboo shudders and the fire flares */
    kick(j = 1, flare = 1) { this.jolt = Math.max(this.jolt, j); this.flare = Math.max(this.flare, flare); }

    place(y) {
        this.y = y;
        const sh = Math.sin(this.clock * 46) * this.jolt * 0.05;
        this.bar.position.y = y + sh; this.bar.rotation.z = Math.sin(this.clock * 31) * this.jolt * 0.006;
        for (const c of this.clamps) c.position.y = y;
        for (const L of this.lights) L.light.position.y = y + 0.55;
        const H = this.heat ?? 0;
        for (const T of this.tongues) {
            T.f.p.set(T.x, y + (T.low ? -BAR_R * 0.4 : BAR_R * 0.35), T.off);
            const sc = (T.low ? 1 : 0.8 + H * 1.1) * (1 + this.flare * 0.9);
            T.f.h = (T.low ? 0.4 : 1.05) * T.k * sc;
            T.f.w = T.low ? 0.3 : 0.7 * T.wk * (0.9 + H * 0.35);
            T.f.intensity = (T.low ? 0.5 : 0.85) + H * 0.3;
            // tongues lean toward the ball when it's close (it's a hot thing under the fire: the draught pulls)
            const dx = this.leanX - T.x, near = Math.exp(-dx * dx * 0.6);
            T.f.lean[0] = Math.sign(dx) * near * this.lean * 0.25;
            T.f.lean[1] = this.lean * near * 0.25;
            this.flames.write(T.f);
        }
    }

    setHeat(bar) {
        this.heat = heatOf(bar);
        this.heatU.value = this.heat;
        for (const L of this.lights) L.base = 22 + 46 * this.heat;
        // the glyph at (and just under) the bar burns brighter
        for (const g of this.glyphs) for (const m of g.mats) m.color.set('#ffb04a').multiplyScalar(g.n <= bar && g.n > bar - 10 ? 9 : 2.4);
    }

    /** move the bar to `value`: 'drop' (tooth by tooth), 'reset' (fast run up), 'snap' (jump: forced states) */
    setBar(value, mode = 'drop') {
        value = Math.round(value);
        this.value = value;
        if (mode === 'snap' || value === this.shown) { this.mode = 'idle'; this.shown = value; this.place(barY(value)); drawPlaque(this.plaqueT, value); this.setHeat(value); return; }
        this.mode = mode;
        const steps = Math.abs(value - this.shown);
        // designed durations: a drop takes 0.9–1.8 s however far it goes; a reset 0.9 s
        this.toothDur = mode === 'reset' ? Math.min(0.06, 0.9 / steps) : THREE.MathUtils.clamp(1.8 / steps, 0.07, 0.16);
        this.toothT = 0; this.from = this.shown;
    }
    get busy() { return this.mode !== 'idle'; }

    update(dt, t) {
        this.clock = t;
        this.jolt = Math.max(0, this.jolt - dt * 1.8); this.flare = Math.max(0, this.flare - dt * 1.2);
        if (this.mode !== 'idle') {
            this.toothT += dt;
            const dir = Math.sign(this.value - this.shown);
            const u = clamp01(this.toothT / this.toothDur);
            const y0 = barY(this.shown), y1 = barY(this.shown + dir);
            // a drop clunks: fall fast into the next tooth with a little bounce; a reset slides
            const e = this.mode === 'drop' ? easeOutBack(Math.min(1, u / 0.55), 2.6) : u;
            this.place(y0 + (y1 - y0) * e);
            if (u >= 1) {
                this.shown += dir; this.toothT = 0;
                drawPlaque(this.plaqueT, this.shown);
                this.setHeat(this.shown);
                if (this.onTooth) this.onTooth(this.shown, this.mode);
                if (this.shown === this.value) { this.mode = 'idle'; this.place(barY(this.shown)); }
            }
        } else this.place(this.y);
        for (const L of this.lights) L.update(t);
        // embers: more and hotter as the bar gets lower
        this.emberAcc += dt * (14 + 70 * this.heat);
        const r = Math.random;
        while (this.emberAcc > 1) {
            this.emberAcc -= 1;
            const x = (r() - 0.5) * (BAR_L - 0.6), hot = 0.6 + r() * 0.8;
            this.embers.spawn({ p: [x, this.y + 0.2 + r() * 0.5, (r() - 0.5) * 0.2], v: [(r() - 0.5) * 0.6, 0.6 + r() * 1.6, (r() - 0.5) * 0.6], c: [2.2 * hot, 0.75 * hot, 0.16 * hot, 1], size: 0.025 + r() * 0.025, kind: 4, life: 1.1 + r() * 1.6, drag: 0.8, grav: -0.5 });
        }
        this.embers.update(dt);
        this.flames.flush();
    }
}
