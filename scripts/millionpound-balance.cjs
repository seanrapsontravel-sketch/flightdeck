#!/usr/bin/env node
// Million Pound Oche balance check (docs/plans/MILLION-POUND-OCHE.md §4, rules V2). Whole games through the REAL
// engine (src/engines/millionpound.js via the public engine interface); every dart is a bot dart from the venue's
// own throw profiles (core.js) and the engine's own "does this bot know the answer" odds (BOT_KNOWS).
//
// The playtest question from the V2 brief: "If nearly everyone gets stuck at £8,000 it's too difficult; if everyone
// reaches £1 million it's too easy." So, per profile: where players finish on the ladder (stuck ≤ £8k, the middle,
// ≥ £64k, the million), right / treble / wrong / wrong-treble / no-answer rates, checkpoint saves; per line-up: win %
// and how games end (outright, first to the million, sudden death), and lead changes.
//   node scripts/millionpound-balance.cjs [games=1000]
// Bots are not people: real players know more and throw worse than "dummy" on some questions. Read the shape.
const path = require('node:path');
const engines = require(path.resolve(__dirname, '../src/engines'));
const mp = require(path.resolve(__dirname, '../src/engines/millionpound'));

const N = Math.max(50, Number(process.argv[2]) || 1000);
const LINEUPS = {
    'six, mixed (adv · int · int · cas · cas · dummy)': ['advanced', 'intermediate', 'intermediate', 'casual', 'casual', 'dummy'],
    'four (adv · int · cas · dummy)': ['advanced', 'intermediate', 'casual', 'dummy'],
    'four casual (a pub crowd)': ['casual', 'casual', 'casual', 'casual'],
    'two (int · int)': ['intermediate', 'intermediate'],
};

function playOne(profiles) {
    const people = profiles.map((p, i) => ({ id: 'p' + i, name: 'P' + i, avatar: null }));
    let g = engines.initGameData('millionpound', people);
    let leader = null, leadChanges = 0, saves = 0, guard = 0;
    while (!['winner', 'draw'].includes(g.phase.type) && guard++ < 4000) {
        if (g.phase.type !== 'playing') throw new Error('stuck in ' + g.phase.type);
        const profile = profiles[g.activeIdx] || 'intermediate';
        let r = engines.handleGameAction(g, 'millionpound', { type: 'TRIGGER_THROW' }, { throwSource: 'bot', debugThrowProfile: profile });
        // follow the engine's own schedule (locked → reveal → next …) back to the next live question, watching reveals
        for (let i = 0; i < 20; i++) {
            const ph = r.gameData.phase;
            if (ph.type === 'reveal' && !ph.data.suddenDeath) {
                if (ph.data.saved) saves++;
                const ps = r.gameData.players, top = Math.max(...ps.map((p) => p.rung || 0));
                const lead = ps.filter((p) => (p.rung || 0) === top);
                if (top > 0 && lead.length === 1) { if (leader && lead[0].id !== leader) leadChanges++; leader = lead[0].id; }
            }
            if (!r.schedule) break;
            r = engines.applyScheduledAction(r.gameData, r.schedule);
        }
        g = r.gameData;
    }
    return { g, leadChanges, saves };
}

const pct = (x, n) => (n ? ((100 * x) / n).toFixed(0) : '0').padStart(3) + '%';
const money = (v) => (v >= 1e6 ? '£1M' : v >= 1000 ? `£${Math.round(v / 1000)}k` : `£${v}`);
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

console.log(`Million Pound Oche balance — ${N} games a line-up, real engine (rules V2), venue bot profiles\n`);
const byProfile = {};
for (const [label, profiles] of Object.entries(LINEUPS)) {
    const P = profiles.length, win = new Array(P).fill(0);
    const ends = { outright: 0, million_first: 0, sudden_death: 0, draw: 0 };
    let lc = 0, sdRounds = 0;
    for (let i = 0; i < N; i++) {
        const { g, leadChanges, saves } = playOne(profiles);
        lc += leadChanges;
        const d = g.phase.data || {};
        if (g.phase.type === 'draw') ends.draw++;
        else if (d.reason === 'million_first') ends.million_first++;
        else if (d.reason === 'sudden_death') { ends.sudden_death++; sdRounds += (g.suddenDeath && g.suddenDeath.round) || 1; }
        else ends.outright++;
        g.players.forEach((p, j) => {
            if (g.phase.type === 'winner' && d.winnerId === p.id) win[j]++;
            const b = (byProfile[profiles[j]] ||= { n: 0, rungs: [], right: 0, trebles: 0, wrong: 0, wrongTrebles: 0, noAnswer: 0, passes: 0, saves: 0, qs: 0 });
            b.n++; b.rungs.push(p.rung || 0); b.right += p.correct || 0; b.trebles += p.trebles || 0; b.wrong += p.wrong || 0;
            b.wrongTrebles += p.wrongTrebles || 0; b.noAnswer += p.noAnswer || 0; b.passes += p.passes || 0;
            b.qs += (p.answers || []).filter((a) => !a.suddenDeath).length;
        });
        (byProfile.__saves ||= { v: 0 }).v += saves;
    }
    console.log(label);
    console.log('  win %      ' + profiles.map((p, j) => `${p.slice(0, 5).padEnd(5)} ${pct(win[j], N)}`).join('   '));
    console.log(`  endings    outright ${pct(ends.outright, N)} · first to £1M ${pct(ends.million_first, N)} · sudden death ${pct(ends.sudden_death, N)}` +
        (ends.sudden_death ? ` (avg ${(sdRounds / ends.sudden_death).toFixed(1)} rounds)` : '') + (ends.draw ? ` · unbroken ${pct(ends.draw, N)}` : ''));
    console.log(`  lead changes per game ${(lc / N).toFixed(1)}\n`);
}

console.log('Per profile, all line-ups (final ladder position after 15 questions)');
console.log('  profile        median   ≤£8k   £16–32k  £64–500k  £1M   | right  treble  wrong  wrong-T  no-ans  pass');
for (const [prof, b] of Object.entries(byProfile)) {
    if (prof.startsWith('__')) continue;
    const at = (lo, hi) => b.rungs.filter((r) => r >= lo && r <= hi).length;
    const prize = mp.LADDER ? (r) => (r > 0 ? mp.LADDER[r - 1] : 0) : (r) => r;
    console.log('  ' + prof.padEnd(13) + money(prize(median(b.rungs))).padStart(7) +
        pct(at(0, 8), b.n).padStart(7) + pct(at(9, 10), b.n).padStart(9) + pct(at(11, 14), b.n).padStart(10) + pct(at(15, 15), b.n).padStart(6) +
        '   |' + pct(b.right, b.qs).padStart(6) + pct(b.trebles, b.qs).padStart(8) + pct(b.wrong, b.qs).padStart(7) +
        pct(b.wrongTrebles, b.qs).padStart(9) + pct(b.noAnswer, b.qs).padStart(8) + pct(b.passes, b.qs).padStart(6));
}
console.log(`\nCheckpoint saves (a wrong treble that a banked £1k/£32k stopped): ${byProfile.__saves.v} in ${N * Object.keys(LINEUPS).length} games`);
console.log('Rates are per question asked (15 a player). "treble" and "wrong-T" are subsets of right / wrong.');
