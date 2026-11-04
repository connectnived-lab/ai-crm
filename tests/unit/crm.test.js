import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as crm from '../../src/core/crm.js';

const NOW = new Date('2026-11-04T10:00:00Z');

test('createLead requires a name and a valid email', () => {
  assert.throws(() => crm.createLead({ name: '  ' }), /needs a name/);
  assert.throws(() => crm.createLead({ name: 'A', email: 'nope' }), /not a valid email/);
  const l = crm.createLead({ name: 'Ana', email: 'ana@x.io', value: '250' }, NOW);
  assert.equal(l.value, 250);
  assert.equal(l.stage, 'new');
  assert.equal(l.source, 'manual');
  assert.deepEqual(l.notes, []);
});

test('createLead rejects negative values and unknown stages', () => {
  assert.throws(() => crm.createLead({ name: 'A', value: -1 }), /zero or more/);
  assert.throws(() => crm.createLead({ name: 'A', value: 'abc' }), /zero or more/);
  assert.throws(() => crm.createLead({ name: 'A', stage: 'hot' }), /Unknown stage/);
});

test('createLead accepts blank value as zero and ids are unique', () => {
  const a = crm.createLead({ name: 'A', value: '' }, NOW);
  const b = crm.createLead({ name: 'B' }, NOW);
  assert.equal(a.value, 0);
  assert.notEqual(a.id, b.id);
});

test('moveStage sets closedAt only for won and lost', () => {
  const l = crm.createLead({ name: 'A' }, NOW);
  assert.equal(crm.moveStage(l, 'qualified', NOW).closedAt, null);
  assert.ok(crm.moveStage(l, 'won', NOW).closedAt);
  assert.ok(crm.moveStage(l, 'lost', NOW).closedAt);
  assert.throws(() => crm.moveStage(l, 'bogus', NOW), /Unknown stage/);
});

test('addNote trims, appends and rejects empty text', () => {
  const l = crm.createLead({ name: 'A' }, NOW);
  const n = crm.addNote(l, '  wants a demo  ', NOW);
  assert.equal(n.notes.length, 1);
  assert.equal(n.notes[0].text, 'wants a demo');
  assert.throws(() => crm.addNote(l, '   ', NOW), /Write a note/);
});

test('logContact stamps lastContactAt and records a summary as a note', () => {
  const l = crm.createLead({ name: 'A' }, NOW);
  const c = crm.logContact(l, NOW, 'called, call back Friday');
  assert.equal(c.lastContactAt, NOW.toISOString());
  assert.equal(c.notes[0].text, 'Contacted: called, call back Friday');
  assert.equal(crm.logContact(l, NOW, '  ').notes.length, 0);
});

test('scheduleFollowUp validates ISO dates and clears on empty', () => {
  const l = crm.createLead({ name: 'A' }, NOW);
  assert.equal(crm.scheduleFollowUp(l, '2026-11-20', NOW).followUpOn, '2026-11-20');
  assert.throws(() => crm.scheduleFollowUp(l, '20/11/2026', NOW), /like 2026-11-20/);
  assert.throws(() => crm.scheduleFollowUp(l, '2026-13-45', NOW), /like 2026-11-20/);
  assert.equal(crm.scheduleFollowUp({ ...l, followUpOn: '2026-11-20' }, '', NOW).followUpOn, null);
});

test('parseLeadText reads labelled fields, email, phone and budget', () => {
  const p = crm.parseLeadText('Name: Ravi K\nCompany: Acme Foods\nravi@acme.io\n+91 98765 43210\nBudget: 5000\nSource: referral');
  assert.equal(p.name, 'Ravi K');
  assert.equal(p.company, 'Acme Foods');
  assert.equal(p.email, 'ravi@acme.io');
  assert.match(p.phone, /98765/);
  assert.equal(p.value, 5000);
  assert.equal(p.source, 'referral');
});

