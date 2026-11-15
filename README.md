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

Zahnrad oben rechts: *Antworten sofort übertragen*, *Tempo* (Gemeinsam = alle sehen deine freigegebene Aufgabe; Eigenes Tempo = Kinder blättern selbst), automatisch vorlesen, Sprechtempo, „Neue Runde“. Der Knopf mit der Kinderzahl oben (z. B. „3 online“) öffnet die Kinderliste, dort trägst du echte Namen ein (nur auf diesem Gerät).

**Klarnamen:** Standardmäßig siehst du überall nur die Pseudonyme. Der Schalter „Klarnamen: an/aus“ (in Durchführen, Antworten und in der Kinderliste) zeigt „Anna (Blauer Falke 42)“. Vor dem Zeigen an der Tafel ausschalten. Beim Export (Antworten → Exportieren) gibt es einen eigenen Haken „Klarnamen in die Datei schreiben“, standardmäßig aus. „Neue Runde“ und „Alle Namen löschen“ entfernen die eingetragenen Namen von diesem Gerät.

**Ohne „Abschicken“:** Schaltest du im Zahnrad „Antworten sofort übertragen“ ein, verschwindet der Abschicken-Knopf. Geschriebener Text wird kurz nach dem Tippen (etwa 0,7 Sekunden Pause) automatisch zu dir übertragen und aktualisiert sich laufend, Aufnahmen kommen an, sobald das Kind sie beendet. Löscht ein Kind seinen Text, verschwindet die Antwort bei dir wieder. Bedenke, dass du dann auch unfertige Texte siehst. Das Kind bekommt den Hinweis „Deine Lehrkraft sieht deine Antwort sofort“.

Die Kinder sehen nach dem Abschicken „✓ Angekommen bei der Lehrkraft“. Ändern und nochmal abschicken ist möglich, die neue Antwort ersetzt die alte. Bricht die Verbindung ab, sendet das iPad die Antwort später automatisch nach.

## Wenn ein Kind „neu“ erscheint

Die Zuordnung Klarname → Kind hängt an einer zufälligen Gerätekennung im Browser des iPads, nicht am Pseudonym. Nach dem Beitritt kann ein Kind sein Pseudonym nicht mehr ändern. Eine neue Kennung entsteht nur, wenn die Browserdaten des iPads gelöscht werden (oder Safari sie nach längerer Nichtbenutzung löscht), ein anderes iPad oder ein privates Fenster benutzt wird oder nach „Runde beenden“. Dann erscheint das Kind bei dir als neues Kind ohne Klarnamen. So ordnest du es wieder zu:

- **Kinderliste:** Bei Kindern ohne Klarnamen gibt es „Ist dasselbe Kind wie …“. Danach werden die Antworten zusammengelegt, und das iPad übernimmt den bisherigen Namen.
- **Beitritt „Nachfragen“:** Ein neues iPad wartet. Bei „Zulassen“ wählst du „Ist wieder: …“ oder „Neues Kind“.
- **Vorbeugen:** Sobald alle da sind, den Beitritt auf „Gesperrt“ stellen. Ein Kind, das sich eine neue Kennung besorgt, sieht „Diese Runde ist gesperrt“ und muss sich bei dir melden. Oben rechts auf dem iPad steht das Pseudonym des Kindes. Frag im Zweifel danach.

## Bilder und Fotos

- **Bild zur Aufgabe:** In der Aufgabe „Bild oder Foto wählen“. Das Bild wird verkleinert und erscheint in der Aufgabenkarte auf den iPads.
- **Foto als Antwort:** Pro Aufgabe der Haken „Kinder dürfen ein Foto als Antwort machen“. Dann gibt es auf dem iPad einen Knopf „Foto“ (Kamera oder Fotos wählen). Das Foto wird auf dem iPad verkleinert und neu gespeichert, dabei verschwinden versteckte Daten wie der Standort. Du siehst es bei den Antworten und kannst es antippen, um es groß zu sehen. In Exportdateien steht nur „[Foto]“.
- Kinder sollen nur Arbeitsergebnisse fotografieren (Heft, Zeichnung, Legearbeit), keine Gesichter. Der Hinweis erscheint auch in der Aufgabe.

## Bildschirm auf dem iPad

