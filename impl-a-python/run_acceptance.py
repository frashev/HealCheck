"""Пуска AC1–AC8 от shared/acceptance.yaml, сравнява с expect и пише docs/runs/<дата>-a-<модел>-<таг>.md."""
import argparse, datetime, hashlib, pathlib, sys, traceback
import yaml

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from healcheck.agent import heal
from healcheck.verifier import assertion_values
from healcheck.workspace import ROOT, Workspace


def actual(s, ws):
    new_test = ws.test_file.read_text(encoding="utf-8")
    return {"status": s.get("status"), "agent_calls": s.get("agent_calls", 0), "reruns": s.get("reruns", 0),
            "verifier": s.get("verdict"), "reason": s.get("reason"),
            "changed_files": sorted({f.split("/")[0] + "/" for f in ws.changed_files()}),
            "assertion_kept": new_test.count("expect(") >= ws.original_test.count("expect(")
                              and assertion_values(new_test) == assertion_values(ws.original_test)}


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    ap =argparse.ArgumentParser()
    ap.add_argument("--model", default="qwen")
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--tag", default="1")
    args = ap.parse_args()
    raw = (ROOT / "shared" / "acceptance.yaml").read_bytes()
    want = (ROOT / "shared" / "acceptance.sha256").read_text(encoding="utf-8").strip()
    if hashlib.sha256(raw).hexdigest() != want:  # критериите са сменени без [acceptance] commit
        sys.exit("СТОП: shared/acceptance.yaml не съвпада с shared/acceptance.sha256")
    spec = yaml.safe_load(raw.decode("utf-8"))
    known = {c["id"] for c in spec["cases"]}
    if args.only and not set(args.only) <= known:
        sys.exit(f"СТОП: непознати AC в --only: {sorted(set(args.only) - known)}")
    rows, tin, tout, wall, healed, tried, cost = [], 0, 0, 0.0, 0, 0, 0.0
    for case in spec["cases"]:
        if args.only and case["id"] not in args.only:
            continue
        try:
            ws = Workspace(case["id"], case["fixture"])
            with ws.serve() as url:
                s = heal(ws, url, args.model, case.get("agent_override"))
            a = actual(s, ws)
        except Exception as e:  # срив в един случай е несъвпадение, не край на пускането
            traceback.print_exc()
            s = {"wall_seconds": 0.0}
            a = {"status": "CRASH", "reason": f"{type(e).__name__}", "agent_calls": 0}
        miss = {k: (v, a.get(k)) for k, v in case["expect"].items() if a.get(k) != v}
        tin += s.get("tokens_in", 0); tout += s.get("tokens_out", 0); cost += s.get("cost_usd", 0.0); wall += s["wall_seconds"]
        if case["fixture"] in ("rename-id", "change-button-text", "remove-feature") and not case.get("agent_override"):
            tried += 1; healed += a["status"] == "HEALED"
        rows.append((case["id"], case["fixture"], case.get("agent_override") or "", a["status"], a["reason"] or "",
                     a["agent_calls"], s["wall_seconds"], "ДА" if not miss else f"НЕ {miss}"))
        print(f"{case['id']}: {a['status']} {a['reason'] or ''} ({s['wall_seconds']} s) {'ok' if not miss else miss}", flush=True)
    ok = sum(r[-1] == "ДА" for r in rows)
    day = datetime.date.today().isoformat()
    out = ROOT / "docs" / "runs" / f"{day}-a-{args.model}-{args.tag}.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    partial = f" · ЧАСТИЧНО ({', '.join(args.only)})" if args.only else ""
    lines = [f"# HealCheck А · {day} · модел {args.model} · пускане {args.tag}{partial}", "",
             f"Съвпадение с expect: **{ok} от {len(rows)}**", "",
             f"fix_rate {healed}/{tried} (истински ремонти от повреди, без подмените отговори) · wall_seconds {wall:.1f} · "
             f"tokens_in {tin} · tokens_out {tout} · cost_usd {cost:.4f}{' (местен модел)' if args.model == 'qwen' else ' (по цените на API; плаща се от абонамента)'}", "",
             "| AC | повреда | подмяна | статус | причина | извиквания | сек | съвпада |", "|---|---|---|---|---|---|---|---|"]
    lines += ["| " + " | ".join(str(x) for x in r) + " |" for r in rows]
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"запис: {out}")
    sys.exit(0 if rows and ok == len(rows) else 1)


if __name__ == "__main__":
    main()
