// State → The Ledger. Every gameData (host SYNC_STATE or ?demo=1) is diffed against the one before into timed events
// on the kit's StateQueue: round announce, intermission (up next), next visit, dart (throw-in → impact → mark flood /
// strike drain), and the verdict moments (became killer, stripped, death, ×2/×3), winner, draw. A dart's own event
// is short, so the next dart reacts at once; its wedge animation runs on the board (SEG_S per band, sequential,
// inside the server's 900 ms beat) and a verdict moment starts when that animation has finished, inside the
// server's window (3 s, or the video-mode window).
//
// When the queue is idle the view RECONCILES to the state (nothing lies): each wedge's lit bands = killerMarks (3 for
// a killer, 0 when out), killer flags, out players shattered and struck through, the visit's darts, the round.
import * as THREE from 'three';
import { StateQueue } from '../lib3d/kit/queue.js';
import { members, teamName, throwerOf } from '../lib3d/kit/roster.js';
import { wedgeAngle } from '../lib3d/kit/darts.js';
import { SEG_S, FLIGHT_S, V, teamColor, roundMult, rng, CRIMSON, GOLD } from './common.js';

const CLIPS = { became: '/assets/killer/became-charon.mp4', lost: '/assets/killer/lost-excommunicado.mp4', death: '/assets/killer/elim-skyfall-take-the-shot.mp4' };
const litOf = (p) => (!p || p.lives < 0 ? 0 : p.isKiller ? 3 : Math.max(0, Math.min(3, Number(p.killerMarks) || 0)));

export class Game extends StateQueue {
    constructor(o) {
        super();
        Object.assign(this, o); // engine, board, darts, fx, director, hud, room, world, ctx, agents, buildAgents, feel
        this.prev = null; this.gd = null;
        this.video = false;
        this.rnd = rng(7);
        this.clipOk = {}; this.probed = false;
        this.first = true;
    }

    /** the host's whole state (video mode, clip lists) */
    onState(state) {
        this.video = state.viewerVideoEnabled === true;
        // the clips are operator-supplied (not shipped): look for them once video mode is on, play one only if present
        if (this.video && !this.probed) {
            this.probed = true;
            for (const [k, url] of Object.entries(CLIPS)) fetch(url, { method: 'HEAD' }).then((r) => { this.clipOk[k] = r.ok && /video/.test(r.headers.get('content-type') || ''); }).catch(() => {});
        }
        if (window.FlightDeckWinnerVideo) FlightDeckWinnerVideo.applyFromState(state);
    }

    // ------------------------------------------------------------ state in
    sync(gd) {
        if (!gd || gd.gameType !== 'killer' || !Array.isArray(gd.players) || !gd.players.length) return;
        const p = this.prev;
        this.gd = gd;
        const rosterChanged = !p || p.players.length !== gd.players.length || p.players.some((x, i) => x.id !== gd.players[i].id || x.targetNumber !== gd.players[i].targetNumber);
        const ended = (ph) => ph === 'winner' || ph === 'draw';
        const newGame = p && ended(p.phase.type) && !ended(gd.phase.type);
        if (rosterChanged || newGame) { this.setup(gd); this.prev = gd; return; }
        this.hud.setHelp(gd.helpVisible);
        const a = gd.activeIdx, pt = p.phase.type, t = gd.phase.type;
        const newPhase = t !== pt || gd.phase.startedAt !== p.phase.startedAt;

        if (newPhase && t === 'round_announce') this.push(this.evRound(gd.phase.data || {}));
        if (newPhase && t === 'intermission') this.push(this.evIntermission(gd, gd.phase.data || {}));

        // the turn moved on: a new thrower, or the same (sole survivor) starting a new visit
        const turnMoved = gd.throwsThisTurn === 0 && (p.activeIdx !== a || p.throwsThisTurn > 0) && t === 'playing';
        if (turnMoved) this.push(this.evNext(gd, a));
        // a dart: the thrower's dart count went up (or a different thrower has darts on the board)
        const isDart = !!gd.lastThrow && ((a === p.activeIdx && gd.throwsThisTurn > p.throwsThisTurn) || (a !== p.activeIdx && gd.throwsThisTurn > 0));
        let dart = null;
        if (isDart) {
            if (a !== p.activeIdx && !turnMoved) this.push(this.evNext(gd, a, true));
            dart = this.readDart(gd, p, a);
            this.push(this.evDart(gd, dart));
        }
        // verdicts: read with the dart that caused them (the server moves on in 3 s)
        if (newPhase) {
            const d = gd.phase.data || {};
            const V_ = { became_killer: 'became', lost_killer: 'lost', death: 'death', mult_boost: 'boost', mult_knock: 'knock' }[t];
            if (V_) {
                if (dart) this.push(this.evMoment(V_, gd, dart, d));
                else this.push(this.evPreview(V_, gd, d)); // a debug preview with made-up data: titles only
            }
            if (t === 'winner') this.push(this.evWinner(gd, d));
            if (t === 'draw') this.push(this.evDraw(gd, d));
        }
        this.prev = gd;
    }

