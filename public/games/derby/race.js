// The race: turns the host's Derby state into runners on the course and tells the camera, effects and graphics
// what just happened. The host owns the rules; this only reads gameData and reconstructs the scene from it, so a
// reconnecting TV simply snaps every horse to its mark.
import * as THREE from 'three';
import { Runner } from './horse.js';
import { FINISH, RAIL_Z, TICK } from './course.js';

const PALETTE = ['#8FD91B', '#2BA4FF', '#FF7A18', '#B44AFF', '#FF2E55', '#F0C400', '#00C97B', '#E1008C'];
export const playerColor = (i) => ((window.FC_PLAYER_COLORS && window.FC_PLAYER_COLORS[i % 8]) || PALETTE[i % 8]);
export const SECONDARY = ['#f6f2e8', '#0f1a33', '#f6f2e8', '#f6f2e8', '#0f1a33', '#0f1a33', '#f6f2e8', '#f6f2e8'];
const COAT_ORDER = [0, 1, 4, 2, 3, 5];

export class Race {
    constructor({ engine, course, fx, director, hud }) {
        Object.assign(this, { engine, course, fx, director, hud });
        this.runners = []; this.byId = new Map();
        this.gd = null; this.phaseKey = null; this.phase = { type: 'none' };
        this.timeScale = 1; this.slowmo = 0; this.flashT = 0;
        this.focus = null; this.focusUntil = 0; this.clock = 0;
        this.photo = null; this.celebrating = false; this.fireT = 0;
        this.excite = 0;
        this._v = new THREE.Vector3();
    }

    laneZ(i, n) {
        const sp = Math.min(3.1, 17 / Math.max(n, 1));
        return (i - (n - 1) / 2) * sp;
    }

    rebuild(gd) {
        for (const r of this.runners) { this.engine.scene.remove(r.group); r.dispose(); }
        this.runners = []; this.byId.clear();
        const n = gd.players.length;
        gd.players.forEach((p, i) => {
            const r = new Runner({ color: playerColor(i), number: p.targetNumber, coatIndex: COAT_ORDER[i % COAT_ORDER.length], silkIndex: i, secondary: SECONDARY[i % 8] });
            r.pid = p.id; r.idx = i; r.name = p.name; r.number = p.targetNumber; r.score = p.score || 0;
            r.setPlace((p.score || 0) * TICK, this.laneZ(i, n), true);
            r.onStride = (run, leg) => { run.footWorld(leg, this._v); this.fx.turfKick(this._v, run.vx); };
            this.engine.scene.add(r.group);
            this.runners.push(r); this.byId.set(p.id, r);
        });
        this.course.buildStalls(this.runners.map((r) => r.z));
        this.signature = this.sig(gd);
    }

    sig(gd) { return gd.players.map((p) => `${p.id}:${p.targetNumber}`).join('|'); }

    /** a fresh state from the host */
    sync(gd) {
        const first = !this.gd;
        if (first || this.sig(gd) !== this.signature) this.rebuild(gd);
        const moves = [];
        gd.players.forEach((p, i) => {
            const r = this.byId.get(p.id); if (!r) return;
            r.name = p.name; r.finished = !!p.finished; r.active = i === gd.activeIdx;
            const s = Math.max(0, Math.min(9, p.score || 0));
            if (s !== r.score) { moves.push({ r, from: r.score, to: s }); r.score = s; }
            r.setPlace(s * TICK, r.z, first);
        });
        this.gd = gd;
        const ph = gd.phase || { type: 'playing' };
        const key = `${ph.type}-${ph.startedAt}`;
        const phaseChanged = key !== this.phaseKey;
        this.phaseKey = key; this.phase = ph;
        if (!first) for (const m of moves) this.onMove(m, ph);
        if (phaseChanged) this.onPhase(ph, gd, first);
        this.hud.sync(gd, this);
    }

    onMove({ r, from, to }, ph) {
        if (to > from) {
            this.fx.surge(new THREE.Vector3(r.x, 0, r.z), r.color);
            if (to >= 9) {
                // heading for the line: cut to the photo-finish angle and let it cross in slow motion
                this.photo = { r, armed: true };
                this.director.set('chase', { runner: r }, true);
                this.focus = r; this.focusUntil = Infinity;
            } else if (ph.type === 'mult_boost') {
                this.director.set('charge', { runner: r, anchorX: to * TICK + 6 }, true);
                this.focus = r; this.focusUntil = Infinity;
            } else {
                this.director.set('chase', { runner: r });
                this.focus = r; this.focusUntil = Infinity;
            }
            this.excite = Math.max(this.excite, 0.6 + (to - from) * 0.15);
        } else {
            r.knock();
            this.fx.dustBurst(new THREE.Vector3(r.x + 0.5, 0, r.z), 22);
            this.director.set('knock', { runner: r }, true);
            this.director.shake = 0.8;
            this.focus = r; this.focusUntil = Infinity;
            this.excite = Math.max(this.excite, 0.45);
        }
    }

    activeRunner() { return this.gd ? this.runners[this.gd.activeIdx] : null; }

