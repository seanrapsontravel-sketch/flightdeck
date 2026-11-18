/**
 * zerohour — game engine (docs/plans/ZERO-HOUR.md).
 *
 * Five rounds, three darts a visit. Each dart scores normal points, ×3 on the round's two hot numbers (drawn from
 * 10–20). A visit's points become 5-point chips that the server drops, two at a time, onto random numbers 0–36 of
 * a standard roulette layout, where they stay. After round 5 one spin of a standard single-zero wheel decides it: the most chip value on
 * the winning number wins; everyone else is placed by what they had there too.
 *
 * The rules themselves live in public/games/zerohour/rules.mjs (one copy for the server, the tests and the TV demo).
 * This file is the turn flow and the randomness: every draw is an HMAC of a per-match secret (gameData.secret, which
 * the server strips from the public state), so a correction or a restart re-derives exactly the same placements and
 * the spin can't be steered by anything that happens in the match. The secret's sha256 is public from the first
 * dart (zh.commit) and the secret itself is revealed in the state once the match is over.
 *
 * All rules state lives in gameData as plain JSON: undo and Correct Score clone it.
 */

const crypto = require('node:crypto');
const R = require('../../public/games/zerohour/rules.mjs');
const {
    buildDoublesPlayerRoster,
    doublesAdvanceThrowerAfterVisit,
    doublesMembersOf,
    doublesThrowerName,
    doublesWinnerFields,
    makePhase,
    scheduleRoundThenNextPlayer,
    showNextPlayerIntermission,
    slimPlayer
} = require('./core');

const GAME = 'zerohour';

/* ---------- randomness ---------- */

/** draw(label, n) → an unbiased integer in [0, n) from HMAC-SHA256(secret, label), rejection-sampled */
function drawFor(secret) {
    const key = Buffer.from(String(secret), 'hex');
    return (label, n) => {
        const limit = Math.floor(0x100000000 / n) * n;
        for (let ctr = 0; ; ctr++) {
            const h = crypto.createHmac('sha256', key).update(ctr ? `${label}#${ctr}` : label).digest();
            for (let o = 0; o + 4 <= h.length; o += 4) {
                const x = h.readUInt32BE(o);
                if (x < limit) return x % n;
            }
        }
    };
}

function newSecret(options) {
    if (options && typeof options.secret === 'string' && /^[0-9a-f]{16,}$/i.test(options.secret)) return options.secret.toLowerCase();
    return crypto.randomBytes(32).toString('hex');
}

const commitOf = (secret) => crypto.createHash('sha256').update(String(secret)).digest('hex');

/* ---------- state ---------- */

function makePlayerState(base) {
    return { ...base, score: 0, drops: [] };
}

function baseState(options) {
    const secret = newSecret(options);
    const draw = drawFor(secret);
    return {
        gameType: GAME,
        secret,
        activeIdx: 0,
        currentRound: 1,
        throwsThisTurn: 0,
        turnDarts: [],
        phase: makePhase('playing'),
        helpVisible: false,
        lastThrow: null,
        zh: {
            rounds: R.ROUNDS,
            round: 1,
            hot: R.drawHot(draw, 1),
            hotMult: R.HOT_MULT,
            chip: R.CHIP,
            drop: R.DROP,
            commit: commitOf(secret),
            fast: process.env.ZEROHOUR_PACE === 'fast' || !!(options && options.fast),
            visit: { points: 0 },
            cells: [],
            standings: [],
            favourite: null,
            lastVisit: null,
            spin: null,
            shootout: null,
            placings: null,
            secret: null
        }
    };
}

function withSummary(gameData) {
    const s = R.summarise(entities(gameData));
    gameData.zh.cells = s.cells;
    gameData.zh.standings = s.standings;
    gameData.zh.favourite = s.favourite;
    return s;
}

/** the rules module's view of the players: { id, total, drops } in seat order */
function entities(gameData) {
    return (gameData.players || []).map((p) => ({ id: p.id, total: p.score || 0, drops: p.drops || [] }));
}

function init(ordered, options = {}) {
    const gameData = {
        ...baseState(options),
        players: ordered.map((p) => makePlayerState(slimPlayer(p))),
        isDoublesLineup: false,
        throwerIndices: ordered.map(() => 0)
    };
    withSummary(gameData);
    return gameData;
}

