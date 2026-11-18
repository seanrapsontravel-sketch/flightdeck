// Million Pound Oche — the question bank lint (docs/plans/MILLION-POUND-OCHE.md §5).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const qbank = require('../src/engines/millionpound/bank');

const dir = path.join(__dirname, '..', 'src', 'engines', 'millionpound', 'questions');
const raw = [1, 2, 3, 4, 5, 6].map((l) => require(path.join(dir, `level-${l}.json`)));

test('every question passes the lint (lengths, four distinct answers, a source)', () => {
    const problems = [];
    raw.forEach((list, i) => list.forEach((q) => {
        const errs = qbank.lintQuestion(q, i + 1);
        if (errs.length) problems.push(`${q.id}: ${errs.join('; ')}`);
    }));
    assert.deepEqual(problems, []);
});

test('at least 40 a level and 240 in all; ids unique; no repeated question text', () => {
    raw.forEach((list, i) => assert.ok(list.length >= 40, `level ${i + 1} has ${list.length}`));
    const all = raw.flat();
    assert.ok(all.length >= 240);
    assert.equal(new Set(all.map((q) => q.id)).size, all.length);
    assert.equal(new Set(all.map((q) => q.q.toLowerCase())).size, all.length);
});

test('a broad spread: no category over 25% of a level; darts present but rare', () => {
    raw.forEach((list, i) => {
        const counts = {};
        list.forEach((q) => { counts[q.category] = (counts[q.category] || 0) + 1; });
        for (const [cat, n] of Object.entries(counts)) assert.ok(n / list.length <= 0.25, `level ${i + 1}: ${cat} ${n}/${list.length}`);
        assert.ok((counts.darts || 0) / list.length <= 0.1, `level ${i + 1}: too much darts trivia`);
        assert.ok(Object.keys(counts).length >= 7, `level ${i + 1}: only ${Object.keys(counts).length} categories`);
    });
    assert.ok(raw.flat().some((q) => q.category === 'darts'));
});

test('the loader keeps every question (nothing silently dropped)', () => {
    const b = qbank.loadBank(dir);
    raw.forEach((list, i) => assert.equal(b.levels[i].length, list.length));
});

test('resolve() shows each option exactly once, with the right one under the key', () => {
    const b = qbank.loadBank(dir);
    const plan = qbank.drawPlan({ players: 6, seed: 7, source: b });
    for (const entry of plan.flat()) {
        const q = qbank.resolve(entry, b);
        const src = b.byId.get(entry.id);
        assert.equal(q.answers[q.correctKey], src.correct);
        assert.deepEqual(Object.values(q.answers).sort(), [src.correct, ...src.wrong].sort());
    }
});

test('when a level runs dry, the longest-ago questions come back first', () => {
    const pool = Array.from({ length: 5 }, (_, i) => ({ id: `t-${i}` }));
    const picked = qbank.pickLevel(pool, 3, new Set(), ['t-3', 't-0', 't-1', 't-2', 't-4'], qbank.rng(1));
    assert.deepEqual(picked.map((q) => q.id), ['t-3', 't-0', 't-1']);
});
