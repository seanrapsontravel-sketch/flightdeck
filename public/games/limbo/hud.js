// Broadcast graphics for Limbo ("tiki-pop": carved wood, cream type, a neon edge in the team colour):
//   the bar plaque (top left) — ratchets with the 3D bar, tooth by tooth
//   the thrower card (top centre) — avatar, name (team under it in doubles), three dart pips, total vs bar, room left
//   the lives strip (bottom) — one card per player, three flames each, OUT when they're gone
//   slam-in title cards — CLEARED / BAR HOLDS / BURNED! / NO ROOM! / OUT! / BAR RESET / WINNER
//   the help overlay (helpVisible)
// Everything a player typed goes in via textContent; avatars only from data:image, same-origin or http(s) URLs.
import { el, initials, avatarEl, dartLabel, TitleCard, helpOverlay } from '../lib3d/kit/hud.js';
export { initials, dartLabel };

const HELP = [
    ['Stay under the bar', 'Three darts a visit. Your total has to finish at or under the burning bar.'],
    ['Clear it, it drops', 'Finish under and the bar drops to your total. Hit it exactly and it holds.'],
    ['Go over, you burn', "Over the bar (or no room left for your other darts, 1 each) costs a torch. The bar goes back to 60."],
    ['Misses hurt', 'A miss scores 25. Three torches each: last one burning wins.'],
];

export class Hud {
    constructor() {
        const root = el('div', 'lb-hud', document.body);
        this.root = root;
        // the bar plaque
        const pl = el('div', 'lb-plaque', root);
        el('div', 'lb-plaque-label', pl).textContent = 'THE BAR';
        this.barNum = el('div', 'lb-plaque-num', pl);
        this.plaque = pl; this.shownBar = null;
        // thrower card
        const card = el('div', 'lb-thrower', root);
        this.tAv = el('div', 'lb-tav', card);
        const mid = el('div', 'lb-tmid', card);
        el('div', 'lb-label', mid).textContent = 'Under the bar';
        this.tName = el('div', 'lb-tname', mid);
        this.tTeam = el('div', 'lb-tteam', mid);
        const row = el('div', 'lb-darts', mid);
        this.pips = [0, 1, 2].map(() => el('div', 'lb-pip', row));
        this.room = el('div', 'lb-room', mid);
        const tot = el('div', 'lb-total', card);
        this.totNum = el('div', 'lb-total-num', tot);
        el('div', 'lb-total-label', tot).textContent = 'TOTAL';
        this.card = card;
        // lives strip
        this.strip = el('div', 'lb-strip', root);
        this.cards = [];
        // title
        this.title = new TitleCard(root, 'lb');
        // help
        this.help = helpOverlay(root, 'lb', 'How to play Limbo', HELP);
    }

    /** players: [{ name, avatar, color, lives }] */
    setPlayers(players) {
        this.strip.textContent = ''; this.cards = [];
        this.strip.style.setProperty('--n', players.length);
        players.forEach((p) => {
            const c = el('div', 'lb-pcard', this.strip);
            c.style.setProperty('--team', p.color);
            c.append(avatarEl(p.avatar, p.name, 'lb-pav'));
            const nm = el('div', 'lb-pname', c); nm.textContent = p.name;
            const fl = el('div', 'lb-flames', c);
            const flames = [0, 1, 2].map(() => el('i', null, fl));
            this.cards.push({ c, flames });
            this.setLives(this.cards.length - 1, p.lives);
        });
    }
    setLives(i, n) {
        const C = this.cards[i]; if (!C) return;
        C.flames.forEach((f, k) => f.classList.toggle('is-out', k >= n));
        C.c.classList.toggle('is-out', n <= 0);
    }
    setActive(i) { this.cards.forEach((C, k) => C.c.classList.toggle('is-active', k === i)); }

    /** the thrower card for a new visit */
    thrower({ name, team, avatar, color }) {
        this.card.style.setProperty('--team', color);
        this.tAv.replaceChildren(avatarEl(avatar, name, 'lb-tav-in'));
        this.tName.textContent = name || 'PLAYER';
        this.tTeam.textContent = team || '';
        this.tTeam.hidden = !team;
        this.pips.forEach((p) => { p.textContent = ''; p.className = 'lb-pip'; });
        this.card.classList.remove('is-on'); void this.card.offsetWidth; this.card.classList.add('is-on');
    }
    /** a dart lands: pip k shows its score (MISS +25) */
    dart(k, t) {
        const p = this.pips[k]; if (!p) return;
        p.textContent = t.miss ? 'MISS +25' : String(t.score);
        p.className = 'lb-pip is-thrown' + (t.miss ? ' is-miss' : '');
    }
    /** total vs bar, and the room left: "11 TO SPARE · 1 DART" */
    status(total, bar, dartsLeft, verdict) {
        this.totNum.textContent = String(total);
        const spare = bar - total;
        let txt;
        if (verdict) txt = verdict;
        else if (dartsLeft <= 0) txt = spare === 0 ? 'ON THE BAR' : `${spare} UNDER`;
        else if (spare - dartsLeft + 1 <= 0) txt = 'NO ROOM';
        else txt = `${spare} TO SPARE · ${dartsLeft} DART${dartsLeft > 1 ? 'S' : ''}`;
        this.room.textContent = txt;
        this.room.classList.toggle('is-tight', dartsLeft > 0 && spare - dartsLeft < 4);
    }
    /** the plaque follows the 3D bar's physical position (call every frame) */
    bar(n) {
        if (n === this.shownBar) return;
        this.shownBar = n; this.barNum.textContent = String(n);
        this.plaque.classList.remove('tick'); void this.plaque.offsetWidth; this.plaque.classList.add('tick');
        this.plaque.classList.toggle('is-hot', n <= 15);
    }

    show(main, sub, { kind = '', color = '#ff8a5c', ms = 2200 } = {}) { this.title.show(main, sub, { kind, color, ms }); }
    hideTitle() { this.title.hide(); }
    setHelp(on) { this.help.set(on); }
    setWinner(on) { this.root.classList.toggle('is-winner', !!on); }
}
