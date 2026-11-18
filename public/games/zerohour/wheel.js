// The wheel (docs/plans/ZERO-HOUR.md §7.3): a standard single-zero wheel — 37 equal pockets in the European order
// (rules.mjs WHEEL_ORDER), red / black / a green zero — in a walnut bowl with a brass turret, an ivory ball.
//
// The spin is a TIMELINE, not physics: for a spin of duration T landing in pocket P, the rotor's angle θ(t) and the
// ball's angle and radius are closed-form functions of t, solved so the ball rests in P at t = T. So the result can
// never depend on frame rate, and a TV that joins mid-spin jumps straight to the right moment. Angles: β = atan2(−z, x)
// about the wheel's centre (counter-clockwise from above); rotor.rotation.y = θ adds θ to every rotor point's β.
// Each pocket's rim glows in the colour of whoever leads that number on the table (the engine's cells[].leader).
import * as THREE from 'three';
import { V, WHEEL_C, WHEEL_R, GOLD, IVORY, canvasTex, DISPLAY_FONT, clamp01, ease, hash01 } from './common.js';
import { WHEEL_ORDER, POCKETS, pocketColor } from './rules.mjs';

const TAU = Math.PI * 2, STEP = TAU / POCKETS;
// radii (m) and heights above the felt
const R_TRACK = 0.316, R_APRON = 0.252, R_NUM_OUT = 0.248, R_NUM_IN = 0.212, R_POCKET = 0.19, R_CONE = 0.165;
const Y_TRACK = 0.07, Y_ROTOR = 0.032, BALL_R = 0.0085;
/** a pocket's centre angle in the rotor frame */
export const pocketAngle = (n) => WHEEL_ORDER.indexOf(n) * STEP;

