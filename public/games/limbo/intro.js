// Limbo's "How to play". From src/engines/limbo.js: bar starts at 60 (currentTargetBar), 3 lives each, a dart adds
// throwScoreFromTarget (bull 25/50) and a MISS adds 25; over the bar — or no room for the remaining darts at 1 each —
// loses a life and the bar resets to 60; finish under and the bar drops to your total; match it and it holds;
// last player with lives wins (no draw).
import { freshGame } from '../lib3d/kit/intro.js';
import { throwerOf } from '../lib3d/kit/roster.js';

const CORAL = '#ff8a5c', SAND = '#ffd9a0', GOLD = '#ffc94a', RED = '#ff4a3a', SEA = '#3aa8ff';
export const INTRO = {
    title: 'Limbo', tagline: 'how low can you go?', accent: CORAL,
    pages: [
        {
            eyebrow: 'HOW IT WORKS', title: 'Stay under the burning bar',
            lines: [
                'The bar starts at 60.',
                '3 darts a visit: your total has to finish AT or UNDER the bar.',
                'Finish under and the bar drops to your total — lower for the next player.',
                'Everyone has 3 torches.',
            ],
            board: { zones: [{ beds: ['single_inner', 'single_outer'], color: SAND }, { beds: ['double', 'treble'], color: CORAL }], dim: true },
        },
        {
            eyebrow: 'HOW TO SCORE', title: 'What your darts add up to',
            legend: [
                { zone: { beds: ['single_inner', 'single_outer'], color: SAND }, label: 'Singles', note: 'the number', value: '1–20' },
                { zone: { beds: ['double'], color: CORAL }, label: 'Doubles', note: 'twice the number', value: '2–40' },
                { zone: { beds: ['treble'], color: RED }, label: 'Trebles', note: 'three times the number', value: '3–60' },
                { zone: { beds: ['outer_bull', 'bull'], color: GOLD }, label: 'Outer bull · bull', note: '', value: '25 · 50' },
                { zone: { beds: ['miss'], color: SEA }, label: 'A miss', note: 'misses hurt: they count 25', value: '25' },
            ],
        },
        {
            eyebrow: 'HOW TO WIN', title: 'Last torch burning',
            lines: [
                'Go over the bar — or leave no room for your other darts (1 each) — and you lose a torch.',
                'When you burn, the bar goes back up to 60.',
                'Hit the bar exactly and it holds.',
                'Lose all 3 torches and you’re out. Last player with a torch wins.',
            ],
            board: { zones: [{ beds: ['single_inner', 'single_outer', 'double', 'treble'], color: CORAL }], dim: true },
        },
    ],
    fresh: (gd) => freshGame(gd, (p) => ((p.lives ?? 3) !== 3 ? 1 : 0)) && (gd.currentTargetBar ?? 60) === 60 && !gd.currentRunningTotal,
    first: (gd) => throwerOf(gd, gd.activeIdx || 0)?.name || '',
};
