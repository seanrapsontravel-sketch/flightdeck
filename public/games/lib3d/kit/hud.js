// HUD building blocks every 3D game shares (lifted from Limbo's hud.js). Each game styles them with its own
// prefix; the behaviour lives here. Everything a player typed goes in via textContent; avatars only from data:image,
// same-origin or http(s) URLs (anything else shows initials).
export const el = (tag, cls, parent) => { const e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; };
// first letter/digit of each word, so "Christopher & Maximilian" is CM, not C&
export const initials = (name) => String(name || '?').split(/\s+/).map((w) => (w.match(/[\p{L}\p{N}]/u) || [])[0]).filter(Boolean).join('').slice(0, 2).toUpperCase() || '?';
export function avatarEl(avatar, name, cls) {
    const box = el('div', cls);
    if (avatar && /^(data:image\/(png|jpe?g|webp|gif);|\/(?!\/)|https?:)/i.test(avatar)) { const img = el('img', null, box); img.alt = ''; img.src = avatar; }
    else el('span', null, box).textContent = initials(name);
    return box;
}
/** S20 / D20 / T20 / 25 / BULL / MISS for a lastThrow-shaped { miss, number, multiplier } */
export function dartLabel(t) {
    if (!t) return '';
    if (t.miss) return 'MISS';
    if (t.number === 25 || t.number === 'bull') return t.multiplier === 2 ? 'BULL' : '25';
    return (t.multiplier === 3 ? 'T' : t.multiplier === 2 ? 'D' : '') + t.number;
}

/**
 * A slam-in title card: <div class="{p}-title k-{kind}"><div class="{p}-title-main"/><div class="{p}-title-sub"/></div>
 * show() restarts the in-animation (class is-on); after `ms` it swaps to is-out (ms 0 = stays up).
 */
export class TitleCard {
    constructor(parent, prefix) {
        this.prefix = prefix;
        this.root = el('div', prefix + '-title', parent);
        this.main = el('div', prefix + '-title-main', this.root);
        this.sub = el('div', prefix + '-title-sub', this.root);
        this.timer = null;
    }
    show(main, sub, { kind = '', color = '', ms = 2200 } = {}) {
        clearTimeout(this.timer);
        this.root.className = this.prefix + '-title' + (kind ? ' k-' + kind : '');
        if (color) this.root.style.setProperty('--team', color);
        this.main.textContent = main; this.sub.textContent = sub || ''; this.sub.hidden = !sub;
        void this.root.offsetWidth; this.root.classList.add('is-on');
        if (ms > 0) this.timer = setTimeout(() => { this.root.classList.remove('is-on'); this.root.classList.add('is-out'); }, ms);
    }
    hide() { clearTimeout(this.timer); this.root.classList.remove('is-on'); }
}

/** the rules overlay shown while gameData.helpVisible: rows = [[heading, text], ...] */
export function helpOverlay(parent, prefix, heading, rows) {
    const help = el('div', prefix + '-help', parent);
    el('h2', null, help).textContent = heading;
    for (const [h, p] of rows) { const r = el('div', prefix + '-help-row', help); el('b', null, r).textContent = h; el('span', null, r).textContent = p; }
    return { el: help, set(on) { help.classList.toggle('is-on', !!on); } };
}
