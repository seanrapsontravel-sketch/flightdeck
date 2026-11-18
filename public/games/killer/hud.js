// Broadcast graphics for Killer, deco-ledger style (black lacquer, gold rules, a condensed serif display face):
//   round tracker (top left)  12 pips in three groups (1–6 · 7–9 ×2 · 10–12 ×3), the current one lit
//   thrower card (top centre) avatar, name (team under it in doubles), their number in a brass roundel, status
//                             (MARKS 2/3 or KILLER · LIVES 3), three dart pips that say what each dart did
//   ledger strip (bottom)     a card per player: avatar, name, number, three segment pips, KILLER tag, struck through when out
//   title cards               KILLER / STRIPPED / ELIMINATED / ×3 MARKED / ×2 KNOCKED / CONTRACT ROUND N / UP NEXT / WINNER / A DRAW
//   help overlay              (helpVisible), the 2D page's rules
//   video panes               the venue's clips in video mode (event-videos.js), over the scene
// Everything a player typed goes in via textContent.
import { el, avatarEl, dartLabel, TitleCard, helpOverlay } from '../lib3d/kit/hud.js';

const HELP = [
    ['Your number', 'Each player is assigned a unique target number: your wedge on the floor board.'],
    ['Become a killer', 'Hit your number to fill marks; doubles and trebles count extra. Three marks and you are a Killer.'],
    ['Hunt', "As a Killer, hit other players' numbers to strip their marks and lives. Empty a civilian, or drop a Killer below three, to revoke their status. Overkill eliminates outright."],
    ['Rounds', 'Rounds 1–6 are normal; 7–9 are ×2; 10–12 are ×3. Last player standing wins.'],
    ['After round 12', 'A sole Killer wins; several Killers share the win; with no Killers, most wedges wins (ties share).'],
];

export class Hud {
    constructor() {
        const root = el('div', 'kl-hud', document.body);
        this.root = root;
        // round tracker
        const rt = el('div', 'kl-rounds', root);
        el('div', 'kl-label', rt).textContent = 'Contract round';
        const row = el('div', 'kl-rrow', rt);
        this.roundNum = el('div', 'kl-rnum', row);
        const groups = el('div', 'kl-rgroups', row);
        this.pipsR = [];
        [[1, 6, ''], [7, 9, '×2'], [10, 12, '×3']].forEach(([a, b, tag]) => {
            const g = el('div', 'kl-rgroup', groups);
            const ps = el('div', 'kl-rpips', g);
            for (let r = a; r <= b; r++) this.pipsR.push(el('i', null, ps));
            el('div', 'kl-rtag', g).textContent = tag || '×1';
        });
        this.rounds = rt;
        // thrower card
        const card = el('div', 'kl-thrower', root);
        this.tAv = el('div', 'kl-tav', card);
        const mid = el('div', 'kl-tmid', card);
        el('div', 'kl-label', mid).textContent = 'On the oche';
        this.tName = el('div', 'kl-tname', mid);
        this.tTeam = el('div', 'kl-tteam', mid);
        const drow = el('div', 'kl-darts', mid);
        this.pips = [0, 1, 2].map(() => el('div', 'kl-pip', drow));
        const right = el('div', 'kl-tright', card);
        this.tNum = el('div', 'kl-roundel', right);
        this.tStatus = el('div', 'kl-tstatus', right);
        this.card = card;
        // ledger strip
        this.strip = el('div', 'kl-strip', root);
        this.cards = [];
        this.title = new TitleCard(root, 'kl');
        this.help = helpOverlay(root, 'kl', 'Killer rules', HELP);
        // video panes (classes event-videos.js looks for)
        this.eventScreen = el('div', 'kl-video kl-video-event', document.body);
        this.eventVideo = el('video', 'fd-event-video', this.eventScreen); this.eventVideo.playsInline = true; this.eventVideo.preload = 'auto';
        this.winnerScreen = el('div', 'kl-video kl-video-winner', document.body);
        this.winnerVideo = el('video', 'fd-winner-video', this.winnerScreen); this.winnerVideo.id = 'winnerVideo'; this.winnerVideo.playsInline = true; this.winnerVideo.preload = 'auto';
    }

