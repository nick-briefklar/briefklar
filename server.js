// ── BriefKlar Backend Server ──────────────────────────────────────────────────
// Dieser Server ist der "Mittelsmann" zwischen deiner HTML-Seite und der
// Anthropic API. Er versteckt deinen API-Key vor der Außenwelt.
// ─────────────────────────────────────────────────────────────────────────────

// dotenv liest deine .env Datei und macht die Variablen verfügbar
require("dotenv").config();

const express = require("express");
const app = express();

// Damit der Server JSON-Daten von der HTML-Seite lesen kann
app.use(express.json({ limit: "20mb" }));

// CORS erlaubt deiner HTML-Seite den Server anzusprechen
// Im Moment erlauben wir alle Anfragen (für lokales Testen)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// ── HAUPT-ROUTE: Brief analysieren ───────────────────────────────────────────
// Wenn die HTML-Seite einen Brief analysieren will, schickt sie eine POST-
// Anfrage an /api/analyse. Dieser Server nimmt sie entgegen, fügt den
// geheimen API-Key hinzu, und leitet sie an Anthropic weiter.
app.post("/api/analyse", async (req, res) => {
  const { fileBase64, mediaType, briefType, intention, context } = req.body;

  // Prüfen ob alle nötigen Daten vorhanden sind
  if (!fileBase64 || !mediaType || !briefType || !intention) {
    return res.status(400).json({ error: "Fehlende Pflichtfelder." });
  }

  // System-Prompt: Das sind die "Anweisungen" die Claude bekommt bevor
  // er den Brief sieht. Je präziser die Anweisungen, desto besser das Ergebnis.
  const systemPrompt = `Du bist ein spezialisierter KI-Assistent für österreichische und deutsche Behördenbriefe, Rechtsdokumente und Unternehmensschreiben.

DEINE AUFGABE:
1. Analysiere den Inhalt des Dokuments vollständig
2. Erkläre den Inhalt in klarem, verständlichem Deutsch (keine Fachbegriffe ohne Erklärung)
3. Erkenne und markiere wichtige Fristen
4. Erstelle genau 3 konkrete Handlungsoptionen

AUSGABEFORMAT (nur JSON, nichts anderes):
{
  "zusammenfassung": "2-3 Sätze – worum geht es wirklich?",
  "wichtigsteFrist": "Datum oder 'Keine Frist erkennbar'",
  "kernproblem": "Was muss der Empfänger wissen?",
  "optionen": [
    {"titel": "Option 1", "beschreibung": "Kurze Erklärung"},
    {"titel": "Option 2", "beschreibung": "..."},
    {"titel": "Option 3", "beschreibung": "..."}
  ]
}

WICHTIG: Antworte AUSSCHLIESSLICH mit dem JSON-Objekt. Kein Text davor oder danach.
DISCLAIMER: Diese Analyse ersetzt keine professionelle Rechtsberatung.`;

  // Den Brief als Bild oder PDF an Claude schicken
  const isImage = mediaType.startsWith("image/");
  const contentBlock = isImage
    ? { type: "image", source: { type: "base64", media_type: mediaType, data: fileBase64 } }
    : { type: "document", source: { type: "base64", media_type: mediaType, data: fileBase64 } };

  try {
    // Anfrage an die Anthropic API – hier wird der geheime Key verwendet
    // process.env.ANTHROPIC_API_KEY liest den Key aus deiner .env Datei
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,  // <- Key bleibt geheim
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{
          role: "user",
          content: [
            contentBlock,
            {
              type: "text",
              text: `Briefart: ${briefType}\nAnliegen: ${intention}\nKontext: ${context || "Keiner"}`
            }
          ]
        }]
      })
    });

    const data = await response.json();

    // Fehlerbehandlung falls Anthropic einen Fehler zurückschickt
    if (data.error) {
      console.error("Anthropic Fehler:", data.error);
      return res.status(500).json({ error: "KI-Fehler: " + data.error.message });
    }

    // Den Text aus der Antwort extrahieren und JSON parsen
    const raw = data.content?.map(b => b.text || "").join("") || "";
    const clean = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    // Ergebnis zurück an die HTML-Seite schicken
    res.json(parsed);

  } catch (error) {
    console.error("Server Fehler:", error);
    res.status(500).json({ error: "Server-Fehler: " + error.message });
  }
});

// ── SERVER STARTEN ────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ BriefKlar Server läuft auf http://localhost:${PORT}`);
  console.log(`   API-Key geladen: ${process.env.ANTHROPIC_API_KEY ? "JA ✓" : "NEIN ✗"}`);
});