"""E2E smoke for AI CRM: 390x844 and 1440x900. Demo flow, then the live briefing against a mock endpoint."""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from harness import ROOT, MOCK_MODEL, Mock, configure_live, check, check_page, new_page, run_all  # noqa: E402


def flow(browser, size, url):
    context, page, errors = new_page(browser, size)
    mock = Mock('MOCK-LIVE-BRIEF: Priorities: call Ravi first. Risk: Jon has gone quiet.')
    mock.install(context)
    page.goto(url)
    page.wait_for_selector('#leads-table')
    check('Demo mode' in page.inner_text('#mode-badge'), f'{size}: demo badge')
    check(page.locator('#leads-table tbody tr').count() == 6, f'{size}: six sample leads')

    page.fill('#paste-text', 'Name: Kiran Das\nCompany: Delta Labs\nkiran@delta.example\nBudget: 3200')
    page.click('#parse-btn')
    check(page.input_value('#lead-name') == 'Kiran Das', f'{size}: pasted name filled')
    check(page.input_value('#lead-value') == '3200', f'{size}: pasted budget filled')
    page.click('#lead-add')
    page.wait_for_selector('#lead-status >> text=Added Kiran Das')
    check(page.locator('#leads-table tbody tr').count() == 7, f'{size}: lead added')

    page.fill('#filter-query', 'delta')
    check(page.locator('#leads-table tbody tr').count() == 1, f'{size}: search narrows the table')
    page.fill('#filter-query', '')

    page.click('#leads-table tbody tr:first-child button.open-btn')
    page.wait_for_selector('#detail-name')
    page.fill('#note-text', 'Wants a Monday demo')
    page.click('#note-add')
    page.wait_for_selector('#detail >> text=Wants a Monday demo')

    page.click('#briefing-btn')
    page.wait_for_selector('#briefing >> text=Biggest chance')
    check('open deals worth' in page.inner_text('#briefing'), f'{size}: demo briefing shown')
    page.wait_for_timeout(100)
    page.screenshot(path=str(ROOT / 'docs' / f'screenshot-{size}.png'))
    check_page(page, errors, f'{size} demo')

    configure_live(page)
    page.click('#briefing-btn')
    page.wait_for_selector('#briefing >> text=MOCK-LIVE-BRIEF')
    check(len(mock.requests) == 1, f'{size}: one live request')
    check(mock.requests[0]['model'] == MOCK_MODEL, f'{size}: live request used the model name')
    check('Leads:' in mock.requests[0]['messages'][1]['content'], f'{size}: live prompt carried leads')
    check_page(page, errors, f'{size} live')
    context.close()


if __name__ == '__main__':
    run_all(flow)
