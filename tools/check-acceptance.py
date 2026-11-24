"""commit-msg hook: shared/acceptance.yaml must match shared/acceptance.sha256.
Only a commit whose title contains [acceptance] (Filip's change) may change either file."""
import hashlib, pathlib, subprocess, sys

root = pathlib.Path(__file__).resolve().parent.parent
msg = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8") if len(sys.argv) > 1 else ""
title = msg.splitlines()[0] if msg else ""
staged = subprocess.run(["git", "diff", "--cached", "--name-only"], cwd=root, capture_output=True, text=True).stdout.split()
touched = [p for p in staged if p.startswith("shared/acceptance.")]
blob = subprocess.run(["git", "show", ":shared/acceptance.yaml"], cwd=root, capture_output=True).stdout
want = subprocess.run(["git", "show", ":shared/acceptance.sha256"], cwd=root, capture_output=True, text=True).stdout.strip()
got = hashlib.sha256(blob).hexdigest()
if touched and "[acceptance]" not in title:
    sys.exit(f"СТОП: {touched} се променят без [acceptance] в заглавието. Критериите са само за четене.")
if got != want:
    sys.exit(f"СТОП: хешът на shared/acceptance.yaml ({got[:12]}) не съвпада с shared/acceptance.sha256 ({want[:12]}).")
