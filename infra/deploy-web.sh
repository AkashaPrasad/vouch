#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../web"
: "${CLOUDFLARE_API_TOKEN:?set CLOUDFLARE_API_TOKEN}"
export CLOUDFLARE_API_TOKEN
export CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-8c3836c859b7bdeb63ab0f7d55dd9b05}"
export VITE_API_BASE_URL=https://api.vouch.spacesdrive.cc
export VITE_GOOGLE_CLIENT_ID=591888660147-t460lgcdc4ev47thu90sdjjov19mnolb.apps.googleusercontent.com
npm ci && npm run build
npx -y wrangler pages deploy dist --project-name vouch-web --branch main --commit-dirty=true
