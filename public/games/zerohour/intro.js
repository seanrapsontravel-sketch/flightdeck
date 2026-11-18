// Zero Hour's "How to play" (lib3d/kit/intro.js; docs/plans/GAME-INTROS-3D.md). Every number here is the engine's
// (rules.mjs): 5 rounds × 3 darts; two hot numbers a round from 10–20 score ×3; points become 5-point chips that land
// on random numbers 0–36 and stay; one spin of a single-zero wheel; most chips on the winning number wins, and
// everyone else is placed by their chips on it.
import { freshGame } from '../lib3d/kit/intro.js';
import { throwerOf } from '../lib3d/kit/roster.js';
import { ROUNDS, HOT_MULT } from './rules.mjs';

const GOLD = '#e7b85a', HOT = '#ffcf6a', IVORY = '#efe6d2', DIM = '#6b5a48';
const ALL = ['bull', 'outer_bull', 'single_inner', 'treble', 'single_outer', 'double'];
const EX = [19, 14]; // the example round's hot numbers
const REST = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 7, 16, 8, 11, 9, 12, 5];
const Z = {
    hot: { beds: ALL.slice(2), numbers: EX, color: HOT },
    rest: { beds: ALL, numbers: REST, color: IVORY },
    miss: { beds: ['miss'], color: DIM },
};

export const INTRO = {
    title: 'Zero Hour', tagline: 'Salle Zéro — throw for chips, then one spin decides it', accent: GOLD,
    pages: [
        {
            eyebrow: 'HOW IT WORKS', title: 'Five rounds. Three darts each.',
            lines: [
                'Normal darts scoring — every point you score becomes roulette chips.',
                `Two HOT numbers each round (10–20) score × ${HOT_MULT}. They glow gold on the board.`,
                'After your visit your chips slide onto random numbers 0–36, and stay there all night.',
            ],
            board: { zones: [Z.hot] },
        },
        {
            eyebrow: 'HOW TO SCORE', title: `Hit the hot numbers for × ${HOT_MULT}`,
            legend: [
                { zone: Z.hot, label: 'Hot number', note: 'a treble 19 on a hot 19 scores 171', value: `× ${HOT_MULT}` },
                { zone: Z.rest, label: 'Any other number', note: 'normal darts: single, double, treble; bull 25 / 50', value: '× 1' },
                { zone: Z.miss, label: 'A miss', note: 'no chips', value: '0' },
            ],
        },
        {
            eyebrow: 'HOW TO WIN', title: `After round ${ROUNDS}, one spin`,
            lines: [
                'The wheel spins once. Most chips on the winning number WINS.',
                'Everyone else is placed by their chips on that number — anyone can climb.',
                'The board shows who leads every number, and everyone’s chance, all game.',
            ],
            board: { zones: [Z.hot, Z.rest], dim: true },
        },
    ],
    fresh: (gd) => freshGame(gd),
    first: (gd) => throwerOf(gd, gd.activeIdx || 0)?.name || '',
};
