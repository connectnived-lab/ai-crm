// Wiring: DOM <-> core. Leads are kept in this browser's localStorage only.
import * as crm from './core/crm.js';
import { sampleLeads } from './core/samples.js';
import { loadSettings, isLive } from './core/settings.js';
import { chatCompletion } from './core/llm.js';
import { $, el, setStatus } from './ui/common.js';
import { mountSettings } from './ui/settings-panel.js';

const STORE_KEY = 'nived-ai-crm-leads';
const STAGE_LABEL = { new: 'New', contacted: 'Contacted', qualified: 'Qualified', proposal: 'Proposal', won: 'Won', lost: 'Lost' };

let leads = [];
let selectedId = null;
let settings = loadSettings();

function loadLeads() {
  try {
    const stored = crm.parseStoredLeads(localStorage.getItem(STORE_KEY));
    if (stored.length) return stored;
  } catch {
    /* fall through to the sample */
  }
  return sampleLeads(new Date());
}

function persist() {
  try {
    localStorage.setItem(STORE_KEY, crm.serializeLeads(leads));
  } catch {
    /* storage may be full or disabled; the session still works */
  }
}

function replaceLead(updated) {
  leads = leads.map((l) => (l.id === updated.id ? updated : l));
  persist();
  render();
}

function selected() {
  return leads.find((l) => l.id === selectedId) || null;
}

function renderKpis() {
  const s = crm.insights(leads, new Date());
  const kpis = [
    ['Open deals', s.openCount],
    ['Pipeline value', s.pipelineValue.toLocaleString('en-US')],
    ['Weighted value', s.weightedValue.toLocaleString('en-US')],
    ['Win rate', s.winRate === null ? '–' : `${s.winRate}%`],
  ];
  $('#kpis').replaceChildren(...kpis.map(([label, value]) => el('div', { class: 'kpi' }, [el('b', { text: String(value) }), el('span', { text: label })])));
}

function renderFilters() {
  const select = $('#filter-stage');
  if (select.options.length === 0) {
    select.append(el('option', { value: 'all', text: 'All stages' }));
    for (const s of crm.STAGES) select.append(el('option', { value: s, text: STAGE_LABEL[s] }));
  }
}

function renderTable() {
  const stage = $('#filter-stage').value || 'all';
  const query = $('#filter-query').value;
  const sort = $('#sort-by').value;
  const rows = crm.sortLeads(crm.filterLeads(leads, { stage, query }), sort);
  const wrap = $('#leads-wrap');
  if (rows.length === 0) {
    wrap.replaceChildren(el('p', { class: 'empty', text: leads.length ? 'No leads match that filter.' : 'No leads yet. Add one above.' }));
    return;
  }
  const today = crm.toIsoDate(new Date());
  const table = el('table', { id: 'leads-table' }, [
    el('thead', {}, [el('tr', {}, ['Lead', 'Stage', 'Value', 'Next step', 'Follow-up', ''].map((h) => el('th', { scope: 'col', text: h })))]),
    el('tbody', {}, rows.map((l) => {
      const flags = [];
      if (l.followUpOn && l.followUpOn <= today && crm.OPEN_STAGES.includes(l.stage)) flags.push(el('span', { class: 'flag due', text: 'due' }));
      if (crm.isStale(l)) flags.push(el('span', { class: 'flag stale', text: 'stale' }));
      const stageSelect = el('select', {
        class: 'stage', 'aria-label': `Stage for ${l.name}`,
        onchange: (e) => replaceLead(crm.moveStage(l, e.target.value, new Date())),
      }, crm.STAGES.map((s) => el('option', { value: s, text: STAGE_LABEL[s], selected: s === l.stage })));
      const followInput = el('input', {
        type: 'date', value: l.followUpOn || '', 'aria-label': `Follow-up date for ${l.name}`,
        onchange: (e) => {
          try {
            replaceLead(crm.scheduleFollowUp(l, e.target.value, new Date()));
          } catch (err) {
            setStatus($('#lead-status'), err.message, 'error');
          }
        },
      });
      return el('tr', { class: l.id === selectedId ? 'selected' : '' }, [
        el('td', {}, [el('strong', { text: l.name }), el('div', { class: 'meta', text: l.company || '—' })]),
        el('td', {}, [stageSelect]),
        el('td', { text: l.value.toLocaleString('en-US') }),
        el('td', {}, [el('span', { class: 'next', text: crm.nextAction(l, new Date()) }), ...flags]),
        el('td', {}, [followInput]),
        el('td', {}, [el('button', {
          type: 'button', class: 'ghost open-btn', 'aria-pressed': l.id === selectedId ? 'true' : 'false',
          onclick: () => { selectedId = l.id; render(); $('#detail h3')?.focus(); },
          text: l.id === selectedId ? 'Open ✓' : 'Open',
        })]),
      ]);
    })),
  ]);
  wrap.replaceChildren(table);
}

