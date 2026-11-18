// The target: a 5 m upright carnival dartboard at the back of the stall, every bed placed exactly
// (lib3d/kit/darts.js radii), every scoring zone an attraction:
//   bull        brass boss + ledge with two tin prize ducks (outer bull knocks one, double bull both)
//   inner single  the parade: rubber ducks riding a rail round the ring, gondola-style; a hit tips the nearest
//   treble      the Ring of Fire: gas jets on a brass pipe, pilot lights at rest, roaring on a hit
//   outer/double  painted water (the splash; jets come in M3)
// Plus a bed flash (the 2D page's 1.26 s three-pulse highlight) on whatever bed a dart hit.
import * as THREE from 'three';
import { RADII, SLICE, WHEEL, wedgeAngle } from '../lib3d/kit/darts.js';
import { Flames } from '../limbo/fire.js';
import { Beacons } from '../lib3d/beacons.js';
import { rubberDuckInstances, tinDuck } from './duck.js';
import { grainTexture } from './stall.js';
import { BOARD_R, RIM_R, MM, BOARD_Y, ease, easeOut } from './common.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
export const PARADE_N = 20;
export const PARADE_R = (RADII.trebleIn - 15) * MM;   // the rail: near the outer edge of the inner singles
const FLAME_R = ((RADII.trebleIn + RADII.trebleOut) / 2) * MM;

