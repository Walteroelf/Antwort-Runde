'use strict';
/* Antwort-Runde: Schüler-iPad. Aufgabe lesen/hören, Antwort schreiben, einsprechen oder aufnehmen. */
(function () {
  const app = document.getElementById('app');
  const KID = 'ar.kid', ANS = 'ar.kid.ans';
  let me = AR.store.get(KID, null);              // {pid, name, room}
  let A = AR.store.get(ANS, { round: '', answers: {}, drafts: {} });  // answers[taskId] = {text, ts, acked, audio}
  const voice = {};                              // taskId -> {ts, url}: Vorlese-Aufnahme der Lehrkraft
  const asked = new Set();
  let vplay = null;
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
      onOpen() { asked.clear(); net.send({ t: 'hello', pid: me.pid, name: me.name }); resendAll(); },
      onData: onData
    });
  }
  function onData(d) {
    if (!d || !d.t) return;
    if (d.t === 'state') {
      if (A.round !== d.round) { A = { round: d.round, answers: {}, drafts: {} }; for (const k in rec) delete rec[k]; saveA(); }
      const first = !st; st = d; askVoices(); render(first);
    } else if (d.t === 'taskaudio') {
      if (voice[d.task]) URL.revokeObjectURL(voice[d.task].url);
      voice[d.task] = { ts: d.ts, url: URL.createObjectURL(new Blob([d.audio], { type: d.mime || 'audio/mp4' })) };
      const t = curTask(); if (t && t.id === d.task) updateReadBtn(t);
    } else if (d.t === 'ack') {
      const a = A.answers[d.task]; if (a && a.ts === d.ts) { a.acked = true; saveA(); }
      if (rec[d.task] && rec[d.task].ts === d.ts) rec[d.task].acked = true;
      if (st && curTask() && curTask().id === d.task) renderStatus();
    }
  }
  function askVoices() {
    st.tasks.forEach(t => {
      if (!t.voice) return;
      const key = t.id + '|' + t.voice;
      if ((voice[t.id] && voice[t.id].ts === t.voice) || asked.has(key)) return;
      asked.add(key); net.send({ t: 'needaudio', task: t.id });
    });
  }
  function hasVoice(t) { return !!(t && t.voice); }
  function voiceReady(t) { return hasVoice(t) && voice[t.id] && voice[t.id].ts === t.voice; }
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
    if (!st) { app.innerHTML = '<div class="warten"><div class="bild">' + AR.icon('hourglass') + '</div><h2>Ich verbinde …</h2></div>'; return; }
    const t = curTask();
    if (!t) { stopAll(); shownId = null; shownSig = ''; app.innerHTML = '<div class="warten"><div class="bild">' + AR.icon('hourglass') + '</div><h2>Gleich geht es los.</h2><p class="muted" style="margin:0">Warte, bis die Aufgabe kommt.</p></div>'; return; }
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
    let h = '<div class="fortschritt"><b>Aufgabe ' + (i + 1) + ' von ' + n + '</b><div class="punkte">' +
      st.tasks.map((x, k) => '<i class="punkt ' + (k === i ? 'jetzt' : (A.answers[x.id] ? 'fertig' : '')) + '"></i>').join('') + '</div></div>';
    h += '<div class="tresen aufgabe-karte">' + (t.text ? '<p class="t">' + AR.esc(t.text) + '</p>' : '') + (t.q ? '<p class="q">' + AR.esc(t.q) + '</p>' : '') + '</div>';
    if (hasVoice(t) || (AR.tts.ok && (t.text || t.q))) h += '<button class="grossknopf" id="bRead"></button>';
    h += '<div class="schritt"><h3>Deine Antwort</h3>';
    if (mode !== 'audio') {
      h += '<textarea id="ans" placeholder="Schreibe hier …" autocapitalize="sentences" spellcheck="false"></textarea>';
      if (canTalk) h += '<button class="grossknopf leise" id="bTalk">' + AR.icon('mic') + 'Sprechen, ich schreibe es auf</button>';
      else h += '<p class="muted klein" style="margin:0">Tipp: Tippe auf der Tastatur auf das Mikrofon, dann kannst du sprechen.</p>';
    }
    if (mode !== 'text') h += '<div class="aufnahme-box" id="recBox"></div>';
    h += '</div><button class="grossknopf weiter" id="bSend">' + AR.icon('send') + 'Abschicken</button><div id="sendSt"></div>';
    if (self && n > 1) {
      h += '<div class="knopfreihe"><button class="grossknopf leise" id="bPrev"' + (i < 1 ? ' disabled' : '') + '>' + AR.icon('left') + 'Zurück</button>' +
        '<button class="grossknopf leise" id="bNext"' + (i >= n - 1 ? ' disabled' : '') + '>Weiter' + AR.icon('right') + '</button></div>';
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
    renderStatus(); updateReadBtn(t);
    if (isNew && st.autoRead && interacted) { const b = document.getElementById('bRead'); if (b) { b._wantAuto = true; setTimeout(() => updateReadBtn(t), 300); } }
  }

  function renderStatus() {
    const el = document.getElementById('sendSt'), t = curTask(); if (!el || !t) return;
    const a = A.answers[t.id];
    el.innerHTML = !a ? '' : a.acked ? '<div class="meldung gut">' + AR.icon('check') + 'Geschickt. Deine Lehrkraft hat es bekommen.</div>' : '<div class="meldung warte">' + AR.icon('hourglass') + 'Wird gesendet …</div>';
    const b = document.getElementById('bSend'); if (b && a) b.innerHTML = AR.icon('send') + 'Nochmal abschicken';
  }

  /* ---------- Vorlesen ---------- */
  function updateReadBtn(t) {
    const b = document.getElementById('bRead'); if (!b) return;
    const wait = hasVoice(t) && !voiceReady(t);
    b.disabled = wait; b.innerHTML = wait ? AR.icon('hourglass') + 'Aufnahme lädt …' : speaking ? AR.icon('stop') + 'Stopp' : AR.icon('speaker') + 'Vorlesen';
    if (!wait && !b._autoDone && t.id === shownId && b._wantAuto) { b._autoDone = true; toggleRead(t, true); }
  }
  function endSpeak() { speaking = false; const bb = document.getElementById('bRead'); if (bb && !bb.disabled) bb.innerHTML = AR.icon('speaker') + 'Vorlesen'; }
  function toggleRead(t, autostart) {
    const b = document.getElementById('bRead');
    if (speaking && !autostart) { stopSpeech(); if (b) b.innerHTML = AR.icon('speaker') + 'Vorlesen'; return; }
    if (hasVoice(t)) {
      if (!voiceReady(t)) return;
      stopSpeech(); speaking = true; if (b) b.innerHTML = AR.icon('stop') + 'Stopp';
      vplay = new Audio(voice[t.id].url); vplay.onended = vplay.onerror = endSpeak;
      vplay.play().catch(endSpeak);
      return;
    }
    speaking = true; if (b) b.innerHTML = AR.icon('stop') + 'Stopp';
    AR.tts.speak([t.text, t.q], st.rate, endSpeak);
  }
  function stopSpeech() { AR.tts.stop(); if (vplay) { vplay.onended = vplay.onerror = null; vplay.pause(); vplay = null; } speaking = false; }
  function stopAll() {
    stopSpeech();
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
    const end = () => { if (recog === r) recog = null; btn.innerHTML = AR.icon('mic') + 'Sprechen, ich schreibe es auf'; btn.classList.remove('aufnahme'); };
    r.onend = end; r.onerror = e => { end(); if (e.error === 'not-allowed' || e.error === 'service-not-allowed') alert('Das Mikrofon oder Diktieren ist nicht erlaubt. Tippe auf der Tastatur das Mikrofon an.'); };
    btn.innerHTML = AR.icon('stop') + 'Fertig gesprochen'; btn.classList.add('aufnahme');
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
    if (!window.MediaRecorder || !navigator.mediaDevices) { box.innerHTML = '<p class="muted klein" style="margin:0">Aufnehmen geht auf diesem Gerät nicht.</p>'; return; }
    box.innerHTML = '';
    if (r && !recording) { const au = document.createElement('audio'); au.controls = true; au.src = r.url; box.appendChild(au); }
    const b = document.createElement('button'); b.className = 'grossknopf leise' + (recording ? ' aufnahme' : '');
    b.innerHTML = recording ? AR.icon('stop') + 'Aufnahme beenden' : r ? AR.icon('rec') + 'Neu aufnehmen' : AR.icon('rec') + 'Aufnahme starten';
    b.onclick = () => recording ? stopRec() : startRec(t);
    box.appendChild(b);
  }
  async function startRec(t) {
    try {
      stopSpeech();
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
    
    if (st.pace === 'self' && curIdx() < st.tasks.length - 1) setTimeout(() => { if (curTask() && curTask().id === t.id) { ownIdx++; render(true); } }, 900);
  }

  /* ---------- Anmeldung (ohne Konto) ---------- */
  function renderJoin() {
    const room = hashRoom || (me && me.room) || '';
    let name = AR.pseudonym();
    document.getElementById('nm').hidden = true;
    app.innerHTML = '<div class="warten"><div class="bild">' + AR.icon('pen') + '</div><h2>Hallo!</h2>' +
      '<p class="muted" style="margin:0">So heißt du in dieser Runde:</p><div class="namensschild" id="nmBig"></div>' +
      '<button class="mittelknopf" id="bRoll">' + AR.icon('dice') + 'Anderer Name</button>' +
      (room ? '' : '<label class="feld" style="justify-items:center">Code von der Lehrkraft<input id="code" maxlength="4" size="5" autocapitalize="characters" autocomplete="off" style="font-size:32px;text-align:center;letter-spacing:.2em;text-transform:uppercase;width:200px"></label>') +
      '<button class="grossknopf weiter" id="bGo" style="margin-top:8px">Los geht’s' + AR.icon('right') + '</button></div>';
    const nm = document.getElementById('nmBig'); nm.textContent = name;
    document.getElementById('bRoll').onclick = () => { name = AR.pseudonym(); nm.textContent = name; };
    document.getElementById('bGo').onclick = () => {
      const code = room || (document.getElementById('code').value || '').toUpperCase().replace(/[^A-Z]/g, '');
      if (code.length !== 4) { alert('Der Code hat 4 Buchstaben.'); return; }
      me = { pid: AR.rid(10), name, room: code }; AR.store.set(KID, me); interacted = true; showName(); app.innerHTML = ''; connect(); render();
    };
  }
  function showName() { const n = document.getElementById('nm'); if (me) { n.textContent = me.name; n.hidden = false; document.getElementById('stat').hidden = false; } }

  /* ---------- Start ---------- */
  if (me && hashRoom && hashRoom !== me.room) { me = Object.assign({}, me, { room: hashRoom }); AR.store.set(KID, me); }
  if (me) { showName(); connect(); render(); } else renderJoin();
  addEventListener('hashchange', () => { if (me && hashRoom && hashRoom !== me.room) location.reload(); });
})();
