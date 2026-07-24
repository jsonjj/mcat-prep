import json
import os
from hashlib import sha256
from pathlib import Path
from typing import Any

from playwright.sync_api import BrowserContext, Page, Route, sync_playwright


BASE_URL = os.environ.get("VECTOR_LESSON_BASE_URL", "http://127.0.0.1:5173")
RUN_ID = "10000000-0000-4000-8000-000000000010"
LEARNER_ID = "11111111-1111-4111-8111-111111111111"
EVIDENCE_DIR = Path(__file__).parent / "evidence" / "v3-les-130923"
REPO_ROOT = Path(__file__).parents[2]


def progress(stage: str, part: int = 1, label: str = "Resolve and combine vectors") -> dict[str, Any]:
    return {
        "currentPart": part,
        "totalParts": 3,
        "currentPartLabel": label,
        "stageLabel": stage,
    }


def question_screen(
    token: str,
    heading: str,
    prompt: str,
    choices: list[dict[str, str]],
) -> dict[str, Any]:
    return {
        "kind": "QUESTION",
        "screenToken": token,
        "heading": heading,
        "prompt": prompt,
        "choices": choices,
        "primaryActionLabel": "Check my answer",
        "supportActionLabel": None,
        "support": None,
        "visual": None,
    }


def feedback_screen(token: str, heading: str, body: str, action: str) -> dict[str, Any]:
    return {
        "kind": "FEEDBACK",
        "screenToken": token,
        "heading": heading,
        "outcome": "TRY_A_DIFFERENT_ANGLE" if "Review" in heading else "CORRECT",
        "body": [body],
        "primaryActionLabel": action,
    }


def content_screen(token: str, heading: str, body: str, action: str) -> dict[str, Any]:
    return {
        "kind": "CONTENT",
        "screenToken": token,
        "heading": heading,
        "body": [body],
        "primaryActionLabel": action,
        "visual": {
            "kind": "COMPONENTS",
            "title": "Signed component ledger",
            "textEquivalent": (
                "The horizontal and vertical inputs retain their printed signs; "
                "the resultant is not supplied."
            ),
            "tokens": [
                {"label": "First step", "value": "mark each direction sign"},
                {"label": "Second step", "value": "combine matching axes"},
            ],
        },
    }


def completion_screen(token: str) -> dict[str, Any]:
    return {
        "kind": "COMPLETION",
        "screenToken": token,
        "heading": "You finished this lesson’s required instruction.",
        "body": [],
        "primaryActionLabel": "Back to curriculum",
    }