test('parseLeadText falls back to an intro sentence and to a bare name line', () => {
  assert.equal(crm.parseLeadText("Hi, I'm Priya Nair and we need a CRM").name, 'Priya Nair');
  assert.equal(crm.parseLeadText('Meera Shah\nmeera@x.co').name, 'Meera Shah');
  assert.equal(crm.parseLeadText('Meera Shah\nmeera@x.co').source, 'pasted');
});

test('parseLeadText rejects empty input', () => {
  assert.throws(() => crm.parseLeadText('  '), /Paste the lead/);
});

test('nextAction follows the stage and the follow-up date', () => {
  const base = crm.createLead({ name: 'A' }, NOW);
  assert.match(crm.nextAction(base, NOW), /first contact/);
  assert.match(crm.nextAction({ ...base, stage: 'contacted' }, NOW), /discovery call/);
  assert.match(crm.nextAction({ ...base, stage: 'qualified' }, NOW), /proposal/);
  assert.match(crm.nextAction({ ...base, stage: 'won' }, NOW), /referral/);
  assert.match(crm.nextAction({ ...base, stage: 'lost' }, NOW), /reason/);
  assert.match(crm.nextAction({ ...base, stage: 'contacted', followUpOn: '2026-11-01' }, NOW), /Follow up now/);
  assert.match(crm.nextAction({ ...base, stage: 'new', lastContactAt: NOW.toISOString() }, NOW), /Qualify/);
});

test('nextAction chases a proposal that has sat for a week', () => {
  const old = { ...crm.createLead({ name: 'A' }, NOW), stage: 'proposal', updatedAt: '2026-10-20T00:00:00.000Z' };
  assert.match(crm.nextAction(old, NOW), /Chase/);
  assert.match(crm.nextAction({ ...old, updatedAt: NOW.toISOString() }, NOW), /Wait/);
});

test('isStale only flags open leads without contact for the stale window', () => {
  const l = crm.createLead({ name: 'A' }, new Date('2026-10-01T00:00:00Z'));
  assert.equal(crm.isStale(l, NOW), true);
  assert.equal(crm.isStale({ ...l, stage: 'won' }, NOW), false);
  assert.equal(crm.isStale({ ...l, lastContactAt: NOW.toISOString() }, NOW), false);
});

test('insights computes pipeline, weighted value, win rate and flags', () => {
  const leads = [
    { ...crm.createLead({ name: 'A', value: 1000 }, NOW), stage: 'proposal', followUpOn: '2026-11-03' },
    { ...crm.createLead({ name: 'B', value: 400 }, NOW), stage: 'new' },
    { ...crm.createLead({ name: 'C', value: 900 }, NOW), stage: 'won' },
    { ...crm.createLead({ name: 'D', value: 100 }, NOW), stage: 'lost' },
  ];
  const s = crm.insights(leads, NOW);
  assert.equal(s.total, 4);
  assert.equal(s.openCount, 2);
  assert.equal(s.pipelineValue, 1400);
  assert.equal(s.weightedValue, Math.round(1000 * 0.75 + 400 * 0.1));
  assert.equal(s.wonValue, 900);
  assert.equal(s.winRate, 50);
  assert.equal(s.byStage.won, 1);
  assert.equal(s.overdueFollowUps.length, 1);
  assert.equal(s.topOpportunities[0].name, 'A');
});

test('insights handles an empty pipeline with no win rate', () => {
  const s = crm.insights([], NOW);
  assert.equal(s.winRate, null);
  assert.equal(s.pipelineValue, 0);
  assert.deepEqual(s.topOpportunities, []);
});

