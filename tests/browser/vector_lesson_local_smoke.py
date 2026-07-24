from playwright.sync_api import sync_playwright


def main() -> None:
    console_errors: list[str] = []
    failed_requests: list[str] = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page.on(
            "console",
            lambda message: console_errors.append(message.text)
            if message.type == "error"
            else None,
        )
        page.on(
            "requestfailed",
            lambda request: failed_requests.append(f"{request.method} {request.url}"),
        )
        page.goto("http://localhost:5173/app/curriculum")
        page.wait_for_load_state("networkidle")

        start = page.get_by_role("button", name="Start Vectors and Trigonometry")
        if start.count() == 0:
            raise AssertionError(
                {
                    "url": page.url,
                    "body": page.locator("body").inner_text(),
                    "console_errors": console_errors,
                    "failed_requests": failed_requests,
                }
            )
        assert start.is_enabled()
        start.click()
        page.wait_for_url("**/app/lessons/vectors-and-trigonometry")
        page.get_by_role(
            "heading", name="Starting check: Resolve and combine vectors"
        ).wait_for()

        page.get_by_role("radio", name="+3").focus()
        page.keyboard.press("Space")
        page.get_by_role("button", name="Record my starting point").click()
        page.get_by_role("heading", name="Starting point recorded").wait_for()

        page.reload()
        page.wait_for_load_state("networkidle")
        page.get_by_role("heading", name="Starting point recorded").wait_for()

        assert not console_errors, console_errors
        assert not failed_requests, failed_requests
        browser.close()
    print("local-vector-lesson-smoke: PASS")


if __name__ == "__main__":
    main()
