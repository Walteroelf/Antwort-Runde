# Antwort-Runde

Texte und Fragen werden auf dem **iPad vorgelesen**. Die Kinder antworten **frei**: schreiben, einsprechen (wird zu Text) oder als Sprachaufnahme. Alle Antworten erscheinen **sofort auf dem Lehrer-Gerät**, ohne dass die Kinder etwas verschicken oder teilen müssen. Kein Konto, nur QR-Code oder 4-stelliger Code.

Reine HTML/JavaScript-Seiten ohne Build-Schritt, geeignet für GitHub Pages. Gleiche Technik wie `mathe-runde` und `tafel-arena`.

| Seite | Wo | Wofür |
|---|---|---|
| `lehrer.html` | Lehrer-Gerät (iPad, Mac, PC) | Aufgaben anlegen, QR-Code zeigen, freigeben, Antworten sehen, exportieren |
| `schueler.html` | iPad jedes Kindes | Aufgabe hören/lesen, antworten |
| `index.html` | beliebig | Startseite mit zwei Kacheln |

## Ablauf

Das Lehrer-Gerät hat drei Reiter, die man von links nach rechts durchgeht:

1. **Aufgaben:** Aufgaben anlegen. Tippe auf eine Aufgabe, um sie aufzuklappen. Jede hat einen Lesetext (optional), eine Frage (optional) und eine Antwortart (Schreiben/Einsprechen, Text oder Sprachaufnahme, nur Sprachaufnahme). Jede Aufgabe kannst du **mit eigener Stimme einsprechen**: Die Kinder hören dann deine Aufnahme statt der iPad-Stimme. „Mehrere einfügen“ legt aus einem Text mit Leerzeilen viele Aufgaben an (letzte Zeile eines Absatzes = Frage).
2. **Durchführen:** Oben rechts „Code“ tippen: QR-Code und Code füllen den Bildschirm. Kinder scannen, bekommen ein Pseudonym wie „Blauer Falke 42“ (mit „Anderer Name“ änderbar) und warten. Du wählst eine Aufgabe (Nummern) und tippst „Freigeben“. Darunter erscheinen die Antworten live, mit Fortschrittsbalken („7 von 12“) und der Liste, wer noch fehlt.
3. **Antworten:** Alle Antworten je Aufgabe, dazu Export als Textdatei oder Tabelle (CSV, ein Kind pro Zeile).

Zahnrad oben rechts: *Tempo* (Gemeinsam = alle sehen deine freigegebene Aufgabe; Eigenes Tempo = Kinder blättern selbst), automatisch vorlesen, Sprechtempo, „Neue Runde“. Die Anzeige „n online“ öffnet die Kinderliste, dort trägst du echte Namen ein (nur auf diesem Gerät).

Die Kinder sehen nach dem Abschicken „✓ Angekommen bei der Lehrkraft“. Ändern und nochmal abschicken ist möglich, die neue Antwort ersetzt die alte. Bricht die Verbindung ab, sendet das iPad die Antwort später automatisch nach.

## Vorlesen

**Eigene Stimme:** Hat eine Aufgabe eine Aufnahme von dir, spielt das iPad diese ab (bis 3 Minuten). Die Aufnahme bleibt auf deinem Gerät gespeichert und wird beim Verbinden einmal an jedes iPad übertragen („Aufnahme lädt …“). Ändern oder löschen kannst du sie jederzeit, Änderungen kommen sofort bei den Kindern an. Das Lehrer-Gerät muss dafür online sein. Sprachaufnahmen bleiben beim Start einer „Neuen Runde“ erhalten.

**iPad-Stimme (ohne Aufnahme):** Nutzt die Stimme des iPads (Einstellungen → Bedienungshilfen → Gesprochene Inhalte → Stimmen; eine „erweiterte“ deutsche Stimme klingt deutlich besser). Funktioniert offline. Sprechtempo und „automatisch vorlesen“ stellst du am Lehrer-Gerät ein. Das automatische Vorlesen startet erst, nachdem das Kind einmal getippt hat (Regel von Safari). Der Knopf „🔊 Vorlesen“ geht immer.

## Einsprechen

- **🎤 Sprechen und aufschreiben lassen:** nutzt die Spracherkennung von Safari und trägt den Text ins Feld ein, das Kind kann ihn noch ändern. Das Gerät schickt dafür Audio an Apple (wie das Diktat der Tastatur). Siehe Datenschutz.
- **🎙️ Aufnahme:** nimmt die Stimme als Audiodatei auf (max. 90 Sekunden). Sie wird nur zwischen iPad und Lehrer-Gerät übertragen. Beim ersten Mal fragt Safari nach dem Mikrofon.
- Immer geht auch das Mikrofon auf der iPad-Tastatur (Diktat).

