// Game: turns the host's gameData into what happens in the yard. Every state is diffed against the last one:
// a lane's score going down is a hit (the wrecking ball takes the blocks), going up is a bust (the blocks drop back
// in), and phase changes drive the cameras and the title cards.
//
// Each tower has a target (its score). The wrecking ball is only the nice way of getting there: every frame,
// any tower that isn't at its target and has no swing on its way gets put right directly, so darts arriving faster
// than the animation, busts mid-swing or a missed state can never leave a tower showing the wrong score.
import * as THREE from 'three';
import { releaseTop } from './attacks.js';
import { dartLabel } from './hud.js';

const PALETTE = ['#8FD91B', '#2BA4FF', '#FF7A18', '#B44AFF', '#FF2E55', '#F0C400', '#00C97B', '#E1008C'];
const teamColor = (i) => ((window.FC_PLAYER_COLORS && window.FC_PLAYER_COLORS[i % 8]) || PALETTE[i % 8]);
const R = (a, b) => a + Math.random() * (b - a);

export class Game {
    constructor(stage) {
        this.S = stage;
        this.key = null; this.prev = null;
        this.colors = new Map(); // team identity → colour, so playoff contenders keep theirs
        this.pips = []; this.visitKey = '';
        this.waiting = null; // a hit waiting for the ball to be ready
        this.dartN = 0; this.timers = [];
        this.flash = new THREE.Color(0, 0, 0); this.flashK = 0;
    }

    teamKey(t) { return t.map((p) => p.id ?? p.name).join('+'); }
    teamName(gd, i) {
        const t = gd.teams[i] || [];
        if (t.length <= 1) return (t[0] && t[0].name) || `Lane ${i + 1}`;
        return gd.isDoublesLineup ? t.map((p) => p.name).join(' & ') : `Team ${i + 1}`;
    }
    colorOf(gd, i) {
        const k = this.teamKey(gd.teams[i]);
        if (!this.colors.has(k)) this.colors.set(k, teamColor(this.colors.size));
        return this.colors.get(k);
    }

    sync(gd) {
        const S = this.S;
        let key = gd.teams.map((t) => this.teamKey(t)).join('|') + (gd.isPlayoff ? '#P' : '');
        // same players starting again after a winner: a new game, so a fresh yard
        if (this.prev && this.prev.phase.type === 'winner' && gd.phase.type !== 'winner') { this.gen = (this.gen || 0) + 1; }
        key += '#' + (this.gen || 0);
        if (key !== this.key) {
            // new game or playoff: (re)build the towers for whoever is in it
            if (this.key && gd.isPlayoff) { S.world.sink(); }
            if (!this.key || !gd.isPlayoff) gd.teams.forEach((_, i) => this.colorOf(gd, i));
            const list = gd.teams.map((_, i) => ({ name: this.teamName(gd, i), color: this.colorOf(gd, i) }));
            S.buildTowers(list, !!gd.isPlayoff, gd.teamScores);
            if (gd.isPlayoff) S.towers.forEach((T) => { T.setStanding(0); T.dropIn(T.target, { stagger: 0.03, height: 12 }); });
            else if (this.key) { S.world.sink(); S.towers.forEach((T) => { T.setStanding(0); T.dropIn(T.target, { stagger: 0.006, height: 10 }); }); }
            S.hud.setTeams(list.map((t, i) => ({ ...t, score: gd.teamScores[i], max: gd.isPlayoff ? 60 : 180 })));
            this.key = key; this.prev = null; this.pips = []; this.visitKey = '';
            S.director.set('establish', {}, true);
        }
        const prev = this.prev, T = S.towers;
        // scores → targets (hits and busts)
        gd.teamScores.forEach((s, i) => {
            const tw = T[i]; if (!tw) return;
            const was = tw.target;
            tw.target = s;
            if (s < was) this.hit(i, was - s);
            else if (s > was) this.restore(i);
        });
        // thrower card: pips for this visit
        const a = gd.activeTurnIndex;
        const vk = `${key}/${a}/${gd.roundInitialScores ? gd.roundInitialScores[a] : ''}`;
        if (vk !== this.visitKey && gd.dartsThrownThisTurn === 0) { this.visitKey = vk; this.pips = []; this.newVisit(a); }
        if (prev && gd.dartsThrownThisTurn > prev.dartsThrownThisTurn && gd.lastThrow) this.pips[gd.dartsThrownThisTurn - 1] = dartLabel(gd.lastThrow);
        S.ctx.active = a;
        S.hud.thrower(this.teamName(gd, a), this.colorOf(gd, a), this.pips, gd.teamScores[a]);
        // final-round banner
        if (gd.finishRoundMode && gd.phase.type === 'playing') {
            const left = gd.teams.length - a;
            S.hud.setBanner(left > 1 ? `Final chance — ${left} to throw` : 'Final chance — last to throw');
        } else S.hud.setBanner('');
        // phases
        if (!prev || prev.phase.type !== gd.phase.type || JSON.stringify(prev.phase.data) !== JSON.stringify(gd.phase.data)) this.onPhase(gd);
        this.prev = gd;
    }

    newVisit(a) {
        const S = this.S, tw = S.towers[a]; if (!tw) return;
        S.wrecker.serve(tw, 8);
        S.director.set('hero', { tower: tw }, true);
        this.later(() => { if (S.ctx.active === a && this.prev && this.prev.phase.type === 'playing') S.director.set('strike', { tower: tw, y: S.wrecker.impactY }, true); }, 1600);
    }