    /** a dart as the state reports it: who threw, what it did, to whom, which segments */
    readDart(gd, p, a) {
        const lt = gd.lastThrow, thrower = gd.players[a];
        const victim = lt.victimId != null ? gd.players.findIndex((x) => x.id === lt.victimId) : -1;
        return {
            k: gd.throwsThisTurn - 1, t: lt, i: a, n: thrower.targetNumber, effect: lt.effect === 'mark' || lt.effect === 'strike' ? lt.effect : null,
            victim, vn: victim >= 0 ? gd.players[victim].targetNumber : null,
            segs: lt.effect === 'mark' ? (lt.markSegments || []) : lt.effect === 'strike' ? (lt.strikeSegments || []) : [],
            mult: lt.multiplier || 1,
        };
    }
    /** seconds from the dart event's start until its wedge animation has finished */
    animEnd(dart) { return FLIGHT_S + dart.segs.length * SEG_S + 0.05; }
    /** the server's window for an overlay moment (after the wedge animation), video mode or not */
    window(kind) { return this.video ? { became: 5.5, death: 5.5, lost: 5.2 }[kind] || 3 : 3; }

    /** a new roster or a new game: build the agents, place everything from the state as it stands */
    setup(gd) {
        this.clearQueue();
        const players = gd.players.map((pl, i) => ({ name: teamName(gd, i), avatar: members(gd, i)[0]?.avatar || pl.avatar || null, color: teamColor(i), number: pl.targetNumber }));
        this.buildAgents(players);
        this.world?.clear();
        this.board.setPlayers(players.map((x) => ({ number: x.number, color: x.color })));
        this.hud.setPlayers(players);
        this.hud.setHelp(gd.helpVisible); this.hud.setWinner(false); this.hud.hideTitle();
        this.darts.clear(true);
        this.fx.goldLeaf(V(), false);
        gd.players.forEach((pl, i) => this.snapPlayer(gd, i));
        this.setHeat(roundMult(gd.currentRound), true);
        this.hud.setRound(gd.currentRound, roundMult(gd.currentRound));
        this.stopClips();
        if (this.first) { this.first = false; this.push({ dur: 2.2, steps: [[0, () => this.cut('round')], [1.6, () => this.cut('master')]] }); }
        if (gd.phase.type === 'winner') { this.push(this.evWinner(gd, gd.phase.data || {})); return; }
        if (gd.phase.type === 'draw') { this.push(this.evDraw(gd, gd.phase.data || {})); return; }
        this.push(this.evNext(gd, gd.activeIdx, true));
    }
    /** put a player's wedge, agent and ledger card exactly where the state says (no animation) */
    snapPlayer(gd, i) {
        const pl = gd.players[i], A = this.agents[i]; if (!pl || !A) return;
        const out = pl.lives < 0, killer = !!pl.isKiller && !out;
        this.board.setLit(pl.targetNumber, litOf(pl));
        this.board.setKiller(pl.targetNumber, killer, true);
        this.board.setDead(pl.targetNumber, out, true);
        A.setKiller(killer, true);
        if (out && !A.out) A.shatter(null); else if (!out && A.out) A.revive();
        A.rise(false);
        this.hud.setLedger(i, { lit: litOf(pl), killer, out });
    }