    /** players: [{ name, avatar, color, number, look }] */
    setPlayers(players) {
        this.strip.textContent = ''; this.cards = [];
        this.strip.style.setProperty('--n', players.length);
        players.forEach((p) => {
            const c = el('div', 'kl-pcard', this.strip);
            c.style.setProperty('--team', p.color);
            c.append(avatarEl(p.avatar, p.name, 'kl-pav'));
            const mid = el('div', 'kl-pmid', c);
            const nm = el('div', 'kl-pname', mid); nm.textContent = p.name;
            const segs = el('div', 'kl-segs', mid);
            const pips = [0, 1, 2].map(() => el('i', null, segs));
            const tag = el('b', 'kl-ktag', segs); tag.textContent = 'KILLER';
            const num = el('div', 'kl-pnum', c); num.textContent = String(p.number);
            this.cards.push({ c, pips, num });
        });
    }
    /** a player's ledger: lit segments, killer, out */
    setLedger(i, { lit, killer, out }) {
        const C = this.cards[i]; if (!C) return;
        C.pips.forEach((f, k) => f.classList.toggle('is-on', k < lit));
        C.c.classList.toggle('is-killer', !!killer);
        C.c.classList.toggle('is-out', !!out);
    }
    setActive(i) { this.cards.forEach((C, k) => C.c.classList.toggle('is-active', k === i)); }

    setRound(r, mult) {
        r = Math.min(12, Math.max(1, r || 1));
        this.roundNum.textContent = String(r);
        this.pipsR.forEach((p, k) => { p.className = k + 1 < r ? 'is-done' : k + 1 === r ? 'is-now' : ''; });
        this.root.dataset.heat = String(mult);
    }

    /** the thrower card for a new visit */
    thrower({ name, team, avatar, color, number }) {
        this.card.style.setProperty('--team', color);
        this.tAv.replaceChildren(avatarEl(avatar, name, 'kl-tav-in'));
        this.tName.textContent = name || 'PLAYER';
        // long names (doubles teams) step the display size down rather than truncate
        const L = (name || '').length;
        this.tName.style.fontSize = L > 26 ? '3rem' : L > 20 ? '3.5rem' : L > 15 ? '4rem' : '';
        this.tTeam.textContent = team || ''; this.tTeam.hidden = !team;
        this.tNum.textContent = String(number ?? '');
        this.pips.forEach((p) => { p.textContent = ''; p.className = 'kl-pip'; });
        this.card.classList.remove('is-on'); void this.card.offsetWidth; this.card.classList.add('is-on');
    }
    status({ killer, lit }) {
        this.tStatus.textContent = killer ? 'KILLER · LIVES 3' : `MARKS ${lit}/3`;
        this.card.classList.toggle('is-killer', !!killer);
    }
    /** pip k: what dart k did — S17 · MARK, T5 · STRIKE ×2, MISS */
    dart(k, t, effect) {
        const p = this.pips[k]; if (!p) return;
        const lab = dartLabel(t);
        const mult = t.multiplier > 1 ? ` ×${t.multiplier}` : '';
        p.textContent = effect === 'mark' ? `${lab} · MARK${mult}` : effect === 'strike' ? `${lab} · STRIKE${mult}` : lab;
        p.className = 'kl-pip is-thrown' + (effect ? ' is-' + effect : '') + (t.miss ? ' is-miss' : '');
    }
    show(main, sub, o = {}) { this.title.show(main, sub, { color: '#c5a059', ...o }); }
    hideTitle() { this.title.hide(); }
    setHelp(on) { this.help.set(on); }
    setWinner(on) { this.root.classList.toggle('is-winner', !!on); }
}
