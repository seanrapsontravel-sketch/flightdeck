// Broadcast graphics over the yard: the thrower card (top centre) with three dart pips and the checkout hint, the
// lane strip (bottom) with a rolling score per lane, and slam-in title cards for BUST / CHECKOUT / SUDDEN DEATH /
// WINNER / NEXT UP. Everything a player typed goes in via textContent.
const el = (tag, cls, parent) => { const e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; };

export function dartLabel(t) {
    if (!t) return '';
    if (t.miss || !t.multiplier) return 'MISS';
    if (t.number === 25) return t.multiplier === 2 ? 'BULL' : '25';
    return (t.multiplier === 3 ? 'T' : t.multiplier === 2 ? 'D' : 'S') + t.number;
}

/** a simple finishing suggestion for scores a single dart can take */
export function checkoutHint(s) {
    if (s <= 0) return '';
    if (s <= 20) return `S${s}`;
    if (s === 25) return '25';
    if (s === 50) return 'BULL';
    if (s <= 40 && s % 2 === 0) return `D${s / 2}`;
    if (s <= 60 && s % 3 === 0) return `T${s / 3}`;
    return '';
}

export class Hud {
    constructor() {
        const root = el('div', 'dm-hud', document.body);
        this.root = root;
        // thrower card
        const card = el('div', 'dm-thrower', root);
        el('div', 'dm-label', card).textContent = 'Now throwing';
        this.tName = el('div', 'dm-tname', card);
        const row = el('div', 'dm-darts', card);
        this.pips = [0, 1, 2].map(() => el('div', 'dm-pip', row));
        this.need = el('div', 'dm-need', card);
        this.card = card;
        // lane strip
        this.strip = el('div', 'dm-strip', root);
        this.lanes = [];
        // finish-round banner
        this.banner = el('div', 'dm-banner', root);
        // title
        this.title = el('div', 'dm-title', root);
        this.tMain = el('div', 'dm-title-main', this.title);
        this.tSub = el('div', 'dm-title-sub', this.title);
        this.titleTimer = null;
        this.shown = new Map();
    }

    setTeams(teams) {
        this.strip.textContent = '';
        this.lanes = teams.map((t) => {
            const c = el('div', 'dm-lane', this.strip);
            c.style.setProperty('--team', t.color);
            el('i', 'dm-lane-bar', c);
            const name = el('div', 'dm-lane-name', c); name.textContent = t.name;
            const score = el('div', 'dm-lane-score', c);
            const meter = el('div', 'dm-lane-meter', c); const fill = el('b', '', meter);
            return { c, name, score, fill, shown: t.score, target: t.score, max: t.max || 180 };
        });
        this.lanes.forEach((L) => { L.score.textContent = String(L.shown); L.fill.style.transform = `scaleX(${L.shown / L.max})`; });
        this.strip.style.setProperty('--n', teams.length);
    }

    setScores(scores, active, checked = []) {
        scores.forEach((s, i) => { const L = this.lanes[i]; if (!L) return; L.target = s; L.c.classList.toggle('is-active', i === active); L.c.classList.toggle('is-out', !!checked[i]); });
    }

    /** snap a lane's display (bust rewinds jump straight back) */
    snap(i, s) { const L = this.lanes[i]; if (L) { L.shown = L.target = s; L.score.textContent = String(s); } }

    thrower(name, color, darts, score) {
        this.card.style.setProperty('--team', color);
        this.tName.textContent = name;
        this.pips.forEach((p, i) => { const d = darts[i]; p.textContent = d || ''; p.classList.toggle('is-thrown', !!d); p.classList.toggle('is-miss', d === 'MISS'); });
        const h = checkoutHint(score);
        this.need.textContent = score > 0 ? (h ? `Need ${score} · ${h}` : `Need ${score}`) : '';
        this.card.classList.add('is-on');
    }
    hideThrower() { this.card.classList.remove('is-on'); }

    setBanner(text) { this.banner.textContent = text || ''; this.banner.classList.toggle('is-on', !!text); }

    /** slam a title card in; hold ms (0 = until replaced) */
    show(kind, main, sub = '', color = '#f5b72c', hold = 2600) {
        clearTimeout(this.titleTimer);
        const t = this.title;
        t.className = 'dm-title'; void t.offsetWidth;
        t.classList.add('is-on', 'k-' + kind);
        t.style.setProperty('--team', color);
        this.tMain.textContent = main; this.tSub.textContent = sub;
        if (hold) this.titleTimer = setTimeout(() => t.classList.add('is-out'), hold);
    }
    hideTitle() { clearTimeout(this.titleTimer); this.title.classList.add('is-out'); }

    /** roll scores toward their targets; a block-by-block count the eye can follow */
    frame(dt) {
        for (const L of this.lanes) {
            if (L.shown === L.target) continue;
            L.acc = (L.acc || 0) + dt * Math.max(24, Math.abs(L.target - L.shown) * 3);
            const step = Math.floor(L.acc);
            if (!step) continue;
            L.acc -= step;
            L.shown += Math.sign(L.target - L.shown) * Math.min(step, Math.abs(L.target - L.shown));
            L.score.textContent = String(L.shown);
            L.fill.style.transform = `scaleX(${Math.max(0, L.shown) / L.max})`;
            L.c.classList.remove('tick'); void L.c.offsetWidth; L.c.classList.add('tick');
        }
    }
}
