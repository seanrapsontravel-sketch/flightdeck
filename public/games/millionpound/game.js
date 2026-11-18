// State → the Hot Oche. Every gameData (host SYNC_STATE or ?demo=1) is diffed against the one before into timed
// events on the kit's StateQueue (src/engines/millionpound.js is the contract):
//   a new question (playing)   the lower third slides up, the answers appear A → D, the ring's quadrants go live,
//                              the studio's stakes step up (the rig lowers, the wash dims)
//   a dart (→ locked)          it flies from the oche and sticks in its exact bed; its quadrant and lozenge go AMBER,
//                              "LOCKED IN"; a bull lights the gold bull: FREE PASS; the camera pushes in on the ring
//   reveal                     the right quadrant and lozenge snap GREEN; right: a burst of green light, the thrower's
//                              tower climbs a rung, their prize ticks up; wrong: the answer flashes green and the
//                              chosen stays amber, quietly; the million: everything at once and gold rain
//   intermission               UP NEXT on the next player's tower
//   round_announce             the crane down through the rig as it lowers a notch
//   winner / draw              the final standings, the champion's tower in light, gold rain
// When the queue is idle the view RECONCILES to the state (nothing lies): every prize on the chips and towers, the
// round pill, the question and answers on screen, the quadrant lit for the dart, and green only once revealed.
import * as THREE from 'three';
import { StateQueue } from '../lib3d/kit/queue.js';
import { members, teamName, throwerOf } from '../lib3d/kit/roster.js';
import { LETTERS, PER_TURN, QUESTIONS, ROUNDS, ZONE_SIZES, prizeFor, stakesOf, teamColor, LADDER, moneyShort } from './common.js';
import { FLIGHT_S } from './darts.js';
import { OCHE_Z } from './studio.js';

const ended = (t) => t === 'winner' || t === 'draw';
const GOLD = '#f2c14e', GREEN = '#22d36b';
const LEVELS = ['WARM-UP', 'WARM-UP', 'EASY', 'EASY', 'EASY', 'MEDIUM', 'MEDIUM', 'HARDER', 'HARDER', 'HARDER', 'HARD', 'HARD', 'FINAL VISIT', 'FINAL VISIT', 'FINAL VISIT'];
const levelOf = (n) => (n > QUESTIONS ? 'SUDDEN DEATH' : LEVELS[n - 1]);

export class Game extends StateQueue {
    constructor(o) {
        super();
        Object.assign(this, o); // engine, studio, ring, towers, darts, director, hud, fx
        this.prev = null; this.gd = null; this.video = false;
        this.active = -1; this.log = []; this.seq = 0;
        this.quad = { A: 'idle', B: 'idle', C: 'idle', D: 'idle' };
        this.revealed = null; this.lockedKey = undefined;
    }
    note(e, o = {}) { this.log.push({ e, n: ++this.seq, t: performance.now(), ...o }); if (this.log.length > 160) this.log.shift(); }
    onState(state) {
        this.video = state.viewerVideoEnabled === true;
        if (window.FlightDeckWinnerVideo) FlightDeckWinnerVideo.applyFromState(state);
    }

