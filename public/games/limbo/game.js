// State → beach. Every gameData (host SYNC_STATE or ?demo=1) is diffed against the one before into an ordered queue
// of timed events: next thrower, dart, clear, hold, burn / no room (+ out), bar reset, winner. Each event plays its
// beats on its own clock; an event's later beats can run on ("tails") while the next one starts, so a dart that
// arrives mid-ratchet still reacts at once. Nothing is dropped or reordered: dart 3 and its verdict arrive in the
// same state and play in that order.
//
// When the queue is idle the view RECONCILES to the state (nothing lies): the bar to currentTargetBar, the ball to
// currentRunningTotal while playing, each totem's lit torches to its lives. truth() reports what's on screen.
import * as THREE from 'three';
import { BAR_START, V, teamColor, ballY, barY, BALL_R, BAR_R, heatOf } from './common.js';
import { StateQueue } from '../lib3d/kit/queue.js';
import { members, teamName, throwerOf } from '../lib3d/kit/roster.js';

const R = (a, b) => a + Math.random() * (b - a);

export class Game extends StateQueue {
    constructor(o) {
        super();
        Object.assign(this, o); // engine, flames, rig, ball, fx, director, hud, ctx, totems, buildTotems, feel, scene
        this.prev = null; this.gd = null;
        this.visitIdx = -1;
        this.fireworks = 0; this.fwT = 0; this.winnerColor = new THREE.Color();
        // the coconut (a miss): falls out of the sky onto the ball, bonks off
        this.nut = new THREE.Mesh(new THREE.IcosahedronGeometry(0.19, 1), new THREE.MeshStandardMaterial({ color: '#4a3220', roughness: 0.7, flatShading: true }));
        this.nut.castShadow = true; this.nut.visible = false; this.scene.add(this.nut);
        this.nutS = null;
        this.first = true;
    }

    // ------------------------------------------------------------ state in
    sync(gd) {
        if (!gd || gd.gameType !== 'limbo' || !Array.isArray(gd.players) || !gd.players.length) return;
        const p = this.prev;
        this.gd = gd;
        const rosterChanged = !p || p.players.length !== gd.players.length || p.players.some((x, i) => x.id !== gd.players[i].id);
        const newGame = p && p.phase.type === 'winner' && gd.phase.type !== 'winner';
        if (rosterChanged || newGame) { this.setup(gd); this.prev = gd; return; }
        this.hud.setHelp(gd.helpVisible);
        const a = gd.activeIdx, pt = p.phase.type, t = gd.phase.type;

        // the turn moved on (after a verdict, or the host skipped ahead): reset the bar if a life was lost, next thrower
        const turnMoved = t === 'playing' && gd.throwsThisTurn === 0 && (pt === 'life_loss' || pt === 'bar_status' || p.activeIdx !== a);
        if (turnMoved) {
            if (gd.currentTargetBar > p.currentTargetBar) this.push(this.evReset(gd.currentTargetBar));
            this.push(this.evNext(gd, a));
        }
        // a dart: the thrower's dart count went up (or a different thrower has darts on the board)
        const isDart = !!gd.lastThrow && ((a === p.activeIdx && gd.throwsThisTurn > p.throwsThisTurn) || (a !== p.activeIdx && gd.throwsThisTurn > 0));
        let dart = null;
        if (isDart) {
            if (a !== p.activeIdx && !turnMoved) this.push(this.evNext(gd, a));
            const base = a === p.activeIdx && pt === 'playing' ? p.currentRunningTotal : 0;
            const bar = a === p.activeIdx ? p.currentTargetBar : gd.currentTargetBar;
            dart = { k: gd.throwsThisTurn - 1, score: gd.lastThrow.score, miss: !!gd.lastThrow.miss, real: base + gd.lastThrow.score, bar, lifeLost: t === 'life_loss' && pt !== 'life_loss' };
            dart.over = dart.lifeLost && dart.real > bar;
            this.push(this.evDart(gd, a, dart));
        }
        // verdicts
        if (t === 'life_loss' && pt !== 'life_loss') {
            const d = gd.phase.data || {};
            if (dart) this.push(this.evBurn(gd, a, dart, d));
            else this.push(this.evTitle('BURNED!', d.playerName || '', 'burn'));      // forced preview: title only
        }
        if (t === 'bar_status' && (pt !== 'bar_status' || p.phase.startedAt !== gd.phase.startedAt)) {
            const d = gd.phase.data || {};
            if (dart) this.push(d.mode === 'hold' ? this.evHold(gd, a, dart) : this.evClear(gd, a, dart));
            else this.push(this.evSnapBar(d.barValue ?? gd.currentTargetBar, d.mode)); // forced preview: the bar just moves
        }
        if (t === 'winner' && pt !== 'winner') this.push(this.evWinner(gd));
        this.prev = gd;
    }