    cut(name, p = {}) { this.director.set(name, p, true); }
    move(name, p = {}) { this.director.set(name, p, false); }
    setHeat(level, instant = false) { this.heat = level; this.room.setHeat(level - 1, instant); this.board.setHeat(level - 1); this.audio?.setHeat?.(level - 1); }

    // ------------------------------------------------------------ events
    evNext(gd, i, quick = false) {
        const th = throwerOf(gd, i), pl = gd.players[i];
        return {
            dur: quick ? 0.05 : 0.4,
            steps: [[0, () => {
                this.darts.clear();
                this.ctx.active = i;
                this.agents.forEach((A, k) => A.setActive(k === i));
                this.board.setActive(pl.targetNumber);
                this.room.focus(this.agents[i]?.group.position, teamColor(i));
                this.hud.setActive(i);
                this.hud.thrower({ name: th?.name || pl.name, team: gd.isDoublesLineup ? teamName(gd, i) : '', avatar: th?.avatar || pl.avatar || null, color: teamColor(i), number: pl.targetNumber });
                this.hud.status({ killer: pl.isKiller, lit: litOf(pl) });
                if (this.director.shot.name !== 'master') this.cut('master');
            }]],
        };
    }

    evIntermission(gd, d) {
        const i = d.nextPlayerIndex ?? gd.players.findIndex((x) => x.targetNumber === d.targetNumber);
        const A = this.agents[i], pl = gd.players[i];
        return {
            dur: 2.3,
            steps: [
                [0, () => {
                    this.darts.clear();
                    if (A) { this.room.focus(A.group.position, teamColor(i)); this.cut('agent', { agent: A }); this.agents.forEach((x, k) => x.setActive(k === i)); this.board.setActive(pl.targetNumber); }
                    this.hud.show('UP NEXT', `${d.nextPlayerName || pl?.name || 'PLAYER'} · NUMBER ${d.targetNumber ?? pl?.targetNumber ?? ''}`, { kind: 'next', color: teamColor(Math.max(0, i)), ms: 2000 });
                    this.audio?.next?.();
                }],
                [2.05, () => this.cut('master')],
            ],
        };
    }

    evRound(d) {
        const r = d.round || 1, mult = d.multiplier || roundMult(r);
        return {
            dur: 2.8,
            steps: [
                [0, () => {
                    this.darts.clear();
                    this.cut('round');
                    this.hud.setRound(r, mult);
                    this.hud.show(`${d.eyebrow || 'CONTRACT ROUND'} ${r}`, d.subtitle || (d.maxRounds ? `OF ${d.maxRounds}` : ''), { kind: 'round', color: mult >= 3 ? CRIMSON : GOLD, ms: 2500 });
                    this.audio?.round?.(mult);
                }],
                [0.5, () => this.setHeat(mult)],
                [2.45, () => this.cut('master')],
            ],
        };
    }

