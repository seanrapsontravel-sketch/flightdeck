/**
 * millionpound — Million Pound Oche, a quiz played with darts. Rules V2 (Sean, 2026-11-18): knowledge, accuracy
 * and nerve, without extra buttons. Plan: docs/plans/MILLION-POUND-OCHE.md (§4 is this file's contract).
 *
 * A turn (a "visit") is three questions, one dart each. Five visits each: fifteen questions, harder as they go.
 * The board's four quadrants are the answers (A top, B right, C bottom, D left), and the answer zones SHRINK by
 * visit — 5, 5, 3, 3, 2 numbers per answer — identical for every player; the rest of the board is inactive.
 *
 *   correct single / double   +1 rung
 *   correct treble            +2 rungs
 *   wrong single / double     no movement
 *   wrong treble              −1 rung (only in another answer's ACTIVE zone; never below a banked checkpoint)
 *   miss / inactive number    no movement
 *   inner bull                a free pass (+1), the FIRST one per player only; after that, no answer
 *   outer bull                no answer
 *
 * The classic fifteen-rung money tree (£100 → £1,000,000) with two guaranteed checkpoints, £1,000 and £32,000.
 * Nobody is eliminated. After everyone's fifteenth question the highest rung wins. A tie at the top: if they're all
 * millionaires, whoever reached £1M on the earliest question wins; otherwise (or if that ties too) SUDDEN DEATH — one
 * question and one dart each on one-number answer zones; a correct treble beats a correct single beats anything
 * else; repeat until it's broken.
 *
 * Per question:  playing --dart--> locked --lock ms--> reveal --reveal ms--> the visit's next question | UP NEXT |
 *                round banner | sudden death | winner
 * The rung only changes in `reveal`, so the TV never has to hold a secret.
 *
 * Pure rules and timing: no DOM. All state is plain JSON in gameData (undo and Correct Score clone it).
 */

const crypto = require('node:crypto');
const {
    buildDoublesPlayerRoster,
    doublesAdvanceThrowerAfterVisit,
    doublesContenderFields,
    doublesThrowerName,
    doublesWinnerFields,
    makePhase,
    makeRoundAnnouncePhase,
    normalizeMultiplier,
    showNextPlayerIntermission,
    slimPlayer
} = require('./core');
const qbank = require('./millionpound/bank');

const GAME = 'millionpound';
/** visits each (a "round" is everyone's visit once) */
const ROUNDS = 5;
const QUESTIONS_PER_TURN = 3;
/** darts per question: 1. QUESTIONS_PER_TURN × DARTS_PER_QUESTION is the visit (≤ 3) */
const DARTS_PER_QUESTION = 1;
const QUESTIONS = ROUNDS * QUESTIONS_PER_TURN;
/** the classic fifteen-step money tree */
const LADDER = [100, 200, 300, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 125000, 250000, 500000, 1000000];
/** guaranteed rungs: £1,000 and £32,000 */
const CHECKPOINTS = [5, 10];
/** the bank level (1–6) of question 1–15: everyone meets the same difficulty at the same point */
const QUESTION_LEVELS = [1, 1, 2, 2, 2, 3, 3, 4, 4, 4, 5, 5, 6, 6, 6];
/** numbers per answer, by visit (the zones shrink); sudden death uses 1 */
const ZONE_SIZES = [5, 5, 3, 3, 2];
const SUDDEN_ZONE = 1;
/** suspense: quick early, theatrical when the stakes are high */
const LOCK_MS = [900, 1200, 1700, 2300, 3000];
const BIG_LOCK_MS = 3800;          // a dart that could reach £1M, and every sudden-death dart
const REVEAL_MS = [2200, 2400, 2800, 3000, 3300];
const TURN_END_EXTRA_MS = 500;
const MILLION_REVEAL_MS = 5000;
const SUDDEN_REVEAL_MS = 3200;
const RESOLVE_MS = 600;
const ROUND_MS = 3000;
const SUDDEN_MAX_ROUNDS = 12;
const LEVEL_NAMES = ['WARM-UP', 'EASY', 'MEDIUM', 'HARDER', 'HARD', 'THE MILLION'];