    /** a new roster or a new game: build the totems, place everything from the state as it stands */
    setup(gd) {
        this.clearQueue();
        const players = gd.players.map((pl, i) => ({ name: teamName(gd, i), avatar: members(gd, i)[0]?.avatar || pl.avatar || null, color: teamColor(i), lives: pl.lives }));
        this.buildTotems(players);
        this.hud.setPlayers(players);
        this.hud.setHelp(gd.helpVisible); this.hud.setWinner(false); this.hud.hideTitle();
        this.fireworks = 0;
        this.rig.setBar(gd.currentTargetBar, 'snap');
        this.totems.forEach((T, i) => { T.setLives(gd.players[i].lives, true); if (gd.players[i].lives <= 0) { T.out = 1; T.fall = 1.5; } });
        this.ball.clear(); this.ball.visible = false;
        if (this.first) { this.first = false; this.push({ dur: 2.6, steps: [[0, () => this.cut('establish')]] }); }
        if (gd.phase.type === 'winner') { this.push(this.evWinner(gd)); return; }
        this.push(this.evNext(gd, gd.activeIdx, gd.currentRunningTotal));
    }

    /** a world position → stereo pan as the camera sees it (left of frame = left speaker) */
    panOf(p) {
        const cam = this.engine.camera; const v = p.clone().project(cam);
        return Math.max(-0.9, Math.min(0.9, (v.z > 1 ? -v.x : v.x) * 0.8));
    }
    cut(name, p = {}) { this.director.set(name, p, true); }
    color(i) { return new THREE.Color(teamColor(i)); }

    // ------------------------------------------------------------ events
    evNext(gd, i, total = 0) {
        const T = () => this.totems[i];
        const th = throwerOf(gd, i), team = gd.isDoublesLineup ? teamName(gd, i) : '';
        const bar = gd.currentTargetBar;
        return {
            dur: total ? 0.3 : 1.55,
            steps: [
                [0, () => {
                    this.visitIdx = i; this.ctx.active = i;
                    this.totems.forEach((t, k) => t.setActive(k === i));
                    this.hud.setActive(i);
                    this.hud.thrower({ name: th?.name || gd.players[i].name, team, avatar: th?.avatar || null, color: teamColor(i) });
                    this.hud.status(total, bar, 3 - (gd.throwsThisTurn || 0));
                    this.ball.setPlayer(teamColor(i), th?.name || gd.players[i].name, th?.avatar || null);
                    this.ball.clear();
                    if (total) { this.ball.snap(total); this.cut('rig'); return; }
                    this.cut('totem', { totem: T() });
                    this.ball.perch(T().top);
                    this.audio?.visitStart();
                }],
                ...(total ? [] : [
                    [0.55, () => { this.ball.leap(T().top, 0); this.audio?.leap(this.panOf(T().group.position)); }],
                    [1.05, () => this.cut(heatOf(bar) > 0.55 ? 'low' : 'rig')],
                    [1.5, () => this.audio?.land()],
                ]),
            ],
        };
    }