class MockLessonAuthority:
    def __init__(self, scenario: str, started: bool = False) -> None:
        self.scenario = scenario
        self.started = started
        self.index = 0
        self.stream = 0
        self.calls: list[dict[str, Any]] = []

    def current_view(self) -> dict[str, Any]:
        if self.scenario == "happy":
            screens = [
                question_screen(
                    "happy-question",
                    "Starting check: Resolve and combine vectors",
                    "An arrow points 3 units east. If east is positive x, what is its signed x-component?",
                    [
                        {"id": "A", "text": "+3"},
                        {"id": "B", "text": "−3"},
                        {"id": "C", "text": "0"},
                        {"id": "D", "text": "Not sure yet"},
                    ],
                ),
                feedback_screen(
                    "happy-feedback",
                    "Starting point recorded",
                    "The signed relationship has been recorded after commitment.",
                    "Begin the lesson",
                ),
                content_screen(
                    "happy-content",
                    "Build the relationship",
                    "Keep direction as a sign, align matching axes, then combine.",
                    "Continue",
                ),
                completion_screen("happy-complete"),
            ]
        else:
            screens = [
                question_screen(
                    "repair-near",
                    "Final check: Resolve and combine vectors",
                    "A displacement is 6 east, 2 north, then 4 west, 5 south. What is the resultant?",
                    [
                        {"id": "A", "text": "10 east, 7 north"},
                        {"id": "B", "text": "2 east, 3 south"},
                        {"id": "C", "text": "2 east, 7 north"},
                        {"id": "D", "text": "10 east, 3 south"},
                    ],
                ),
                feedback_screen(
                    "repair-feedback",
                    "Review the exact step that changed the result.",
                    "The westward component must remain negative before the components combine.",
                    "Review the model",
                ),
                content_screen(
                    "repair-content",
                    "Repair the exact failed function",
                    "Mark west and south negative, then correct the first divergent component only.",
                    "Try a fresh confirmation",
                ),
                question_screen(
                    "repair-reentry",
                    "Fresh check: Resolve and combine vectors",
                    "A path goes 7 west, 1 north, then 2 east, 4 south. What is the resultant?",
                    [
                        {"id": "A", "text": "9 west, 5 north"},
                        {"id": "B", "text": "5 east, 3 north"},
                        {"id": "C", "text": "5 west, 3 south"},
                        {"id": "D", "text": "9 west, 3 south"},
                    ],
                ),
                feedback_screen(
                    "repair-correct",
                    "The fresh exact re-entry is complete.",
                    "The fresh response preserves both signed components.",
                    "Review this part",
                ),
                completion_screen("repair-complete"),
            ]
        screen = screens[min(self.index, len(screens) - 1)]
        complete = screen["kind"] == "COMPLETION"
        return {
            "lessonTitle": "Vectors and Trigonometry",
            "runId": RUN_ID,
            "state": "DELIVERY_COMPLETE" if complete else "IN_PROGRESS",
            "progress": (
                progress("Complete", 3, "Apply right-hand rules")
                if complete
                else progress(self._stage_label(screen))
            ),
            "screen": screen,
        }

    @staticmethod
    def _stage_label(screen: dict[str, Any]) -> str:
        token = screen["screenToken"]
        if token == "happy-question":
            return "Starting check"
        if token == "happy-content":
            return "Explain"
        if token == "repair-reentry":
            return "Fresh check"
        return {
            "QUESTION": "Final check",
            "FEEDBACK": "Feedback",
            "CONTENT": "Review and retry",
        }.get(screen["kind"], "Focus now")

    def handle(self, route: Route) -> None:
        request = route.request
        path = request.url.split("?", 1)[0]
        self.calls.append({"method": request.method, "url": path})
        if path.endswith("/v1/bootstrap"):
            payload = {
                "learnerId": LEARNER_ID,
                "accountState": "guest",
                "bankStatus": "loaded",
                "contentRelease": "synthetic-2026.07",
                "apiVersion": "v1",
                "onboardingComplete": True,
                "serverTime": "2026-07-23T18:00:00.000Z",
                "streamVersion": self.stream,
                "csrfToken": "csrf-token-with-at-least-32-characters",
            }
        elif path.endswith("/status"):
            payload = {
                "availability": "AVAILABLE",
                "runState": (
                    "DELIVERY_COMPLETE"
                    if self.started and self.current_view()["state"] == "DELIVERY_COMPLETE"
                    else "IN_PROGRESS" if self.started else "NOT_STARTED"
                ),
                "actionLabel": "Continue" if self.started else "Start",
            }
        elif path.endswith("/start"):
            self.started = True
            self.stream += 1
            payload = {
                "runId": RUN_ID,
                "disposition": "STARTED" if self.stream == 1 else "RESUMED",
                "path": "/app/lessons/vectors-and-trigonometry",
                "streamVersion": self.stream,
            }
        elif path.endswith("/run"):
            payload = self.current_view()
        elif path.endswith("/commands"):
            command = request.post_data_json
            action = command["action"]["type"]
            if action in {"SUBMIT_RESPONSE", "CONTINUE"}:
                self.index += 1
            self.stream += 1
            payload = {
                "eventId": command["envelope"]["eventId"],
                "sequence": self.stream,
                "streamVersion": self.stream,
                "acceptedAt": "2026-07-23T18:00:01.000Z",
            }
        else:
            route.fulfill(status=404, content_type="application/json", body="{}")
            return
        route.fulfill(
            status=200,
            content_type="application/json",
            headers={"access-control-allow-origin": BASE_URL, "access-control-allow-credentials": "true"},
            body=json.dumps(payload),
        )