/** The four answers at full size: five wedges each, centred on 20 / 6 / 3 / 11. */
const QUADRANTS = {
    A: [12, 5, 20, 1, 18],
    B: [4, 13, 6, 10, 15],
    C: [2, 17, 3, 19, 7],
    D: [16, 8, 11, 14, 9]
};
const ANCHORS = { A: 20, B: 6, C: 3, D: 11 };
/** answer zones by size: 5 the quadrant, 3 the anchor and both neighbours, 2 the anchor and its clockwise neighbour, 1 the anchor */
const ZONES = {
    5: QUADRANTS,
    3: { A: [5, 20, 1], B: [13, 6, 10], C: [17, 3, 19], D: [8, 11, 14] },
    2: { A: [20, 1], B: [6, 10], C: [3, 19], D: [11, 14] },
    1: { A: [20], B: [6], C: [3], D: [11] }
};
const zoneOf = (size, n) => { for (const [k, ns] of Object.entries(ZONES[size] || QUADRANTS)) if (ns.includes(n)) return k; return null; };
const zoneSizeFor = (gameData) => (gameData && gameData.suddenDeath ? SUDDEN_ZONE : ZONE_SIZES[Math.min(Math.max(gameData && gameData.currentRound || 1, 1), ROUNDS) - 1]);

/** 'A' | 'B' | 'C' | 'D' for a dart's full quadrant (geometry only), or null (bull, outer bull, miss) */
function quadrantOf(throwSpec) {
    if (!throwSpec || throwSpec.miss) return null;
    return zoneOf(5, Number(throwSpec.number));
}
/** the answer a dart names with zones of `size` numbers, or null (inactive, bull, miss) */
function answerOf(throwSpec, size = 5) {
    if (!throwSpec || throwSpec.miss || throwSpec.number === 'bull') return null;
    return zoneOf(size, Number(throwSpec.number));
}
function isInnerBull(throwSpec) {
    if (!throwSpec || throwSpec.miss || throwSpec.number !== 'bull') return false;
    return throwSpec.sector === 'Bull' || throwSpec.sector === '50' || (throwSpec.sector == null && normalizeMultiplier(throwSpec.multiplier) === 2);
}
function isBull(throwSpec) { return !!throwSpec && !throwSpec.miss && throwSpec.number === 'bull'; }

function prizeFor(rung) {
    return rung > 0 ? LADDER[Math.min(rung, LADDER.length) - 1] : 0;
}
/** the checkpoint a player has banked: the highest checkpoint at or below the best rung they've reached */
function bankedFor(best) {
    return CHECKPOINTS.filter((c) => c <= (best || 0)).pop() || 0;
}
/** where each outcome would leave a player on rung `rung` with `banked` secured */
function stakesFor(rung, banked) {
    const top = LADDER.length;
    const single = Math.min(rung + 1, top), treble = Math.min(rung + 2, top), wrongTreble = Math.max(rung - 1, banked, 0);
    return {
        rung, banked, single, treble, wrongTreble,
        now: prizeFor(rung), right: prizeFor(single), trebleRight: prizeFor(treble), trebleWrong: prizeFor(wrongTreble),
        bankedPrize: prizeFor(banked), safe: wrongTreble === rung
    };
}

function dartLabel(throwSpec) {
    if (!throwSpec || throwSpec.miss || throwSpec.number == null) return 'MISS';
    if (throwSpec.number === 'bull') return isInnerBull(throwSpec) ? 'BULL' : 'OUTER BULL';
    const m = normalizeMultiplier(throwSpec.multiplier);
    return `${m === 3 ? 'T' : m === 2 ? 'D' : 'S'}${throwSpec.number}`;
}

/** 1-based number of the question the active player is on (1–15; sudden death continues 16, 17, …) */
function questionNo(gameData) {
    if (gameData.suddenDeath) return QUESTIONS + gameData.suddenDeath.round;
    return (Math.max(1, gameData.currentRound || 1) - 1) * QUESTIONS_PER_TURN + (gameData.questionInTurn || 0) + 1;
}

function newSeed(options) {
    if (options && Number.isFinite(Number(options.seed))) return Number(options.seed) >>> 0;
    return crypto.randomBytes(4).readUInt32LE(0);
}

function makePlayerState(base) {
    return { ...base, rung: 0, best: 0, banked: 0, score: 0, prize: 0, correct: 0, trebles: 0, wrong: 0, wrongTrebles: 0, noAnswer: 0, passes: 0, passUsed: false, millionAt: null, answers: [] };
}

