#!/bin/sh
# end-to-end test of the Cloudflare side: sh dev/cloud.sh
# starts the site locally with an empty database (needs wrangler: npm i -g wrangler, or set WRANGLER), then runs dev/cloud.js
cd "$(dirname "$0")/.."; CPORT=${CPORT:-8799}; export CPORT; WR=${WRANGLER:-wrangler}; DIR=$(mktemp -d)
$WR pages dev public --port $CPORT --d1 DB --binding STUFEN_PASSWORD=test-pass-1 --persist-to "$DIR" --compatibility-date 2026-01-01 > /tmp/stufen-wrangler.log 2>&1 & SRV=$!
for i in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$CPORT/api/session" && break; sleep 1; done
node dev/cloud.js > /tmp/stufen-cloud.log 2>&1; RC=$?
kill $SRV 2>/dev/null; rm -rf "$DIR"
grep -c '^PASS' /tmp/stufen-cloud.log | sed 's/^/passed: /'; grep -v '^PASS' /tmp/stufen-cloud.log
[ $RC = 0 ] && echo "ALL GREEN" || echo "FAILURES"; exit $RC
