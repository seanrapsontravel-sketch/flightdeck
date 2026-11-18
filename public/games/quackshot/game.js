// State → Duck Row. Every gameData (host SYNC_STATE or ?demo=1) is diffed against the one before into timed events
// on the kit's StateQueue: next visit, a dart (throw-in → impact → the zone's reaction → the card), intermission
// (UP NEXT), round announce, winner, draw. A dart's own event is short so the next dart reacts at once; its reaction
// and card run on as the event's tail, the card at FLASH_S (1.41 s: the 2D page's bed flash) and gone inside the
// server's 4.41 s window.
//
// Dart 3 of a visit that scores an inner single has NO phase of its own: the intermission (or round announce)
// arrives in the same state as the dart. The dart's event is queued FIRST and held long enough to be seen landing
// and scoring, then the takeover plays.
//
// When the queue is idle the view RECONCILES to the state (nothing lies): every score and duck count in the HUD,
// every station's prize shelf, the marquee, the round, the visit's darts and the active station.
import { StateQueue } from '../lib3d/kit/queue.js';
import { members, teamName, throwerOf } from '../lib3d/kit/roster.js';
import { wedgeAngle } from '../lib3d/kit/darts.js';
import { FLIGHT_S, FLASH_S, CARD_S, MAX_ROUNDS, COUNTER_Z, roundMult, dartText, bedFor, teamColor, GOLD, FIRE, SEA } from './common.js';
import * as THREE from 'three';

const OVERLAY = { bullseye: 1, zone_hit: 1, splash: 1 };
const ended = (t) => t === 'winner' || t === 'draw';

export class Game extends StateQueue {
    constructor(o) {
        super();
        Object.assign(this, o); // engine, target, stall, fair, fx, pool, prizes, darts, director, hud, feel, fireworksAt
        this.prev = null; this.gd = null;
        this.video = false;
        this.active = -1;
        // a short event log for the tests: state arrivals, dart throws/impacts, titles (performance.now() ms)
        this.log = []; this.seq = 0;
        // this visit's darts as the state reported them, so reconcile can put back any a preview pulled out
        this.visit = { i: -1, list: [] };
    }
    note(e, o = {}) { this.log.push({ e, n: ++this.seq, t: performance.now(), ...o }); if (this.log.length > 80) this.log.shift(); }

    onState(state) {
        this.video = state.viewerVideoEnabled === true;
        if (window.FlightDeckWinnerVideo) FlightDeckWinnerVideo.applyFromState(state);
    }

    // ------------------------------------------------------------ state in
    sync(gd) {
        if (!gd || gd.gameType !== 'quackshot' || !Array.isArray(gd.players) || !gd.players.length) return;
        const p = this.prev;
        this.gd = gd;
        const rosterChanged = !p || p.players.length !== gd.players.length || p.players.some((x, i) => x.id !== gd.players[i].id);
        const newGame = p && ended(p.phase.type) && !ended(gd.phase.type);
        if (rosterChanged || newGame) { this.setup(gd); this.prev = gd; return; }
        this.hud.setHelp(gd.helpVisible);
        const a = gd.activeIdx, t = gd.phase.type;
        const newPhase = t !== p.phase.type || gd.phase.startedAt !== p.phase.startedAt;
        const d = gd.phase.data || {};

        // the turn moved on
        const turnMoved = gd.throwsThisTurn === 0 && (p.activeIdx !== a || p.throwsThisTurn > 0) && t === 'playing';
        if (turnMoved) this.push(this.evNext(gd, a));
        // a dart: the thrower's count went up (or a different thrower has darts in: a state was missed)
        const isDart = !!gd.lastThrow && ((a === p.activeIdx && gd.throwsThisTurn > p.throwsThisTurn) || (a !== p.activeIdx && gd.throwsThisTurn > 0));
        // the takeover that arrives in the same state as dart 3 (inner single: no phase of its own)
        const takeover = newPhase && (t === 'intermission' || t === 'round_announce');
        if (isDart) {
            this.note('state-dart', { k: gd.throwsThisTurn - 1, phase: t });
            if (a !== p.activeIdx && !turnMoved) this.push(this.evNext(gd, a, true));
            this.push(this.evDart(gd, a, gd.throwsThisTurn - 1, newPhase && OVERLAY[t] ? t : null, takeover));
        } else if (newPhase && OVERLAY[t]) {
            this.push(this.evPreview(t, d)); // a debug preview (made-up data, no dart): titles only
        }
        if (newPhase && t === 'round_announce') this.push(this.evRound(gd, d, isDart));
        if (newPhase && t === 'intermission') this.push(this.evIntermission(gd, d, isDart));
        if (newPhase && t === 'winner') this.push(this.evWinner(gd, d));
        if (newPhase && t === 'draw') this.push(this.evDraw(gd, d));
        this.prev = gd;
    }

