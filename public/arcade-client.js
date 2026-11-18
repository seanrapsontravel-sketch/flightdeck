/* Functional session controls layered onto the existing controller/viewer. */
(() => {
    const control = location.pathname.includes('control');
    let socket, state, role = 'viewer', connected = false, timeOffset = 0, modal, standingsSignature = '', barSignature = '';
    let pending = JSON.parse(sessionStorage.getItem('fd-pending') || '{}');
    const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
    const save = () => sessionStorage.setItem('fd-pending', JSON.stringify(pending));
    const el = (tag, text, parent) => { const n = document.createElement(tag); if (text) n.textContent = text; parent?.append(n); return n; };
    function notice(message) {
        document.querySelector('.fd-notice')?.remove();
        const n = el('div', message, document.body); n.className = 'fd-notice'; n.setAttribute('role', 'alert');
        setTimeout(() => n.remove(), 7000);
    }
    function send(ws, payload) {
        if (!ws || ws.readyState !== WebSocket.OPEN || !connected) { notice('Disconnected. Your game is saved. Wait for the connection to return.'); return false; }
        const command = { ...payload, commandId: payload.commandId || crypto.randomUUID(), issuedAt: payload.issuedAt || Date.now() };
        pending[command.commandId] = command; save();
        ws.send(JSON.stringify(command)); return true;
    }
    const command = payload => send(socket, payload);
    function open(ws) {
        socket = ws; connected = true; document.body.classList.remove('fd-disconnected'); renderBar();
        // Only commands that were sent but not acknowledged are retried.
        // Retry after the server identifies this device's permission.
    }
    function close(event) { connected = false; if (control) document.body.classList.add('fd-disconnected'); if (event?.code===1011) notice(event.reason || 'The host cannot save. Check its storage and restart.'); renderBar(); }
    function makeModal(title) {
        modal?.remove();
        modal = el('div', '', document.body); modal.className = 'fd-modal'; modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true');
        const panel = el('div', '', modal); panel.className = 'fd-panel'; el('h2', title, panel); return panel;
    }
    const button = (parent, title, fn) => { const b = el('button', title, parent); b.type = 'button'; b.onclick = fn; return b; };
    function pairing() {
        const panel = makeModal('Pair this tablet');
        el('p', 'Enter the tablet code shown in the terminal on the host Mac. Use the operator code for configuration and simulated throws.', panel);
        const form = el('form', '', panel);
        const label = el('label', 'Pairing code ', form);
        const input = el('input', '', label); input.name = 'code'; input.inputMode = 'numeric'; input.pattern = '[0-9]{8}'; input.required = true; input.maxLength = 8; input.autocomplete = 'off';
        const selectLabel = el('label', 'Device permission ', form);
        const select = el('select', '', selectLabel);
        for (const [value, title] of [['control','Tablet'],['operator','Operator']]) { const o = el('option', title, select); o.value = value; }
        const submit = el('button', 'Pair device', form); submit.type = 'submit';
        const error = el('p', '', form); error.setAttribute('role', 'alert');
        form.onsubmit = async e => {
            e.preventDefault(); submit.disabled = true;
            try {
                const r = await fetch('/api/pair', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({code:input.value, role:select.value}) });
                const result = await r.json(); if (!r.ok) throw new Error(result.error);
                location.reload();
            } catch (err) { error.textContent = err.message; submit.disabled = false; }
        };
        input.focus();
    }
    function setup() {
        const panel = makeModal('Start an arcade session');
        el('p', 'Seat your players in the lineup, then choose your play time. At expiry, finish the current visit. Scores from completed competitive games count toward the championship.', panel);
        const label = el('label', 'Play time ', panel); const minutes = el('select', '', label); minutes.id = 'sessionMinutes';
        [30,60,90].forEach(n => { const o = el('option', `${n} minutes`, minutes); o.value = n; });
        const orderLabel = el('label', 'Throwing order ', panel); const order = el('select', '', orderLabel); order.id = 'sessionOrder';
        [['fixed','Fixed lineup order'],['random','Random order each game']].forEach(([v,t])=>{ const o=el('option',t,order);o.value=v; }); order.value = state?.playOrder || 'fixed';
        const actions = el('div','',panel); actions.className='fd-actions';
        button(actions, 'Start session', () => { command({action:'SET_PLAY_ORDER',order:order.value}); command({action:'START_SESSION',minutes:Number(minutes.value)}); modal.remove(); });
        button(actions, 'Back to lineup', () => modal.remove());
    }
    function showStandings(final = false) {
        const rows = state?.standings || [];
        const hasResults = rows.some(r => r.earned.length);
        const leaders = rows.filter(r => r.place === 1).map(r=>r.name).join(' & ');
        const panel = makeModal(final ? (hasResults ? `Champion${rows.filter(r=>r.place===1).length > 1?'s':''}: ${leaders}` : 'Session finished') : 'Championship standings');
        modal.dataset.view='standings';
        standingsSignature=JSON.stringify([state?.standings,state?.results]);
        if (final) modal.dataset.final='true';
        el('p','Points: 10 / 7 / 5 / 3 for first through fourth; tied players share the average of their occupied places. Solo, team, practice and simulated games are excluded.',panel);
        const table=el('table','',panel); const header=el('tr','',el('thead','',table)); ['Place','Player','Points'].forEach(t=>el('th',t,header)); const body=el('tbody','',table);
        rows.forEach(r=>{const tr=el('tr','',body); [r.place,r.name,Number(r.points.toFixed(2))].forEach(t=>el('td',String(t),tr));});
        for (const r of state?.results || []) {
            const title = state.catalogue?.find(g=>g.id===r.gameType)?.title || r.gameType;
            el('p',`${title}${r.version>1?' · corrected':''} · ${r.eligible ? r.participants.map(p=>{
                const earned=rows.find(row=>row.id===p.id)?.earned.find(e=>e.matchId===r.id);
                return `${p.name}: ${Number((earned?.points || 0).toFixed(2))} points (place ${p.place})`;
            }).join(', ') : `Excluded: ${r.excluded.replaceAll('_',' ')}`}`,panel);
        }
        const actions=el('div','',panel);actions.className='fd-actions';
        if (control) {
            if (final) button(actions,'Back to players',()=>{ command({action:'NAVIGATE',screen:'REGISTRATION'}); modal.remove(); });
            else button(actions,'Back to play',()=>modal.remove());
        }
        if (control && role==='operator') {
            button(actions,'Extend 30 minutes',()=>{command({action:'EXTEND_SESSION',minutes:30});modal.remove();});
            if (!final) button(actions,state?.session?.status==='paused'?'Continue session':'Pause session',()=>{command({action:state?.session?.status==='paused'?'CONTINUE_SESSION':'PAUSE_SESSION'});modal.remove();});
        }
        if (control && !final) button(actions,'End session',()=>{
            const confirm=makeModal('End this session?');
            el('p','Completed results are kept. The unfinished game will be marked abandoned and will not earn championship points.',confirm);
            const choices=el('div','',confirm);choices.className='fd-actions';
            button(choices,'End now',()=>{command({action:'END_SESSION'});modal.remove();});
            button(choices,'Keep playing',()=>showStandings(false));
        });
    }
    function renderBar() {
        if (!document.body) return;
        let bar = document.querySelector('.fd-session-bar');
        if (!bar) { bar=el('div','',document.body); bar.className='fd-session-bar'+(control?'':' fd-tv'); bar.setAttribute('aria-live','polite'); }
        const s=state?.session;
        let clockText='Untimed play';
        if (s) {
            const now=s.pausedAt || Date.now()+timeOffset;
            const remain=Math.max(0,Math.ceil((s.deadline-now)/1000));
            clockText=s.status==='ended'?'Session finished':s.status==='paused'?'Paused':s.status==='expiring'?'Time up · finish this visit':`${Math.floor(remain/60)}:${String(remain%60).padStart(2,'0')} remaining${remain<=300?' · Five-minute warning':''}`;
        }
        const signature=JSON.stringify([connected,role,s?.id,s?.status,state?.standings]);
        if (signature===barSignature && bar.querySelector('[data-clock]')) { bar.querySelector('[data-clock]').textContent=clockText; return; }
        barSignature=signature;
        bar.replaceChildren();
        el('strong',connected?'Connected':'Reconnecting…',bar);
        const clock=el('span',clockText,bar);clock.dataset.clock='';
        if (!control && s) {
            const ranking=el('span',(state.standings || []).map(r => `${r.place}. ${r.name} ${Number(r.points.toFixed(2))}`).join(' · '),bar);
            ranking.className='fd-tv-standings';
        }
        if (control) {
            if (!s || s.status==='ended') button(bar,'Start timed session',setup);
            if (s) button(bar,'Standings',()=>showStandings(s.status==='ended'));
            button(bar,role==='operator'?'Operator paired':'Pair operator',pairing);
        }
    }
    let previousEnded = false;
    function message(payload) {
        if (payload.type === 'DEVICE_ROLE') { role=payload.role; if (control && role==='viewer') pairing(); else for (const p of Object.values(pending)) socket?.send(JSON.stringify(p)); }
        if (payload.type === 'COMMAND_ACK' || payload.type === 'COMMAND_ERROR') { if (payload.commandId) delete pending[payload.commandId]; save(); if (payload.error) notice(payload.error); }
        if (payload.type !== 'STATE_UPDATE') return;
        state=payload.data; timeOffset=state.serverNow-Date.now(); renderBar();
        if (state.recoveryRequired && control && role!=='viewer') {
            if (!document.querySelector('[data-resume]')) {
                const panel=makeModal('Your session has been recovered'); panel.dataset.resume='';
                el('p','The lineup, scores and last visit are saved. Resume when the board is clear and everyone is ready. The purchased session clock keeps its original deadline.',panel);
                button(panel,'Resume session',()=>{command({action:'RESUME_SESSION'});modal.remove();});
            }
        }
        const ended=state.session?.status==='ended';
        if (ended && !previousEnded && (!control || role!=='viewer')) showStandings(true);
        else if (modal?.isConnected && modal.dataset.view==='standings' && standingsSignature!==JSON.stringify([state.standings,state.results])) showStandings(ended);
        previousEnded=ended;
        if (!ended && modal?.dataset.final) modal.remove();
    }
    window.FDClient={send,open,close,message,escape,notice};
    setInterval(renderBar,1000);
})();
