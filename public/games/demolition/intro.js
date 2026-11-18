// Demolition's "How to play". From src/engines/demolition.js: every tower (lane) starts at DEMOLITION_START = 180;
// each dart subtracts throwScoreFromTarget (number × multiplier; bull 25/50; miss 0); 3 darts a visit; below zero is a
// BUST (back to the visit's starting score); exactly zero checks out and the round finishes; demolitionResolveRound:
// one checkout wins, two or more play off from DEMOLITION_PLAYOFF_START = 60.
import { freshGame } from '../lib3d/kit/intro.js';

const HAZARD = '#f5b72c', ORANGE = '#ff7a2a', RED = '#ff4a3a', GOLD = '#ffd27a', GREY = '#9aa3b5';
const teamName = (gd, i) => { const t = (gd.teams || [])[i]; return !t || !t.length ? '' : t.length > 1 ? t.map((p) => p.name).join(' & ') : t[0].name; };
export const INTRO = {
    title: 'Demolition', tagline: 'bring your tower down to zero', accent: HAZARD,
    pages: [
        {
            eyebrow: 'HOW IT WORKS', title: 'Every tower starts at 180',
            lines: [
                '3 darts a visit: each dart knocks its score off your tower.',
                'You have to finish on exactly ZERO.',
                'Big hits bring it down fast — but watch the finish.',
            ],
            board: { zones: [{ beds: ['treble'], color: RED }, { beds: ['double'], color: ORANGE }, { beds: ['bull', 'outer_bull'], color: GOLD }], dim: true },
        },
        {
            eyebrow: 'HOW TO SCORE', title: 'What each dart knocks off',
            legend: [
                { zone: { beds: ['single_inner', 'single_outer'], color: HAZARD }, label: 'Singles', note: 'the number', value: '1–20' },
                { zone: { beds: ['double'], color: ORANGE }, label: 'Doubles', note: 'twice the number', value: '2–40' },
                { zone: { beds: ['treble'], color: RED }, label: 'Trebles', note: 'three times the number', value: '3–60' },
                { zone: { beds: ['outer_bull', 'bull'], color: GOLD }, label: 'Outer bull · bull', note: '', value: '25 · 50' },
                { zone: { beds: ['miss'], color: GREY }, label: 'A miss', note: 'nothing', value: '0' },
            ],
        },
        {
            eyebrow: 'HOW TO WIN', title: 'Exactly zero wins',
            lines: [
                'Go below zero and it’s a BUST: your tower goes back to where your visit started.',
                'Hit exactly zero to check out — the rest of the round still gets to throw.',
                'One checkout wins. Two or more go to a PLAYOFF from 60.',
            ],
            board: { zones: [{ beds: ['double', 'bull'], color: HAZARD }], dim: true },
        },
    ],
    fresh: (gd) => !!gd && !gd.isPlayoff && (gd.activeTurnIndex || 0) === 0 && !gd.dartsThrownThisTurn && !gd.lastThrow
        && (gd.phase?.type || 'playing') === 'playing' && (gd.teamScores || []).every((s) => s === 180),
    first: (gd) => teamName(gd, gd.activeTurnIndex || 0),
};
