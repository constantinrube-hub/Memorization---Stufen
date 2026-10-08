#!/bin/sh
# regression suite: sh dev/run.sh  (serves the page locally and runs every test file)
cd "$(dirname "$0")"; PORT=${PORT:-8765}; export PORT
node serve.js & SRV=$!; sleep 1; FAIL=0
for t in core ui map groups caps sync maps2 phone sched folders backup; do [ -f $t.js ] || continue; echo "== $t"; node $t.js > /tmp/stufen-$t.log 2>&1 || FAIL=1; grep -c '^PASS' /tmp/stufen-$t.log | sed 's/^/   passed: /'; grep -v '^PASS' /tmp/stufen-$t.log | sed 's/^/   /'; done
kill $SRV; [ $FAIL = 0 ] && echo "ALL GREEN" || echo "FAILURES"; exit $FAIL