/** Load the active player's current question into gameData.question (with its zones and what's at stake). */
function loadQuestion(gameData) {
    const n = questionNo(gameData);
    let entry;
    if (gameData.suddenDeath) {
        const sd = gameData.suddenDeath;
        entry = gameData.suddenPlan?.[(sd.asked || 0) % Math.max(1, gameData.suddenPlan.length)];
    } else {
        entry = gameData.plan?.[n - 1]?.[gameData.activeIdx];
    }
    const q = qbank.resolve(entry);
    if (!q) { gameData.question = null; return; }
    const p = gameData.players[gameData.activeIdx] || {};
    const size = zoneSizeFor(gameData);
    gameData.question = {
        ...q, number: n, of: QUESTIONS, turnQuestion: gameData.suddenDeath ? 1 : (gameData.questionInTurn || 0) + 1,
        zoneSize: size, zones: ZONES[size], suddenDeath: !!gameData.suddenDeath,
        stakes: gameData.suddenDeath ? null : stakesFor(p.rung || 0, p.banked || 0),
        passAvailable: !gameData.suddenDeath && !p.passUsed,
        finalVisit: !gameData.suddenDeath && gameData.currentRound === ROUNDS,
        dartsLeft: gameData.suddenDeath ? 1 : QUESTIONS_PER_TURN - (gameData.questionInTurn || 0)
    };
}

function baseState(options) {
    return {
        gameType: GAME,
        rules: 2,
        seed: newSeed(options),
        ladder: LADDER.slice(),
        checkpoints: CHECKPOINTS.slice(),
        zoneSizes: ZONE_SIZES.slice(),
        maxRounds: ROUNDS,
        questionsPerTurn: QUESTIONS_PER_TURN,
        dartsPerQuestion: DARTS_PER_QUESTION,
        questions: QUESTIONS,
        // the session's clock may only stop between rounds (see session.js)
        sessionUnit: 'round',
        activeIdx: 0,
        currentRound: 1,
        questionInTurn: 0,
        throwsThisTurn: 0,
        dartsThisQuestion: 0,
        turnDarts: [],
        question: null,
        suddenDeath: null,
        phase: makePhase('playing'),
        helpVisible: false,
        lastThrow: null
    };
}

function withPlan(gameData, options) {
    const recent = Array.isArray(options?.recentQuestions) ? options.recentQuestions : [];
    gameData.plan = qbank.drawPlan({ players: gameData.players.length, levels: QUESTION_LEVELS, seed: gameData.seed, recent });
    gameData.questionIds = gameData.plan.flat().map((e) => e.id);
    // sudden-death questions: hard ones, none from this game's plan
    gameData.suddenPlan = qbank.drawPlan({ players: 1, levels: Array.from({ length: 24 }, (_, i) => (i % 2 ? 5 : 6)), seed: (gameData.seed ^ 0x5bd1e995) >>> 0, recent: recent.concat(gameData.questionIds) }).flat();
    loadQuestion(gameData);
    return gameData;
}

function init(ordered, options = {}) {
    const gameData = {
        ...baseState(options),
        players: ordered.map((p) => makePlayerState(slimPlayer(p))),
        isDoublesLineup: false,
        throwerIndices: ordered.map(() => 0)
    };
    return withPlan(gameData, options);
}

function initDoubles(players, options = {}) {
    const roster = buildDoublesPlayerRoster(options.doublesTeams, players, (base) => makePlayerState(base));
    return withPlan({ ...baseState(options), ...roster }, options);
}

/* ---------- a dart ---------- */

/** what a dart does to this question: { answer, inZone, pass, outcome, move } */
function judge(gameData, throwSpec) {
    const q = gameData.question, p = gameData.players[gameData.activeIdx];
    const size = zoneSizeFor(gameData);
    const m = throwSpec && !throwSpec.miss ? normalizeMultiplier(throwSpec.multiplier) : 1;
    const answer = answerOf(throwSpec, size);
    const sudden = !!gameData.suddenDeath;
    if (isBull(throwSpec)) {
        if (!sudden && isInnerBull(throwSpec) && !p.passUsed) return { answer: null, pass: true, outcome: 'pass', move: 1 };
        return { answer: null, pass: false, outcome: isInnerBull(throwSpec) ? (sudden ? 'bull' : 'pass_used') : 'outer_bull', move: 0 };
    }
    if (!answer) return { answer: null, pass: false, outcome: throwSpec && !throwSpec.miss ? 'inactive' : 'miss', move: 0 };
    const right = answer === q.correctKey, treble = m === 3;
    if (right) return { answer, pass: false, outcome: treble ? 'treble_right' : 'right', move: treble ? 2 : 1, treble };
    return { answer, pass: false, outcome: treble ? 'treble_wrong' : 'wrong', move: treble ? -1 : 0, treble };
}

