// State → the Lantern Pagoda. Every gameData (host SYNC_STATE or ?demo=1) is diffed against the one before into timed
// events on the kit's StateQueue: next visit, a dart (throw-in → impact → reaction), intermission (UP NEXT), round
// announce (the crane up the pagoda as tier n lights, the sky steps darker, the live wedge moves), winner, draw.
//
// Every visit's third dart arrives in the SAME state as its takeover (intermission or round announce): the dart's
// event is queued first and held long enough to land and score, then the takeover plays. A Shanghai (single + double +
// treble of the target in one visit) arrives as dart 3 with lastThrow.shanghai and phase still `playing`; the winner
// follows ~0.9 s later.
//
// When the queue is idle the view RECONCILES to the state (nothing lies): every total and round cell in the HUD and on
// the scrolls, the active station, the visit's darts, and — while playing — the round pill, the lit tiers and the
// live wedge all equal the state.
import * as THREE from 'three';
import { StateQueue } from '../lib3d/kit/queue.js';
import { members, teamName, throwerOf } from '../lib3d/kit/roster.js';
import { roundT } from './common.js';
import { bedFor, dartText } from './beds.js';
import { FLIGHT_S } from './darts.js';
import { MAX_ROUNDS } from './hud.js';
import { CAP } from './lanterns.js';

const ended = (t) => t === 'winner' || t === 'draw';
const GOLD = '#e8b54c', RED = '#c8241c';
const PALETTE = ['#e63946', '#2a9df4', '#f4c430', '#3ddc84', '#b06cff', '#ff8a3d', '#00c9c9', '#ff4fb4'];
export const teamColor = (i) => ((typeof window !== 'undefined' && window.FC_PLAYER_COLORS && window.FC_PLAYER_COLORS[i % 8]) || PALETTE[i % 8]);

export class Game extends StateQueue {
    constructor(o) {
        super();
        Object.assign(this, o); // engine, court, sky, darts, director, hud, fx, field
        this.prev = null; this.gd = null;
        this.video = false;
        this.active = -1; this.winnerIdx = -1;
        this.shownRound = 0;
        this.log = []; this.seq = 0;
        this.visit = { i: -1, list: [] };
        this.gong = 0;
    }
    note(e, o = {}) { this.log.push({ e, n: ++this.seq, t: performance.now(), ...o }); if (this.log.length > 120) this.log.shift(); }
    onState(state) {
        this.video = state.viewerVideoEnabled === true;
        if (window.FlightDeckWinnerVideo) FlightDeckWinnerVideo.applyFromState(state);
    }

    // ------------------------------------------------------------ state in
    sync(gd) {
        if (!gd || gd.gameType !== 'shanghai' || !Array.isArray(gd.players) || !gd.players.length) return;
        const p = this.prev;
        this.gd = gd;
        const rosterChanged = !p || p.players.length !== gd.players.length || p.players.some((x, i) => x.id !== gd.players[i].id);
        const newGame = p && ended(p.phase.type) && !ended(gd.phase.type);
        if (rosterChanged || newGame) { this.setup(gd); this.prev = gd; return; }
        this.hud.setHelp(gd.helpVisible);
        const a = gd.activeIdx, t = gd.phase.type;
        const newPhase = t !== p.phase.type || gd.phase.startedAt !== p.phase.startedAt;
        const d = gd.phase.data || {};
        const turnMoved = gd.throwsThisTurn === 0 && (p.activeIdx !== a || p.throwsThisTurn > 0) && t === 'playing';
        if (turnMoved) this.push(this.evNext(gd, a));
        const isDart = !!gd.lastThrow && ((a === p.activeIdx && gd.throwsThisTurn > p.throwsThisTurn) || (a !== p.activeIdx && gd.throwsThisTurn > 0));
        const takeover = newPhase && (t === 'intermission' || t === 'round_announce');
        if (isDart) {
            this.note('state-dart', { k: gd.throwsThisTurn - 1, phase: t });
            if (a !== p.activeIdx && !turnMoved) this.push(this.evNext(gd, a, true));
            this.push(this.evDart(gd, a, gd.throwsThisTurn - 1, takeover || !!gd.lastThrow.shanghai));
        }
        if (newPhase && t === 'round_announce') this.push(this.evRound(gd, d, isDart));
        if (newPhase && t === 'intermission') this.push(this.evIntermission(gd, d, isDart));
        if (newPhase && t === 'winner') this.push(this.evWinner(gd, d));
        if (newPhase && t === 'draw') this.push(this.evDraw(gd, d));
        this.prev = gd;
    }