    // ------------------------------------------------------------ state in
    sync(gd) {
        if (!gd || gd.gameType !== 'millionpound' || !Array.isArray(gd.players) || !gd.players.length) return;
        const p = this.prev;
        this.gd = gd;
        const rosterChanged = !p || p.players.length !== gd.players.length || p.players.some((x, i) => x.id !== gd.players[i].id);
        const newGame = p && (ended(p.phase.type) && !ended(gd.phase.type) || p.seed !== gd.seed);
        if (rosterChanged || newGame) { this.setup(gd); this.prev = gd; return; }
        this.hud.setHelp(gd.helpVisible);
        const t = gd.phase.type, d = gd.phase.data || {};
        const newPhase = t !== p.phase.type || gd.phase.startedAt !== p.phase.startedAt;
        const newQuestion = t === 'playing' && gd.question && (!p.question || p.question.id !== gd.question.id || p.activeIdx !== gd.activeIdx);
        // a dart: a lastThrow for a (player, question) the previous state didn't have
        const dartKey = (s) => (s && s.lastThrow ? `${s.lastThrow.playerId}|${s.lastThrow.question}|${s.throwsThisTurn}` : null);
        const isDart = !!gd.lastThrow && gd.throwsThisTurn > 0 && dartKey(gd) !== dartKey(p);
        if (newQuestion) this.push(this.evQuestion(gd));
        if (isDart) this.push(this.evDart(gd));
        else if (newPhase && t === 'locked') this.push(this.evLock(gd, d));          // a debug preview: no dart
        if (newPhase && t === 'reveal' && !d.final) this.push(this.evReveal(gd, d));
        if (newPhase && t === 'intermission') this.push(this.evUpNext(gd, d));
        if (newPhase && t === 'round_announce') this.push(this.evRound(gd, d));
        if (newPhase && t === 'winner') this.push(this.evEnd(gd, d, true));
        if (newPhase && t === 'draw') this.push(this.evEnd(gd, d, false));
        if (newPhase && t === 'playing' && !newQuestion && p.phase.type !== 'playing') this.push(this.evQuestion(gd, true)); // 'clear' after a preview
        this.prev = gd;
    }

    setup(gd) {
        this.clearQueue();
        const players = gd.players.map((pl, i) => ({ name: teamName(gd, i), members: members(gd, i).map((m) => ({ name: m.name, avatar: m.avatar || null })), color: teamColor(i) }));
        this.players = players;
        this.towers.setPlayers(players);
        this.hud.setPlayers(players);
        this.director.masterKey = null;
        this.hud.setHelp(gd.helpVisible); this.hud.hideTitle(); this.hud.final(null);
        this.hud.setWinners([]); this.towers.setWinners([]); this.fx.goldRain(0);
        this.darts.clear(true);
        this.active = -1; this.revealed = null;
        gd.players.forEach((pl, i) => { this.towers.setRung(i, pl.rung || 0); this.hud.setRung(i, pl.rung || 0); });
        if (ended(gd.phase.type)) { this.push(this.evEnd(gd, gd.phase.data || {}, gd.phase.type === 'winner')); return; }
        this.push(this.evQuestion(gd, true));
        if (gd.phase.type === 'locked') this.push(this.evLock(gd, gd.phase.data || {}));
        if (gd.phase.type === 'reveal') this.push(this.evReveal(gd, gd.phase.data || {}));
    }

    // ------------------------------------------------------------ helpers
    qNo(gd) { return gd.question?.number || ((gd.currentRound || 1) - 1) * PER_TURN + (gd.questionInTurn || 0) + 1; }
    oche(i) { return new THREE.Vector3(-0.35 + (i % 2) * 0.7, 1.65, OCHE_Z - 0.4); }
    cut(name, p = {}) { this.director.set(name, p, true); }
    move(name, p = {}) { this.director.set(name, p, false); }
    setQuads(map) { for (const L of LETTERS) { const s = map[L] || 'idle'; if (this.quad[L] !== s) { this.quad[L] = s; this.ring.userData.setQuad(L, s); } } }
    allQuads(s) { this.setQuads({ A: s, B: s, C: s, D: s }); }
    setActive(gd, i, live) {
        this.active = i;
        this.hud.setActive(i);
        this.towers.setActive(i, live);
        const pl = gd.players[i]; if (!pl) return;
        const th = throwerOf(gd, i);
        const rung = pl.rung || 0;
        const tag = gd.suddenDeath ? 'SUDDEN DEATH' : gd.currentRound === ROUNDS ? 'FINAL VISIT' : '';
        this.hud.contestant({ name: th?.name || pl.name, team: gd.isDoublesLineup ? teamName(gd, i) : '', color: teamColor(i), rung, tag });
        this.hud.setTree(teamName(gd, i), rung, live && !gd.suddenDeath, pl.banked || 0);
    }
    pips(gd) {
        const pl = gd.players[gd.activeIdx]; if (!pl) return;
        const mine = (pl.answers || []).filter((a) => a.round === gd.currentRound);
        if (gd.suddenDeath) { this.hud.setPips(['now', '', '']); return; }
        const list = [0, 1, 2].map((k) => { const a = mine[k]; if (a) return a.pass ? 'pass' : a.outcome === 'treble_right' ? 'treble' : a.outcome === 'treble_wrong' ? 'drop' : a.right ? 'right' : 'wrong'; return k === mine.length ? 'now' : ''; });
        this.hud.setPips(list);
    }
    stakes(gd) {
        const s = stakesOf(Math.min(this.qNo(gd), QUESTIONS));
        this.studio.setStakes(s); this.ring.userData.setStakes(s);
        this.hud.setRound(gd.currentRound || 1, Math.min(this.qNo(gd), QUESTIONS), levelOf(this.qNo(gd)));
    }