    /** a new roster or a new game: build the stations and HUD, place everything from the state as it stands */
    setup(gd) {
        this.clearQueue();
        const players = gd.players.map((pl, i) => ({ name: teamName(gd, i), members: members(gd, i).map((m) => ({ name: m.name, avatar: m.avatar || null })), color: teamColor(i) }));
        this.stall.setPlayers(players);
        this.hud.setPlayers(players);
        this.hud.setHelp(gd.helpVisible); this.hud.setWinner(false); this.hud.hideTitle();
        this.darts.clear(true);
        this.target.knock(0); this.target.fire(false);
        this.active = -1; this.winnerIdx = -1; this.stall.setWinner(-1); this.stall.setLit([]);
        this.snap(gd);
        if (ended(gd.phase.type)) { this.push(gd.phase.type === 'winner' ? this.evWinner(gd, gd.phase.data || {}) : this.evDraw(gd, gd.phase.data || {})); return; }
        this.push(this.evNext(gd, gd.activeIdx, true));
    }

    /** scores, ducks, shelves, marquee and round exactly as the state says (no animation) */
    snap(gd) {
        gd.players.forEach((pl, i) => this.hud.setScore(i, pl.score || 0, pl.bullseyes || 0));
        this.stall.setPrizes(gd.players.map((pl) => pl.bullseyes || 0));
        this.marquee(gd);
        const final = roundMult(gd.currentRound) > 1;
        this.hud.setRound(gd.currentRound, final);
        this.setFinal(final);
    }
    marquee(gd, scores) {
        const rows = gd.players.map((pl, i) => ({ name: teamName(gd, i), score: scores ? scores[i] : pl.score || 0, color: teamColor(i), active: i === this.active, winner: i === this.winnerIdx }));
        this.stall.setMarquee(rows, gd.currentRound, roundMult(gd.currentRound) > 1);
    }
    stationOf(i) { return this.stall.stations[i]; }
    /** where a station's darts are thrown from */
    throwFrom(i) { const s = this.stationOf(i); return s ? s.group.position.clone().add(new THREE.Vector3(0.35, 0.9, 1.2)) : new THREE.Vector3(0, 1.8, COUNTER_Z); }

    cut(name, p = {}) { this.director.set(name, p, true); }
    move(name, p = {}) { this.director.set(name, p, false); }
    setActive(i) { this.active = i; this.stall.setActive(i); this.hud.setActive(i); }

    // ------------------------------------------------------------ events
    evNext(gd, i, quick = false) {
        const th = throwerOf(gd, i), pl = gd.players[i];
        return {
            dur: quick ? 0.05 : 0.35,
            steps: [[0, () => {
                this.darts.clear();
                if (gd.throwsThisTurn === 0 || this.visit.i !== i) this.visit = { i, list: [] };
                this.target.knock(0); this.target.fire(false);
                this.setActive(i);
                this.hud.thrower({ name: th?.name || pl.name, team: gd.isDoublesLineup ? teamName(gd, i) : '', color: teamColor(i) });
                this.hud.setDarts(i, gd.throwsThisTurn);
                this.marquee(gd);
                if (this.director.shot.name !== 'master') this.cut('master');
            }]],
        };
    }