def attach_observers(page: Page, authority: MockLessonAuthority) -> tuple[list[str], list[str]]:
    console_errors: list[str] = []
    failed_requests: list[str] = []
    page.on(
        "console",
        lambda message: console_errors.append(message.text) if message.type == "error" else None,
    )
    page.on(
        "requestfailed",
        lambda request: failed_requests.append(f"{request.method} {request.url}"),
    )
    page.route("**/v1/**", authority.handle)
    return console_errors, failed_requests


def assert_no_horizontal_overflow(page: Page) -> None:
    metrics = page.evaluate(
        """() => ({
          document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          main: document.querySelector('main')?.scrollWidth - document.querySelector('main')?.clientWidth,
          offenders: [...document.querySelectorAll('body *')]
            .map((node) => ({ node, rect: node.getBoundingClientRect() }))
            .filter(({ node, rect }) =>
              rect.right > document.documentElement.clientWidth + 1 ||
              rect.left < -1 ||
              node.scrollWidth - node.clientWidth > 1
            )
            .slice(0, 12)
            .map(({ node, rect }) => ({
              tag: node.tagName,
              className: node.className,
              text: node.textContent?.trim().slice(0, 60),
              left: rect.left,
              right: rect.right,
              width: rect.width,
              overflow: node.scrollWidth - node.clientWidth
            }))
        })"""
    )
    assert metrics["document"] <= 1, metrics
    assert metrics["main"] is None or metrics["main"] <= 1, metrics


def tab_to(page: Page, predicate: str, maximum: int = 40) -> None:
    for _ in range(maximum):
        page.keyboard.press("Tab")
        if page.evaluate(predicate):
            return
    raise AssertionError("Keyboard focus did not reach the expected control")


def setup_context(context: BrowserContext, authority: MockLessonAuthority) -> tuple[Page, list[str], list[str]]:
    page = context.new_page()
    console_errors, failed_requests = attach_observers(page, authority)
    return page, console_errors, failed_requests


