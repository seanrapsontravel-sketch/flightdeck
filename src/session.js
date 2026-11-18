const { randomUUID, createHash } = require('node:crypto');
const { byId } = require('./catalogue');
const POINTS = [10, 7, 5, 3];
const terminal = gd => ['winner', 'draw', 'complete'].includes(gd?.phase?.type);

function startSession(players, minutes, now = Date.now()) {
    if (![30, 60, 90].includes(minutes)) throw new Error('Choose 30, 60 or 90 minutes.');
    if (players.length < 1 || players.length > 6) throw new Error('Seat 1–6 singles players first.');
    return { id: randomUUID(), participants: players.map(({ id, name }) => ({ id, name })),
        startedAt: now, deadline: now + minutes * 60000, status: 'active',
        pausedAt: null, expiringVisit: null, history: [{ action: 'started', at: now, minutes }] };
}
function visitKey(gd) {
    if (!gd) return null;
    // A game whose unit of play is the round (Million Pound Oche: every player
    // must get the same number of questions) only lets the clock stop between rounds.
    if (gd.sessionUnit === 'round') return `round:${gd.currentRound || 1}`;
    return `${gd.currentRound || 1}:${gd.activeIdx ?? gd.activeTurnIndex ?? 0}:${gd.player?.id || ''}`;
}
/** Has the unit the clock waits on (a visit, or a whole round) started yet? */
function unitStarted(gd) {
    if (gd?.sessionUnit === 'round') {
        const ph = gd.phase?.type;
        if (gd.suddenDeath) return true;                                 // a tiebreak always plays to a winner
        if (ph === 'round_announce') return false;                       // a new round, not yet begun
        if (ph === 'intermission') return (gd.phase.data?.nextPlayerIndex || 0) > 0;
        return (gd.activeIdx || 0) > 0 || dartsInVisit(gd) > 0 || ph === 'locked' || ph === 'reveal';
    }
    return !!dartsInVisit(gd);
}
function dartsInVisit(gd) { return gd?.dartsThrownThisTurn ?? gd?.throwsThisTurn ?? 0; }
function endSession(s, reason, now) {
    if (!s || s.status === 'ended') return;
    s.status = 'ended'; s.endedAt = now; s.expiringVisit = null;
    s.history.push({ action: 'ended', reason, at: now });
}
// Called before commands/throws as well as by the host clock. Once time expires,
// only the visit already under way can finish. No new visit starts on a restart.
function tickSession(s, gd, awaitingTakeout, correcting = false, now = Date.now()) {
    if (!s || s.status === 'ended' || s.status === 'paused') return;
    if (now < s.deadline) return;
    if (s.status !== 'expiring') {
        s.status = 'expiring'; s.expiringVisit = visitKey(gd);
        s.history.push({ action: 'expired', at: now });
        if (!correcting && (!gd || terminal(gd) || !unitStarted(gd) || (awaitingTakeout && gd.sessionUnit !== 'round') ||
            ['setup', 'pick_mode', 'pick_player'].includes(gd.phase?.type))) {
            endSession(s, 'time', now); return;
        }
    }
    if (gd?.sessionUnit === 'round') {
        // only the end of the game or the end of the round stops it
        if (!correcting && (terminal(gd) || visitKey(gd) !== s.expiringVisit)) endSession(s, 'round_finished', now);
        return;
    }
    if (!correcting && (terminal(gd) || awaitingTakeout || dartsInVisit(gd) >= 3 || visitKey(gd) !== s.expiringVisit)) endSession(s, 'visit_finished', now);
}
function sessionCommand(s, action, minutes, now = Date.now()) {
    if (!s) throw new Error('Start a session first.');
    if (action === 'END_SESSION') return endSession(s, 'early', now);
    if (action === 'PAUSE_SESSION' && s.status === 'active') { s.status = 'paused'; s.pausedAt = now; }
    else if (action === 'CONTINUE_SESSION' && s.status === 'paused') { s.deadline += now - s.pausedAt; s.pausedAt = null; s.status = 'active'; }
    else if (action === 'EXTEND_SESSION' && Number.isInteger(minutes) && minutes >= 1 && minutes <= 90) {
        s.deadline = Math.max(s.deadline, now) + minutes * 60000;
        if (s.pausedAt) s.pausedAt = now;
        s.status = s.pausedAt ? 'paused' : 'active'; s.expiringVisit = null;
    } else throw new Error('That session action is unavailable.');
    s.history.push({ action, minutes, at: now });
}