function faceTexture() {
    const N = 2048, px = (m) => (m / RIM_R) * (N / 2);
    const c = document.createElement('canvas'); c.width = c.height = N;
    const g = c.getContext('2d'), cx = N / 2, cy = N / 2;
    const ring = (r0, r1, a0, a1, fill) => { g.beginPath(); g.arc(cx, cy, px(r1), -a1, -a0); g.arc(cx, cy, px(r0), -a0, -a1, true); g.closePath(); g.fillStyle = fill; g.fill(); };
    ring(BOARD_R, RIM_R, 0, TAU, '#141c3c');
    for (let i = 0; i < 20; i++) {
        const a = wedgeAngle(WHEEL[i]), a0 = a - SLICE / 2, a1 = a + SLICE / 2, even = i % 2 === 0;
        ring(RADII.doubleIn * MM, RADII.doubleOut * MM, a0, a1, even ? '#0b3d78' : '#0d7f9e');
        ring(RADII.trebleOut * MM, RADII.doubleIn * MM, a0, a1, even ? '#145a9c' : '#2aa7c4');
        ring(RADII.trebleIn * MM, RADII.trebleOut * MM, a0, a1, even ? '#3a1d10' : '#5a2a12');
        ring(RADII.outerBull * MM, RADII.trebleIn * MM, a0, a1, even ? '#f2e6c9' : '#c8202e');
    }
    g.save(); g.globalAlpha = 0.33; g.strokeStyle = '#d9f6ff'; g.lineWidth = 4;
    for (let r = RADII.trebleOut * MM + 0.05; r < BOARD_R; r += 0.09) {
        g.beginPath();
        for (let a = 0; a <= TAU + 0.01; a += 0.01) { const rr = r + Math.sin(a * 60 + r * 20) * 0.012; const x = cx + px(rr) * Math.cos(a), y = cy - px(rr) * Math.sin(a); a ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.stroke();
    }
    g.restore();
    ring(RADII.bull * MM, RADII.outerBull * MM, 0, TAU, '#1f7a3a');
    ring(0, RADII.bull * MM, 0, TAU, '#c8202e');
    g.strokeStyle = '#e0c27a'; g.lineWidth = 5;
    for (const r of [RADII.bull, RADII.outerBull, RADII.trebleIn, RADII.trebleOut, RADII.doubleIn, RADII.doubleOut]) { g.beginPath(); g.arc(cx, cy, px(r * MM), 0, TAU); g.stroke(); }
    for (let i = 0; i < 20; i++) { const a = wedgeAngle(WHEEL[i]) + SLICE / 2; g.beginPath(); g.moveTo(cx + px(RADII.outerBull * MM) * Math.cos(a), cy - px(RADII.outerBull * MM) * Math.sin(a)); g.lineTo(cx + px(BOARD_R) * Math.cos(a), cy - px(BOARD_R) * Math.sin(a)); g.stroke(); }
    g.fillStyle = '#f3c45a'; g.font = `900 ${px(0.3)}px "Avenir Next Condensed","DIN Condensed",Impact,sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const n of WHEEL) { const a = wedgeAngle(n), r = px(2.24); g.fillText(String(n), cx + r * Math.cos(a), cy - r * Math.sin(a)); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return t;
}

/** the radial range (metres) of a bed */
const BED_R = { bull: [0, RADII.bull], outer_bull: [RADII.bull, RADII.outerBull], single_inner: [RADII.outerBull, RADII.trebleIn], treble: [RADII.trebleIn, RADII.trebleOut], single_outer: [RADII.trebleOut, RADII.doubleIn], double: [RADII.doubleIn, RADII.doubleOut], miss: [RADII.doubleOut, RIM_R / MM] };

export class Target {
    constructor(engine) {
        this.engine = engine;
        const S = engine.scene;
        this.group = new THREE.Group(); this.group.position.set(0, BOARD_Y, 0); S.add(this.group);
        const G = this.group;
        this.brass = new THREE.MeshStandardMaterial({ color: '#c79a45', roughness: 0.32, metalness: 0.9 });
        // painted tin and enamel: a little orange-peel in the roughness so the key light breaks up across it
        const face = new THREE.Mesh(new THREE.CircleGeometry(RIM_R, 160), new THREE.MeshPhysicalMaterial({ map: faceTexture(), roughness: 0.55, roughnessMap: grainTexture(21, 0.62, 0.3), clearcoat: 0.45, clearcoatRoughness: 0.22 }));
        face.receiveShadow = true; G.add(face);
        // the spider: raised gilt wire rings and radials (catches the light; the beds read as a real board)
        const wireMat = new THREE.MeshStandardMaterial({ color: '#e8cf8a', roughness: 0.25, metalness: 1 });
        for (const r of [RADII.bull, RADII.outerBull, RADII.trebleIn, RADII.trebleOut, RADII.doubleIn, RADII.doubleOut]) {
            const w = new THREE.Mesh(new THREE.TorusGeometry(r * MM, 0.009, 6, Math.max(48, Math.round(r * 1.2))), wireMat); w.position.z = 0.012; G.add(w);
        }
        const radial = new THREE.CylinderGeometry(0.008, 0.008, 1, 5);
        const rad = new THREE.InstancedMesh(radial, wireMat, 20), o0 = new THREE.Object3D();
        for (let i = 0; i < 20; i++) {
            const a = wedgeAngle(WHEEL[i]) + SLICE / 2, r0 = RADII.outerBull * MM, r1 = BOARD_R, rm = (r0 + r1) / 2;
            o0.position.set(Math.cos(a) * rm, Math.sin(a) * rm, 0.012); o0.rotation.set(0, 0, a - Math.PI / 2); o0.scale.set(1, r1 - r0, 1); o0.updateMatrix(); rad.setMatrixAt(i, o0.matrix);
        }
        G.add(rad);
        const back = new THREE.Mesh(new THREE.CylinderGeometry(RIM_R + 0.06, RIM_R + 0.06, 0.25, 96).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#1a1226', roughness: 0.7 }));
        back.position.z = -0.13; G.add(back);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(RIM_R + 0.02, 0.07, 16, 160), this.brass); G.add(rim);
        // number-ring bulbs (instanced emissive; they chase in round 6)
        this.bulbN = 80;
        this.bulbMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        this.bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 12, 8), this.bulbMat, this.bulbN);
        const M = new THREE.Matrix4();
        for (let i = 0; i < this.bulbN; i++) { const a = (i / this.bulbN) * TAU; M.makeTranslation(Math.cos(a) * 2.42, Math.sin(a) * 2.42, 0.06); this.bulbs.setMatrixAt(i, M); this.bulbs.setColorAt(i, new THREE.Color('#ffd28a')); }
        G.add(this.bulbs);
        this.halo = new Beacons(S, engine.time);
        for (let i = 0; i < this.bulbN; i++) { const a = (i / this.bulbN) * TAU; this.halo.add(V(Math.cos(a) * 2.42, Math.sin(a) * 2.42, 0.1), { color: '#ffd28a', size: 0.16, steady: 1 }); }
        this.halo.build(); this.halo.mat.uniforms.uScale.value = 1100;
        S.remove(this.halo.points); G.add(this.halo.points);
        // the Ring of Fire: brass pipe on the treble with gas jets
        const pipe = new THREE.Mesh(new THREE.TorusGeometry(FLAME_R, 0.026, 12, 200), this.brass); pipe.position.z = 0.035; G.add(pipe);
        this.flames = new Flames(S, engine.time, 80);
        this.jets = [];
        for (let i = 0; i < 60; i++) {
            const a = (i / 60) * TAU;
            this.jets.push(this.flames.add({ p: V(Math.cos(a) * FLAME_R, BOARD_Y + Math.sin(a) * FLAME_R, 0.07), w: 0.06, h: 0.09, seed: i * 0.137, intensity: 0.7 }));
        }
        this.flames.flush();
        // the parade: a rail and gondola ducks riding it clockwise
        const rail = new THREE.Mesh(new THREE.TorusGeometry(PARADE_R - 0.03, 0.014, 8, 200), this.brass); rail.position.z = 0.05; G.add(rail);
        // two LODs of the parade: the detailed one only when the lens is close (bed, bull, fire shots)
        this.paradeNear = rubberDuckInstances(PARADE_N, { variant: 'A', lod: 1 });
        this.paradeFar = rubberDuckInstances(PARADE_N, { variant: 'A', lod: 2 });
        for (const m of [this.paradeNear, this.paradeFar]) { m.castShadow = false; G.add(m); }
        this.parade = this.paradeFar;
        this.paradeT = 0; this.paradeSpeed = 0.035; // radians per second
        this._o = new THREE.Object3D();
        // the bull: brass boss + ledge with two tin prize ducks back to back
        const boss = new THREE.Mesh(new THREE.CylinderGeometry(RADII.outerBull * MM, RADII.outerBull * MM * 1.05, 0.12, 48).rotateX(Math.PI / 2), this.brass); boss.position.z = 0.06; G.add(boss);
        const ledge = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.035, 0.32), this.brass); ledge.position.set(0, 0.015, 0.22); G.add(ledge);
        this.tin = [tinDuck({ finish: 'enamel', height: 0.38 }), tinDuck({ finish: 'gold', height: 0.38 })];
        this.tin[0].position.set(-0.26, 0.045, 0.26); this.tin[0].rotation.y = Math.PI;
        this.tin[1].position.set(0.26, 0.045, 0.26);
        for (const t of this.tin) { G.add(t); t.userData.down = 0; t.userData.want = 0; t.userData.v = 0; }
        // bed flashes: one reusable annular-sector mesh per flash
        this.flashes = [];
        this.flashMat = () => new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff2b0'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
        this.time = 0;
        // parade knocks: per duck, seconds since it was hit (−1 = upright and untouched)
        this.knockT = new Float32Array(PARADE_N).fill(-1);
        // the Ring of Fire: a wave of ignition round the ring from the hit (fireT −1 = pilot lights only)
        this.fireT = -1; this.fireA = 0;
        this.jetA = this.jets.map((_, i) => (i / 60) * TAU);
        this.jetLevel = new Float32Array(60);
        // a real light for the fire (made up front: adding lights later recompiles every shader)
        this.fireLight = new THREE.PointLight('#ff8a3a', 0, 7, 1.8); this.fireLight.position.set(0, 0, 1.6); G.add(this.fireLight);
        this.strobeT = -1;              // double bull: every bulb flashes
        this.floaters = [];             // "+1" etc. rising off a hit
        this.fx = null;                 // set by main: embers while the ring burns
    }

    /** board-plane mm → world point on the face (z out from the face) */
    point(x, y, z = 0) { return V(x * MM, BOARD_Y + y * MM, z); }

    /** flash a bed (the 2D page's three pulses in 1.26 s); number null = the whole ring */
    flash(bed, number) {
        const [r0, r1] = BED_R[bed] || BED_R.miss;
        const a0 = number == null ? 0 : wedgeAngle(number) - SLICE / 2;
        const len = number == null ? TAU : SLICE;
        const m = new THREE.Mesh(new THREE.RingGeometry(r0 * MM, r1 * MM, number == null ? 96 : 12, 1, a0, len), this.flashMat());
        m.position.z = 0.012; m.renderOrder = 2;
        this.group.add(m);
        this.flashes.push({ m, t: 0 });
    }

    get busy() {
        return this.flashes.length > 0 || this.tin.some((t) => Math.abs(t.userData.down - t.userData.want) > 0.02 || Math.abs(t.userData.v) > 0.05)
            || this.fireT >= 0 || this.knockT.some((k) => k >= 0) || this.floaters.length > 0 || this.strobeT >= 0;
    }

    /** the parade duck nearest a board-plane angle flips back, squeaks, and springs up again further round */
    tipNearest(a) {
        let best = 0, bd = 9;
        for (let i = 0; i < PARADE_N; i++) {
            const da = Math.abs(((this.duckAngle(i) - a + Math.PI * 3) % TAU) - Math.PI);
            if (da < bd) { bd = da; best = i; }
        }
        this.knockT[best] = 0;
        return best;
    }
    duckAngle(i) { return (i / PARADE_N) * TAU + 0.08 - this.paradeT; }
    /** a parade duck's world position */
    duckPoint(i) { const a = this.duckAngle(i); return V(Math.cos(a) * PARADE_R, BOARD_Y + Math.sin(a) * PARADE_R + 0.12, 0.25); }
    /** how far over a knocked duck is, t seconds after the hit: snaps back, holds, springs up with an overshoot */
    static tip(t) {
        if (t < 0) return 0;
        if (t < 0.14) return ease(t / 0.14);
        if (t < 0.9) return 1;
        const u = t - 0.9;
        return Math.max(-0.12, Math.exp(-5 * u) * Math.cos(10 * u));
    }

    /** tin ducks: n = 1 knocks the enamel one, 2 knocks both; 0 stands them up */
    knock(n) { this.tin[0].userData.want = n >= 1 ? 1 : 0; this.tin[1].userData.want = n >= 2 ? 1 : 0; }
    /** Ring of Fire: ignite from board angle a (a wave both ways round the ring); false lets it die back */
    fire(on, a = Math.PI / 2) {
        if (on) { this.fireT = 0; this.fireA = a; }
        else if (this.fireT >= 0) this.fireT = Math.max(this.fireT, 1.7);
    }
    /** double bull: every bulb on the board strobes */
    strobe() { this.strobeT = 0; }
    /** a rising score sprite ("+1", "−2 ×2") at a world point */
    floatText(text, at, color = '#ffe28a') {
        const c = document.createElement('canvas'); c.width = 256; c.height = 128;
        const g = c.getContext('2d'); g.font = '900 96px "Avenir Next Condensed","DIN Condensed",Impact,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineWidth = 12; g.strokeStyle = 'rgba(40,10,10,0.85)'; g.strokeText(text, 128, 68); g.fillStyle = color; g.fillText(text, 128, 68);
        const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
        sp.scale.set(1.3, 0.65, 1); sp.position.copy(at); sp.renderOrder = 8;   // big enough to read from the master
        this.engine.scene.add(sp);
        this.floaters.push({ sp, t: 0, y0: at.y });
    }
    setFinal(on) { this.final = !!on; }

    /** pick the parade's LOD from the lens distance */
    lod(camera) {
        const near = camera.position.distanceTo(this.group.position) < 7.5;
        this.paradeNear.visible = near; this.paradeFar.visible = !near;
    }

    update(dt) {
        this.time += dt;
        // parade: rides clockwise; a knocked duck flips back about its base, toward the board
        this.paradeT += dt * this.paradeSpeed * (this.final ? 2.2 : 1);
        const o = this._o;
        for (let i = 0; i < PARADE_N; i++) {
            if (this.knockT[i] >= 0) { this.knockT[i] += dt; if (this.knockT[i] > 2.2) this.knockT[i] = -1; }
            const a = this.duckAngle(i), right = Math.sin(a) >= 0;
            o.position.set(Math.cos(a) * PARADE_R, Math.sin(a) * PARADE_R - 0.02, 0.1);
            o.rotation.set(-Target.tip(this.knockT[i]) * 1.35, right ? 0 : Math.PI, 0);
            // the hit duck pops (a squash-and-stretch you can see from the master)
            const kt = this.knockT[i], pop = kt >= 0 && kt < 0.5 ? Math.sin((kt / 0.5) * Math.PI) * 0.55 : 0;
            o.scale.set(0.24 * (1 + pop * 0.6), 0.24 * (1 + pop), 0.24 * (1 + pop * 0.6)); o.updateMatrix();
            this.paradeNear.setMatrixAt(i, o.matrix); this.paradeFar.setMatrixAt(i, o.matrix);
        }
        this.paradeNear.instanceMatrix.needsUpdate = this.paradeFar.instanceMatrix.needsUpdate = true;
        // tin ducks: a stiff spring on each hinge — they slam flat and bounce, and stand back up more slowly
        for (const t of this.tin) {
            const u = t.userData; u.v = u.v || 0;
            const k = u.want > u.down ? 260 : 60, d = u.want > u.down ? 14 : 12;
            u.v += ((u.want - u.down) * k - u.v * d) * dt; u.down += u.v * dt;
            if (u.down > 1) { u.down = 1; u.v = -Math.abs(u.v) * 0.35; }      // hits the ledge and bounces
            if (u.down < 0) { u.down = 0; u.v = 0; }
            t.userData.leaf.rotation.x = -u.down * 1.45;
        }
        // the Ring of Fire: each jet lights as the wave reaches it, holds, then dies back to its pilot
        let heat = 0;
        if (this.fireT >= 0) {
            this.fireT += dt;
            const T = this.fireT, fade = T < 1.7 ? 1 : Math.exp(-(T - 1.7) * 2.6);
            for (let i = 0; i < 60; i++) {
                const da = Math.abs(((this.jetA[i] - this.fireA + Math.PI * 3) % TAU) - Math.PI);
                const local = T - (da / Math.PI) * 0.42;
                this.jetLevel[i] = local < 0 ? 0 : Math.min(1, local / 0.1) * fade;
                heat += this.jetLevel[i] / 60;
                if (this.fx && this.jetLevel[i] > 0.5 && Math.random() < dt * 3) this.fx.ember(this.jets[i].p);
            }
            if (T > 1.7 && fade < 0.02) { this.fireT = -1; this.jetLevel.fill(0); heat = 0; }
        }
        for (let i = 0; i < 60; i++) {
            const R = this.jetLevel[i], f = this.jets[i];
            f.w = 0.06 + R * 0.16; f.h = 0.09 + R * (0.5 + 0.15 * Math.sin(this.time * 7 + i)); f.intensity = 0.7 + R * 0.5; this.flames.write(f);
        }
        this.flames.flush();
        this.fireLight.intensity = heat * 14 * (1 + 0.12 * Math.sin(this.time * 23) + 0.08 * Math.sin(this.time * 37));
        // bulbs: a slow twinkle; a chase in the final round; they dip while the ring burns; strobe on a double bull
        if (this.strobeT >= 0) { this.strobeT += dt; if (this.strobeT > 1.1) this.strobeT = -1; }
        const st = this.strobeT >= 0 ? (Math.sin(this.strobeT * 40) > 0 ? 2.2 : 0.3) : 1;
        const c = new THREE.Color();
        for (let i = 0; i < this.bulbN; i++) {
            const ch = this.final ? (Math.sin(i * 0.9 - this.time * 9) > 0.3 ? 1.2 : 0.35) : 0.85 + 0.15 * Math.sin(i * 2.3 + this.time * 1.7);
            c.set(this.final ? '#ffcf4a' : '#ffd28a').multiplyScalar(4.5 * ch * (1 - heat * 0.65) * st);
            this.bulbs.setColorAt(i, c);
        }
        this.bulbs.instanceColor.needsUpdate = true;
        // bed flashes: three pulses over 1.26 s, then gone
        for (let i = this.flashes.length - 1; i >= 0; i--) {
            const F = this.flashes[i]; F.t += dt;
            const u = F.t / 1.26;
            F.m.material.opacity = u >= 1 ? 0 : 0.85 * Math.pow(Math.max(0, Math.sin(u * Math.PI * 3)), 0.7);
            if (u >= 1) { this.group.remove(F.m); F.m.geometry.dispose(); F.m.material.dispose(); this.flashes.splice(i, 1); }
        }
        // score sprites rise and fade
        for (let i = this.floaters.length - 1; i >= 0; i--) {
            const F = this.floaters[i]; F.t += dt;
            const u = F.t / 1.3;
            F.sp.position.y = F.y0 + easeOut(u) * 0.6; F.sp.material.opacity = u < 0.15 ? u / 0.15 : 1 - Math.max(0, (u - 0.6) / 0.4);
            if (u >= 1) { this.engine.scene.remove(F.sp); F.sp.material.map.dispose(); F.sp.material.dispose(); this.floaters.splice(i, 1); }
        }
    }
}
