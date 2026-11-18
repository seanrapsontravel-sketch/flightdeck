// Limbo's camera shots, on lib3d's ShotDirector (damping, focus, trauma shake, occlusion fallback, clearance).
// ctx: { ball, rig, totems, active (index), beach }. Shots tighten with heat: the lower the bar, the closer and lower
// the lens. The lagoon and the horizon always fall into bokeh behind the subject.
import * as THREE from 'three';
import { ShotDirector, V, ease, noise1 } from '../lib3d/director.js';
import { DECK_Y, POST_X, sandH } from './common.js';

const FALLBACK = { gap: 'rig', low: 'rig', flames: 'rig', totem: 'wide', limbo: 'rig', rig: 'wide', burn: 'rig', out: 'wide', winner: 'wide' };
const APERTURE = { establish: 0.25, wide: 0.32, rig: 0.6, low: 0.75, gap: 1.6, flames: 1.4, totem: 1.0, limbo: 0.5, burn: 0.7, out: 0.8, winner: 0.6 };

export class Director extends ShotDirector {
    constructor(camera, ctx) {
        super(camera, {
            fallback: FALLBACK, aperture: APERTURE, apertureDefault: 0.4, floor: 0.35,
            clearance: { r: 1.6, lift: 1.2, items: () => ctx.beach.props },
            start: { pos: V(0, 4, 20), look: V(0, 4, 0), fov: 40, shot: 'wide' },
        });
        this.ctx = ctx;
    }

    /** the rig's posts and the palm trunks block shots (the subject's own totem is skipped) */
    occluders(p) {
        const out = [];
        for (const s of [-1, 1]) out.push({ x: s * POST_X, z: 0, r: 0.75, top: 99 });
        for (const P of this.ctx.beach.palms) out.push({ x: P.base.x, z: P.base.z, r: 0.45, top: P.top.y });
        const subj = p.totem;
        this.ctx.totems.forEach((T) => { if (T !== subj) out.push({ x: T.group.position.x, z: T.group.position.z, r: 0.75, top: T.group.position.y + 3.4 }); });
        return out;
    }

    /** the lens never goes into the sand */
    avoid(p) { const g = sandH(p.x, p.z) + 0.35; if (p.y < g) p.y = g; }

