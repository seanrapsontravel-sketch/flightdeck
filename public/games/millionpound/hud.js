// The Hot Oche's DOM HUD: the readable truth. Everything a player typed, and every question and answer, goes in via
// textContent. Prefix mpo- (the kit uses ki-).
//   - top left: the round pill (ROUND n OF 5 · QUESTION k OF 15)
//   - top: every player's prize (the towers' truth), the thrower marked
//   - right: the money tree for the player on the oche: fifteen rungs, their prize lit, the target pulsing
//   - lower third: the contestant tab (name, PLAYING FOR, the turn's three questions), the question lozenge and the
//     four answer lozenges in the show's 2×2 (A B / C D), each with a mini dartboard lighting its physical quadrant
//   - title cards, the final leaderboard, help, the winner clip screen
import { el, avatarEl, TitleCard, helpOverlay } from '../lib3d/kit/hud.js';
import { CHECKPOINTS, LADDER, LETTERS, ZONES, moneyShort } from './common.js';
import { WHEEL, SLICE, wedgeAngle } from '../lib3d/kit/darts.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const ANCHOR_TEXT = { A: '20', B: '6', C: '3', D: '11' };
const POS_TEXT = { A: 'TOP', B: 'RIGHT', C: 'BOTTOM', D: 'LEFT' };

/** a mini dartboard: the twenty wedges; this answer's live wedges lit, the other answers' live wedges navy, the
 *  wedges out of play this visit dark; its anchor number on it */
function miniBoard(L, size = 5) {
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', '-1.1 -1.1 2.2 2.2'); svg.setAttribute('class', 'mpo-mini');
    const add = (tag, attrs) => { const e = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); svg.appendChild(e); return e; };
    add('circle', { r: 1.04, class: 'mpo-mini-rim' });
    const Z = ZONES[size] || ZONES[5];
    for (const n of WHEEL) {
        const a = wedgeAngle(n), a0 = a - SLICE / 2, a1 = a + SLICE / 2, r = 0.96;
        const p = (ang) => `${(Math.cos(ang) * r).toFixed(3)},${(-Math.sin(ang) * r).toFixed(3)}`;
        const owner = LETTERS.find((K) => Z[K].includes(n));
        add('path', { d: `M0,0L${p(a0)}A${r},${r} 0 0,0 ${p(a1)}Z`, class: 'mpo-mini-q' + (owner === L ? ' is-me' : owner ? '' : ' is-off') });
    }
    add('circle', { r: 0.16, class: 'mpo-mini-bull' });
    const aa = wedgeAngle(ANCHOR_N[L]);
    const t = add('text', { x: Math.cos(aa) * 0.6, y: -Math.sin(aa) * 0.6 + 0.14, class: 'mpo-mini-n' });
    t.textContent = ANCHOR_TEXT[L];
    return svg;
}
const ANCHOR_N = { A: 20, B: 6, C: 3, D: 11 };

