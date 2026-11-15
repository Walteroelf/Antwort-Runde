'use strict';
/* Antwort-Runde: Schüler-iPad. Aufgabe lesen/hören, Antwort schreiben, einsprechen oder aufnehmen. */
(function () {
  const app = document.getElementById('app');
  const KID = 'ar.kid', ANS = 'ar.kid.ans';
  let me = AR.store.get(KID, null);              // {pid, name, room}
  let A = AR.store.get(ANS, { round: '', answers: {}, drafts: {} });  // answers[taskId] = {text, ts, acked, audio}
  const rec = {};                                // taskId -> {buf, mime, url, ts, acked}
  let net = null, st = null, ownIdx = 0, shownId = null, shownSig = '', interacted = false, speaking = false;
  let recorder = null, recStream = null, recTimer = null, recChunks = [], recTask = null, recog = null;

  const hashRoom = (AR.hashParams().get('r') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  const saveA = () => AR.store.set(ANS, A);
  addEventListener('pointerdown', () => { interacted = true; }, { once: true });

  /* ---------- Verbindung ---------- */
  function connect() {
    if (net) net.close();
    net = AR.joinRoom(me.room, {
      onStatus(s) {
        document.getElementById('netDot').className = 'dot ' + (s === 'open' ? 'ok' : s === 'connecting' ? 'warn' : 'bad');
        document.getElementById('netTxt').textContent = s === 'open' ? 'verbunden' : s === 'connecting' ? 'verbinde …' : 'getrennt, versuche erneut';
      },
      onOpen() { net.send({ t: 'hello', pid: me.pid, name: me.name }); resendAll(); },
      onData: onData
    });
  }
  function onData(d) {
    if (!d || !d.t) return;
    if (d.t === 'state') {
      if (A.round !== d.round) { A = { round: d.round, answers: {}, drafts: {} }; for (const k in rec) delete rec[k]; saveA(); }
      const first = !st; st = d; render(first);
    } else if (d.t === 'ack') {
      const a = A.answers[d.task]; if (a && a.ts === d.ts) { a.acked = true; saveA(); }
      if (rec[d.task] && rec[d.task].ts === d.ts) rec[d.task].acked = true;
      if (st && curTask() && curTask().id === d.task) renderStatus();
    }
  }
  function resendAll() {
    for (const id in A.answers) { const a = A.answers[id]; if (!a.acked) sendAnswer(id); }
  }
  function sendAnswer(id) {
    const a = A.answers[id]; if (!a || !net) return;
    const r = rec[id];
    net.send({ t: 'answer', pid: me.pid, name: me.name, round: A.round, task: id, text: a.text || '', ts: a.ts,
      audio: r ? r.buf : null, mime: r ? r.mime : '', dropAudio: !r });
  }

  /* ---------- Aufgaben ---------- */
  function curTask() {
    if (!st || st.current < 0) return null;
    const i = st.pace === 'self' ? Math.min(ownIdx, st.tasks.length - 1) : Math.min(st.current, st.tasks.length - 1);
    return st.tasks[i] || null;
  }
  function curIdx() { return st.pace === 'self' ? Math.min(ownIdx, st.tasks.length - 1) : Math.min(st.current, st.tasks.length - 1); }

  function render(force) {
    if (!me) return renderJoin();
    if (!st) { app.innerHTML = '<div class="center big">Verbinde mit der Lehrkraft …</div>'; return; }
    const t = curTask();
    if (!t) { stopAll(); shownId = null; shownSig = ''; app.innerHTML = '<div class="center"><div style="font-size:4rem">⏳</div><div class="big">Gleich geht es los.</div><div class="muted">Warte, bis die Lehrkraft die Aufgabe freigibt.</div></div>'; return; }
    const sig = [t.id, t.text, t.q, t.mode, st.pace, st.tasks.length].join('\u0001');
    if (!force && sig === shownSig) return;
    const newTask = t.id !== shownId;
    shownSig = sig; shownId = t.id;
    if (newTask) stopAll();
    renderTask(t, newTask);
  }

  function renderTask(t, isNew) {
    const i = curIdx(), n = st.tasks.length, self = st.pace === 'self';
    const draft = (A.drafts && A.drafts[t.id]) || (A.answers[t.id] && A.answers[t.id].text) || '';
    const canTalk = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    const mode = t.mode || 'text';
    let h = '<div class="head"><span>' + AR.esc(me.name) + '</span><span>Aufgabe ' + (i + 1) + ' von ' + n + '</span></div>';
    h += '<div class="qbox">' + (t.text ? '<p class="txt">' + AR.esc(t.text) + '</p>' : '') + (t.q ? '<p class="q">' + AR.esc(t.q) + '</p>' : '') + '</div>';
    if (AR.tts.ok && (t.text || t.q)) h += '<button class="btn primary read" id="bRead">🔊 Vorlesen</button>';
    if (mode !== 'audio') {
      h += '<textarea id="ans" placeholder="Schreibe hier deine Antwort …" autocapitalize="sentences" spellcheck="false"></textarea>';
      if (canTalk) h += '<button class="btn bigbtn" id="bTalk">🎤 Sprechen und aufschreiben lassen</button>';
      else h += '<div class="small muted">Tipp: Auf der Tastatur das Mikrofon antippen, dann kannst du sprechen.</div>';
    }
    if (mode !== 'text') h += '<div class="rec" id="recBox"></div>';
    h += '<button class="btn good bigbtn" id="bSend">Abschicken</button><div class="center small" id="sendSt"></div>';
    if (self && n > 1) {
      h += '<div class="row" style="justify-content:space-between"><button class="btn" id="bPrev"' + (i < 1 ? ' disabled' : '') + '>◀ Zurück</button>' +
        '<div class="dots">' + st.tasks.map((x, k) => '<i class="' + (k === i ? 'cur' : (A.answers[x.id] ? 'done' : '')) + '"></i>').join('') + '</div>' +
        '<button class="btn" id="bNext"' + (i >= n - 1 ? ' disabled' : '') + '>Weiter ▶</button></div>';
    }
    app.innerHTML = h;
    const ta = document.getElementById('ans'); if (ta) { ta.value = draft; ta.oninput = () => { A.drafts[t.id] = ta.value; saveA(); }; }
    const bRead = document.getElementById('bRead'); if (bRead) bRead.onclick = () => toggleRead(t);
    const bTalk = document.getElementById('bTalk'); if (bTalk) bTalk.onclick = () => toggleTalk(ta, bTalk);
    document.getElementById('bSend').onclick = () => submit(t);
    if (document.getElementById('recBox')) renderRec(t);
    const p = document.getElementById('bPrev'), nx = document.getElementById('bNext');
    if (p) p.onclick = () => { ownIdx = Math.max(0, ownIdx - 1); render(true); };
    if (nx) nx.onclick = () => { ownIdx = Math.min(n - 1, ownIdx + 1); render(true); };
    renderStatus();
    if (isNew && st.autoRead && interacted) setTimeout(() => toggleRead(t, true), 300);
  }

  function renderStatus() {
    const el = document.getElementById('sendSt'), t = curTask(); if (!el || !t) return;
    const a = A.answers[t.id];
    el.textContent = !a ? '' : a.acked ? '✓ Angekommen bei der Lehrkraft' : '… wird gesendet';
    el.style.color = a && a.acked ? 'var(--ok)' : 'var(--muted)';
  }

  /* ---------- Vorlesen ---------- */
  function toggleRead(t, autostart) {
    const b = document.getElementById('bRead');
    if (speaking && !autostart) { AR.tts.stop(); speaking = false; if (b) b.textContent = '🔊 Vorlesen'; return; }
    speaking = true; if (b) b.textContent = '⏹ Stopp';
    AR.tts.speak([t.text, t.q], st.rate, () => { speaking = false; const bb = document.getElementById('bRead'); if (bb) bb.textContent = '🔊 Vorlesen'; });
  }
  function stopAll() {
    AR.tts.stop(); speaking = false;
    if (recog) { try { recog.abort(); } catch (e) { /* egal */ } recog = null; }
    if (recorder && recorder.state !== 'inactive') { try { recorder.onstop = null; recorder.stop(); } catch (e) { /* egal */ } }
    cleanupRec();
  }

  /* ---------- Einsprechen als Text (Spracherkennung des Geräts) ---------- */
  function toggleTalk(ta, btn) {
    if (recog) { recog.stop(); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    let base = ta.value; if (base && !/\s$/.test(base)) base += ' ';
    const r = recog = new SR(); r.lang = 'de-DE'; r.interimResults = true; r.continuous = true;
    r.onresult = e => {
      let s = ''; for (let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript;
      ta.value = base + s; ta.dispatchEvent(new Event('input'));
    };
    const end = () => { if (recog === r) recog = null; btn.textContent = '🎤 Sprechen und aufschreiben lassen'; btn.classList.remove('danger'); };
    r.onend = end; r.onerror = e => { end(); if (e.error === 'not-allowed' || e.error === 'service-not-allowed') alert('Das Mikrofon oder Diktieren ist nicht erlaubt. Tippe auf der Tastatur das Mikrofon an.'); };
    btn.textContent = '⏹ Fertig gesprochen'; btn.classList.add('danger');
    try { r.start(); } catch (e) { end(); }
  }

  /* ---------- Sprachaufnahme ---------- */
  function cleanupRec() {
    clearTimeout(recTimer); recTimer = null;
    if (recStream) { recStream.getTracks().forEach(x => x.stop()); recStream = null; }
    recorder = null; recTask = null;
  }
  function renderRec(t) {
    const box = document.getElementById('recBox'); if (!box) return;
    const r = rec[t.id], recording = recorder && recorder.state === 'recording' && recTask === t.id;
    box.classList.toggle('on', !!recording);
    if (!window.MediaRecorder || !navigator.mediaDevices) { box.innerHTML = '<div class="small muted">Aufnehmen geht auf diesem Gerät nicht.</div>'; return; }
    box.innerHTML = '';
    if (r && !recording) { const au = document.createElement('audio'); au.controls = true; au.src = r.url; box.appendChild(au); }
    const b = document.createElement('button'); b.className = 'btn bigbtn';
    b.textContent = recording ? '⏹ Aufnahme beenden' : r ? '🎙️ Neu aufnehmen' : '🎙️ Aufnahme starten';
    b.onclick = () => recording ? stopRec() : startRec(t);
    box.appendChild(b);
  }
  async function startRec(t) {
    try {
      AR.tts.stop(); speaking = false;
      recStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const types = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']; const mt = types.find(x => MediaRecorder.isTypeSupported(x)) || '';
      recorder = new MediaRecorder(recStream, mt ? { mimeType: mt } : undefined); recChunks = []; recTask = t.id;
      recorder.ondataavailable = e => { if (e.data && e.data.size) recChunks.push(e.data); };
      recorder.onstop = async () => {
        const type = recorder ? (recorder.mimeType || mt || 'audio/mp4') : (mt || 'audio/mp4'), id = recTask;
        const blob = new Blob(recChunks, { type }); cleanupRec();
        if (!id || !blob.size) return;
        if (rec[id]) URL.revokeObjectURL(rec[id].url);
        rec[id] = { buf: await blob.arrayBuffer(), mime: type, url: URL.createObjectURL(blob), ts: 0, acked: false };
        if (curTask() && curTask().id === id) renderRec(curTask());
      };
      recorder.start(); recTimer = setTimeout(stopRec, 90000); renderRec(t);
    } catch (e) {
      cleanupRec(); renderRec(t); alert('Das Mikrofon ist nicht erlaubt. Bitte in Safari das Mikrofon für diese Seite erlauben.');
    }
  }
  function stopRec() { if (recorder && recorder.state === 'recording') recorder.stop(); }

  /* ---------- Abschicken ---------- */
  function submit(t) {
    if (recog) { try { recog.stop(); } catch (e) { /* egal */ } }
    if (recorder && recorder.state === 'recording') { stopRec(); setTimeout(() => submit(t), 400); return; }
    const ta = document.getElementById('ans'); const text = ta ? ta.value.trim() : '';
    const r = rec[t.id];
    if (!text && !r) { alert('Schreibe etwas oder nimm etwas auf.'); return; }
    const ts = Date.now();
    A.answers[t.id] = { text, ts, acked: false, audio: !!r }; if (r) { r.ts = ts; r.acked = false; }
    saveA(); sendAnswer(t.id); renderStatus();
    const b = document.getElementById('bSend'); b.textContent = '✓ Gesendet. Antwort ändern und nochmal abschicken?';
    if (st.pace === 'self' && curIdx() < st.tasks.length - 1) setTimeout(() => { if (curTask() && curTask().id === t.id) { ownIdx++; render(true); } }, 900);
  }

  /* ---------- Anmeldung (ohne Konto) ---------- */
  function renderJoin() {
    const room = hashRoom || (me && me.room) || '';
    let name = AR.pseudonym();
    app.innerHTML = '<div class="center" style="width:100%"><div style="font-size:3.5rem">✍️</div><h1>Antwort-Runde</h1>' +
      '<p class="muted">Dein Name in dieser Runde:</p><div class="big" id="nm" style="font-weight:800"></div>' +
      '<p><button class="btn small" id="bRoll">🎲 anderer Name</button></p>' +
      (room ? '<p class="muted">Raum <b>' + room + '</b></p>' : '<p class="muted">Code von der Lehrkraft:</p><p><input id="code" maxlength="4" size="5" autocapitalize="characters" autocomplete="off" style="font-size:2rem;text-align:center;letter-spacing:.2em;text-transform:uppercase"></p>') +
      '<button class="btn primary bigbtn" id="bGo" style="width:100%">Los geht’s</button></div>';
    const nm = document.getElementById('nm'); nm.textContent = name;
    document.getElementById('bRoll').onclick = () => { name = AR.pseudonym(); nm.textContent = name; };
    document.getElementById('bGo').onclick = () => {
      const code = room || (document.getElementById('code').value || '').toUpperCase().replace(/[^A-Z]/g, '');
      if (code.length !== 4) { alert('Der Code hat 4 Buchstaben.'); return; }
      me = { pid: AR.rid(10), name, room: code }; AR.store.set(KID, me); interacted = true; app.innerHTML = ''; connect(); render();
    };
  }

  /* ---------- Start ---------- */
  if (me && hashRoom && hashRoom !== me.room) { me = Object.assign({}, me, { room: hashRoom }); AR.store.set(KID, me); }
  if (me) { connect(); render(); } else renderJoin();
  addEventListener('hashchange', () => { if (me && hashRoom && hashRoom !== me.room) location.reload(); });
})();
