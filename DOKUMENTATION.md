# Flask Collage Tool — Technische Dokumentation

## Überblick

Browserbasiertes Bildcollagen-Tool auf Basis von Flask (Python) und Fabric.js.
Der Nutzer wählt ein Raster-Layout, lädt pro Feld ein Bild, passt Zoom/Pan an
und exportiert die Collage als PNG oder JPG in voller Ausgabeauflösung.

- **Port:** 5004
- **Pfad:** `/opt/notebooks/flask/collage/`
- **GitHub:** https://github.com/analphabit/flask-collage
- **Aktuelle Version:** siehe `flask.ini` → `VERSION`

---

## Dateistruktur

```
collage/
├── flask.ini                    # VERSION, FLASK_ENVIRONMENTS
└── src/
    ├── app.py                   # Flask-Backend (minimal)
    ├── templates/
    │   └── index.html           # Einzige HTML-Seite
    └── static/
        ├── fabric.min.js        # Fabric.js 5.3 (lokal)
        ├── css/
        │   └── collage.css      # Alle Styles
        └── js/
            ├── collage-core.js  # Canvas, Layout, Zoom, Settings
            ├── collage-images.js# Bildladen, Cover-Fit, Clamp
            └── collage-export.js# Off-screen Export PNG/JPG
```

---

## Backend (app.py)

Minimaler Flask-Server ohne Datenbankanbindung.

- `_read_version()` liest `VERSION` aus `flask.ini` (eine Ebene über `src/`)
- Route `/` rendert `index.html` mit `use_cdn` und `version`
- `USE_CDN=true` → lädt Fabric.js von CDN statt lokal

Umgebungsvariablen:
| Variable | Default | Bedeutung |
|---|---|---|
| `FLASK_DEBUG` | `false` | Debug-Modus |
| `FLASK_HOST` | `127.0.0.1` | Bind-Adresse |
| `FLASK_PORT` | `5004` | Port |
| `USE_CDN` | `false` | Fabric.js von CDN laden |

---

## Architektur (Frontend)

### Globale Zustandsvariablen (collage-core.js)

```js
canvas          // Fabric.Canvas-Instanz
currentLayout   // { cols, rows }
OUTPUT_WIDTH/HEIGHT  // Ziel-Auflösung für Export (z.B. 1920×1080)
DISP_WIDTH/HEIGHT    // Aktuelle Anzeigegröße (skaliert auf Viewport)
DISP_SCALE      // OUTPUT / DISP — Verhältnis für Exportberechnung
frames[]        // Array aller Frame-Objekte (siehe unten)
selectedFrameId // frameId des aktuell aktiven Felds
```

### Frame-Objekt

```js
{
  frameId,         // z.B. "frame_0_1"
  col, row,        // Rasterposition
  dispX, dispY,    // Position auf Display-Canvas (px)
  dispW, dispH,    // Größe auf Display-Canvas (px)
  clipRect,        // fabric.Rect mit absolutePositioned:true (Clipping)
  placeholderRect, // graues Platzhalter-Rect (null wenn Bild vorhanden)
  labelObj,        // '+'-Text im Platzhalter (null wenn Bild vorhanden)
  imageObj,        // fabric.Image oder null
}
```

### Layout-Berechnung

```
Zellbreite  = (DISP_WIDTH  - innerGap*(cols-1) - borderWidth*2) / cols
Zellhöhe    = (DISP_HEIGHT - innerGap*(rows-1) - borderWidth*2) / rows
Position x  = borderWidth + col * (cellW + innerGap)
Position y  = borderWidth + row * (cellH + innerGap)
```

`borderWidth` = Außenrahmen-Dicke (in Display-Pixeln, wird mit DISP_SCALE umgerechnet für Export).
`innerGap` = Abstand nur zwischen den Zellen (nicht zum Rand).

### Hintergrund-Rendering

Zwei übereinanderliegende `fabric.Rect`-Objekte via `canvas.insertAt(obj, 0/1)`:
1. Outer: gesamter Canvas in `borderColor` (sichtbar nur am Rand wenn `borderWidth > 0`)
2. Inner: Canvas minus Rahmen in `bgColor` (sichtbar als Farbe zwischen den Zellen)

Beide tragen `isBackground: true` für gezielte Entfernung beim Neuaufbau.

---

## Modul-Beschreibungen

### collage-core.js

**Zuständig für:** Canvas-Init, Layout-Presets, Frame-Verwaltung, Zoom/Pan-Interaktion, Settings, Resize.

Wichtige Funktionen:

| Funktion | Beschreibung |
|---|---|
| `initCollage()` | Canvas erstellen, Presets bauen, ResizeObserver starten |
| `setPreset(id)` | Layout-Preset wählen, `rebuildFrames()` aufrufen |
| `rebuildFrames()` | Canvas leeren, Hintergrund + Frames neu aufbauen, Bildstatus wiederherstellen |
| `layoutFrames()` | Nur Frame-Positionen anpassen (bei Window-Resize), Bilder re-positionieren |
| `buildFrameObjects()` | Placeholder, ClipRect und Frame-Einträge erstellen |
| `drawBackground()` | Zwei Hintergrund-Rects zeichnen (Außenrahmen + Gap-Farbe) |
| `captureImageStates()` | Zoom/Pan-Zustand aller Bilder sichern (vor Rebuild) |
| `restoreImageStates()` | Bilder nach Rebuild wieder einfügen + Zustand restaurieren |
| `applyImageState()` | Relativen Zoom und Pan-Offset auf neue Frame-Größe übertragen |
| `zoomFrameImage()` | Bild in Frame zoomen (Faktor + optionaler Fokuspunkt) |
| `applyZoomInput()` | Zoom-Prozenteingabe aus UI anwenden |
| `updateZoomUI()` | Zoom-Zeile aktualisieren (Prozentwert, Frame-Label) |
| `resizeCanvas()` | DISP_WIDTH/HEIGHT neu berechnen, Canvas skalieren |
| `getSettings()` | Aktuelle UI-Einstellungen als Objekt zurückgeben |
| `onSettingsChange()` | Bei Einstellungsänderung `rebuildFrames()` aufrufen |
| `clearAll()` | Alle Bilder entfernen, Frames zurücksetzen |

