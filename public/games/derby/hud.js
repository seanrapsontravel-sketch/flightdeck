// Broadcast graphics over the 3D course: the running order, the thrower's lower third, event straps, round
// titles, call to the post, past the post, the winner's circle, and name tags that ride above each horse.
// Every player-supplied string goes in as text, never as markup.
import * as THREE from 'three';
import { playerColor, SECONDARY } from './race.js';
import { FINISH } from './course.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const ORD = (n) => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');
const initials = (name) => (window.FC_playerInitials ? window.FC_playerInitials(name) : String(name || '?').slice(0, 2).toUpperCase());

/** an avatar: the player's raster photo, or initials */
export function avatarEl(avatar, name, cls = 'dh-avatar') {
    const box = el('div', cls);
    if (avatar && /^(data:image\/(png|jpe?g|webp|gif);|\/|https?:)/i.test(avatar)) { const img = el('img'); img.alt = ''; img.src = avatar; box.append(img); }
    else box.append(el('span', 'dh-initials', initials(name)));
    return box;
}

function dartLabel(t) {
    if (!t) return { text: '·', kind: 'none' };
    if (t.miss) return { text: 'MISS', kind: 'miss' };
    if (t.number === 'bull') return { text: t.multiplier === 2 ? 'BULL' : '25', kind: 'neutral' };
    if (t.number == null) return { text: 'MISS', kind: 'miss' };
    const pre = t.multiplier === 3 ? 'T' : t.multiplier === 2 ? 'D' : 'S';
    return { text: pre + t.number, kind: t.selfHit ? 'boost' : t.hit ? (t.immune ? 'neutral' : 'knock') : 'neutral' };
}

export class Hud {
    constructor() {
        this.rows = new Map();
        this.tags = new Map();
        this.darts = []; this.turnKey = null; this.prevThrows = 0;
        this.roundBar = $('roundBar');
        for (let i = 0; i < 8; i++) this.roundBar.append(el('i'));
        this.v = new THREE.Vector3();
        this.timers = [];
        // race map: furlong ticks counting down to the post, like the poles on the course
        const ticks = $('mapTicks');
        for (let i = 0; i <= 9; i++) {
            const pct = (i / 9) * 100;
            if (i > 0 && i < 9) { const t = el('i'); t.style.left = pct + '%'; ticks.append(t); }
            const lab = el('b', i === 9 ? 'post' : '', i === 0 ? 'START' : i === 9 ? 'POST' : `${9 - i}f`);
            lab.style.left = pct + '%'; ticks.append(lab);
        }
        this.mapSig = null; this.pills = [];
    }

    // ------------------------------------------------------------------ per state
    sync(gd, race) {
        $('helpOverlayCard').classList.toggle('visible', !!gd.helpVisible);
        $('roundNum').textContent = Math.min(8, gd.currentRound || 1);
        [...this.roundBar.children].forEach((s, i) => { s.className = i < (gd.currentRound || 1) - 1 ? 'done' : i === (gd.currentRound || 1) - 1 ? 'now' : ''; });
        this.board(gd, race);
        this.thrower(gd, race);
    }