export class Hud {
    constructor() {
        const root = el('div', 'mpo-hud', document.body);
        this.root = root;
        // round pill
        this.roundPill = el('div', 'mpo-round', root);
        const rl = el('div', 'mpo-round-l', this.roundPill);
        el('div', 'mpo-round-label', rl).textContent = 'ROUND';
        this.roundOf = el('div', 'mpo-round-of', rl);
        const rr = el('div', 'mpo-round-q', this.roundPill);
        el('div', 'mpo-round-label', rr).textContent = 'QUESTION';
        this.qOf = el('div', 'mpo-round-of', rr);
        this.level = el('div', 'mpo-round-level', this.roundPill);
        // player chips
        this.chipsBox = el('div', 'mpo-chips', root);
        this.chips = [];
        // the money tree
        this.tree = el('div', 'mpo-tree', root);
        this.treeName = el('div', 'mpo-tree-name', this.tree);
        this.treeRows = [];
        for (let r = LADDER.length; r >= 1; r--) {
            const row = el('div', 'mpo-tree-row' + (r === LADDER.length ? ' is-million' : '') + (CHECKPOINTS.includes(r) ? ' is-checkpoint' : ''), this.tree);
            el('span', 'mpo-tree-n', row).textContent = String(r);
            el('i', 'mpo-tree-dot', row);
            el('span', 'mpo-tree-v', row).textContent = r === LADDER.length ? '£1 MILLION' : moneyShort(LADDER[r - 1]);
            row.dataset.rung = String(r);
            this.treeRows[r] = row;
        }
        // the lower third
        this.low = el('div', 'mpo-low', root);
        this.tab = el('div', 'mpo-tab', this.low);
        this.tabName = el('div', 'mpo-tab-name', this.tab);
        this.tabFor = el('div', 'mpo-tab-for', this.tab);
        this.pips = el('div', 'mpo-pips', this.tab);
        this.pipEls = [0, 1, 2].map(() => el('i', 'mpo-pip', this.pips));
        this.status = el('div', 'mpo-status', this.low);
        // what's at stake before every dart: a right answer, a treble, a wrong treble
        this.stakesBox = el('div', 'mpo-stakes', this.low);
        const chip = (cls, label) => { const c = el('div', 'mpo-stake ' + cls, this.stakesBox); el('span', 'mpo-stake-l', c).textContent = label; return el('b', null, c); };
        this.stRight = chip('k-right', 'RIGHT'); this.stTreble = chip('k-treble', 'TREBLE'); this.stWrong = chip('k-wrong', 'WRONG TREBLE');
        this.stPass = el('div', 'mpo-stake k-pass', this.stakesBox); el('span', 'mpo-stake-l', this.stPass).textContent = 'BULL'; el('b', null, this.stPass).textContent = 'FREE PASS';
        this.qBar = el('div', 'mpo-q', this.low);
        const qIn = el('div', 'mpo-q-in', this.qBar);
        this.qText = el('div', 'mpo-q-text', qIn);
        this.grid = el('div', 'mpo-answers', this.low);
        this.ans = {};
        for (const L of LETTERS) {
            const a = el('div', 'mpo-ans', this.grid);
            a.dataset.key = L;
            const inner = el('div', 'mpo-ans-in', a);
            const mini = miniBoard(L); inner.appendChild(mini);
            const dia = el('span', 'mpo-ans-key', inner);
            el('b', null, dia).textContent = L;
            const where = el('span', 'mpo-ans-where', inner); where.textContent = POS_TEXT[L];
            const txt = el('span', 'mpo-ans-text', inner);
            this.ans[L] = { a, txt, inner, mini, size: 5 };
        }
        // titles, leaderboard, help, winner clip
        this.title = new TitleCard(root, 'mpo');
        this.board = el('div', 'mpo-final', root);
        this.help = helpOverlay(root, 'mpo', 'How to play', [
            ['The board', 'The four quarters are the answers: A top (20), B right (6), C bottom (3), D left (11). The zones shrink each visit: 5, 5, 3, 3, then 2 numbers an answer.'],
            ['Your visit', 'Three questions, one dart each. Right: up one. A right TREBLE: up two. A wrong treble in another answer: down one.'],
            ['Checkpoints', '£1,000 and £32,000 are banked: a wrong treble never drops you below them.'],
            ['Bull', 'Your first inner bull is a free pass (up one). The outer bull, and any bull after that, is no answer.'],
            ['To win', 'Highest rung after 15 questions. Level on top? First to the million wins, else sudden death.'],
        ]);
        this.winnerScreen = el('div', 'mpo-video', document.body);
        this.shownQ = null; this.stageTimers = [];
    }

    // ---------------------------------------------------------------- players
    setPlayers(players) {
        this.chipsBox.textContent = ''; this.chips = [];
        this.chipsBox.style.setProperty('--n', players.length);
        players.forEach((p, i) => {
            const c = el('div', 'mpo-chip', this.chipsBox);
            c.style.setProperty('--team', p.color);
            const av = el('div', 'mpo-chip-avs' + (p.members.length > 1 ? ' is-duo' : ''), c);
            for (const m of p.members.slice(0, 2)) av.appendChild(avatarEl(m.avatar, m.name, 'mpo-av'));
            const t = el('div', 'mpo-chip-t', c);
            const name = el('div', 'mpo-chip-name', t); name.textContent = p.name;
            const prize = el('div', 'mpo-chip-prize', t); prize.textContent = '£0';
            c.dataset.rung = '0';
            this.chips[i] = { c, name, prize, player: p };
        });
    }
    setRung(i, rung) {
        const C = this.chips[i]; if (!C) return;
        const prize = rung > 0 ? LADDER[rung - 1] : 0;
        if (C.c.dataset.rung !== String(rung)) { C.prize.classList.remove('bump'); void C.prize.offsetWidth; if (rung > Number(C.c.dataset.rung)) C.prize.classList.add('bump'); }
        C.prize.textContent = rung >= LADDER.length ? '£1M' : moneyShort(prize);
        C.c.dataset.rung = String(rung);
    }
    setActive(i) { this.chips.forEach((C, k) => C.c.classList.toggle('is-active', k === i)); }
    setWinners(idx) { this.chips.forEach((C, k) => C.c.classList.toggle('is-winner', idx.includes(k))); }

