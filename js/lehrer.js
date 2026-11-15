'use strict';
/* Antwort-Runde: Lehrer-Gerät. Hält den Raum, verteilt Aufgaben, sammelt Antworten.
   Drei Reiter: 1 Aufgaben vorbereiten, 2 Durchführen (live), 3 Antworten (Auswertung). */
(function () {
  const $ = id => document.getElementById(id);
  const KEY = 'ar.teacher.' + (AR.NET === 'bc' ? 'bc' : 'p');
  const defaults = () => ({ room: AR.genCode(4), round: AR.rid(6), tasks: [], current: -1, pace: 'live', rate: 0.9, autoRead: true, names: {}, showNames: false, autoSend: false, pupils: {}, answers: {} });
  let S = Object.assign(defaults(), AR.store.get(KEY, {}));
  if (!S.tasks.length) S.tasks.push(newTask());

  const conns = new Map();     // conn -> pid
  const online = new Set();    // pid
  const audio = new Map();     // 'task|pid' -> {blob}
  const urls = new Map();      // 'task|pid' -> Objekt-URL (damit Player nicht neu laden)
  const voices = new Map();    // taskId -> {blob, ts}: Vorlese-Aufnahmen der Lehrkraft
  let vrec = null;             // laufende Aufnahme {task, recorder, stream, chunks, timer}
  let host = null, takenTries = 0;
  let view = 'aufgaben', openTask = null, vi = Math.max(0, S.current), openAns = new Set(), fresh = null, pendingDraw = false;

  function newTask() { return { id: AR.rid(6), text: '', q: '', mode: 'text', voice: 0 }; }
  function save() { AR.store.set(KEY, S); }
  const MODES = { text: 'Text', both: 'Text oder Aufnahme', audio: 'Aufnahme' };

  /* ---------- Audio-Ablage (IndexedDB, mit Notlösung im Speicher) ---------- */
  const idb = {
    db: null,
    open() {
      return new Promise(res => {
        try {
          const r = indexedDB.open('antwort-runde', 1);
          r.onupgradeneeded = () => r.result.createObjectStore('a');
          r.onsuccess = () => { this.db = r.result; res(); };
          r.onerror = () => res();
        } catch (e) { res(); }
      });
    },
    put(k, v) { try { if (this.db) this.db.transaction('a', 'readwrite').objectStore('a').put(v, k); } catch (e) { /* egal */ } },
    del(k) { try { if (this.db) this.db.transaction('a', 'readwrite').objectStore('a').delete(k); } catch (e) { /* egal */ } },
    all() {
      return new Promise(res => {
        if (!this.db) return res([]);
        try {
          const out = [], req = this.db.transaction('a').objectStore('a').openCursor();
          req.onsuccess = () => { const c = req.result; if (c) { out.push([c.key, c.value]); c.continue(); } else res(out); };
          req.onerror = () => res(out);
        } catch (e) { res([]); }
      });
    },
    // Antwort-Aufnahmen löschen, Vorlese-Aufnahmen ('v|…') bleiben
    clear() {
      try {
        if (!this.db) return;
        const os = this.db.transaction('a', 'readwrite').objectStore('a'), req = os.openCursor();
        req.onsuccess = () => { const c = req.result; if (c) { if (!String(c.key).startsWith('v|')) c.delete(); c.continue(); } };
      } catch (e) { /* egal */ }
    }
  };

  /* ---------- Hilfen ---------- */
  // Klarnamen erscheinen nur, wenn "Klarnamen anzeigen" an ist (oder beim Export ausdrücklich gewählt)
  function label(pid, forceNames) {
    const p = S.pupils[pid] || {}; const n = (S.names[pid] || '').trim();
    return n && (forceNames === undefined ? S.showNames : forceNames) ? n + ' (' + (p.name || pid) + ')' : (p.name || pid);
  }
  function nameToggle() {
    const b = el('button', 'mittelknopf klein', AR.icon('users') + 'Klarnamen: ' + (S.showNames ? 'an' : 'aus'));
    b.setAttribute('aria-pressed', S.showNames ? 'true' : 'false');
    if (S.showNames) b.classList.add('primaer');
    b.onclick = () => { S.showNames = !S.showNames; save(); redrawAll(); };
    return b;
  }
  let drawTimer = null;
  // Antworten können beim Tippen sehr oft eintreffen: höchstens ein Neuzeichnen alle 200 ms
  function scheduleDraw() { if (drawTimer) return; drawTimer = setTimeout(() => { drawTimer = null; drawHead(); drawKinder(); drawLive(); drawAus(); }, 200); }
  function redrawAll() { drawKinder(); drawLive(); drawAus(); }
  const byLabel = (a, b) => label(a).localeCompare(label(b), 'de');
  function stateMsg() { return { t: 'state', round: S.round, tasks: S.tasks, current: S.current, pace: S.pace, rate: S.rate, autoRead: S.autoRead, autoSend: !!S.autoSend }; }
  function broadcast() { conns.forEach((pid, c) => c.send(stateMsg())); }
  let pushTimer = null;
  function pushSoon() { clearTimeout(pushTimer); pushTimer = setTimeout(broadcast, 350); }
  function studentUrl() { const u = new URL('schueler.html', location.href); return u.origin + u.pathname + AR.netQuery + '#r=' + S.room; }
  function preview(t) { const s = (t.q || t.text || '').replace(/\s+/g, ' ').trim(); return s || ''; }
  function nAnswers(id) { return Object.keys(S.answers[id] || {}).length; }
  function total() { return S.tasks.reduce((n, t) => n + nAnswers(t.id), 0); }
  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function audioUrl(key) { if (!urls.has(key)) urls.set(key, URL.createObjectURL(audio.get(key).blob)); return urls.get(key); }

  /* ---------- Verbindung ---------- */
  function startHost() {
    if (host) host.close();
    host = AR.hostRoom(S.room, {
      onStatus(s) {
        const ok = s === 'open';
        $('netDot').className = 'dot ' + (ok ? 'ok' : s === 'connecting' ? 'warn' : 'bad');
        netState = ok ? 'ok' : s === 'connecting' ? 'verbinde …' : 'Verbindungsproblem';
        drawHead();
      },
      onOpen() { takenTries = 0; },
      onTaken() {
        netState = 'Code noch belegt …'; drawHead();
        if (++takenTries > 6) { takenTries = 0; S.room = AR.genCode(4); save(); drawHead(); }
        setTimeout(startHost, 4000);
      },
      onConn(c) {
        c.on('data', d => onData(c, d));
        c.on('close', () => { const pid = conns.get(c); conns.delete(c); if (pid && ![...conns.values()].includes(pid)) online.delete(pid); drawHead(); drawKinder(); drawLive(); });
      }
    });
  }
  let netState = 'verbinde …';

  function onData(c, d) {
    if (!d || !d.t) return;
    if (d.t === 'hello' && d.pid) {
      conns.set(c, d.pid); online.add(d.pid);
      S.pupils[d.pid] = { name: String(d.name || d.pid).slice(0, 40), last: Date.now() };
      save(); c.send(stateMsg()); drawHead(); drawKinder(); drawLive(); drawAus();
    } else if (d.t === 'needaudio' && d.task) {
      const v = voices.get(d.task);
      if (v) v.blob.arrayBuffer().then(buf => c.send({ t: 'taskaudio', task: d.task, ts: v.ts, audio: buf, mime: v.blob.type || 'audio/mp4' }));
    } else if (d.t === 'answer' && d.pid && d.task) {
      const ack = () => c.send({ t: 'ack', task: d.task, ts: d.ts });
      if (d.round !== S.round || !S.tasks.some(t => t.id === d.task)) { ack(); return; }
      const pid = d.pid;
      if (!S.pupils[pid]) S.pupils[pid] = { name: String(d.name || pid).slice(0, 40) };
      S.pupils[pid].last = Date.now();
      const key = d.task + '|' + pid;
      const prev = (S.answers[d.task] || {})[pid];
      if (prev && prev.ts > d.ts) { ack(); return; }
      const gone = !String(d.text || '').trim() && !(d.audio && (d.audio.byteLength || d.audio.size)) && (!prev || !prev.audio || d.dropAudio);
      if (gone) { if (S.answers[d.task]) delete S.answers[d.task][pid]; save(); ack(); scheduleDraw(); return; }
      let hasAudio = false;
      if (d.audio && (d.audio.byteLength || d.audio.size)) {
        const blob = new Blob([d.audio], { type: d.mime || 'audio/mp4' });
        if (urls.has(key)) { URL.revokeObjectURL(urls.get(key)); urls.delete(key); }
        audio.set(key, { blob }); idb.put(S.round + '|' + key, { blob }); hasAudio = true;
      } else if (prev && prev.audio && !d.dropAudio) hasAudio = true;
      (S.answers[d.task] = S.answers[d.task] || {})[pid] = { text: String(d.text || '').slice(0, 5000), audio: hasAudio, mime: d.mime || '', ts: d.ts || Date.now() };
      if (!prev) fresh = key;
      save(); ack(); scheduleDraw();
    }
  }

  /* ---------- Kopf, Dialoge ---------- */
  function drawHead() {
    $('pillTxt').textContent = netState === 'ok' ? online.size + ' online' : netState;
    $('codeTxt').textContent = S.room;
    const n = total(); $('ansN').hidden = !n; $('ansN').textContent = n;
  }
  function drawCode() {
    $('codeBig').textContent = S.room;
    $('qr').innerHTML = ''; const q = AR.makeQR(studentUrl()); if (q) $('qr').appendChild(q);
    $('linkTxt').textContent = AR.NET === 'bc' ? 'Testbetrieb (?net=bc)' : '';
  }
  function drawKinder() {
    const box = $('pupils'), ids = Object.keys(S.pupils);
    if (!$('dKinder').open) return;
    if (box.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') {
      box.querySelectorAll('.kind-zeile').forEach(r => { r.firstChild.className = 'dot ' + (online.has(r.dataset.pid) ? 'ok' : ''); }); return;
    }
    $('kTog').innerHTML = ''; $('kTog').appendChild(nameToggle());
    box.innerHTML = '';
    if (!ids.length) { box.appendChild(el('p', 'leer', 'Noch niemand verbunden.')); return; }
    ids.sort(byLabel).forEach(pid => {
      const r = el('div', 'kind-zeile'); r.dataset.pid = pid;
      r.innerHTML = '<span class="dot ' + (online.has(pid) ? 'ok' : '') + '"></span><span class="n">' + AR.esc(S.pupils[pid].name) + '</span>';
      const inp = el('input'); inp.placeholder = 'Echter Name'; inp.value = S.names[pid] || '';
      inp.onchange = () => { S.names[pid] = inp.value; save(); drawLive(); drawAus(); drawKinder(); };
      r.appendChild(inp); box.appendChild(r);
    });
  }
  function drawSettings() {
    document.querySelectorAll('#pace button').forEach(b => b.classList.toggle('an', b.dataset.v === S.pace));
    $('autoRead').checked = !!S.autoRead; $('autoSend').checked = !!S.autoSend; $('rate').value = String(S.rate);
    $('paceHelp').textContent = S.pace === 'self' ? 'Die Kinder blättern selbst durch alle Aufgaben.' : 'Alle Kinder sehen immer die Aufgabe, die du freigibst.';
  }

  /* ---------- Reiter ---------- */
  function showView(v) {
    view = v;
    document.querySelectorAll('#reiter button').forEach(b => b.classList.toggle('an', b.dataset.v === v));
    $('vAufgaben').hidden = v !== 'aufgaben'; $('vLive').hidden = v !== 'live'; $('vAus').hidden = v !== 'aus';
    if (v === 'aufgaben') drawTasks(); if (v === 'live') drawLive(); if (v === 'aus') drawAus();
  }

  /* ---------- 1 Aufgaben ---------- */
  function drawTasks() {
    if (view !== 'aufgaben') return;
    const box = $('tasks'); box.innerHTML = '';
    S.tasks.forEach((t, i) => {
      const row = el('div', 'zeile' + (openTask === t.id ? ' offen' : ''));
      const head = el('button', 'kopfzeile');
      const p = preview(t);
      head.innerHTML = '<span class="nr">' + (i + 1) + '</span><span class="vorschau' + (p ? '' : ' leer') + '">' + AR.esc(p || 'Noch leer') + '</span>' +
        (t.voice ? '<span class="marke">' + AR.icon('mic') + ' Stimme</span>' : '') +
        '<span class="marke">' + MODES[t.mode || 'text'] + '</span><span class="dreh">' + AR.icon('down') + '</span>';
      head.onclick = () => { openTask = openTask === t.id ? null : t.id; drawTasks(); };
      row.appendChild(head);
      if (openTask === t.id) row.appendChild(taskEditor(t, i, head.querySelector('.vorschau')));
      box.appendChild(row);
    });
  }

  function taskEditor(t, i, prevEl) {
    const e = el('div', 'inhalt');
    e.innerHTML =
      '<label class="feld">Text zum Vorlesen (optional)<textarea data-f="text" rows="3"></textarea></label>' +
      '<label class="feld">Frage (optional)<textarea data-f="q" rows="2" style="min-height:64px"></textarea></label>' +
      '<label class="feld">Die Kinder antworten per<select data-f="mode">' +
      '<option value="text">Schreiben oder Einsprechen (wird Text)</option>' +
      '<option value="both">Text oder Sprachaufnahme</option>' +
      '<option value="audio">nur Sprachaufnahme</option></select></label>' +
      '<div class="stimme"></div>' +
      '<div class="reihe"><button class="mittelknopf primaer" data-a="show">' + AR.icon('play') + 'Jetzt zeigen</button><span class="platz"></span>' +
      '<button class="mittelknopf klein" data-a="up" aria-label="Nach oben">' + AR.icon('up') + '</button>' +
      '<button class="mittelknopf klein" data-a="down" aria-label="Nach unten">' + AR.icon('down') + '</button>' +
      '<button class="mittelknopf klein warnung" data-a="del">' + AR.icon('trash') + 'Löschen</button></div>';
    e.querySelector('[data-f=text]').value = t.text; e.querySelector('[data-f=q]').value = t.q; e.querySelector('[data-f=mode]').value = t.mode || 'text';
    drawVoice(e.querySelector('.stimme'), t);
    e.oninput = e.onchange = ev => {
      const f = ev.target.dataset.f; if (!f) return;
      t[f] = ev.target.value; save(); pushSoon();
      const p = preview(t); prevEl.textContent = p || 'Noch leer'; prevEl.classList.toggle('leer', !p);
      if (f === 'mode') { drawTasks(); }
    };
    e.onclick = ev => {
      const b = ev.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a;
      if (a === 'show') { vi = i; if (S.pace === 'live') setCurrent(i); else setCurrent(Math.max(S.current, 0)); showView('live'); return; }
      if (a === 'del') {
        const has = nAnswers(t.id);
        if (has && !confirm('Zu dieser Aufgabe gibt es ' + has + ' Antworten. Wirklich löschen?')) return;
        if (vrec && vrec.task === t.id) stopVRec(true);
        voices.delete(t.id); idb.del('v|' + t.id);
        S.tasks.splice(i, 1); delete S.answers[t.id]; openTask = null; if (!S.tasks.length) S.tasks.push(newTask());
        if (S.current >= S.tasks.length) S.current = S.tasks.length - 1;
        vi = Math.min(vi, S.tasks.length - 1);
      }
      if (a === 'up' && i > 0) [S.tasks[i - 1], S.tasks[i]] = [S.tasks[i], S.tasks[i - 1]];
      if (a === 'down' && i < S.tasks.length - 1) [S.tasks[i + 1], S.tasks[i]] = [S.tasks[i], S.tasks[i + 1]];
      save(); broadcast(); drawTasks(); drawHead();
    };
    return e;
  }

  /* ---------- Vorlese-Aufnahme der Lehrkraft ---------- */
  function drawVoice(box, t) {
    box.innerHTML = '';
    const v = voices.get(t.id), now = vrec && vrec.task === t.id;
    const mk = (ic, txt, cls, fn) => { const b = el('button', 'mittelknopf ' + (cls || ''), AR.icon(ic) + txt); b.onclick = fn; return b; };
    box.appendChild(el('b', null, 'Mit eigener Stimme vorlesen'));
    if (!window.MediaRecorder || !navigator.mediaDevices) { box.appendChild(el('span', 'muted klein', 'Aufnehmen geht auf diesem Gerät nicht.')); return; }
    if (now) {
      const r = el('div', 'reihe'); r.appendChild(el('b', null, '<span class="dot bad"></span> Aufnahme läuft …'));
      r.appendChild(mk('stop', 'Fertig', 'primaer', () => stopVRec())); box.appendChild(r); return;
    }
    if (t.voice && v) {
      const au = el('audio'); au.controls = true; au.src = URL.createObjectURL(v.blob); box.appendChild(au);
      const r = el('div', 'reihe');
      r.appendChild(mk('rec', 'Neu aufnehmen', '', () => startVRec(t)));
      r.appendChild(mk('trash', 'Löschen', 'warnung', () => { t.voice = 0; voices.delete(t.id); idb.del('v|' + t.id); save(); broadcast(); drawTasks(); }));
      box.appendChild(r);
      box.appendChild(el('span', 'muted klein', 'Die Kinder hören deine Aufnahme statt der iPad-Stimme. Sprich Text und Frage in einer Aufnahme.'));
      return;
    }
    box.appendChild(mk('rec', 'Aufnahme starten', '', () => startVRec(t)));
    box.appendChild(el('span', 'muted klein', t.voice ? 'Die Aufnahme fehlt auf diesem Gerät. Bitte neu aufnehmen.' : 'Ohne Aufnahme liest die iPad-Stimme vor.'));
  }
  async function startVRec(t) {
    if (vrec) stopVRec(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const types = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']; const mt = types.find(x => MediaRecorder.isTypeSupported(x)) || '';
      const recorder = new MediaRecorder(stream, mt ? { mimeType: mt } : undefined);
      const r = vrec = { task: t.id, recorder, stream, chunks: [], timer: null, discard: false };
      recorder.ondataavailable = e => { if (e.data && e.data.size) r.chunks.push(e.data); };
      recorder.onstop = () => {
        clearTimeout(r.timer); stream.getTracks().forEach(x => x.stop());
        if (vrec === r) vrec = null;
        const blob = new Blob(r.chunks, { type: recorder.mimeType || mt || 'audio/mp4' });
        if (!r.discard && blob.size) {
          const ts = Date.now(); voices.set(t.id, { blob, ts }); idb.put('v|' + t.id, { blob, ts }); t.voice = ts; save(); broadcast();
        }
        drawTasks();
      };
      recorder.start(); r.timer = setTimeout(() => stopVRec(), 180000); drawTasks();
    } catch (e) { vrec = null; drawTasks(); alert('Das Mikrofon ist nicht erlaubt. Bitte im Browser das Mikrofon für diese Seite erlauben.'); }
  }
  function stopVRec(discard) { if (vrec && vrec.recorder.state === 'recording') { vrec.discard = !!discard; vrec.recorder.stop(); } }

  /* ---------- Antworten anzeigen (gemeinsam für Reiter 2 und 3) ---------- */
  function anyPlaying() { return [...document.querySelectorAll('#vLive audio, #vAus audio')].some(a => !a.paused && !a.ended); }
  document.addEventListener('pause', () => { if (pendingDraw && !anyPlaying()) { pendingDraw = false; drawLive(); drawAus(); } }, true);
  document.addEventListener('ended', () => { if (pendingDraw && !anyPlaying()) { pendingDraw = false; drawLive(); drawAus(); } }, true);

  function renderAnswers(taskId, box, newestFirst) {
    const list = S.answers[taskId] || {};
    const ids = Object.keys(list).sort(newestFirst ? (a, b) => list[b].ts - list[a].ts : byLabel);
    if (!ids.length) { box.appendChild(el('p', 'leer', 'Noch keine Antworten.')); return; }
    ids.forEach(pid => {
      const a = list[pid], key = taskId + '|' + pid;
      const r = el('div', 'antwort' + (fresh === key ? ' neu' : ''));
      r.innerHTML = '<div class="wer"><i style="background:' + AR.colorOf(pid) + '"></i>' + AR.esc(label(pid)) + '<span class="zeit">' + AR.fmtTime(a.ts) + '</span></div>';
      if (a.text) {
        r.appendChild(el('p', 'text', AR.esc(a.text)));
        if (AR.tts.ok) { const b = el('button', 'mittelknopf klein', AR.icon('speaker') + 'Vorlesen'); b.style.justifySelf = 'start'; b.onclick = () => AR.tts.speak(a.text, S.rate); r.appendChild(b); }
      }
      if (a.audio) {
        if (audio.has(key)) { const au = el('audio'); au.controls = true; au.src = audioUrl(key); r.appendChild(au); }
        else r.appendChild(el('span', 'muted klein', '(Aufnahme nicht mehr auf diesem Gerät)'));
      }
      box.appendChild(r);
    });
  }

  /* ---------- 2 Durchführen ---------- */
  function setCurrent(i) { S.current = i; if (i >= 0 && S.pace === 'live') vi = i; save(); broadcast(); drawLive(); }

  function drawLive() {
    if (view !== 'live') return;
    if (anyPlaying()) { pendingDraw = true; return; }
    const n = S.tasks.length, self = S.pace === 'self', c = S.current;
    vi = Math.max(0, Math.min(vi, n - 1));
    const t = S.tasks[vi], box = $('steuer'); box.innerHTML = '';

    const stat = el('div', 'status-zeile');
    stat.innerHTML = c < 0 ? '<span class="dot warn"></span>Die Kinder warten.' :
      self ? '<span class="dot ok"></span>Alle Aufgaben sind freigegeben.' : '<span class="dot ok"></span>Die Kinder sehen Aufgabe ' + (c + 1) + ' von ' + n + '.';
    box.appendChild(stat);

    const nums = el('div', 'nummern');
    S.tasks.forEach((x, i) => {
      const b = el('button', (i === vi ? 'zeigt ' : '') + ((self ? c >= 0 : i === c) ? 'frei' : ''), String(i + 1));
      b.setAttribute('aria-label', 'Aufgabe ' + (i + 1));
      b.onclick = () => { vi = i; drawLive(); }; nums.appendChild(b);
    });
    box.appendChild(nums);

    const ans = el('div', 'aufgabe-ansicht');
    if (t.text) ans.appendChild(el('p', 't', AR.esc(t.text)));
    if (t.q) ans.appendChild(el('p', 'q', AR.esc(t.q)));
    if (!t.text && !t.q) ans.appendChild(el('p', 'leer', 'Diese Aufgabe ist noch leer. Du kannst sie unter „Aufgaben“ ausfüllen.'));
    box.appendChild(ans);

    const btns = el('div', 'knopfreihe');
    const big = (cls, ic, txt, fn, right) => { const b = el('button', 'grossknopf ' + cls, right ? txt + AR.icon(ic) : AR.icon(ic) + txt); b.onclick = fn; return b; };
    if (self) {
      if (c < 0) btns.appendChild(big('weiter', 'play', 'Alle Aufgaben freigeben', () => setCurrent(0)));
      else btns.appendChild(big('leise', 'pause', 'Pause', () => setCurrent(-1)));
    } else if (c < 0 || vi !== c) {
      btns.appendChild(big('weiter', 'play', 'Aufgabe ' + (vi + 1) + ' freigeben', () => setCurrent(vi)));
      if (c >= 0) btns.appendChild(big('leise', 'pause', 'Pause', () => setCurrent(-1)));
    } else {
      if (vi > 0) btns.appendChild(big('leise', 'left', 'Zurück', () => setCurrent(vi - 1)));
      if (vi < n - 1) btns.appendChild(big('weiter', 'right', 'Nächste Aufgabe', () => setCurrent(vi + 1), true));
      btns.appendChild(big('leise', 'pause', 'Pause', () => setCurrent(-1)));
    }
    box.appendChild(btns);

    // Antworten zur gewählten Aufgabe
    const A = $('liveAns'); A.innerHTML = '';
    const k = nAnswers(t.id), N = Object.keys(S.pupils).length;
    const kopf = el('div', 'abschnitt-kopf', '<h2>Antworten zu Aufgabe ' + (vi + 1) + '</h2><span class="marke ' + (N && k >= N ? 'gut' : '') + '">' + k + ' von ' + N + '</span>');
    kopf.appendChild(nameToggle());
    A.appendChild(kopf);
    if (N) {
      const bal = el('div', 'balken', '<i style="width:' + Math.round(100 * Math.min(k, N) / N) + '%"></i>'); A.appendChild(bal);
      const open = Object.keys(S.pupils).filter(pid => !(S.answers[t.id] || {})[pid]).sort(byLabel);
      if (open.length && k) {
        const w = el('div', 'chips'); w.appendChild(el('span', 'muted klein', 'Noch offen:'));
        open.forEach(pid => w.appendChild(el('span', 'chip', '<i style="background:' + AR.colorOf(pid) + '"></i>' + AR.esc(label(pid)))));
        A.appendChild(w);
      }
    } else A.appendChild(el('p', 'leer', 'Noch niemand verbunden. Zeige den Kindern den QR-Code mit „Code“ oben rechts.'));
    renderAnswers(t.id, A, true);
    fresh = null;
  }

  /* ---------- 3 Antworten (Auswertung) ---------- */
  function drawAus() {
    if (view !== 'aus') return;
    if (anyPlaying()) { pendingDraw = true; return; }
    $('ausTog').innerHTML = ''; $('ausTog').appendChild(nameToggle());
    const box = $('ausList'); box.innerHTML = '';
    const N = Object.keys(S.pupils).length;
    S.tasks.forEach((t, i) => {
      const id = t.id, open = openAns.has(id), row = el('div', 'zeile' + (open ? ' offen' : ''));
      const p = preview(t), k = nAnswers(id);
      const head = el('button', 'kopfzeile', '<span class="nr">' + (i + 1) + '</span><span class="vorschau' + (p ? '' : ' leer') + '">' + AR.esc(p || 'Leere Aufgabe') + '</span>' +
        '<span class="marke ' + (N && k >= N ? 'gut' : '') + '">' + k + ' von ' + N + '</span><span class="dreh">' + AR.icon('down') + '</span>');
      head.onclick = () => { open ? openAns.delete(id) : openAns.add(id); drawAus(); };
      row.appendChild(head);
      if (open) { const inh = el('div', 'inhalt'); renderAnswers(id, inh, false); row.appendChild(inh); }
      box.appendChild(row);
    });
    fresh = null;
  }

  /* ---------- Export ---------- */
  const stamp = () => new Date().toISOString().slice(0, 10);
  function exportTxt(nm) {
    let out = 'Antwort-Runde ' + AR.fmtDate(Date.now()) + '\n\n';
    S.tasks.forEach((t, i) => {
      out += '=== Aufgabe ' + (i + 1) + ' ===\n' + (t.text ? t.text + '\n' : '') + (t.q ? t.q + '\n' : '') + '\n';
      const l = S.answers[t.id] || {};
      Object.keys(l).sort((a, b) => label(a, nm).localeCompare(label(b, nm), 'de')).forEach(pid => { out += label(pid, nm) + ': ' + (l[pid].text || '') + (l[pid].audio ? ' [Sprachaufnahme]' : '') + '\n'; });
      out += '\n';
    });
    AR.download('antworten-' + stamp() + '.txt', out, 'text/plain;charset=utf-8');
  }
  function exportCsv(nm) {
    const q = s => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
    const pids = Object.keys(S.pupils).sort(byLabel);
    const rows = [['Kind'].concat(S.tasks.map((t, i) => 'Aufgabe ' + (i + 1) + ': ' + (t.q || t.text || '').replace(/\s+/g, ' ').slice(0, 60)))];
    pids.forEach(pid => rows.push([label(pid, nm)].concat(S.tasks.map(t => { const a = (S.answers[t.id] || {})[pid]; return a ? (a.text || '') + (a.audio ? ' [Sprachaufnahme]' : '') : ''; }))));
    AR.download('antworten-' + stamp() + '.csv', '﻿' + rows.map(r => r.map(q).join(';')).join('\n'), 'text/csv;charset=utf-8');
  }

  /* ---------- Bedienung ---------- */
  document.querySelectorAll('[data-ic]').forEach(e => { e.innerHTML = AR.icon(e.dataset.ic); e.style.display = 'inline-flex'; });
  document.querySelectorAll('dialog').forEach(d => {
    d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
  });
  $('reiter').onclick = e => { const b = e.target.closest('button'); if (b) showView(b.dataset.v); };
  $('bToLive').onclick = () => showView('live');
  $('bCode').onclick = () => { drawCode(); $('dCode').showModal(); };
  $('bKinder').onclick = () => { $('dKinder').showModal(); drawKinder(); };
  $('bSet').onclick = () => { drawSettings(); $('dSet').showModal(); };
  $('pace').onclick = e => { const v = e.target.dataset.v; if (!v) return; S.pace = v; if (v === 'self' && S.current >= 0) S.current = 0; save(); broadcast(); drawSettings(); drawLive(); };
  $('autoSend').onchange = e => { S.autoSend = e.target.checked; save(); broadcast(); };
  $('autoRead').onchange = e => { S.autoRead = e.target.checked; save(); broadcast(); };
  $('rate').onchange = e => { S.rate = parseFloat(e.target.value); save(); broadcast(); };
  $('bAdd').onclick = () => { const t = newTask(); S.tasks.push(t); openTask = t.id; save(); broadcast(); drawTasks(); };
  $('bBulk').onclick = () => $('dBulk').showModal();
  $('bBulkOk').onclick = () => {
    const blocks = $('bulkTxt').value.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
    if (!blocks.length) return;
    if (S.tasks.length === 1 && !S.tasks[0].text && !S.tasks[0].q) S.tasks = [];
    blocks.forEach(b => {
      const lines = b.split('\n').map(s => s.trim()).filter(Boolean); const t = newTask();
      if (lines.length > 1) { t.q = lines.pop(); t.text = lines.join('\n'); } else t.q = lines[0];
      S.tasks.push(t);
    });
    $('bulkTxt').value = ''; $('dBulk').close(); save(); broadcast(); drawTasks();
  };
    $('bExport').onclick = () => { $('expNames').checked = false; $('expHint').hidden = !hasNames(); $('dExport').showModal(); };
  $('expTxt').onclick = () => exportTxt($('expNames').checked);
  $('expCsv').onclick = () => exportCsv($('expNames').checked);
  const hasNames = () => Object.values(S.names).some(n => (n || '').trim());
  $('bDelNames').onclick = () => { if (!hasNames() || confirm('Alle eingetragenen Klarnamen von diesem Gerät löschen?')) { S.names = {}; S.showNames = false; save(); redrawAll(); } };
  $('bNew').onclick = () => {
    if (total() && !confirm('Neue Runde starten? Antworten, Kinderliste und Klarnamen dieser Runde werden gelöscht. Vorher bitte exportieren!')) return;
    S.round = AR.rid(6); S.room = AR.genCode(4); S.answers = {}; S.pupils = {}; S.names = {}; S.showNames = false; S.current = -1; vi = 0;
    audio.clear(); urls.forEach(u => URL.revokeObjectURL(u)); urls.clear(); idb.clear(); online.clear();
    conns.forEach((pid, c) => c.close()); conns.clear();
    save(); $('dSet').close(); drawHead(); drawKinder(); showView('aufgaben'); startHost();
  };

  /* ---------- Start ---------- */
  $('ver').textContent = AR.VERSION;
  idb.open().then(idb.all.bind(idb)).then(rows => {
    rows.forEach(([k, v]) => { const [r, ...rest] = k.split('|'); if (r === 'v') voices.set(rest.join('|'), v); else if (r === S.round) audio.set(rest.join('|'), v); });
    drawTasks(); drawLive(); drawAus();
  });
  save(); drawHead(); showView(S.current >= 0 ? 'live' : 'aufgaben'); startHost();
  addEventListener('beforeunload', e => { if (conns.size) { e.preventDefault(); e.returnValue = ''; } });
})();
