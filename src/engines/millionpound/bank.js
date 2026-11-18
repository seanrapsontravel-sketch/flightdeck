/**
 * Million Pound Oche — the question bank.
 *
 * One JSON file per level in ./questions. Each question is
 *   { id, level, category, q, correct, wrong: [3], source }
 * Authors never choose an answer position: the game shuffles them (see
 * drawPlan), so the files hold "the right answer" and "three wrong ones".
 *
 * Pure apart from reading the files once at load. Selection takes a seeded
 * RNG so a game's whole question plan is reproducible from gameData.seed.
 */

const fs = require('node:fs');
const path = require('node:path');

const LEVELS = 6;
const LETTERS = ['A', 'B', 'C', 'D'];
const LIMITS = { question: 110, answer: 28 };

function rng(seed) {
    let a = (Number(seed) >>> 0) || 1;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function shuffle(list, rand) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

/** Problems with one question, as strings (empty = fine). */
function lintQuestion(q, level) {
    const errs = [];
    if (!q || typeof q !== 'object') return ['not an object'];
    if (typeof q.id !== 'string' || !/^[a-z]+-\d{4}$/.test(q.id)) errs.push('id must look like "geo-0001"');
    if (q.level !== level) errs.push(`level ${q.level} in the level-${level} file`);
    if (typeof q.category !== 'string' || !q.category) errs.push('no category');
    if (typeof q.q !== 'string' || !q.q.trim()) errs.push('no question');
    else if (q.q.length > LIMITS.question) errs.push(`question is ${q.q.length} chars (max ${LIMITS.question})`);
    if (typeof q.correct !== 'string' || !q.correct.trim()) errs.push('no correct answer');
    if (!Array.isArray(q.wrong) || q.wrong.length !== 3) errs.push('needs exactly 3 wrong answers');
    const answers = [q.correct, ...(Array.isArray(q.wrong) ? q.wrong : [])];
    answers.forEach((a) => {
        if (typeof a !== 'string' || !a.trim()) errs.push('an empty answer');
        else if (a.length > LIMITS.answer) errs.push(`answer "${a}" is ${a.length} chars (max ${LIMITS.answer})`);
        else if (/\b(all|none) of (the|these)\b/i.test(a)) errs.push(`"${a}": no all/none-of-the-above`);
    });
    const norm = answers.map((a) => String(a).trim().toLowerCase());
    if (new Set(norm).size !== norm.length) errs.push('duplicate answers');
    if (typeof q.source !== 'string' || !q.source.trim()) errs.push('no source');
    return errs;
}

function loadBank(dir = path.join(__dirname, 'questions')) {
    const levels = [];
    for (let level = 1; level <= LEVELS; level++) {
        const file = path.join(dir, `level-${level}.json`);
        const list = JSON.parse(fs.readFileSync(file, 'utf8'));
        levels.push(list.filter((q) => lintQuestion(q, level).length === 0));
    }
    const byId = new Map();
    levels.flat().forEach((q) => byId.set(q.id, q));
    return { levels, byId };
}

let BANK = null;
function bank() {
    if (!BANK) BANK = loadBank();
    return BANK;
}

/**
 * Pick `count` questions from one level: never one in `used` (this game),
 * avoid `recent` (this session, oldest first), and when the level runs dry
 * bring back the longest-ago ones first.
 */
function pickLevel(pool, count, used, recent, rand) {
    const recentIdx = new Map(recent.map((id, i) => [id, i]));
    const fresh = shuffle(pool.filter((q) => !used.has(q.id) && !recentIdx.has(q.id)), rand);
    const picked = fresh.slice(0, count);
    if (picked.length < count) {
        const stale = pool
            .filter((q) => !used.has(q.id) && recentIdx.has(q.id))
            .sort((a, b) => recentIdx.get(a.id) - recentIdx.get(b.id));
        picked.push(...stale.slice(0, count - picked.length));
    }
    return picked;
}

/**
 * The whole game's questions, drawn once at the start:
 *   plan[questionNo - 1][playerIdx] = { id, answers: [4 option indexes for A–D], key }
 * `levels[k]` is the difficulty of question k + 1 for every player, so all
 * players meet the same difficulty at the same point. Option index 0 is the
 * right answer, so `key` is the letter whose index is 0. Right-answer letters
 * come from a balanced deck (each letter as near equally often as the count
 * allows), so no position is favoured.
 */
function drawPlan({ players, levels, seed, recent = [], source = bank() }) {
    const rand = rng(seed);
    const used = new Set();
    const slots = levels || Array.from({ length: LEVELS }, (_, i) => i + 1);
    const total = players * slots.length;
    const deck = shuffle(Array.from({ length: total }, (_, i) => LETTERS[i % 4]), rand);
    const plan = [];
    slots.forEach((level, k) => {
        const pool = source.levels[Math.min(Math.max(level, 1), source.levels.length) - 1] || [];
        const picked = pickLevel(pool, players, used, recent, rand);
        plan.push(picked.map((q, i) => {
            used.add(q.id);
            const key = deck[k * players + i];
            const wrong = shuffle([1, 2, 3], rand);
            const answers = LETTERS.map((L) => (L === key ? 0 : wrong.shift()));
            return { id: q.id, answers, key };
        }));
    });
    return plan;
}

/** The on-screen question for a plan entry. */
function resolve(entry, source = bank()) {
    const q = entry && source.byId.get(entry.id);
    if (!q) return null;
    const options = [q.correct, ...q.wrong];
    const answers = {};
    LETTERS.forEach((L, i) => { answers[L] = options[entry.answers[i]]; });
    return { id: q.id, level: q.level, category: q.category, text: q.q, answers, correctKey: entry.key };
}

module.exports = { LEVELS, LETTERS, LIMITS, rng, shuffle, lintQuestion, loadBank, bank, drawPlan, resolve, pickLevel };
