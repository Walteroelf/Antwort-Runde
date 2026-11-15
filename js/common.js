'use strict';
/* Antwort-Runde: gemeinsame Hilfen (Speicher, QR, Zufall, Sprachausgabe) */
window.AR = window.AR || {};
(function (AR) {
  AR.VERSION = '0.1.0';
  AR.PREFIX = 'antwort-runde-';
  AR.CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  AR.qs = new URLSearchParams(location.search);
  // ?net=bc: Testbetrieb ohne Internet, alle Seiten im selben Browser (BroadcastChannel)
  AR.NET = AR.qs.get('net') === 'bc' ? 'bc' : 'peer';
  AR.netQuery = AR.NET === 'bc' ? '?net=bc' : '';
  AR.hashParams = () => new URLSearchParams(location.hash.replace(/^#/, ''));

  AR.genCode = function (n) {
    n = n || 4; let s = '';
    for (let i = 0; i < n; i++) s += AR.CODE_CHARS[Math.floor(Math.random() * AR.CODE_CHARS.length)];
    return s;
  };
  AR.rid = function (n) {
    n = n || 8; const c = 'abcdefghjkmnpqrstuvwxyz23456789'; let s = '';
    for (let i = 0; i < n; i++) s += c[Math.floor(Math.random() * c.length)];
    return s;
  };
  AR.ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  AR.pick = arr => arr[Math.floor(Math.random() * arr.length)];
  AR.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  AR.store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* egal */ } }
  };

  AR.Emitter = class {
    constructor() { this._h = {}; }
    on(e, f) { (this._h[e] = this._h[e] || []).push(f); return this; }
    emit(e, ...a) { (this._h[e] || []).slice().forEach(f => { try { f(...a); } catch (err) { console.error(err); } }); }
  };

  AR.makeQR = function (url) {
    try {
      const qr = qrcode(0, 'M'); qr.addData(url); qr.make();
      const n = qr.getModuleCount(), cell = 8, q = 3, size = (n + q * 2) * cell;
      const c = document.createElement('canvas'); c.width = c.height = size;
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, size, size); g.fillStyle = '#000';
      for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (qr.isDark(r, k)) g.fillRect((k + q) * cell, (r + q) * cell, cell, cell);
      return c;
    } catch (e) { console.error(e); return null; }
  };

  AR.download = function (name, text, type) {
    const blob = text instanceof Blob ? text : new Blob([text], { type: type || 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };

  AR.fmtTime = ts => ts ? new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '–';
  AR.fmtDate = ts => ts ? new Date(ts).toLocaleDateString('de-DE') + ' ' + AR.fmtTime(ts) : '–';

  // Pseudonyme: Adjektiv + Tier + Zahl, nur männliche Artikel ("Blauer Falke")
  const ADJ = ['Blauer', 'Roter', 'Grüner', 'Gelber', 'Bunter', 'Lustiger', 'Kleiner', 'Schneller', 'Stiller', 'Goldener'];
  const NOUN = ['Falke', 'Fuchs', 'Hase', 'Igel', 'Löwe', 'Hund', 'Panda', 'Frosch', 'Delfin', 'Papagei', 'Pinguin', 'Tiger', 'Bär', 'Adler', 'Wolf'];
  AR.pseudonym = () => AR.pick(ADJ) + ' ' + AR.pick(NOUN) + ' ' + AR.ri(10, 99);


  /* ---------- Symbole (schlichte Linien, eigene Zeichnung) ---------- */
  const IC = {
    speaker: '<path d="M4 9.5v5h4l5 4v-13l-5 4z"/><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/>',
    stop: '<rect class="f" x="6" y="6" width="12" height="12" rx="2.5"/>',
    rec: '<circle class="f" cx="12" cy="12" r="6.5"/>',
    play: '<path class="f" d="M8 4.5v15l12-7.5z"/>',
    pause: '<path d="M8.5 5v14M15.5 5v14"/>',
    check: '<path d="M4.5 12.5l5 5L19.5 7"/>',
    left: '<path d="M15 5l-7 7 7 7"/>',
    right: '<path d="M9 5l7 7-7 7"/>',
    up: '<path d="M5 15l7-7 7 7"/>',
    down: '<path d="M5 9l7 7 7-7"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    trash: '<path d="M4.5 7h15M9.5 7V4h5v3M6.5 7l1 13h9l1-13"/>',
    sliders: '<path d="M4 7h9M19 7h1M4 17h1M11 17h9"/><circle cx="16" cy="7" r="2.6"/><circle cx="8" cy="17" r="2.6"/>',
    qr: '<rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="1"/><rect x="3.5" y="14" width="6.5" height="6.5" rx="1"/><path d="M14 14h3v3M20.5 14v.1M14 20.5h.1M17 20.5h3.5V17"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.6 2.7-6 6-6s6 2.4 6 6"/><circle cx="17.5" cy="9" r="2.4"/><path d="M17.5 14c2.4 0 4 1.9 4 4.5"/>',
    upload: '<path d="M12 16V5M7 9l5-5 5 5M5 20h14"/>',
    download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
    dice: '<rect x="4" y="4" width="16" height="16" rx="4"/><circle class="f" cx="9" cy="9" r="1.2"/><circle class="f" cx="15" cy="15" r="1.2"/><circle class="f" cx="15" cy="9" r="1.2"/><circle class="f" cx="9" cy="15" r="1.2"/>',
    hourglass: '<path d="M7 3h10M7 21h10M8 3v3.5l4 5.5-4 5.5V21M16 3v3.5L12 12l4 5.5V21"/>',
    send: '<path d="M4 12h15M13 6l6 6-6 6"/>',
    pen: '<path d="M4 20l1-4.5L16 4.5l3.5 3.5L8.5 19z"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.1M4 12h.1M4 18h.1"/>',
    chart: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
    text: '<path d="M5 6h14M5 11h14M5 16h9"/>',
    camera: '<path d="M4 8.5h3.2l1.6-2.5h6.4l1.6 2.5H20v10.5H4z"/><circle cx="12" cy="13.5" r="3.6"/>',
    image: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.7"/><path d="M4 17l5-4.5 3.5 3 3-2.5 4.5 4"/>',
    shield: '<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8-7.5 9.5-4.3-1.5-7.5-4.9-7.5-9.5V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
    alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4.5M12 17.5v.1"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>'
  };
  // Bild verkleinern und neu als JPEG kodieren. Das entfernt auch versteckte Daten wie GPS-Position (EXIF).
  AR.shrinkImage = async function (file, max, q) {
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch (e) {
      bmp = await new Promise((res, rej) => { const im = new Image(), u = URL.createObjectURL(file); im.onload = () => { URL.revokeObjectURL(u); res(im); }; im.onerror = rej; im.src = u; });
    }
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
    return new Promise(res => c.toBlob(res, 'image/jpeg', q || 0.82));
  };
  AR.pickFile = function (accept, cb) { const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.onchange = () => { if (i.files && i.files[0]) cb(i.files[0]); }; i.click(); };
  AR.pickImage = function (cb) { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.onchange = () => { if (i.files && i.files[0]) cb(i.files[0]); }; i.click(); };
  AR.fillIcons = () => document.querySelectorAll('[data-ic]').forEach(e => { e.innerHTML = AR.icon(e.dataset.ic); });
  document.addEventListener('DOMContentLoaded', AR.fillIcons);
  AR.icon = (name, extra) => '<svg class="ic' + (extra ? ' ' + extra : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (IC[name] || '') + '</svg>';

  // Farben für Kinder (Aicher-Palette), damit man Antworten schneller zuordnen kann
  const PAL = ['#3d9ad6', '#2f9e55', '#f39325', '#8cc63f', '#9fd3f0', '#ffd200', '#c5ccd3', '#1f6fae'];
  AR.colorOf = function (id) { let h = 0; const s = String(id); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return PAL[h % PAL.length]; };

  /* ---------- Sprachausgabe (offline, Stimme des Geräts) ---------- */
  AR.tts = {
    ok: 'speechSynthesis' in window,
    voice: null,
    pickVoice() {
      if (!this.ok) return;
      const vs = speechSynthesis.getVoices().filter(v => /^de/i.test(v.lang));
      if (!vs.length) return;
      const score = v => (/enhanced|premium|erweitert/i.test(v.name) ? 3 : 0) + (/^de[-_]DE/i.test(v.lang) ? 2 : 0) + (v.localService ? 1 : 0);
      this.voice = vs.sort((a, b) => score(b) - score(a))[0];
    },
    // parts: Liste von Texten, werden nacheinander mit kleiner Pause gesprochen
    speak(parts, rate, onEnd) {
      if (!this.ok) { onEnd && onEnd(); return; }
      this.stop();
      this.pickVoice();
      const list = (Array.isArray(parts) ? parts : [parts]).map(s => String(s || '').trim()).filter(Boolean);
      if (!list.length) { onEnd && onEnd(); return; }
      const token = this._tok = (this._tok || 0) + 1;
      list.forEach((t, i) => {
        const u = new SpeechSynthesisUtterance(t);
        u.lang = 'de-DE'; if (this.voice) u.voice = this.voice;
        u.rate = rate || 0.9;
        if (i === list.length - 1) u.onend = u.onerror = () => { if (this._tok === token) onEnd && onEnd(); };
        speechSynthesis.speak(u);
      });
    },
    stop() { if (this.ok) { this._tok = (this._tok || 0) + 1; try { speechSynthesis.cancel(); } catch (e) { /* egal */ } } }
  };
  if (AR.tts.ok) { speechSynthesis.onvoiceschanged = () => AR.tts.pickVoice(); AR.tts.pickVoice(); }
})(window.AR);
