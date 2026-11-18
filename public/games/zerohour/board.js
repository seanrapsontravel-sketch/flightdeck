// The dartboard on the salon wall (docs/plans/ZERO-HOUR.md §6): a regulation board in a gilt frame, its two hot
// wedges glowing gold for the round (zh.hot — dartboard numbers 10–20, so they live on the board and the HUD only;
// the table runs to 36), and darts stuck in the exact bed the server scored (kit darts.js dartPosition).
import * as THREE from 'three';
import { RADII, SLICE, WHEEL as BOARD_ORDER, wedgeAngle, dartPosition } from '../lib3d/kit/darts.js';
import { V, BOARD_C, BOARD_R, GOLD, GOLD_HOT, canvasTex, DISPLAY_FONT, clamp01, easeOut, hash01 } from './common.js';

const K = BOARD_R / RADII.doubleOut;        // board mm → metres
const R_NUM = BOARD_R * 1.17, R_SURROUND = BOARD_R * 1.34;
export const FLIGHT_S = 0.32;

function boardTexture() {
    const S = 2048, c = S / 2, k = c / R_SURROUND; // px per metre
    return canvasTex(S, S, (g) => {
        g.fillStyle = '#111'; g.beginPath(); g.arc(c, c, R_SURROUND * k, 0, Math.PI * 2); g.fill();
        const ring = (r0, r1, a0, a1, col) => { g.fillStyle = col; g.beginPath(); g.arc(c, c, r1 * k, -a0, -a1, true); g.arc(c, c, r0 * k, -a1, -a0, false); g.closePath(); g.fill(); };
        BOARD_ORDER.forEach((n, i) => {
            const a = wedgeAngle(n), a0 = a - SLICE / 2, a1 = a + SLICE / 2, even = i % 2 === 0;
            const single = even ? '#141210' : '#e9dcc0', bed = even ? '#b3141c' : '#1a7a3c';
            ring(RADII.outerBull * K, RADII.trebleIn * K, a0, a1, single);
            ring(RADII.trebleIn * K, RADII.trebleOut * K, a0, a1, bed);
            ring(RADII.trebleOut * K, RADII.doubleIn * K, a0, a1, single);
            ring(RADII.doubleIn * K, RADII.doubleOut * K, a0, a1, bed);
            // the numbers in the surround
            g.save(); g.translate(c + Math.cos(a) * R_NUM * k, c - Math.sin(a) * R_NUM * k); g.rotate(-a + Math.PI / 2);
            g.fillStyle = '#efe6d2'; g.font = `700 ${Math.round(0.034 * k)}px ${DISPLAY_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
            g.fillText(String(n), 0, 0); g.restore();
        });
        g.fillStyle = '#1a7a3c'; g.beginPath(); g.arc(c, c, RADII.outerBull * K * k, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#b3141c'; g.beginPath(); g.arc(c, c, RADII.bull * K * k, 0, Math.PI * 2); g.fill();
        // the wires
        g.strokeStyle = 'rgba(210,210,215,0.75)'; g.lineWidth = 0.0012 * k;
        for (const r of [RADII.bull, RADII.outerBull, RADII.trebleIn, RADII.trebleOut, RADII.doubleIn, RADII.doubleOut]) { g.beginPath(); g.arc(c, c, r * K * k, 0, Math.PI * 2); g.stroke(); }
        for (let i = 0; i < 20; i++) {
            const a = Math.PI / 2 - i * SLICE + SLICE / 2;
            g.beginPath(); g.moveTo(c + Math.cos(a) * RADII.outerBull * K * k, c - Math.sin(a) * RADII.outerBull * K * k);
            g.lineTo(c + Math.cos(a) * RADII.doubleOut * K * k, c - Math.sin(a) * RADII.doubleOut * K * k); g.stroke();
        }
    });
}

function dartGeometry() {
    const tip = new THREE.ConeGeometry(0.018, 0.2, 10).rotateX(Math.PI).translate(0, 0.1, 0);
    const barrel = new THREE.CylinderGeometry(0.05, 0.042, 0.36, 18, 6).translate(0, 0.38, 0);
    const shaft = new THREE.CylinderGeometry(0.016, 0.02, 0.36, 10).translate(0, 0.74, 0);
    const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(0.11, 0.06); s.lineTo(0.13, 0.26); s.lineTo(0, 0.3); s.closePath();
    const flights = [0, 1, 2].map((i) => new THREE.ShapeGeometry(s).translate(0.012, 0.88, 0).rotateY((i * Math.PI * 2) / 3));
    // a real dart is ~15 cm; these are drawn at 0.13 scale of Shanghai's 1.2 m stage dart
    return { tip, barrel, shaft, flights };
}

export class Board {
    constructor(scene) {
        this.scene = scene;
        const g = (this.root = new THREE.Group());
        g.position.copy(BOARD_C);
        scene.add(g);
        const face = new THREE.Mesh(new THREE.CircleGeometry(R_SURROUND, 128), new THREE.MeshStandardMaterial({ map: boardTexture(), roughness: 0.85 }));
        face.receiveShadow = true; g.add(face);
        const gilt = new THREE.MeshStandardMaterial({ color: '#c99a45', roughness: 0.25, metalness: 1 });
        const frame = new THREE.Mesh(new THREE.TorusGeometry(R_SURROUND + 0.012, 0.014, 16, 128), gilt);
        frame.castShadow = true; g.add(frame);
        const back = new THREE.Mesh(new THREE.CircleGeometry(R_SURROUND + 0.06, 64), new THREE.MeshStandardMaterial({ color: '#2a140c', roughness: 0.5 }));
        back.position.z = -0.012; g.add(back);
        // the hot wedges: a gold overlay over each number's beds, lit for the round's hot numbers
        this.wedges = {};
        for (const n of BOARD_ORDER) {
            const a = wedgeAngle(n);
            const m = new THREE.Mesh(new THREE.RingGeometry(RADII.outerBull * K, RADII.doubleOut * K, 8, 1, a - SLICE / 2, SLICE),
                new THREE.MeshBasicMaterial({ color: GOLD_HOT, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
            m.position.z = 0.002; m.renderOrder = 2; g.add(m);
            // the number in the surround gets a gold disc behind it
            const tag = new THREE.Mesh(new THREE.CircleGeometry(0.024, 32), new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
            tag.position.set(Math.cos(a) * R_NUM, Math.sin(a) * R_NUM, 0.003); g.add(tag);
            this.wedges[n] = { m, tag, on: 0, target: 0, flare: 0 };
        }
        this.hot = [];
        this.geo = dartGeometry();
        this.steel = new THREE.MeshStandardMaterial({ color: '#cfd3d8', metalness: 1, roughness: 0.18 });
        this.brass = new THREE.MeshStandardMaterial({ color: '#b98a3e', metalness: 1, roughness: 0.28 });
        this.shaftMat = new THREE.MeshStandardMaterial({ color: '#141416', metalness: 0.4, roughness: 0.35 });
        this.darts = [];
        this.time = 0;
    }

    /**
     * The porthole: a second camera on the board renders into a target every frame; a gilt-ringed disc pinned to the
     * top of the main camera's view shows it. So the master can hold the whole table while every dart, and the hot
     * wedges, stay on screen. Rendered before the main pass (engine.prePasses), skipped while the porthole is hidden.
     */
    makeInset(engine) {
        const rt = new THREE.WebGLRenderTarget(768, 768, { type: THREE.HalfFloatType, samples: 4 });
        const cam = new THREE.PerspectiveCamera(25, 1, 0.05, 12);
        cam.layers.set(2); // only the board, its darts, the wall and the lights (main.js sets the layers)
        cam.position.copy(BOARD_C).add(V(0, 0, 1.05)); cam.lookAt(BOARD_C);
        const g = new THREE.Group();
        const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 96), new THREE.MeshBasicMaterial({ map: rt.texture, depthTest: false, depthWrite: false }));
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.05, 16, 128), new THREE.MeshStandardMaterial({ color: '#c99a45', metalness: 1, roughness: 0.28, depthTest: false, depthWrite: false, emissive: new THREE.Color('#3a2408'), emissiveIntensity: 0.6 }));
        const bead = new THREE.Mesh(new THREE.TorusGeometry(1.09, 0.018, 8, 128), ring.material);
        const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.16, 64), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.55, depthTest: false, depthWrite: false }));
        shadow.position.set(0.02, -0.04, -0.01);
        [shadow, disc, ring, bead].forEach((m, i) => { m.renderOrder = 20 + i; m.frustumCulled = false; g.add(m); });
        engine.camera.add(g);
        engine.scene.add(engine.camera);
        this.inset = { rt, cam, g, on: 1, target: 1, pulse: 0 };
        engine.prePasses.push((E) => {
            if (!g.visible) return;
            const r = E.renderer, au = r.shadowMap.autoUpdate;
            g.visible = false; r.shadowMap.autoUpdate = false;
            r.setRenderTarget(rt); r.render(E.scene, cam); r.setRenderTarget(null);
            r.shadowMap.autoUpdate = au; g.visible = true;
        });
        this.engine = engine;
    }
    setInset(on) { if (this.inset) this.inset.target = on ? 1 : 0; }
    pulseInset() { if (this.inset) this.inset.pulse = 1; }
    /** keep the porthole at the top centre of the main camera's view (call after the camera moves) */
    placeInset(dt) {
        const I = this.inset; if (!I) return;
        I.on += (I.target - I.on) * (1 - Math.exp(-dt * 6));
        I.pulse = Math.max(0, I.pulse - dt * 1.4);
        const c = this.engine.camera, d = 0.6, h = d * Math.tan((c.fov * Math.PI) / 360);
        const r = h * 0.27 * (1 + 0.12 * Math.sin(Math.min(1, 1 - I.pulse) * Math.PI) * (I.pulse > 0 ? 1 : 0));
        I.g.position.set(0, h - r * 1.18 - h * 0.035 + (1 - I.on) * r * 3, -d);
        I.g.scale.setScalar(r * Math.max(0.001, I.on));
        I.g.visible = I.on > 0.02;
    }

    setHot(nums) {
        this.hot = nums.slice();
        for (const n of BOARD_ORDER) this.wedges[n].target = nums.includes(n) ? 1 : 0;
    }
    flare(n) { const w = this.wedges[n]; if (w) w.flare = 1.4; }

    /** board-local mm → world */
    world(x, y, z = 0) { return this.root.localToWorld(V(x * K, y * K, z)); }

    /** throw a dart in: t = lastThrow (number, multiplier, sector, miss); key seeds where in the bed it sits */
    throwIn(t, key, color, { onImpact, instant = false } = {}) {
        let i = 0;
        const rnd = () => hash01(key + ':' + (i++));
        const spec = t ? { number: t.number === 'bull' ? 'bull' : t.number, multiplier: t.multiplier, sector: t.sector || null, miss: !!t.miss || t.number == null } : { miss: true };
        const pos = dartPosition(spec, rnd);
        const g = new THREE.Group();
        const fm = new THREE.MeshStandardMaterial({ color, emissive: new THREE.Color(color), emissiveIntensity: 0.5, roughness: 0.45, side: THREE.DoubleSide, transparent: true });
        [new THREE.Mesh(this.geo.tip, this.steel), new THREE.Mesh(this.geo.barrel, this.brass), new THREE.Mesh(this.geo.shaft, this.shaftMat), ...this.geo.flights.map((f) => new THREE.Mesh(f, fm))]
            .forEach((m) => { m.castShadow = true; g.add(m); });
        g.scale.setScalar(0.13);
        g.traverse((o) => o.layers.enable(2));
        this.root.add(g);
        const at = V(pos.x * K, pos.y * K, 0.003);
        const out = V((hash01(key + 'x') - 0.5) * 0.25, 0.12 + (hash01(key + 'y') - 0.5) * 0.1, 1).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), out);
        const from = V(0.25 - hash01(key) * 0.5, -0.3, 1.6);
        const rec = { g, fm, at, q, from, pos, phase: instant ? 'stuck' : 'fly', t: 0, onImpact, wob: 0 };
        if (instant) { g.position.copy(at); g.quaternion.copy(q); }
        this.darts.push(rec);
        return rec;
    }
    clear(instant = false) { for (const r of this.darts) if (r.phase !== 'leave') { r.phase = 'leave'; r.t = instant ? 9 : 0; } }
    get shown() { return this.darts.filter((r) => r.phase !== 'leave'); }
    get busy() { return this.darts.some((r) => r.phase === 'fly' || (r.phase === 'leave' && r.t < 0.5)); }
    centre() { return this.root.getWorldPosition(V()); }

    update(dt) {
        this.time += dt;
        for (const n of BOARD_ORDER) {
            const w = this.wedges[n];
            w.on += (w.target - w.on) * (1 - Math.exp(-dt * 4));
            w.flare = Math.max(0, w.flare - dt * 1.8);
            const pulse = 0.82 + 0.18 * Math.sin(this.time * 2.4 + n);
            w.m.material.opacity = Math.min(1, w.on * 0.5 * pulse + w.flare * 0.5);
            w.tag.material.opacity = Math.min(1, w.on * 0.85 + w.flare * 0.4);
            w.m.visible = w.m.material.opacity > 0.005; w.tag.visible = w.tag.material.opacity > 0.005;
        }
        for (let i = this.darts.length - 1; i >= 0; i--) {
            const r = this.darts[i], g = r.g;
            r.t += dt;
            if (r.phase === 'fly') {
                const u = clamp01(r.t / FLIGHT_S);
                const p = r.from.clone().lerp(r.at, u); p.y += Math.sin(u * Math.PI) * 0.25;
                g.position.copy(p);
                const back = r.from.clone().sub(r.at).normalize();
                g.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), back)).slerp(r.q, u * u);
                if (u >= 1) { r.phase = 'stuck'; r.wob = 1; r.t = 0; if (r.onImpact) r.onImpact(r); }
            } else if (r.phase === 'stuck') {
                r.wob = Math.max(0, r.wob - dt * 2.6);
                const w = Math.sin(r.t * 38) * r.wob * r.wob * 0.09;
                g.position.copy(r.at);
                g.quaternion.copy(r.q).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(w, 0, w * 0.6)));
            } else {
                const u = clamp01(r.t / 0.5);
                g.position.copy(r.at).add(V(0, 0, easeOut(u) * 0.25));
                r.fm.opacity = 1 - u;
                if (u >= 1) { this.root.remove(g); r.fm.dispose(); this.darts.splice(i, 1); }
            }
        }
    }
}