    evDart(gd, D) {
        const pl = gd.players[D.i], color = teamColor(D.i), B = this.board;
        const victimA = D.victim >= 0 ? this.agents[D.victim] : null;
        const phase = gd.phase.type;
        const deadly = phase === 'death';
        return {
            dur: FLIGHT_S + 0.08,
            steps: [[0, () => {
                this.hud.dart(D.k, D.t, D.effect);
                const rec = this.darts.throwIn(D.t, color, this.rnd, {
                    onImpact: () => {
                        this.director.addTrauma(0.05 + (D.t.dartMultiplier || 1) * 0.03);
                        this.audio?.thunk?.(D);
                        if (D.effect === 'mark') {
                            B.pulse(D.n);
                            B.flood(D.n, D.segs, { onSeg: () => this.audio?.markSeg?.() });
                            this.agents[D.i]?.recoil(0.15);
                        } else if (D.effect === 'strike') {
                            this.agents[D.i]?.fire();
                            B.trace(D.n, D.vn, 0.4, this.agents[D.i]?.killer ? CRIMSON : color);
                            B.drain(D.vn, D.segs, { onSeg: () => { victimA?.recoil(0.7); this.director.addTrauma(0.12); this.audio?.crack?.(); } });
                            if (!D.segs.length) victimA?.recoil(0.6);
                        }
                    },
                });
                D.rec = rec;
                // cameras from the state: a fatal dart is ridden in; a strike is seen from the killer's side
                if (deadly) this.cut('dartcam', { at: rec.at });
                else if (D.effect === 'strike' && victimA && phase === 'playing') this.cut('strike', { from: this.agents[D.i], to: victimA });
                else if (this.director.shot.name !== 'master' && phase === 'playing') this.move('master');
                // the status line follows the thrower's own wedge
                const after = gd.players[D.i];
                this.hud.status({ killer: after.isKiller, lit: litOf(after) });
            }]],
        };
    }

    /** a verdict moment, after the dart's wedge animation; fits the server's window in both video modes */
    evMoment(kind, gd, D, d) {
        const wait = Math.max(0, this.animEnd(D) - (FLIGHT_S + 0.08)); // the dart event already took FLIGHT_S + .08
        const win = this.window(kind);
        const len = Math.min(win - 0.35, kind === 'boost' || kind === 'knock' ? 1.7 : 2.7);
        const ext = this.video && this.clipOk[kind] ? Math.max(len, win - 0.4) : len;
        const steps = [];
        const at = (t, fn) => steps.push([wait + t, fn]);
        const A = this.agents[D.i], V_ = D.victim >= 0 ? this.agents[D.victim] : null;
        const name = (i) => (gd.players[i] ? teamName(gd, i) : '');
        if (kind === 'became') {
            at(0, () => {
                this.board.setKiller(D.n, true); A?.setKiller(true);
                if (A) this.fx.flare(A.group.position, new THREE.Color(CRIMSON)); this.fx.wireSparks(this.board.wedgePoint(D.n, 20), this.board.wedgePoint(D.n, 168), new THREE.Color(GOLD), 60);
                this.cut('orbit', { agent: A, r: 5.2, h: 2.3, speed: 0.34 });
                if (A) this.room.moment(A.group.position, CRIMSON);
                this.hud.show('KILLER', `${d.playerName || name(D.i)} · LICENSED`, { kind: 'killer', color: CRIMSON, ms: (ext - 0.3) * 1000 });
                this.hud.status({ killer: true, lit: 3 });
                this.playClip('became');
                this.audio?.became?.();
            });
        } else if (kind === 'lost') {
            at(0, () => {
                this.board.setKiller(D.vn, false); V_?.setKiller(false);
                this.cut('agent', { agent: V_ });
                this.director.addTrauma(0.25);
                this.hud.show('STRIPPED', `${d.playerName || name(D.victim)} · BY ${d.attackerName || name(D.i)}`, { kind: 'stripped', color: '#9aa3ad', ms: (ext - 0.3) * 1000 });
                this.playClip('lost');
                this.audio?.stripped?.();
            });
        } else if (kind === 'death') {
            at(0, () => {
                this.cut('death', { agent: V_ });
                this.room.lampOut(V_?.group.position);
                this.audio?.death?.();
            });
            at(0.35, () => {
                if (V_) { V_.shatter(this.world, 1.2); this.fx.burst(V_.group.position, V_.color); }
                this.board.setKiller(D.vn, false); this.board.setDead(D.vn, true);
                this.director.addTrauma(0.5); this.feel.flash = 0.28;
                this.hud.show('ELIMINATED', `${d.victimName || name(D.victim)} · BY ${d.attackerName || name(D.i)}`, { kind: 'death', color: CRIMSON, ms: (ext - 0.6) * 1000 });
                this.hud.setLedger(D.victim, { lit: 0, killer: false, out: true });
                this.playClip('death');
            });
        } else if (kind === 'boost') {
            at(0, () => {
                this.fx.wireSparks(this.board.wedgePoint(D.n, 20), this.board.wedgePoint(D.n, 168), new THREE.Color(GOLD), 50);
                this.hud.show(`×${d.multiplier || D.t.dartMultiplier} MARKED`, `+${d.steps ?? D.segs.length} · ${String(d.quip || '').toUpperCase()}`, { kind: 'boost', color: teamColor(D.i), ms: 1400 });
                this.audio?.boost?.();
            });
        } else if (kind === 'knock') {
            at(0, () => {
                this.director.addTrauma(0.3);
                this.hud.show(`×${d.multiplier || D.t.dartMultiplier} KNOCKED`, `${d.playerName || name(D.victim)} −${d.steps ?? D.segs.length}`, { kind: 'knock', color: CRIMSON, ms: 1400 });
                this.audio?.knock?.();
            });
        }
        at(ext, () => { this.stopClips(); const ph = this.gd.phase.type; if (ph !== 'winner' && ph !== 'draw' && ph !== 'intermission' && ph !== 'round_announce') this.cut('master'); });
        return { dur: wait + ext + 0.05, steps };
    }

