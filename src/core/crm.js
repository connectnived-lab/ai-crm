// Lead management: leads, stages, notes, follow-ups, pipeline insights and rule-based next steps. Pure logic, no DOM.
export const STAGES = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'];
export const OPEN_STAGES = ['new', 'contacted', 'qualified', 'proposal'];
export const STAGE_WEIGHT = { new: 0.1, contacted: 0.25, qualified: 0.5, proposal: 0.75, won: 1, lost: 0 };
export const STALE_DAYS = 14;

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function toIsoDate(date) {
  return new Date(date).toISOString().slice(0, 10);
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function daysBetween(from, to) {
  const ms = new Date(to).getTime() - new Date(from).getTime();
  return Math.floor(ms / 86400000);
}

export function validateEmail(value) {
  const v = String(value ?? '').trim();
  if (!v) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? v : null;
}

let counter = 0;
function newId(now) {
  counter += 1;
  return `L${new Date(now).getTime().toString(36)}${counter.toString(36)}`;
}

export function createLead(input, now = new Date()) {
  const name = String(input?.name ?? '').trim();
  if (!name) throw new Error('A lead needs a name.');
  const email = String(input?.email ?? '').trim();
  if (email && !validateEmail(email)) throw new Error(`"${email}" is not a valid email address.`);
  const value = input?.value === undefined || input?.value === '' ? 0 : Number(input.value);
  if (!Number.isFinite(value) || value < 0) throw new Error('Deal value must be a number of zero or more.');
  const stage = input?.stage ?? 'new';
  if (!STAGES.includes(stage)) throw new Error(`Unknown stage "${stage}".`);
  const at = new Date(now).toISOString();
  return {
    id: input?.id ?? newId(now),
    name,
    company: String(input?.company ?? '').trim(),
    email: email ? validateEmail(email) : '',
    phone: String(input?.phone ?? '').trim(),
    source: String(input?.source ?? '').trim() || 'manual',
    value,
    stage,
    createdAt: at,
    updatedAt: at,
    lastContactAt: null,
    followUpOn: null,
    closedAt: null,
    notes: [],
  };
}

export function moveStage(lead, stage, now = new Date()) {
  if (!STAGES.includes(stage)) throw new Error(`Unknown stage "${stage}".`);
  const at = new Date(now).toISOString();
  return { ...lead, stage, updatedAt: at, closedAt: stage === 'won' || stage === 'lost' ? at : null };
}

export function addNote(lead, text, now = new Date()) {
  const t = String(text ?? '').trim();
  if (!t) throw new Error('Write a note first.');
  const at = new Date(now).toISOString();
  return { ...lead, updatedAt: at, notes: [...lead.notes, { at, text: t }] };
}

export function logContact(lead, now = new Date(), summary = '') {
  const at = new Date(now).toISOString();
  const withNote = summary.trim() ? addNote(lead, `Contacted: ${summary.trim()}`, now) : lead;
  return { ...withNote, lastContactAt: at, updatedAt: at };
}

export function scheduleFollowUp(lead, isoDate, now = new Date()) {
  if (isoDate === '' || isoDate === null) return { ...lead, followUpOn: null, updatedAt: new Date(now).toISOString() };
  if (!ISO_DATE_RE.test(String(isoDate)) || Number.isNaN(new Date(isoDate).getTime())) {
    throw new Error('Use a date like 2026-11-20 for the follow-up.');
  }
  return { ...lead, followUpOn: isoDate, updatedAt: new Date(now).toISOString() };
}

// Reads a pasted lead ("Name: ...", "Company: ...", a business card line, or an email signature) into fields.
export function parseLeadText(text) {
  const raw = String(text ?? '').trim();
  if (!raw) throw new Error('Paste the lead details first.');
  const lines = raw.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const field = (label) => {
    const hit = lines.find((l) => new RegExp(`^(?:${label})\\s*[:\\-]\\s*(.+)$`, 'i').test(l));
    return hit ? hit.replace(new RegExp(`^(?:${label})\\s*[:\\-]\\s*`, 'i'), '').trim() : '';
  };
  const email = (raw.match(EMAIL_RE) || [''])[0];
  const phone = ((raw.match(PHONE_RE) || [''])[0] || '').replace(/\s+/g, ' ').trim();
  const budget = field('budget|value|deal|amount');
  const budgetNum = budget ? Number(budget.replace(/[^\d.]/g, '')) : NaN;
  let name = field('name|contact|from');
  if (!name) {
    const intro = raw.match(/\b(?:I am|I'm|this is|my name is)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/);
    name = intro ? intro[1] : '';
  }
  if (!name) {
    const candidate = lines.find((l) => !EMAIL_RE.test(l) && !PHONE_RE.test(l) && /^[A-Za-z .'-]{3,40}$/.test(l) && !/:/.test(l));
    name = candidate || '';
  }
  return {
    name,
    company: field('company|organisation|organization|business'),
    email,
    phone,
    value: Number.isFinite(budgetNum) ? budgetNum : 0,
    source: field('source|via|found us') || 'pasted',
  };
}

export function nextAction(lead, now = new Date()) {
  if (lead.stage === 'won') return 'Ask for a referral and set up onboarding.';
  if (lead.stage === 'lost') return 'Log the reason, then check back in a quarter.';
  if (lead.followUpOn && lead.followUpOn <= toIsoDate(now)) return `Follow up now, it was due ${lead.followUpOn}.`;
  if (lead.stage === 'new') return lead.lastContactAt ? 'Qualify: ask about budget and timing.' : 'Make the first contact by email this week.';
  if (lead.stage === 'contacted') return 'Book a short discovery call.';
  if (lead.stage === 'qualified') return 'Send a tailored proposal with two options.';
  if (lead.stage === 'proposal') {
    const since = daysBetween(lead.updatedAt, now);
    return since >= 7 ? 'Chase the proposal with one clear question.' : 'Wait for feedback, check back in a few days.';
  }
  return 'Review this lead.';
}

export function isStale(lead, now = new Date()) {
  if (!OPEN_STAGES.includes(lead.stage)) return false;
  const last = lead.lastContactAt || lead.createdAt;
  return daysBetween(last, now) >= STALE_DAYS;
}

export function insights(leads, now = new Date()) {
  const open = leads.filter((l) => OPEN_STAGES.includes(l.stage));
  const won = leads.filter((l) => l.stage === 'won');
  const lost = leads.filter((l) => l.stage === 'lost');
  const byStage = Object.fromEntries(STAGES.map((s) => [s, leads.filter((l) => l.stage === s).length]));
  const pipelineValue = open.reduce((sum, l) => sum + l.value, 0);
  const weightedValue = open.reduce((sum, l) => sum + l.value * STAGE_WEIGHT[l.stage], 0);
  const wonValue = won.reduce((sum, l) => sum + l.value, 0);
  const closed = won.length + lost.length;
  const today = toIsoDate(now);
  const overdue = open.filter((l) => l.followUpOn && l.followUpOn <= today).map((l) => l.id);
  const stale = open.filter((l) => isStale(l, now)).map((l) => l.id);
  const top = [...open]
    .sort((a, b) => b.value * STAGE_WEIGHT[b.stage] - a.value * STAGE_WEIGHT[a.stage] || a.name.localeCompare(b.name))
    .slice(0, 3)
    .map((l) => ({ id: l.id, name: l.name, expected: Math.round(l.value * STAGE_WEIGHT[l.stage]) }));
  return {
    total: leads.length,
    openCount: open.length,
    byStage,
    pipelineValue,
    weightedValue: Math.round(weightedValue),
    wonValue,
    winRate: closed === 0 ? null : Math.round((won.length / closed) * 100),
    overdueFollowUps: overdue,
    staleLeads: stale,
    topOpportunities: top,
  };
}

export function filterLeads(leads, { stage = 'all', query = '' } = {}) {
  const q = String(query).trim().toLowerCase();
  return leads.filter((l) => (stage === 'all' || l.stage === stage)
    && (!q || [l.name, l.company, l.email, l.source].some((f) => String(f).toLowerCase().includes(q))));
}

export function sortLeads(leads, by = 'value') {
  const copy = [...leads];
  if (by === 'value') return copy.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  if (by === 'followUp') {
    return copy.sort((a, b) => (a.followUpOn || '9999').localeCompare(b.followUpOn || '9999') || a.name.localeCompare(b.name));
  }
  return copy.sort((a, b) => a.name.localeCompare(b.name));
}

export function serializeLeads(leads) {
  return JSON.stringify({ version: 1, leads });
}

export function parseStoredLeads(raw) {
  if (!raw) return [];
  const data = JSON.parse(raw);
  if (!data || !Array.isArray(data.leads)) throw new Error('Stored leads are not in the expected shape.');
  return data.leads;
}

// Live mode: a short pipeline briefing from the numbers and the leads' own notes. Only what is in the record.
export function buildInsightMessages(leads, summary, now = new Date()) {
  const rows = leads.slice(0, 40).map((l) => `- ${l.name} (${l.company || 'no company'}), stage ${l.stage}, value ${l.value}, follow-up ${l.followUpOn || 'none'}, notes: ${l.notes.slice(-2).map((n) => n.text).join(' | ') || 'none'}`);
  return [
    { role: 'system', content: 'You are a sales operations assistant. Give a short pipeline briefing: three priorities and one risk. Use only the numbers and notes given. No invented figures.' },
    { role: 'user', content: `Today is ${toIsoDate(now)}.\nSummary: ${JSON.stringify(summary)}\nLeads:\n${rows.join('\n') || '(none)'}` },
  ];
}

const money = (n) => Number(n).toLocaleString('en-US');

// Demo mode: a plain-language briefing built from the numbers and the rules above. No model needed.
export function demoBriefing(leads, now = new Date()) {
  if (!leads.length) return 'No leads yet. Add one, or paste a lead\'s details and parse them.';
  const s = insights(leads, now);
  const byId = new Map(leads.map((l) => [l.id, l]));
  const lines = [`${s.openCount} open deals worth ${money(s.pipelineValue)}, about ${money(s.weightedValue)} weighted by stage.`];
  if (s.overdueFollowUps.length) {
    const names = s.overdueFollowUps.map((id) => byId.get(id).name).join(', ');
    lines.push(`Follow-ups due now: ${names}. Start there.`);
  }
  if (s.staleLeads.length) {
    lines.push(`${s.staleLeads.length} open lead(s) have had no contact in ${STALE_DAYS}+ days.`);
  }
  if (s.topOpportunities[0]) {
    const top = byId.get(s.topOpportunities[0].id);
    lines.push(`Biggest chance: ${top.name}${top.company ? ` (${top.company})` : ''}. Next: ${nextAction(top, now).replace(/\.$/, '').toLowerCase()}.`);
  }
  if (s.winRate !== null) lines.push(`Win rate so far: ${s.winRate}% (${s.byStage.won} won, ${s.byStage.lost} lost).`);
  return lines.join('\n');
}