Alles passt ohne Scrollen auf einen Bildschirm. Im **Querformat** steht die Frage links und die Antwort rechts, im Hochformat die Frage oben und die Antwort darunter. Ein sehr langer Text scrollt nur innerhalb der Aufgabenkarte.

## Datenschutz-Einstellungen (Zahnrad)

Unter jeder Einstellung zeigt die App an, was sie für die Daten bedeutet (grün = geschützt, orange = Achtung).

| Einstellung | Standard | Wirkung |
|---|---|---|
| Spracherkennung erlauben | aus | Ein: Der Knopf „Sprechen“ schickt Ton an Apple. Aus: Der Knopf fehlt. |
| Antworten sofort übertragen | aus | Ein: Du siehst auch unfertige Texte. Aus: Nur nach „Abschicken“. |
| Neue Kinder dürfen beitreten | offen | *Offen:* jeder mit Code. *Nachfragen:* du bestätigst jedes neue Kind (Kinderliste, Knopf zeigt z. B. „2 warten“). *Gesperrt:* niemand Neues, bekannte Kinder kommen wieder. |
| Automatisch löschen | 24 Stunden | Antworten, Aufnahmen, Fotos und inaktive Kinder samt Klarnamen werden nach der Zeit gelöscht. Bei bestehenden Installationen bleibt es zunächst „nie“. |
| Runde beenden und alles löschen | | Löscht alles auf deinem Gerät, die iPads löschen Entwürfe und Antworten und zeigen „Runde beendet“. |
| Alle Aufgaben löschen | | Löscht Aufgaben, Bilder, eigene Stimm-Aufnahmen und die zugehörigen Antworten. „Runde beenden“ lässt die Aufgaben bewusst stehen. |

Zusätzlich: Die Seiten erlauben per Sicherheitsvorgabe (CSP) nur Verbindungen zur eigenen Seite und zum PeerJS-Server, und geben beim Aufruf keine Herkunftsadresse weiter. Auf dem iPad verfallen Entwürfe und Antworten nach 24 Stunden von selbst. Wer einen eigenen PeerJS-Server nutzt, muss dessen Adresse in `js/net.js` und in der `connect-src`-Zeile der HTML-Dateien eintragen.

## Vorlesen

**Eigene Stimme:** Hat eine Aufgabe eine Aufnahme von dir, spielt das iPad diese ab (bis 3 Minuten). Die Aufnahme bleibt auf deinem Gerät gespeichert und wird beim Verbinden einmal an jedes iPad übertragen („Aufnahme lädt …“). Ändern oder löschen kannst du sie jederzeit, Änderungen kommen sofort bei den Kindern an. Das Lehrer-Gerät muss dafür online sein. Sprachaufnahmen bleiben beim Start einer „Neuen Runde“ erhalten.

**iPad-Stimme (ohne Aufnahme):** Nutzt die Stimme des iPads (Einstellungen → Bedienungshilfen → Gesprochene Inhalte → Stimmen; eine „erweiterte“ deutsche Stimme klingt deutlich besser). Funktioniert offline. Sprechtempo und „automatisch vorlesen“ stellst du am Lehrer-Gerät ein. Das automatische Vorlesen startet erst, nachdem das Kind einmal getippt hat (Regel von Safari). Der Knopf „🔊 Vorlesen“ geht immer.

## Einsprechen

- **„Sprechen“ (Spracherkennung, nur wenn eingeschaltet):** nutzt die Spracherkennung von Safari und trägt den Text ins Feld ein, das Kind kann ihn noch ändern. Das Gerät schickt dafür Audio an Apple (wie das Diktat der Tastatur). Siehe Datenschutz.
- **Aufnahme:** nimmt die Stimme als Audiodatei auf (max. 90 Sekunden). Sie wird nur zwischen iPad und Lehrer-Gerät übertragen. Beim ersten Mal fragt Safari nach dem Mikrofon.
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
- Kinder erscheinen nur mit Pseudonym. Echte Namen trägst du selbst am Lehrer-Gerät ein, sie verlassen es nie. Sie werden nur angezeigt, wenn du es einschaltest, und stehen nur in Exportdateien, wenn du es dort ausdrücklich wählst. „Neue Runde“ löscht sie.
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
