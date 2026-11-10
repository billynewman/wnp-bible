# Deploying `bible.wnp.app` (Scourby YouBible KJV 67-Video PWA) to Bluehost

## Architecture
- **Domain**: `https://bible.wnp.app/`
- **Document Root on Bluehost**: `/home2/outletco/public_html/bible`
- **Build Policy**: Build strictly locally (`npm test && npm run build` in `/Users/williamnewman/.gemini/antigravity/scratch/wnp-bible`), then push static `dist/` + `.htaccess` to Bluehost. Never run Node/Vite builds on the shared host.

## Local Build & Package
```bash
cd /Users/williamnewman/.gemini/antigravity/scratch/wnp-bible
npm run typecheck
npm test
npm run build
cp deploy/bluehost-bible.htaccess dist/.htaccess
(cd dist && zip -r ../wnp-bible-dist.zip . .htaccess)
```

## Bluehost Subdomain & DNS Setup
1. **Subdomain**: `bible.wnp.app` → Document Root `/home2/outletco/public_html/bible`
2. **DNS Zone (`wnp.app`)**: `A` record `bible` → `162.241.219.59` (TTL 14400)
3. **SSL**: Run AutoSSL for `wnp.app` / `bible.wnp.app` in cPanel SSL/TLS Status.