function resultFor(state, status = 'completed') {
    const gd = state.gameData;
    if (!gd || !state.matchParticipants?.length || (!terminal(gd) && status === 'completed')) return null;
    const game = gd.gameType;
    const people = game === 'quick10' && gd.player ? [gd.player] : state.matchParticipants;
    const phase = gd.phase?.data || {};
    const winners = new Set([phase.winnerId, ...(phase.members || []).map(p => p.id), ...(phase.contenders || []).map(p => p.id)].filter(Boolean));
    if (game === 'demolition' && phase.teamIndex != null) (gd.teams[phase.teamIndex] || []).forEach(p => winners.add(p.id));
    // Engines that provide their own complete ranking keep it (Around the World).
    const supplied = gd.standings || phase.standings;
    const ranked = people.map(p => {
        const actor = gd.players?.find(a => a.id === p.id);
        const teamIdx = gd.teams?.findIndex(t => t.some(a => a.id === p.id));
        const score = game === 'demolition' ? gd.teamScores?.[teamIdx] : game === 'quick10' ? gd.totalScore : actor?.score;
        const official = supplied?.find(a => a.id === p.id || a.playerId === p.id);
        // Unfinished players are tied behind the winner in checkout/elimination
        // games: those games do not determine second/third/fourth place.
        let metric = ['derby', 'shanghai', 'quackshot', 'millionpound'].includes(game) ? Number(score) || 0 : 0;
        if (official) metric = -official.place;
        return { id: p.id, name: p.name, metric, winner: winners.has(p.id), score: score ?? null,
            details: official ? { darts: official.darts, finished: official.finished, stopsCleared: official.stopsCleared }
                : game === 'killer' || game === 'limbo' ? { lives: actor?.lives ?? null }
                : game === 'cricket' ? { marks: actor?.marks || {} } : {}, official };
    });
    ranked.sort((a, b) => Number(b.winner) - Number(a.winner) || b.metric - a.metric);
    let place = 1;
    ranked.forEach((p, i) => {
        if (i && (p.winner !== ranked[i - 1].winner || p.metric !== ranked[i - 1].metric)) place = i + 1;
        p.place = place;
    });
    ranked.forEach(p => { delete p.metric; delete p.official; delete p.winner; });
    const samePlayers = state.session && people.length === state.session.participants.length && people.every(p => state.session.participants.some(a => a.id === p.id));
    const excluded = status !== 'completed' ? status : !byId[game]?.championship ? 'solo_or_practice'
        : people.length < 2 ? 'solo_or_practice' : state.matchIsDoubles ? 'teams'
        : gd.usedDebug || state.matchSimulated ? 'simulated' : !samePlayers ? 'different_participants' : null;
    return { id: gd.matchKey, sessionId: state.matchSessionId, gameType: game, status, participants: ranked,
        eligible: !excluded, excluded, integrity: { simulated: !!(gd.usedDebug || state.matchSimulated), corrected: !!gd.usedCorrection },
        scoreDetails: { phase: gd.phase?.type, reason: phase.reason || null, totalScore: gd.totalScore ?? null },
        rankingRule: ['derby', 'shanghai', 'quackshot', 'millionpound'].includes(game) ? 'winner_then_score' : ['aroundtheworld', 'zerohour'].includes(game) ? 'engine_standings' : 'winner_then_shared_remaining_places' };
}
function upsertResult(state, status) {
    const result = resultFor(state, status);
    if (!result) return;
    state.results ||= [];
    const previous = state.results.find(r => r.id === result.id);
    const fingerprint = createHash('sha256').update(JSON.stringify(result)).digest('hex');
    if (previous?.fingerprint === fingerprint) return;
    const saved = { ...result, fingerprint, version: (previous?.version || 0) + 1, updatedAt: Date.now() };
    state.results = state.results.filter(r => r.id !== result.id).concat(saved).slice(-1000);
}
function standings(session, results = []) {
    if (!session) return [];
    const rows = session.participants.map(p => ({ ...p, points: 0, earned: [] }));
    for (const r of results.filter(r => r.sessionId === session.id && r.eligible && r.status === 'completed')) {
        for (const p of r.participants) {
            const tie = r.participants.filter(a => a.place === p.place).length;
            const points = Array.from({ length: tie }, (_, i) => POINTS[p.place - 1 + i] || 0).reduce((a, b) => a + b, 0) / tie;
            const row = rows.find(a => a.id === p.id);
            if (row) { row.points += points; row.earned.push({ matchId: r.id, gameType: r.gameType, place: p.place, points, version: r.version }); }
        }
    }
    rows.sort((a, b) => b.points - a.points);
    rows.forEach((row, i) => { row.place = i && row.points === rows[i - 1].points ? rows[i - 1].place : i + 1; });
    return rows;
}
module.exports = { startSession, sessionCommand, tickSession, standings, resultFor, upsertResult, terminal, visitKey, dartsInVisit };
