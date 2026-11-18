// Attacks: what happens to a tower when a dart lands. Each one is anticipation → impact → hit-stop → shake →
// settle. The blocks removed are always the top n in build order (the tower is laid out from the score); the attack
// only decides how they leave: which way they fly, how hard, with what dust and sparks.
import * as THREE from 'three';
import { FLOOR_H, CELL } from './blocks.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** hand the top n blocks of a tower to physics; velocity(i, pos) decides how each one leaves */
export function releaseTop(tower, world, n, velocity) {
    const p = V(), q = new THREE.Quaternion(), s = V(), c = new THREE.Color();
    const from = tower.standing, to = Math.max(0, from - n), out = [];
    for (let i = from - 1; i >= to; i--) {
        tower.blockWorld(i, p, q, s);
        tower.mesh.getColorAt(i, c);
        const { v, w } = velocity(i, p);
        out.push(world.add({ p, q, v, w, s, color: c, seed: -(1 + i + tower.index * 1000) }));
    }
    tower.setStanding(to);
    return out;
}

// ---------------------------------------------------------------- wrecking ball (singles)
// The ball waits cocked out beside the tower on a tag line, so a dart gets an instant reaction: a short wind-back,
// the tag line lets go, the ball drops through its arc and smashes the top blocks off. The crane's main cable is
// winched so its hook block hangs a fixed CHAIN length above the impact point and the ball swings on that chain:
// the same ~0.6 s swing and ~20 m/s hit at any height (a long cable would make it a 60 m/s blur).
const SWING_K = 8, COCK = 1.12, CHAIN = 6.5;

export class Wrecker {
    constructor({ crane, rig, world, fx, feel, director }) {
        Object.assign(this, { crane, rig, world, fx, feel, director });
        this.tower = null;
        this.state = 'idle'; this.t = 0;
        this.theta = COCK; this.omega = 0;
        this.L = 12; this.e = V(1, 0, 0); this.zOff = 0; this.impactY = 8;
        this.hook = V(); this.trolley = V(); this.pos = V(); this.prev = V(); this.vel = V();
        this.kin = { p: V(), v: V(), r: rig.R * 0.98, active: false };
        world.kinematic.push(this.kin);
        this.n = 0; this.hit = false; this.onImpact = null;
    }

    get ready() { return this.state === 'idle'; }
    /** a swing is on its way to this tower and hasn't landed yet */
    pending(T) { return this.tower === T && (this.state === 'wind' || (this.state === 'swing' && !this.hit)); }

    /** park the ball beside a tower (the crane slews over); planned for a hit of n blocks */
    serve(tower, n = 8, snap = false) {
        this.tower = tower;
        this.plan(n);
        const P = this.pivotWorld();
        this.crane.aimAt(P.x, P.z, snap);
    }

    /** where the n blocks to go are: impact height, which side (+x local face), how far along it */
    plan(n) {
        const T = this.tower, L = T.layout, top = T.standing;
        if (top <= 0) { this.n = 0; this.impactY = 1.2; this.zOff = 0; this.hw = 2.8; return; } // empty plinth: hang at its edge
        n = Math.max(1, Math.min(n, top));
        this.n = n;
        let y = 0, z = 0, hw = 0;
        for (let i = top - n; i < top; i++) { const b = L.blocks[i]; y += b.y; z += b.z; }
        y /= n; z /= n;
        const topB = L.blocks[top - 1], F = L.floors[topB.floor];
        hw = (F.cols * CELL * F.s) / 2;
        // aim at the upper part of what's going so the ball takes the lot
        this.impactY = Math.max(y, topB.y - FLOOR_H * 0.3);
        this.zOff = THREE.MathUtils.clamp(z, -(F.rows * CELL * F.s) / 2 + 0.4, (F.rows * CELL * F.s) / 2 - 0.4);
        this.hw = hw;
    }

    pivotWorld() {
        const T = this.tower;
        const local = V(this.hw + this.rig.R * 0.72, 0, this.zOff);
        const w = local.applyMatrix4(T.group.matrixWorld);
        this.e.set(1, 0, 0).transformDirection(T.group.matrixWorld).setY(0).normalize();
        return w;
    }

    strike(n, onImpact) {
        if (!this.tower || this.state !== 'idle') return false;
        this.serve(this.tower, n);
        this.state = 'wind'; this.t = 0; this.hit = false; this.onImpact = onImpact;
        return true;
    }

    ballAt(theta, out) {
        return out.copy(this.hook).addScaledVector(this.e, Math.sin(theta) * this.L).setY(this.hook.y - Math.cos(theta) * this.L);
    }

    tagPoint(out) {
        // tie-off on the jib right above the cocked ball
        const jibDir = V(Math.cos(this.crane.slewAngle), 0, -Math.sin(this.crane.slewAngle));
        const rel = this.ballAt(COCK, V()).sub(this.crane.root.position);
        const r = THREE.MathUtils.clamp(rel.dot(jibDir), 2, this.crane.jib);
        return out.copy(this.crane.root.position).addScaledVector(jibDir, r).setY(this.crane.mast + 0.7);
    }