    compute() {
        const s = this.shot, p = s.p, t = s.t, c = this.clock, C = this.ctx;
        const B = C.ball, R = C.rig, heat = R.heat;
        const hand = V(noise1(c * 0.5) * 0.08, noise1(c * 0.43 + 9) * 0.05, noise1(c * 0.37 + 3) * 0.07);
        // (a ball flying in above the bar mustn't drag the framing up: the subject is the space under the bar)
        const by = Math.min(B.pos.y, R.y), ry = R.y, mid = (by + ry) * 0.5;
        switch (s.name) {
            case 'establish': {
                // slow crane along the beach: high and wide over the sand, descending and pushing in toward the rig
                const u = ease(Math.min(t, 7) / 7);
                return { pos: V(-17 + u * 9, 9.5 - u * 5, 24 - u * 8), look: V(-1.5 + u * 1.5, 4.2 - u * 0.6, -2), fov: 40 - u * 4, k: 3 };
            }
            case 'wide':
                return { pos: V(0.8, 3.6, 18.5).add(hand), look: V(0, 4.2, -2), fov: 42, k: 2 };
            case 'rig': {
                // the whole bar and ball, centred; tighter and lower as the bar comes down
                const d = 12.5 - heat * 4.5, y = THREE.MathUtils.lerp(4.4, mid + 0.4, 0.4 + heat * 0.5);
                return { pos: V(0.6 + Math.sin(t * 0.1) * 0.6, y, d).add(hand), look: V(0, THREE.MathUtils.lerp(4.5, mid, 0.55 + heat * 0.4), 0), fov: 40 - heat * 6, k: 2.4, focusPt: V(0, mid, 0) };
            }
            case 'low': {
                // at deck level, off-axis, looking up at the flames
                // from the sand in front of the deck, between the step torches (they frame it as bokeh), pushing in with heat
                const z = 7.6 - heat * 2.4 - Math.min(t, 10) * 0.05;
                return { pos: V(1.1, sandH(1.1, z) + 0.45, z).add(hand.multiplyScalar(0.5)), look: V(-0.1, THREE.MathUtils.lerp(ry - 0.6, mid, 0.35), 0), fov: 46 - heat * 6, k: 2.6, focusPt: V(0, mid, 0) };
            }
            case 'gap': {
                // tight on the space between the top of the ball and the burning bar
                const g = Math.max(0.2, ry - by);
                return { pos: V(1.7 - t * 0.04, mid + 0.1, 3.4 + g * 0.6).add(hand.multiplyScalar(0.4)), look: V(0.15, mid, 0), fov: 30 + Math.min(14, g * 4), k: 3.2, focusPt: V(0, mid, 0) };
            }
            case 'flames': {
                return { pos: V(2.3, ry + 0.2, 2.4).add(hand.multiplyScalar(0.3)), look: V(0.6, ry + 0.45, 0), fov: 36, k: 3, focusPt: V(1.0, ry + 0.4, 0) };
            }
            case 'totem': {
                const T = p.totem || C.totems[C.active ?? 0];
                const g = T.group, a = 0.25 - t * 0.03;
                const pos = V(Math.sin(a) * 5.4, 2.1 - t * 0.04, Math.cos(a) * 5.4).applyMatrix4(g.matrixWorld);
                return { pos: pos.add(hand), look: V(0, 2.95, 0).applyMatrix4(g.matrixWorld), fov: 42, k: 2.6, focusPt: T.head };
            }
            case 'burn': {
                // close and a little low, off-axis: the ball meets the fire
                return { pos: V(2.2 - t * 0.1, ry - 1.2, 5.2 - t * 0.2).add(hand), look: V(0, ry - 0.3, 0), fov: 40, k: 4, focusPt: V(0, ry - 0.2, 0) };
            }
            case 'out': {
                // on the losing totem, wide enough to see it fall onto the sand
                const T = p.totem || C.totems[C.active ?? 0], g = T.group;
                const pos = V(-2.4, 2.2, 6.4).applyMatrix4(g.matrixWorld);
                return { pos: pos.add(hand), look: V(1.0, 1.1, 0).applyMatrix4(g.matrixWorld), fov: 44, k: 2.4, focusPt: T.head };
            }
            case 'winner': {
                // a slow, low orbit across the front of the winner's totem (its own frame), looking up at it against the sky
                const T = p.totem || C.totems[C.active ?? 0], g = T.group, a = -0.4 + Math.sin(t * 0.12) * 0.45;
                const pos = V(Math.sin(a) * 6.2, 1.4, Math.cos(a) * 6.2).applyMatrix4(g.matrixWorld);
                return { pos, look: V(0, 3.1, 0).applyMatrix4(g.matrixWorld), fov: 44, k: 1.6, focusPt: T.head };
            }
            case 'limbo': {
                // the reverse angle, from out over the lagoon looking back at the lit beach: the ball comes under the
                // burning bar toward the lens and splashes down in front of it
                const bz = B.pos.z, u = Math.min(t, 3) / 3;
                return { pos: V(3.4 - u * 0.6, 1.55 + u * 0.15, -11.2 + u * 0.4).add(hand), look: V(0.2, THREE.MathUtils.lerp(2.6, 1.6, ease(u)), Math.min(-1, bz - 0.5)), fov: 40, k: 2.4, focusPt: B.visible ? B.pos.clone() : V(0, 1, -6.5) };
            }
        }
        return { pos: this.pos.clone(), look: this.look.clone(), fov: this.fov, k: 2 };
    }
}
