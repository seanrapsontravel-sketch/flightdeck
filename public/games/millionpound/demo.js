// ?demo=1 — a simulated Million Pound Oche game with the server's own V2 rules and windows (src/engines/millionpound.js
// + core.js): three questions a visit, one dart each, answer zones 5 / 5 / 3 / 3 / 2 numbers; a right single +1, a
// right treble +2, a wrong treble −1 (never below a banked £1,000 / £32,000); the first inner bull a free pass; then
// the highest rung wins, tied millionaires by who got there first, otherwise sudden death on one-number zones.
// It plays from a sample of the real bank (demo-questions.js), offline.
//   window.__millionpoundDemo.force(kind)  kind: right | treble | wrong | wrongtreble | bull | outer | miss | inactive |
//                                           million | winner | sudden
//   .queue([kinds])  .set(i, {...})  .pause()  .resume()  .state()
//   keys (demo only): A B C D a single at that answer; shift+A… a treble; X the inner bull; M a miss; or click the board
import { NAMES, rng, phase, demoTimer, demoMembers, demoThrower, displayName, advanceThrower } from '../lib3d/kit/demo.js';
import { ANCHORS, CHECKPOINTS, LADDER, LETTERS, PER_TURN, QUESTIONS, ROUNDS, ZONES, ZONE_SIZES, answerOf, prizeFor } from './common.js';
import { DEMO_QUESTIONS } from './demo-questions.js';

const LEVEL_OF = [1, 1, 2, 2, 2, 3, 3, 4, 4, 4, 5, 5, 6, 6, 6];
const LOCK_MS = [900, 1200, 1700, 2300, 3000], BIG_LOCK = 3800, REVEAL = [2200, 2400, 2800, 3000, 3300], TURN_END = 500, MILLION_REVEAL = 5000, SD_REVEAL = 3200;
const NEXT_MS = 2500, ROUND_MS = 3000;
const LONG = ['Christopher & Maximilian', 'Bartholomew', 'Anastasia', 'Montgomery', 'Guinevere', 'Theodora'];
const banked = (best) => CHECKPOINTS.filter((c) => c <= best).pop() || 0;
const stakesFor = (rung, bank) => { const single = Math.min(rung + 1, 15), treble = Math.min(rung + 2, 15), wrong = Math.max(rung - 1, bank, 0); return { rung, banked: bank, single, treble, wrongTreble: wrong, now: prizeFor(rung), right: prizeFor(single), trebleRight: prizeFor(treble), trebleWrong: prizeFor(wrong), bankedPrize: prizeFor(bank), safe: wrong === rung }; };