    /** a forced debug preview (made-up data, no dart): titles only, the board is left alone */
    evPreview(kind, gd, d) {
        const T = {
            became: ['KILLER', d.playerName, CRIMSON], lost: ['STRIPPED', d.playerName, '#9aa3ad'], death: ['ELIMINATED', d.victimName, CRIMSON],
            boost: [`×${d.multiplier || 2} MARKED`, d.playerName, GOLD], knock: [`×${d.multiplier || 2} KNOCKED`, d.playerName, CRIMSON],
        }[kind];
        return { dur: 0.1, steps: [[0, () => this.hud.show(T[0], T[1] || '', { kind, color: T[2], ms: 2600 })]] };
    }

    evWinner(gd, d) {
        const i = Math.max(0, gd.players.findIndex((x) => x.id === d.winnerId));
        const why = { sole_killer: 'SOLE CLEARANCE', wedges: 'MOST WEDGES', last_standing: 'LAST ONE STANDING' }[d.reason] || 'LAST ONE STANDING';
        return {
            dur: 1,
            steps: [[0, () => {
                const A = this.agents[i];
                this.darts.clear();
                this.ctx.active = i;
                this.agents.forEach((x, k) => x.setActive(k === i));
                this.hud.setActive(i); this.hud.setWinner(true);
                this.hud.show('WINNER', d.winnerName || teamName(gd, i), { kind: 'winner', color: teamColor(i), ms: 0 });
                this.hud.title.root.dataset.why = why;
                if (A) {
                    A.rise(true);
                    this.cut('orbit', { agent: A, r: 6.2, h: 3.0, speed: 0.14 });
                    this.room.winner(A.group.position, teamColor(i));
                    this.fx.goldLeaf(A.group.position, true);
                }
                if (window.FlightDeckWinnerVideo) FlightDeckWinnerVideo.playIn(this.hud.winnerScreen);
                this.hud.winnerScreen.classList.toggle('is-on', this.video);
                this.audio?.winner?.();
            }]],
        };
    }

