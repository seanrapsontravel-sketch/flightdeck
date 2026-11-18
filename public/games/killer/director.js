// Cameras for Killer. `master` (the whole board readable from across a bar) is home: every moment is a short
// excursion from it and the game cuts back. Shots take their subject from the state (whose wedge, which agent,
// where the dart landed), never from a dart index.
//   master  overhead from the audience side, the whole board and every agent
//   agent   low on the active agent with the board behind      (p.agent)
//   dartcam rides in behind the dart to its bed                 (p.at: world point)
//   wedge   tight over one wedge's bands                        (p.n: number)
//   strike  from behind the killer's agent toward the victim    (p.from, p.to: agents)
//   death   low on the shattering agent                         (p.agent)
//   orbit   a slow orbit round an agent (became killer, winner) (p.agent, p.r, p.h)
//   round   a high pull-back over the whole room
import * as THREE from 'three';
import { ShotDirector, V } from '../lib3d/director.js';
import { wedgeAngle } from '../lib3d/kit/darts.js';
import { BOARD_R, MM } from './common.js';

export class Director extends ShotDirector {
    constructor(camera, ctx) {
        super(camera, {
            fallback: { agent: 'master', strike: 'master', death: 'wedge', orbit: 'master' },
            aperture: { master: 0, round: 0.015, agent: 0.22, dartcam: 0.3, wedge: 0.16, strike: 0.2, death: 0.26, orbit: 0.2 },
            apertureDefault: 0.1,
            floor: 0.35,
            shake: { x: 0.25, y: 0.2, z: 0.12, roll: 0.04 },
            start: { pos: V(0, 14, 11), look: V(0, 0, -0.4), fov: 38, shot: 'master' },
        });
        this.ctx = ctx; // { agents, active }
        this.aspect = 16 / 9;
    }
    /** agents other than the subject, as cylinders */
    occluders(p) {
        const skip = new Set([p.agent, p.from, p.to].filter(Boolean));
        return (this.ctx.agents || []).filter((a) => !skip.has(a) && !a.out).map((a) => ({ x: a.group.position.x, z: a.group.position.z, r: 0.45, top: 1.9 }));
    }
    compute() {
        const s = this.shot, p = s.p, t = s.t, c = this.clock;
        const narrow = this.aspect < 1.5 ? 1.18 : 1; // a 4:3 TV needs a little more height
        switch (s.name) {
            case 'round': {
                // a high pull-back under the coffers (the ceiling is at 15 m): the whole board, the glass and the city beyond
                const u = Math.min(1, t / 3);
                return { pos: V(Math.sin(c * 0.05) * 1.5, 12.6 + u * 1.2, 11.5 + u * 1.2), look: V(0, 0.5, -3.2), fov: 50 * narrow, k: 1.2 };
            }
            case 'agent': {
                const A = p.agent; if (!A) break;
                const out = A.inward.clone().negate();
                const side = V(-out.z, 0, out.x);
                // behind and beside the agent, the board stretching away past them
                const pos = A.group.position.clone().addScaledVector(out, 3.8).addScaledVector(side, 2.2).add(V(0, 2.5, 0));
                const look = A.group.position.clone().addScaledVector(A.inward, 2.6).add(V(0, 0.7, 0));
                return { pos, look, fov: 42, k: 2.4, focusPt: A.mid };
            }
            case 'dartcam': {
                // from the board's side of the dart, looking out along its wedge: the victim stands behind it
                const at = p.at.clone();
                const out = V(at.x, 0, at.z); if (out.lengthSq() < 0.01) out.set(0, 0, -1); out.normalize();
                const u = Math.min(1, t / 0.6);
                const pos = at.clone().addScaledVector(out, -(2.4 + (1 - u) * 2.5)).add(V(0, 1.3 + (1 - u) * 2.2, 0));
                return { pos, look: at.clone().addScaledVector(out, 0.9).add(V(0, 0.5, 0)), fov: 38, k: 4, focusPt: at };
            }
            case 'wedge': {
                const a = wedgeAngle(p.n), mid = V(Math.cos(a), 0, -Math.sin(a)).multiplyScalar(95 * MM);
                const dir = V(Math.cos(a), 0, -Math.sin(a));
                // look down the wedge from just outside the ring, a little to one side
                const pos = dir.clone().multiplyScalar(BOARD_R + 1.6).add(V(0, 4.4, 0)).add(V(-dir.z, 0, dir.x).multiplyScalar(2.4));
                return { pos, look: mid.add(V(0, 0.1, 0)), fov: 42, k: 2.5 };
            }
            case 'strike': {
                const F = p.from, T = p.to; if (!F || !T) break;
                const d = T.group.position.clone().sub(F.group.position).setY(0).normalize();
                const pos = F.group.position.clone().addScaledVector(d, -2.2).add(V(0, 2.4, 0)).addScaledVector(V(-d.z, 0, d.x), 0.8);
                const look = T.group.position.clone().lerp(V(0, 0, 0), 0.25).add(V(0, 0.6, 0));
                return { pos, look, fov: 42, k: 2.2, focusPt: T.mid };
            }
            case 'death': {
                const A = p.agent; if (!A) break;
                const out = A.inward.clone().negate(), side = V(-out.z, 0, out.x);
                const pos = A.group.position.clone().addScaledVector(A.inward, 4.2).addScaledVector(side, 1.8 + t * 0.2).add(V(0, 1.7, 0));
                return { pos, look: A.group.position.clone().add(V(0, 0.8, 0)), fov: 40, k: 3, focusPt: A.mid };
            }
            case 'orbit': {
                const A = p.agent; if (!A) break;
                const r = p.r ?? 5.4, h = p.h ?? 2.4;
                const base = Math.atan2(-A.inward.z, -A.inward.x) + Math.PI; // start inside the board looking out at it
                const ang = base + (p.from ?? 0) + t * (p.speed ?? 0.32);
                const cen = A.group.position.clone();
                const pos = cen.clone().add(V(Math.cos(ang) * r, h + A.lift, Math.sin(ang) * r));
                return { pos, look: cen.clone().add(V(0, 1.55 + A.lift, 0)), fov: 38, k: 2.6, focusPt: A.mid };
            }
        }
        // master: overhead from the audience side; a slow breathing drift, never enough to lose a wedge off frame
        const drift = Math.sin(c * 0.11) * 0.35;
        const tight = p.tight ? 0.9 : 1;
        // (the coffers are at 14.5 m: a wider lens rather than a higher camera, so six agents clear the HUD)
        return { pos: V(drift, 13.6 * tight, 9.3 * tight), look: V(drift * 0.3, 0, 0.05), fov: 45 * narrow, k: 1.6 };
    }
}
