'use strict';
/* Antwort-Runde: Lehrer-Gerät. Hält den Raum, verteilt Aufgaben, sammelt Antworten. */
(function () {
  const $ = id => document.getElementById(id);
  const KEY = 'ar.teacher.' + (AR.NET === 'bc' ? 'bc' : 'p');
  const defaults = () => ({ room: AR.genCode(4), round: AR.rid(6), tasks: [], current: -1, pace: 'live', rate: 0.9, autoRead: true, names: {}, pupils: {}, answers: {} });
  let S = Object.assign(defaults(), AR.store.get(KEY, {}));
  if (!S.tasks.length) S.tasks.push(newTask());
  const conns = new Map();     // conn -> pid
  const online = new Set();    // pid
  const audio = new Map();     // 'task|pid' -> {blob}
  let host = null, takenTries = 0, tab = 'tasks';

  function newTask() { return { id: AR.rid(6), text: '', q: '', mode: 'text' }; }
  function save() { AR.store.set(KEY, S); }

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
    clear() { try { if (this.db) this.db.transaction('a', 'readwrite').objectStore('a').clear(); } catch (e) { /* egal */ } }
  };

  /* ---------- Hilfen ---------- */
  function label(pid) {
    const p = S.pupils[pid] || {}; const n = (S.names[pid] || '').trim();
    return n ? n + ' (' + (p.name || pid) + ')' : (p.name || pid);
  }
  function stateMsg() {
    return { t: 'state', round: S.round, tasks: S.tasks, current: S.current, pace: S.pace, rate: S.rate, autoRead: S.autoRead };
  }
  function broadcast() { conns.forEach((pid, c) => c.send(stateMsg())); }
  let pushTimer = null;
  function pushSoon() { clearTimeout(pushTimer); pushTimer = setTimeout(broadcast, 350); }
  function studentUrl() {
    const u = new URL('schueler.html', location.href);
    return u.origin + u.pathname + AR.netQuery + '#r=' + S.room;
  }

  /* ---------- Verbindung ---------- */
  function startHost() {
    if (host) host.close();
    host = AR.hostRoom(S.room, {
      onStatus(s) {
        const ok = s === 'open';
        $('netDot').className = 'dot ' + (ok ? 'ok' : s === 'connecting' ? 'warn' : 'bad');
        $('netTxt').textContent = ok ? 'bereit' : s === 'connecting' ? 'verbinde …' : 'Verbindungsproblem (' + s.replace('error:', '') + ')';
      },
      onOpen() { takenTries = 0; },
      onTaken() {
        // Alter Eintrag auf dem Vermittlungsserver lebt noch kurz: erneut versuchen, sonst neuer Code
        $('netTxt').textContent = 'Code noch belegt, versuche erneut …';
        if (++takenTries > 6) { takenTries = 0; S.room = AR.genCode(4); save(); drawHeader(); }
        setTimeout(startHost, 4000);
      },
      onConn(c) {
        c.on('data', d => onData(c, d));
        c.on('close', () => { const pid = conns.get(c); conns.delete(c); if (pid && ![...conns.values()].includes(pid)) online.delete(pid); drawPupils(); });
      }
    });
  }

  function onData(c, d) {
    if (!d || !d.t) return;
    if (d.t === 'hello' && d.pid) {
      conns.set(c, d.pid); online.add(d.pid);
      S.pupils[d.pid] = { name: String(d.name || d.pid).slice(0, 40), last: Date.now() };
      save(); c.send(stateMsg()); drawPupils(); drawAnswers();
    } else if (d.t === 'answer' && d.pid && d.task) {
      if (d.round !== S.round) { c.send({ t: 'ack', task: d.task, ts: d.ts }); return; }
      if (!S.tasks.some(t => t.id === d.task)) { c.send({ t: 'ack', task: d.task, ts: d.ts }); return; }
      const pid = d.pid;
      if (!S.pupils[pid]) S.pupils[pid] = { name: String(d.name || pid).slice(0, 40) };
      S.pupils[pid].last = Date.now();
      const key = d.task + '|' + pid;
      const prev = (S.answers[d.task] || {})[pid];
      if (prev && prev.ts > d.ts) { c.send({ t: 'ack', task: d.task, ts: d.ts }); return; }
      let hasAudio = false;
      if (d.audio && (d.audio.byteLength || d.audio.size)) {
        const blob = new Blob([d.audio], { type: d.mime || 'audio/mp4' });
        audio.set(key, { blob }); idb.put(S.round + '|' + key, { blob }); hasAudio = true;
      } else if (prev && prev.audio && !d.dropAudio) hasAudio = true;
      (S.answers[d.task] = S.answers[d.task] || {})[pid] = { text: String(d.text || '').slice(0, 5000), audio: hasAudio, mime: d.mime || '', ts: d.ts || Date.now() };
      save(); c.send({ t: 'ack', task: d.task, ts: d.ts }); drawPupils(); drawAnswers();
    }
  }

  /* ---------- Anzeige: Kopf ---------- */
  function drawHeader() {
    $('code').textContent = S.room;
    $('qr').innerHTML = ''; const q = AR.makeQR(studentUrl()); if (q) $('qr').appendChild(q);
    $('link').textContent = AR.NET === 'bc' ? '· Testbetrieb (?net=bc)' : '';
  }
  function drawBig() {
    const b = $('big');
    b.classList.remove('hidden'); b.innerHTML = '';
    const q = AR.makeQR(studentUrl()); q.style.cssText = 'width:min(60vh,80vw);height:min(60vh,80vw);border-radius:16px';
    const c = document.createElement('div'); c.className = 'code'; c.style.fontSize = '5rem'; c.textContent = S.room;
    const m = document.createElement('div'); m.className = 'muted'; m.textContent = 'Antippen zum Schließen';
    b.append(q, c, m); b.onclick = () => b.classList.add('hidden');
  }
  function drawPupils() {
    const ids = Object.keys(S.pupils);
    $('nAll').textContent = ids.length; $('nOn').textContent = online.size;
    const box = $('pupils');
    if (!ids.length) { box.textContent = 'Noch niemand verbunden.'; return; }
    if (box.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') { updateDots(); return; }
    box.className = ''; box.innerHTML = '';
    ids.sort((a, b) => label(a).localeCompare(label(b), 'de')).forEach(pid => {
      const el = document.createElement('span'); el.className = 'pupil'; el.dataset.pid = pid;
      el.innerHTML = '<span class="dot ' + (online.has(pid) ? 'ok' : '') + '"></span><span>' + AR.esc(S.pupils[pid].name) + '</span>';
      const inp = document.createElement('input'); inp.placeholder = 'Name'; inp.value = S.names[pid] || '';
      inp.onchange = () => { S.names[pid] = inp.value; save(); drawAnswers(); };
      el.appendChild(inp); box.appendChild(el);
    });
  }
  function updateDots() { document.querySelectorAll('#pupils .pupil').forEach(el => { el.firstChild.className = 'dot ' + (online.has(el.dataset.pid) ? 'ok' : ''); }); }

  /* ---------- Steuerung ---------- */
  function drawControl() {
    document.querySelectorAll('#pace button').forEach(b => b.classList.toggle('on', b.dataset.v === S.pace));
    $('autoRead').checked = !!S.autoRead; $('rate').value = String(S.rate);
    const n = S.tasks.length, c = S.current, self = S.pace === 'self';
    $('curTxt').textContent = c < 0 ? 'Kinder warten' : self ? 'Alle Aufgaben freigegeben' : 'Aufgabe ' + (c + 1) + ' von ' + n;
    $('bPrev').classList.toggle('hidden', self || c < 1);
    $('bNext').classList.toggle('hidden', self ? c >= 0 : c >= n - 1);
    $('bNext').textContent = self ? 'Alle freigeben ▶' : c < 0 ? 'Aufgabe 1 freigeben ▶' : 'Nächste Aufgabe ▶';
    $('bStop').classList.toggle('hidden', c < 0);
    $('paceHelp').textContent = self ? 'Eigenes Tempo: Die Kinder blättern selbst durch alle Aufgaben.' : 'Gemeinsam: Alle Kinder sehen immer die Aufgabe, die du freigibst.';
    document.querySelectorAll('.task').forEach((el, i) => el.classList.toggle('live', !self && i === c));
  }
  function setCurrent(i) { S.current = i; save(); broadcast(); drawControl(); }

  /* ---------- Aufgaben-Editor ---------- */
  function drawTasks() {
    const box = $('tasks'); box.innerHTML = '';
    S.tasks.forEach((t, i) => {
      const el = document.createElement('div'); el.className = 'task';
      el.innerHTML =
        '<div class="row"><span class="nr">Aufgabe ' + (i + 1) + '</span><span class="grow"></span>' +
        '<button class="btn small" data-a="show">Jetzt zeigen</button>' +
        '<button class="btn small" data-a="up">↑</button><button class="btn small" data-a="down">↓</button>' +
        '<button class="btn small danger" data-a="del">Löschen</button></div>' +
        '<label class="small muted">Text zum Vorlesen (optional)</label><textarea data-f="text" rows="3"></textarea>' +
        '<label class="small muted">Frage (optional)</label><textarea data-f="q" rows="2" style="min-height:60px"></textarea>' +
        '<div class="row" style="margin-top:8px"><span class="small muted">Antwort per</span><select data-f="mode">' +
        '<option value="text">Schreiben oder Einsprechen als Text</option>' +
        '<option value="both">Text oder Sprachaufnahme</option>' +
        '<option value="audio">nur Sprachaufnahme</option></select></div>';
      el.querySelector('[data-f=text]').value = t.text; el.querySelector('[data-f=q]').value = t.q; el.querySelector('[data-f=mode]').value = t.mode;
      el.oninput = el.onchange = e => { const f = e.target.dataset.f; if (f) { t[f] = e.target.value; save(); pushSoon(); drawAnswersSoon(); } };
      el.onclick = e => {
        const a = e.target.dataset && e.target.dataset.a; if (!a) return;
        if (a === 'show') { S.pace === 'live' ? setCurrent(i) : setCurrent(Math.max(S.current, 0)); }
        if (a === 'del') {
          const has = Object.keys(S.answers[t.id] || {}).length;
          if (has && !confirm('Zu dieser Aufgabe gibt es ' + has + ' Antworten. Wirklich löschen?')) return;
          S.tasks.splice(i, 1); delete S.answers[t.id]; if (!S.tasks.length) S.tasks.push(newTask());
          if (S.current >= S.tasks.length) S.current = S.tasks.length - 1;
        }
        if (a === 'up' && i > 0) [S.tasks[i - 1], S.tasks[i]] = [S.tasks[i], S.tasks[i - 1]];
        if (a === 'down' && i < S.tasks.length - 1) [S.tasks[i + 1], S.tasks[i]] = [S.tasks[i], S.tasks[i + 1]];
        save(); broadcast(); drawTasks(); drawControl(); drawAnswers();
      };
      box.appendChild(el);
    });
    drawControl();
  }

  /* ---------- Antworten ---------- */
  let ansTimer = null;
  function drawAnswersSoon() { clearTimeout(ansTimer); ansTimer = setTimeout(drawAnswers, 500); }
  function total() { return S.tasks.reduce((n, t) => n + Object.keys(S.answers[t.id] || {}).length, 0); }
  function drawAnswers() {
    $('ansN').textContent = total() ? '(' + total() + ')' : '';
    if (tab !== 'ans') return;
    const box = $('ansView'); box.innerHTML = '';
    const nPupils = Math.max(1, Object.keys(S.pupils).length);
    S.tasks.forEach((t, i) => {
      const list = S.answers[t.id] || {}, ids = Object.keys(list);
      const card = document.createElement('div'); card.className = 'card';
      const head = (t.q || t.text || '(leer)').split('\n').slice(-1)[0];
      card.innerHTML = '<div class="row"><b>Aufgabe ' + (i + 1) + '</b><span class="grow small muted">' + AR.esc(head) + '</span><span class="tag">' + ids.length + ' von ' + nPupils + '</span></div>' +
        '<div class="bar" style="margin:8px 0"><i style="width:' + Math.round(100 * ids.length / nPupils) + '%"></i></div>';
      ids.sort((a, b) => label(a).localeCompare(label(b), 'de')).forEach(pid => {
        const a = list[pid], row = document.createElement('div'); row.className = 'ans';
        row.innerHTML = '<div class="row"><span class="who">' + AR.esc(label(pid)) + '</span><span class="small muted">' + AR.fmtTime(a.ts) + '</span><span class="grow"></span></div>';
        if (a.text) {
          const p = document.createElement('div'); p.className = 'txt'; p.textContent = a.text; row.appendChild(p);
          if (AR.tts.ok) { const b = document.createElement('button'); b.className = 'btn small'; b.textContent = '🔊 Vorlesen'; b.onclick = () => AR.tts.speak(a.text, S.rate); row.firstChild.appendChild(b); }
        }
        if (a.audio) {
          const rec = audio.get(t.id + '|' + pid);
          if (rec) {
            const au = document.createElement('audio'); au.controls = true; au.src = URL.createObjectURL(rec.blob); row.appendChild(au);
          } else { const m = document.createElement('div'); m.className = 'small muted'; m.textContent = '(Aufnahme nicht mehr auf diesem Gerät)'; row.appendChild(m); }
        }
        card.appendChild(row);
      });
      if (!ids.length) { const m = document.createElement('div'); m.className = 'small muted'; m.textContent = 'Noch keine Antworten.'; card.appendChild(m); }
      box.appendChild(card);
    });
  }

  /* ---------- Export ---------- */
  function stamp() { const d = new Date(); return d.toISOString().slice(0, 10); }
  function exportTxt() {
    let out = 'Antwort-Runde ' + AR.fmtDate(Date.now()) + '\n\n';
    S.tasks.forEach((t, i) => {
      out += '=== Aufgabe ' + (i + 1) + ' ===\n' + (t.text ? t.text + '\n' : '') + (t.q ? t.q + '\n' : '') + '\n';
      const l = S.answers[t.id] || {};
      Object.keys(l).sort((a, b) => label(a).localeCompare(label(b), 'de')).forEach(pid => {
        out += label(pid) + ': ' + (l[pid].text || '') + (l[pid].audio ? ' [Sprachaufnahme]' : '') + '\n';
      });
      out += '\n';
    });
    AR.download('antworten-' + stamp() + '.txt', out, 'text/plain;charset=utf-8');
  }
  function exportCsv() {
    const q = s => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
    const pids = Object.keys(S.pupils).sort((a, b) => label(a).localeCompare(label(b), 'de'));
    const rows = [['Kind'].concat(S.tasks.map((t, i) => 'Aufgabe ' + (i + 1) + ': ' + (t.q || t.text || '').replace(/\s+/g, ' ').slice(0, 60)))];
    pids.forEach(pid => rows.push([label(pid)].concat(S.tasks.map(t => { const a = (S.answers[t.id] || {})[pid]; return a ? (a.text || '') + (a.audio ? ' [Sprachaufnahme]' : '') : ''; }))));
    AR.download('antworten-' + stamp() + '.csv', '﻿' + rows.map(r => r.map(q).join(';')).join('\n'), 'text/csv;charset=utf-8');
  }

  /* ---------- Bedienung ---------- */
  $('pace').onclick = e => { const v = e.target.dataset.v; if (!v) return; S.pace = v; if (S.current >= 0 && v === 'self') S.current = 0; save(); broadcast(); drawControl(); };
  $('autoRead').onchange = e => { S.autoRead = e.target.checked; save(); broadcast(); };
  $('rate').onchange = e => { S.rate = parseFloat(e.target.value); save(); broadcast(); };
  $('bNext').onclick = () => setCurrent(S.pace === 'self' ? 0 : S.current + 1);
  $('bPrev').onclick = () => setCurrent(Math.max(0, S.current - 1));
  $('bStop').onclick = () => setCurrent(-1);
  $('bAdd').onclick = () => { S.tasks.push(newTask()); save(); broadcast(); drawTasks(); window.scrollTo(0, document.body.scrollHeight); };
  $('bBulk').onclick = () => $('bulkBox').classList.toggle('hidden');
  $('bBulkOk').onclick = () => {
    const blocks = $('bulkTxt').value.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
    if (!blocks.length) return;
    if (S.tasks.length === 1 && !S.tasks[0].text && !S.tasks[0].q) S.tasks = [];
    blocks.forEach(b => {
      const lines = b.split('\n').map(s => s.trim()).filter(Boolean); const t = newTask();
      if (lines.length > 1) { t.q = lines.pop(); t.text = lines.join('\n'); } else t.q = lines[0];
      S.tasks.push(t);
    });
    $('bulkTxt').value = ''; $('bulkBox').classList.add('hidden'); save(); broadcast(); drawTasks();
  };
  $('tabs').onclick = e => {
    const v = e.target.closest('button'); if (!v || !v.dataset.v) return; tab = v.dataset.v;
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b === v));
    $('tasksView').classList.toggle('hidden', tab !== 'tasks'); $('ansView').classList.toggle('hidden', tab !== 'ans'); drawAnswers();
  };
  $('bExpTxt').onclick = exportTxt; $('bExpCsv').onclick = exportCsv;
  $('bFull').onclick = drawBig;
  $('bNew').onclick = () => {
    if (total() && !confirm('Neue Runde starten? Die Antworten dieser Runde werden gelöscht. Vorher bitte exportieren!')) return;
    S.round = AR.rid(6); S.room = AR.genCode(4); S.answers = {}; S.pupils = {}; S.current = -1; audio.clear(); idb.clear(); online.clear();
    conns.forEach((pid, c) => c.close()); conns.clear();
    save(); drawHeader(); drawPupils(); drawTasks(); drawAnswers(); startHost();
  };

  /* ---------- Start ---------- */
  idb.open().then(idb.all.bind(idb)).then(rows => {
    rows.forEach(([k, v]) => { const [r, ...rest] = k.split('|'); if (r === S.round) audio.set(rest.join('|'), v); });
    drawAnswers();
  });
  save(); drawHeader(); drawTasks(); drawPupils(); drawAnswers(); startHost();
  addEventListener('beforeunload', e => { if (conns.size) { e.preventDefault(); e.returnValue = ''; } });
})();