    board(gd, race) {
        const box = $('board');
        const ids = new Set(gd.players.map((p) => p.id));
        for (const [id, row] of this.rows) if (!ids.has(id)) { row.remove(); this.rows.delete(id); }
        const order = gd.players.map((p, i) => ({ p, i })).sort((a, b) => (b.p.score || 0) - (a.p.score || 0) || a.i - b.i);
        let rank = 0, last = null;
        order.forEach(({ p, i }, k) => {
            if ((p.score || 0) !== last) { rank = k + 1; last = p.score || 0; }
            let row = this.rows.get(p.id);
            if (!row) {
                row = el('div', 'dh-row');
                row.style.setProperty('--pc', playerColor(i)); row.style.setProperty('--sc', SECONDARY[i % 8]);
                row.append(el('div', 'dh-pos'), el('div', 'dh-silk'), el('div', 'dh-name'), el('div', 'dh-num'));
                const track = el('div', 'dh-track');
                for (let s = 0; s < 9; s++) track.append(el('i'));
                row.append(track, el('div', 'dh-pips'));
                for (let d = 0; d < 3; d++) row.lastChild.append(el('i'));
                box.append(row); this.rows.set(p.id, row);
                row.querySelector('.dh-silk').dataset.pat = String(i % 8);
            }
            row.style.transform = `translateY(${k * 6.2}rem)`;
            row.querySelector('.dh-pos').textContent = ORD(rank);
            row.querySelector('.dh-name').textContent = p.name || 'PLAYER';
            row.querySelector('.dh-num').textContent = p.targetNumber;
            const sc = p.score || 0;
            [...row.querySelector('.dh-track').children].forEach((s, n) => { s.className = n < sc ? 'on' : ''; });
            const active = i === gd.activeIdx && gd.phase && gd.phase.type !== 'winner' && gd.phase.type !== 'draw';
            row.classList.toggle('active', active);
            row.classList.toggle('finished', !!p.finished || sc >= 9);
            [...row.querySelector('.dh-pips').children].forEach((d, n) => { d.className = active && n < (gd.throwsThisTurn || 0) ? 'thrown' : ''; });
            if (row.dataset.score !== String(sc)) {
                if (row.dataset.score != null) { row.classList.remove('bump-up', 'bump-down'); void row.offsetWidth; row.classList.add(sc > Number(row.dataset.score) ? 'bump-up' : 'bump-down'); }
                row.dataset.score = String(sc);
            }
        });
        box.style.height = `${order.length * 6.2}rem`;
    }

    thrower(gd, race) {
        const i = gd.activeIdx, p = gd.players[i];
        if (!p) return;
        const key = `${i}-${gd.currentRound}`;
        if (key !== this.turnKey || (gd.throwsThisTurn || 0) < this.prevThrows) { this.darts = []; this.turnKey = key; }
        if ((gd.throwsThisTurn || 0) > this.prevThrows && gd.lastThrow) this.darts[(gd.throwsThisTurn || 1) - 1] = dartLabel(gd.lastThrow);
        this.prevThrows = gd.throwsThisTurn || 0;
        const box = $('thrower');
        box.style.setProperty('--pc', playerColor(i));
        if (box.dataset.pid !== String(p.id) || box.dataset.av !== String(p.avatar || '')) {
            box.dataset.pid = String(p.id); box.dataset.av = String(p.avatar || '');
            const slot = $('throwerAvatar'); slot.replaceChildren(avatarEl(p.avatar, p.name));
            box.classList.remove('swap'); void box.offsetWidth; box.classList.add('swap');
        }
        $('throwerName').textContent = p.name || 'PLAYER';
        $('throwerAim').textContent = p.targetNumber;
        const slots = [...$('throwerDarts').children];
        slots.forEach((s, n) => {
            const d = this.darts[n];
            const txt = d ? d.text : '';
            if (s.textContent !== txt) { s.textContent = txt; s.className = d ? `dh-dart ${d.kind} pop` : 'dh-dart'; }
        });
        const show = ['playing', 'mult_boost', 'mult_knock'].includes(gd.phase?.type);
        box.classList.toggle('show', show);
    }

    // ------------------------------------------------------------------ phase overlays
    hideAll() {
        for (const id of ['eventCard', 'titleCard', 'callCard', 'postCard', 'matchWinnerScreen']) $(id).classList.remove('show');
        document.body.classList.remove('cine');
        if (window.FlightDeckWinnerVideo) window.FlightDeckWinnerVideo.stopIn($('matchWinnerScreen'));
    }

