// Cameras for Quackshot. `master` is home: from behind the counter at a shooter's eye height, slightly raised —
// the whole target, the marquee and every station in frame. Every moment is a short excursion and the game cuts back.
// Framing comes from real bounds (lesson 6): master fits the box round the target rim, the marquee and the
// stations; the other shots aim at a subject's own bounds passed in p.
//   master   the default
//   bed      tight on where a dart sits (p.at world point)
//   bull     close on the boss and the tin ducks
//   fire     low and close across the Ring of Fire
//   station  on a player's station (intermission)                      (p.station: { group })
//   prize    follows a won duck through the air to its shelf          (p.obj: () => Object3D)
//   pool     low and close on the pool (a miss)                        (p.at)
//   round    a crane up over the awning to the fair and back down (round announce)
//   winner   a slow push on the winner's station                        (p.station)
import * as THREE from 'three';
import { ShotDirector, V } from '../lib3d/director.js';
import { BOARD_Y, RIM_R } from './common.js';

export class Director extends ShotDirector {
    constructor(camera, ctx) {
        super(camera, {
            aperture: { master: 0.09, bed: 0.28, bull: 0.25, fire: 0.22, station: 0.2, round: 0.04, winner: 0.18, prize: 0.22, pool: 0.26 },
            apertureDefault: 0.1, floor: 0.5,
            shake: { x: 0.12, y: 0.1, z: 0.06, roll: 0.02 },
            start: { pos: V(0, 2.6, 15), look: V(0, 4, 0), fov: 40, shot: 'master' },
        });
        this.ctx = ctx; // { stall, target }
        this.aspect = 16 / 9;
    }

    /** the master's subject points: target rim, marquee corners, and each station's ticket and prize shelf */
    masterPoints() {
        const P = [V(-RIM_R, BOARD_Y, 0), V(RIM_R, BOARD_Y, 0), V(0, BOARD_Y + RIM_R, 0), V(0, BOARD_Y - RIM_R, 0)];
        const mq = this.ctx.stall?.marqueeBox;
        if (mq) P.push(V(mq.min.x, mq.max.y, mq.max.z), V(mq.max.x, mq.max.y, mq.max.z), V(mq.min.x, mq.min.y, mq.max.z), V(mq.max.x, mq.min.y, mq.max.z));
        for (const s of this.ctx.stall?.stations || []) {
            const g = s.group.position;
            P.push(g.clone().add(V(-0.8, 0.85, -0.3)), g.clone().add(V(0.8, 0.85, -0.3)), g.clone().add(V(0, 0.05, 0.45)));
        }
        return P;
    }