export function startDemo(apply, { players = 4, speed = 1, seed, doubles = false, longNames = false } = {}) {
    const R = rng(seed ?? 1234);
    const T = demoTimer({ speed });
    const byLevel = [1, 2, 3, 4, 5, 6].map((l) => DEMO_QUESTIONS.filter((q) => q.level === l));
    const shuffle = (a) => { const o = a.slice(); for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o; };
    const g = {
        gameType: 'millionpound', rules: 2, seed: seed ?? 1234, ladder: LADDER.slice(), checkpoints: CHECKPOINTS.slice(), zoneSizes: ZONE_SIZES.slice(),
        maxRounds: ROUNDS, questionsPerTurn: PER_TURN, questions: QUESTIONS, sessionUnit: 'round',
        players: Array.from({ length: players }, (_, i) => {
            const p = { id: 'p' + i, name: longNames ? LONG[i % LONG.length] : NAMES[i], avatar: null, rung: 0, best: 0, banked: 0, score: 0, prize: 0, correct: 0, trebles: 0, wrongTrebles: 0, passes: 0, passUsed: false, millionAt: null, answers: [] };
            if (doubles) { p.members = [{ id: 'p' + i + 'a', name: NAMES[i * 2 % 12], avatar: null }, { id: 'p' + i + 'b', name: NAMES[(i * 2 + 1) % 12], avatar: null }]; p.name = displayName(p.members); }
            return p;
        }),
        activeIdx: 0, currentRound: 1, questionInTurn: 0, throwsThisTurn: 0, dartsThisQuestion: 0, turnDarts: [],
        isDoublesLineup: doubles, throwerIndices: Array(players).fill(0),
        question: null, suddenDeath: null, phase: phase('playing'), lastThrow: null, helpVisible: false,
    };
    const emit = () => apply(JSON.parse(JSON.stringify(g)));
    const zoneSize = () => (g.suddenDeath ? 1 : ZONE_SIZES[g.currentRound - 1]);
    const qNo = () => (g.suddenDeath ? QUESTIONS + g.suddenDeath.round : (g.currentRound - 1) * PER_TURN + g.questionInTurn + 1);
    let sdAsked = 0;
    function load() {
        const n = qNo(), pool = byLevel[(g.suddenDeath ? 6 : LEVEL_OF[n - 1]) - 1], src = pool[(g.activeIdx + n + sdAsked) % pool.length];
        const key = LETTERS[Math.floor(R() * 4)], wrong = shuffle(src.wrong), answers = {};
        for (const L of LETTERS) answers[L] = L === key ? src.correct : wrong.shift();
        const pl = g.players[g.activeIdx], size = zoneSize();
        g.question = { id: `${src.id}|${g.activeIdx}|${n}`, level: src.level, category: src.category, text: src.q, answers, correctKey: key, number: n, of: QUESTIONS,
            turnQuestion: g.suddenDeath ? 1 : g.questionInTurn + 1, zoneSize: size, zones: ZONES[size], suddenDeath: !!g.suddenDeath,
            stakes: g.suddenDeath ? null : stakesFor(pl.rung, pl.banked), passAvailable: !g.suddenDeath && !pl.passUsed, finalVisit: !g.suddenDeath && g.currentRound === ROUNDS,
            dartsLeft: g.suddenDeath ? 1 : PER_TURN - g.questionInTurn };
    }
    let forced = null, interactive = false;
    const script = [];
    function pickSpec(kind) {
        const k = kind || forced || script.shift() || (() => { const r = R(); return r < 0.5 ? 'right' : r < 0.6 ? 'treble' : r < 0.72 ? 'wrong' : r < 0.77 ? 'wrongtreble' : r < 0.82 ? 'bull' : r < 0.88 ? 'inactive' : r < 0.93 ? 'outer' : 'miss'; })();
        forced = null;
        const size = zoneSize(), key = g.question.correctKey;
        const at = (L, m = 1) => { const ns = ZONES[size][L]; const n = R() < 0.6 ? ANCHORS[L] : ns[Math.floor(R() * ns.length)]; return { number: n, multiplier: m, sector: (m === 3 ? 'T' : m === 2 ? 'D' : R() < 0.6 ? 's' : 'S') + n }; };
        const other = () => LETTERS.filter((L) => L !== key)[Math.floor(R() * 3)];
        if (k === 'right' || k === 'million') return at(key, R() < 0.15 ? 2 : 1);
        if (k === 'treble') return at(key, 3);
        if (k === 'wrong') return at(other());
        if (k === 'wrongtreble') return at(other(), 3);
        if (k === 'bull') return { number: 'bull', multiplier: 2, sector: 'Bull' };
        if (k === 'outer') return { number: 'bull', multiplier: 1, sector: '25' };
        if (k === 'inactive') { const live = new Set(Object.values(ZONES[size]).flat()); const off = [12, 5, 20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9].filter((n) => !live.has(n)); if (off.length) { const n = off[Math.floor(R() * off.length)]; return { number: n, multiplier: 3, sector: 'T' + n }; } return { miss: true }; }
        return { miss: true };
    }
    const label = (s) => (s.miss ? 'MISS' : s.number === 'bull' ? (s.sector === 'Bull' ? 'BULL' : 'OUTER BULL') : (s.multiplier === 3 ? 'T' : s.multiplier === 2 ? 'D' : 'S') + s.number);
    function judge(s) {
        const p = g.players[g.activeIdx], sd = !!g.suddenDeath;
        if (!s.miss && s.number === 'bull') {
            const inner = s.sector === 'Bull';
            if (!sd && inner && !p.passUsed) return { answer: null, pass: true, outcome: 'pass' };
            return { answer: null, pass: false, outcome: inner ? (sd ? 'bull' : 'pass_used') : 'outer_bull' };
        }
        const answer = answerOf(s, zoneSize());
        if (!answer) return { answer: null, pass: false, outcome: s.miss ? 'miss' : 'inactive' };
        const right = answer === g.question.correctKey, treble = s.multiplier === 3;
        return { answer, pass: false, treble, outcome: right ? (treble ? 'treble_right' : 'right') : (treble ? 'treble_wrong' : 'wrong') };
    }
    /** handleThrow */
    function throwDart(spec) {
        if (g.phase.type !== 'playing' || g.dartsThisQuestion >= 1) return;
        const s = spec || pickSpec(), pl = g.players[g.activeIdx], j = judge(s), lab = label(s);
        g.dartsThisQuestion = 1; g.throwsThisTurn = g.suddenDeath ? 3 : g.throwsThisTurn + 1;
        g.turnDarts.push({ label: lab, answer: j.answer, pass: j.pass, outcome: j.outcome, question: g.question.number });
        g.lastThrow = { label: j.pass ? `${lab} · FREE PASS` : j.answer ? `${j.answer} · ${lab}` : lab, dart: lab, answer: j.answer, pass: j.pass, outcome: j.outcome, hit: !!j.answer || j.pass, points: 0,
            number: s.miss ? null : s.number, multiplier: s.miss ? 1 : s.multiplier, sector: s.sector || null, miss: !!s.miss, question: g.question.number, playerId: pl.id, playerName: demoThrower(g, g.activeIdx).name };
        const ms = g.suddenDeath || pl.rung >= 13 ? BIG_LOCK : LOCK_MS[g.currentRound - 1];
        g.phase = phase('locked', { answer: j.answer, pass: j.pass, outcome: j.outcome, treble: !!j.treble, dart: lab, round: g.currentRound, question: g.question.number, ms, playerIdx: g.activeIdx, suddenDeath: !!g.suddenDeath });
        emit(); T.later(reveal, ms);
    }
    function reveal() {
        const pl = g.players[g.activeIdx], q = g.question, d = g.phase.data, oc = d.outcome;
        const right = oc === 'right' || oc === 'treble_right' || oc === 'pass';
        const base = { answer: d.answer, pass: d.pass, outcome: oc, treble: d.treble, correctKey: q.correctKey, right, noAnswer: !d.answer && !d.pass, round: g.currentRound, question: q.number, playerIdx: g.activeIdx };
        if (g.suddenDeath) {
            const tier = oc === 'treble_right' ? 2 : oc === 'right' ? 1 : 0;
            g.suddenDeath.results[g.activeIdx] = tier;
            pl.answers.push({ round: 'SD' + g.suddenDeath.round, question: q.number, qid: q.id, chosen: d.answer, pass: false, correctKey: q.correctKey, right, outcome: oc, dart: d.dart, suddenDeath: true });
            g.phase = phase('reveal', { ...base, suddenDeath: true, tier, rung: pl.rung, rungBefore: pl.rung, prize: pl.prize, prizeBefore: pl.prize, move: 0, turnOver: true });
            emit(); T.later(next, SD_REVEAL); return;
        }
        const before = pl.rung, move = oc === 'treble_right' ? 2 : (oc === 'right' || oc === 'pass') ? 1 : oc === 'treble_wrong' ? -1 : 0;
        let rung = Math.min(15, Math.max(0, before + move)); if (move < 0) rung = Math.max(rung, pl.banked);
        pl.rung = rung; pl.best = Math.max(pl.best, rung); pl.banked = Math.max(pl.banked, banked(pl.best));
        if (oc === 'right' || oc === 'treble_right') pl.correct++;
        if (oc === 'treble_right') pl.trebles++;
        if (oc === 'treble_wrong') pl.wrongTrebles++;
        if (oc === 'pass') { pl.passes++; pl.passUsed = true; }
        if (rung === 15 && pl.millionAt == null) pl.millionAt = q.number;
        pl.score = rung; pl.prize = prizeFor(rung);
        pl.answers.push({ round: g.currentRound, question: q.number, qid: q.id, chosen: d.answer, pass: d.pass, correctKey: q.correctKey, right, outcome: oc, move: rung - before, dart: d.dart });
        const million = rung === 15 && before < 15, turnOver = g.throwsThisTurn >= PER_TURN;
        g.phase = phase('reveal', { ...base, turnOver, move: rung - before, saved: move < 0 && rung === before, rungBefore: before, rung, prizeBefore: prizeFor(before), prize: pl.prize, banked: pl.banked, million });
        emit(); T.later(next, million ? MILLION_REVEAL : REVEAL[g.currentRound - 1] + (turnOver ? TURN_END : 0));
    }
    const auto = (ms) => { if (!interactive) T.later(() => throwDart(), ms); };
    function next() {
        if (g.suddenDeath) return sdNext();
        if (!g.phase.data.turnOver) { g.questionInTurn++; g.dartsThisQuestion = 0; load(); g.phase = phase('playing'); emit(); auto(2600 + R() * 1500); return; }
        const ni = g.activeIdx + 1;
        if (ni < g.players.length) return upNext(ni);
        if (g.currentRound >= ROUNDS) { g.phase = phase('reveal', { ...g.phase.data, final: true }); emit(); T.later(resolve, 600); return; }
        g.currentRound++; g.questionInTurn = 0;
        const first = (g.currentRound - 1) * PER_TURN + 1, z = ZONE_SIZES[g.currentRound - 1];
        g.phase = phase('round_announce', { gameType: 'millionpound', round: g.currentRound, maxRounds: ROUNDS, isLast: g.currentRound >= ROUNDS, eyebrow: 'VISIT', title: `ROUND ${g.currentRound}`, subtitle: `QUESTIONS ${first}–${first + 2}`, zoneSize: z, finalVisit: g.currentRound === ROUNDS });
        emit(); T.later(() => upNext(0), ROUND_MS);
    }
    function upNext(i) {
        const p = g.players[i];
        g.phase = phase('intermission', { nextPlayerIndex: i, nextPlayerName: demoThrower(g, i).name, nextTeamName: displayName(demoMembers(g, i)), round: g.currentRound, rung: p.rung, prize: prizeFor(p.rung), suddenDeath: !!g.suddenDeath });
        emit(); T.later(() => advance(i), NEXT_MS);
    }
    function advance(i) {
        advanceThrower(g, g.activeIdx);
        g.activeIdx = i; g.questionInTurn = 0; g.throwsThisTurn = 0; g.dartsThisQuestion = 0; g.turnDarts = []; g.lastThrow = null;
        load(); if (g.suddenDeath) sdAsked++;
        g.phase = phase('playing'); emit(); auto(3000 + R() * 1500);
    }
    function crown(i, reason, extra = {}) {
        const c = g.players[i];
        g.phase = phase('winner', { reason, rung: c.rung, prize: c.prize, score: c.rung, rounds: ROUNDS, questions: QUESTIONS, winnerId: c.id, winnerName: displayName(demoMembers(g, i)), ...extra });
        emit();
    }
    function resolve() {
        const best = Math.max(0, ...g.players.map((p) => p.rung));
        let pool = g.players.map((p, i) => i).filter((i) => g.players[i].rung === best);
        if (pool.length === 1) return crown(pool[0], 'rung');
        if (best === 15) {
            const first = Math.min(...pool.map((i) => g.players[i].millionAt ?? Infinity));
            const early = pool.filter((i) => (g.players[i].millionAt ?? Infinity) === first);
            if (early.length === 1) return crown(early[0], 'million_first', { millionAt: first });
            pool = early;
        }
        sudden(pool, 1);
    }
    function sudden(contenders, round) {
        g.suddenDeath = { round, contenders, order: 0, results: {} };
        g.currentRound = ROUNDS;
        g.phase = phase('round_announce', { gameType: 'millionpound', round: ROUNDS, maxRounds: ROUNDS, isLast: true, suddenDeath: true, sdRound: round, eyebrow: 'SUDDEN DEATH', title: 'SUDDEN DEATH',
            contenders: contenders.map((i) => ({ id: g.players[i].id, name: displayName(demoMembers(g, i)), score: g.players[i].rung })), zoneSize: 1 });
        emit(); T.later(() => upNext(contenders[0]), ROUND_MS);
    }
    function sdNext() {
        const sd = g.suddenDeath; sd.order++;
        if (sd.order < sd.contenders.length) return upNext(sd.contenders[sd.order]);
        const top = Math.max(...sd.contenders.map((i) => sd.results[i] || 0));
        const survivors = top > 0 ? sd.contenders.filter((i) => (sd.results[i] || 0) === top) : sd.contenders;
        if (survivors.length === 1) return crown(survivors[0], 'sudden_death', { sdRound: sd.round });
        sudden(survivors, sd.round + 1);
    }

    load(); emit();
    T.later(() => throwDart(), 3200);
    const api = {
        force(kind) {
            if (kind === 'winner' || kind === 'sudden') {
                T.cancel();
                g.players.forEach((p, i) => { p.rung = Math.max(0, 9 - i * 2); if (kind === 'sudden' && i < 2) p.rung = 11; p.best = p.rung; p.banked = banked(p.best); p.prize = prizeFor(p.rung); p.score = p.rung; p.correct = Math.max(0, p.rung - 2); p.trebles = p.rung > 4 ? 1 : 0; });
                if (kind === 'winner') { g.players[0].rung = 13; g.players[0].prize = prizeFor(13); g.players[0].score = 13; }
                g.currentRound = ROUNDS; g.questionInTurn = 2; resolve(); return;
            }
            if (kind === 'million') { T.cancel(); const p = g.players[g.activeIdx]; p.rung = 13; p.best = 13; p.banked = 10; g.currentRound = ROUNDS; g.questionInTurn = 2; g.throwsThisTurn = 2; g.dartsThisQuestion = 0; g.lastThrow = null; g.turnDarts = []; load(); g.phase = phase('playing'); emit(); T.later(() => throwDart(pickSpec('treble')), 2200); return; }
            forced = kind;
            if (g.phase.type === 'playing') { T.cancel(); T.later(() => throwDart(), 200); }
        },
        queue(kinds) { script.push(...kinds); },
        set(i, o) { Object.assign(g.players[i], o); emit(); },
        // a key or click takes over: the flow still runs (reveal, UP NEXT…) but no dart is thrown for you
        throwAt(spec) { if (g.phase.type === 'playing') { interactive = true; T.paused = false; T.cancel(); throwDart(spec); } },
        key(L, treble = false) {
            if (g.phase.type !== 'playing') return;
            const m = treble ? 3 : 1;
            api.throwAt(L === 'X' ? { number: 'bull', multiplier: 2, sector: 'Bull' } : L === 'M' ? { miss: true } : { number: ANCHORS[L], multiplier: m, sector: (m === 3 ? 'T' : 's') + ANCHORS[L] });
        },
        pause() { T.pause(); }, resume() { interactive = false; T.resume(() => throwDart()); }, stop() { T.stop(); },
        state: () => JSON.parse(JSON.stringify(g)),
    };
    return api;
}