function initDoubles(players, options = {}) {
    const roster = buildDoublesPlayerRoster(options.doublesTeams, players, (base) => makePlayerState(base));
    const gameData = { ...baseState(options), ...roster };
    withSummary(gameData);
    return gameData;
}

/* ---------- a dart ---------- */

function handleThrow(gameData, throwSpec) {
    if (!gameData || !gameData.zh || gameData.phase?.type !== 'playing') return { gameData, schedule: null };
    if (gameData.zh.shootout) return shootoutThrow(gameData, throwSpec);
    if ((gameData.throwsThisTurn || 0) >= R.DARTS) return { gameData, schedule: null };
    const player = gameData.players[gameData.activeIdx];
    if (!player) return { gameData, schedule: null };

    const d = R.scoreDart(throwSpec, gameData.zh.hot);
    player.score = (player.score || 0) + d.points;
    gameData.zh.visit = { points: (gameData.zh.visit?.points || 0) + d.points };
    gameData.throwsThisTurn = (gameData.throwsThisTurn || 0) + 1;
    gameData.turnDarts = [...(gameData.turnDarts || []), { label: d.label, points: d.points, base: d.base, hot: d.hot }].slice(-R.DARTS);
    gameData.lastThrow = {
        points: d.points, base: d.base, hot: d.hot, label: d.label,
        number: d.number, multiplier: d.multiplier, miss: d.number == null,
        playerId: player.id, playerName: doublesThrowerName(gameData, gameData.activeIdx),
        sector: throwSpec && throwSpec.sector ? throwSpec.sector : null
    };
    if (gameData.throwsThisTurn < R.DARTS) {
        // keep the derived standings honest mid-visit (points changed; ties on a cell break on total points)
        withSummary(gameData);
        return { gameData, schedule: null };
    }
    return endVisit(gameData);
}

/** dart 3: the visit's chips are drawn onto the table, then the next player, the next round, or the spin */
function endVisit(gameData) {
    const zh = gameData.zh;
    const idx = gameData.activeIdx;
    const player = gameData.players[idx];
    const before = R.summarise(entities(gameData).map((e) => (e.id === player.id ? { ...e, total: e.total - zh.visit.points } : e)));
    const drops = R.allocateVisit(drawFor(gameData.secret), player.id, zh.round, zh.visit.points);
    player.drops = [...(player.drops || []), ...drops];
    const after = withSummary(gameData);
    zh.lastVisit = {
        playerId: player.id,
        playerName: doublesThrowerName(gameData, idx),
        round: zh.round,
        points: zh.visit.points,
        darts: (gameData.turnDarts || []).map((t) => ({ ...t })),
        hotDarts: (gameData.turnDarts || []).filter((t) => t.hot).length,
        drops,
        steals: R.stealsBetween(before.cells, after.cells, player.id),
        favouriteBefore: before.favourite,
        favourite: after.favourite
    };

    let nextIdx = idx + 1;
    let nextRound = zh.round;
    let wrapped = false;
    if (nextIdx >= gameData.players.length) { nextIdx = 0; nextRound++; wrapped = true; }

    if (nextRound > R.ROUNDS) {
        // the last visit of the night: let its sweep play, then all bets are down
        gameData.phase = makePhase('playing', { last: true });
        return { gameData, schedule: { delayMs: R.SWEEP_MS, next: `${GAME}_begin_spin` } };
    }
    if (wrapped) {
        zh.round = nextRound;
        zh.hot = R.drawHot(drawFor(gameData.secret), nextRound);
    }
    return scheduleRoundThenNextPlayer(gameData, GAME, nextIdx, nextRound, wrapped, upNextExtra(gameData, nextIdx));
}

function upNextExtra(gameData, idx) {
    const p = gameData.players[idx] || {};
    const st = (gameData.zh.standings || []).find((s) => s.id === p.id) || {};
    return { round: gameData.zh.round, hot: gameData.zh.hot.slice(), numbersLed: st.numbersLed || 0, chancePct: st.chancePct || 0, last: gameData.zh.round === R.ROUNDS };
}