    // ------------------------------------------------------------ events
    evQuestion(gd, quick = false) {
        const i = gd.activeIdx, q = gd.question;
        return {
            dur: quick ? 0.05 : 0.4,
            steps: [[0, () => {
                if (!q) return;
                this.note('question', { id: q.id, num: q.number });
                if ((q.turnQuestion || 1) === 1 || this.active !== i) this.darts.clear();
                this.hud.hideTitle();
                this.revealed = null; this.lockedKey = undefined;
                this.setActive(gd, i, true);
                this.stakes(gd);
                this.pips(gd);
                this.ring.userData.setZones(q.zoneSize || 5);
                this.hud.question(q, { stage: !quick });
                this.hud.stakes(q.stakes || null, !!q.passAvailable);
                this.allQuads('live');
                this.ring.userData.setBull('idle');
                if (this.director.shot.name !== 'master') this.move('master');
            }]],
        };
    }

    evDart(gd) {
        const lt = gd.lastThrow, i = gd.activeIdx, color = teamColor(i);
        const key = `${lt.playerId}|${lt.question}`;
        const answer = lt.answer ?? null, outcome = lt.outcome || '', treble = !!answer && Number(lt.multiplier) === 3;
        const ms = gd.phase.type === 'locked' ? gd.phase.data.ms || 1500 : 1500;
        return {
            dur: FLIGHT_S + 0.1,
            steps: [[0, () => {
                this.note('throw', { key });
                this.hud.allShown();
                this.darts.throwIn(lt, key, color, this.oche(i), {
                    onImpact: (rec) => {
                        this.note('impact', { bed: rec.hit.bed, num: rec.hit.number, answer, pass: !!lt.pass });
                        this.lock(answer, !!lt.pass, ms, outcome, treble);
                        this.fx.sparks(rec.at, lt.pass ? [1, 0.75, 0.3] : treble ? [1, 0.85, 0.35] : [1, 0.6, 0.2], treble ? 40 : 22);
                        this.director.addTrauma(treble ? 0.12 : 0.06);
                    },
                });
            }]],
        };
    }
    evLock(gd, d) { return { dur: 0.1, steps: [[0, () => this.lock(d.answer ?? null, !!d.pass, d.ms || 1500, d.outcome || '', !!d.treble)]] }; }
    lock(answer, pass, ms, outcome = '', treble = false) {
        this.lockedKey = answer;
        this.hud.lock(answer, pass, outcome, treble);
        const map = {}; for (const L of LETTERS) map[L] = L === answer ? 'locked' : 'dim';
        this.setQuads(map);
        if (pass) this.ring.userData.setBull('pass');
        this.studio.flashOf(pass ? '#ffc94d' : '#ff9a1a', 0.18);
        this.cut('lock', { ms });
    }

