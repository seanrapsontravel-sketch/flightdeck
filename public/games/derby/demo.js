/**
 * Derby demo simulator (browser ES module).
 *
 * Ports src/engines/derby.js + the relevant bits of core.js / index.js so the
 * TV view can be developed without the server. The emitted gameData has the
 * same shape and phase sequence as the real engine.
 *
 *   import { startDemo } from './demo.js';
 *   const c = startDemo(gd => render(gd), { players: 4, speed: 1 });
 */

// ---- constants mirrored from core.js / derby.js ----
const OVERLAY_EVENT_MS = 3000;
const OVERLAY_NEXT_PLAYER_MS = 2500;
const OVERLAY_ROUND_ANNOUNCE_MS = 3000;
const MAX_ROUNDS = 8;
const MAX_TICKS = 9;
const AIM_LEAD_GAP = 3;
const AIM_THREAT_WITHIN = 3;
const WHEEL = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
const NAMES = ['Alice', 'Ben', 'Chloe', 'Dev', 'Ella', 'Finn'];
const BOOST_QUIPS = ['Full Gallop!', 'Thundering Ahead!', 'Stretch Drive!', 'On The Rail!', 'Lightning Strides!'];
const KNOCK_QUIPS = ['Boxed In!', 'Checked Hard!', 'Lost A Length!', 'Reined In!', 'Fallen Back!'];
const KNOCK_SINGLE_QUIPS = ['Nicked!', 'Tapped Back!', 'One Length!', 'Slight Check!', 'Eased Off!'];
const ROUND_META = { maxRounds: MAX_ROUNDS, roundEyebrow: 'POST TIME', lastRoundTag: 'FINAL FURLONG' };