**Canvas-Interaktion (setupCanvasInteraction):**
- `mouse:wheel` → `zoomFrameImage()` mit Faktor 1.1 (Mausrad)
- `mouse:down` → Frame selektieren; Doppelklick = `fitImageToFrame()`; einfach = Drag starten
- `mouse:move` → Pan mit Clamp
- `mouse:up` → Drag beenden

**Layout-Presets (PRESETS-Array):**
`1×1`, `2×1`, `1×2`, `2×2`, `3×1`, `1×3`, `3×2`, `2×3` — fest definiert.
Benutzerdefiniertes Raster ist noch nicht implementiert (UI-Platzhalter vorhanden).

**Zoom-Buttons:** 1%-Schritte (`factor = 1.01`). Mausrad: 10% (`factor = 1.1`).
Minimalzoom = Cover-Fit (Bild füllt Frame immer vollständig).

---

### collage-images.js

**Zuständig für:** Datei-Dialog, Bildladen, Cover-Fit-Platzierung, Clamp.

| Funktion | Beschreibung |
|---|---|
| `openImageForFrame(frameId)` | Datei-Dialog öffnen, `_pendingFrameId` setzen |
| `placeImageInFrame(frame, img)` | Placeholder entfernen, Cover-Fit berechnen, Bild einfügen |
| `fitImageToFrame(frame)` | Bild auf Cover-Fit zurücksetzen (Doppelklick / Reset-Button) |
| `clampImagePosition()` | Bild-Position so begrenzen dass Frame immer gedeckt ist |

**Cover-Fit-Formel:**
```js
coverScale = Math.max(frame.dispW / img.width, frame.dispH / img.height)
```
Das Bild füllt den Frame immer vollständig; überstehende Bereiche werden per `clipPath` abgeschnitten.

**Wichtig:** `img._coverScale` wird am Image-Objekt gespeichert, damit `zoomFrameImage()` und `updateZoomUI()` den 100%-Referenzwert kennen.

---

### collage-export.js

**Zuständig für:** Off-screen Export in voller Ausgabeauflösung.

Ablauf:
1. `fabric.StaticCanvas` in `OUTPUT_WIDTH × OUTPUT_HEIGHT` erstellen
2. Hintergrund-Rects in Ausgabe-Koordinaten zeichnen (skaliert mit `scale = OUTPUT_WIDTH / DISP_WIDTH`)
3. Pro Frame: `img.clone()` aufrufen, Koordinaten/Skalierung auf Output umrechnen, ClipRect erstellen
4. Wenn alle Frames fertig (`completed === pending`): `finishExport()` → `toDataURL()` → Download

**Wichtig:** `img.clone()` ist asynchron — der Counter `completed` zählt hoch und löst den Export erst aus wenn alle Frames abgearbeitet sind.

**Koordinaten-Umrechnung pro Bild:**
```js
outScaleX = img.scaleX * scale
outLeft   = x + (img.left - frame.dispX) * scale
```
`x` ist die Zellposition im Output-Canvas; der Versatz des Bildes relativ zur Zelle wird mit `scale` hochgerechnet.

---

## UI-Einstellungen

| Element | ID | Beschreibung |
|---|---|---|
| Layout-Presets | `presetGrid` | Buttons für vordefinierte Raster |
| Ausgabegröße | `canvasSize` | Dropdown; `custom` zeigt Eingabefelder |
| Bildtrenner | `innerGapSize` | Abstand zwischen den Zellen (px) |
| Hintergrund | `bgColor` | Farbe zwischen den Zellen |
| Außenrahmen Farbe | `borderColor` | Farbe des äußeren Rahmens |
| Außenrahmen Breite | `borderWidth` | Dicke des Rahmens (px, 0 = kein Rahmen) |
| Abrunden | `cornerRadius` | Abgerundete Ecken aller Felder (px) |
| Zoom-Input | `zoomInput` | Prozenteingabe für aktives Feld |

---

## Bekannte Besonderheiten / Fabric.js-Gotchas

- **`canvas.insertAt(obj, 0)`** statt `canvas.add()` für Hintergrund-Objekte, damit sie immer unten im Stack bleiben.
- **`absolutePositioned: true`** am `clipRect` ist zwingend — sonst verschiebt Fabric.js den Clip relativ zur Bildposition.
- **`img.clone()` ist async** — niemals synchron nach dem Clone auf das geklonte Objekt zugreifen.
- **`isBackground: true`** ist ein Custom-Property zum gezielten Entfernen beim Neuaufbau (`canvas.getObjects().filter(o => o.isBackground)`).
- **`_coverScale`** ist ein Custom-Property am Image-Objekt — kein Fabric.js-Standard.
- **`enableRetinaScaling: false`** am Canvas verhindert verschwommene Darstellung auf HiDPI-Displays bei der manuellen Skalierung.

---

## Deployment

Die App läuft in einer Screen-Session:
```bash
screen -r   # vorhandene Sessions anzeigen
```

Manuell starten:
```bash
cd /opt/notebooks/flask/collage/src
source ../venv/bin/activate   # oder entsprechender venv-Pfad
python app.py
```

Fabric.js lokal vorhanden unter `src/static/fabric.min.js` (Version 5.3.0).
Alternativ CDN via `USE_CDN=true`.
