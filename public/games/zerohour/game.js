// State → the salon (docs/plans/ZERO-HOUR.md §8). Every gameData (the host's SYNC_STATE or ?demo=1) is diffed against
// the one before into timed events on the kit's StateQueue:
//   a dart        — it flies into the exact bed; the HUD pip and the visit's points; the thrower's tray fills with
//                   that many chips; a HOT dart flares its wedge gold, cuts to the board and shows "HOT ×3"
//   the sweep     — after dart 3 (zh.lastVisit): "SEAN SCORES 114 · +114 CHIPS", then the visit's drops slide from the
//                   tray to their numbers; each landing flashes its cell; when the last lands the leader rims, the
//                   standings and the favourite's crown update, and any steals get their card
//   round / UP NEXT / the spin / the winner — the takeovers
// The engine decides everything (cells[].leader, standings, favourite, steals, the pocket, the placings); the TV never
// computes a rule. When the queue is idle and nothing is moving, the view RECONCILES to the state (nothing lies).
//
// The spin is driven by time since the `spin` phase began (the server's clock, via state.serverNow), so a TV that joins
// mid-spin lands at the right moment; its camera and cards follow the wheel's own timeline (wheel.at(t)).
import { StateQueue } from '../lib3d/kit/queue.js';
import { members, teamName, throwerOf } from '../lib3d/kit/roster.js';
import { seatColor, GOLD } from './common.js';
import { FLIGHT_S } from './board.js';
import { ordinal } from './hud.js';

const ended = (t) => t === 'winner' || t === 'draw';
const visitKey = (lv) => (lv ? `${lv.playerId}|${lv.round}|${lv.points}|${(lv.drops || []).map((d) => d.pocket + ':' + d.v).join(',')}` : '');

export class Game extends StateQueue {
    constructor(o) {
        super();
        Object.assign(this, o); // engine, table, chips, wheel, board, room, director, hud, fast
        this.prev = null; this.gd = null;
        this.clockOffset = 0; this.video = false;
        this.spinT = null; this.spinStage = null;
        this.dirty = true; this.active = -1;
        this.log = []; this.seq = 0;
        this.firstSweep = true;
    }
    note(e, o = {}) { this.log.push({ e, n: ++this.seq, t: performance.now(), ...o }); if (this.log.length > 160) this.log.shift(); }
    onState(state) {
        if (state && Number.isFinite(state.serverNow)) this.clockOffset = state.serverNow - Date.now();
        this.video = state.viewerVideoEnabled === true;
        if (window.FlightDeckWinnerVideo) FlightDeckWinnerVideo.applyFromState(state);
    }
    color(i) { return seatColor(i); }
    ents(gd) { return gd.players.map((p, i) => ({ id: p.id, seat: i, drops: p.drops || [] })); }
    seatOf(gd, id) { return gd.players.findIndex((p) => p.id === id); }
    nameOf(gd, id) { const i = this.seatOf(gd, id); return i >= 0 ? teamName(gd, i) : ''; }

    // ------------------------------------------------------------ state in
    sync(gd) {
        if (!gd || gd.gameType !== 'zerohour' || !Array.isArray(gd.players) || !gd.players.length || !gd.zh) return;
        const p = this.prev;
        this.gd = gd; this.dirty = true;
        const rosterChanged = !p || p.players.length !== gd.players.length || p.players.some((x, i) => x.id !== gd.players[i].id);
        const newGame = p && ended(p.phase.type) && !ended(gd.phase.type);
        if (rosterChanged || newGame) { this.setup(gd); this.prev = gd; return; }
        this.hud.setHelp(gd.helpVisible);
        const a = gd.activeIdx, t = gd.phase.type, d = gd.phase.data || {};
        const newPhase = t !== p.phase.type || gd.phase.startedAt !== p.phase.startedAt;
        const turnMoved = t === 'playing' && gd.throwsThisTurn === 0 && (p.activeIdx !== a || p.throwsThisTurn > 0);
        if (turnMoved) this.push(this.evNext(gd, a));
        const isDart = !!gd.lastThrow && ((a === p.activeIdx && gd.throwsThisTurn > p.throwsThisTurn) || (a !== p.activeIdx && gd.throwsThisTurn > 0));
        const newVisit = visitKey(gd.zh.lastVisit) !== visitKey(p.zh && p.zh.lastVisit) && !!gd.zh.lastVisit && gd.throwsThisTurn >= 3;
        const takeover = newPhase && t !== 'playing';
        if (isDart) this.push(this.evDart(gd, a, gd.throwsThisTurn - 1, takeover || newVisit));
        if (newVisit) this.push(this.evSweep(gd));
        if (newPhase && t === 'round_announce') this.push(this.evRound(gd, d, newVisit));
        if (newPhase && t === 'intermission') this.push(this.evIntermission(gd, d, newVisit || isDart));
        if (newPhase && t === 'spin') this.push(this.evSpin(gd, d));
        if (newPhase && t === 'winner') this.push(this.evWinner(gd, d));
        this.prev = gd;
    }