    evReveal(gd, d) {
        const i = d.playerIdx ?? gd.activeIdx;
        const right = !!d.right, pass = !!d.pass, million = !!d.million, oc = d.outcome || '';
        const sudden = !!d.suddenDeath;
        return {
            dur: 0.6,
            steps: [
                [0, () => {
                    this.note('reveal', { right, pass, key: d.correctKey, outcome: oc });
                    this.revealed = d.correctKey;
                    this.hud.reveal({ answer: d.answer, correctKey: d.correctKey, right, pass, outcome: oc, move: d.move, saved: !!d.saved, suddenDeath: sudden, tier: d.tier || 0 });
                    const map = {}; for (const L of LETTERS) map[L] = L === d.correctKey ? 'right' : (L === d.answer && !right ? 'locked' : 'dim');
                    this.setQuads(map);
                    const c = this.ring.userData.centre;
                    if (right) {
                        const big = oc === 'treble_right' || (sudden && d.tier === 2);
                        this.studio.flashOf(pass ? '#ffc94d' : big ? '#ffd86a' : '#22d36b', million ? 1.4 : big ? 1.1 : 0.8);
                        this.fx.burst(c, pass || big ? [1, 0.78, 0.25] : [0.2, 1, 0.45], million ? 260 : big ? 200 : 120);
                        if (big) this.fx.later(0.18, () => this.fx.burst(c, [0.2, 1, 0.45], 120));
                        this.director.addTrauma(million ? 0.3 : big ? 0.2 : 0.12);
                    } else if (oc === 'treble_wrong') {
                        this.studio.flashOf(d.saved ? '#ffc94d' : '#ff3b4a', 0.7);
                        this.fx.fizz(c); this.director.addTrauma(0.14);
                    } else this.fx.fizz(c);
                    if (!sudden && d.rung != null) {
                        this.towers.setRung(i, d.rung, true);
                        this.hud.setRung(i, d.rung);
                        this.hud.setTree(teamName(gd, i), d.rung, false, d.banked ?? (gd.players[i]?.banked || 0));
                    }
                    if (!d.preview) this.pips(gd);
                    this.hud.stakes(null);
                    this.move('reveal');
                    if (million) {
                        this.fx.goldRain(1.2);
                        this.hud.show('£1,000,000', `${teamName(gd, i)} · THE MILLION!`, { kind: 'million', color: GOLD, ms: 4200 });
                    } else if (oc === 'treble_right' && !sudden) {
                        this.hud.show('TREBLE!', `${teamName(gd, i)} · UP TWO TO ${moneyShort(prizeFor(d.rung))}`, { kind: 'treble', color: GOLD, ms: 1700 });
                    }
                }],
                [million ? 4.8 : 9, () => { if (million && !ended(this.gd.phase.type)) this.fx.goldRain(0); }],
            ],
        };
    }

    evUpNext(gd, d) {
        const i = d.nextPlayerIndex ?? 0, rung = d.rung ?? (gd.players[i]?.rung || 0);
        const name = d.nextPlayerName || teamName(gd, i);
        return {
            dur: 2.1,
            steps: [
                [0, () => {
                    this.hud.hideQuestion();
                    this.darts.clear();
                    this.allQuads('idle'); this.ring.userData.setBull('idle');
                    this.setActive(gd, i, false);
                    this.cut('tower', { i });
                    const q0 = ((gd.currentRound || 1) - 1) * PER_TURN + 1;
                    const sub = d.suddenDeath ? `${name} · SUDDEN DEATH · ONE DART` : `${name} · ON ${moneyShort(prizeFor(rung))} · QUESTIONS ${q0}–${q0 + PER_TURN - 1}`;
                    this.hud.show('UP NEXT', sub, { kind: 'next', color: teamColor(i), ms: 1950 });
                }],
                [2.0, () => !ended(this.gd.phase.type) && this.cut('master')],
            ],
        };
    }