def curriculum_and_happy_path(browser: Any) -> dict[str, Any]:
    authority = MockLessonAuthority("happy")
    context = browser.new_context(viewport={"width": 1440, "height": 1000}, color_scheme="light")
    page, console_errors, failed_requests = setup_context(context, authority)
    page.goto(f"{BASE_URL}/app/curriculum")
    page.wait_for_load_state("networkidle")
    target_start = page.get_by_role("button", name="Start Vectors and Trigonometry")
    if target_start.count() == 0:
        raise AssertionError(
            {
                "url": page.url,
                "body": page.locator("body").inner_text(),
                "calls": authority.calls,
            }
        )
    target_start.wait_for()
    page.wait_for_function(
        """() => {
          const button = [...document.querySelectorAll('button')]
            .find((node) => node.getAttribute('aria-label') === 'Start Vectors and Trigonometry');
          return button instanceof HTMLButtonElement && !button.disabled;
        }"""
    )

    disabled = 0
    enabled = 0
    phase_tabs = page.get_by_role("tab")
    for index in range(phase_tabs.count()):
        phase_tabs.nth(index).click()
        cards = page.locator(".mc-curriculum__lesson")
        for card_index in range(cards.count()):
            card = cards.nth(card_index)
            action = card.locator("button").last
            card_text = card.text_content() or ""
            if "Vectors and Trigonometry" in card_text:
                page.wait_for_function(
                    """() => {
                      const button = [...document.querySelectorAll('button')]
                        .find((node) => node.getAttribute('aria-label') === 'Start Vectors and Trigonometry');
                      return button instanceof HTMLButtonElement && !button.disabled;
                    }"""
                )
                assert action.is_enabled()
                assert "Coming soon" not in card_text
                enabled += 1
            else:
                assert action.is_disabled(), card_text
                assert "Coming soon" in card_text
                disabled += 1
    assert enabled == 1, {
        "enabled": enabled,
        "calls": authority.calls,
        "target": target_start.evaluate("(node) => node.outerHTML"),
    }
    assert disabled == 113, disabled

    phase_tabs.nth(0).click()
    start = page.get_by_role("button", name="Start Vectors and Trigonometry")
    assert start.is_enabled()
    start.click()
    page.wait_for_url("**/app/lessons/vectors-and-trigonometry")
    page.wait_for_load_state("networkidle")
    assert page.title() == "Vectors and Trigonometry | MCAT Mastery"
    assert page.locator("figure").count() == 0
    page.screenshot(path=str(EVIDENCE_DIR / "happy-start-desktop.png"), full_page=True)
    assert_no_horizontal_overflow(page)

    assert page.locator("h1").evaluate("(node) => node === document.activeElement")
    tab_to(
        page,
        "() => document.activeElement?.matches('input[type=radio]') === true",
    )
    page.keyboard.press("Space")
    tab_to(
        page,
        "() => document.activeElement?.textContent?.includes('Check my answer') === true",
    )
    page.keyboard.press("Enter")
    page.get_by_role("heading", name="Starting point recorded").wait_for()
    assert page.locator("h1").evaluate("(node) => node === document.activeElement")

    page.get_by_role("button", name="Begin the lesson").click()
    page.get_by_role("heading", name="Build the relationship").wait_for()
    page.get_by_role("button", name="Continue", exact=True).click()
    page.get_by_role(
        "heading", name="You finished this lesson’s required instruction."
    ).wait_for()
    page.screenshot(path=str(EVIDENCE_DIR / "happy-completion-light.png"), full_page=True)

    theme = page.get_by_role("button", name="Switch to dark theme")
    theme.click()
    page.screenshot(path=str(EVIDENCE_DIR / "happy-completion-dark.png"), full_page=True)
    assert page.locator("html").get_attribute("data-theme") == "dark"
    assert not console_errors, console_errors
    assert not failed_requests, failed_requests
    result = {
        "disabled_unavailable_lessons": disabled,
        "enabled_lessons": enabled,
        "console_errors": console_errors,
        "failed_requests": failed_requests,
    }
    context.close()
    return result


def repair_resume_mobile_path(browser: Any) -> dict[str, Any]:
    authority = MockLessonAuthority("repair", started=True)
    context = browser.new_context(
        viewport={"width": 1280, "height": 900},
        color_scheme="light",
        reduced_motion="reduce",
    )
    page, console_errors, failed_requests = setup_context(context, authority)
    page.goto(f"{BASE_URL}/app/lessons/vectors-and-trigonometry")
    page.wait_for_load_state("networkidle")
    assert page.evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches")

    first_radio = page.get_by_role("radio").first
    first_radio.focus()
    page.keyboard.press("Space")
    page.get_by_role("button", name="Check my answer").focus()
    page.keyboard.press("Enter")
    page.get_by_role(
        "heading", name="Review the exact step that changed the result."
    ).wait_for()
    page.screenshot(path=str(EVIDENCE_DIR / "repair-feedback-desktop.png"), full_page=True)

    page.get_by_role("button", name="Review the model").click()
    page.get_by_role("heading", name="Repair the exact failed function").wait_for()
    page.get_by_role("button", name="Try a fresh confirmation").click()
    page.get_by_role("heading", name="Fresh check: Resolve and combine vectors").wait_for()
    page.screenshot(path=str(EVIDENCE_DIR / "repair-exact-reentry-desktop.png"), full_page=True)

    prompt_before = page.locator("legend").inner_text()
    page.reload()
    page.wait_for_load_state("networkidle")
    page.get_by_role("heading", name="Fresh check: Resolve and combine vectors").wait_for()
    assert page.locator("legend").inner_text() == prompt_before
    assert page.get_by_role("radio").first.is_checked() is False
    page.screenshot(path=str(EVIDENCE_DIR / "repair-refresh-resume.png"), full_page=True)

    page.set_viewport_size({"width": 375, "height": 812})
    assert_no_horizontal_overflow(page)
    page.screenshot(path=str(EVIDENCE_DIR / "repair-mobile-375.png"), full_page=True)
    page.set_viewport_size({"width": 320, "height": 760})
    assert_no_horizontal_overflow(page)
    page.screenshot(path=str(EVIDENCE_DIR / "repair-mobile-320.png"), full_page=True)

    page.evaluate("document.documentElement.style.fontSize = '200%'")
    assert_no_horizontal_overflow(page)
    assert page.locator(".mc-skip-link").evaluate(
        "(node) => node.getBoundingClientRect().bottom <= 0"
    )
    primary = page.get_by_role("button", name="Check my answer")
    primary.scroll_into_view_if_needed()
    assert primary.is_visible()
    page.screenshot(path=str(EVIDENCE_DIR / "repair-mobile-320-text-200.png"), full_page=True)
    assert not console_errors, console_errors
    assert not failed_requests, failed_requests
    result = {
        "resume_prompt": prompt_before,
        "reduced_motion": True,
        "viewports": ["1280", "375", "320", "320-text-200"],
        "console_errors": console_errors,
        "failed_requests": failed_requests,
    }
    context.close()
    return result