    setup(gd) {
        this.clearQueue();
        const players = gd.players.map((pl, i) => ({ name: teamName(gd, i), members: members(gd, i).map((m) => ({ name: m.name, avatar: m.avatar || null })), color: this.color(i) }));
        this.table.setPlayers(players.map((x) => x.color));
        this.chips.setPlayers(players.map((x) => x.color));
        this.hud.setPlayers(players);
        this.director.nPlayers = players.length;
        this.hud.setCommit(gd.zh.commit);
        this.hud.setHelp(gd.helpVisible); this.hud.hideTitle(); this.hud.hidePlacings();
        this.board.clear(true);
        this.table.clearHolds(); this.table.setMap(false); this.wheel.setMap(false); this.room.setDim(0); this.board.setInset(!ended(gd.phase.type) && gd.phase.type !== 'spin');
        this.wheel.clearPlan(0); this.spinT = null; this.spinStage = null;
        this.chips.sync(this.ents(gd));
        this.chips.finish();
        this.applyLeaders(gd);
        this.setRound(gd);
        this.firstSweep = !gd.players.some((x) => (x.drops || []).length);
        const t = gd.phase.type;
        if (t === 'spin') { this.push(this.evSpin(gd, gd.phase.data || {})); return; }
        if (ended(t)) { this.push(this.evWinner(gd, gd.phase.data || {}, true)); return; }
        this.push(this.evNext(gd, gd.activeIdx, true));
    }

    /** leader rims, wheel glows, standings and the crown, exactly as the engine says */
    applyLeaders(gd) {
        const colors = new Array(37).fill(null);
        for (const c of gd.zh.cells || []) {
            const s = c.leader != null ? this.seatOf(gd, c.leader) : -1;
            const col = s >= 0 ? this.color(s) : null;
            this.table.setLeader(c.pocket, col, c.tie || []);
            colors[c.pocket] = col || ((c.tie || []).length ? GOLD : null);
        }
        this.wheel.setLeaders(colors);
        this.hud.setStandings(gd.zh.standings || [], gd.zh.favourite != null ? this.seatOf(gd, gd.zh.favourite) : -1);
        this.shownCells = JSON.stringify((gd.zh.cells || []).map((c) => c.leader));
    }
    setRound(gd) {
        this.hud.setRound(gd.zh.round, gd.zh.hot);
        this.board.setHot(gd.zh.hot);
    }
    cut(name, p = {}) { this.director.set(name, p, true); }
    move(name, p = {}) { this.director.set(name, p, false); }
    setActive(i) { this.active = i; this.hud.setActive(i); }
    throwerCard(gd, i, upNext = false) {
        const th = throwerOf(gd, i), pl = gd.players[i];
        this.hud.thrower({ name: (upNext ? 'UP NEXT · ' : '') + (th?.name || pl.name), team: gd.isDoublesLineup ? teamName(gd, i) : '', color: this.color(i) });
    }

