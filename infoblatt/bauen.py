#!/usr/bin/env python3
"""Erzeugt infoblatt.html (mit QR-Code als Vektorgrafik) und daraus per Chrome das PDF.
Aufruf: python3 bauen.py   (Chrome muss installiert sein)"""
import subprocess, sys, pathlib, qrcode

HERE = pathlib.Path(__file__).resolve().parent
URL = "https://walteroelf.github.io/Antwort-Runde/"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PDF = HERE.parent.parent / "Antwort-Runde-Infoblatt.pdf"

def qr_svg(text):
    q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=0, box_size=1)
    q.add_data(text); q.make(fit=True)
    m = q.get_matrix(); n = len(m)
    d = "".join(f"M{x},{y}h1v1h-1z" for y, row in enumerate(m) for x, v in enumerate(row) if v)
    return f'<svg viewBox="0 0 {n} {n}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg"><path d="{d}" fill="#1d3a5c"/></svg>'

SHIELD = '<svg class="ic" viewBox="0 0 24 24"><path d="M12 3l7.5 3v5.5c0 4.6-3.2 8-7.5 9.5-4.3-1.5-7.5-4.9-7.5-9.5V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg>'
BULB = '<svg class="ic" viewBox="0 0 24 24"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/></svg>'

HTML = f"""<!doctype html>
<html lang="de"><head><meta charset="utf-8"><title>Antwort-Runde: Infoblatt für Lehrkräfte</title>
<style>
@font-face {{ font-family: "Andika"; font-weight: 400; src: url("../schriften/andika-400.woff2") format("woff2"); }}
@font-face {{ font-family: "Andika"; font-weight: 700; src: url("../schriften/andika-700.woff2") format("woff2"); }}
@font-face {{ font-family: "Grandstander"; font-weight: 700 900; src: url("../schriften/grandstander.woff2") format("woff2"); }}
@page {{ size: A4; margin: 0; }}
:root {{ --blau:#1f6fae; --hell:#9fd3f0; --navy:#1d3a5c; --navy2:#5b7491; --gruen:#2f9e55; --gruenhell:#e3f3e8; --orange:#c76f0a; --orangehell:#fdf0dc; --himmel:#f5f7f9; --linie:#dfe5ec; }}
* {{ box-sizing: border-box; }}
html, body {{ margin: 0; padding: 0; }}
body {{ width: 210mm; height: 297mm; overflow: hidden; background: var(--himmel); color: var(--navy); font-family: "Andika", sans-serif; font-size: 9.3pt; line-height: 1.3; -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
h1, h2, h3 {{ font-family: "Grandstander", sans-serif; margin: 0; line-height: 1.15; }}
svg.ic {{ width: 1.25em; height: 1.25em; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; vertical-align: -.22em; }}

/* Markise */
.markise {{ height: 14mm; background: repeating-linear-gradient(90deg, var(--blau) 0 13mm, #fff 13mm 26mm); position: relative; }}
.markise::after {{ content: ""; position: absolute; left: 0; right: 0; bottom: -5mm; height: 5mm;
  background: radial-gradient(circle at 6.5mm 0, var(--blau) 6.4mm, transparent 6.5mm) 0 0 / 26mm 5mm repeat-x,
              radial-gradient(circle at 19.5mm 0, #fff 6.4mm, transparent 6.5mm) 0 0 / 26mm 5mm repeat-x; }}
.sign {{ position: absolute; left: 14mm; top: 3mm; background: #fff; border: 1mm solid var(--navy); border-radius: 3.5mm; padding: 0 5mm; box-shadow: 0 1.1mm 0 var(--navy);
  font-family: "Grandstander", sans-serif; font-weight: 900; font-size: 23pt; letter-spacing: .01em; line-height: 1.25; }}
.kopf {{ display: grid; grid-template-columns: 1fr 44mm; gap: 8mm; padding: 10mm 14mm 0; align-items: center; }}
.lead {{ font-family: "Grandstander", sans-serif; font-weight: 800; font-size: 13.5pt; line-height: 1.22; margin: 0 0 2.2mm; }}
.chips {{ display: flex; flex-wrap: wrap; gap: 1.6mm; margin-top: 3mm; }}
.chip {{ background: #fff; border: .5mm solid var(--navy); border-radius: 99px; padding: .2mm 2.6mm; font-weight: 700; font-size: 8.4pt; }}
.qr {{ background: #fff; border: 1mm solid var(--navy); border-radius: 5mm; box-shadow: 0 1.3mm 0 var(--navy); padding: 3.2mm 2.6mm 2.4mm; text-align: center; }}
.qr svg {{ width: 100%; display: block; }}
.qr b {{ display: block; font-family: "Grandstander", sans-serif; font-weight: 800; font-size: 10.5pt; margin-top: 2mm; }}
.qr span {{ font-size: 6.4pt; color: var(--navy2); white-space: nowrap; }}

/* Schritte */
.schritte {{ display: grid; grid-template-columns: 1fr 1fr; gap: 3.6mm; padding: 6mm 14mm 0; }}
.step {{ background: #fff; border: .5mm solid var(--linie); border-radius: 4mm; padding: 2.8mm 3.6mm 2.6mm; }}
.step h3 {{ font-size: 11pt; display: flex; align-items: center; gap: 2.4mm; margin-bottom: 1.6mm; }}
.nr {{ flex: none; width: 7.4mm; height: 7.4mm; border-radius: 50%; background: var(--hell); display: grid; place-items: center; font-family: "Grandstander", sans-serif; font-weight: 900; font-size: 12pt; }}
.step ul {{ margin: 0; padding-left: 4.2mm; }}
.step li {{ margin: .6mm 0; }}
.step li::marker {{ color: var(--blau); }}
b.k {{ font-weight: 700; }}

/* Unten */
.unten {{ display: grid; grid-template-columns: 1fr 1fr; gap: 3.6mm; padding: 3.6mm 14mm 0; }}
.box {{ border-radius: 4mm; padding: 2.8mm 3.6mm; border: .5mm solid; }}
.box.gut {{ background: var(--gruenhell); border-color: var(--gruen); }}
.box.tipp {{ background: var(--orangehell); border-color: var(--orange); }}
.box h3 {{ font-size: 11pt; display: flex; align-items: center; gap: 2mm; margin-bottom: 1.5mm; }}
.box.gut h3 {{ color: #1d5e25; }} .box.tipp h3 {{ color: var(--orange); }}
.box ul {{ margin: 0; padding-left: 4.2mm; }}
.box li {{ margin: .5mm 0; }}
.fuss {{ position: absolute; left: 14mm; right: 14mm; bottom: 6mm; display: flex; justify-content: space-between; font-size: 7.6pt; color: var(--navy2); border-top: .3mm solid var(--linie); padding-top: 2mm; }}
</style></head>
<body>
<div class="markise"><div class="sign">Antwort-Runde</div></div>

<section class="kopf">
  <div>
    <p class="lead">Texte und Fragen werden vorgelesen. Die Kinder antworten frei: schreiben, sprechen, aufnehmen oder fotografieren. Du siehst jede Antwort sofort.</p>
    <div>Läuft im Browser auf dem iPad und deinem Lehrer-Gerät. <b>Kein Konto, keine Installation:</b> Kinder kommen per QR-Code oder 4-stelligem Code.</div>
    <div class="chips"><span class="chip">Vorlesen</span><span class="chip">Freitext</span><span class="chip">Sprachaufnahme</span><span class="chip">Foto</span><span class="chip">Live-Antworten</span></div>
  </div>
  <div class="qr">{qr_svg(URL)}<b>App öffnen</b><span>walteroelf.github.io/Antwort-Runde</span></div>
</section>

<section class="schritte">
  <div class="step"><h3><span class="nr">1</span>Aufgaben vorbereiten</h3>
    <ul>
      <li>Auf deinem Gerät die App öffnen, Seite <b class="k">Lehrer-Gerät</b>, Reiter <b class="k">Aufgaben</b>.</li>
      <li>Pro Aufgabe: Lesetext, Frage, auf Wunsch <b class="k">Bild</b> und <b class="k">deine eigene Stimme</b> als Vorlesung.</li>
      <li>Antwortart: Schreiben/Einsprechen, Text oder Aufnahme, nur Aufnahme. Dazu optional <b class="k">Foto</b> als Antwort.</li>
      <li>„Mehrere einfügen“ legt viele Aufgaben auf einmal an.</li>
          </ul></div>
  <div class="step"><h3><span class="nr">2</span>Kinder einladen</h3>
    <ul>
      <li>Oben rechts auf <b class="k">Code</b> tippen: QR-Code und Code füllen den Bildschirm.</li>
      <li>Kinder scannen den QR-Code mit dem iPad oder öffnen <b class="k">schueler.html</b> und tippen den Code. Sie bekommen ein <b class="k">Pseudonym</b> (z. B. „Blauer Falke 42“).</li>
      <li>Echte Namen trägst du über den Knopf mit der Anzahl der Kinder ein (oben, z. B. <b class="k">„3 online“</b>). Sie bleiben nur auf deinem Gerät.</li>
      <li>Sind alle da: Beitritt auf <b class="k">„Gesperrt“</b> stellen (Zahnrad).</li>
    </ul></div>
  <div class="step"><h3><span class="nr">3</span>Durchführen</h3>
    <ul>
      <li>Reiter <b class="k">Durchführen</b>: Aufgabe wählen und <b class="k">freigeben</b>. Das iPad liest vor (iPad-Stimme oder deine Aufnahme), Frage links, Antwort rechts.</li>
      <li>Antworten erscheinen live, mit „7 von 12“ und der Liste, <b class="k">wer noch fehlt</b>.</li>
      <li>Tempo: <b class="k">Gemeinsam</b> (du schaltest weiter) oder <b class="k">Eigenes Tempo</b>. Optional: Antworten <b class="k">sofort übertragen</b>, ohne „Abschicken“.</li>
    </ul></div>
  <div class="step"><h3><span class="nr">4</span>Auswerten und aufräumen</h3>
    <ul>
      <li>Reiter <b class="k">Antworten</b>: alle Antworten je Aufgabe. Fotos antippen zum Vergrößern, Texte lassen sich vorlesen.</li>
      <li><b class="k">Exportieren</b> als Text oder Tabelle (CSV), standardmäßig <b class="k">nur mit Pseudonymen</b>.</li>
      <li><b class="k">Klarnamen: an/aus</b> blendet Namen ein. Vor dem Zeigen an der Tafel ausschalten.</li>
      <li>Zum Schluss: <b class="k">Runde beenden und alles löschen</b> (Zahnrad). Die iPads löschen ihre Daten ebenfalls.</li>
    </ul></div>
</section>

<section class="unten">
  <div class="box tipp"><h3>{BULB}Vor der Stunde</h3>
    <ul>
      <li>Einmal mit zwei Geräten ausprobieren (Mikrofon, Kamera, Ton).</li>
      <li>Auf dem iPad: Teilen → <b class="k">Zum Home-Bildschirm</b> für Vollbild.</li>
      <li>Das <b class="k">Lehrer-Gerät offen und wach lassen</b> (Auto-Sperre aus), solange Kinder antworten.</li>
      <li>Schulnetz muss Verbindungen zwischen Geräten erlauben (wie bei den anderen Apps).</li>
      <li>Nicht abgeschickte Fotos und Aufnahmen gehen beim Neuladen verloren.</li>
    </ul></div>
  <div class="box gut"><h3>{SHIELD}Datenschutz in Kürze</h3>
    <ul>
      <li>Keine Konten, Cookies oder Tracker. Kinder nur mit <b class="k">Pseudonym</b>.</li>
      <li>Daten gehen <b class="k">direkt zwischen den Geräten</b>, verschlüsselt. Ein öffentlicher Server (PeerJS) vermittelt nur den Verbindungsaufbau und sieht IP-Adressen, keine Inhalte.</li>
      <li><b class="k">Spracherkennung</b> (Apple) ist aus, solange du sie nicht einschaltest. Aufnahmen bleiben zwischen iPad und deinem Gerät.</li>
      <li>Antworten löschen sich automatisch (einstellbar). Die Freigabe liegt bei Schule und Datenschutzbeauftragten.</li>
    </ul></div>
</section>

<div class="fuss"><span>Antwort-Runde · Infoblatt für Lehrkräfte</span><span>walteroelf.github.io/Antwort-Runde</span></div>
</body></html>
"""

(HERE / "infoblatt.html").write_text(HTML, encoding="utf-8")
if "--nur-html" in sys.argv:
    sys.exit(0)
subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer", f"--print-to-pdf={PDF}",
                (HERE / "infoblatt.html").as_uri()], check=True, capture_output=True, timeout=90)
print("PDF:", PDF)
