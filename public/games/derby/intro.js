// Derby's "How to play". From src/engines/derby.js: each player gets a number (generateSymmetricTargets); own number
// moves +multiplier (S1 D2 T3) up to DERBY_MAX_TICKS = 9; another player's number knocks them back the same (not below
// 0; finished horses are immune); bull and miss do nothing; DERBY_MAX_ROUNDS = 8; first home opens the finish and the
// rotation completes; derbyResolveMatch: one finisher wins, several finishers draw, else the leader (tied lead draws).
import { freshGame } from '../lib3d/kit/intro.js';
import { throwerOf } from '../lib3d/kit/roster.js';

const GREEN = '#5fd16b', GOLD = '#ffd27a', RED = '#ff5a4a', GREY = '#9aa3b5';
const NUM = ['single_inner', 'treble', 'single_outer', 'double'];
export const INTRO = {
    title: 'Derby', tagline: 'race your horse to the post', accent: GOLD,
    pages: [
        {
            eyebrow: 'HOW IT WORKS', title: 'Your number is your horse',
            lines: [
                'Every player gets a number on the board — that’s your horse.',
                '3 darts a visit. Hit your number to gallop forward.',
                '9 steps to the winning post. 8 rounds at most.',
            ],
            board: { zones: [{ beds: NUM, numbers: [20], color: GOLD }, { beds: NUM, numbers: [5, 1, 12], color: RED }] },
        },
        {
            eyebrow: 'HOW TO SCORE', title: 'Gallop and knock back',
            legend: [
                { zone: { beds: ['single_inner', 'single_outer'], numbers: [20], color: GREEN }, label: 'Your number — single', note: '', value: '+1' },
                { zone: { beds: ['double'], numbers: [20], color: GREEN }, label: 'Your number — double', note: '', value: '+2' },
                { zone: { beds: ['treble'], numbers: [20], color: GREEN }, label: 'Your number — treble', note: '', value: '+3' },
                { zone: { beds: NUM, numbers: [5, 1, 12], color: RED }, label: 'Someone else’s number', note: 'knocks that horse back the same (finished horses are safe)', value: '−1 −2 −3' },
                { zone: { beds: ['bull', 'outer_bull', 'miss'], color: GREY }, label: 'Bull or a miss', note: 'nothing happens', value: '—' },
            ],
        },
        {
            eyebrow: 'HOW TO WIN', title: 'First past the post',
            lines: [
                'First to 9 opens the finish — everyone else still gets this round’s throw.',
                'One horse home wins. Two or more home together: a dead heat.',
                'Nobody home after 8 rounds? The horse in front wins (level leaders draw).',
            ],
            board: { zones: [{ beds: NUM, numbers: [20], color: GOLD }], dim: true },
        },
    ],
    fresh: (gd) => freshGame(gd),
    first: (gd) => throwerOf(gd, gd.activeIdx || 0)?.name || '',
};