    onPhase(ph, gd, first) {
        const d = ph.data || {};
        this.hud.phase(ph, gd, this);
        this.course.led.text = null;
        for (const r of this.runners) { r.celebrate = 0; r.highlight = 0; }
        switch (ph.type) {
            case 'round_announce':
                this.director.set('crane', {}, true);
                break;
            case 'intermission': {
                const r = this.runners[d.nextPlayerIndex ?? gd.activeIdx];
                if (r) { r.highlight = 1; this.director.set('hero', { runner: r }, true); }
                break;
            }
            case 'past_post': {
                const r = this.byId.get(d.playerId);
                if (r && !(this.photo && this.photo.armed)) this.director.set('pastpost', { runner: r }, true);
                if (r) { this.fx.cannons(FINISH, [r.color.getStyle(), '#ffd45e', '#ffffff']); this.excite = 1; }
                this.course.led.text = 'PAST THE POST';
                break;
            }
            case 'winner':
            case 'draw': {
                const ids = ph.type === 'draw' ? (d.contenders || []).map((c) => c.id || c.playerId) : [d.winnerId || d.playerId];
                let rs = ids.map((id) => this.byId.get(id)).filter(Boolean);
                if (!rs.length) rs = this.leaders();
                rs.forEach((r) => { r.celebrate = 1; r.highlight = 1; });
                this.director.set('winner', { runners: rs }, true);
                this.celebrating = true; this.fireT = 0;
                const c = rs[0] ? rs[0].color.getStyle() : '#ffd45e';
                this.fx.confettiColors = ['#ffd45e', '#ffffff', c, '#ffb43a'];
                if (rs[0]) this.fx.confetti(new THREE.Vector3(rs[0].x, 0, rs[0].z), 500, this.fx.confettiColors);
                this.course.led.text = ph.type === 'draw' ? 'DEAD HEAT' : 'WINNER';
                this.excite = 1;
                break;
            }
            case 'mult_boost':
            case 'mult_knock':
                // the move that came with this state already chose the shot
                break;
            default:
                this.celebrating = false;
                if (first) this.director.set('field', { runner: this.activeRunner() }, true);
        }
        if (ph.type !== 'winner' && ph.type !== 'draw') this.celebrating = false;
    }

    leaders() {
        const best = Math.max(...this.runners.map((r) => r.score));
        return this.runners.filter((r) => r.score === best);
    }

    update(rawDt) {
        // slow motion when a horse crosses the line
        let target = 1;
        if (this.photo && this.photo.armed) {
            const r = this.photo.r, dist = FINISH - r.x;
            if (dist < 34 && this.director.shot.name !== 'photo') this.director.set('photo', { runner: r }, true);
            if (dist < 5 && dist > -2.5) target = 0.38;
            if (dist <= 0.2 && !this.photo.flashed) {
                this.photo.flashed = true; this.flashT = 1; this.director.shake = 0.6;
                this.fx.flashes(60, { x0: FINISH - 40, x1: FINISH + 40, y: 14, z0: -36, z1: -50 });
            }
            if (r.mode === 'idle' && r.x >= FINISH - 0.1) {
                this.photo.armed = false;
                setTimeout(() => { if (this.phase.type === 'past_post' || this.phase.type === 'playing' || this.phase.type === 'mult_boost') this.director.set('pastpost', { runner: r }, true); }, 600);
                this.focus = r; this.focusUntil = this.clock + 2.5;
            }
        }
        this.timeScale += (target - this.timeScale) * (1 - Math.exp(-rawDt * (target < this.timeScale ? 12 : 3)));
        const dt = rawDt * this.timeScale;
        this.clock += rawDt;
        for (const r of this.runners) r.update(dt);
        // return to the field once the focused horse has stopped
        const ph = this.phase.type;
        const focusDone = this.focus && this.focus.mode === 'idle' && Math.abs(this.focus.vx) < 0.05;
        if (this.focus && focusDone && this.focusUntil === Infinity) this.focusUntil = this.clock + (ph === 'mult_boost' || ph === 'mult_knock' ? 1.6 : 0.9);
        if (this.focus && this.clock > this.focusUntil && !(this.photo && this.photo.armed)) {
            this.focus = null;
            if (ph === 'playing' || ph === 'mult_boost' || ph === 'mult_knock') this.director.set('field', { runner: this.activeRunner() });
        }
        if (!this.focus && ph === 'playing') {
            const ar = this.activeRunner();
            if (this.director.shot.name !== 'field' || this.director.shot.p.runner !== ar) this.director.set('field', { runner: ar });
        }
        for (const r of this.runners) r.highlight = Math.max(r.highlight * Math.exp(-dt * 0.0), r.active && ph === 'playing' ? 1 : 0) * (ph === 'playing' && !r.active ? 0 : 1);
        // the crowd lifts with the action and settles
        this.excite = Math.max(0, this.excite - rawDt * 0.25);
        this.course.excite.value += ((this.celebrating ? 1 : this.excite) - this.course.excite.value) * (1 - Math.exp(-rawDt * 4));
        // celebration: fireworks over the stand, flashes, confetti top-ups
        if (this.celebrating) {
            this.fireT -= rawDt;
            if (this.fireT <= 0) {
                this.fireT = 0.45 + Math.random() * 0.6;
                const cols = this.fx.confettiColors;
                this.fx.firework(new THREE.Vector3(FINISH - 70 + Math.random() * 120, 42 + Math.random() * 26, -60 - Math.random() * 30), cols[(Math.random() * cols.length) | 0]);
            }
            if (Math.random() < rawDt * 4) this.fx.flashes(6, { x0: FINISH - 70, x1: FINISH + 30, y: 14, z0: -36, z1: -52 });
            const lead = this.director.shot.p.runners && this.director.shot.p.runners[0];
            if (lead && Math.random() < rawDt * 0.6) this.fx.confetti(new THREE.Vector3(lead.x, 0, lead.z), 90, this.fx.confettiColors, 6);
        }
        this.flashT = Math.max(0, this.flashT - rawDt * 3.5);
        this.engine.flash = this.flashT * this.flashT * 0.5;
        // slow motion reads as a warmer, softer, slightly desaturated frame
        const slow = 1 - this.timeScale;
        this.engine.grade.uSat.value = 1 - slow * 0.25;
        this.engine.grade.uWarm.value = 0.35 + slow * 0.6;
        this.engine.ca = 0.6 + slow * 2.2;
        return dt;
    }
}