    setup(gd) {
        this.clearQueue();
        const players = gd.players.map((pl, i) => ({ name: teamName(gd, i), members: members(gd, i).map((m) => ({ name: m.name, avatar: m.avatar || null })), color: teamColor(i) }));
        this.court.setPlayers(players);
        this.hud.setPlayers(players);
        this.field.setPlayers(players.map((p, i) => ({ color: p.color, anchor: this.court.cloudAnchor(i) })));
        gd.players.forEach((pl, i) => this.field.set(i, pl.score || 0));
        this.fx.show(0, null);
        this.director.masterKey = null;
        this.hud.setHelp(gd.helpVisible); this.hud.setWinner(false); this.hud.hideTitle();
        this.darts.clear(true);
        this.active = -1; this.winnerIdx = -1; this.court.setWinner(-1);
        this.snap(gd);
        if (ended(gd.phase.type)) { this.push(gd.phase.type === 'winner' ? this.evWinner(gd, gd.phase.data || {}) : this.evDraw(gd, gd.phase.data || {})); return; }
        this.push(this.evNext(gd, gd.activeIdx, true));
    }
    /** scores, round cells, the round, tiers, wedge and sky exactly as the state says (no animation) */
    snap(gd) {
        this.scores(gd);
        this.setRound(gd.currentRound || 1, true);
    }
    scores(gd, upTo = null) {
        gd.players.forEach((pl, i) => {
            this.hud.setScore(i, pl.score || 0, pl.roundScores, gd.currentRound);
            this.court.setScore(i, pl.score || 0, pl.roundScores, gd.currentRound);
        });
        void upTo;
    }
    /** the round everywhere it shows: the pill, the lit tiers, the live wedge, the sky (baked only on a change) */
    setRound(r, force = false) {
        r = Math.max(1, Math.min(MAX_ROUNDS, r));
        this.hud.setRound(r);
        this.court.setTiers(r);
        this.court.gate.userData.setTarget(r);
        if (force || r !== this.shownRound) {
            this.shownRound = r; this.sky.set(roundT(r)); this.sky.bake(null); this.note('sky', { r });
            this.court.setNight(roundT(r)); this.fx.setLight(1 - 0.45 * roundT(r));
            this.fx.show(r >= MAX_ROUNDS ? 0.35 : 0, this.fwAt());
        }
    }
    /** where fireworks burst: over the pagoda */
    fwAt() { const P = this.court.pagoda.position; return new THREE.Vector3(P.x - 6, 44, P.z + 8); }
    throwFrom(i) { return this.court.anchor(i).add(new THREE.Vector3(0.2, 0.3, -0.6)); }
    cut(name, p = {}) { this.director.set(name, p, true); }
    move(name, p = {}) { this.director.set(name, p, false); }
    setActive(i) { this.active = i; this.court.setActive(i); this.hud.setActive(i); }

    // ------------------------------------------------------------ events
    evNext(gd, i, quick = false) {
        const th = throwerOf(gd, i), pl = gd.players[i];
        return {
            dur: quick ? 0.05 : 0.35,
            steps: [[0, () => {
                this.darts.clear();
                if (gd.throwsThisTurn === 0 || this.visit.i !== i) this.visit = { i, list: [] };
                this.setActive(i);
                this.hud.thrower({ name: th?.name || pl.name, team: gd.isDoublesLineup ? teamName(gd, i) : '', color: teamColor(i) });
                this.hud.setDarts(i, gd.throwsThisTurn);
                if (this.director.shot.name !== 'master') this.cut('master');
            }]],
        };
    }