    evRound(gd, d) {
        const r = Math.min(ROUNDS, d.round || gd.currentRound), last = r >= ROUNDS;
        const q0 = (r - 1) * PER_TURN + 1;
        return {
            dur: 2.7,
            steps: [
                [0, () => {
                    this.hud.hideQuestion();
                    this.darts.clear();
                    this.allQuads('idle'); this.ring.userData.setBull('idle');
                    this.towers.setActive(-1, false); this.hud.setActive(-1);
                    this.cut('crane', { dur: 2.6 });
                    const z = d.zoneSize || ZONE_SIZES[r - 1];
                    if (d.suddenDeath) this.hud.show('SUDDEN DEATH', (d.contenders || []).map((c) => c.name).join(' · ') + ` · ${d.sdRound > 1 ? 'STILL LEVEL' : 'ONE DART · ONE NUMBER'}`, { kind: 'final', color: GOLD, ms: 2550 });
                    else if (last) this.hud.show('FINAL VISIT', `THE MILLION POUND OCHE · ${z} NUMBERS AN ANSWER`, { kind: 'final', color: GOLD, ms: 2550 });
                    else this.hud.show(`VISIT ${r}`, `OF ${ROUNDS} · QUESTIONS ${q0}–${q0 + PER_TURN - 1} · ${z} NUMBERS AN ANSWER`, { kind: 'round', color: '#7fa2ff', ms: 2550 });
                }],
                [0.9, () => { const s = d.suddenDeath ? 1 : stakesOf(q0); this.studio.setStakes(s); this.ring.userData.setStakes(s); this.ring.userData.setZones(d.suddenDeath ? 1 : (d.zoneSize || ZONE_SIZES[r - 1])); this.hud.setRound(r, q0, d.suddenDeath ? 'SUDDEN DEATH' : levelOf(q0)); }],
            ],
        };
    }

    evEnd(gd, d, won) {
        const idx = won ? [gd.players.findIndex((x) => x.id === d.winnerId)].filter((k) => k >= 0)
            : (d.contenders || []).map((c) => gd.players.findIndex((x) => x.id === c.id)).filter((k) => k >= 0);
        return {
            dur: 1,
            steps: [[0, () => {
                this.hud.hideQuestion();
                this.darts.clear();
                gd.players.forEach((pl, k) => { this.towers.setRung(k, pl.rung || 0); this.hud.setRung(k, pl.rung || 0); });
                this.towers.setActive(-1, false); this.towers.setWinners(idx); this.hud.setWinners(idx); this.hud.setActive(-1);
                this.allQuads(won ? 'right' : 'live');
                this.studio.setStakes(1); this.studio.flashOf('#ffc94d', 1.2);
                this.fx.goldRain(won ? 1 : 0.5);
                const names = won ? (d.winnerName || teamName(gd, idx[0])) : (d.contenders || []).map((c) => c.name).join(' · ');
                const why = d.reason === 'million_first' ? ` · FIRST TO £1M (Q${d.millionAt})` : d.reason === 'sudden_death' ? ' · WINS IN SUDDEN DEATH' : '';
                this.hud.show(won ? 'CHAMPION' : 'SHARED WIN', names + why, { kind: won ? 'winner' : 'draw', color: GOLD, ms: 0 });
                this.hud.final(this.standings(gd, idx));
                if (won && idx.length) this.cut('winner', { i: idx[0] }); else this.cut('master');
                if (window.FlightDeckWinnerVideo) FlightDeckWinnerVideo.playIn(this.hud.winnerScreen);
                this.hud.winnerScreen.classList.toggle('is-on', this.video);
            }]],
        };
    }
    standings(gd, winners) {
        const rows = gd.players.map((pl, i) => ({ i, name: teamName(gd, i), color: teamColor(i), rung: pl.rung || 0, prize: prizeFor(pl.rung || 0), correct: pl.correct || 0, trebles: pl.trebles || 0, passes: pl.passes || 0, winner: winners.includes(i) }));
        rows.sort((a, b) => (b.winner - a.winner) || (b.rung - a.rung));
        let place = 0;
        rows.forEach((r, k) => { if (k === 0 || r.rung !== rows[k - 1].rung) place = k + 1; r.placeText = ['1ST', '2ND', '3RD', '4TH', '5TH', '6TH'][place - 1] || `${place}TH`; });
        return rows;
    }