    /** a dart: who threw it, what the server scored, where it sits; `moment` = the overlay phase it caused */
    evDart(gd, i, k, moment, takeover) {
        const lt = gd.lastThrow, pl = gd.players[i], color = teamColor(i);
        const key = `${pl.id}|${gd.currentRound}|${k}`;
        const b = bedFor(lt, key);
        const scores = gd.players.map((x) => x.score || 0);
        const steps = [];
        const at = (s, fn) => steps.push([s, fn]);
        let rec = null;
        if (this.visit.i !== i) this.visit = { i, list: [] };
        this.visit.list[k] = { lt, key, color };
        at(0, () => {
            this.note('throw', { k });
            if (this.active !== i) this.setActive(i);
            rec = this.darts.throwIn(lt, key, color, this.throwFrom(i), {
                onImpact: () => {
                    // the dart has landed: now the board says what it scored
                    this.note('impact', { k, zone: lt.zone });
                    this.director.addTrauma(0.06 + Math.abs(lt.points || 0) * 0.02);
                    this.target.flash(b.bed, b.number);
                    this.hud.dart(k, dartText(lt, key), lt.points);
                    this.hud.setDarts(i, k + 1);
                    this.hud.setScore(i, pl.score || 0, pl.bullseyes || 0);
                    // a bull's duck isn't on the shelf until it has flown there and landed
                    this.stall.setPrizes(gd.players.map((x, j) => (x.bullseyes || 0) - (j === i && lt.bullseye ? 1 : 0)));
                    this.marquee(gd, scores);
                    this.react(b, lt, rec, i);
                },
            });
        });
        // a bull: the won duck flies from the boss to the player's shelf (lands ~2.4 s, well inside the 4.41 s window)
        if (lt.bullseye) {
            const st = this.stationOf(i), slot = Math.max(0, (pl.bullseyes || 1) - 1);
            at(FLIGHT_S + 0.5, () => {
                // off the tin duck it knocked: the enamel one (left) on an outer bull, the golden one (right) on a double
                const from = this.target.point(lt.zone === 'double_bull' ? 22 : -22, 18, 0.3);
                const to = this.stall.slotPoint(i, slot);
                this.prizes.launch(from, to, teamColor(i), {
                    gold: lt.zone === 'double_bull',
                    onLand: () => { this.stall.setPrizes(this.gd.players.map((x) => x.bullseyes || 0)); this.stall.hop(i); this.note('prize-land', { i }); },
                });
                this.cut('prize', { obj: () => this.prizes.flying?.m });
            });
            if (st) at(FLIGHT_S + 1.6, () => this.move('station', { station: st }));
        }
        // the card follows the 2D page's bed flash, inside the server's window
        if (moment) {
            const d = gd.phase.data || {};
            const kind = moment === 'bullseye' ? (lt.zone === 'double_bull' ? 'dbull' : 'bull') : moment === 'zone_hit' ? 'fire' : 'splash';
            const title = d.title || { dbull: 'Double Bullseye!', bull: 'Outer Bull!', fire: 'Ring of Fire!', splash: 'Splash!' }[kind];
            at(FLASH_S, () => !ended(this.gd.phase.type) && this.hud.show(title, `${d.playerName || teamName(gd, i)} · ${d.label || lt.label}`, { kind, color: kind === 'fire' ? FIRE : kind === 'splash' ? SEA : GOLD, ms: CARD_S * 1000 }));
            at(FLASH_S + CARD_S - 0.15, () => {
                this.target.fire(false);
                const ph = this.gd.phase.type;
                if (!ended(ph) && ph !== 'intermission' && ph !== 'round_announce') this.cut('master');
            });
        }
        // dart 3 into an inner single: hold so it lands and scores before the takeover in the same state
        return { dur: takeover ? FLIGHT_S + 0.7 : FLIGHT_S + 0.08, steps };
    }

