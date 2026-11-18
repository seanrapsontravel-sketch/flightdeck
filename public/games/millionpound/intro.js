// Million Pound Oche's "How to play" (lib3d/kit/intro.js; docs/plans/GAME-INTROS-3D.md). Every number here is from
// src/engines/millionpound.js (rules V2): QUADRANTS (A 12 5 20 1 18 · B 4 13 6 10 15 · C 2 17 3 19 7 · D 16 8 11 14 9),
// ZONE_SIZES 5 5 3 3 2, a right single/double +1, a right treble +2, a wrong treble −1 (CHECKPOINTS £1,000 and
// £32,000), the first inner bull a free pass, the outer bull and a miss no answer; QUESTIONS_PER_TURN = 3, ROUNDS = 5;
// the highest rung wins, then first to the million, then sudden death on one-number zones.
import { freshGame } from '../lib3d/kit/intro.js';
import { throwerOf } from '../lib3d/kit/roster.js';

const ALL_BEDS = ['single_inner', 'treble', 'single_outer', 'double'];
const ICE = '#8fb6ff', GOLD = '#ffc94d', AMBER = '#ff9a1a', DIM = '#3a4260';
const Q = {
    A: { beds: ALL_BEDS, numbers: [12, 5, 20, 1, 18], color: '#6f9bff' },
    B: { beds: ALL_BEDS, numbers: [4, 13, 6, 10, 15], color: '#9a7bff' },
    C: { beds: ALL_BEDS, numbers: [2, 17, 3, 19, 7], color: '#5fd0ff' },
    D: { beds: ALL_BEDS, numbers: [16, 8, 11, 14, 9], color: '#c58bff' },
};
const BULL = { beds: ['bull', 'outer_bull'], color: GOLD };
const MISS = { beds: ['miss'], color: DIM };

export const INTRO = {
    title: 'Million Pound Oche', tagline: 'knowledge · accuracy · nerve', accent: GOLD,
    pages: [
        {
            eyebrow: 'HOW IT WORKS', title: 'Answer with a dart',
            lines: [
                'The board’s four quarters are the answers: A at the top, then B, C and D clockwise.',
                'A visit is three questions, one dart each. Five visits: fifteen questions to the million.',
                'The targets shrink each visit: 5, 5, 3, 3, then 2 numbers an answer.',
            ],
            board: { zones: [Q.A, Q.B, Q.C, Q.D] },
        },
        {
            eyebrow: 'HOW TO SCORE', title: 'The treble is the gamble',
            legend: [
                { zone: { ...Q.A, beds: ['single_inner', 'single_outer', 'double'] }, label: 'Right answer', note: 'single or double in the right zone', value: '+1' },
                { zone: { ...Q.A, beds: ['treble'], color: GOLD }, label: 'Right TREBLE', note: 'up two rungs at once', value: '+2' },
                { zone: { ...Q.B, beds: ['treble'], color: '#ff3b4a' }, label: 'Wrong treble', note: 'in another answer’s zone — never below £1,000 or £32,000 once reached', value: '−1' },
                { zone: { beds: ['bull'], color: GOLD }, label: 'Inner bull', note: 'your FIRST one is a free pass; after that, no answer', value: '+1' },
                { zone: { beds: ['outer_bull', 'miss'], color: DIM }, label: 'Outer bull, miss', note: 'or a number not in play: no answer', value: '0' },
            ],
        },
        {
            eyebrow: 'HOW TO WIN', title: 'Climb to the million',
            lines: [
                'Highest rung after fifteen questions wins. Nobody is knocked out.',
                'Two millionaires? The first to get there wins.',
                'Still level? SUDDEN DEATH: one question, one dart, one number an answer.',
            ],
            board: { zones: [{ ...Q.A, numbers: [20], color: GOLD }, { ...Q.B, numbers: [6] }, { ...Q.C, numbers: [3] }, { ...Q.D, numbers: [11] }] },
        },
    ],
    fresh: (gd) => freshGame(gd, (p) => p.rung || 0),
    first: (gd) => throwerOf(gd, gd.activeIdx || 0)?.name || '',
};
export { ICE };
