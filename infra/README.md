# Vouch infra

- Region: ap-south-1, instance `i-0d040cb4f537ed587` (t3.small, Ubuntu 24.04, 20 GB gp3), tag Name=vouch-api
- Elastic IP: `3.6.221.166` (allocation eipalloc-0e7d61c2eeffb71df), security group `sg-06bc56e8968cae022` (80/443 open, 22 only from deploy machine IP at creation time)
- Cloudflare zone spacesdrive.cc: b152483853eef3cccdf50becec773925 (SSL mode: strict, untouched)
- DNS: `api.vouch.spacesdrive.cc` A -> 3.6.221.166 (DNS-only); `vouch.spacesdrive.cc` CNAME -> vouch-web.pages.dev (proxied)
- Pages project: vouch-web (https://vouch-web.pages.dev)

## Deploy API
`./deploy.sh` (needs ../api/Dockerfile and ../api/.env). Ships api + compose + Caddyfile to /opt/vouch, runs `docker compose up -d --build`, then checks /healthz. Caddy auto-issues a Let's Encrypt cert.

## Deploy web
`export CLOUDFLARE_API_TOKEN=...; ./deploy-web.sh`

## SSH
`ssh -i infra/vouch-key.pem ubuntu@3.6.221.166` (if your IP changed, update the sg port 22 rule via your AWS CLI profile).
