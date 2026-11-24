"""Работно копие за един случай: app + tests, повреда, местен сървър, пускане на теста."""
import contextlib, functools, http.server, json, os, pathlib, re, shutil, subprocess, sys, threading

ROOT = pathlib.Path(__file__).resolve().parents[2]
IMPL = ROOT / "impl-a-python"


class Workspace:
    def __init__(self, case_id: str, fixture: str):
        self.dir = ROOT / "work" / case_id
        shutil.rmtree(self.dir, ignore_errors=True)
        shutil.copytree(ROOT / "shared" / "app", self.dir / "app")
        shutil.copytree(IMPL / "tests", self.dir / "tests", ignore=shutil.ignore_patterns("__pycache__"))
        if fixture != "none":
            spec = json.loads((ROOT / "shared" / "fixtures" / f"{fixture}.json").read_text(encoding="utf-8"))
            for e in spec["edits"]:
                f = self.dir / "app" / e["file"]
                s = f.read_text(encoding="utf-8")
                assert s.count(e["old"]) == 1, f"повредата {fixture} не пасва на {e['file']}"
                f.write_text(s.replace(e["old"], e["new"]), encoding="utf-8", newline="")
        self.test_file = self.dir / "tests" / "test_checkout.py"
        self.original_test = self.test_file.read_text(encoding="utf-8")
        self.snapshot = self._snapshot()

    def _snapshot(self):
        return {p.relative_to(self.dir).as_posix(): p.read_bytes()
                for p in self.dir.rglob("*") if p.is_file() and "__pycache__" not in p.parts
                and p.name not in ("dom.html",) and ".pytest_cache" not in p.parts}

    def changed_files(self):
        now = self._snapshot()
        keys = set(now) | set(self.snapshot)
        return sorted(k for k in keys if now.get(k) != self.snapshot.get(k))

    @contextlib.contextmanager
    def serve(self):
        handler = functools.partial(_Quiet, directory=str(self.dir / "app"))
        with http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler) as srv:
            t = threading.Thread(target=srv.serve_forever, daemon=True)
            t.start()
            try:
                yield f"http://127.0.0.1:{srv.server_address[1]}/index.html"
            finally:
                srv.shutdown()

    def run_test(self, url: str):
        dom = self.dir / "dom.html"
        dom.unlink(missing_ok=True)
        env = dict(os.environ, APP_URL=url, HEALCHECK_DOM=str(dom), PYTHONIOENCODING="utf-8")
        try:
            r = subprocess.run([sys.executable, "-m", "pytest", "-q", "-x", "-p", "no:cacheprovider", "-p", "no:playwright",
                                "--tb=short", "-rA", str(self.dir / "tests")], capture_output=True, text=True, encoding="utf-8",
                               env=env, timeout=120)
            out = r.stdout + r.stderr
        except subprocess.TimeoutExpired:
            r, out = None, "TIMEOUT: тестът не завърши за 120 s"
        # Минал = точно 1 passed и нищо пропуснато (skip/xfail не е минал тест; находка от прегледа, 24.11).
        summary = out.strip().splitlines()[-1] if out.strip() else ""
        passed = (r is not None and r.returncode == 0 and re.search(r"\b1 passed\b", summary) is not None
                  and not re.search(r"skipped|xfail|xpass|error|deselected", summary))
        return {"passed": passed, "output": out[-6000:],
                "dom": dom.read_text(encoding="utf-8") if dom.exists() else ""}


class _Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass
