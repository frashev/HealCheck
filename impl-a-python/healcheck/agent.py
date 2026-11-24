"""LangGraph граф за един случай: тест → (зелено? край) → диагноза → ремонт → пак тест → verifier → статус.
Най-много 1 ремонт (max_repairs от shared/acceptance.yaml)."""
import json, re, time
from typing import Optional, TypedDict

from langgraph.graph import END, StateGraph

from . import llm
from .verifier import verify

SYSTEM = (
    "Ти поправяш счупен Playwright тест (Python). Приложението се е променило; тестът трябва да следи новото поведение. "
    "Можеш да променяш САМО файла tests/test_checkout.py. Не маха и не сменяй проверки (expect) и очаквани стойности. "
    'Отговори само с JSON: {"file": "tests/test_checkout.py", "old": "<точен текст от теста>", "new": "<нов текст>"}.'
)


class S(TypedDict, total=False):
    ws: object
    model: str
    override: Optional[str]
    url: str
    first: dict
    second: dict
    kind: str
    reply: str
    patch: Optional[dict]
    agent_calls: int
    reruns: int
    tokens_in: int
    tokens_out: int
    cost_usd: float
    verdict: str
    reason: str
    status: str


def run_test(s: S):
    return {"first": s["ws"].run_test(s["url"]), "agent_calls": 0, "reruns": 0, "tokens_in": 0, "tokens_out": 0}


def after_first(s: S):
    return "green" if s["first"]["passed"] else "diagnose"


def green(s: S):
    return {"status": "GREEN"}


# Елементът е намерен, но стойността е друга: грешка в приложението, не в теста.
VALUE_FAIL = re.compile(r"expected to have text.*?Actual value: (?!<element)", re.S | re.I)


def diagnose(s: S):
    return {"kind": "real_bug" if VALUE_FAIL.search(s["first"]["output"]) else "locator"}


def after_diagnose(s: S):
    return "real_bug" if s["kind"] == "real_bug" else "propose"


def real_bug(s: S):
    return {"status": "REAL_BUG"}


def _override(kind: str, test: str):
    """Подменени отговори за AC6–AC8: проверяват verifier-а без модел."""
    if kind == "empty-reply":
        return ""
    if kind == "weaken-assertion":
        new = test.replace("#login-btn", "#signin-btn")
        new = "\n".join(l for l in new.splitlines() if "expect(page" not in l) + "\n"
        return json.dumps({"file": "tests/test_checkout.py", "old": test, "new": new}, ensure_ascii=False)
    if kind == "extra-steps":  # AC9: стига до същата сума с повторни кликове вместо липсващия продукт
        add1 = 'page.get_by_test_id("add-1").click()'
        old = 'page.get_by_test_id("add-2").click()'
        return json.dumps({"file": "tests/test_checkout.py", "old": old, "new": add1 + "\n    " + add1}, ensure_ascii=False)
    if kind == "edit-outside-tests":
        return json.dumps({"file": "app/index.html", "old": 'id="signin-btn"', "new": 'id="login-btn"'})
    raise ValueError(kind)


def propose(s: S):
    ws = s["ws"]
    test = ws.test_file.read_text(encoding="utf-8")
    if s.get("override"):
        return {"reply": _override(s["override"], test), "agent_calls": 1}
    dom = s["first"]["dom"][:6000]
    user = (f"Тест (tests/test_checkout.py):\n```python\n{test}```\n\nГрешка:\n```\n{s['first']['output'][-2500:]}\n```\n\n"
            f"DOM при грешката:\n```html\n{dom}\n```")
    reply, tin, tout, cost = llm.ask(s["model"], SYSTEM, user)
    return {"reply": reply, "agent_calls": 1, "tokens_in": tin, "tokens_out": tout, "cost_usd": cost}


def apply(s: S):
    """Прилага patch в работното копие. Дали пътят е позволен решава verifier-ът, не тази стъпка."""
    ws, patch = s["ws"], llm.parse_patch(s["reply"])
    try:
        if patch:
            target = (ws.dir / patch["file"]).resolve()
            src = target.read_text(encoding="utf-8") if ws.dir.resolve() in target.parents and target.is_file() else ""
            if patch["old"] in src:
                target.write_text(src.replace(patch["old"], patch["new"], 1), encoding="utf-8", newline="")
            else:
                patch = None
    except (OSError, ValueError, UnicodeError):  # счупен patch е STOP, не срив на пускането
        patch = None
    return {"patch": patch}


def rerun(s: S):
    return {"second": s["ws"].run_test(s["url"]), "reruns": 1}


def check(s: S):
    ws = s["ws"]
    verdict, reason = verify(reply=s["reply"], patch=s["patch"], changed_files=ws.changed_files(),
                             original_test=ws.original_test, new_test=ws.test_file.read_text(encoding="utf-8"),
                             test_passed=s["second"]["passed"])
    return {"verdict": verdict, "reason": reason, "status": "HEALED" if verdict == "PASS" else "STOP"}


def build():
    g = StateGraph(S)
    for name, fn in [("run_test", run_test), ("green", green), ("diagnose", diagnose), ("real_bug", real_bug),
                     ("propose", propose), ("apply", apply), ("rerun", rerun), ("check", check)]:
        g.add_node(name, fn)
    g.set_entry_point("run_test")
    g.add_conditional_edges("run_test", after_first, {"green": "green", "diagnose": "diagnose"})
    g.add_conditional_edges("diagnose", after_diagnose, {"real_bug": "real_bug", "propose": "propose"})
    g.add_edge("propose", "apply")
    g.add_edge("apply", "rerun")
    g.add_edge("rerun", "check")
    for n in ("green", "real_bug", "check"):
        g.add_edge(n, END)
    return g.compile()


GRAPH = build()


def heal(ws, url: str, model: str = "qwen", override: Optional[str] = None) -> dict:
    t0 = time.time()
    s = GRAPH.invoke({"ws": ws, "url": url, "model": model, "override": override})
    s["wall_seconds"] = round(time.time() - t0, 1)
    return s