    blocked(B) {
        // any point on the ball's leading face inside a standing block?
        const T = this.tower, lead = this.omega < 0 ? -1 : 1;
        for (const [a, b] of [[0, 0], [0.5, 0.4], [0.5, -0.4], [-0.3, 0.6], [-0.3, -0.6]]) {
            const p = V(B.x, B.y + a * this.rig.R, B.z).addScaledVector(this.e, lead * this.rig.R * 0.95);
            const side = V(-this.e.z, 0, this.e.x);
            p.addScaledVector(side, b * this.rig.R);
            if (T.solidAt(p, {})) return true;
        }
        return false;
    }

    update(dt) {
        if (!this.tower) return;
        this.crane.hookWorld(this.trolley);
        this.L = Math.min(CHAIN, this.trolley.y - 1.2 - this.impactY);
        this.hook.copy(this.trolley).setY(this.impactY + this.L);
        this.t += dt;
        const s = this.state;
        let tagTo = null;
        if (s === 'idle') {
            // re-plan for a typical hit so the cocked ball tracks the tower top as it drops
            if (this.t > 0.1) this.plan(Math.min(8, this.tower.standing || 1));
            this.theta = COCK + Math.sin(this.t * 1.3) * 0.012;
            this.omega = 0;
            tagTo = this.tagPoint(V()); this.rig.tagOn = 1;
        } else if (s === 'wind') {
            // anticipation: the tag line hauls the ball back a little further, then lets go
            const u = Math.min(1, this.t / 0.22);
            this.theta = COCK + 0.1 * Math.sin(u * Math.PI * 0.5);
            tagTo = this.tagPoint(V());
            if (u >= 1) { this.state = 'swing'; this.t = 0; this.omega = 0; this.rig.tagOn = 0; }
        } else {
            // free pendulum
            const sub = 4, h = dt / sub;
            for (let i = 0; i < sub; i++) {
                this.omega += -SWING_K * Math.sin(this.theta) * h;
                this.omega *= s === 'swing' ? 1 : Math.exp(-0.9 * h);
                this.theta += this.omega * h;
                const B = this.ballAt(this.theta, V());
                if (s === 'swing' && !this.hit && this.theta <= Math.asin(Math.min(1, (this.rig.R * 0.28) / this.L))) { this.impact(B); }
                if (this.hit && this.tower.standing > 0 && this.blocked(B)) {
                    // stopped dead by what's still standing: rebound
                    this.theta -= this.omega * h * 1.5;
                    this.omega = -this.omega * 0.22;
                    this.director && this.director.addTrauma(0.15);
                }
            }
            if (s === 'swing' && (this.hit ? this.t > 0.5 : this.t > 1.2)) { this.state = 'settle'; this.t = 0; }
            if (this.state === 'settle' && this.t > 0.55) { this.state = 'recock'; this.t = 0; this.th0 = this.theta; }
            if (this.state === 'recock') {
                const u = ease(this.t / 0.85);
                this.theta = this.th0 + (COCK - this.th0) * u; this.omega = 0;
                this.rig.tagOn = u; tagTo = u > 0.15 ? this.tagPoint(V()) : null;
                if (u >= 1) { this.state = 'idle'; this.t = 0; }
            }
        }
        this.prev.copy(this.pos);
        this.ballAt(this.theta, this.pos);
        this.vel.subVectors(this.pos, this.prev).divideScalar(Math.max(dt, 1e-4));
        this.rig.pose(this.pos, this.hook, tagTo, this.trolley);
        this.kin.p.copy(this.pos); this.kin.v.copy(this.vel);
        this.kin.active = this.state === 'swing' || this.state === 'settle';
    }

    impact(B) {
        this.hit = true;
        const T = this.tower;
        // in a game the tower's target (the score) is the truth: take exactly what it says should go by now
        const n = T.target != null ? Math.max(0, T.standing - T.target) : this.n;
        const dir = this.e.clone().negate();
        const speed = Math.abs(this.omega) * this.L;
        const ballV = dir.clone().multiplyScalar(speed);
        releaseTop(T, this.world, n, (i, p) => {
            const d = p.distanceTo(B), f = Math.exp(-d * 0.45);
            const v = ballV.clone().multiplyScalar(0.14 + 0.36 * f);
            v.x += (Math.random() - 0.5) * 2.4; v.z += (Math.random() - 0.5) * 2.4 - 0.6; v.y += 1 + Math.random() * 3.2 * f;
            const w = V((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 9).multiplyScalar(0.4 + f);
            return { v, w };
        });
        // the swing loses speed ploughing through
        this.omega *= 0.72;
        const contact = B.clone().addScaledVector(dir, this.rig.R * 0.9);
        const power = Math.min(1.6, 0.6 + n / 14);
        this.fx.impact(contact, dir, power, '#' + T.color.getHexString());
        this.feel.hitStop(0.045 + Math.min(0.045, n * 0.003));
        this.feel.flash(0.18);
        this.director && this.director.addTrauma(0.42 + Math.min(0.35, n * 0.02));
        if (this.onImpact) this.onImpact(n);
    }
}