    /** a dart: who threw it, what the server scored, where it sits; hold = a takeover (or the Shanghai) follows */
    evDart(gd, i, k, hold) {
        const lt = gd.lastThrow, pl = gd.players[i], color = teamColor(i);
        const key = `${pl.id}|${gd.currentRound}|${k}`;
        const b = bedFor(lt, key);
        if (this.visit.i !== i) this.visit = { i, list: [] };
        this.visit.list[k] = { lt, key, color };
        const steps = [[0, () => {
            this.note('throw', { k });
            if (this.active !== i) this.setActive(i);
            const rec = this.darts.throwIn(lt, key, color, this.throwFrom(i), {
                onImpact: () => {
                    this.note('impact', { k, bed: b.bed, hit: !!lt.hit });
                    this.hud.dart(k, dartText(lt, key), !!lt.hit);
                    this.hud.setDarts(i, k + 1);
                    this.scores(gd);
                    const m = Number(lt.multiplier) || 1;
                    if (lt.hit) {
                        // the gong rings (harder for a treble), a camera kick, the bed flashes, "+n" floats off and
                        // that many lanterns rise from the wedge to the thrower's cloud
                        this.gong = Math.min(1.6, 0.6 + 0.3 * m);
                        this.director.addTrauma(0.08 + 0.05 * m);
                        this.court.gate.userData.setGlow(3.2);
                        this.glowT = 0.6;
                        this.fx.gong(this.court.gate.userData.gong.getWorldPosition(new THREE.Vector3()), m);
                        this.fx.sparks(rec.at, undefined, 26 + 14 * m);
                        this.fx.floatText('+' + lt.points, rec.at.clone().add(new THREE.Vector3(0, 0.45, 0.4)), m === 3 ? '#ff7a4a' : '#ffd36a', m === 3 ? 1.25 : 1);
                        this.field.release(i, rec.at.clone().add(new THREE.Vector3(0, 0, 0.2)), lt.points, () => this.note('lanterns-land', { i }));
                        if (m === 3) { this.fx.firecrackers(-16, -5.2); this.fx.later(0.15, () => this.fx.firecrackers(5.2, 16)); }
                        if (lt.shanghai) {
                            // the finale: crackers the length of the wall, the gong at full, fireworks over the pagoda
                            this.fx.firecrackers(-4.4, 4.4, 10.3, 0.9, 14); this.gong = 2;
                            for (let k = 0; k < 5; k++) this.fx.later(0.2 + k * 0.25, () => this.fx.firework(this.fwAt().add(new THREE.Vector3((k - 2) * 7, (k % 2) * 5, 0))));
                        }
                        if (!lt.shanghai) this.cut('bed', { at: rec.at });
                    } else { this.director.addTrauma(0.03); this.fx.dust(rec.at); }
                },
            });
        }]];
        if (lt.hit && !lt.shanghai) steps.push([FLIGHT_S + 1.15, () => { if (this.gd.phase.type === 'playing' && this.director.shot.name === 'bed') this.move('master'); }]);
        if (lt.shanghai) steps.push([FLIGHT_S + 0.2, () => !ended(this.gd.phase.type) && this.hud.show('SHANGHAI!', `${lt.playerName || teamName(gd, i)} · single · double · treble of ${lt.targetNumber}`, { kind: 'shanghai', color: RED, ms: 1200 })]);
        return { dur: hold ? FLIGHT_S + 0.7 : FLIGHT_S + 0.08, steps };
    }

    evIntermission(gd, d, afterDart) {
        const i = d.nextPlayerIndex ?? 0;
        const dur = afterDart ? 1.55 : 2.25;
        const aim = d.targetNumber || gd.currentRound;
        return {
            dur,
            steps: [
                [0, () => {
                    this.darts.clear();
                    if (i >= 0 && i < gd.players.length) this.setActive(i);
                    this.hud.setDarts(i, 0);
                    this.hud.hideThrower();
                    this.cut('station', { i });
                    this.court.unroll(i);
                    this.hud.show('UP NEXT', `${d.nextPlayerName || teamName(gd, i)}${aim ? ' · AIM FOR ' + aim : ''}`, { kind: 'next', color: teamColor(i), ms: (dur - 0.15) * 1000 });
                }],
                [dur - 0.1, () => !ended(this.gd.phase.type) && this.cut('master')],
            ],
        };
    }

    evRound(gd, d, afterDart) {
        const r = Math.min(MAX_ROUNDS, d.round || gd.currentRound + 1), last = r >= MAX_ROUNDS;
        const dur = afterDart ? 2.15 : 2.8;
        return {
            dur,
            steps: [
                [0, () => {
                    this.darts.clear();
                    this.hud.hideThrower();
                    this.cut('crane', { tier: r, dur });
                    const sub = [d.eyebrow || 'SCROLL ROUND', `${r} OF ${d.maxRounds || MAX_ROUNDS}`, `AIM FOR ${r}`].join(' · ');
                    this.hud.show(last ? 'FINAL ROUND' : `ROUND ${r}`, sub, { kind: last ? 'final' : 'round', color: last ? RED : GOLD, ms: (dur - 0.2) * 1000 });
                }],
                // tier r lights at the top of the crane; the sky steps darker; the live wedge moves to r
                [Math.min(0.9, dur * 0.4), () => { this.setRound(r); this.court.setTiers(r, true); this.note('tier', { r }); }],
                [dur - 0.1, () => !ended(this.gd.phase.type) && this.cut('master')],
            ],
        };
    }