    // ------------------------------------------------------------ events
    evNext(gd, i, quick = false) {
        return {
            dur: quick ? 0.05 : 0.3,
            steps: [[0, () => {
                this.board.clear();
                this.setActive(i);
                this.throwerCard(gd, i);
                this.hud.setDarts([], 0);
                this.hud.hidePlacings();
                if (gd.zh.shootout) this.hud.show('SHOOTOUT', `${teamName(gd, i)} · ONE DART · HIGHEST SCORE WINS`, { kind: 'shootout', color: this.color(i), ms: 1800 });
                if (this.director.shot.name !== 'master' && !this.spinT) this.cut('master');
            }]],
        };
    }

    evDart(gd, i, k, hold) {
        const lt = gd.lastThrow, color = this.color(i);
        const darts = (gd.turnDarts || []).slice(0, k + 1);
        const pts = gd.zh.shootout ? (lt.points || 0) : (gd.zh.lastVisit && gd.throwsThisTurn >= 3 ? gd.zh.lastVisit.points : (gd.zh.visit?.points || 0));
        const key = `${gd.players[i].id}|${gd.zh.round}|${gd.zh.shootout ? 's' + gd.zh.shootout.round : ''}|${k}`;
        const steps = [[0, () => {
            this.note('throw', { k });
            if (this.active !== i) this.setActive(i);
            this.board.throwIn(lt, key, color, {
                onImpact: () => {
                    this.note('impact', { k, label: lt.label, hot: !!lt.hot });
                    this.hud.setDarts(darts, pts);
                    if (!gd.zh.shootout) this.chips.setTray(i, pts);
                    if (lt.hot) {
                        this.board.flare(lt.number);
                        this.director.addTrauma(0.35);
                        this.hud.show('HOT ×3', `${lt.label} · ${lt.base} → ${lt.points}`, { kind: 'hot', color: GOLD, ms: 1300 });
                        this.board.pulseInset();
                    }
                },
            });
        }]];
        return { dur: hold ? FLIGHT_S + (lt.hot ? 1.0 : 0.45) : FLIGHT_S + 0.08, steps };
    }

    /** the signature: a visit's chips leave the tray and slide onto their numbers */
    evSweep(gd) {
        const lv = gd.zh.lastVisit, i = this.seatOf(gd, lv.playerId), color = this.color(i);
        const name = lv.playerName || teamName(gd, i);
        const prevFav = lv.favouriteBefore, fav = lv.favourite;
        const first = this.firstSweep; this.firstSweep = false;
        return {
            dur: 1.4,
            steps: [
                [0, () => {
                    this.hud.show(`${name} SCORES ${lv.points}`, lv.points ? `+${lv.points} CHIPS${lv.hotDarts ? ` · ${lv.hotDarts} HOT` : ''}` : 'NO CHIPS THIS VISIT', { kind: 'visit', color, ms: 1500 });
                    if (first && lv.points) this.cut('visit', { seat: i }); else if (this.director.shot.name !== 'master') this.move('master');
                }],
                [0.3, () => {
                    this.note('sweep', { drops: lv.drops.length });
                    this.chips.sync(this.ents(gd), {
                        playerId: lv.playerId, round: lv.round,
                        onLand: (drop) => { this.table.flash(drop.pocket, color, 0.9); this.wheel.flashPocket(drop.pocket, 0.6); this.note('land', { pocket: drop.pocket }); },
                        onDone: () => {
                            this.note('sweep-done', { steals: lv.steals.length });
                            this.applyLeaders(this.gd.zh.lastVisit === lv || visitKey(this.gd.zh.lastVisit) === visitKey(lv) ? this.gd : gd);
                            for (const s of lv.steals) this.table.flash(s.pocket, color, 1.6);
                            const busyTitle = this.gd.phase.type === 'round_announce' || this.gd.phase.type === 'spin';
                            if (busyTitle) return;
                            if (fav && fav !== prevFav && prevFav) this.hud.show('NEW FAVOURITE', `${this.nameOf(gd, fav)} · ${this.chanceText(gd, fav)}`, { kind: 'fav', color: this.color(this.seatOf(gd, fav)), ms: 1600 });
                            else if (this.notableSteals(lv).length === 1) { const s = this.notableSteals(lv)[0]; this.hud.show(`${name} TAKES ${s.pocket}`, `FROM ${this.nameOf(gd, s.from)}`, { kind: 'steal', color, ms: 1500 }); }
                            else if (this.notableSteals(lv).length > 1) this.hud.show(`${name} TAKES ${this.notableSteals(lv).length} NUMBERS`, this.notableSteals(lv).map((s) => s.pocket).join(' · '), { kind: 'steal', color, ms: 1600 });
                        },
                    });
                    if (this.fast) this.chips.finish();
                }],
                [1.3, () => { if (this.director.shot.name === 'visit') this.move('master'); }],
            ],
        };
    }
    /** a steal worth a card: the old leader had more than one drop's worth there */
    notableSteals(lv) { return (lv.steals || []).filter((s) => s.fromValue > 10); }
    chanceText(gd, id) { const s = (gd.zh.standings || []).find((x) => x.id === id); return s ? `${s.numbersLed} NUMBERS · ${Math.round(s.chancePct)}%` : ''; }