    hit(i, n) {
        const S = this.S, tw = S.towers[i];
        if (S.wrecker.tower === tw && S.wrecker.ready) this.swing(tw);
        else this.waiting = { tw, t: 0 };
    }
    swing(tw) {
        const S = this.S;
        const name = this.dartN++ % 2 ? 'strike2' : 'strike';
        S.wrecker.serve(tw, Math.max(1, tw.standing - tw.target));
        S.director.set(name, { tower: tw, y: S.wrecker.impactY }, true);
        S.wrecker.strike(Math.max(1, tw.standing - tw.target));
    }

    /** a bust: the blocks from this visit come back down onto the tower */
    restore(i) {
        const tw = this.S.towers[i];
        if (this.S.wrecker.pending(tw)) return; // the swing will find nothing left to take; reconcile rebuilds after
        if (tw.target > tw.standing) tw.dropIn(tw.target, { from: tw.standing, stagger: 0.035, height: 6 });
    }

    onPhase(gd) {
        const S = this.S, d = gd.phase.data || {}, type = gd.phase.type;
        const tw = S.towers[d.teamIndex ?? gd.activeTurnIndex];
        const col = d.teamIndex != null ? this.colorOf(gd, d.teamIndex) : '#f5b72c';
        switch (type) {
            case 'bust':
                S.hud.show('bust', 'Bust', `${d.teamName || ''} back to ${gd.teamScores[d.teamIndex]}`, '#ff3b4e', 2400);
                S.feel.flash(0.25); S.director.addTrauma(0.3);
                if (tw) this.later(() => S.director.set('hero', { tower: tw }, true), 500);
                break;
            case 'intermission': {
                const nt = S.towers[d.nextTeamIndex];
                S.hud.show('next', d.nextTeamName || '', 'Next up', this.colorOf(gd, d.nextTeamIndex), 2000);
                if (nt) S.wrecker.serve(nt, 8);
                S.director.set('wide', {}, true);
                break;
            }
            case 'checkout':
            case 'tvm':
                if (type === 'tvm') { this.tvmDone(); break; }
                S.hud.show('checkout', 'Checkout!', d.teamName || '', col, 2800);
                if (tw) { this.later(() => { S.director.set('checkout', { tower: tw }, true); S.fx.celebrate(tw.group.position, col); this.flashSky(col); }, 300); }
                break;
            case 'playoff':
                S.hud.show('playoff', 'Sudden death', (d.contenderNames || []).join('  v  ') + ` · from ${d.startScore || 60}`, '#ff3b4e', 2800);
                S.director.set('establish', {}, true);
                break;
            case 'winner':
                S.hud.hideThrower();
                S.hud.show('winner', d.winnerName || '', 'Winner', col, 0);
                if (tw) {
                    S.director.set('checkout', { tower: tw }, true);
                    for (let k = 0; k < 4; k++) this.later(() => { S.fx.celebrate(tw.group.position, col, 5); this.flashSky(col); }, k * 1800);
                    this.later(() => S.director.set('establish', {}, true), 5000);
                }
                break;
            case 'playing':
                S.hud.hideTitle();
                break;
        }
    }

    /** the TV-moment clip isn't built yet: tell the host we're done so the game carries on */
    tvmDone() { try { window.parent.postMessage({ type: 'TVM_COMPLETE' }, location.origin); } catch (e) { /* not in a viewer */ } }

    flashSky(color) { this.flash.set(color); this.flashK = 1; }
    later(fn, ms) { this.timers.push({ fn, t: ms / 1000 }); }

    update(dt) {
        const S = this.S;
        for (const t of this.timers) { t.t -= dt; if (t.t <= 0 && !t.done) { t.done = true; t.fn(); } }
        this.timers = this.timers.filter((t) => !t.done);
        // a hit that arrived while the ball was busy elsewhere or still recocking
        if (this.waiting) {
            const w = this.waiting; w.t += dt;
            if (w.tw.standing > w.tw.target && S.wrecker.ready && S.wrecker.tower === w.tw) { this.waiting = null; this.swing(w.tw); }
            else if (w.t > 1.0 || w.tw.standing <= w.tw.target) this.waiting = null;
        }
        // reconcile: nothing may stay off its score once no swing is coming for it
        for (const tw of S.towers) {
            if (tw.target == null || tw.anim || S.wrecker.pending(tw) || (this.waiting && this.waiting.tw === tw)) continue;
            if (tw.standing > tw.target) this.knock(tw, tw.standing - tw.target);
            else if (tw.standing < tw.target) tw.dropIn(tw.target, { from: tw.standing, stagger: 0.035, height: 6 });
        }
        // skyline + sky flood in the scoring colour, decaying
        if (this.flashK > 0) {
            this.flashK = Math.max(0, this.flashK - dt * 0.6);
            const k = this.flashK * this.flashK;
            S.yard.skylineU.uFlash.value.copy(this.flash).multiplyScalar(k);
            S.yard.skyU.uFlash.value.copy(this.flash).multiplyScalar(k * 0.15);
        }
        S.hud.setScores(S.towers.map((t) => (t.anim ? t.target : t.standing)), S.ctx.active, this.prev ? this.prev.checkedOutThisRound : []);
    }

    /** fallback when the ball can't get there in time: the top just bursts off */
    knock(tw, n) {
        const S = this.S;
        const top = new THREE.Vector3(0, tw.topY(), 0).applyMatrix4(tw.group.matrixWorld);
        releaseTop(tw, S.world, n, () => ({ v: new THREE.Vector3(R(-3, 3), R(1.5, 4.5), R(-3, 0.5)), w: new THREE.Vector3(R(-6, 6), R(-6, 6), R(-6, 6)) }));
        S.fx.impact(top, new THREE.Vector3(0, 0, 1), Math.min(1.2, 0.4 + n / 20), '#' + tw.color.getHexString());
        S.director.addTrauma(0.25);
    }
}