test('filterLeads matches stage and text across name, company, email and source', () => {
  const leads = [
    crm.createLead({ name: 'Ravi', company: 'Acme', email: 'r@a.io', source: 'web' }, NOW),
    { ...crm.createLead({ name: 'Meera', company: 'Blue' }, NOW), stage: 'won' },
  ];
  assert.equal(crm.filterLeads(leads, { query: 'acme' }).length, 1);
  assert.equal(crm.filterLeads(leads, { query: 'r@a' }).length, 1);
  assert.equal(crm.filterLeads(leads, { query: 'WEB' }).length, 1);
  assert.equal(crm.filterLeads(leads, { stage: 'won' }).length, 1);
  assert.equal(crm.filterLeads(leads, { stage: 'all', query: '' }).length, 2);
});

test('sortLeads orders by value, follow-up date and name', () => {
  const leads = [
    { ...crm.createLead({ name: 'Zed', value: 10 }, NOW), followUpOn: '2026-11-10' },
    { ...crm.createLead({ name: 'Amy', value: 50 }, NOW), followUpOn: null },
    { ...crm.createLead({ name: 'Bob', value: 50 }, NOW), followUpOn: '2026-11-05' },
  ];
  assert.deepEqual(crm.sortLeads(leads, 'value').map((l) => l.name), ['Amy', 'Bob', 'Zed']);
  assert.deepEqual(crm.sortLeads(leads, 'followUp').map((l) => l.name), ['Bob', 'Zed', 'Amy']);
  assert.deepEqual(crm.sortLeads(leads, 'name').map((l) => l.name), ['Amy', 'Bob', 'Zed']);
});

test('serialize and parse round-trip; bad storage is reported', () => {
  const leads = [crm.createLead({ name: 'A' }, NOW)];
  assert.deepEqual(crm.parseStoredLeads(crm.serializeLeads(leads)), leads);
  assert.deepEqual(crm.parseStoredLeads(null), []);
  assert.throws(() => crm.parseStoredLeads('{"x":1}'), /expected shape/);
});

test('buildInsightMessages carries the summary and notes but no invented data', () => {
  const l = crm.addNote(crm.createLead({ name: 'Ravi', company: 'Acme', value: 5 }, NOW), 'budget approved', NOW);
  const msgs = crm.buildInsightMessages([l], { total: 1 }, NOW);
  assert.equal(msgs[0].role, 'system');
  assert.match(msgs[1].content, /Ravi \(Acme\)/);
  assert.match(msgs[1].content, /budget approved/);
  assert.match(msgs[1].content, /2026-11-04/);
});

test('toIsoDate, addDays and daysBetween are calendar-accurate', () => {
  assert.equal(crm.toIsoDate('2026-11-04T23:00:00Z'), '2026-11-04');
  assert.equal(crm.addDays('2026-11-30T00:00:00Z', 1).toISOString().slice(0, 10), '2026-12-01');
  assert.equal(crm.daysBetween('2026-11-01T00:00:00Z', '2026-11-04T00:00:00Z'), 3);
});

test('validateEmail accepts blanks and rejects malformed addresses', () => {
  assert.equal(crm.validateEmail(''), null);
  assert.equal(crm.validateEmail('a@b.co'), 'a@b.co');
  assert.equal(crm.validateEmail('a@b'), null);
});

test('demoBriefing names overdue follow-ups, stale leads and the top chance', () => {
  const leads = [
    { ...crm.createLead({ name: 'Ravi', company: 'Acme', value: 2000 }, NOW), stage: 'proposal', followUpOn: '2026-11-01' },
    { ...crm.createLead({ name: 'Old Lead', value: 100 }, new Date('2026-09-01T00:00:00Z')), stage: 'new' },
    { ...crm.createLead({ name: 'Won one', value: 300 }, NOW), stage: 'won' },
  ];
  const text = crm.demoBriefing(leads, NOW);
  assert.match(text, /2 open deals worth 2,100/);
  assert.match(text, /Follow-ups due now: Ravi/);
  assert.match(text, /1 open lead\(s\) have had no contact/);
  assert.match(text, /Biggest chance: Ravi \(Acme\)/);
  assert.match(text, /Win rate so far: 100%/);
  assert.match(crm.demoBriefing([], NOW), /No leads yet/);
});