function handleThrow(gameData, throwSpec) {
    if (!gameData || gameData.phase?.type !== 'playing') return { gameData, schedule: null };
    if ((gameData.dartsThisQuestion || 0) >= DARTS_PER_QUESTION) return { gameData, schedule: null };
    if ((gameData.throwsThisTurn || 0) >= QUESTIONS_PER_TURN * DARTS_PER_QUESTION) return { gameData, schedule: null };
    const player = gameData.players[gameData.activeIdx];
    if (!player || !gameData.question) return { gameData, schedule: null };

    const j = judge(gameData, throwSpec);
    const label = dartLabel(throwSpec);
    gameData.dartsThisQuestion = (gameData.dartsThisQuestion || 0) + 1;
    gameData.throwsThisTurn = (gameData.throwsThisTurn || 0) + 1;
    // a sudden-death throw is a visit of its own: mark it over so the server waits for the takeout
    if (gameData.suddenDeath) gameData.throwsThisTurn = 3;
    gameData.turnDarts = [...(gameData.turnDarts || []), { label, answer: j.answer, pass: j.pass, outcome: j.outcome, question: gameData.question.number }].slice(-3);
    gameData.lastThrow = {
        label: j.pass ? `${label} · FREE PASS` : j.answer ? `${j.answer} · ${label}` : label,
        dart: label,
        answer: j.answer,
        pass: j.pass,
        outcome: j.outcome,
        hit: !!j.answer || j.pass,
        points: 0,
        number: throwSpec && !throwSpec.miss ? throwSpec.number : null,
        multiplier: throwSpec && !throwSpec.miss ? normalizeMultiplier(throwSpec.multiplier) : 1,
        sector: throwSpec && throwSpec.sector ? String(throwSpec.sector) : null,
        miss: !throwSpec || !!throwSpec.miss,
        question: gameData.question.number,
        playerId: player.id,
        playerName: doublesThrowerName(gameData, gameData.activeIdx)
    };
    if (gameData.dartsThisQuestion < DARTS_PER_QUESTION) return { gameData, schedule: null };

    const n = gameData.question.number;
    const couldMillion = !gameData.suddenDeath && (player.rung || 0) >= LADDER.length - 2;
    const ms = gameData.suddenDeath || couldMillion ? BIG_LOCK_MS : LOCK_MS[Math.min(gameData.currentRound, ROUNDS) - 1];
    gameData.phase = makePhase('locked', {
        answer: j.answer, pass: j.pass, outcome: j.outcome, treble: !!j.treble, dart: label,
        round: gameData.currentRound, question: n, ms, playerIdx: gameData.activeIdx, suddenDeath: !!gameData.suddenDeath
    });
    return { gameData, schedule: { delayMs: ms, next: `${GAME}_reveal` } };
}

