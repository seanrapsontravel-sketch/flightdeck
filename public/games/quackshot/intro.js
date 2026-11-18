// Quackshot's "How to play" (lib3d/kit/intro.js; docs/plans/GAME-INTROS-3D.md). Every number here is from
// src/engines/quackshot.js: resolveQuackshotHit (zones → points), QUACKSHOT_MAX_ROUNDS = 6, quackshotRoundMultiplier
// (round 6 ×2, minus scores too), quackshotResolveMatch (highest score wins; a tie for the top is a draw).
import { freshGame } from '../lib3d/kit/intro.js';
import { throwerOf } from '../lib3d/kit/roster.js';

const GOLD = '#ffc94a', GOLD2 = '#ffe08a', GREEN = '#3ddc84', FIRE = '#ff5a3a', SEA = '#3aa8ff';
const ALL = ['bull', 'outer_bull', 'single_inner', 'treble', 'single_outer', 'double', 'miss'];
const Z = {
    dbull: { beds: ['bull'], color: GOLD },
    bull: { beds: ['outer_bull'], color: GOLD2 },
    inner: { beds: ['single_inner'], color: GREEN },
    fire: { beds: ['treble'], color: FIRE },
    splash: { beds: ['single_outer', 'double', 'miss'], color: SEA },
};

export const INTRO = {
    title: 'Quackshot', tagline: 'the fairground duck shoot — on a dartboard', accent: GOLD,
    pages: [
        {
            eyebrow: 'HOW IT WORKS', title: 'Hit the ducks. Dodge the fire and the water.',
            lines: [
                'Take turns at the counter: 3 darts a visit, 6 rounds.',
                'It’s WHERE your dart lands that scores — the number doesn’t matter.',
                'The middle of the board is good. The rings are bad.',
            ],
            board: { zones: [Z.dbull, Z.bull, Z.inner, Z.fire, Z.splash] },
        },
        {
            eyebrow: 'HOW TO SCORE', title: 'Every dart scores',
            legend: [
                { zone: Z.dbull, label: 'Bullseye', note: 'both prize ducks fall — a duck for your shelf', value: '+3' },
                { zone: Z.bull, label: 'Outer bull', note: 'knocks a prize duck — a duck for your shelf', value: '+2' },
                { zone: Z.inner, label: 'Inner singles', note: 'between the bull and the treble: the duck parade', value: '+1' },
                { zone: Z.fire, label: 'Trebles', note: 'the Ring of Fire', value: '−2' },
                { zone: Z.splash, label: 'Everything else', note: 'outer singles, doubles and misses: Splash!', value: '−1' },
            ],
        },
        {
            eyebrow: 'HOW TO WIN', title: 'Top score after round 6',
            lines: [
                'Round 6 is the FINAL: every dart counts DOUBLE — minuses too.',
                'Scores can go below zero.',
                'Highest score after round 6 wins the GRAND PRIZE.',
                'Level on top? It’s a DEAD HEAT — a draw.',
            ],
            board: { zones: [{ beds: ALL, color: GOLD }], dim: true },
        },
    ],
    fresh: (gd) => freshGame(gd),
    first: (gd) => throwerOf(gd, gd.activeIdx || 0)?.name || '',
};
