#!/bin/sh
# Слага commit-msg hook, който пази критериите (SPEC §6).
cd "$(git rev-parse --show-toplevel)"
printf '#!/bin/sh\nPYTHONIOENCODING=utf-8 python tools/check-acceptance.py "$1"\n' > .git/hooks/commit-msg
chmod +x .git/hooks/commit-msg
echo "hook ok"