    /**
     * Fit a lens to world points by projecting them (perspective-true: near things take more frame than far ones).
     * dir: from the subject toward the lens. frame: the NDC window the points must land in (clear of the HUD bands
     * and the title safe zone). Returns { pos, look }.
     */
    fitPoints(points, dir, fov, frame = { x0: -0.93, x1: 0.93, y0: -0.66, y1: 0.8 }) {
        const cam = this.tmpCam || (this.tmpCam = new THREE.PerspectiveCamera());
        cam.fov = fov; cam.aspect = this.aspect; cam.near = 0.05; cam.far = 1000; cam.updateProjectionMatrix();
        const n = dir.clone().normalize();
        const look = points.reduce((a, p) => a.add(p), V()).multiplyScalar(1 / points.length);
        const q = V();
        const span = (d) => {
            cam.position.copy(look).addScaledVector(n, d); cam.lookAt(look); cam.updateMatrixWorld(); cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
            let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
            for (const p of points) { q.copy(p).project(cam); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
            return { x0, x1, y0, y1 };
        };
        let d = 20;
        for (let it = 0; it < 6; it++) {
            // the nearest distance at which the points' spread fits the window
            let lo = 1, hi = 200;
            for (let k = 0; k < 28; k++) { const m = (lo + hi) / 2, s = span(m); if (s.x1 - s.x0 <= frame.x1 - frame.x0 && s.y1 - s.y0 <= frame.y1 - frame.y0) hi = m; else lo = m; }
            d = hi;
            // then slide the aim so the spread sits in the window (NDC error → world, at the subject's distance)
            const s = span(d), t = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
            const ey = (s.y0 + s.y1) / 2 - (frame.y0 + frame.y1) / 2, ex = (s.x0 + s.x1) / 2 - (frame.x0 + frame.x1) / 2;
            const up = V(0, 1, 0).sub(n.clone().multiplyScalar(n.y)).normalize(), right = V().crossVectors(up, n).normalize();
            look.addScaledVector(up, ey * t * d).addScaledVector(right, ex * t * d * this.aspect);
        }
        return { pos: look.clone().addScaledVector(n, d), look };
    }

    /** a close shot on a subject box (centre c, half-size h): sits below the title safe zone, above the HUD */
    closeOn(c, hh, hw, dir, fov) {
        const P = [c.clone().add(V(-hw, -hh, 0)), c.clone().add(V(hw, -hh, 0)), c.clone().add(V(-hw, hh, 0)), c.clone().add(V(hw, hh, 0))];
        return this.fitPoints(P, dir, fov, { x0: -0.8, x1: 0.8, y0: -0.62, y1: 0.42 });
    }

    compute() {
        const s = this.shot, p = s.p, t = s.t, c = this.clock;
        switch (s.name) {
            case 'bed': {
                const at = p.at.clone(), u = Math.min(1, t / 1.2);
                const w = this.closeOn(at.clone().add(V(0, 0.1, 0.3)), 0.5 + (1 - u) * 0.25, 0.75, V(at.x * 0.12, 0.25, 1), 34);
                return { ...w, fov: 34, k: 3, focusPt: at };
            }
            case 'bull': {
                const w = this.closeOn(V(0, BOARD_Y + 0.12, 0.3), 0.32, 0.55, V(0.25, 0.12, 1), 32);
                w.pos.x += Math.sin(c * 0.4) * 0.08;
                return { ...w, fov: 32, k: 2.6, focusPt: V(0, BOARD_Y + 0.12, 0.3) };
            }
            case 'fire': {
                const w = this.closeOn(V(0, BOARD_Y, 0.1), 1.3, 1.3, V(-0.3, -0.12, 1), 36);
                return { ...w, fov: 36, k: 2.4 };
            }
            case 'station': {
                const g = p.station?.group; if (!g) break;
                const w = this.closeOn(g.position.clone().add(V(0, 0.45, -0.3)), 0.5, 0.9, V(0.35, 0.32, 1), 34);
                return { ...w, fov: 34, k: 2.2, focusPt: w.look };
            }
            case 'winner': {
                const g = p.station?.group; if (!g) break;
                const a = Math.sin(c * 0.12) * 0.35;
                const w = this.closeOn(g.position.clone().add(V(0, 0.5, -0.35)), 0.55, 0.85, V(Math.sin(a), 0.38, Math.cos(a)), 34);
                return { ...w, fov: 34, k: 1.2, focusPt: w.look };
            }
            case 'prize': {
                // follow the won duck through the air to its shelf
                const obj = p.obj && p.obj(); if (!obj) break;
                const at = obj.position.clone();
                const w = this.closeOn(at, 0.55, 0.95, V(0.25, 0.3, 1), 38);
                return { ...w, fov: 38, k: 4.5, focusPt: at };
            }
            case 'pool': {
                const at = p.at.clone();
                const w = this.closeOn(at.clone().add(V(0, 0.35, 0)), 0.55, 1.2, V(0.2, 0.42, 1), 34);
                return { ...w, fov: 34, k: 3, focusPt: at };
            }
            case 'round': {
                // a crane: up from the master over the awning to look out across the fair, then back down to the target
                const m = this.masterLens();
                const u = Math.min(1, t / 2.7), arc = Math.sin(u * Math.PI), e = arc * arc * (3 - 2 * arc);
                const pos = m.pos.clone().lerp(V(3 + Math.sin(c * 0.2) * 1.5, 16, 23), e);
                const look = m.look.clone().lerp(V(-8, 9, -42), e);
                return { pos, look, fov: 40 + e * 8, k: 3.2 };
            }
        }
        const m = this.masterLens();
        return { pos: m.pos.clone(), look: m.look.clone(), fov: 40, k: 1.8 };
    }
    /** master: from behind the counter, every subject point projected inside the frame between the HUD bands */
    masterLens() {
        const key = (this.ctx.stall?.stations || []).length + ':' + this.aspect.toFixed(3);
        if (key !== this.masterKey) { this.masterKey = key; this.master = this.fitPoints(this.masterPoints(), V(0, 0.1, 1), 40); }
        return this.master;
    }
}