## Wo liegen die Daten?

| Was | Wo |
|---|---|
| Aufgaben, Texte der Antworten, Pseudonyme, echte Namen | Lehrer-Gerät, im Browser (`localStorage`) |
| Sprachaufnahmen | Lehrer-Gerät, im Browser (IndexedDB) |
| Eigene Antworten und Entwurf | iPad des Kindes, bis die Lehrkraft sie bestätigt hat |

Die Lehrer-Seite muss offen bleiben, solange die Kinder antworten. Lädst du sie neu, bleibt der Code gleich und die iPads verbinden sich wieder. **„Neue Runde“** löscht Antworten und vergibt einen neuen Code: vorher exportieren. Aufnahmen sind nicht Teil der Exportdateien, sie lassen sich im Tab „Antworten“ anhören (Rechtsklick/Teilen zum Sichern).

## Datenschutz-Kurzinfo

*Technische Beschreibung, keine Rechtsberatung. Die Freigabe liegt bei der Schule.*

- Keine Konten, keine Cookies, kein Tracking, keine Bibliotheken von Dritten (PeerJS und QR-Code liegen in `lib/`).
- Kinder erscheinen nur mit Pseudonym. Echte Namen trägst du selbst am Lehrer-Gerät ein, sie verlassen es nie.
- Antworten (Text, Audio) laufen per WebRTC **direkt vom iPad zum Lehrer-Gerät**, verschlüsselt (DTLS). Der öffentliche PeerJS-Server (`0.peerjs.com`) vermittelt nur den Verbindungsaufbau und sieht Raumcode, zufällige Gerätekennungen und IP-Adressen, aber keine Inhalte. Bei Bedarf nutzt PeerJS einen STUN-Server von Google und TURN-Server (dann laufen die verschlüsselten Daten darüber).
- Die Seiten kommen von GitHub Pages (IP-Adresse sichtbar wie bei jeder Webseite).
- **Spracherkennung („Sprechen und aufschreiben lassen“)** und das Tastatur-Diktat verarbeiten Audio bei Apple. Wer das nicht möchte, schaltet bei der Aufgabe auf „nur Sprachaufnahme“ um und lässt im Tastaturdiktat nur das Tippen zu.
- Hinweis für Kinder mit Texten, die persönliche Dinge enthalten könnten: Fragen so stellen, dass keine Namen oder privaten Angaben nötig sind.

## Wenn es nicht klappt

- Das Schulnetz muss WebRTC und `0.peerjs.com` (Port 443) zulassen. Bei euch läuft das schon für `mathe-runde` und `tafel-arena`.
- Kind wird nicht angezeigt: im Status unten rechts muss „verbunden“ stehen. Seite neu laden hilft meist.
- Keine Stimme beim Vorlesen: Lautlos-Schalter und Lautstärke am iPad prüfen.
- Aufnahme geht nicht: Safari → Einstellungen für diese Website → Mikrofon „Erlauben“.

## Gestaltung

Angelehnt an die Kirmes-Kiosk-App (Erscheinungsbild München 1972, Otl Aicher): helle Farben, flache Flächen, Dunkelblau statt Schwarz, Markise, kräftige Knöpfe. Eigene Linien-Symbole, keine Emojis. Schriften Andika (gut lesbar) und Grandstander, lokal in `schriften/` (SIL Open Font License). Hell- und Dunkelmodus folgen dem Gerät.

## Technik

```
index.html  lehrer.html  schueler.html
css/style.css    Gestaltung
schriften/      Andika, Grandstander (lokal)
js/common.js    Hilfen, Speicher, QR, Symbole, Pseudonyme, Sprachausgabe
js/net.js       PeerJS/WebRTC oder ?net=bc (BroadcastChannel für Tests)
js/lehrer.js    js/schueler.js
lib/            PeerJS, qrcode-generator (lokal, MIT)
```

- Nach Änderungen an `js/*.js` die Nummer `?v=` in den HTML-Dateien erhöhen.
- **Lokal testen:** im Ordner `python3 -m http.server 8765`, dann `http://localhost:8765/lehrer.html?net=bc` und in einem zweiten Tab `schueler.html?net=bc#r=CODE`. Mikrofon und Spracherkennung brauchen `localhost` oder HTTPS.
- **Veröffentlichen:** Repository auf GitHub, Settings → Pages → Branch `main`, Ordner `/ (root)`.