    evIntermission(gd, d, afterVisit) {
        const i = d.nextPlayerIndex ?? 0;
        if (d.shootout) {
            const names = (d.ids || []).map((id) => this.nameOf(gd, id)).join(' · ');
            return { dur: 1.6, steps: [[0, () => { this.board.clear(); this.setActive(i); this.throwerCard(gd, i, true); this.hud.show(d.reason === 'zero' ? 'NOBODY SCORED' : 'LEVEL ON THE NUMBER', `SHOOTOUT · ${names} · ONE DART EACH`, { kind: 'shootout', color: GOLD, ms: 1500 }); }]] };
        }
        const st = (gd.zh.standings || [])[i] || { numbersLed: 0, chancePct: 0 };
        const sub = `${teamName(gd, i)} · ${st.numbersLed} ${st.numbersLed === 1 ? 'NUMBER' : 'NUMBERS'} · ${Math.round(st.chancePct)}%`;
        if (afterVisit) return { dur: 0.3, steps: [[0, () => { this.setActive(i); this.throwerCard(gd, i, true); this.hud.setDarts([], 0); }]] };
        return {
            dur: 1.6,
            steps: [[0, () => {
                this.board.clear(); this.setActive(i); this.throwerCard(gd, i, true); this.hud.setDarts([], 0);
                this.hud.show(d.last ? 'LAST VISIT' : 'UP NEXT', sub, { kind: 'next', color: this.color(i), ms: 1500 });
            }]],
        };
    }

    evRound(gd, d, afterVisit) {
        const r = d.round || gd.zh.round, hot = gd.zh.hot, last = r >= 5;
        return {
            dur: afterVisit ? 2.0 : 2.6,
            steps: [
                [0, () => {
                    this.hud.hideThrower();
                    this.hud.show(last ? 'LAST ORDERS' : `ROUND ${r}`, `${last ? 'ROUND 5 · ' : ''}HOT NUMBERS ${hot.join(' · ')}`, { kind: last ? 'final' : 'round', color: GOLD, ms: 2400 });
                }],
                [0.5, () => { this.setRound(gd); this.board.pulseInset(); this.note('hot', { hot }); }],
            ],
        };
    }

    /** ALL BETS ARE DOWN: the room dims, every cell shows who'd win on it, then the wheel */
    evSpin(gd, d) {
        return {
            dur: 0.2,
            steps: [[0, () => {
                this.hud.hideThrower(); this.board.clear(); this.hud.hidePlacings();
                this.applyLeaders(gd);
                this.table.setMap(true); this.wheel.setMap(true); this.room.setDim(1); this.board.setInset(false);
                this.wheel.planSpin(d.draws, d.durations, `${gd.zh.commit}`);
                const started = gd.phase.startedAt || Date.now();
                this.spinT = Math.max(0, (Date.now() + this.clockOffset - started) / 1000);
                if (this.spinT > 60) this.spinT = 0; // a clock that's way off: play it from the start
                this.spinStage = { shown: {} };
                this.note('spin', { draws: d.draws, at: this.spinT });
            }]],
        };
    }

