# AI CRM

**One-line pitch:** A lightweight CRM that keeps leads, notes and follow-ups in order and tells you what to do next.

## Description

A lightweight CRM for small teams. It organises leads, notes and follow-ups, shows what needs attention today, and writes a short pipeline briefing. It runs offline by default, and an optional live mode uses any OpenAI-compatible endpoint. Everything is plain HTML, CSS and ES modules, with unit tests and an end-to-end check on mobile and desktop.

**Tech used:** plain HTML, CSS and ES modules; Node node:test; Playwright (Python) for end-to-end checks; an injectable-fetch chat-completions client

**30-second demo:** Load the sample pipeline, paste a new lead's details and press "Fill from pasted text", then "Add lead". Open Ravi's row, log a contact, and press "Get briefing" to see what is due.

**Resume bullets (no invented metrics):**
- Built a browser CRM with lead stages, notes, follow-up dates and a contact log, all kept in local storage.
- Implemented pipeline insights (weighted value, win rate, overdue follow-ups, stale leads) and rule-based next-step suggestions, with unit tests for each rule.
- Added a paste-to-form lead parser and an optional live briefing via any OpenAI-compatible endpoint, with keys kept in the browser only.

**LinkedIn draft:**
I built a small CRM as a portfolio project. It keeps leads, notes and follow-ups in one place, flags what is due or going stale, and tells you the next step for each lead. It works offline out of the box, and an optional live mode can write a pipeline briefing from any OpenAI-compatible model. MIT licensed, with unit tests and an end-to-end check. Repo: https://github.com/connectnived-lab/ai-crm