function rotorTexture() {
    const S = 2048, c = S / 2, k = c / R_NUM_OUT; // canvas px per metre at the rim
    return canvasTex(S, S, (g) => {
        g.clearRect(0, 0, S, S);
        for (let i = 0; i < POCKETS; i++) {
            const n = WHEEL_ORDER[i], col = pocketColor(n);
            const a0 = i * STEP - STEP / 2, a1 = a0 + STEP;
            // canvas angles run clockwise (y down): a math angle a is −a on the canvas
            const fill = col === 'red' ? '#a3101f' : col === 'black' ? '#121212' : '#0b7a3e';
            g.fillStyle = fill;
            g.beginPath(); g.arc(c, c, R_NUM_OUT * k, -a0, -a1, true); g.arc(c, c, R_CONE * k, -a1, -a0, false); g.closePath(); g.fill();
            // the pocket floor darker than the number band
            g.fillStyle = 'rgba(0,0,0,0.35)';
            g.beginPath(); g.arc(c, c, R_NUM_IN * k, -a0, -a1, true); g.arc(c, c, R_CONE * k, -a1, -a0, false); g.closePath(); g.fill();
            // the number, upright when read from outside the wheel
            const am = i * STEP, rn = (R_NUM_OUT + R_NUM_IN) / 2 * k;
            g.save(); g.translate(c + Math.cos(am) * rn, c - Math.sin(am) * rn); g.rotate(-am + Math.PI / 2);
            g.fillStyle = IVORY; g.font = `700 ${Math.round(0.022 * k)}px ${DISPLAY_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
            g.fillText(String(n), 0, 0); g.restore();
        }
        // gold rules between the number band and the pockets, and round the rim
        g.strokeStyle = GOLD; g.lineWidth = 0.002 * k;
        for (const r of [R_NUM_OUT - 0.001, R_NUM_IN]) { g.beginPath(); g.arc(c, c, r * k, 0, TAU); g.stroke(); }
    });
}

export class Wheel {
    constructor(scene) {
        this.scene = scene;
        const root = (this.root = new THREE.Group());
        root.position.copy(WHEEL_C);
        scene.add(root);
        const walnut = new THREE.MeshStandardMaterial({ color: '#4d2a17', roughness: 0.26, metalness: 0 });
        const brass = (this.brass = new THREE.MeshStandardMaterial({ color: '#c99a45', roughness: 0.2, metalness: 1 }));
        // the bowl: outer wall, rim, the vertical ball track, the sloped apron down to the rotor
        const prof = [[WHEEL_R + 0.03, 0], [WHEEL_R + 0.03, 0.03], [WHEEL_R + 0.012, Y_TRACK + 0.012], [WHEEL_R, Y_TRACK + 0.016], [R_TRACK + 0.006, Y_TRACK + 0.016],
            [R_TRACK, Y_TRACK + 0.008], [R_TRACK, Y_TRACK - 0.006], [R_TRACK - 0.012, Y_TRACK - 0.012], [R_APRON, Y_ROTOR + 0.012], [R_APRON - 0.002, Y_ROTOR + 0.004]]
            .map(([x, y]) => new THREE.Vector2(x, y));
        const bowl = new THREE.Mesh(new THREE.LatheGeometry(prof, 96), walnut);
        bowl.castShadow = true; bowl.receiveShadow = true; root.add(bowl);
        // a brass ring at the rim and eight diamond deflectors on the apron
        const ring = new THREE.Mesh(new THREE.TorusGeometry(WHEEL_R + 0.006, 0.0035, 8, 128).rotateX(Math.PI / 2), brass);
        ring.position.y = Y_TRACK + 0.017; root.add(ring);
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * TAU + STEP / 2, d = new THREE.Mesh(new THREE.OctahedronGeometry(0.009), brass);
            d.scale.set(1.6, 0.5, 0.8); d.position.set(Math.cos(a) * (R_TRACK - 0.03), Y_ROTOR + 0.03, -Math.sin(a) * (R_TRACK - 0.03)); d.rotation.y = a;
            root.add(d);
        }
        // the rotor: the pocket ring, frets, the cone and the turret
        const rotor = (this.rotor = new THREE.Group());
        root.add(rotor);
        const tex = rotorTexture();
        const pockets = new THREE.Mesh(new THREE.RingGeometry(R_CONE, R_NUM_OUT, 148, 1).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.35 }));
        // RingGeometry's UVs are planar over [-R_NUM_OUT, R_NUM_OUT]: the texture square spans the same, so radii match
        pockets.position.y = Y_ROTOR; pockets.receiveShadow = true; rotor.add(pockets);
        const fretGeo = new THREE.BoxGeometry(R_NUM_IN - R_CONE + 0.004, 0.009, 0.0016).translate((R_NUM_IN + R_CONE) / 2, Y_ROTOR + 0.0045, 0);
        const frets = new THREE.InstancedMesh(fretGeo, brass, POCKETS);
        const M = new THREE.Matrix4();
        for (let i = 0; i < POCKETS; i++) { M.makeRotationY(i * STEP + STEP / 2); frets.setMatrixAt(i, M); }
        frets.castShadow = true; rotor.add(frets);
        const cone = new THREE.Mesh(new THREE.LatheGeometry([[R_CONE + 0.002, Y_ROTOR], [R_CONE - 0.004, Y_ROTOR + 0.006], [0.07, Y_ROTOR + 0.03], [0.03, Y_ROTOR + 0.04], [0, Y_ROTOR + 0.041]].map(([x, y]) => new THREE.Vector2(x, y)), 96), walnut);
        cone.castShadow = true; rotor.add(cone);
        const turret = new THREE.Group(); turret.position.y = Y_ROTOR + 0.04; rotor.add(turret);
        const post = new THREE.Mesh(new THREE.LatheGeometry([[0.012, 0], [0.009, 0.03], [0.006, 0.05], [0.012, 0.058], [0, 0.068]].map(([x, y]) => new THREE.Vector2(x, y)), 32), brass);
        turret.add(post);
        for (let i = 0; i < 4; i++) {
            const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.07, 12).rotateZ(Math.PI / 2).translate(0.035, 0.03, 0), brass);
            arm.rotation.y = (i * Math.PI) / 2; turret.add(arm);
            const knob = new THREE.Mesh(new THREE.SphereGeometry(0.008, 16, 12), brass);
            knob.position.set(Math.cos((i * Math.PI) / 2) * 0.072, 0.03, -Math.sin((i * Math.PI) / 2) * 0.072); turret.add(knob);
        }
        // the leader glow on each pocket's number band
        this.glows = [];
        const gTex = canvasTex(64, 64, (g, w, h) => { const grd = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2); grd.addColorStop(0, '#fff'); grd.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = grd; g.fillRect(0, 0, w, h); }, { srgb: false });
        for (let i = 0; i < POCKETS; i++) {
            const m = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.03).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#fff', alphaMap: gTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
            const a = i * STEP;
            m.position.set(Math.cos(a) * (R_NUM_OUT + 0.006), Y_ROTOR + 0.002, -Math.sin(a) * (R_NUM_OUT + 0.006));
            m.renderOrder = 4; rotor.add(m); this.glows.push({ m, color: null, boost: 0 });
        }
        // the ball
        this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 32, 24), new THREE.MeshPhysicalMaterial({ color: '#f4efe4', roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 }));
        this.ball.castShadow = true; root.add(this.ball);
        this.theta = 0; this.idleT = 0;
        this.plan = null;            // { segments: [{ start, dur, pocket, seed }], endAt }
        this.restPocket = 0;         // where the ball sits when idle
        this.mapLevel = 0.35;
        this.setBall(R_POCKET, pocketAngle(0), Y_ROTOR + BALL_R);
        this.state = 'idle';
    }

    /** pocket rim glows: colors[pocket] = '#rrggbb' | null */
    setLeaders(colors) {
        for (let i = 0; i < POCKETS; i++) {
            const n = WHEEL_ORDER[i], g = this.glows[i], c = colors[n] || null;
            g.color = c; if (c) g.m.material.color.set(c);
        }
    }
    setMap(on) { this.mapLevel = on ? 1 : 0.35; }
    flashPocket(n, k = 1) { const g = this.glows[WHEEL_ORDER.indexOf(n)]; if (g) g.boost = Math.max(g.boost, k); }

    /**
     * plan the spin(s) for a `spin` phase: draws = every pocket the ball will drop into (empty ones first), durations
     * as the server's. The first spin starts after `pre`; each re-spin follows the one before.
     */
    planSpin(draws, durations, spinKey = 'spin') {
        const segs = [];
        let at = durations.pre / 1000;
        draws.forEach((pocket, i) => {
            const dur = (i === 0 ? durations.spin : durations.respin) / 1000;
            segs.push({ start: at, dur, pocket, seed: hash01(spinKey + ':' + i) });
            at += dur;
        });
        this.plan = { segments: segs, endAt: at };
        return this.plan;
    }
    clearPlan(restPocket = null) { this.plan = null; if (restPocket != null) this.restPocket = restPocket; }

    /** the spin's state at time t (s since the spin phase began): what's happening, and which segment */
    at(t) {
        const P = this.plan;
        if (!P) return { mode: 'idle' };
        if (t < P.segments[0].start) return { mode: 'pre' };
        for (let i = 0; i < P.segments.length; i++) {
            const s = P.segments[i];
            if (t < s.start + s.dur) return { mode: 'spin', i, seg: s, u: (t - s.start) / s.dur };
        }
        return { mode: 'done', i: P.segments.length - 1, seg: P.segments[P.segments.length - 1] };
    }

    /**
     * the closed-form spin. Rotor: θ(τ) = θ0 + ω τ (1 − 0.3 τ / T). Ball: on the track, decelerating against the rotor
     * until τ1 = 0.7 T; then down the apron into the pockets, its rotor-frame angle easing (with two bounces) onto
     * the pocket; from τ2 = 0.9 T it rides in the pocket.
     */
    pose(seg, tau) {
        const T = seg.dur, s = seg.seed;
        const omega = 1.1 + 0.3 * s; // rad/s
        const theta = (th) => s * TAU + omega * th * (1 - (0.3 * th) / T);
        const t1 = 0.7 * T, t2 = 0.9 * T;
        const travel = -(9 + 3 * s) * TAU; // the ball's total world travel on the track (clockwise)
        const phi0 = s * 7.3;
        const trackPhi = (th) => phi0 + travel * (1 - Math.pow(1 - clamp01(th / t1), 2.2));
        const psiEnd = pocketAngle(seg.pocket);
        const th = Math.min(tau, T);
        const rot = theta(th);
        if (th <= t1) return { rot, r: R_TRACK - BALL_R - 0.001, phi: trackPhi(th), y: Y_TRACK - 0.002, rolling: true };
        // rotor-frame angle at t1, and a target ψ for the pocket that keeps the ball moving clockwise relative to the rotor
        const psi1 = trackPhi(t1) - theta(t1);
        let target = psiEnd;
        while (target > psi1 - 0.6 * TAU) target -= TAU;
        while (target < psi1 - 1.6 * TAU) target += TAU;
        if (th >= t2) return { rot, r: R_POCKET, phi: rot + psiEnd, y: Y_ROTOR + BALL_R, settled: true };
        const v = (th - t1) / (t2 - t1);
        const bounce = Math.sin(v * Math.PI * 3) * Math.exp(-v * 3) * 0.12 * (1 - v);
        const psi = psi1 + (target - psi1) * ease(v) + bounce;
        // the radius drops off the track, skitters over the apron (a hop on two diamonds) and into the pocket
        const r = R_TRACK - BALL_R - (R_TRACK - BALL_R - R_POCKET) * ease(Math.min(1, v * 1.4));
        const hop = Math.abs(Math.sin(v * Math.PI * 2.5)) * 0.012 * (1 - v);
        const yBase = r > R_APRON ? Y_TRACK - 0.002 - (Y_TRACK - Y_ROTOR - 0.015) * clamp01((R_TRACK - r) / (R_TRACK - R_APRON)) : Y_ROTOR + BALL_R;
        return { rot, r, phi: rot + psi, y: yBase + hop, bouncing: true };
    }

    setBall(r, phi, y) { this.ball.position.set(Math.cos(phi) * r, y, -Math.sin(phi) * r); }

    /** drive the wheel to time t of the spin phase (seconds), or idle-turn if no plan */
    update(dt, t = null) {
        let lit = null;
        if (this.plan && t != null) {
            const st = this.at(t);
            if (st.mode === 'pre') {
                // turn slowly into the first spin's start angle, so the rotor never jumps when the spin begins
                const s0 = this.plan.segments[0];
                this.theta = s0.seed * TAU - 0.15 * (s0.start - t); this.rotor.rotation.y = this.theta;
                this.setBall(R_POCKET, this.theta + pocketAngle(this.restPocket), Y_ROTOR + BALL_R);
                this.state = 'pre';
            } else {
                const seg = st.seg, tau = st.mode === 'done' ? seg.dur : t - seg.start;
                const p = this.pose(seg, tau);
                this.rotor.rotation.y = this.theta = p.rot;
                this.setBall(p.r, p.phi, p.y);
                this.state = p.settled ? 'settled' : p.rolling ? 'rolling' : 'dropping';
                this.ballSeg = st.i;
                if (!p.settled) lit = this.pocketUnderBall();
            }
        } else {
            this.theta += dt * 0.15; this.rotor.rotation.y = this.theta;
            this.setBall(R_POCKET, this.theta + pocketAngle(this.restPocket), Y_ROTOR + BALL_R);
            this.state = 'idle';
        }
        for (let i = 0; i < POCKETS; i++) {
            const g = this.glows[i];
            g.boost = Math.max(0, g.boost - dt * 3);
            if (lit === WHEEL_ORDER[i] && g.color) g.boost = Math.max(g.boost, 0.8);
            g.m.material.opacity = g.color ? Math.min(1, this.mapLevel * 0.75 + g.boost) : 0;
            g.m.visible = g.m.material.opacity > 0.01;
        }
    }

    /** the pocket the ball is over right now, from the actual ball and rotor positions (the nothing-lies check) */
    pocketUnderBall() {
        const b = this.ball.position, phi = Math.atan2(-b.z, b.x);
        let psi = (phi - this.rotor.rotation.y) % TAU; if (psi < 0) psi += TAU;
        return WHEEL_ORDER[Math.round(psi / STEP) % POCKETS];
    }
    /** the ball's world position (for the ball camera) */
    ballWorld() { return this.ball.getWorldPosition(new THREE.Vector3()); }
    centre() { return V(WHEEL_C.x, WHEEL_C.y + Y_ROTOR, WHEEL_C.z); }
}