    evWinner(gd, d) {
        const i = gd.players.findIndex((x) => x.id === d.winnerId);
        const shanghai = d.reason === 'shanghai';
        return {
            dur: 1,
            steps: [[0, () => {
                this.darts.clear();
                this.scores(gd);
                this.setActive(i);
                this.hud.hideThrower();
                this.hud.setWinner(true);
                this.hud.show(shanghai ? 'SHANGHAI!' : 'CHAMPION', d.winnerName || (i >= 0 ? teamName(gd, i) : ''), { kind: 'winner', color: i >= 0 ? teamColor(i) : GOLD, ms: 0 });
                this.winnerIdx = i; this.court.setWinner(i);
                this.court.setTiers(MAX_ROUNDS);
                // every lantern in the courtyard lets go and rises; fireworks over the pagoda
                this.field.releaseAll();
                this.fx.show(1.3, this.fwAt());
                this.fx.firecrackers(-16, -5.2); this.fx.later(0.2, () => this.fx.firecrackers(5.2, 16));
                if (i >= 0) this.cut('winner', { i }); else this.cut('master');
                if (window.FlightDeckWinnerVideo) FlightDeckWinnerVideo.playIn(this.hud.winnerScreen);
                this.hud.winnerScreen.classList.toggle('is-on', this.video);
            }]],
        };
    }

    evDraw(gd, d) {
        const cs = Array.isArray(d.contenders) ? d.contenders : [];
        const names = cs.map((c) => c.name).filter(Boolean);
        return {
            dur: 1,
            steps: [[0, () => {
                this.darts.clear();
                this.scores(gd);
                this.setActive(-1);
                this.hud.hideThrower();
                this.hud.setWinner(true);
                this.hud.show('TIED', names.join(' · '), { kind: 'draw', color: GOLD, ms: 0 });
                this.court.setLitStations(cs.map((c) => gd.players.findIndex((x) => x.id === c.id)).filter((k) => k >= 0));
                this.court.setTiers(MAX_ROUNDS);
                this.fx.show(0.5, this.fwAt());
                this.cut('master');
                if (window.FlightDeckWinnerVideo) FlightDeckWinnerVideo.playIn(this.hud.winnerScreen);
                this.hud.winnerScreen.classList.toggle('is-on', this.video);
            }]],
        };
    }

    // ------------------------------------------------------------ frame
    update(dt) {
        if (this.runQueue(dt)) this.reconcile();
        // the gong swings and settles; the live wedge's flash eases back
        const g = this.court.gate.userData.gong;
        this.gong = Math.max(0, this.gong - dt * 0.9);
        this.gongClock = (this.gongClock || 0) + dt;
        g.rotation.x = Math.sin(this.gongClock * 9) * 0.12 * this.gong * this.gong;
        this.court.gate.userData.gongMat.emissiveIntensity = 0.12 * this.gong;
        if (this.glowT > 0) { this.glowT = Math.max(0, this.glowT - dt); this.court.gate.userData.setGlow(1.6 + this.glowT * 2.7 + 0.8 * roundT(this.shownRound)); }
    }

    reconcile() {
        const gd = this.gd; if (!gd) return;
        this.scores(gd);
        if (ended(gd.phase.type)) return;
        const t = gd.phase.type;
        if (t === 'playing') {
            if (this.active !== gd.activeIdx) this.setActive(gd.activeIdx);
            const shown = this.darts.shown.length;
            if (shown > gd.throwsThisTurn) this.darts.clear();
            else if (shown < gd.throwsThisTurn && this.visit.i === gd.activeIdx) {
                // darts this visit threw that aren't in the board (a debug preview pulled them): put them back, still
                for (let k = shown; k < gd.throwsThisTurn; k++) { const v = this.visit.list[k]; if (v) this.darts.throwIn(v.lt, v.key, v.color, this.throwFrom(gd.activeIdx), { instant: true }); }
            }
            this.hud.setDarts(gd.activeIdx, gd.throwsThisTurn);
            if (!this.field.busy) gd.players.forEach((pl, i) => this.field.set(i, pl.score || 0));
            if (this.shownRound !== gd.currentRound || this.court.tiersLit !== gd.currentRound || this.court.gate.userData.target !== gd.currentRound) this.setRound(gd.currentRound);
        }
    }

    /** what the scene shows right now (for the nothing-lies check) */
    truth() {
        const gd = this.gd;
        return {
            settled: this.queueIdle && !this.darts.busy && !this.field.busy,
            players: (gd ? gd.players : []).map((pl, i) => {
                const C = this.hud.columns[i], S = this.court.stations[i];
                return { lanterns: this.field.shown(i), score: C ? C.score : null, rounds: C ? JSON.parse(C.c.dataset.rounds || 'null') : null, scroll: S ? { score: S.score, rounds: S.rounds } : null };
            }),
            darts: this.darts.shown.map((r) => ({ bed: r.hit.bed, number: r.hit.number })),
            round: Number(this.hud.roundPill.dataset.round) || null, target: Number(this.hud.roundPill.dataset.target) || null,
            tiers: this.court.tiersLit, wedge: this.court.gate.userData.target,
            active: this.active,
            busy: { ...this.queueBusy(), darts: this.darts.busy, lanterns: this.field.busy },
            cap: CAP,
        };
    }
}
