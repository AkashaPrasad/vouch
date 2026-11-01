#!/usr/bin/env bash
# Runs every demo sample through the API so caches are warm before a demo.
API="${API_BASE_URL:-https://api.vouch.spacesdrive.cc}"
for f in "$(dirname "$0")"/samples/*.txt; do
  name=$(basename "$f")
  if [[ "$name" == *url* ]]; then
    body=$(python3 -c 'import json,sys;print(json.dumps({"url":open(sys.argv[1]).read().strip(),"channel":"web"}))' "$f")
  else
    body=$(python3 -c 'import json,sys;print(json.dumps({"text":open(sys.argv[1]).read(),"channel":"web"}))' "$f")
  fi
  id=$(curl -s -X POST "$API/api/checks" -H 'content-type: application/json' -d "$body" | python3 -c 'import json,sys;print(json.load(sys.stdin)["check_id"])')
  echo "$name -> $API/api/checks/$id"
done