function reveal(gameData) {
    if (gameData.phase?.type !== 'locked') return { gameData, schedule: null };
    const idx = gameData.activeIdx;
    const player = gameData.players[idx];
    const q = gameData.question;
    const d = gameData.phase.data || {};
    const outcome = d.outcome || 'miss';
    const right = outcome === 'right' || outcome === 'treble_right' || outcome === 'pass';
    const base = {
        answer: d.answer ?? null, pass: !!d.pass, outcome, treble: !!d.treble, correctKey: q ? q.correctKey : null, right,
        noAnswer: !d.answer && !d.pass, round: gameData.currentRound, question: q ? q.number : null, playerIdx: idx
    };

    if (gameData.suddenDeath) {
        const sd = gameData.suddenDeath;
        const tier = outcome === 'treble_right' ? 2 : outcome === 'right' ? 1 : 0;
        sd.results[idx] = tier;
        player.answers = [...(player.answers || []), { round: 'SD' + sd.round, question: q ? q.number : null, qid: q ? q.id : null, chosen: base.answer, pass: false, correctKey: base.correctKey, right, outcome, dart: d.dart, suddenDeath: true }];
        gameData.phase = makePhase('reveal', { ...base, suddenDeath: true, tier, rung: player.rung || 0, rungBefore: player.rung || 0, prize: player.prize || 0, prizeBefore: player.prize || 0, move: 0, turnOver: true });
        return { gameData, schedule: { delayMs: SUDDEN_REVEAL_MS, next: `${GAME}_next` } };
    }

    const rungBefore = player.rung || 0;
    const move = outcome === 'treble_right' ? 2 : (outcome === 'right' || outcome === 'pass') ? 1 : outcome === 'treble_wrong' ? -1 : 0;
    let rung = Math.min(LADDER.length, Math.max(0, rungBefore + move));
    if (move < 0) rung = Math.max(rung, player.banked || 0);        // never below a banked checkpoint
    player.rung = rung;
    player.best = Math.max(player.best || 0, rung);
    player.banked = Math.max(player.banked || 0, bankedFor(player.best));
    if (outcome === 'right' || outcome === 'treble_right') player.correct = (player.correct || 0) + 1;
    if (outcome === 'treble_right') player.trebles = (player.trebles || 0) + 1;
    if (outcome === 'treble_wrong') player.wrongTrebles = (player.wrongTrebles || 0) + 1;
    if (outcome === 'wrong' || outcome === 'treble_wrong') player.wrong = (player.wrong || 0) + 1;
    if (base.noAnswer) player.noAnswer = (player.noAnswer || 0) + 1;     // a miss, a number not in play, an outer bull, a used bull
    if (outcome === 'pass') { player.passes = (player.passes || 0) + 1; player.passUsed = true; }
    if (rung === LADDER.length && player.millionAt == null) player.millionAt = q ? q.number : null;
    player.score = player.rung;
    player.prize = prizeFor(player.rung);
    player.answers = [...(player.answers || []), {
        round: gameData.currentRound, question: q ? q.number : null, qid: q ? q.id : null,
        chosen: base.answer, pass: base.pass, correctKey: base.correctKey, right, outcome, move: rung - rungBefore,
        dart: gameData.lastThrow ? gameData.lastThrow.dart : 'MISS'
    }];
    const million = rung === LADDER.length && rungBefore < LADDER.length;
    const turnOver = (gameData.throwsThisTurn || 0) >= QUESTIONS_PER_TURN * DARTS_PER_QUESTION;
    const saved = move < 0 && rung === rungBefore;                    // a wrong treble on a checkpoint
    gameData.phase = makePhase('reveal', {
        ...base, turnOver, move: rung - rungBefore, saved,
        rungBefore, rung, prizeBefore: prizeFor(rungBefore), prize: player.prize, banked: player.banked, million
    });
    const r = Math.min(gameData.currentRound, ROUNDS) - 1;
    const delayMs = million ? MILLION_REVEAL_MS : REVEAL_MS[r] + (turnOver ? TURN_END_EXTRA_MS : 0);
    return { gameData, schedule: { delayMs, next: `${GAME}_next` } };
}

/** After a reveal: the visit's next question, the next player's UP NEXT, a new round's banner, sudden death or the end. */
function next(gameData) {
    if (gameData.phase?.type !== 'reveal') return { gameData, schedule: null };
    if (gameData.suddenDeath) return suddenNext(gameData);
    if (!gameData.phase.data?.turnOver) {
        gameData.questionInTurn = (gameData.questionInTurn || 0) + 1;
        gameData.dartsThisQuestion = 0;
        loadQuestion(gameData);
        gameData.phase = makePhase('playing');
        return { gameData, schedule: null };
    }
    let nextIdx = gameData.activeIdx + 1;
    if (nextIdx < gameData.players.length) {
        return showNextPlayerIntermission(gameData, GAME, nextIdx, upNextExtra(gameData, nextIdx));
    }
    nextIdx = 0;
    if (gameData.currentRound >= ROUNDS) {
        gameData.phase = makePhase('reveal', { ...gameData.phase.data, final: true });
        return { gameData, schedule: { delayMs: RESOLVE_MS, next: `${GAME}_resolve_match` } };
    }
    // the round ends here: every player has had the same number of questions, and the session clock may stop now
    gameData.currentRound += 1;
    gameData.questionInTurn = 0;
    gameData.phase = makeRoundAnnouncePhase(GAME, gameData.currentRound);
    Object.assign(gameData.phase.data, { zoneSize: ZONE_SIZES[gameData.currentRound - 1], finalVisit: gameData.currentRound === ROUNDS });
    return {
        gameData,
        schedule: { delayMs: ROUND_MS, next: `${GAME}_show_next_after_round`, nextPlayerIndex: nextIdx }
    };
}

function upNextExtra(gameData, idx) {
    const p = gameData.players[idx] || {};
    const rung = p.rung || 0;
    if (gameData.suddenDeath) return { round: gameData.currentRound, rung, prize: prizeFor(rung), suddenDeath: true, sdRound: gameData.suddenDeath.round };
    const first = (gameData.currentRound - 1) * QUESTIONS_PER_TURN + 1;
    return {
        round: gameData.currentRound, rung, prize: prizeFor(rung), playingFor: LADDER[Math.min(rung, LADDER.length - 1)],
        questions: [first, first + QUESTIONS_PER_TURN - 1], zoneSize: ZONE_SIZES[gameData.currentRound - 1], finalVisit: gameData.currentRound === ROUNDS
    };
}

function showNextAfterRound(gameData, action) {
    const idx = Number(action?.nextPlayerIndex) || 0;
    return showNextPlayerIntermission(gameData, GAME, idx, upNextExtra(gameData, idx));
}

/** Start the next player's visit (intermission → playing). */
function advanceTurn(gameData) {
    const idx = gameData.phase?.data?.nextPlayerIndex;
    doublesAdvanceThrowerAfterVisit(gameData, gameData.activeIdx);
    gameData.activeIdx = Number.isInteger(idx) ? idx : (gameData.activeIdx + 1) % gameData.players.length;
    gameData.questionInTurn = 0;
    gameData.throwsThisTurn = 0;
    gameData.dartsThisQuestion = 0;
    gameData.turnDarts = [];
    gameData.lastThrow = null;
    loadQuestion(gameData);
    gameData.phase = makePhase('playing');
    return { gameData, schedule: null };
}

/* ---------- the end: a proper winner ---------- */

function standingsOf(players) {
    return players.map((p) => ({ id: p.id, rung: p.rung || 0, prize: prizeFor(p.rung || 0), correct: p.correct || 0, trebles: p.trebles || 0, wrong: p.wrong || 0, wrongTrebles: p.wrongTrebles || 0, noAnswer: p.noAnswer || 0, passes: p.passes || 0, millionAt: p.millionAt }));
}

function crown(gameData, idx, reason, extra = {}) {
    const players = gameData.players;
    const champ = players[idx] || players[0];
    gameData.suddenDeath = gameData.suddenDeath ? { ...gameData.suddenDeath, done: true } : null;
    gameData.phase = makePhase('winner', {
        ...doublesWinnerFields(champ), reason, rung: champ.rung || 0, prize: prizeFor(champ.rung || 0), score: champ.rung || 0,
        rounds: ROUNDS, questions: QUESTIONS, standings: standingsOf(players), ...extra
    });
    return { gameData, schedule: null };
}

function resolveMatch(gameData) {
    const players = gameData.players || [];
    const best = Math.max(0, ...players.map((p) => p.rung || 0));
    let pool = players.map((p, i) => i).filter((i) => (players[i].rung || 0) === best);
    if (pool.length === 1) return crown(gameData, pool[0], 'rung');
    // millionaires: the earliest to £1M wins
    if (best === LADDER.length) {
        const first = Math.min(...pool.map((i) => players[i].millionAt ?? Infinity));
        const earliest = pool.filter((i) => (players[i].millionAt ?? Infinity) === first);
        if (earliest.length === 1) return crown(gameData, earliest[0], 'million_first', { millionAt: first });
        pool = earliest;
    }
    return startSuddenDeath(gameData, pool);
}