function mulberry32(a) {
    return () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function startDemo(emit, opts = {}) {
    const nPlayers = Math.min(6, Math.max(2, opts.players | 0 || 4));
    const speed = opts.speed > 0 ? opts.speed : 1;
    const loop = opts.loop !== false;
    const rnd = Number.isInteger(opts.seed) ? mulberry32(opts.seed) : Math.random;

    // ---- core.js ports ----
    const makePhase = (type, data = {}) => ({ type, startedAt: Date.now(), data });
    const pickQuip = list => list[Math.floor(rnd() * list.length)];

    function generateSymmetricTargets(count) {
        const start = Math.floor(rnd() * WHEEL.length);
        const step = WHEEL.length / count;
        return Array.from({ length: count }, (_, i) => WHEEL[Math.floor(start + i * step) % WHEEL.length]);
    }

    function roundAnnounceInfo(round) { // core.roundAnnounceInfo with derby meta
        const r = Math.max(1, Number(round) || 1);
        const isLast = r >= ROUND_META.maxRounds;
        const tags = isLast ? [ROUND_META.lastRoundTag] : [];
        return {
            gameType: 'derby', round: r, maxRounds: ROUND_META.maxRounds, multiplier: 1, isLast,
            eyebrow: ROUND_META.roundEyebrow, title: `ROUND ${r}`, subtitle: tags.join(' · '), tags
        };
    }

    function showNextPlayerIntermission(gd, nextIdx) {
        const next = gd.players[nextIdx] || {};
        gd.phase = makePhase('intermission', {
            nextPlayerIndex: nextIdx,
            nextPlayerName: next.name,
            nextTeamName: next.name,
            avatar: next.avatar || null,
            targetNumber: next.targetNumber
        });
        return { delayMs: OVERLAY_NEXT_PLAYER_MS, next: 'derby_advance_turn' };
    }

    function scheduleRoundThenNextPlayer(gd, nextIdx, nextRound, wrapped) {
        if (wrapped) {
            gd.phase = makePhase('round_announce', roundAnnounceInfo(nextRound));
            return { delayMs: OVERLAY_ROUND_ANNOUNCE_MS, next: 'derby_show_next_after_round', nextPlayerIndex: nextIdx };
        }
        return showNextPlayerIntermission(gd, nextIdx);
    }

    const winnerFields = p => ({
        winnerId: p.id, winnerName: p.name, avatar: p.avatar || null,
        members: [{ id: p.id, name: p.name, avatar: p.avatar || null }], avatars: [p.avatar || null]
    });
    const contenderFields = p => ({
        id: p.id, name: p.name, avatar: p.avatar || null,
        members: [{ id: p.id, name: p.name, avatar: p.avatar || null }], score: p.score || 0
    });

    // ---- derby.js ports (each returns a schedule or null) ----
    const atFinish = gd => gd.players.filter(p => (p.score || 0) >= MAX_TICKS);
    const leaders = gd => {
        const best = Math.max(-1, ...gd.players.map(p => p.score || 0));
        return gd.players.filter(p => (p.score || 0) === best);
    };
    const isFinished = p => !!(p && (p.finished || (p.score || 0) >= MAX_TICKS));

    function derbyDraw(gd, contenders) {
        const list = contenders.map(contenderFields);
        gd.phase = makePhase('draw', { contenders: list, names: list.map(p => p.name) });
    }
    const derbyWinner = (gd, p) => { gd.phase = makePhase('winner', winnerFields(p)); };

    function resolveMatch(gd) {
        const fin = atFinish(gd);
        if (fin.length >= 2) derbyDraw(gd, fin);
        else if (fin.length === 1) derbyWinner(gd, fin[0]);
        else {
            const lead = leaders(gd);
            if (lead.length >= 2) derbyDraw(gd, lead);
            else derbyWinner(gd, lead[0] || gd.players[0]);
        }
        return null;
    }

    function markFinishIfNeeded(gd, player) {
        if ((player.score || 0) < MAX_TICKS) return false;
        player.score = MAX_TICKS;
        gd.finishLineOpen = true;
        if (player.finished) return false;
        player.finished = true;
        return true;
    }

    function showPastPost(gd, player) {
        gd.pendingPastPost = null;
        gd.phase = makePhase('past_post', {
            playerId: player.id, playerName: player.name, avatar: player.avatar, targetNumber: player.targetNumber
        });
        return { delayMs: OVERLAY_EVENT_MS, next: 'derby_after_past_post' };
    }

    function multOverlayPhase(selfHit, hitPlayer, actor, multiplier) {
        const quips = selfHit ? BOOST_QUIPS : (multiplier === 1 ? KNOCK_SINGLE_QUIPS : KNOCK_QUIPS);
        return makePhase(selfHit ? 'mult_boost' : 'mult_knock', {
            playerName: hitPlayer.name, avatar: hitPlayer.avatar, actorName: actor.name,
            multiplier, steps: multiplier, quip: pickQuip(quips), selfHit, targetNumber: hitPlayer.targetNumber
        });
    }

    function continueAfterThrow(gd) {
        if (gd.throwsThisTurn === 3) {
            let nextIdx = gd.activeIdx + 1;
            let nextRound = gd.currentRound;
            let wrapped = false;
            if (nextIdx >= gd.players.length) { nextIdx = 0; nextRound++; wrapped = true; }
            if (nextRound > MAX_ROUNDS || (gd.finishLineOpen && wrapped)) {
                gd.phase = makePhase('playing');
                return { delayMs: 900, next: 'derby_resolve_match' };
            }
            return scheduleRoundThenNextPlayer(gd, nextIdx, nextRound, wrapped);
        }
        gd.phase = makePhase('playing');
        return null;
    }

    // A horse past the post ends its visit early (the server's visitEndedEarly takeout wait is moot here).
    function endVisitAtFinish(gd) {
        gd.pendingPastPost = null;
        if ((gd.throwsThisTurn || 0) < 3) gd.throwsThisTurn = 3;
        return continueAfterThrow(gd);
    }

    function handleThrow(gd, spec) {
        if (gd.phase.type !== 'playing' || gd.currentRound > MAX_ROUNDS) return null;
        gd.throwsThisTurn++;
        const me = gd.players[gd.activeIdx];
        gd.lastThrow = { hit: false, selfHit: false, multiplier: 1 };
        gd.pendingPastPost = null;
        let hitPlayer = null, multiplier = 1, selfHit = false, newlyFinished = false, scoredKnock = false;

        const hitNumber = (!spec || spec.miss || spec.number === 'bull') ? null : spec.number; // dartboardHitFromSpec
        if (spec && hitNumber !== null) {
            multiplier = Number(spec.multiplier) || 1;
            gd.lastThrow.number = hitNumber;
            gd.lastThrow.multiplier = multiplier;
            if (spec.sector) gd.lastThrow.sector = spec.sector;
            const idx = gd.players.findIndex(p => p.targetNumber === hitNumber);
            if (idx >= 0) {
                hitPlayer = gd.players[idx];
                selfHit = idx === gd.activeIdx;
                gd.lastThrow.hit = true;
                gd.lastThrow.selfHit = selfHit;
                gd.lastThrow.hitPlayerName = hitPlayer.name;
                if (selfHit) {
                    me.score = (me.score || 0) + multiplier;
                    newlyFinished = markFinishIfNeeded(gd, me);
                } else if (isFinished(hitPlayer)) {
                    gd.lastThrow.immune = true; // finished horses can't be sent backwards
                } else if ((hitPlayer.score || 0) > 0) {
                    hitPlayer.score = Math.max(0, hitPlayer.score - multiplier);
                    scoredKnock = true;
                }
            }
        } else if (spec && !spec.miss && spec.number === 'bull') {
            multiplier = Number(spec.multiplier) || 1;
            gd.lastThrow.miss = false;
            gd.lastThrow.hit = false;
            gd.lastThrow.number = 'bull';
            gd.lastThrow.multiplier = multiplier;
            if (spec.sector) gd.lastThrow.sector = spec.sector;
        } else {
            gd.lastThrow.miss = true;
        }

        if (newlyFinished) {
            gd.pendingPastPost = { playerId: me.id, playerName: me.name, avatar: me.avatar, targetNumber: me.targetNumber };
        }
        if (selfHit && multiplier >= 2) {
            gd.phase = multOverlayPhase(true, me, me, multiplier);
            return { delayMs: OVERLAY_EVENT_MS, next: 'derby_after_mult' };
        }
        if (scoredKnock) {
            gd.phase = multOverlayPhase(false, hitPlayer, me, multiplier);
            return { delayMs: OVERLAY_EVENT_MS, next: 'derby_after_mult' };
        }
        if (newlyFinished) return showPastPost(gd, me);
        return continueAfterThrow(gd);
    }

    // schedule.next dispatch, ported from engines/index.js
    function runAction(gd, action) {
        switch (action.next) {
            case 'derby_show_next_after_round':
                return showNextPlayerIntermission(gd, action.nextPlayerIndex != null ? action.nextPlayerIndex : 0);
            case 'derby_advance_turn':
                gd.throwsThisTurn = 0;
                gd.activeIdx++;
                if (gd.activeIdx >= gd.players.length) {
                    gd.activeIdx = 0;
                    gd.currentRound++;
                    if (gd.currentRound > MAX_ROUNDS || gd.finishLineOpen) return resolveMatch(gd);
                }
                gd.lastThrow = null;
                gd.phase = makePhase('playing');
                return null;
            case 'derby_resolve_match':
                return resolveMatch(gd);
            case 'derby_after_mult':
                if (gd.pendingPastPost) {
                    const pending = gd.pendingPastPost;
                    gd.pendingPastPost = null;
                    gd.phase = makePhase('past_post', pending);
                    return { delayMs: OVERLAY_EVENT_MS, next: 'derby_after_past_post' };
                }
                return continueAfterThrow(gd);
            case 'derby_after_past_post':
                return endVisitAtFinish(gd);
            case 'derby_after_round_announce':
                gd.phase = makePhase('playing');
                return null;
            default:
                return null;
        }
    }

    function init() { // derby.init
        const targets = generateSymmetricTargets(nPlayers);
        // The server shuffles the lineup before init; do the same.
        const ids = Array.from({ length: nPlayers }, (_, i) => i);
        for (let i = ids.length - 1; i > 0; i--) {
            const j = Math.floor(rnd() * (i + 1));
            [ids[i], ids[j]] = [ids[j], ids[i]];
        }
        return {
            gameType: 'derby',
            players: ids.map((k, idx) => ({
                id: `p${k + 1}`, name: NAMES[k], avatar: null, score: 0, finished: false, targetNumber: targets[idx]
            })),
            activeIdx: 0,
            throwsThisTurn: 0,
            currentRound: 1,
            finishLineOpen: false,
            isDoublesLineup: false,
            throwerIndices: ids.map(() => 0),
            phase: makePhase('playing'),
            helpVisible: false,
            lastThrow: null
        };
    }

    // derby.resolveDerbyAimNumber
    function resolveAim(gd) {
        const me = gd.players[gd.activeIdx];
        const myScore = Number(me.score) || 0;
        const opps = gd.players.filter((p, i) => i !== gd.activeIdx && !isFinished(p));
        const floor = MAX_TICKS - AIM_THREAT_WITHIN;
        const threats = opps.filter(p => (Number(p.score) || 0) >= floor && p.score > 0)
            .sort((a, b) => b.score - a.score);
        if (threats.length) return threats[0].targetNumber;
        const lead = opps.filter(p => p.score > 0 && p.score - myScore >= AIM_LEAD_GAP)
            .sort((a, b) => (b.score - myScore) - (a.score - myScore));
        if (lead.length) return lead[0].targetNumber;
        return me.targetNumber || 20;
    }

    // ---- bot accuracy model ----
    function botSpec(aim) {
        const r = rnd();
        if (r < 0.45) {
            const m = rnd();
            return { number: aim, multiplier: m < 0.70 ? 1 : m < 0.88 ? 2 : 3 };
        }
        if (r < 0.70) {
            const i = WHEEL.indexOf(aim);
            const n = WHEEL[(i + (rnd() < 0.5 ? 1 : WHEEL.length - 1)) % WHEEL.length];
            return { number: n, multiplier: 1 };
        }
        if (r < 0.80) return { number: 'bull', multiplier: 1 };
        return { miss: true };
    }

    // ---- runtime: state, timers, emit ----
    let gd = init();
    let paused = false, stopped = false;
    let pending = null; // current schedule awaiting its timer
    let timer = null, botTimer = null, restartTimer = null;

    const snapshot = () => {
        const c = structuredClone(gd);
        delete c.visitEndedEarly;
        return c;
    };
    const publish = () => { if (!stopped) emit(snapshot()); };
    const clearTimers = () => { clearTimeout(timer); clearTimeout(botTimer); clearTimeout(restartTimer); timer = botTimer = restartTimer = null; };

    function settle(schedule) { // after any change: emit, then arm the next timer
        pending = schedule;
        publish();
        arm();
    }

    function arm() {
        clearTimers();
        if (stopped || paused) return;
        const t = gd.phase.type;
        if (pending) {
            const action = pending;
            timer = setTimeout(() => { pending = null; settle(runAction(gd, action)); }, action.delayMs / speed);
        } else if (t === 'winner' || t === 'draw') {
            if (loop) restartTimer = setTimeout(() => { gd = init(); settle(null); }, 9000 / speed);
        } else if (t === 'playing' && gd.throwsThisTurn < 3) {
            botTimer = setTimeout(() => settle(handleThrow(gd, botSpec(resolveAim(gd)))), 1700 / speed);
        }
    }

    // ---- force(): build consistent showcase states ----
    function setScores(scores) {
        gd.players.forEach((p, i) => {
            p.score = Math.min(MAX_TICKS, scores[i] || 0);
            p.finished = p.score >= MAX_TICKS;
        });
        gd.finishLineOpen = gd.players.some(p => p.finished);
    }
    const spread = (fn) => gd.players.map((_, i) => fn(i));
    const other = () => gd.players.findIndex((_, i) => i !== gd.activeIdx);

    function force(kind, extra = {}) {
        clearTimers();
        paused = true;
        gd = init();
        gd.currentRound = extra.round || 3;
        const n = gd.players.length;
        const a = gd.activeIdx;
        let sched = null;
        switch (kind) {
            case 'midrace':
                // spread 0..8 evenly, with a little random setback on alternating horses
                setScores(spread(i => {
                    const base = Math.round((i * 8) / Math.max(1, n - 1));
                    return i % 2 ? Math.max(0, base - Math.floor(rnd() * 2)) : base;
                }));
                gd.currentRound = extra.round || 4;
                gd.throwsThisTurn = 1;
                break;
            case 'nearfinish':
                setScores(spread(i => (i === 0 ? 8 : 4 + Math.floor(rnd() * 4))));
                gd.currentRound = extra.round || 7;
                gd.throwsThisTurn = 1;
                break;
            case 'playing':
                setScores(spread(i => 1 + (i * 2) % 5));
                gd.throwsThisTurn = 1;
                gd.lastThrow = { hit: false, miss: true, selfHit: false, multiplier: 1 };
                break;
            case 'round_announce':
                setScores(spread(i => 2 + (i % 4)));
                gd.currentRound = (extra.round || 3) - 1; // state before wrap; announce shows the next round
                gd.activeIdx = n - 1;
                gd.throwsThisTurn = 3;
                sched = scheduleRoundThenNextPlayer(gd, 0, gd.currentRound + 1, true);
                break;
            case 'intermission':
                setScores(spread(i => 2 + (i % 4)));
                gd.throwsThisTurn = 3;
                sched = showNextPlayerIntermission(gd, (a + 1) % n);
                break;
            case 'mult_boost': { // real throw: active horse hits its own number with a double/treble
                setScores(spread(i => 2 + (i % 3)));
                gd.throwsThisTurn = 1;
                sched = handleThrow(gd, { number: gd.players[a].targetNumber, multiplier: extra.multiplier || 2 });
                break;
            }
            case 'mult_knock': { // real throw: active player knocks another horse back
                setScores(spread(i => 3 + (i % 3)));
                gd.throwsThisTurn = 1;
                sched = handleThrow(gd, { number: gd.players[other()].targetNumber, multiplier: extra.multiplier || 2 });
                break;
            }
            case 'past_post': { // real throw: active horse crosses the line
                setScores(spread(i => (i === a ? 8 : 3 + (i % 3))));
                gd.throwsThisTurn = 1;
                sched = handleThrow(gd, { number: gd.players[a].targetNumber, multiplier: 1 });
                break;
            }
            case 'winner':
                setScores(spread(i => (i === a ? 9 : 2 + (i % 5))));
                gd.throwsThisTurn = 3;
                resolveMatch(gd);
                break;
            case 'draw':
                setScores(spread(i => (i < 2 ? 9 : 2 + (i % 5))));
                gd.throwsThisTurn = 3;
                resolveMatch(gd);
                break;
            default:
                throw new Error(`unknown force kind: ${kind}`);
        }
        pending = sched;
        publish();
        return snapshot();
    }

    // ---- controller ----
    const controller = {
        stop() { stopped = true; clearTimers(); },
        pause() { paused = true; clearTimers(); },
        resume() { if (stopped) return; paused = false; arm(); },
        state: () => snapshot(),
        throwDart(spec) {
            if (stopped || gd.phase.type !== 'playing' || pending) return snapshot();
            settle(handleThrow(gd, spec));
            return snapshot();
        },
        force
    };

    publish();
    arm();
    if (typeof window !== 'undefined') window.__derbyDemo = controller;
    return controller;
}
