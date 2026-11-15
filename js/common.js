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
