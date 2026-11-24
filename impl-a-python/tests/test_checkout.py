import os
from playwright.sync_api import expect


def test_checkout(app_page):
    page = app_page
    page.goto(os.environ["APP_URL"])
    page.get_by_role("button", name="Вход").click()
    page.fill("#user", "Филип")
    page.click("#login-btn")
    page.get_by_test_id("add-1").click()
    page.get_by_test_id("add-2").click()
    expect(page.locator("#total")).to_have_text("30,00")
