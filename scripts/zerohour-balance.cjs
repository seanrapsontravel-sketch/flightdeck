#!/usr/bin/env node
// Zero Hour balance check (docs/plans/ZERO-HOUR.md §4): whole games through the REAL engine (src/engines/zerohour.js
// via the public engine interface), every dart a bot dart from the venue's own throw profiles (core.js), each bot
// aiming at the highest hot number. Reports, per line-up (strongest first): win %, top-3 %, how often the strongest
// finishes last, steals per visit, favourite changes per game, players still leading a number at the spin, re-spins,
// shootouts and mean points.
//   node scripts/zerohour-balance.cjs [games=2000]
// The profiles are the venue's bots, not measured human accuracy: read the shape, not the decimals.
const path = require('node:path');
const engines = require(path.resolve(__dirname, '../src/engines'));

const N = Math.max(100, Number(process.argv[2]) || 2000);
const LINEUPS = {
    'six, close (adv · int · int · cas · cas · cas)': ['advanced', 'intermediate', 'intermediate', 'casual', 'casual', 'casual'],
    'six, wide (adv · int · int · cas · cas · dummy)': ['advanced', 'intermediate', 'intermediate', 'casual', 'casual', 'dummy'],
    'four (adv · int · cas · dummy)': ['advanced', 'intermediate', 'casual', 'dummy'],
    'four, all intermediate': ['intermediate', 'intermediate', 'intermediate', 'intermediate'],
    'two (adv · cas)': ['advanced', 'casual'],
};

function settle(r) { for (let i = 0; r.schedule && i < 50; i++) r = engines.applyScheduledAction(r.gameData, r.schedule); return r.gameData; }

function playOne(profiles) {
    const people = profiles.map((p, i) => ({ id: 'p' + i, name: 'P' + i, avatar: null }));
    let g = engines.initGameData('zerohour', people);
    const m = { steals: 0, visits: 0, favChanges: 0, alive: 0, respins: 0, shootout: false };
    let lastFav = null, guard = 0;
    while (g.phase.type !== 'winner' && guard++ < 2000) {
        const profile = profiles[g.activeIdx] || 'intermediate';
        const before = g.zh.lastVisit;
        if (g.phase.type === 'spin' && !m.spun) {
            m.spun = true;
            m.respins = g.zh.spin.draws.length - 1;
            m.alive = g.zh.standings.filter((s) => s.numbersLed > 0).length;
        }
        g = settle(engines.handleGameAction(g, 'zerohour', { type: 'TRIGGER_THROW' }, { throwSource: 'bot', debugThrowProfile: profile }));
        if (g.zh.lastVisit && g.zh.lastVisit !== before && (!before || g.zh.lastVisit.playerId !== before.playerId || g.zh.lastVisit.round !== before.round)) {
            m.visits++; m.steals += g.zh.lastVisit.steals.length;
            if (lastFav && g.zh.favourite !== lastFav) m.favChanges++;
            lastFav = g.zh.favourite;
        }
        if (g.zh.shootout) m.shootout = true;
    }
    if (!m.spun && g.zh.spin) { m.respins = g.zh.spin.draws.length - 1; m.alive = g.zh.standings.filter((s) => s.numbersLed > 0).length; }
    const place = Object.fromEntries(g.zh.placings.map((r) => [r.id, r.place]));
    return { place: people.map((p) => place[p.id]), points: g.players.map((p) => p.score), m };
}

const pct = (x, n) => ((100 * x) / n).toFixed(0).padStart(3);
console.log(`Zero Hour balance — ${N} games a line-up, real engine, bot profiles (strongest first)\n`);
for (const [label, profiles] of Object.entries(LINEUPS)) {
    const P = profiles.length, win = new Array(P).fill(0), top3 = new Array(P).fill(0), pts = new Array(P).fill(0);
    let bestLast = 0, steals = 0, visits = 0, fav = 0, alive = 0, respinGames = 0, shootouts = 0;
    for (let i = 0; i < N; i++) {
        const r = playOne(profiles);
        r.place.forEach((pl, j) => { if (pl === 1) win[j]++; if (pl <= 3) top3[j]++; pts[j] += r.points[j]; });
        if (r.place[0] === Math.max(...r.place)) bestLast++;
        steals += r.m.steals; visits += r.m.visits; fav += r.m.favChanges; alive += r.m.alive;
        if (r.m.respins > 0) respinGames++;
        if (r.m.shootout) shootouts++;
    }
    console.log(label);
    console.log(`  win %      ${win.map((x) => pct(x, N)).join(' ')}`);
    if (P > 3) console.log(`  top 3 %    ${top3.map((x) => pct(x, N)).join(' ')}`);
    console.log(`  points     ${pts.map((x) => String(Math.round(x / N)).padStart(4)).join(' ')}`);
    console.log(`  strongest last ${pct(bestLast, N)}% · steals/visit ${(steals / visits).toFixed(2)} · favourite changes/game ${(fav / N).toFixed(1)} · leading at the spin ${(alive / N).toFixed(1)} of ${P} · games with a re-spin ${pct(respinGames, N)}% · shootouts ${pct(shootouts, N)}%\n`);
}