    /** the spin's camera and cards, from the wheel's own timeline */
    spinDirect() {
        const gd = this.gd, S = this.spinStage; if (!S || this.spinT == null) return;
        const st = this.wheel.at(this.spinT), once = (k, f) => { if (!S.shown[k]) { S.shown[k] = 1; f(); } };
        const sp = gd.zh.spin;
        if (st.mode === 'pre') {
            once('pre', () => { this.cut('table'); this.hud.show('ALL BETS ARE DOWN', 'RIEN NE VA PLUS', { kind: 'bets', color: GOLD, ms: 3800 }); });
        } else if (st.mode === 'spin') {
            once('seg' + st.i, () => { this.cut('wheel'); this.note('spin-seg', { i: st.i }); });
            if (st.u > 0.55) once('ball' + st.i, () => this.move('ball'));
            if (st.u > 0.93 && st.i < this.wheel.plan.segments.length - 1) once('empty' + st.i, () => this.hud.show(`NO CHIPS ON ${st.seg.pocket}`, 'SPIN AGAIN', { kind: 'empty', color: GOLD, ms: 1500 }));
        } else if (st.mode === 'done') {
            once('reveal', () => {
                const n = st.seg.pocket, rows = (sp && sp.rows) || [];
                const top = rows[0], second = rows[1];
                const s = top ? this.seatOf(gd, top.id) : -1;
                this.cut('cell', { n });
                this.table.hold(n, s >= 0 ? this.color(s) : GOLD);
                this.wheel.flashPocket(n, 2);
                const bits = [];
                if (top) bits.push(`${this.nameOf(gd, top.id)} ${top.onPocket}`);
                if (second && second.onPocket) bits.push(`${this.nameOf(gd, second.id)} ${second.onPocket}`);
                if (sp && sp.tiedTop && sp.tiedTop.length > 1) bits.push('LEVEL — SHOOTOUT');
                else if (sp && second && second.onPocket && sp.margin === 0) bits.push('LEVEL — MORE POINTS WINS');
                else if (sp && second && second.onPocket && sp.margin <= 10) bits.push('ONE DROP IN IT');
                this.hud.show(`NUMBER ${n}`, bits.join(' · '), { kind: 'number', color: s >= 0 ? this.color(s) : GOLD, ms: 0 });
                this.note('reveal', { n, under: this.wheel.pocketUnderBall() });
            });
        }
    }

