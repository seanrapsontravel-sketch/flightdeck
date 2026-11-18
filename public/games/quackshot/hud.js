// HUD for 3D Quackshot, carnival-ticket style. The DOM is the readable truth (the tests read it):
//   score columns   along the bottom, in station order: colour bar, avatar(s), name, score, a duck per bullseye,
//                   dart dots for the thrower (data-score / data-ducks / data-darts for the nothing-lies check)
//   round pill      top left: six dots, ×2 FINAL in round 6
//   thrower card    top centre: who's throwing and each dart's result ("s17 · +1", "T5 · −2", "BULL · +3")
//   title cards     Splash! / Ring of Fire! / Outer Bull! / Double Bullseye! / ROUND n / UP NEXT / GRAND PRIZE / DEAD HEAT
//   help overlay, and the winner-clip screen FlightDeckWinnerVideo plays into
import { el, avatarEl, TitleCard, helpOverlay } from '../lib3d/kit/hud.js';
import { MAX_ROUNDS } from './common.js';

const DUCKY = '/assets/quackshot/ducky-icon.svg';
const DUCKS_SHOWN = 6;
const fmt = (n) => (n < 0 ? '−' : '') + Math.abs(n);

export class Hud {
    constructor() {
        const root = el('div', 'qs3-hud', document.body);
        this.root = root;
        // round pill
        const rp = el('div', 'qs3-round', root);
        el('span', 'qs3-round-label', rp).textContent = 'ROUND';
        this.roundNum = el('b', 'qs3-round-num', rp);
        const dots = el('div', 'qs3-round-dots', rp);
        this.dots = [];
        for (let i = 0; i < MAX_ROUNDS; i++) this.dots.push(el('i', null, dots));
        this.final = el('span', 'qs3-final', rp); this.final.textContent = '×2 FINAL';
        this.roundPill = rp;
        // thrower card
        const tc = el('div', 'qs3-thrower', root);
        el('div', 'qs3-label', tc).textContent = 'NOW THROWING';
        this.tName = el('div', 'qs3-tname', tc);
        this.tTeam = el('div', 'qs3-tteam', tc);
        const pips = el('div', 'qs3-pips', tc);
        this.pips = [0, 1, 2].map(() => el('div', 'qs3-pip', pips));
        this.throwerCard = tc;
        // score columns
        this.cols = el('div', 'qs3-cols', root);
        this.columns = [];
        this.title = new TitleCard(root, 'qs3');
        this.help = helpOverlay(root, 'qs3', 'Quackshot Rules', [
            ['6 rounds', 'Round 6 scores are doubled (×2).'],
            ['Double bull', '+3: both prize ducks fall.'],
            ['Outer bull', '+2: knocks a prize duck.'],
            ['Inner single', '+1: between the treble and the bull, where the duck parade runs.'],
            ['Treble', '−2: the Ring of Fire.'],
            ['Everything else', '−1: Splash! (outer singles, doubles, misses).'],
            ['Winner', 'Highest score after 6 rounds.'],
        ]);
        this.winnerScreen = el('div', 'qs3-video qs3-video-winner', document.body);
        this.winnerVideo = el('video', 'fd-winner-video', this.winnerScreen); this.winnerVideo.id = 'winnerVideo'; this.winnerVideo.playsInline = true; this.winnerVideo.preload = 'auto';
        this.dartsShown = 0;
        // the splash curtain: water on the lens. Real drops refract — they blur and brighten what's behind them — so the
        // overlay is a backdrop blur seen through a mask of drop shapes (no drawn outlines: those read as soap bubbles),
        // plus faint specular glints
        const N = 480, M = 270, mask = document.createElement('canvas'); mask.width = N; mask.height = M;
        const glint = document.createElement('canvas'); glint.width = N; glint.height = M;
        const g = mask.getContext('2d'), h = glint.getContext('2d');
        let seed = 7; const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        for (let i = 0; i < 140; i++) {
            const x = R() * N, y = R() * M, r = 2 + Math.pow(R(), 2.4) * 26;
            const gr = g.createRadialGradient(x, y, 0, x, y, r);
            gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.75, 'rgba(0,0,0,0.9)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
            g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r, r * (0.75 + R() * 0.5), R() * 3, 0, Math.PI * 2); g.fill();
            if (r > 10 && R() < 0.6) { g.fillStyle = 'rgba(0,0,0,0.85)'; g.beginPath(); g.ellipse(x, y + r * 1.6, r * 0.28, r * 1.6, 0, 0, Math.PI * 2); g.fill(); }  // a run
            if (r > 5) { h.fillStyle = 'rgba(255,255,255,0.5)'; h.beginPath(); h.ellipse(x - r * 0.35, y - r * 0.4, r * 0.16, r * 0.09, -0.6, 0, Math.PI * 2); h.fill(); }
        }
        this.lens = el('div', 'qs3-lens', document.body);
        const url = mask.toDataURL();
        this.lens.style.webkitMaskImage = this.lens.style.maskImage = `url(${url})`;
        this.lens.style.webkitMaskSize = this.lens.style.maskSize = '100% 100%';
        const gl = el('div', 'qs3-lens-glint', this.lens); gl.style.backgroundImage = `url(${glint.toDataURL()})`;
    }
    /** a splash hits the lens and runs off */
    splashLens() { this.lens.classList.remove('is-on'); void this.lens.offsetWidth; this.lens.classList.add('is-on'); }

    /** players: [{ name, team, members: [{name, avatar}], color }] */
    setPlayers(players) {
        this.cols.textContent = '';
        this.cols.style.setProperty('--n', players.length);
        this.columns = players.map((p, i) => {
            const c = el('div', 'qs3-col', this.cols);
            c.style.setProperty('--team', p.color);
            el('div', 'qs3-col-bar', c);
            const av = el('div', 'qs3-avs' + (p.members.length > 1 ? ' is-duo' : ''), c);
            for (const m of p.members) av.appendChild(avatarEl(m.avatar, m.name, 'qs3-av'));
            const nm = el('div', 'qs3-col-name', c); nm.textContent = p.name;
            const sc = el('div', 'qs3-score', c);
            const ducks = el('div', 'qs3-ducks', c);
            const darts = el('div', 'qs3-dots', c);
            const dd = [0, 1, 2].map(() => el('i', null, darts));
            return { c, sc, ducks, dd, i, score: null, n: null, darts: 0 };
        });
    }
    setScore(i, score, ducks) {
        const C = this.columns[i]; if (!C) return;
        if (C.score !== score) {
            const up = C.score != null && score > C.score, down = C.score != null && score < C.score;
            C.score = score; C.sc.textContent = fmt(score); C.c.dataset.score = String(score);
            C.c.classList.toggle('is-neg', score < 0);
            if (up || down) { C.sc.classList.remove('bump-up', 'bump-down'); void C.sc.offsetWidth; C.sc.classList.add(up ? 'bump-up' : 'bump-down'); }
        }
        if (C.n !== ducks) {
            C.n = ducks; C.c.dataset.ducks = String(ducks);
            C.ducks.textContent = '';
            for (let k = 0; k < Math.min(ducks, DUCKS_SHOWN); k++) { const im = el('img', null, C.ducks); im.src = DUCKY; im.alt = ''; }
            if (ducks > DUCKS_SHOWN) el('span', null, C.ducks).textContent = '×' + ducks;
        }
    }
    setActive(i) { this.columns.forEach((C, k) => C.c.classList.toggle('is-active', k === i)); }
    /** the active column's dart dots: n thrown */
    setDarts(i, n) {
        this.columns.forEach((C, k) => { const m = k === i ? n : 0; C.darts = m; C.c.dataset.darts = String(m); C.dd.forEach((d, j) => d.classList.toggle('is-on', j < m)); });
    }
    setRound(r, final) {
        this.roundNum.textContent = String(r);
        this.roundPill.dataset.round = String(r);
        this.dots.forEach((d, k) => { d.classList.toggle('is-done', k + 1 < r); d.classList.toggle('is-on', k + 1 === r); });
        this.roundPill.classList.toggle('is-final', !!final);
    }
    thrower({ name, team, color }) {
        this.throwerCard.style.setProperty('--team', color);
        this.tName.textContent = name || '';
        this.tTeam.textContent = team || ''; this.tTeam.hidden = !team;
        this.pips.forEach((p) => { p.textContent = ''; p.className = 'qs3-pip'; });
        this.throwerCard.classList.add('is-on');
        this.dartsShown = 0;
    }
    hideThrower() { this.throwerCard.classList.remove('is-on'); }
    /** dart k's result in the thrower card */
    dart(k, text, points) {
        const p = this.pips[k]; if (!p) return;
        p.textContent = text;
        p.className = 'qs3-pip is-thrown ' + (points > 0 ? 'is-plus' : 'is-minus');
        this.dartsShown = Math.max(this.dartsShown, k + 1);
    }
    show(main, sub, o) { this.title.show(main, sub, o); if (this.onTitle) this.onTitle(main, o && o.kind); }
    hideTitle() { this.title.hide(); }
    setHelp(on) { this.help.set(on); }
    setWinner(on) { document.body.classList.toggle('qs3-ended', !!on); }
}