    evDraw(gd, d) {
        const list = Array.isArray(d.contenders) ? d.contenders : [];
        const names = list.map((c) => c.name).filter(Boolean);
        const idx = list.map((c) => gd.players.findIndex((x) => x.id === c.id)).filter((i) => i >= 0);
        return {
            dur: 1,
            steps: [[0, () => {
                this.darts.clear();
                this.agents.forEach((x, k) => { x.setActive(idx.includes(k)); x.rise(false); });
                for (const k of idx) this.agents[k].liftTo = 0.55;
                this.hud.setWinner(true);
                this.hud.show('A DRAW', names.join(' · ') || 'NO SURVIVORS', { kind: 'draw', color: GOLD, ms: 0 });
                this.hud.title.root.dataset.why = d.reason === 'killers' ? 'KILLERS STILL STANDING' : d.reason === 'wedges' ? 'MATCHED WEDGES' : 'SHARED CLEARANCE';
                this.cut('round');
                this.room.winner(V(0, 0, 0), GOLD, 0.5);
                if (window.FlightDeckWinnerVideo) FlightDeckWinnerVideo.playIn(this.hud.winnerScreen);
                this.hud.winnerScreen.classList.toggle('is-on', this.video);
                this.audio?.winner?.();
            }]],
        };
    }

    // ------------------------------------------------------------ video mode
    playClip(kind) {
        if (!this.video || !this.clipOk[kind] || !window.FlightDeckWinnerVideo) return;
        this.hud.eventScreen.classList.add('is-on');
        FlightDeckWinnerVideo.playFixedIn(this.hud.eventScreen, CLIPS[kind]);
    }
    stopClips() {
        this.hud.eventScreen.classList.remove('is-on');
        if (window.FlightDeckWinnerVideo) FlightDeckWinnerVideo.stop(this.hud.eventVideo);
    }

    // ------------------------------------------------------------ frame
    update(dt) {
        if (this.runQueue(dt)) this.reconcile();
    }

    /** nothing lies: once the queue is idle, the scene matches the state */
    reconcile() {
        const gd = this.gd; if (!gd) return;
        const ended = gd.phase.type === 'winner' || gd.phase.type === 'draw';
        gd.players.forEach((pl, i) => {
            const A = this.agents[i]; if (!A) return;
            const n = pl.targetNumber, out = pl.lives < 0, killer = !!pl.isKiller && !out, lit = litOf(pl);
            if (!this.board.busy && this.board.lit(n) !== lit) this.board.setLit(n, lit);
            if (this.board.killerShown(n) !== killer) this.board.setKiller(n, killer);
            if (this.board.deadShown(n) !== out) this.board.setDead(n, out);
            if (A.killer !== killer) A.setKiller(killer);
            if (out && !A.out) A.shatter(this.world, 0.6);
            if (!out && A.out) A.revive();
            this.hud.setLedger(i, { lit, killer, out });
        });
        if (!ended) {
            // the visit's darts: never more on the board than the state has thrown
            const shown = this.darts.shown;
            if (gd.phase.type !== 'intermission' && gd.phase.type !== 'round_announce' && shown.length > gd.throwsThisTurn) this.darts.clear();
            const mult = roundMult(gd.currentRound);
            if (this.heat !== mult) this.setHeat(mult);
            this.hud.setRound(gd.currentRound, mult);
            if (this.ctx.active !== gd.activeIdx && gd.phase.type === 'playing') {
                this.ctx.active = gd.activeIdx;
                this.agents.forEach((A, k) => A.setActive(k === gd.activeIdx));
                this.board.setActive(gd.players[gd.activeIdx]?.targetNumber);
                this.hud.setActive(gd.activeIdx);
            }
        }
    }

    /** what the scene shows right now (for the nothing-lies check) */
    truth() {
        const gd = this.gd;
        return {
            settled: this.queueIdle && !this.board.busy && !this.darts.busy,
            players: (gd ? gd.players : []).map((pl, i) => ({
                n: pl.targetNumber, lit: this.board.lit(pl.targetNumber), killer: !!this.agents[i]?.killer && this.board.killerShown(pl.targetNumber),
                out: !!this.agents[i]?.out && this.board.deadShown(pl.targetNumber),
            })),
            darts: this.darts.shown.map((r) => ({ bed: r.hit.bed, number: r.hit.number })),
            round: Number(this.hud.roundNum.textContent) || null, heat: this.heat, active: this.ctx.active,
            busy: { ...this.queueBusy(), board: this.board.busy, darts: this.darts.busy, clock: +this.engine.time.value.toFixed(2) },
        };
    }
}