/* ---------- turn flow ---------- */

function showNextAfterRound(gameData, action) {
    const idx = Number(action?.nextPlayerIndex) || 0;
    return showNextPlayerIntermission(gameData, GAME, idx, action?.intermissionExtra || upNextExtra(gameData, idx));
}

function advanceTurn(gameData) {
    const idx = gameData.phase?.data?.nextPlayerIndex;
    if (!gameData.zh.shootout) doublesAdvanceThrowerAfterVisit(gameData, gameData.activeIdx);
    gameData.activeIdx = Number.isInteger(idx) ? idx : (gameData.activeIdx + 1) % gameData.players.length;
    gameData.currentRound = gameData.zh.round;
    gameData.throwsThisTurn = 0;
    gameData.turnDarts = [];
    gameData.lastThrow = null;
    gameData.zh.visit = { points: 0 };
    gameData.phase = makePhase('playing', gameData.zh.shootout ? { shootout: true } : {});
    return { gameData, schedule: null };
}

/* ---------- the spin ---------- */

function beginSpin(gameData) {
    const zh = gameData.zh;
    const players = entities(gameData);
    if (players.every((p) => !p.total)) return startShootout(gameData, players.map((p) => p.id), 'zero');
    const s = withSummary(gameData);
    const draws = R.spinDraws(drawFor(gameData.secret), s.cells);
    const pocket = draws[draws.length - 1];
    const { rows, tiedTop } = R.placingsFor(players, s.cells, pocket);
    const durations = R.spinDurations(draws.length - 1, zh.fast);
    const cellLeader = (n) => { const c = s.cells[n]; return { pocket: n, leader: c.leader, tie: c.tie, value: c.value }; };
    zh.spin = {
        draws, pocket, durations, startedAt: Date.now(),
        rows, tiedTop, margin: R.marginOf(rows),
        neighbours: R.neighboursOf(pocket).map(cellLeader),
        // who would have won on each number: the honest pre-spin map (a tie shows both)
        map: s.cells.map((c) => ({ pocket: c.pocket, leader: c.leader, tie: c.tie }))
    };
    gameData.phase = makePhase('spin', { draws, pocket, durations });
    return { gameData, schedule: { delayMs: durations.total, next: `${GAME}_resolve` } };
}

function resolveSpin(gameData) {
    const sp = gameData.zh.spin;
    if (!sp) return beginSpin(gameData);
    if (sp.tiedTop && sp.tiedTop.length > 1) return startShootout(gameData, sp.tiedTop, 'tie');
    return finish(gameData, sp.rows[0].id, 'roulette');
}

/* ---------- the shootout (a tie on the winning number, or nobody scored a point all night) ---------- */

function seatOf(gameData, id) { return gameData.players.findIndex((p) => p.id === id); }

function startShootout(gameData, ids, reason) {
    const order = ids.slice().sort((a, b) => seatOf(gameData, a) - seatOf(gameData, b));
    gameData.zh.shootout = { reason, ids: order, round: 1, scores: {}, history: [] };
    return shootoutNext(gameData, order[0]);
}

function shootoutNext(gameData, id) {
    const idx = seatOf(gameData, id);
    const so = gameData.zh.shootout;
    return showNextPlayerIntermission(gameData, GAME, idx, { shootout: true, reason: so.reason, ids: so.ids.slice(), round: so.round });
}

function shootoutThrow(gameData, throwSpec) {
    const so = gameData.zh.shootout;
    const player = gameData.players[gameData.activeIdx];
    if (!player || !so.ids.includes(player.id) || so.scores[player.id] != null) return { gameData, schedule: null };
    const score = R.shootoutScore(throwSpec);
    const d = R.scoreDart(throwSpec, []);
    so.scores[player.id] = score;
    gameData.throwsThisTurn = 1;
    gameData.turnDarts = [{ label: d.label, points: score, base: score, hot: false }];
    gameData.lastThrow = {
        points: score, base: score, hot: false, label: d.label, number: d.number, multiplier: d.multiplier, miss: d.number == null,
        playerId: player.id, playerName: doublesThrowerName(gameData, gameData.activeIdx), shootout: true,
        sector: throwSpec && throwSpec.sector ? throwSpec.sector : null
    };
    const waiting = so.ids.filter((id) => so.scores[id] == null);
    if (waiting.length) return shootoutNext(gameData, waiting[0]);
    const best = Math.max(...so.ids.map((id) => so.scores[id]));
    const top = so.ids.filter((id) => so.scores[id] === best);
    so.history.push({ round: so.round, scores: { ...so.scores } });
    if (top.length > 1) {
        so.ids = top; so.round += 1; so.scores = {};
        return shootoutNext(gameData, top[0]);
    }
    return finish(gameData, top[0], 'shootout');
}

