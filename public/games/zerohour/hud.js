// Zero Hour's HUD (docs/plans/ZERO-HOUR.md §8.2). The DOM is the readable truth: every number on screen is the
// engine's (points, numbers led, chance, the hot numbers, the result), written with textContent.
//   top left   — the round ("ROUND 3 OF 5", "LAST ORDERS") and the two hot numbers
//   top right  — the thrower card: name, colour, three dart pips (hot ones gold), the visit's points
//   bottom     — the standings strip, ordered by chance: colour + seat pips, name, "N numbers · chance %", points,
//                and a crown on the favourite
//   centre     — title cards (UP NEXT, ROUND n, steals, the spin's cards) and the final placings
import { el, avatarEl, TitleCard, helpOverlay } from '../lib3d/kit/hud.js';

export const ROUNDS = 5;

export class Hud {
    constructor() {
        const root = (this.root = el('div', 'zh-hud', document.body));
        // round + hot numbers
        const r = (this.round = el('div', 'zh-round', root));
        const rl = el('div', 'zh-round-l', r);
        el('div', 'zh-round-label', rl).textContent = 'ROUND';
        this.roundOf = el('div', 'zh-round-of', rl);
        this.roundTag = el('div', 'zh-round-tag', rl);
        const hot = el('div', 'zh-hot', r);
        el('div', 'zh-hot-label', hot).textContent = 'HOT ×3';
        this.hotNums = el('div', 'zh-hot-nums', hot);
        // thrower
        const t = (this.thr = el('div', 'zh-thrower', root));
        el('div', 'zh-label', t).textContent = 'AT THE OCHE';
        this.tName = el('div', 'zh-tname', t);
        this.tTeam = el('div', 'zh-tteam', t);
        const pips = el('div', 'zh-pips', t);
        this.pips = [0, 1, 2].map(() => el('div', 'zh-pip', pips));
        const vt = el('div', 'zh-visit', t);
        el('span', null, vt).textContent = 'VISIT';
        this.visitPts = el('b', null, vt);
        // standings
        this.strip = el('div', 'zh-strip', root);
        this.cards = [];
        // title card + placings + commit
        this.title = new TitleCard(root, 'zh');
        this.placings = el('div', 'zh-placings', root);
        this.commit = el('div', 'zh-commit', root);
        this.help = helpOverlay(root, 'zh', 'Zero Hour', [
            ['Throw', 'Five rounds, three darts each. Normal darts scoring.'],
            ['Hot ×3', 'Two hot numbers a round (10–20) score triple.'],
            ['Chips', 'Your score becomes chips: they land on random numbers 0–36 and stay there.'],
            ['The spin', 'After round 5, one spin. Most chips on the winning number wins.'],
            ['Places', 'Everyone else is placed by their chips on that number, then by points.'],
        ]);
        this.onTitle = null;
        this.winnerScreen = el('div', 'zh-video', document.body);
    }

    setPlayers(players) {
        this.strip.textContent = '';
        this.strip.style.setProperty('--n', players.length);
        this.cards = players.map((p, i) => {
            const c = el('div', 'zh-card', this.strip);
            c.style.setProperty('--team', p.color);
            el('div', 'zh-card-bar', c);
            const chip = el('div', 'zh-chip', c);
            for (let k = 0; k <= i; k++) el('i', null, chip);
            const avs = el('div', 'zh-avs' + (p.members.length > 1 ? ' is-duo' : ''), c);
            for (const m of p.members.slice(0, 2)) avs.appendChild(avatarEl(m.avatar, m.name, 'zh-av'));
            const nm = el('div', 'zh-card-name', c); nm.textContent = p.name;
            const crown = el('div', 'zh-crown', c); crown.textContent = '♛';
            const led = el('div', 'zh-led', c);
            const pts = el('div', 'zh-pts', c);
            return { c, led, pts, crown, data: { numbers: 0, chance: 0, points: 0 } };
        });
    }