    /** the zone does its thing, the moment the dart lands */
    react(b, lt, rec, i) {
        const T = this.target, F = this.fx, at = rec ? rec.at : null;
        const ang = at ? Math.atan2(at.y - T.group.position.y, at.x) : Math.PI / 2;
        if (b.bed === 'single_inner') {
            // the parade: the nearest duck flips back with a squeak, the score floats off it
            const d = T.tipNearest(wedgeAngle(b.number)), p = T.duckPoint(d);
            if (F) F.squeak(p);
            T.floatText(lt.label || '+1', p.clone().add(new THREE.Vector3(0, 0.25, 0.2)), '#9dffb0');
        } else if (b.bed === 'treble') {
            // the Ring of Fire roars up from where the dart went in, both ways round
            T.fire(true, ang); this.cut('fire'); this.feel.flash = 0.12; this.director.addTrauma(0.15);
        } else if (b.bed === 'outer_bull') {
            T.knock(1); this.cut('bull'); if (F) F.goldShower(T.point(0, 0, 0.25), 0.4);
        } else if (b.bed === 'bull') {
            T.knock(2); T.strobe(); this.cut('bull'); this.feel.flash = 0.22; this.director.addTrauma(0.22); if (F) F.goldShower(T.point(0, 0, 0.25));
        } else if (rec && rec.water) {
            // a miss: into the pool
            this.pool.plume(at, F); this.cut('pool', { at }); this.director.addTrauma(0.08);
        } else if (at) {
            // the painted sea answers: jets from the two nearest rim nozzles, a splash, the curtain hits the lens
            this.cut('bed', { at });
            if (F) {
                for (const da of [-0.32, 0.32]) { const a = ang + da; F.jet(T.point(Math.cos(a) * 205, Math.sin(a) * 205, 0.15), at.clone().add(new THREE.Vector3(0, 0, 0.06)), 0.55); }
                F.splash(at, 110);
            }
            this.hud.splashLens();
        }
    }
    /** round 6 escalation: the bulbs chase, the parade and the fair speed up, fireworks over the wheel */
    setFinal(on) {
        this.target.setFinal(on);
        if (this.fair) this.fair.setFinal(on);
        if (this.fx) this.fx.setFireworks(on ? 0.9 : 0, this.fireworksAt);
    }

    evPreview(t, d) {
        const kind = t === 'bullseye' ? (d.zone === 'double_bull' ? 'dbull' : 'bull') : t === 'zone_hit' ? 'fire' : 'splash';
        return { dur: 0.1, steps: [[0, () => this.hud.show(d.title || 'Splash!', `${d.playerName || ''} · ${d.label || ''}`, { kind, color: kind === 'fire' ? FIRE : kind === 'splash' ? SEA : GOLD, ms: CARD_S * 1000 })]] };
    }

    evIntermission(gd, d, afterDart) {
        const i = d.nextPlayerIndex ?? 0, st = this.stationOf(i);
        const dur = afterDart ? 1.55 : 2.25;
        return {
            dur,
            steps: [
                [0, () => {
                    this.darts.clear();
                    this.target.knock(0); this.target.fire(false);
                    this.setActive(i);
                    this.hud.setDarts(i, 0);
                    this.hud.hideThrower();
                    if (st) this.cut('station', { station: st });
                    this.hud.show('UP NEXT', d.nextPlayerName || teamName(gd, i), { kind: 'next', color: teamColor(i), ms: (dur - 0.15) * 1000 });
                    this.marquee(gd);
                }],
                [0.55, () => this.stall.stamp(i)],
                [dur - 0.1, () => this.cut('master')],
            ],
        };
    }

    evRound(gd, d, afterDart) {
        const r = d.round || gd.currentRound + 1, last = r >= MAX_ROUNDS;
        const dur = afterDart ? 2.15 : 2.8;
        return {
            dur,
            steps: [
                [0, () => {
                    this.darts.clear();
                    this.hud.hideThrower();
                    this.cut('round');
                    const sub = [`${d.eyebrow || 'CARNIVAL ROUND'}`, `${r} OF ${d.maxRounds || MAX_ROUNDS}`, ...(d.tags || [])].join(' · ');
                    this.hud.show(last ? 'FINALE' : `ROUND ${r}`, sub, { kind: last ? 'final' : 'round', color: last ? '#ff4d3a' : GOLD, ms: (dur - 0.2) * 1000 });
                    this.hud.setRound(r, last);
                }],
                [0.6, () => this.setFinal(last)],
                [dur - 0.1, () => this.cut('master')],
            ],
        };
    }

