// Cameras for Shanghai. `master` is home: from the courtyard, slightly raised — the whole moon-gate board, the gong,
// every station, and the pagoda's tower (all eight tiers, so the lit ones count the rounds). Every moment is a short
// excursion and the game cuts back. Framing comes from real bounds (plan §1 rule 6): each shot projects its subject's
// points into a window clear of the HUD bands and the title safe zone.
//   master   the default
//   bed      on the bed a scoring dart landed in (p.at)
//   station  on a player's station (intermission)             (p.i)
//   crane    up the pagoda to tier p.tier (round announce), and back down
//   winner   a slow push on the winner's station               (p.i)
import * as THREE from 'three';
import { ShotDirector, V } from '../lib3d/director.js';
import { BOARD_Y, R_STONE } from './common.js';

export class Director extends ShotDirector {
    constructor(camera, court) {
        super(camera, {
            aperture: { master: 0.04, bed: 0.22, station: 0.18, crane: 0.03, winner: 0.16 },
            apertureDefault: 0.05, floor: 0.6,
            shake: { x: 0.1, y: 0.08, z: 0.05, roll: 0.015 },
            start: { pos: V(-1, 4.4, 21), look: V(1.6, 6.8, 0), fov: 40, shot: 'master' },
        });
        this.court = court;
        this.aspect = 16 / 9;
    }

    masterPoints() {
        const P = [V(-R_STONE, BOARD_Y, 0.3), V(R_STONE, BOARD_Y, 0.3), V(0, BOARD_Y - R_STONE, 0.3), V(0, BOARD_Y + R_STONE + 2.9, 0.6)];
        for (const s of this.court.stations) { const g = s.group.position; P.push(g.clone().add(V(-0.95, 3.4, 0)), g.clone().add(V(0.7, 0.7, 0)), g.clone().add(V(0, 0, 0.9))); }
        P.push(...this.court.pagodaPoints());
        return P;
    }

    /** fit a lens to world points by projecting them; dir: from the subject toward the lens; frame: NDC window */
    fitPoints(points, dir, fov, frame = { x0: -0.94, x1: 0.94, y0: -0.6, y1: 0.86 }) {
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
    /**
     * The master: a lens at eye height `eye` on the courtyard's centre line, tilted up as needed. For each distance it
     * solves pitch and yaw so the points' projected spread is centred in the window, and takes the nearest distance at
     * which the whole spread fits. (A plain fitPoints with a fixed direction lifts the lens instead of tilting it, and a
     * tall, far tower makes it wander.)
     */
    eyeFit(points, eye, fov, frame = { x0: -0.94, x1: 0.94, y0: -0.6, y1: 0.86 }) {
        const cam = this.tmpCam || (this.tmpCam = new THREE.PerspectiveCamera());
        cam.fov = fov; cam.aspect = this.aspect; cam.near = 0.05; cam.far = 3000; cam.updateProjectionMatrix();
        const q = V(), tv = Math.tan(THREE.MathUtils.degToRad(fov) / 2), th = tv * this.aspect;
        const zMax = Math.max(...points.map((p) => p.z));
        const aim = (cz) => {
            let pitch = 0.15, yaw = 0, s = null;
            for (let it = 0; it < 6; it++) {
                cam.position.set(0, eye, cz);
                cam.rotation.set(pitch, yaw, 0, 'YXZ'); cam.updateMatrixWorld(); cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
                let x0 = 9, x1 = -9, y0 = 9, y1 = -9, behind = false;
                for (const p of points) { q.copy(p).applyMatrix4(cam.matrixWorldInverse); if (q.z > -0.1) behind = true; q.applyMatrix4(cam.projectionMatrix); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
                s = { x0, x1, y0, y1, behind };
                pitch += Math.atan(((y0 + y1) / 2 - (frame.y0 + frame.y1) / 2) * tv) * 0.9;
                yaw -= Math.atan(((x0 + x1) / 2 - (frame.x0 + frame.x1) / 2) * th) * 0.9;
            }
            return { s, pitch, yaw };
        };
        let lo = zMax + 2, hi = 200;
        for (let k = 0; k < 30; k++) {
            const m = (lo + hi) / 2, { s } = aim(m);
            if (!s.behind && s.x1 - s.x0 <= frame.x1 - frame.x0 && s.y1 - s.y0 <= frame.y1 - frame.y0) hi = m; else lo = m;
        }
        const { pitch, yaw } = aim(hi);
        const pos = V(0, eye, hi), dir = V(0, 0, -1).applyEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
        return { pos, look: pos.clone().addScaledVector(dir, 30) };
    }
    closeOn(c, hh, hw, dir, fov) {
        const P = [c.clone().add(V(-hw, -hh, 0)), c.clone().add(V(hw, -hh, 0)), c.clone().add(V(-hw, hh, 0)), c.clone().add(V(hw, hh, 0))];
        return this.fitPoints(P, dir, fov, { x0: -0.8, x1: 0.8, y0: -0.58, y1: 0.42 });
    }

    compute() {
        const s = this.shot, p = s.p, t = s.t, c = this.clock;
        switch (s.name) {
            case 'bed': {
                const at = p.at.clone(), u = Math.min(1, t / 1.0);
                const w = this.closeOn(at.clone().add(V(0, 0.05, 0.2)), 0.55 + (1 - u) * 0.25, 0.85, V(at.x * 0.1, 0.18, 1), 34);
                return { ...w, fov: 34, k: 3.2, focusPt: at };
            }
            case 'station': {
                const a = this.court.anchor(p.i ?? 0);
                const w = this.closeOn(a.clone().add(V(-0.1, 0.4, 0)), 1.25, 1.0, V(0.3, 0.12, 1), 36);
                return { ...w, fov: 36, k: 2.4, focusPt: a };
            }
            case 'winner': {
                const a = this.court.anchor(p.i ?? 0), sw = Math.sin(c * 0.12) * 0.3;
                const w = this.closeOn(a.clone().add(V(-0.1, 0.5, 0)), 1.35, 1.1, V(Math.sin(sw), 0.16, Math.cos(sw)), 36);
                return { ...w, fov: 36, k: 1.2, focusPt: a };
            }
            case 'crane': {
                // up from the master to the tier that's lighting, a beat on it, then back down
                const m = this.masterLens(), tp = this.court.tierPoint(p.tier || 1);
                const dur = p.dur || 2.6, u = Math.min(1, t / dur), arc = Math.sin(u * Math.PI), e = arc * arc * (3 - 2 * arc);
                const close = this.fitPoints([tp.clone().add(V(-5, -2.2, 0)), tp.clone().add(V(5, -2.2, 0)), tp.clone().add(V(-5, 2.6, 0)), tp.clone().add(V(5, 2.6, 0))], V(-0.28, -0.1, 1), 30, { x0: -0.7, x1: 0.7, y0: -0.5, y1: 0.4 });
                const pos = m.pos.clone().lerp(close.pos, e), look = m.look.clone().lerp(close.look, e);
                return { pos, look, fov: 40 - e * 10, k: 4, focusPt: look };
            }
        }
        const m = this.masterLens();
        return { pos: m.pos.clone(), look: m.look.clone(), fov: 42, k: 1.8 };
    }
    masterLens() {
        const key = this.court.stations.length + ':' + this.aspect.toFixed(3);
        if (key !== this.masterKey) { this.masterKey = key; this.master = this.eyeFit(this.masterPoints(), 2.2, 42); }
        return this.master;
    }
}
