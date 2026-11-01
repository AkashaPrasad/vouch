#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
EIP="${EIP:-3.6.221.166}"
KEY="$HERE/vouch-key.pem"
SSH_OPTS="-i $KEY -o StrictHostKeyChecking=accept-new -o ConnectTimeout=8"
[ -f "$HERE/../api/Dockerfile" ] || { echo "api/Dockerfile missing"; exit 1; }
[ -f "$HERE/../api/.env" ] || echo "WARN: api/.env missing; compose will fail"

echo "Waiting for SSH on $EIP..."
for i in $(seq 1 60); do
  ssh $SSH_OPTS ubuntu@$EIP 'cloud-init status --wait >/dev/null 2>&1; docker compose version >/dev/null 2>&1 && test -d /opt/vouch' 2>/dev/null && break
  [ $i -eq 60 ] && { echo "SSH/docker not ready"; exit 1; }
  sleep 10
done

TAR="$(mktemp -t vouch-deploy).tgz"
trap 'rm -f "$TAR"' EXIT
tar -C "$HERE/../.." -czf "$TAR" \
  --exclude='.venv' --exclude='__pycache__' --exclude='*.db' --exclude='node_modules' \
  vouch/api vouch/infra/docker-compose.yml vouch/infra/Caddyfile
scp $SSH_OPTS "$TAR" ubuntu@$EIP:/tmp/vouch-deploy.tgz
ssh $SSH_OPTS ubuntu@$EIP 'set -e; mkdir -p /opt/vouch; tar -xzf /tmp/vouch-deploy.tgz -C /opt/vouch --strip-components=1; cd /opt/vouch/infra && docker compose up -d --build'

echo "--- health checks"
sleep 5
curl -sk --max-time 20 https://api.vouch.spacesdrive.cc/healthz || echo "(https healthz failed; cert may still be issuing)"
echo
curl -s --max-time 20 http://$EIP/healthz || echo "(http healthz failed)"
echo