def main() -> None:
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        happy = curriculum_and_happy_path(browser)
        repair = repair_resume_mobile_path(browser)
        script = json.loads(
            (REPO_ROOT / "content/lessons/v3-les-130923/lesson-script.json").read_text(
                encoding="utf-8"
            )
        )
        coverage = json.loads(
            (REPO_ROOT / "content/lessons/v3-les-130923/kc-coverage-matrix.json").read_text(
                encoding="utf-8"
            )
        )
        presentation = json.loads(
            (
                REPO_ROOT
                / "content/lessons/v3-les-130923/lesson-presentation-plan.json"
            ).read_text(encoding="utf-8")
        )
        screenshots = sorted(path for path in EVIDENCE_DIR.glob("*.png"))
        report = {
            "lesson": "Vectors and Trigonometry",
            "lesson_id": "V3-LES-130923",
            "browser": browser.version,
            "learner_route": "/app/lessons/vectors-and-trigonometry",
            "authority_mode": (
                "STATEFUL_PLAYWRIGHT_ROUTE_MOCK_FOR_UI; "
                "REAL_KERNEL_AND_PERSISTENCE_CONTRACT_COVERED_BY_VECTOR_LESSON_API_TEST"
            ),
            "artifact_hashes": {
                "lesson_script": script["content_sha256"],
                "kc_coverage_matrix": coverage["content_sha256"],
                "lesson_presentation_plan": presentation["content_sha256"],
            },
            "happy": happy,
            "repair_resume_mobile": repair,
            "screen_evidence": [
                {
                    "screen_id": "vtr-vectors-screen-entry",
                    "file": "happy-start-desktop.png",
                    "viewport": "1440x1000",
                    "theme": "light",
                },
                {
                    "screen_id": "vtr-vectors-screen-near-exit",
                    "file": "repair-feedback-desktop.png",
                    "viewport": "1280x900",
                    "theme": "light",
                },
                {
                    "screen_id": "vtr-vectors-screen-reentry-near",
                    "file": "repair-exact-reentry-desktop.png",
                    "viewport": "1280x900",
                    "theme": "light",
                },
                {
                    "screen_id": "lesson-delivery-complete",
                    "file": "happy-completion-dark.png",
                    "viewport": "1440x1000",
                    "theme": "dark",
                },
            ],
            "screenshots": [path.name for path in screenshots],
            "evidence_sha256": {
                path.name: sha256(path.read_bytes()).hexdigest() for path in screenshots
            },
        }
        (EVIDENCE_DIR / "browser-report.json").write_text(
            json.dumps(report, indent=2) + "\n", encoding="utf-8"
        )
        browser.close()
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
