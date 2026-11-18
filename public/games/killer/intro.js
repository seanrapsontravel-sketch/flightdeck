// Killer's "How to play". From src/engines/killer.js: KILLER_MARKS_TO_QUALIFY = 3, KILLER_STARTING_LIVES = 3,
// KILLER_MAX_ROUNDS = 12, killerRoundMultiplier (1–6 ×1, 7–9 ×2, 10–12 ×3), hits need a numbered bed (bull/miss do
// nothing), strikes: killer victim loses lives (below 3 = no longer a killer), civilian victim loses marks (overkill
// or 0 marks = out), killerResolveMatch: last standing; after round 12 a sole killer wins, several share a draw,
// no killers → most wedges (ties draw).
import { freshGame } from '../lib3d/kit/intro.js';
import { throwerOf } from '../lib3d/kit/roster.js';

const RED = '#ff1f3a', GOLD = '#ffc76a', GREY = '#9aa3b5', VIOLET = '#b47aff';
const NUM = ['single_inner', 'treble', 'single_outer', 'double'];
export const INTRO = {
    title: 'Killer', tagline: 'arm up — then hunt', accent: GOLD,
    pages: [
        {
            eyebrow: 'HOW IT WORKS', title: 'Earn your licence, then take everyone out',
            lines: [
                'Everyone gets their own number — your wedge on the board.',
                '3 darts a visit, 12 rounds.',
                'Fill your number 3 times to become a KILLER.',
                'Killers hunt: hit other players’ numbers to knock them out.',
            ],
            board: { zones: [{ beds: NUM, numbers: [20], color: GOLD }, { beds: NUM, numbers: [3, 11, 6], color: RED }] },
        },
        {
            eyebrow: 'HOW TO SCORE', title: 'Marks, lives and strikes',
            legend: [
                { zone: { beds: NUM, numbers: [20], color: GOLD }, label: 'Your number', note: 'single +1 mark, double +2, treble +3', value: '3 = KILLER' },
                { zone: { beds: NUM, numbers: [3, 11, 6], color: RED }, label: 'Their numbers', note: 'as a Killer: strip their marks or lives', value: 'STRIKE' },
                { zone: { beds: ['bull', 'outer_bull', 'miss'], color: GREY }, label: 'Bull or a miss', note: 'does nothing', value: '—' },
                { zone: { beds: NUM, color: VIOLET }, label: 'Late rounds', note: 'rounds 7–9 count ×2, rounds 10–12 ×3', value: '×2 ×3' },
            ],
        },
        {
            eyebrow: 'HOW TO WIN', title: 'Last one standing',
            lines: [
                'A Killer has 3 lives. Drop below 3 and you’re a civilian again.',
                'Strike a civilian with no marks left — or overkill them — and they’re OUT.',
                'Last player standing wins.',
                'After round 12: a sole Killer wins; several Killers share it; no Killers — most marks wins.',
            ],
            board: { zones: [{ beds: NUM, numbers: [20], color: GOLD }], dim: true },
        },
    ],
    fresh: (gd) => freshGame(gd, (p) => (p.killerMarks || 0) + (p.isKiller ? 1 : 0) + ((p.lives ?? 3) < 0 ? 1 : 0)),
    first: (gd) => throwerOf(gd, gd.activeIdx || 0)?.name || '',
};
