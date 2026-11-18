// Shanghai's "How to play" (lib3d/kit/intro.js; docs/plans/GAME-INTROS-3D.md). Every number here is from
// src/engines/shanghai.js: SHANGHAI_MAX_ROUNDS = 8, the target is the round number, only it scores (single ×1, double
// ×2, treble ×3, everything else 0), a Shanghai (single + double + treble of the target in one visit) wins outright,
// otherwise the highest total after round 8 wins and a tie for the top is a draw.
import { freshGame } from '../lib3d/kit/intro.js';
import { throwerOf } from '../lib3d/kit/roster.js';

const GOLD = '#e8b54c', GOLD2 = '#ffd36a', RED = '#e0453a', DIM = '#6b5a48';
const ALL = ['bull', 'outer_bull', 'single_inner', 'treble', 'single_outer', 'double', 'miss'];
const N = [5]; // the example: round 5, aim for 5
const Z = {
    single: { beds: ['single_inner', 'single_outer'], numbers: N, color: GOLD },
    double: { beds: ['double'], numbers: N, color: GOLD2 },
    treble: { beds: ['treble'], numbers: N, color: RED },
    rest: { beds: ALL, numbers: [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12], color: DIM },
};

export const INTRO = {
    title: 'Shanghai', tagline: 'the lantern pagoda — eight rounds, one number each', accent: GOLD,
    pages: [
        {
            eyebrow: 'HOW IT WORKS', title: 'Round 1, aim for 1. Round 8, aim for 8.',
            lines: [
                'Take turns: 3 darts a visit, 8 rounds.',
                'Each round only ONE number scores — the round’s number. It glows gold on the gate.',
                'Each round lights another tier of the pagoda.',
            ],
            board: { zones: [Z.single, Z.double, Z.treble] },
        },
        {
            eyebrow: 'HOW TO SCORE', title: 'Score the number × 1, × 2 or × 3',
            legend: [
                { zone: Z.single, label: 'Single', note: 'the number × 1 — round 5: a single 5 scores 5', value: '×1' },
                { zone: Z.double, label: 'Double', note: 'the number × 2 — round 5: a double 5 scores 10', value: '×2' },
                { zone: Z.treble, label: 'Treble', note: 'the number × 3 — round 5: a treble 5 scores 15', value: '×3' },
                { zone: Z.rest, label: 'Anything else', note: 'any other number, bulls and misses', value: '0' },
            ],
        },
        {
            eyebrow: 'HOW TO WIN', title: 'Shanghai! — or the top score',
            lines: [
                'A single, a double AND a treble of the number in one visit is a SHANGHAI: you win on the spot.',
                'Otherwise the highest total after round 8 is the CHAMPION.',
                'Level on top? It’s TIED — a draw.',
            ],
            board: { zones: [Z.single, Z.double, Z.treble] },
        },
    ],
    fresh: (gd) => freshGame(gd),
    first: (gd) => throwerOf(gd, gd.activeIdx || 0)?.name || '',
};