function startSuddenDeath(gameData, contenders, round = 1) {
    const prev = gameData.suddenDeath;
    gameData.suddenDeath = { round, contenders, order: 0, results: {}, asked: prev ? prev.asked : 0 };
    gameData.currentRound = ROUNDS;            // the session clock treats the tiebreak as part of the last round
    gameData.phase = makePhase('round_announce', {
        gameType: GAME, round: ROUNDS, maxRounds: ROUNDS, isLast: true, suddenDeath: true, sdRound: round,
        eyebrow: 'SUDDEN DEATH', title: 'SUDDEN DEATH', subtitle: round === 1 ? 'ONE QUESTION · ONE DART · ONE NUMBER EACH' : `ROUND ${round} · STILL LEVEL`,
        contenders: contenders.map((i) => doublesContenderFields(gameData.players[i])), zoneSize: SUDDEN_ZONE, tags: []
    });
    return { gameData, schedule: { delayMs: ROUND_MS, next: `${GAME}_sudden_up_next` } };
}

function suddenUpNext(gameData) {
    const sd = gameData.suddenDeath;
    const idx = sd.contenders[sd.order];
    return showNextPlayerIntermission(gameData, GAME, idx, upNextExtra(gameData, idx));
}

function suddenAdvance(gameData) {
    const sd = gameData.suddenDeath;
    const idx = sd.contenders[sd.order];
    doublesAdvanceThrowerAfterVisit(gameData, gameData.activeIdx);
    gameData.activeIdx = idx;
    gameData.questionInTurn = 0;
    gameData.throwsThisTurn = 0;
    gameData.dartsThisQuestion = 0;
    gameData.turnDarts = [];
    gameData.lastThrow = null;
    loadQuestion(gameData);
    sd.asked = (sd.asked || 0) + 1;
    gameData.phase = makePhase('playing');
    return { gameData, schedule: null };
}

function suddenNext(gameData) {
    const sd = gameData.suddenDeath;
    sd.order += 1;
    if (sd.order < sd.contenders.length) return suddenUpNext(gameData);
    const top = Math.max(...sd.contenders.map((i) => sd.results[i] || 0));
    const survivors = top > 0 ? sd.contenders.filter((i) => (sd.results[i] || 0) === top) : sd.contenders;
    if (survivors.length === 1) return crown(gameData, survivors[0], 'sudden_death', { sdRound: sd.round });
    if (sd.round >= SUDDEN_MAX_ROUNDS) {
        gameData.phase = makePhase('draw', { reason: 'sudden_death_limit', contenders: survivors.map((i) => doublesContenderFields(gameData.players[i])), standings: standingsOf(gameData.players) });
        return { gameData, schedule: null };
    }
    return startSuddenDeath(gameData, survivors, sd.round + 1);
}

/* ---------- bots ---------- */

/** chance a bot knows the answer, by profile, at bank level 1 → 6 */
const BOT_KNOWS = {
    dummy: [0.45, 0.4, 0.35, 0.3, 0.28, 0.25],
    casual: [0.7, 0.6, 0.5, 0.42, 0.35, 0.3],
    intermediate: [0.85, 0.75, 0.65, 0.55, 0.45, 0.38],
    advanced: [0.95, 0.9, 0.82, 0.72, 0.62, 0.55]
};

/**
 * A bot that knows the answer aims at its zone's anchor — an advanced bot goes for the treble. One that doesn't:
 * if its free pass is unused, a good bot goes for the inner bull; otherwise it guesses a single (never a treble).
 */
function aimedThrow(gameData, profileId, roll) {
    const q = gameData && gameData.question;
    if (!q || !roll || typeof roll.rollAimedSegmentThrow !== 'function') return null;
    const odds = BOT_KNOWS[profileId] || BOT_KNOWS.intermediate;
    const level = QUESTION_LEVELS[Math.min(q.number || 1, QUESTIONS) - 1] || 6;
    if (Math.random() < odds[level - 1]) return roll.rollAimedSegmentThrow(ANCHORS[q.correctKey], profileId === 'advanced' ? 3 : 1, profileId);
    if (q.passAvailable && (profileId === 'advanced' || profileId === 'intermediate')) return roll.rollAimedSegmentThrow('bull', 2, profileId);
    return roll.rollAimedSegmentThrow(ANCHORS[qbank.LETTERS[Math.floor(Math.random() * 4)]], 1, profileId);
}

function aimNumber(gameData) {
    const key = gameData && gameData.question && gameData.question.correctKey;
    return key ? ANCHORS[key] : 20;
}