    // ---------------------------------------------------------------- round, tree, tab
    setRound(r, qNo, level) {
        this.roundOf.textContent = `${r} / 5`; this.qOf.textContent = `${qNo} / 15`;
        this.level.textContent = level || '';
        this.roundPill.dataset.round = String(r); this.roundPill.dataset.q = String(qNo);
        this.roundPill.classList.toggle('is-final', qNo >= 15);
    }
    setTree(name, rung, live, banked = 0) {
        this.treeName.textContent = name || '';
        for (let r = 1; r <= LADDER.length; r++) {
            const row = this.treeRows[r];
            row.classList.toggle('is-banked', r === banked && banked > 0);
            row.classList.toggle('is-treble', live && r === rung + 2);
            row.classList.toggle('is-won', r <= rung);
            row.classList.toggle('is-current', r === rung);
            row.classList.toggle('is-target', live && r === rung + 1);
        }
        this.tree.dataset.rung = String(rung);
    }
    contestant({ name, team, color, rung, tag }) {
        this.tab.style.setProperty('--team', color);
        this.tabName.textContent = name || '';
        this.tabFor.textContent = '';
        if (team) { const t = el('span', 'mpo-tab-team', this.tabFor); t.textContent = team + ' · '; }
        if (tag) { const t = el('span', 'mpo-tab-tag', this.tabFor); t.textContent = tag + ' · '; }
        this.tabFor.append('ON ');
        const b = el('b', null, this.tabFor); b.textContent = rung >= LADDER.length ? '£1 MILLION' : moneyShort(rung > 0 ? LADDER[rung - 1] : 0);
    }
    /** the stakes before the dart (null hides them: sudden death has its own rule) */
    stakes(st, passAvailable) {
        this.stakesBox.classList.toggle('is-on', !!st);
        if (!st) return;
        const m = (v) => (v >= 1000000 ? '£1M' : moneyShort(v));
        this.stRight.textContent = m(st.right);
        this.stTreble.textContent = m(st.trebleRight);
        this.stWrong.textContent = st.safe ? `${m(st.trebleWrong)} · BANKED` : m(st.trebleWrong);
        this.stPass.hidden = !passAvailable;
        this.stakesBox.dataset.right = String(st.right); this.stakesBox.dataset.treble = String(st.trebleRight); this.stakesBox.dataset.wrong = String(st.trebleWrong);
    }
    /** the turn's three questions: [{state:'right'|'wrong'|'pass'|'now'|''}] */
    setPips(list) { this.pipEls.forEach((p, k) => { const s = list[k] || ''; p.className = 'mpo-pip' + (s ? ' is-' + s : ''); }); }

