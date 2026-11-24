import os, pathlib
import pytest
from playwright.sync_api import sync_playwright

DUMP = pathlib.Path(os.environ.get("HEALCHECK_DOM", "dom.html"))


@pytest.fixture
def app_page(request):
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.set_default_timeout(3000)
        yield page
        rep = getattr(request.node, "rep_call", None)
        if rep is not None and rep.failed:
            DUMP.write_text(page.content(), encoding="utf-8")
        browser.close()


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    rep = outcome.get_result()
    if rep.when == "call":
        item.rep_call = rep