    // ------------------------------------------------------------ frame
    update(dt) { if (this.runQueue(dt)) this.reconcile(); }

    reconcile() {
        const gd = this.gd; if (!gd) return;
        if (!this.towers.busy) gd.players.forEach((pl, i) => { if (this.towers.list[i] && this.towers.list[i].rung !== (pl.rung || 0)) this.towers.setRung(i, pl.rung || 0); });
        gd.players.forEach((pl, i) => { if (this.hud.chips[i] && this.hud.chips[i].c.dataset.rung !== String(pl.rung || 0)) this.hud.setRung(i, pl.rung || 0); });
        const t = gd.phase.type;
        if (ended(t)) return;
        if ((t === 'playing' || t === 'locked' || t === 'reveal') && gd.question) {
            if (this.hud.shownQ !== gd.question.id) this.hud.question(gd.question, { stage: false });
            if (this.active !== gd.activeIdx) this.setActive(gd, gd.activeIdx, t === 'playing');
            if (Number(this.hud.roundPill.dataset.q) !== Math.min(this.qNo(gd), QUESTIONS) && !gd.suddenDeath) this.stakes(gd);
            if (this.ring.userData.zoneSize !== (gd.question.zoneSize || 5)) this.ring.userData.setZones(gd.question.zoneSize || 5);
            if (t === 'playing' && this.revealed) { this.revealed = null; this.hud.question(gd.question, { stage: false }); this.allQuads('live'); }
            const shown = this.darts.shown.length;
            if (shown > gd.throwsThisTurn) this.darts.clear();
        }
    }

    /** what the scene shows right now (for the nothing-lies check) */
    truth() {
        const gd = this.gd, H = this.hud;
        const ans = {}; for (const L of LETTERS) { const a = H.ans[L].a; ans[L] = { text: H.ans[L].txt.textContent, cls: ['is-locked', 'is-right', 'is-wrong', 'is-dim'].filter((c) => a.classList.contains(c)) }; }
        return {
            settled: this.queueIdle && !this.darts.busy && !this.towers.busy,
            question: H.low.classList.contains('is-on') ? { id: H.shownQ, text: H.qText.textContent, answers: ans } : null,
            green: LETTERS.filter((L) => H.ans[L].a.classList.contains('is-right')),
            quads: { ...this.quad },
            chips: H.chips.map((C) => ({ rung: Number(C.c.dataset.rung), prize: C.prize.textContent, name: C.name.textContent })),
            towers: this.towers.list.map((T, i) => ({ rung: this.towers.shown(i), name: T.name })),
            round: Number(H.roundPill.dataset.round) || null, q: Number(H.roundPill.dataset.q) || null,
            tree: Number(H.tree.dataset.rung),
            zoneSize: this.ring.userData.zoneSize, activeWedges: this.ring.userData.activeWedges().sort((a, b) => a - b),
            stakes: H.stakesBox.classList.contains('is-on') ? { right: Number(H.stakesBox.dataset.right), treble: Number(H.stakesBox.dataset.treble), wrong: Number(H.stakesBox.dataset.wrong) } : null,
            darts: this.darts.shown.map((r) => ({ bed: r.hit.bed, number: r.hit.number })),
            active: this.active,
            busy: { ...this.queueBusy(), darts: this.darts.busy, towers: this.towers.busy },
            questions: QUESTIONS,
            gdPhase: gd ? gd.phase.type : null,
        };
    }
}
