"""Shared e2e helpers: serve the repo on a free port, mock an OpenAI-compatible endpoint, check pages."""
import contextlib
import json
import pathlib
import socket
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
MOCK_BASE = 'https://mock-endpoint.test/v1'
MOCK_MODEL = 'mock-model-1'
MOCK_KEY = 'test-key-not-real'
CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
VIEWPORTS = {'mobile': (390, 844), 'desktop': (1440, 900)}
CHECKS = {'n': 0}


def check(cond, message):
    CHECKS['n'] += 1
    assert cond, message


def free_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


@contextlib.contextmanager
def serve():
    port = free_port()
    proc = subprocess.Popen(
        [sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1', '--directory', str(ROOT)],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(200):
            try:
                socket.create_connection(('127.0.0.1', port), 0.2).close()
                break
            except OSError:
                time.sleep(0.05)
        yield f'http://127.0.0.1:{port}/index.html'
    finally:
        proc.terminate()
        proc.wait(5)


class Mock:
    """Answers chat-completions posts to MOCK_BASE with a fixed reply and records the request bodies."""

    def __init__(self, reply):
        self.reply = reply
        self.requests = []

    def install(self, context):
        def handle(route, request):
            if request.method == 'OPTIONS':
                return route.fulfill(status=204, headers=CORS)
            self.requests.append(json.loads(request.post_data or '{}'))
            body = {'choices': [{'message': {'role': 'assistant', 'content': self.reply}}]}
            return route.fulfill(status=200, headers={**CORS, 'Content-Type': 'application/json'}, body=json.dumps(body))
        context.route(f'{MOCK_BASE}/chat/completions', handle)


def new_page(browser, size):
    width, height = VIEWPORTS[size]
    context = browser.new_context(viewport={'width': width, 'height': height})
    page = context.new_page()
    errors = []
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(str(e)))
    return context, page, errors


def check_page(page, errors, label):
    overflow = page.evaluate('() => document.documentElement.scrollWidth - document.documentElement.clientWidth')
    check(overflow <= 0, f'{label}: horizontal scroll by {overflow}px')
    check(not errors, f'{label}: console errors: {errors}')


def configure_live(page, base=MOCK_BASE, key=MOCK_KEY, model=MOCK_MODEL):
    page.click('#settings-toggle')
    page.fill('#cfg-base', base)
    page.fill('#cfg-key', key)
    page.fill('#cfg-model', model)
    page.check('#mode-live')
    page.click('#cfg-save')
    page.wait_for_selector('#cfg-status[data-kind=ok]')
    page.click('#settings-toggle')


def run_all(flow):
    """flow(browser, size) -> None. Runs for both viewports, prints the check count."""
    with serve() as url:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            try:
                for size in VIEWPORTS:
                    flow(browser, size, url)
            finally:
                browser.close()
    print(f'E2E PASS: {CHECKS["n"]} checks across {len(VIEWPORTS)} viewports')