function renderDetail() {
  const l = selected();
  const box = $('#detail');
  if (!l) {
    box.replaceChildren(el('p', { class: 'empty', text: 'Select a lead in the table to see its notes and follow-up.' }));
    return;
  }
  const noteInput = el('input', { type: 'text', id: 'note-text', placeholder: 'Add a note', 'aria-label': 'Note text', autocomplete: 'off' });
  const addNoteBtn = el('button', {
    type: 'button', class: 'small', id: 'note-add',
    onclick: () => {
      try {
        replaceLead(crm.addNote(l, noteInput.value, new Date()));
      } catch (err) {
        setStatus($('#lead-status'), err.message, 'error');
      }
    },
    text: 'Add note',
  });
  const contactBtn = el('button', {
    type: 'button', class: 'ghost small', id: 'log-contact',
    onclick: () => replaceLead(crm.logContact(l, new Date(), noteInput.value)),
    text: 'Log contact',
  });
  const notes = [...l.notes].reverse();
  box.replaceChildren(
    el('h3', { id: 'detail-name', tabindex: '-1', text: l.name }),
    el('p', { class: 'meta', text: [l.company, l.email, l.phone].filter(Boolean).join(' · ') || 'No contact details' }),
    el('p', { class: 'meta', text: `Source: ${l.source} · Last contact: ${l.lastContactAt ? l.lastContactAt.slice(0, 10) : 'none yet'}` }),
    el('p', { text: `Next step: ${crm.nextAction(l, new Date())}` }),
    el('div', { class: 'row' }, [noteInput, addNoteBtn, contactBtn]),
    notes.length
      ? el('ul', { 'aria-label': 'Notes' }, notes.map((n) => el('li', {}, [el('div', { class: 'meta', text: n.at.slice(0, 10) }), n.text])))
      : el('p', { class: 'empty', text: 'No notes yet.' }),
  );
}

function render() {
  renderFilters();
  renderKpis();
  renderTable();
  renderDetail();
  $('#mode-badge').textContent = isLive(settings) ? 'Live mode · your endpoint' : 'Demo mode · offline';
  $('#mode-badge').classList.toggle('live', isLive(settings));
}

function addLeadFromForm(event) {
  event.preventDefault();
  const status = $('#lead-status');
  try {
    const lead = crm.createLead({
      name: $('#lead-name').value,
      company: $('#lead-company').value,
      email: $('#lead-email').value,
      phone: $('#lead-phone').value,
      value: $('#lead-value').value,
      source: $('#lead-source').value,
    }, new Date());
    leads = [lead, ...leads];
    selectedId = lead.id;
    persist();
    event.target.reset();
    $('#paste-text').value = '';
    setStatus(status, `Added ${lead.name}.`, 'ok');
    render();
  } catch (err) {
    setStatus(status, err.message, 'error');
  }
}

function fillFromPaste() {
  const status = $('#lead-status');
  try {
    const parsed = crm.parseLeadText($('#paste-text').value);
    $('#lead-name').value = parsed.name;
    $('#lead-company').value = parsed.company;
    $('#lead-email').value = parsed.email;
    $('#lead-phone').value = parsed.phone;
    $('#lead-value').value = parsed.value ? String(parsed.value) : '';
    $('#lead-source').value = parsed.source;
    setStatus(status, parsed.name ? 'Filled the form. Check it, then add the lead.' : 'Could not find a name. Type it in and add the lead.', parsed.name ? 'ok' : 'warn');
  } catch (err) {
    setStatus(status, err.message, 'error');
  }
}

async function briefing() {
  const out = $('#briefing');
  out.textContent = isLive(settings) ? 'Asking your model for a briefing…' : 'Working it out…';
  try {
    if (isLive(settings)) {
      const text = await chatCompletion({
        baseUrl: settings.baseUrl,
        apiKey: settings.apiKey,
        model: settings.model,
        messages: crm.buildInsightMessages(leads, crm.insights(leads, new Date()), new Date()),
      });
      out.textContent = text;
    } else {
      out.textContent = crm.demoBriefing(leads, new Date());
    }
  } catch (err) {
    out.textContent = `${err.message} Showing the offline briefing instead.\n\n${crm.demoBriefing(leads, new Date())}`;
  }
}

function init() {
  leads = loadLeads();
  persist();
  const panel = $('#settings-panel');
  const toggle = $('#settings-toggle');
  toggle.addEventListener('click', () => {
    const open = panel.hidden;
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open && !panel.dataset.mounted) {
      mountSettings({ container: panel, onChange: (s) => { settings = s; render(); } });
      panel.dataset.mounted = '1';
    }
  });
  $('#lead-form').addEventListener('submit', addLeadFromForm);
  $('#parse-btn').addEventListener('click', fillFromPaste);
  $('#briefing-btn').addEventListener('click', briefing);
  $('#filter-query').addEventListener('input', renderTable);
  $('#filter-stage').addEventListener('change', renderTable);
  $('#sort-by').addEventListener('change', renderTable);
  render();
}

init();
