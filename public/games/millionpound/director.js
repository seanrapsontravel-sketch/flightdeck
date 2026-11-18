// Cameras for the Hot Oche. Framing comes from real bounds: each shot projects its subject's points into a window
// clear of the HUD. During a question the lower third (question + answers) and the money tree (right) are keep-out
// zones, so the play window is the upper-left of the frame.
//   master   the stage from the audience: the ring, its letters, and the prize towers
//   lock     a slow push in on the ring while the answer is locked in (longer as the stakes rise)
//   reveal   a small pull back as the answer lands
//   tower    on a player's prize tower (UP NEXT)                     (p.i)
//   crane    from high in the rig down to the master (a new round)
//   winner   a slow push on the winner's tower                       (p.i)
import * as THREE from 'three';
import { ShotDirector, V } from '../lib3d/director.js';
import { BOARD_Y, R_HALO } from './common.js';
import { TOWER_H } from './towers.js';

export const PLAY = { x0: -0.8, x1: 0.56, y0: -0.16, y1: 0.8 };
const OPEN = { x0: -0.86, x1: 0.86, y0: -0.62, y1: 0.55 };

export class Director extends ShotDirector {
    constructor(camera, towers) {
        super(camera, {
            aperture: { master: 0.02, lock: 0.05, reveal: 0.04, tower: 0.1, crane: 0.02, winner: 0.08 },
            apertureDefault: 0.03, floor: 0.6,
            shake: { x: 0.06, y: 0.05, z: 0.03, roll: 0.01 },
            start: { pos: V(0, 3.4, 16), look: V(0, 3.4, 0), fov: 36, shot: 'master' },
        });
        this.towers = towers;
        this.aspect = 16 / 9;
    }
    ringPoints(m = 1) {
        const R = (R_HALO + 0.85) * m;
        return [V(-R, BOARD_Y, 0.2), V(R, BOARD_Y, 0.2), V(0, BOARD_Y - R, 0.2), V(0, BOARD_Y + R, 0.2)];
    }
    masterPoints() {
        const P = this.ringPoints();
        const n = this.towers.list.length;
        // the towers' tops and the inner edge of their plinths (the rest may run under the lower third)
        for (let i = 0; i < n; i++) { P.push(this.towers.top(i).add(V(0, 0.15, 0)), this.towers.base(i).add(V(0, 2.2, 0))); }
        return P;
    }
    fitPoints(points, dir, fov, frame) {
        const cam = this.tmpCam || (this.tmpCam = new THREE.PerspectiveCamera());
        cam.fov = fov; cam.aspect = this.aspect; cam.near = 0.05; cam.far = 2000; cam.updateProjectionMatrix();
        const n = dir.clone().normalize();
        const look = points.reduce((a, p) => a.add(p), V()).multiplyScalar(1 / points.length);
        const q = V();
        const span = (d) => {
            cam.position.copy(look).addScaledVector(n, d); cam.lookAt(look); cam.updateMatrixWorld(); cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
            let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
            for (const p of points) { q.copy(p).project(cam); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
            return { x0, x1, y0, y1 };
        };
        let d = 30;
        for (let it = 0; it < 6; it++) {
            let lo = 1, hi = 400;
            for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2, s = span(m); if (s.x1 - s.x0 <= frame.x1 - frame.x0 && s.y1 - s.y0 <= frame.y1 - frame.y0) hi = m; else lo = m; }
            d = hi;
            const s = span(d), t = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
            const ey = (s.y0 + s.y1) / 2 - (frame.y0 + frame.y1) / 2, ex = (s.x0 + s.x1) / 2 - (frame.x0 + frame.x1) / 2;
            const up = V(0, 1, 0).sub(n.clone().multiplyScalar(n.y)).normalize(), right = V().crossVectors(up, n).normalize();
            look.addScaledVector(up, ey * t * d).addScaledVector(right, ex * t * d * this.aspect);
        }
        return { pos: look.clone().addScaledVector(n, d), look };
    }
    masterLens() {
        const key = this.towers.list.length + ':' + this.aspect.toFixed(3);
        if (key !== this.masterKey) { this.masterKey = key; this.master = this.fitPoints(this.masterPoints(), V(0, 0.12, 1), 36, PLAY); }
        return this.master;
    }
    compute() {
        const s = this.shot, p = s.p, t = s.t, c = this.clock;
        switch (s.name) {
            case 'lock': {
                // a slow push in on the ring; it never leaves the play window
                const dur = p.ms ? p.ms / 1000 : 2, u = Math.min(1, t / Math.max(0.5, dur)), e = u * u * (3 - 2 * u);
                const far = this.fitPoints(this.ringPoints(1.05), V(0, 0.08, 1), 34, PLAY), near = this.fitPoints(this.ringPoints(0.82), V(0, 0.05, 1), 30, PLAY);
                return { pos: far.pos.clone().lerp(near.pos, e), look: far.look.clone().lerp(near.look, e), fov: 34 - 4 * e, k: 2.2, focusPt: V(0, BOARD_Y, 0) };
            }
            case 'reveal': {
                const w = this.fitPoints(this.ringPoints(1.12), V(0, 0.1, 1), 34, PLAY);
                return { ...w, fov: 34, k: 3, focusPt: V(0, BOARD_Y, 0) };
            }
            case 'tower': {
                const top = this.towers.top(p.i ?? 0), base = this.towers.base(p.i ?? 0);
                const P = [top.clone().add(V(-1, 0.3, 0)), top.clone().add(V(1, 0.3, 0)), base.clone().add(V(-1, 0, 0)), base.clone().add(V(1, 0, 0))];
                const w = this.fitPoints(P, V(-base.x * 0.04, 0.12, 1), 32, OPEN);
                return { ...w, fov: 32, k: 2.4, focusPt: base.clone().add(V(0, 2.5, 0)) };
            }
            case 'winner': {
                const top = this.towers.top(p.i ?? 0), base = this.towers.base(p.i ?? 0), sw = Math.sin(c * 0.15) * 0.25;
                const P = [top.clone().add(V(-1.2, 0.4, 0)), top.clone().add(V(1.2, 0.4, 0)), base.clone().add(V(-1.2, 0, 0)), base.clone().add(V(1.2, 0, 0))];
                const w = this.fitPoints(P, V(Math.sin(sw), 0.14, Math.cos(sw)), 32, OPEN);
                return { ...w, fov: 32, k: 1.2, focusPt: base.clone().add(V(0, 2.5, 0)) };
            }
            case 'crane': {
                // from high in the rig, looking down on the ring, down to the master
                const m = this.masterLens(), dur = p.dur || 2.6, u = Math.min(1, t / dur), e = 1 - Math.pow(1 - u, 3);
                const high = { pos: V(0, 13.5, 7.5), look: V(0, BOARD_Y - 1.2, 0) };
                return { pos: high.pos.clone().lerp(m.pos, e), look: high.look.clone().lerp(m.look, e), fov: 44 - 8 * e, k: 6, focusPt: V(0, BOARD_Y, 0) };
            }
        }
        const m = this.masterLens(), drift = Math.sin(c * 0.11) * 0.18;
        return { pos: m.pos.clone().add(V(drift, 0, 0)), look: m.look.clone(), fov: 36, k: 1.6, focusPt: V(0, BOARD_Y, 0) };
    }
}
export { TOWER_H };