    evWinner(gd, d, instant = false) {
        const i = this.seatOf(gd, d.winnerId), color = i >= 0 ? this.color(i) : GOLD;
        const rows = (gd.zh.placings || []).map((r) => ({ ...r, name: this.nameOf(gd, r.id), color: this.color(this.seatOf(gd, r.id)) }));
        const pocket = d.pocket;
        const win = rows.find((r) => r.id === d.winnerId);
        const upset = win && win.pointsRank > 1 ? `FROM ${ordinal(win.pointsRank)} ON POINTS` : '';
        return {
            dur: instant ? 0.1 : 1,
            steps: [
                [0, () => {
                    this.note('winner', { id: d.winnerId, pocket });
                    // the spin is over: its camera and cards stop here
                    if (this.spinStage) { this.spinStage.shown.reveal = 1; for (let k = 0; k < 9; k++) this.spinStage.shown['seg' + k] = this.spinStage.shown['ball' + k] = this.spinStage.shown['empty' + k] = 1; this.spinStage.shown.pre = 1; }
                    if (this.wheel.plan && this.spinT != null) this.spinT = Math.max(this.spinT, this.wheel.plan.endAt + 0.01);
                    if (instant && gd.zh.spin) { this.wheel.planSpin(gd.zh.spin.draws, gd.zh.spin.durations, `${gd.zh.commit}`); this.spinT = this.wheel.plan.endAt + 0.01; this.spinStage = { shown: { pre: 1, reveal: 1 } }; for (let k = 0; k < 9; k++) this.spinStage.shown['seg' + k] = this.spinStage.shown['ball' + k] = this.spinStage.shown['empty' + k] = 1; }
                    this.hud.hideThrower(); this.board.clear();
                    this.applyLeaders(gd);
                    this.room.setDim(0.45); this.table.setMap(false); this.board.setInset(false);
                    if (pocket != null) this.table.hold(pocket, color);
                    const sub = d.reason === 'shootout' ? `${d.winnerName} · WINS THE SHOOTOUT` : `${d.winnerName}${pocket != null ? ` · ${d.onPocket} ON ${pocket}` : ''}`;
                    this.hud.show('WINS ZERO HOUR', [sub, upset].filter(Boolean).join(' · '), { kind: 'winner', color, ms: 0 });
                    // the gold sweep: every number the winner leads lights in turn, left to right across the felt
                    const mine = (gd.zh.cells || []).filter((c) => c.leader === d.winnerId).map((c) => c.pocket).sort((a, b) => this.table.cellPos(a).x - this.table.cellPos(b).x);
                    mine.forEach((n, k) => setTimeout(() => this.table.flash(n, color, 1.3), instant ? 0 : 400 + k * 90));
                    if (pocket != null) this.cut('cell', { n: pocket }); else this.cut('table');
                    if (window.FlightDeckWinnerVideo) FlightDeckWinnerVideo.playIn(this.hud.winnerScreen);
                    this.hud.winnerScreen.classList.toggle('is-on', this.video);
                }],
                [instant ? 0 : 3.2, () => { this.hud.hideTitle(); this.hud.showPlacings(rows, pocket); this.move('table'); }],
            ],
        };
    }

    // ------------------------------------------------------------ frame
    update(dt) {
        const k = this.fast ? 2 : 1;
        const idle = this.runQueue(dt * k);
        if (this.spinT != null) { this.spinT += dt; this.spinDirect(); }
        this.wheel.update(dt, this.spinT);
        this.chips.update(dt * k);
        if (idle && !this.chips.busy && this.dirty) this.reconcile();
    }

    reconcile() {
        const gd = this.gd; if (!gd) return;
        this.dirty = false;
        this.chips.sync(this.ents(gd)); this.chips.finish();
        this.applyLeaders(gd);
        const t = gd.phase.type;
        if (this.hud.hotNums.dataset.hot !== gd.zh.hot.join(',') || Number(this.hud.round.dataset.round) !== gd.zh.round) this.setRound(gd);
        if (t === 'playing' && !gd.zh.shootout) {
            if (this.active !== gd.activeIdx) this.setActive(gd.activeIdx);
            this.hud.setDarts((gd.turnDarts || []).slice(0, gd.throwsThisTurn), gd.throwsThisTurn >= 3 && gd.zh.lastVisit ? gd.zh.lastVisit.points : gd.zh.visit?.points || 0);
            if (gd.throwsThisTurn < 3) this.chips.setTray(gd.activeIdx, gd.zh.visit?.points || 0);
            if (this.board.shown.length > gd.throwsThisTurn) this.board.clear();
        }
    }

    /** what the scene shows right now (for the nothing-lies check) */
    truth() {
        const gd = this.gd;
        const cells = this.table.cells.map((c) => ({ pocket: c.n, rim: c.color || null }));
        const strip = this.hud.cards.map((C) => ({ numbers: Number(C.c.dataset.numbers), chance: Number(C.c.dataset.chance), points: Number(C.c.dataset.points), fav: C.c.classList.contains('is-fav') }));
        return {
            settled: this.queueIdle && !this.chips.busy && !this.board.busy && !this.dirty,
            chips: this.chips.shown(),
            cells, strip,
            hot: this.hud.hotNums.dataset.hot || '',
            round: Number(this.hud.round.dataset.round) || null,
            boardHot: this.board.hot.slice(),
            wheel: { state: this.wheel.state, under: this.wheel.pocketUnderBall(), t: this.spinT },
            darts: this.board.shown.length,
            busy: { ...this.queueBusy(), chips: this.chips.busy, board: this.board.busy },
        };
    }
}
