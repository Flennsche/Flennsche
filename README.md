# Together 9.1 — Cloudflare REALTIME deployment

Die gezeigte Safari-Meldung wurde behoben: Die alte Version ließ einen WebSocket-Konstruktorfehler direkt als Registrierungsfehler erscheinen.

Dieses Verzeichnis ist zusätzlich eine Cloudflare-native Variante:
- Accounts + Sessions in einem Durable Object
- echte WebSockets
- Couple-Code direkt über den Server
- Aktionen/Chat nur über die echte WebSocket-Verbindung
- Nachrichten werden nur an Mitglieder desselben Couple-Raums gesendet
- keine Fake-Online-Zustände

## Deployment

Mit Node.js + Wrangler:

```bash
npm install -g wrangler
wrangler login
cd cloudflare
npm install
npm run deploy
```

Cloudflare Static Assets + Worker + Durable Object werden zusammen ausgerollt.

Wichtig: Das ZIP selbst macht eine Website nicht automatisch öffentlich. Für eine echte `*.workers.dev`-Adresse muss dieser Cloudflare-Worker in deinem Cloudflare-Konto deployed werden.