    evDart(gd, i, d) {
        const B = this.ball, gap = d.bar - d.real;
        // the camera: wide on the first dart, lower and tighter as the room runs out
        // (the ball and the bar both have to be in frame: wide while there's plenty of room, low/tight near the bar)
        const shot = gap > 22 ? 'rig' : gap > 8 ? (d.k === 1 ? 'low' : 'rig') : (d.k === 1 ? 'low' : 'gap');
        const nutT = d.miss ? 0.45 : 0;
        return {
            dur: nutT + (d.over ? 0.05 : 0.62),
            steps: [
                [0, () => {
                    this.hud.dart(d.k, d);
                    this.hud.status(Math.min(d.real, d.lifeLost ? d.bar : d.real), d.bar, 2 - d.k, d.over ? 'OVER THE BAR' : null);
                    if (!d.over) this.cut(shot);
                    if (d.miss) this.dropNut(nutT);
                }],
                // over the bar: the burn event does the rising (a slam), so the ball doesn't climb twice
                ...(d.over ? [] : [[nutT, () => {
                    B.rise(Math.min(d.real, d.bar), { onArrive: () => { this.director.addTrauma(0.05 + Math.min(0.12, d.score * 0.004)); this.rig.lean = 0; } });
                    this.audio?.dart({ total: Math.min(d.real, d.bar), score: d.score, bar: d.bar });
                }]]),
            ],
        };
    }

    evClear(gd, i, d) {
        const bar = gd.currentTargetBar;
        return {
            dur: 1.6,
            steps: [
                [0.05, () => {
                    this.hud.show('CLEARED!', `BAR DROPS TO ${bar}`, { color: teamColor(i), ms: 2000 }); this.hud.status(d.real, d.bar, 0, `${d.bar - d.real} UNDER`); this.cut('limbo');
                    this.ball.limbo({ onSplash: () => { this.director.addTrauma(0.12); this.audio?.splash(); } });
                    this.audio?.cheer(); this.audio?.limbo(); this.audio?.flourish(this.audio.now + 0.15);
                }],
                [1.0, () => this.rig.setBar(bar, 'drop')],
                [1.55, () => this.cut(heatOf(bar) > 0.55 ? 'low' : 'rig')],
            ],
        };
    }

    evHold(gd, i, d) {
        const c = this.color(i);
        return {
            dur: 1.4,
            steps: [
                [0.05, () => {
                    this.cut('gap');
                    const y = barY(d.bar) - BAR_R;
                    this.fx.sparkRing(V(0, y, 0), c); this.rig.kick(0.6, 0.5); this.director.addTrauma(0.15);
                    this.hud.show('BAR HOLDS', `ON THE BAR · ${d.bar}`, { color: teamColor(i), ms: 2000 });
                    this.hud.status(d.real, d.bar, 0, 'ON THE BAR');
                    this.audio?.ting();
                }],
                [0.7, () => this.audio?.cheer(this.audio.now, 0.8)],
                [1.05, () => { this.cut('limbo'); this.ball.limbo({ onSplash: () => { this.director.addTrauma(0.12); this.audio?.splash(); } }); this.audio?.limbo(); }],
            ],
        };
    }

    /** over the bar (a slam into the fire) or no room left (the flames lash down onto it); a torch goes out */
    evBurn(gd, i, d, ph) {
        const T = () => this.totems[i], c = this.color(i), name = ph.playerName || teamName(gd, i);
        const lives = gd.players[i].lives, out = !!ph.eliminated || lives <= 0;
        const A = this.audio;
        const impact = (size = 1) => {
            this.feel.flash = 0.9; this.rig.kick(1, 1.2); this.director.addTrauma(0.55);
            if (A) { A.fireball(A.now, size); A.groan(A.now + 0.35); A.conch(A.now + 0.7); A.dropOut(2); }
        };
        const steps = [[0, () => this.cut('burn')]];
        if (d.over) {
            steps.push([0.05, () => this.ball.slam(d.bar, { onImpact: () => { impact(); this.fx.fireball(V(0, barY(d.bar) - BAR_R, 0.1), 1.2); this.hud.show('BURNED!', `${d.real} IS OVER ${d.bar}`, { kind: 'burn', color: '#ff5a1e', ms: 1500 }); } })]);
            steps.push([0.5, () => this.ball.fallBack()]);
        } else {
            steps.push([0.1, () => {
                A?.noRoom(); impact(0.6); this.fx.fireball(this.ball.pos.clone().add(V(0, BALL_R, 0)), 0.8); this.ball.scorch = 1;
                const left = 3 - (d.k + 1);
                this.hud.show('NO ROOM!', `${left} DART${left === 1 ? '' : 'S'} · ${d.bar - d.real} TO SPARE`, { kind: 'burn', color: '#ff5a1e', ms: 1500 });
            }]);
            steps.push([0.45, () => this.ball.fallBack()]);
        }
        steps.push([1.15, () => {
            this.cut(out ? 'out' : 'totem', { totem: T() });
            for (const k of T().setLives(lives)) { this.fx.smoke(T().torchTip(k), 14, 0.8); A?.snuff(this.panOf(T().group.position)); }
            this.hud.setLives(i, lives);
        }]);
        if (out) {
            steps.push([1.55, () => {
                T().knockOut(); this.ball.crack();
                const pan = this.panOf(T().group.position);
                A?.timber(pan);
                T().onLand = () => { this.director.addTrauma(0.3); this.fx.dust(T().group.position.clone().add(V(1.6, 0.3, 0))); A?.thud(pan); A?.gong(A.now + 0.08); };
                this.hud.show('OUT!', `${name} IS OUT`, { kind: 'out', color: '#ff5a1e', ms: 1800 });
            }]);
        }
        return { dur: out ? 2.6 : 1.9, steps };
    }