    /** standings from the engine: [{ id, total, numbersLed, chancePct }] in seat order; favourite = seat index */
    setStandings(rows, favourite) {
        const order = rows.map((r, i) => ({ i, r })).sort((a, b) => (b.r.chancePct - a.r.chancePct) || (b.r.total - a.r.total) || (a.i - b.i));
        order.forEach(({ i }, rank) => { const C = this.cards[i]; if (C) C.c.style.order = rank; });
        rows.forEach((r, i) => {
            const C = this.cards[i]; if (!C) return;
            const pct = Number(r.chancePct) || 0;
            C.led.textContent = `${r.numbersLed} ${r.numbersLed === 1 ? 'NUMBER' : 'NUMBERS'} · ${pct.toFixed(pct > 0 && pct < 10 ? 1 : 0)}%`;
            if (Number(C.pts.dataset.v) !== r.total) { C.pts.classList.remove('bump'); void C.pts.offsetWidth; if (C.pts.dataset.v) C.pts.classList.add('bump'); }
            C.pts.textContent = `${r.total} PTS`; C.pts.dataset.v = r.total;
            C.c.dataset.numbers = r.numbersLed; C.c.dataset.chance = pct; C.c.dataset.points = r.total;
            C.c.classList.toggle('is-fav', i === favourite);
        });
    }
    setActive(i) { this.cards.forEach((C, k) => C.c.classList.toggle('is-active', k === i)); }

    setRound(r, hot) {
        this.roundOf.textContent = `${r} OF ${ROUNDS}`;
        this.round.dataset.round = r;
        this.roundTag.textContent = r >= ROUNDS ? 'LAST ORDERS' : '';
        this.round.classList.toggle('is-last', r >= ROUNDS);
        this.setHot(hot);
    }
    setHot(hot) {
        const nums = (hot || []).slice();
        if (this.hotNums.dataset.hot === nums.join(',')) return;
        this.hotNums.textContent = '';
        for (const n of nums) el('span', null, this.hotNums).textContent = String(n);
        this.hotNums.dataset.hot = nums.join(',');
        this.hotNums.classList.remove('is-new'); void this.hotNums.offsetWidth; this.hotNums.classList.add('is-new');
    }

    thrower({ name, team, color }) {
        this.thr.style.setProperty('--team', color);
        this.tName.textContent = name; this.tTeam.textContent = team || ''; this.tTeam.hidden = !team;
        this.thr.classList.add('is-on');
    }
    hideThrower() { this.thr.classList.remove('is-on'); }
    /** the visit's darts: [{ label, points, hot }] */
    setDarts(darts, points) {
        this.pips.forEach((p, k) => {
            const d = darts[k];
            p.className = 'zh-pip' + (d ? ' is-thrown' + (d.hot ? ' is-hot' : d.points ? '' : ' is-zero') : '');
            p.textContent = d ? (d.hot ? `${d.label} ×3` : d.label) : '';
            p.dataset.points = d ? d.points : '';
        });
        this.visitPts.textContent = String(points || 0);
    }

    show(main, sub, opts) { this.title.show(main, sub, opts); if (this.onTitle) this.onTitle(main, opts && opts.kind); }
    hideTitle() { this.title.hide(); }
    setHelp(on) { this.help.set(on); }
    setCommit(hash) { this.commit.textContent = hash ? 'DRAW COMMITMENT ' + hash.slice(0, 16) : ''; }

    /** the final placings: rows = [{ name, color, place, onPocket, pointsRank }] */
    showPlacings(rows, pocket) {
        const P = this.placings; P.textContent = '';
        el('div', 'zh-pl-head', P).textContent = pocket == null ? 'FINAL PLACINGS' : `FINAL PLACINGS · NUMBER ${pocket}`;
        for (const r of rows) {
            const row = el('div', 'zh-pl-row', P); row.style.setProperty('--team', r.color);
            el('div', 'zh-pl-place', row).textContent = ordinal(r.place);
            el('div', 'zh-pl-name', row).textContent = r.name;
            el('div', 'zh-pl-chips', row).textContent = pocket == null ? '' : `${r.onPocket} ON ${pocket}`;
            const mv = r.pointsRank - r.place;
            const m = el('div', 'zh-pl-move' + (mv > 0 ? ' is-up' : mv < 0 ? ' is-down' : ''), row);
            m.textContent = `${ordinal(r.pointsRank)} on points${mv > 0 ? ' ↑' : mv < 0 ? ' ↓' : ''}`;
            row.dataset.place = r.place;
        }
        P.classList.add('is-on');
    }
    hidePlacings() { this.placings.classList.remove('is-on'); }
}

export function ordinal(n) { const s = ['TH', 'ST', 'ND', 'RD'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
