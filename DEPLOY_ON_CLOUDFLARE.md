# Together 9.4 – Cloudflare deployment

Cloudflare Workers Build settings:
- Root directory: `/`
- Build command: leave empty
- Deploy command: `npx wrangler deploy`
- Preview command: optional / `npx wrangler preview`

The Wrangler config already uses Worker name `flennsche` and serves static files from `./public`.

After deployment:
- Website: the `workers.dev` URL shown by Cloudflare
- Health check: `/api/health`
- Realtime WebSocket: `/ws`
