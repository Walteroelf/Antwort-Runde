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
  const timg = {};                               // taskId -> {ts, url}: Bild zur Aufgabe
  const photo = {};                              // taskId -> {buf, url, sent}: Foto-Antwort dieses Kindes
  const rec = {};                                // taskId -> {buf, mime, url, ts, acked}
  let gate = null;                                // 'wait' | 'refused' | 'end'
  let net = null, st = null, ownIdx = 0, shownId = null, shownSig = '', interacted = false, speaking = false;
  let recorder = null, recStream = null, recTimer = null, recChunks = [], recTask = null, recog = null;

  const hashRoom = (AR.hashParams().get('r') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  const saveA = () => { A.touched = Date.now(); AR.store.set(ANS, A); };
  // Alte Entwürfe und Antworten verfallen nach 24 Stunden auf diesem iPad
  if (A.touched && Date.now() - A.touched > 864e5) { A = { round: '', answers: {}, drafts: {} }; AR.store.del(ANS); AR.store.del(KID); me = null; }
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
    if (d.t === 'wait') { gate = 'wait'; render(true); return; }
    if (d.t === 'refused') { gate = 'refused'; if (net) net.close(); render(true); return; }
    if (d.t === 'end') { endRound(); return; }
    if (d.t === 'adopt' && d.pid && me) {   // Lehrkraft ordnet dieses iPad einem bekannten Kind zu
      me.pid = String(d.pid).slice(0, 20); me.name = String(d.name || me.name).slice(0, 40); AR.store.set(KID, me); showName();
      if (net) net.send({ t: 'hello', pid: me.pid, name: me.name });
      return;
    }
    if (d.t === 'state') {
      if (gate === 'wait') { gate = null; shownSig = ''; }
      if (A.round !== d.round) { A = { round: d.round, answers: {}, drafts: {} }; for (const k in rec) delete rec[k]; for (const k in photo) delete photo[k]; saveA(); }
      const first = !st; st = d; askVoices(); render(first);
    } else if (d.t === 'taskimage') {
      if (timg[d.task]) URL.revokeObjectURL(timg[d.task].url);
      timg[d.task] = { ts: d.ts, url: URL.createObjectURL(new Blob([d.img], { type: d.mime || 'image/jpeg' })) };
      const t = curTask(); if (t && t.id === d.task) fillTaskImg(t);
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
  function endRound() {
    stopAll(); if (net) { net.close(); net = null; }
    A = { round: '', answers: {}, drafts: {} }; AR.store.del(ANS); AR.store.del(KID);
    for (const k in rec) { try { URL.revokeObjectURL(rec[k].url); } catch (e) { /* egal */ } delete rec[k]; }
    for (const k in photo) { try { URL.revokeObjectURL(photo[k].url); } catch (e) { /* egal */ } delete photo[k]; }
    for (const k in timg) { try { URL.revokeObjectURL(timg[k].url); } catch (e) { /* egal */ } delete timg[k]; }
    for (const k in voice) { try { URL.revokeObjectURL(voice[k].url); } catch (e) { /* egal */ } delete voice[k]; }
    me = null; st = null; gate = 'end'; shownSig = ''; shownId = null;
    document.getElementById('nm').hidden = true; document.getElementById('stat').hidden = true; render(true);
  }
  function renderGate() {
    const box = (ic, h, p, btn) => '<div class="warten"><div class="bild">' + AR.icon(ic) + '</div><h2>' + h + '</h2><p class="muted" style="margin:0">' + p + '</p>' + (btn || '') + '</div>';
    if (gate === 'wait') app.innerHTML = box('hourglass', 'Einen Moment.', 'Deine Lehrkraft lässt dich gleich herein.');
    else if (gate === 'refused') {
      app.innerHTML = box('lock', 'Diese Runde ist gesperrt.', 'Frage deine Lehrkraft.', '<button class="grossknopf leise" id="bAgain">Nochmal versuchen</button>');
      document.getElementById('bAgain').onclick = () => location.reload();
    } else {
      app.innerHTML = box('check', 'Die Runde ist beendet.', 'Danke! Deine Antworten wurden von diesem iPad gelöscht.', '<button class="grossknopf leise" id="bAgain">Neue Runde beitreten</button>');
      document.getElementById('bAgain').onclick = () => { location.href = location.pathname + AR.netQuery; };
    }
  }
  function fillTaskImg(t) {
    const b = document.getElementById('tImg'); if (!b) return;
    b.innerHTML = timg[t.id] && timg[t.id].ts === t.image ? '<img src="' + timg[t.id].url + '" alt="Bild zur Aufgabe">' : '<p class="muted klein" style="margin:0">Bild lädt …</p>';
  }
  function askVoices() {
    st.tasks.forEach(t => {
      if (t.image && !(timg[t.id] && timg[t.id].ts === t.image) && !asked.has('i' + t.id + '|' + t.image)) { asked.add('i' + t.id + '|' + t.image); net.send({ t: 'needimage', task: t.id }); }
      if (!t.voice) return;
      const key = t.id + '|' + t.voice;
      if ((voice[t.id] && voice[t.id].ts === t.voice) || asked.has(key)) return;
      asked.add(key); net.send({ t: 'needaudio', task: t.id });
    });
  }
  function hasVoice(t) { return !!(t && t.voice); }
  function voiceReady(t) { return hasVoice(t) && voice[t.id] && voice[t.id].ts === t.voice; }
  function resendAll() {
    for (const id in A.answers) { const a = A.answers[id]; if (!a.acked) { if (rec[id]) rec[id].sent = false; if (photo[id]) photo[id].sent = false; sendAnswer(id); } }
  }
  function sendAnswer(id) {
    const a = A.answers[id]; if (!a || !net) return;
    const r = rec[id], ph = photo[id], withAudio = r && !r.sent; if (r) r.sent = true;   // Aufnahme nur einmal übertragen
    net.send({ t: 'answer', pid: me.pid, name: me.name, round: A.round, task: id, text: a.text || '', ts: a.ts,
      audio: withAudio ? r.buf : null, mime: r ? r.mime : '', dropAudio: !r,
      image: ph && !ph.sent ? ph.buf : null, imgMime: 'image/jpeg', dropImage: !ph });
    if (ph) ph.sent = true;
  }

  /* ---------- Aufgaben ---------- */
  function curTask() {
    if (!st || st.current < 0) return null;
    const i = st.pace === 'self' ? Math.min(ownIdx, st.tasks.length - 1) : Math.min(st.current, st.tasks.length - 1);
    return st.tasks[i] || null;
  }
  function curIdx() { return st.pace === 'self' ? Math.min(ownIdx, st.tasks.length - 1) : Math.min(st.current, st.tasks.length - 1); }

  function render(force) {
    if (gate) return renderGate();
    if (!me) return renderJoin();
    if (!st) { app.innerHTML = '<div class="warten"><div class="bild">' + AR.icon('hourglass') + '</div><h2>Ich verbinde …</h2></div>'; return; }
    const t = curTask();
    if (!t) { stopAll(); shownId = null; shownSig = ''; app.innerHTML = '<div class="warten"><div class="bild">' + AR.icon('hourglass') + '</div><h2>Gleich geht es los.</h2><p class="muted" style="margin:0">Warte, bis die Aufgabe kommt.</p></div>'; return; }
    const sig = [t.id, t.text, t.q, t.mode, t.image, t.photo, t.voice, st.pace, st.tasks.length, st.autoSend, st.speech].join('\u0001');
    if (!force && sig === shownSig) return;
    const newTask = t.id !== shownId;
    shownSig = sig; shownId = t.id;
    if (newTask) { flushAuto(); stopAll(); }
    renderTask(t, newTask);
  }

  function renderTask(t, isNew) {
    const i = curIdx(), n = st.tasks.length, self = st.pace === 'self';
    const draft = (A.drafts && A.drafts[t.id]) || (A.answers[t.id] && A.answers[t.id].text) || '';
    const canTalk = !!(st.speech && (window.SpeechRecognition || window.webkitSpeechRecognition));
    const mode = t.mode || 'text', none = mode === 'none';   // 'none': nur lesen und hören, keine Antwort
    const nav = (id, ic, dis, lbl) => '<button class="rundknopf klein" id="' + id + '" aria-label="' + lbl + '"' + (dis ? ' disabled' : '') + '>' + AR.icon(ic) + '</button>';
    let h = '<div class="fortschritt">' + (self && n > 1 ? nav('bPrev', 'left', i < 1, 'Zurück') : '') +
      '<b class="grow">Aufgabe ' + (i + 1) + ' von ' + n + '</b><div class="punkte">' +
      st.tasks.map((x, k) => '<i class="punkt ' + (k === i ? 'jetzt' : (A.answers[x.id] && (A.answers[x.id].text || A.answers[x.id].audio || A.answers[x.id].img) ? 'fertig' : '')) + '"></i>').join('') + '</div>' +
      (self && n > 1 ? nav('bNext', 'right', i >= n - 1, 'Weiter') : '') + '</div>';
    h += '<div class="bildschirm' + (none ? ' nur-lesen' : '') + '"><section class="s-frage"><div class="tresen aufgabe-karte">' + (t.text ? '<p class="t">' + AR.esc(t.text) + '</p>' : '') + (t.image ? '<div id="tImg" class="aufgabe-bild"></div>' : '') + (t.q ? '<p class="q">' + AR.esc(t.q) + '</p>' : '') + '</div>';
    if (hasVoice(t) || (AR.tts.ok && (t.text || t.q))) h += '<button class="grossknopf" id="bRead"></button>';
    h += '</section>';
    if (none) h += '</div>'; else {
    h += '<section class="s-antwort">';
    if (mode !== 'audio') h += '<textarea id="ans" placeholder="Schreibe hier deine Antwort …" autocapitalize="sentences" spellcheck="false"></textarea>';
    if (mode !== 'text' || canTalk || t.photo) {
      h += '<div class="werkzeuge">' + (mode !== 'audio' && canTalk ? '<button class="grossknopf leise" id="bTalk">' + AR.icon('mic') + 'Sprechen</button>' : '') +
        (mode !== 'text' ? '<div class="aufnahme-box' + (mode === 'audio' && !t.photo ? ' voll' : '') + '" id="recBox"></div>' : '') +
        (t.photo ? '<div class="aufnahme-box" id="photoBox"></div>' : '') + '</div>';
    }
    h += '<div id="sendSt"></div>' + (st.autoSend ? '' : '<button class="grossknopf weiter" id="bSend">' + AR.icon('send') + 'Abschicken</button>') + '</section></div>';
    }
    app.innerHTML = h;
    const ta = document.getElementById('ans'); if (ta) { ta.value = draft; ta.oninput = () => { A.drafts[t.id] = ta.value; saveA(); if (st.autoSend) autoSoon(t); }; }
    const bRead = document.getElementById('bRead'); if (bRead) bRead.onclick = () => toggleRead(t);
    const bTalk = document.getElementById('bTalk'); if (bTalk) bTalk.onclick = () => toggleTalk(ta, bTalk);
    const bs = document.getElementById('bSend'); if (bs) bs.onclick = () => submit(t);
    if (document.getElementById('recBox')) renderRec(t);
    if (document.getElementById('photoBox')) renderPhoto(t);
    fillTaskImg(t);
    const p = document.getElementById('bPrev'), nx = document.getElementById('bNext');
    if (p) p.onclick = () => { ownIdx = Math.max(0, ownIdx - 1); render(true); };
    if (nx) nx.onclick = () => { ownIdx = Math.min(n - 1, ownIdx + 1); render(true); };
    renderStatus(); updateReadBtn(t);
    if (isNew && st.autoRead && interacted) { const b = document.getElementById('bRead'); if (b) { b._wantAuto = true; setTimeout(() => updateReadBtn(t), 300); } }
  }

  /* ---------- Foto als Antwort ---------- */
  function renderPhoto(t) {
    const box = document.getElementById('photoBox'); if (!box) return;
    const ph = photo[t.id]; box.innerHTML = '';
    if (ph) { const im = document.createElement('img'); im.src = ph.url; im.alt = 'Dein Foto'; im.className = 'foto-klein'; box.appendChild(im); }
    const b = document.createElement('button'); b.className = 'grossknopf leise';
    b.innerHTML = AR.icon('camera') + (ph ? 'Neues Foto' : 'Foto');
    b.onclick = () => AR.pickImage(async f => {
      try {
        const blob = await AR.shrinkImage(f, 1280, 0.82); if (!blob) return;
        if (photo[t.id]) URL.revokeObjectURL(photo[t.id].url);
        photo[t.id] = { buf: await blob.arrayBuffer(), url: URL.createObjectURL(blob), sent: false };
        if (curTask() && curTask().id === t.id) renderPhoto(t);
        if (st && st.autoSend) autoSubmit(t.id);
      } catch (e) { alert('Das Foto konnte nicht gelesen werden.'); }
    });
    box.appendChild(b);
  }

  function renderStatus() {
    const el = document.getElementById('sendSt'), t = curTask(); if (!el || !t) return;
    const a = A.answers[t.id];
    if (st.autoSend) {
      el.innerHTML = !a ? '<p class="muted klein hinweis-klein">Deine Lehrkraft sieht deine Antwort sofort. Du musst nichts abschicken.</p>' : a.acked ? '<div class="meldung gut">' + AR.icon('check') + 'Deine Lehrkraft sieht deine Antwort.</div>' : '<div class="meldung warte">' + AR.icon('hourglass') + 'Wird gesendet …</div>';
      return;
    }
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
    const end = () => { if (recog === r) recog = null; btn.innerHTML = AR.icon('mic') + 'Sprechen'; btn.classList.remove('aufnahme'); };
    r.onend = end; r.onerror = e => { end(); if (e.error === 'not-allowed' || e.error === 'service-not-allowed') alert('Das Mikrofon oder Diktieren ist nicht erlaubt. Tippe auf der Tastatur das Mikrofon an.'); };
    btn.innerHTML = AR.icon('stop') + 'Fertig'; btn.classList.add('aufnahme');
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
    b.innerHTML = recording ? AR.icon('stop') + 'Beenden' : r ? AR.icon('rec') + 'Neu aufnehmen' : AR.icon('rec') + 'Aufnahme';
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
        rec[id] = { buf: await blob.arrayBuffer(), mime: type, url: URL.createObjectURL(blob), ts: 0, acked: false, sent: false };
        if (curTask() && curTask().id === id) renderRec(curTask());
        if (st && st.autoSend) autoSubmit(id);
      };
      recorder.start(); recTimer = setTimeout(stopRec, 90000); renderRec(t);
    } catch (e) {
      cleanupRec(); renderRec(t); alert('Das Mikrofon ist nicht erlaubt. Bitte in Safari das Mikrofon für diese Seite erlauben.');
    }
  }
  function stopRec() { if (recorder && recorder.state === 'recording') recorder.stop(); }

  /* ---------- Sofort übertragen (Lehrkraft hat „ohne Abschicken“ eingeschaltet) ---------- */
  let autoTimer = null, autoTask = null;
  function autoSoon(t) { autoTask = t.id; clearTimeout(autoTimer); autoTimer = setTimeout(flushAuto, 700); }
  function flushAuto() { clearTimeout(autoTimer); autoTimer = null; if (autoTask) { const id = autoTask; autoTask = null; autoSubmit(id); } }
  function autoSubmit(id) {
    const text = ((A.drafts && A.drafts[id]) || '').trim(), r = rec[id], ph = photo[id];
    if (!text && !r && !ph && !A.answers[id]) return;       // nichts zu senden
    const ts = Math.max(Date.now(), ((A.answers[id] || {}).ts || 0) + 1);
    A.answers[id] = { text, ts, acked: false, audio: !!r, img: !!ph }; if (r) { r.ts = ts; r.acked = false; }
    saveA(); sendAnswer(id); if (curTask() && curTask().id === id) renderStatus();
  }
  addEventListener('pagehide', flushAuto);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flushAuto(); });

  /* ---------- Abschicken ---------- */
  function submit(t) {
    if (recog) { try { recog.stop(); } catch (e) { /* egal */ } }
    if (recorder && recorder.state === 'recording') { stopRec(); setTimeout(() => submit(t), 400); return; }
    const ta = document.getElementById('ans'); const text = ta ? ta.value.trim() : '';
    const r = rec[t.id], ph = photo[t.id];
    if (!text && !r && !ph) { alert('Schreibe etwas, nimm etwas auf oder mach ein Foto.'); return; }
    const ts = Date.now();
    A.answers[t.id] = { text, ts, acked: false, audio: !!r, img: !!ph }; if (r) { r.ts = ts; r.acked = false; }
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
