# teddy
# Coco – ein 3D-Teddy für deine Selbstfürsorge

Coco ist eine Progressive Web App, in der ein animierter 3D-Teddybär dich durch kleine Selfcare-Momente begleitet. Du kannst mit Coco sprechen, er antwortet mit eigener Stimme und leitet dich zum Beispiel durch eine Atemübung.

Entstanden ist Coco im Rahmen meiner Masterarbeit **„LLM-gestützte Avatare als Schnittstelle für Selfcare“** im Studiengang Medieninformatik (M.Sc.) an der Hochschule Düsseldorf, 2026.

![Coco Screenshot](docs/screenshot.png)

## Funktionen

- **Gespräch mit Coco:** Antworten über ein Sprachmodell (OpenAI API), abgestimmt auf einen ruhigen, unterstützenden Ton
- **Sprachausgabe:** natürliche Stimme über ElevenLabs, mit der Sprachausgabe des Browsers als Fallback
- **Animierter 3D-Avatar:** Coco winkt, blinzelt und bewegt beim Sprechen den Mund (React Three Fiber, glTF-Modelle)
- **Onboarding:** ein kurzes Kennenlernen, aus dem ein persönliches Komfortprofil entsteht
- **Atemübung:** geführte 60-Sekunden-Übung (4 s einatmen, 2 s halten, 4 s ausatmen)
- **Atmosphäre:** auswählbare Hintergründe und Hintergrundmusik
- **Benutzerkonto:** Registrierung, Login und „Passwort vergessen“ per E-Mail
- **Sitzungsprotokoll:** Interaktionen lassen sich als CSV exportieren, zum Beispiel für die Auswertung einer Nutzerstudie
- **PWA:** auf Handy und Desktop installierbar, responsive Oberfläche

## Tech-Stack

| Bereich | Technologien |
|---|---|
| Frontend | React 18, Vite, React Three Fiber, drei, three.js, vite-plugin-pwa |
| Backend | Node.js, Express, REST API |
| Datenbank | PostgreSQL (pg) |
| KI und Sprache | OpenAI API, ElevenLabs Text-to-Speech, Web Speech API |
| Sicherheit | Passwort-Hashing mit scrypt, HMAC-signierte Tokens, CORS |
| E-Mail | Nodemailer (Passwort zurücksetzen) |
| Deployment | Vercel (Frontend) |

## Architektur

```
Browser (React-PWA mit 3D-Avatar)
        │  REST (/api/...)
        ▼
Node.js / Express-Server ──► OpenAI API      (Antworten)
        │                ──► ElevenLabs API  (Stimme)
        ▼
   PostgreSQL (Benutzerkonten)
```

## Projektstruktur

```
frontend/   React-App (Vite, PWA, 3D-Modelle unter public/models)
server/     Express-API (Chat, Sprachausgabe, Authentifizierung)
```

## Lokal starten

**Server**

```bash
cd server
cp .env.example .env   # eigene API-Schlüssel und Datenbank-URL eintragen
npm install
npm run dev            # läuft auf http://localhost:8787
```

**Frontend**

```bash
cd frontend
npm install
npm run dev            # läuft auf http://localhost:5173
```

Das Frontend leitet Anfragen an `/api` im Entwicklungsmodus automatisch an den Server weiter.

## Autorin

Saba Jabbari · [LinkedIn](https://www.linkedin.com/in/saba-jabbari-66888892)