/* ---------- the end ---------- */

function finish(gameData, winnerId, reason) {
    const zh = gameData.zh;
    let rows;
    if (zh.spin) {
        rows = zh.spin.rows.map((r) => ({ ...r }));
        // a shootout among players level for 1st: the winner keeps 1st, the others share 2nd
        if (reason === 'shootout') {
            for (const r of rows) if (r.place === 1 && r.id !== winnerId) r.place = 2;
            rows.sort((a, b) => (a.id === winnerId ? -1 : b.id === winnerId ? 1 : a.place - b.place));
        }
    } else {
        // nobody scored all night: the shootout winner first, everyone else 2nd
        rows = gameData.players.map((p) => ({ id: p.id, place: p.id === winnerId ? 1 : 2, onPocket: 0, total: 0, pointsRank: 1 }));
        rows.sort((a, b) => a.place - b.place);
    }
    zh.placings = rows;
    zh.secret = gameData.secret; // commit–reveal: the match is over, anyone can now recompute every draw
    const champ = gameData.players.find((p) => p.id === winnerId) || gameData.players[0];
    const standings = [];
    for (const r of rows) {
        const p = gameData.players.find((x) => x.id === r.id);
        standings.push({ id: r.id, place: r.place });
        for (const m of doublesMembersOf(p)) if (m.id !== r.id) standings.push({ id: m.id, place: r.place });
    }
    gameData.phase = makePhase('winner', {
        ...doublesWinnerFields(champ),
        reason,
        pocket: zh.spin ? zh.spin.pocket : null,
        onPocket: rows[0] ? rows[0].onPocket : 0,
        score: champ ? champ.score || 0 : 0,
        rounds: R.ROUNDS,
        standings
    });
    return { gameData, schedule: null };
}

/* ---------- bots ---------- */

/** a bot aims at the treble of the highest hot number (always worth more than T20: 10 × 3 × 3 = 90); 20 in a shootout */
function aimNumber(gameData) {
    if (!gameData || !gameData.zh || gameData.zh.shootout) return 20;
    return Math.max(...(gameData.zh.hot || [20]));
}

/* ---------- debug previews (the control tablet's preview buttons) ---------- */

function debugPreviewPhase(gameData, screen) {
    if (!gameData || !gameData.zh) return null;
    if (screen === 'zh_spin') {
        const s = R.summarise(entities(gameData));
        const draws = R.spinDraws(drawFor(gameData.secret), s.cells);
        return makePhase('spin', { draws, pocket: draws[draws.length - 1], durations: R.spinDurations(draws.length - 1, gameData.zh.fast), preview: true });
    }
    return null;
}

const meta = {
    maxRounds: R.ROUNDS,
    roundEyebrow: 'ROUND',
    roundSubtitle: () => 'NEW HOT NUMBERS',
    lastRoundTag: 'LAST ORDERS'
};

const scheduled = {
    [`${GAME}_show_next_after_round`]: (gd, action) => showNextAfterRound(gd, action),
    [`${GAME}_after_round_announce`]: (gd, action) => showNextAfterRound(gd, action),
    [`${GAME}_advance_turn`]: (gd) => advanceTurn(gd),
    [`${GAME}_begin_spin`]: (gd) => beginSpin(gd),
    [`${GAME}_resolve`]: (gd) => resolveSpin(gd)
};

module.exports = {
    init,
    initDoubles,
    handleThrow,
    aimNumber,
    debugPreviewPhase,
    scheduled,
    meta,
    // for tests
    GAME,
    drawFor,
    commitOf,
    rules: R
};
