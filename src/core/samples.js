// A made-up small business pipeline, so the demo works with one click. Dates are relative to "now".
import { createLead, moveStage, addNote, logContact, scheduleFollowUp, toIsoDate, addDays } from './crm.js';

export function sampleLeads(now = new Date()) {
  const day = (n) => toIsoDate(addDays(now, n));
  const ago = (n) => addDays(now, -n);
  let a = createLead({ name: 'Ravi Krishnan', company: 'Acme Foods', email: 'ravi@acmefoods.example', phone: '+91 98765 43210', value: 12000, source: 'referral' }, ago(20));
  a = moveStage(a, 'proposal', ago(3));
  a = logContact(a, ago(4), 'walked through the two packages');
  a = scheduleFollowUp(a, day(-1), now);
  let b = createLead({ name: 'Meera Shah', company: 'Blue Clinic', email: 'meera@blueclinic.example', value: 4500, source: 'website' }, ago(3));
  b = moveStage(b, 'contacted', ago(2));
  b = logContact(b, ago(2), 'sent intro email');
  b = scheduleFollowUp(b, day(2), now);
  let c = createLead({ name: 'Jon Mathews', company: 'Northwind Studio', value: 2500, source: 'event' }, ago(30));
  c = addNote(c, 'Met at the design meetup, interested in a fixed-price build', ago(30));
  let e = createLead({ name: 'Asha Pillai', company: 'Pillai & Co', email: 'asha@pillai.example', value: 8000, source: 'cold email' }, ago(1));
  e = moveStage(e, 'qualified', ago(1));
  e = logContact(e, ago(1), 'budget confirmed at 8k');
  let f = createLead({ name: 'Dev Patel', company: 'Patel Traders', value: 900, source: 'website' }, ago(40));
  f = moveStage(f, 'won', ago(10));
  let g = createLead({ name: 'Lena Fischer', company: 'Fischer GmbH', value: 6000, source: 'partner' }, ago(25));
  g = moveStage(g, 'lost', ago(12));
  g = addNote(g, 'Chose an in-house team', ago(12));
  return [a, b, c, e, f, g];
}