    evWinner(gd, d) {
        const i = Math.max(0, gd.players.findIndex((x) => x.id === d.winnerId));
        return {
            dur: 1,
            steps: [[0, () => {
                this.darts.clear();
                this.setActive(i);
                this.hud.hideThrower();
                this.hud.setWinner(true);
                this.hud.show('GRAND PRIZE', d.winnerName || teamName(gd, i), { kind: 'winner', color: teamColor(i), ms: 0 });
                this.winnerIdx = i; this.stall.setWinner(i); this.marquee(gd);
                const st = this.stationOf(i);
                if (st) this.cut('winner', { station: st });
                this.setFinal(true);
                if (this.fx && st) this.fx.confetti(st.group.position);
                if (window.FlightDeckWinnerVideo) FlightDeckWinnerVideo.playIn(this.hud.winnerScreen);
                this.hud.winnerScreen.classList.toggle('is-on', this.video);
            }]],
        };
    }

    evDraw(gd, d) {
        const names = (Array.isArray(d.contenders) ? d.contenders : []).map((c) => c.name).filter(Boolean);
        return {
            dur: 1,
            steps: [[0, () => {
                this.darts.clear();
                this.setActive(-1);
                this.hud.hideThrower();
                this.hud.setWinner(true);
                this.hud.show('DEAD HEAT', names.join(' · '), { kind: 'draw', color: GOLD, ms: 0 });
                const idx = (Array.isArray(d.contenders) ? d.contenders : []).map((c) => gd.players.findIndex((x) => x.id === c.id)).filter((k) => k >= 0);
                this.stall.setLit(idx); this.setFinal(true);
                this.cut('master');
                if (window.FlightDeckWinnerVideo) FlightDeckWinnerVideo.playIn(this.hud.winnerScreen);
                this.hud.winnerScreen.classList.toggle('is-on', this.video);
            }]],
        };
    }

    // ------------------------------------------------------------ frame
    update(dt) { if (this.runQueue(dt)) this.reconcile(); }

    /** nothing lies: once the queue is idle, the scene matches the state */
    reconcile() {
        const gd = this.gd; if (!gd) return;
        gd.players.forEach((pl, i) => this.hud.setScore(i, pl.score || 0, pl.bullseyes || 0));
        const counts = gd.players.map((pl) => pl.bullseyes || 0);
        if (this.stall.prizeCounts.some((c, i) => c !== Math.min(counts[i], 12))) this.stall.setPrizes(counts);
        if (ended(gd.phase.type)) { this.marquee(gd); return; }
        const t = gd.phase.type;
        if (t === 'playing' || OVERLAY[t]) {
            if (this.active !== gd.activeIdx) this.setActive(gd.activeIdx);
            const shown = this.darts.shown.length;
            if (shown > gd.throwsThisTurn) this.darts.clear();
            else if (t === 'playing' && shown < gd.throwsThisTurn && this.visit.i === gd.activeIdx) {
                // darts this visit threw that aren't in the board (a debug preview pulled them): put them back, still
                for (let k = shown; k < gd.throwsThisTurn; k++) { const v = this.visit.list[k]; if (v) this.darts.throwIn(v.lt, v.key, v.color, this.throwFrom(gd.activeIdx), { instant: true }); }
            }
            this.hud.setDarts(gd.activeIdx, gd.throwsThisTurn);
            const final = roundMult(gd.currentRound) > 1;
            this.hud.setRound(gd.currentRound, final);
            this.setFinal(final);
        }
        this.marquee(gd);
    }

    /** what the scene shows right now (for the nothing-lies check) */
    truth() {
        const gd = this.gd;
        const mq = this.stall.marqueeShown;
        return {
            settled: this.queueIdle && !this.target.busy && !this.darts.busy && !this.prizes.busy,
            players: (gd ? gd.players : []).map((pl, i) => {
                const C = this.hud.columns[i];
                return { score: C ? C.score : null, ducks: C ? C.n : null, shelf: this.stall.stations[i]?.prizes ?? null, marquee: mq ? mq.scores[i] : null };
            }),
            darts: this.darts.shown.map((r) => ({ bed: r.hit.bed, number: r.hit.number })),
            round: Number(this.hud.roundNum.textContent) || null, marqueeRound: mq ? mq.round : null,
            active: this.active,
            busy: { ...this.queueBusy(), target: this.target.busy, darts: this.darts.busy, prizes: this.prizes.busy },
        };
    }
}