/* ---------- debug previews (the control tablet's preview buttons) ---------- */

function debugPreviewPhase(gameData, screen) {
    const q = gameData.question || {};
    const idx = gameData.activeIdx || 0;
    const p = (gameData.players || [])[idx] || {};
    const wrongKey = qbank.LETTERS.find((L) => L !== q.correctKey) || 'A';
    const rung = p.rung || 0, banked = p.banked || 0, st = stakesFor(rung, banked);
    const base = { round: gameData.currentRound, question: q.number, playerIdx: idx, preview: true, correctKey: q.correctKey, rungBefore: rung, prizeBefore: prizeFor(rung), banked };
    const rev = (o) => makePhase('reveal', { ...base, ...o, prize: prizeFor(o.rung), move: o.rung - rung });
    switch (screen) {
        case 'mpo_locked': return makePhase('locked', { ...base, answer: q.correctKey || 'A', pass: false, outcome: 'right', dart: 'S20', ms: 3000 });
        case 'mpo_right': return rev({ answer: q.correctKey, pass: false, outcome: 'right', right: true, rung: st.single });
        case 'mpo_treble': return rev({ answer: q.correctKey, pass: false, outcome: 'treble_right', treble: true, right: true, rung: st.treble });
        case 'mpo_wrong': return rev({ answer: wrongKey, pass: false, outcome: 'wrong', right: false, rung });
        case 'mpo_wrong_treble': return rev({ answer: wrongKey, pass: false, outcome: 'treble_wrong', treble: true, right: false, rung: st.wrongTreble, saved: st.safe });
        case 'mpo_pass': return rev({ answer: null, pass: true, outcome: 'pass', right: true, rung: st.single });
        case 'mpo_million': return makePhase('reveal', { ...base, answer: q.correctKey, pass: false, outcome: 'treble_right', treble: true, right: true, million: true, question: QUESTIONS,
            rungBefore: LADDER.length - 2, rung: LADDER.length, prizeBefore: prizeFor(LADDER.length - 2), prize: prizeFor(LADDER.length), move: 2 });
        default: return null;
    }
}

const meta = {
    maxRounds: ROUNDS,
    roundEyebrow: 'VISIT',
    roundSubtitle: (r) => {
        const rr = Math.min(Math.max(r, 1), ROUNDS), first = (rr - 1) * QUESTIONS_PER_TURN + 1, z = ZONE_SIZES[rr - 1];
        return `QUESTIONS ${first}–${first + QUESTIONS_PER_TURN - 1} · ${z} NUMBER${z > 1 ? 'S' : ''} AN ANSWER`;
    },
    lastRoundTag: 'FINAL VISIT',
    // a dart that lands outside a live question must never be held and then
    // answer the next question unread: the server drops it
    queueThrows: false
};

const scheduled = {
    [`${GAME}_reveal`]: (gd) => reveal(gd),
    [`${GAME}_next`]: (gd) => next(gd),
    [`${GAME}_show_next_after_round`]: (gd, action) => showNextAfterRound(gd, action),
    [`${GAME}_advance_turn`]: (gd) => (gd.suddenDeath ? suddenAdvance(gd) : advanceTurn(gd)),
    [`${GAME}_resolve_match`]: (gd) => resolveMatch(gd),
    [`${GAME}_sudden_up_next`]: (gd) => suddenUpNext(gd)
};

module.exports = {
    init,
    initDoubles,
    handleThrow,
    aimedThrow,
    aimNumber,
    debugPreviewPhase,
    scheduled,
    meta,
    // for tests and the TV mirror
    GAME,
    ROUNDS,
    QUESTIONS_PER_TURN,
    QUESTIONS,
    LADDER,
    CHECKPOINTS,
    QUESTION_LEVELS,
    ZONE_SIZES,
    ZONES,
    LEVEL_NAMES,
    LOCK_MS,
    BIG_LOCK_MS,
    REVEAL_MS,
    MILLION_REVEAL_MS,
    DARTS_PER_QUESTION,
    QUADRANTS,
    ANCHORS,
    quadrantOf,
    answerOf,
    isBull,
    isInnerBull,
    prizeFor,
    bankedFor,
    stakesFor,
    dartLabel,
    questionNo,
    judge
};
