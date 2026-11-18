// The state → view event queue every 3D game uses (lifted from Limbo, docs/plans/KILLER-3D.md §7).
//
// Each gameData (the host's SYNC_STATE, or a ?demo=1 simulator) is diffed by the game against the one before into an
// ordered list of timed events: { dur, steps: [[atSeconds, fn], ...] }. Events play one at a time on their own
// clock; when an event's `dur` is up the next one starts, and any of its steps still due run on as a "tail" in
// parallel, so a dart that lands mid-animation reacts at once. Nothing is dropped or reordered.
// When everything has played (queueIdle) the game reconciles the scene to the state ("nothing lies").
//
//   class Game extends StateQueue { update(dt) { if (this.runQueue(dt)) this.reconcile(); } }
export class StateQueue {
    constructor() { this.events = []; this.cur = null; this.tails = []; }
    push(ev) { this.events.push(ev); }
    clearQueue() { this.events.length = 0; this.cur = null; this.tails.length = 0; }
    get queueIdle() { return !this.cur && !this.events.length && !this.tails.length; }
    /** advance the queue by dt seconds; true when it has nothing left to play */
    runQueue(dt) {
        if (!this.cur && this.events.length) { this.cur = this.events.shift(); this.cur.t = 0; this.cur.i = 0; }
        const step = (ev) => { ev.t += dt; while (ev.i < ev.steps.length && ev.steps[ev.i][0] <= ev.t) ev.steps[ev.i++][1](); };
        if (this.cur) {
            const ev = this.cur; step(ev);
            if (ev.t >= ev.dur) { if (ev.i < ev.steps.length) this.tails.push(ev); this.cur = null; }
        }
        for (let k = this.tails.length - 1; k >= 0; k--) { const ev = this.tails[k]; step(ev); if (ev.i >= ev.steps.length) this.tails.splice(k, 1); }
        return this.queueIdle;
    }
    /** why the queue isn't idle (for truth() debugging) */
    queueBusy() { return { cur: this.cur ? `${this.cur.t.toFixed(2)}/${this.cur.dur}` : null, queued: this.events.length, tails: this.tails.length }; }
}

/**
 * The host's state, as the viewer posts it. Only messages from this origin AND from the parent frame count (a page
 * can't be driven by a forged postMessage). Every state is kept in order, not latest-wins: each dart has to be seen.
 *   const inbox = stateInbox('killer', { onState: (state) => ... });   // inbox.list drained by the frame loop
 *   inbox.apply(gd)  // a ?demo=1 simulator feeds the same list
 */
export function stateInbox(gameType, { onState } = {}) {
    const list = [];
    const apply = (gd) => { if (gd && gd.gameType === gameType) list.push(gd); };
    window.addEventListener('message', (event) => {
        if (event.origin !== location.origin || event.source !== window.parent) return;
        const m = event.data;
        if (!m || m.type !== 'SYNC_STATE' || !m.state || !m.state.gameData) return;
        if (onState) onState(m.state);
        apply(m.state.gameData);
    });
    return { list, apply };
}