    evReset(bar) {
        return { dur: 1.0, steps: [[0, () => { this.cut('rig'); this.rig.setBar(bar, 'reset'); this.hud.show('BAR RESET', `BACK UP TO ${bar}`, { kind: 'reset', ms: 1100 }); this.audio?.resetRun(0.9); }]] };
    }
    evSnapBar(bar, mode) {
        return { dur: 0.6, steps: [[0, () => { this.rig.setBar(bar, bar > this.rig.shown ? 'reset' : 'drop'); this.hud.show(mode === 'hold' ? 'BAR HOLDS' : 'THE BAR', String(bar), { ms: 1400 }); }]] };
    }
    evTitle(main, sub, kind) { return { dur: 0.2, steps: [[0, () => this.hud.show(main, sub, { kind, color: '#ff5a1e' })]] }; }

    evWinner(gd) {
        const d = gd.phase.data || {}, i = Math.max(0, gd.players.findIndex((x) => x.id === d.winnerId));
        return {
            dur: 1,
            steps: [[0, () => {
                const T = this.totems[i];
                this.ctx.active = i;
                this.totems.forEach((t, k) => t.setActive(k === i));
                this.hud.setActive(i); this.hud.setWinner(true);
                this.hud.show('WINNER', d.winnerName || teamName(gd, i), { kind: 'winner', color: teamColor(i), ms: 0 });
                this.ball.clear(); this.ball.visible = false;
                T.raise(); T.setLives(3);
                this.cut('winner', { totem: T });
                this.fx.petals(T.group.position.clone().add(V(0, 2, 0)), 120);
                this.winnerColor.set(teamColor(i)); this.fireworks = 1; this.fwT = 0.3;
                this.audio?.winner();
            }]],
        };
    }

    // ------------------------------------------------------------ the coconut
    dropNut(dur) {
        const B = this.ball, top = B.pos.y + BALL_R + 0.15;
        this.nutS = { t: 0, dur, y0: top + 5.5, y1: top, hit: false, vx: R(-2, 2), vz: R(1, 2.5), vy: 4 };
        this.nut.position.set(B.pos.x + 0.05, top + 5.5, B.pos.z); this.nut.visible = true;
        this.audio?.coconutFall();
    }
    updateNut(dt) {
        const S = this.nutS; if (!S) return;
        S.t += dt;
        if (!S.hit) {
            const u = Math.min(1, S.t / S.dur);
            this.nut.position.y = S.y0 + (S.y1 - S.y0) * u * u;
            this.nut.rotation.x += dt * 9;
            if (u >= 1) {
                S.hit = true; S.t = 0;
                this.ball.kick(-1.4); this.director.addTrauma(0.12); this.audio?.bonk();
                this.fx.dust(this.nut.position.clone()); this.hud.show('BONK!', 'A MISS · +25', { ms: 900 });
            }
        } else {
            S.vy -= 16 * dt;
            this.nut.position.x += S.vx * dt; this.nut.position.z += S.vz * dt; this.nut.position.y += S.vy * dt;
            this.nut.rotation.z += dt * 12;
            if (S.t > 1.4) { this.nut.visible = false; this.nutS = null; }
        }
    }

