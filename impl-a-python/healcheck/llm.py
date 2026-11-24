"""Модел през OpenAI-съвместим API. Qwen на :8081 по подразбиране."""
import json, os, re
from openai import OpenAI

MODELS = {
    "qwen": {"base_url": "http://127.0.0.1:8081/v1", "model": "qwen3.8-27b-mtp", "key": "none"},
    "sonnet": {"base_url": "https://api.anthropic.com/v1/", "model": "claude-sonnet-5-5", "key_env": "ANTHROPIC_API_KEY"},
}


def ask_claude_cli(system: str, user: str):
    """Sonnet през `claude -p` (с абонамент, без ANTHROPIC_API_KEY)."""
    import subprocess
    r = subprocess.run(["claude", "-p", "--model", "sonnet", "--output-format", "json", "--tools", "",
                        "--system-prompt", system], input=user, capture_output=True, text=True, encoding="utf-8", timeout=300)
    d = json.loads(r.stdout)
    u = d.get("usage") or {}
    tin = u.get("input_tokens", 0) + u.get("cache_read_input_tokens", 0) + u.get("cache_creation_input_tokens", 0)
    return d.get("result") or "", tin, u.get("output_tokens", 0), d.get("total_cost_usd", 0.0)


def ask(model: str, system: str, user: str):
    if model == "sonnet-cli":
        return ask_claude_cli(system, user)
    cfg = MODELS[model]
    client = OpenAI(base_url=cfg["base_url"], api_key=cfg.get("key") or os.environ[cfg["key_env"]], timeout=300)
    extra = {"chat_template_kwargs": {"enable_thinking": False}} if model == "qwen" else {}
    r = client.chat.completions.create(model=cfg["model"], temperature=0, max_tokens=1500, extra_body=extra or None,
                                       messages=[{"role": "system", "content": system}, {"role": "user", "content": user}])
    u = r.usage
    return r.choices[0].message.content or "", (u.prompt_tokens if u else 0), (u.completion_tokens if u else 0), 0.0


def parse_patch(text: str):
    """Очаква JSON {"file","old","new"}; при всичко друго връща None."""
    start = (text or "").find("{")
    if start < 0:
        return None
    try:
        d, _ = json.JSONDecoder().raw_decode(text[start:])
    except ValueError:
        return None
    if not isinstance(d, dict):
        return None
    if not all(isinstance(d.get(k), str) for k in ("file", "old", "new")) or not d["old"]:
        return None
    return d