    // ---------------------------------------------------------------- the question
    /** show question q ({id, text, answers}); stage = answers appear A → D */
    question(q, { stage = true } = {}) {
        this.clearStage();
        this.low.classList.add('is-on');
        this.low.classList.remove('is-locked', 'is-revealed');
        this.status.className = 'mpo-status'; this.status.textContent = '';
        if (this.shownQ !== q.id) {
            this.qText.textContent = q.text;
            this.fit(this.qText, 4.8, 3.6);
            for (const L of LETTERS) { this.ans[L].txt.textContent = q.answers[L]; }
        }
        this.shownQ = q.id;
        const size = q.zoneSize || 5;
        for (const L of LETTERS) {
            const A = this.ans[L]; A.a.className = 'mpo-ans';
            if (A.size !== size) { const m = miniBoard(L, size); A.inner.replaceChild(m, A.mini); A.mini = m; A.size = size; }
        }
        this.low.dataset.zone = String(size);
        for (const L of LETTERS) this.fit(this.ans[L].txt, 4.2, 2.8);
        this.qBar.classList.remove('is-in'); void this.qBar.offsetWidth; this.qBar.classList.add('is-in');
        if (!stage) { this.allShown(); return; }
        LETTERS.forEach((L, k) => this.stageTimers.push(setTimeout(() => this.ans[L].a.classList.add('is-shown'), 450 + k * 380)));
    }
    allShown() { this.clearStage(); for (const L of LETTERS) this.ans[L].a.classList.add('is-shown'); }
    clearStage() { for (const t of this.stageTimers) clearTimeout(t); this.stageTimers = []; }
    /** shrink a line's font until it fits its box (rem bounds) */
    fit(e, max, min) {
        e.style.fontSize = max + 'rem';
        for (let s = max; s > min && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1); s -= 0.2) e.style.fontSize = s.toFixed(1) + 'rem';
    }
    hideQuestion() { this.clearStage(); this.low.classList.remove('is-on', 'is-locked', 'is-revealed'); this.shownQ = null; }
    /** the dart named an answer (or: a free pass; an inactive number; nothing) */
    lock(key, pass, outcome = '', treble = false) {
        this.allShown();
        this.low.classList.add('is-locked');
        for (const L of LETTERS) { const a = this.ans[L].a; a.classList.toggle('is-locked', L === key); a.classList.toggle('is-dim', !!key && L !== key); a.classList.toggle('is-treble', L === key && treble); }
        const text = pass ? 'BULL · FREE PASS' : key ? (treble ? `TREBLE · LOCKED IN · ${key}` : `LOCKED IN · ${key}`)
            : outcome === 'inactive' ? 'NOT IN PLAY · NO ANSWER' : outcome === 'pass_used' ? 'PASS ALREADY USED' : outcome === 'outer_bull' ? 'OUTER BULL · NO ANSWER' : outcome === 'bull' ? 'BULL · NO ANSWER' : 'NO ANSWER';
        this.status.className = 'mpo-status is-on ' + (pass ? 'k-pass' : key ? (treble ? 'k-treble' : 'k-locked') : 'k-none');
        this.status.textContent = text;
    }
    reveal({ answer, correctKey, right, pass, outcome = '', move = 0, saved = false, suddenDeath = false, tier = 0 }) {
        this.allShown();
        this.low.classList.add('is-revealed');
        for (const L of LETTERS) {
            const a = this.ans[L].a;
            a.classList.toggle('is-right', L === correctKey);
            a.classList.toggle('is-wrong', !right && L === answer);
            a.classList.toggle('is-locked', false);
            a.classList.toggle('is-dim', L !== correctKey && L !== answer);
        }
        let text, k;
        if (suddenDeath) { text = tier === 2 ? 'TREBLE · RIGHT' : tier === 1 ? 'RIGHT' : answer ? `WRONG · IT WAS ${correctKey}` : `NO ANSWER · IT WAS ${correctKey}`; k = tier ? 'k-right' : 'k-wrong'; }
        else if (outcome === 'treble_right') { text = 'TREBLE! · UP TWO'; k = 'k-treble-right'; }
        else if (outcome === 'treble_wrong') { text = saved ? `WRONG TREBLE · SAVED BY THE CHECKPOINT` : `WRONG TREBLE · DOWN ONE`; k = 'k-treble-wrong'; }
        else if (pass) { text = 'FREE PASS · UP ONE'; k = 'k-pass'; }
        else if (right) { text = 'CORRECT · UP ONE'; k = 'k-right'; }
        else { text = answer ? `THE ANSWER WAS ${correctKey}` : `NO ANSWER · IT WAS ${correctKey}`; k = 'k-wrong'; }
        void move;
        this.status.className = 'mpo-status is-on ' + k;
        this.status.textContent = text;
    }

    // ---------------------------------------------------------------- titles, final board
    show(main, sub, o) { this.title.show(main, sub, o); }
    hideTitle() { this.title.hide(); }
    final(rows) {
        this.board.textContent = '';
        if (!rows) { this.board.classList.remove('is-on'); return; }
        const h = el('div', 'mpo-final-h', this.board); h.textContent = 'FINAL STANDINGS';
        for (const r of rows) {
            const row = el('div', 'mpo-final-row' + (r.winner ? ' is-winner' : ''), this.board);
            row.style.setProperty('--team', r.color);
            el('span', 'mpo-final-place', row).textContent = r.placeText;
            el('span', 'mpo-final-name', row).textContent = r.name;
            el('span', 'mpo-final-prize', row).textContent = r.prize >= 1000000 ? '£1 MILLION' : moneyShort(r.prize);
            el('span', 'mpo-final-correct', row).textContent = `${r.correct}/15 right${r.trebles ? ` · ${r.trebles} treble${r.trebles > 1 ? 's' : ''}` : ''}${r.passes ? ' · pass' : ''}`;
        }
        this.board.classList.add('is-on');
    }
    setHelp(on) { this.help.set(on); }
}
