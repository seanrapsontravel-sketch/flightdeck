// HUD for 3D Shanghai, scroll style. The DOM is the readable truth (the tests read it):
//   score columns   along the bottom, in station order: colour bar, avatar(s), name, total and the eight round cells
//                   (data-score, data-rounds = JSON of roundScores, data-darts for the nothing-lies check)
//   round pill      top left: ROUND n / 8 and the target big ("AIM FOR 5"); data-round, data-target
//   thrower card    top right: who's throwing and each dart's result ("T5 · +15", "7 · 0")
//   title cards     ROUND n / FINAL ROUND, UP NEXT, SHANGHAI!, CHAMPION, TIED
//   help overlay, and the winner-clip screen FlightDeckWinnerVideo plays into
import { el, avatarEl, TitleCard, helpOverlay } from '../lib3d/kit/hud.js';

export const MAX_ROUNDS = 8;

export class Hud {
    constructor() {
        const root = el('div', 'sh3-hud', document.body);
        this.root = root;
        const rp = el('div', 'sh3-round', root);
        const rl = el('div', 'sh3-round-l', rp);
        el('span', 'sh3-round-label', rl).textContent = 'ROUND';
        const rn = el('div', 'sh3-round-of', rl);
        this.roundNum = el('b', 'sh3-round-num', rn);
        el('span', null, rn).textContent = ' / ' + MAX_ROUNDS;
        const rt = el('div', 'sh3-aim', rp);
        el('span', 'sh3-aim-label', rt).textContent = 'AIM FOR';
        this.target = el('b', 'sh3-aim-num', rt);
        this.roundPill = rp;
        const tc = el('div', 'sh3-thrower', root);
        el('div', 'sh3-label', tc).textContent = 'NOW THROWING';
        this.tName = el('div', 'sh3-tname', tc);
        this.tTeam = el('div', 'sh3-tteam', tc);
        const pips = el('div', 'sh3-pips', tc);
        this.pips = [0, 1, 2].map(() => el('div', 'sh3-pip', pips));
        this.throwerCard = tc;
        this.cols = el('div', 'sh3-cols', root);
        this.columns = [];
        this.title = new TitleCard(root, 'sh3');
        this.help = helpOverlay(root, 'sh3', 'Shanghai Rules', [
            ['8 rounds', 'In round 1 aim for 1, in round 2 aim for 2 … up to 8.'],
            ['Scoring', 'Only the round’s number scores: single ×1, double ×2, treble ×3. Everything else scores 0.'],
            ['Shanghai!', 'A single, a double and a treble of the number in one visit wins the game on the spot.'],
            ['Winner', 'Otherwise, the highest total after round 8. Level on top is a tie.'],
        ]);
        this.winnerScreen = el('div', 'sh3-video sh3-video-winner', document.body);
        this.winnerVideo = el('video', 'fd-winner-video', this.winnerScreen); this.winnerVideo.id = 'winnerVideo'; this.winnerVideo.playsInline = true; this.winnerVideo.preload = 'auto';
    }

    /** players: [{ name, members: [{name, avatar}], color }] */
    setPlayers(players) {
        this.cols.textContent = '';
        this.cols.style.setProperty('--n', players.length);
        this.columns = players.map((p, i) => {
            const c = el('div', 'sh3-col', this.cols);
            c.style.setProperty('--team', p.color);
            el('div', 'sh3-col-bar', c);
            const av = el('div', 'sh3-avs' + (p.members.length > 1 ? ' is-duo' : ''), c);
            for (const m of p.members) av.appendChild(avatarEl(m.avatar, m.name, 'sh3-av'));
            const nm = el('div', 'sh3-col-name', c); nm.textContent = p.name;
            const sc = el('div', 'sh3-score', c);
            const cells = el('div', 'sh3-cells', c);
            const cl = Array.from({ length: MAX_ROUNDS }, () => el('i', null, cells));
            const darts = el('div', 'sh3-dots', c);
            const dd = [0, 1, 2].map(() => el('i', null, darts));
            return { c, sc, cl, dd, i, score: null, rounds: null, darts: 0 };
        });
    }
    /** a column's total and round cells (rounds: the server's roundScores, null = not thrown yet); round: current */
    setScore(i, score, rounds, round) {
        const C = this.columns[i]; if (!C) return;
        if (C.score !== score) {
            const up = C.score != null && score > C.score;
            C.score = score; C.sc.textContent = String(score); C.c.dataset.score = String(score);
            if (up) { C.sc.classList.remove('bump-up'); void C.sc.offsetWidth; C.sc.classList.add('bump-up'); }
        }
        const r = Array.from({ length: MAX_ROUNDS }, (_, k) => (rounds && rounds[k] != null ? rounds[k] : null));
        const key = JSON.stringify(r) + '|' + round;
        if (C.rounds !== key) {
            C.rounds = key; C.c.dataset.rounds = JSON.stringify(r);
            C.cl.forEach((e, k) => { e.textContent = r[k] == null ? '' : String(r[k]); e.classList.toggle('is-cur', k + 1 === round); e.classList.toggle('is-scored', !!r[k]); });
        }
    }
    setActive(i) { this.columns.forEach((C, k) => C.c.classList.toggle('is-active', k === i)); }
    setDarts(i, n) {
        this.columns.forEach((C, k) => { const m = k === i ? n : 0; C.darts = m; C.c.dataset.darts = String(m); C.dd.forEach((d, j) => d.classList.toggle('is-on', j < m)); });
    }
    setRound(r) {
        this.roundNum.textContent = String(r); this.target.textContent = String(r);
        this.roundPill.dataset.round = String(r); this.roundPill.dataset.target = String(r);
        this.roundPill.classList.toggle('is-final', r >= MAX_ROUNDS);
    }
    thrower({ name, team, color }) {
        this.throwerCard.style.setProperty('--team', color);
        this.tName.textContent = name || '';
        this.tTeam.textContent = team || ''; this.tTeam.hidden = !team;
        this.pips.forEach((p) => { p.textContent = ''; p.className = 'sh3-pip'; });
        this.throwerCard.classList.add('is-on');
    }
    hideThrower() { this.throwerCard.classList.remove('is-on'); }
    /** dart k's result in the thrower card */
    dart(k, text, scored) {
        const p = this.pips[k]; if (!p) return;
        p.textContent = text;
        p.className = 'sh3-pip is-thrown ' + (scored ? 'is-hit' : 'is-zero');
    }
    show(main, sub, o) { this.title.show(main, sub, o); if (this.onTitle) this.onTitle(main, o && o.kind); }
    hideTitle() { this.title.hide(); }
    setHelp(on) { this.help.set(on); }
    setWinner(on) { document.body.classList.toggle('sh3-ended', !!on); }
}