    phase(ph, gd, race) {
        this.hideAll();
        const d = ph.data || {};
        const restart = (node) => { node.classList.remove('show'); void node.offsetWidth; node.classList.add('show'); };
        switch (ph.type) {
            case 'round_announce': {
                const r = d.round || gd.currentRound || 1;
                $('titleEyebrow').textContent = d.eyebrow || 'POST TIME';
                $('titleMain').textContent = d.title || `Round ${r}`;
                $('titleOf').textContent = d.maxRounds ? `Furlong ${r} of ${d.maxRounds}` : `Furlong ${r}`;
                const tags = $('titleTags'); tags.replaceChildren();
                (Array.isArray(d.tags) ? d.tags : []).forEach((t) => tags.append(el('span', /FINAL/i.test(t) ? 'hot' : '', t)));
                $('titleSub').textContent = d.subtitle || '';
                $('titleCard').classList.toggle('final', !!d.isLast);
                document.body.classList.add('cine');
                restart($('titleCard'));
                break;
            }
            case 'intermission': {
                const idx = d.nextPlayerIndex ?? gd.activeIdx;
                const name = d.nextPlayerName || d.nextTeamName || 'PLAYER';
                $('callCard').style.setProperty('--pc', playerColor(idx));
                $('callAvatar').replaceChildren(avatarEl(d.avatar, name, 'dh-avatar big'));
                $('callName').textContent = name;
                $('callAim').textContent = d.targetNumber != null ? d.targetNumber : '—';
                const pl = gd.players[idx];
                $('callStat').textContent = pl ? (pl.score ? `${9 - pl.score} to the post` : 'In the stalls') : '';
                document.body.classList.add('cine');
                restart($('callCard'));
                break;
            }
            case 'mult_boost':
            case 'mult_knock': {
                const boost = ph.type === 'mult_boost', m = d.multiplier === 3 ? 3 : d.multiplier === 1 ? 1 : 2;
                const idx = gd.players.findIndex((p) => p.name === d.playerName && p.targetNumber === d.targetNumber);
                const card = $('eventCard');
                card.className = `dh-event ${boost ? 'boost' : 'knock'} m${m}`;
                card.style.setProperty('--pc', playerColor(idx < 0 ? 0 : idx));
                $('eventWord').textContent = boost ? (m === 3 ? 'TREBLE!' : 'DOUBLE!') : (m === 1 ? 'NICKED BACK' : m === 3 ? 'TREBLE KNOCK!' : 'CHECKED!');
                $('eventDelta').textContent = `${boost ? '+' : '−'}${d.steps ?? m} ${Math.abs(d.steps ?? m) === 1 ? 'LENGTH' : 'LENGTHS'}`;
                $('eventName').textContent = d.playerName || 'PLAYER';
                $('eventQuip').textContent = boost ? (d.quip || 'Full Gallop!') : `${d.quip || 'Boxed In!'} · by ${d.actorName || 'a rival'}`;
                $('eventAvatar').replaceChildren(avatarEl(d.avatar, d.playerName || 'P'));
                restart(card);
                break;
            }
            case 'past_post': {
                const idx = gd.players.findIndex((p) => p.id === d.playerId);
                $('postCard').style.setProperty('--pc', playerColor(idx < 0 ? 0 : idx));
                $('postName').textContent = d.playerName || 'PLAYER';
                $('postAvatar').replaceChildren(avatarEl(d.avatar, d.playerName || 'P', 'dh-avatar big'));
                $('postNum').textContent = d.targetNumber ?? '';
                document.body.classList.add('cine');
                restart($('postCard'));
                break;
            }
            case 'winner':
            case 'draw': {
                const scr = $('matchWinnerScreen');
                const draw = ph.type === 'draw';
                scr.classList.toggle('mode-draw', draw);
                $('winEyebrow').textContent = draw ? 'Dead Heat' : "Winner's Circle";
                $('winBadge').textContent = draw ? 'Shared Honours' : 'First Past The Post';
                const row = $('winAvatars'); row.replaceChildren();
                let list;
                if (draw) list = (d.contenders || []).map((c) => ({ name: c.name, avatar: c.avatar, id: c.id }));
                else list = Array.isArray(d.members) && d.members.length > 1 ? d.members.map((m) => ({ name: m.name, avatar: m.avatar, id: d.winnerId })) : [{ name: d.winnerName, avatar: d.avatar, id: d.winnerId }];
                $('winName').textContent = draw ? list.map((c) => c.name).filter(Boolean).join(' · ') || 'DRAW' : (d.winnerName || 'CHAMPION');
                list.forEach((c) => {
                    const idx = gd.players.findIndex((p) => p.id === c.id);
                    const a = avatarEl(c.avatar, c.name || 'P', 'dh-avatar win');
                    a.style.setProperty('--pc', playerColor(idx < 0 ? 0 : idx));
                    row.append(a);
                });
                document.body.classList.add('cine');
                restart(scr);
                if (window.FlightDeckWinnerVideo) window.FlightDeckWinnerVideo.playIn(scr);
                break;
            }
        }
        document.body.dataset.phase = ph.type;
    }

