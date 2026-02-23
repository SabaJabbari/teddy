# teddy

## Chat-Service (Kurz-Dokumentation)

Der Chat-Service besteht aus Frontend-Client, API-Endpoint im Backend und Chat-UI.

### Ablauf
1. Die Chat-UI nimmt die Nutzereingabe entgegen.
2. Das Frontend sendet die bisherigen `messages` per `POST /api/chat`.
3. Das Backend verarbeitet die Anfrage und ruft (bei gesetztem `OPENAI_API_KEY`) das LLM auf.
4. Die Antwort wird als `reply` an das Frontend zurückgegeben und im Chat angezeigt.

### Relevante Dateien
- Frontend API-Client: `/Users/sabajabbari/Downloads/selfcare-avatar-complete/frontend/src/chat.js`
- Chat-UI und Senden: `/Users/sabajabbari/Downloads/selfcare-avatar-complete/frontend/src/App.jsx`
- Backend Endpoint: `/Users/sabajabbari/Downloads/selfcare-avatar-complete/server/server.js`
- Lasttest/Benchmark: `/Users/sabajabbari/Downloads/selfcare-avatar-complete/server/scripts/benchmark-chat.js`

### API
- Endpoint: `POST /api/chat`
- Beispiel-Request (vereinfacht):
```json
{
  "messages": [
    { "role": "user", "content": "Hallo" }
  ],
  "style": "formal",
  "mode": "avatar_full"
}
```
- Beispiel-Response (vereinfacht):
```json
{
  "reply": "Hallo! Wie kann ich dir helfen?",
  "crisis": false,
  "mode": "avatar_full"
}
```