    // ------------------------------------------------------------ frame
    update(dt) {
        if (this.runQueue(dt)) this.reconcile();
        // flames lean toward the ball as it nears the bar
        const B = this.ball, gap = this.rig.y - B.pos.y;
        this.rig.lean = B.visible ? Math.max(0, 1 - gap / 1.6) : 0; this.rig.leanX = B.pos.x;
        this.hud.bar(this.rig.shown);
        // sound follows the heat, and the tension drone follows how close the ball is to the fire during a visit
        if (this.audio) {
            this.audio.setHeat(heatOf(this.rig.shown));
            const near = this.gd && this.gd.phase.type === 'playing' && B.visible ? Math.max(0, 1 - gap / 1.6) : 0;
            this.audio.setTension(near);
        }
        this.updateNut(dt);
        // the winner's fireworks over the lagoon
        if (this.fireworks) {
            this.fwT -= dt;
            if (this.fwT <= 0) {
                this.fwT = R(0.35, 0.9);
                const c = Math.random() < 0.6 ? this.winnerColor : new THREE.Color().setHSL(Math.random(), 0.8, 0.6);
                // behind the winner's totem along the line of sight, so they burst in frame (and over the lagoon in wides)
                const T = this.totems[this.ctx.active] || this.totems[0], cam = this.engine.camera.position;
                const dir = T.group.position.clone().sub(cam).setY(0).normalize(), side = V(-dir.z, 0, dir.x);
                const fp = T.group.position.clone().addScaledVector(dir, R(26, 44)).addScaledVector(side, R(-16, 16)).setY(R(12, 24));
                this.fx.firework(fp, c);
                this.audio?.firework(this.panOf(fp), fp.distanceTo(cam));
            }
        }
    }

    /** nothing lies: once the queue is idle, the scene matches the state */
    reconcile() {
        const gd = this.gd; if (!gd) return;
        if (!this.rig.busy && this.rig.value !== gd.currentTargetBar) this.rig.setBar(gd.currentTargetBar, gd.currentTargetBar > this.rig.shown ? 'reset' : 'drop');
        this.totems.forEach((T, i) => {
            const n = gd.players[i]?.lives ?? 0;
            if (gd.phase.type === 'winner') return;
            if (T.lives !== n) { T.setLives(n); this.hud.setLives(i, n); }
            if (n > 0 && T.out) T.revive();
            if (n <= 0 && !T.out) { T.out = 1; T.fall = 1.5; }
        });
        if (gd.phase.type === 'playing' && gd.throwsThisTurn > 0 && this.ball.visible && !this.ball.busy && this.ball.total !== gd.currentRunningTotal) this.ball.rise(gd.currentRunningTotal);
    }

    /** what the scene shows right now (for the nothing-lies check) */
    truth() {
        return {
            settled: this.queueIdle && !this.rig.busy && !this.ball.busy,
            bar: this.rig.shown, ball: this.ball.total, ballVisible: this.ball.visible,
            ballY: +this.ball.pos.y.toFixed(3), ballYWant: +ballY(this.ball.total).toFixed(3),
            barY: +this.rig.y.toFixed(3), barYWant: +barY(this.rig.shown).toFixed(3),
            lit: this.totems.map((T) => T.torches.filter((x) => x.lit).length),
            // why it isn't settled (for debugging a stuck queue)
            busy: { ...this.queueBusy(), rig: this.rig.busy ? `${this.rig.mode} ${this.rig.shown}->${this.rig.value}` : null, ball: this.ball.busy ? (this.ball.task ? `task ${this.ball.task.t?.toFixed(2)}/${this.ball.task.dur}` : `queued ${this.ball.tasks.length}`) : null, clock: +this.engine.time.value.toFixed(2) },
        };
    }
}
export { BAR_START };