    // ------------------------------------------------------------------ race map (every frame, from the horses themselves)
    mapFrame(race) {
        const rs = race.runners;
        const sig = rs.map((r) => r.pid).join('|');
        const lanes = $('mapLanes');
        if (sig !== this.mapSig) {
            this.mapSig = sig; lanes.replaceChildren(); this.pills = [];
            const n = rs.length, H = 100 / Math.max(n, 1);
            rs.forEach((r, i) => {
                const lane = el('div', 'dh-lane');
                lane.style.top = `${i * H}%`; lane.style.height = `${H}%`;
                lane.style.setProperty('--pc', playerColor(r.idx));
                lane.style.setProperty("--ph", `${Math.min(3, 12.6 / n)}rem`);
                const trail = el('div', 'trail');
                const pill = el('div', 'dh-pill'); pill.append(el('b'), el('span'), el('em'));
                lane.append(trail, pill); lanes.append(lane);
                this.pills.push({ r, pill, trail, last: '' });
            });
        }
        const best = Math.max(0, ...rs.map((r) => r.score || 0));
        for (const P of this.pills) {
            const r = P.r, pct = Math.max(0, Math.min(1, r.x / FINISH)) * 100;
            P.pill.style.left = pct.toFixed(2) + '%';
            P.trail.style.width = pct.toFixed(2) + '%';
            const pos = race.runners.filter((o) => (o.score || 0) > (r.score || 0)).length + 1;
            const label = `${r.number}|${r.name}|${pos}|${best}|${r.active}|${r.score}`;
            if (label !== P.last) {
                P.last = label;
                P.pill.children[0].textContent = r.number;
                P.pill.children[1].textContent = r.name || '';
                P.pill.children[2].textContent = r.score >= 9 ? '⚑' : ORD(pos);
                P.pill.classList.toggle('lead', best > 0 && r.score === best);
                P.pill.classList.toggle('active', !!r.active);
                P.pill.classList.toggle('fin', r.score >= 9);
            }
        }
    }

    // ------------------------------------------------------------------ name tags over the horses
    tagsFrame(race, camera, shot) {
        const host = $('tags');
        const W = host.clientWidth, H = host.clientHeight;
        const hideAll = ['crane', 'establish', 'winner', 'hero', 'pastpost', 'photo'].includes(shot);
        for (const r of race.runners) {
            let t = this.tags.get(r);
            if (!t) {
                t = el('div', 'dh-tag');
                t.style.setProperty('--pc', playerColor(r.idx));
                t.append(el('b'), el('span'));
                host.append(t); this.tags.set(r, t);
            }
            t.firstChild.textContent = r.number;
            t.lastChild.textContent = r.name || '';
            this.v.copy(r.group.localToWorld(this.v.set(0.7, 2.7, 0)));
            const dist = this.v.distanceTo(camera.position);
            this.v.project(camera);
            const vis = !hideAll && this.v.z < 1 && Math.abs(this.v.x) < 1.1 && Math.abs(this.v.y) < 1.1 && dist < 140;
            t.classList.toggle('on', vis);
            t.classList.toggle('active', !!r.active);
            if (vis) {
                const x = (this.v.x * 0.5 + 0.5) * W, y = (-this.v.y * 0.5 + 0.5) * H;
                const s = Math.max(0.62, Math.min(1.05, 30 / dist));
                t.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%) scale(${s.toFixed(3)})`;
            }
        }
        for (const [r, t] of this.tags) if (!race.runners.includes(r)) { t.remove(); this.tags.delete(r); }
    }
}
