const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(path, mocks = {}) {
  const source = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', source)(name => mocks[name] || require(name), module, module.exports);
  return module.exports;
}
const calendar = load('lib/interview-calendar.ts');
const event = { id: 'test-booking', round: 2, candidate: 'Zoë, Test\r\nBEGIN:VEVENT', role: 'Finance; manager ' + 'é'.repeat(80), startsAt: '2026-10-30T14:00:00+02:00', location: 'Teams', meetingLink: 'https://teams.example.test/meeting' };
const ics = calendar.interviewCalendar(event);
assert.match(ics, /DTSTART:20261030T120000Z/);
assert.match(ics, /DTEND:20261030T130000Z/);
assert.match(ics, /TRIGGER:-PT30M/);
assert.equal(ics.split('\r\n').filter(line => line === 'BEGIN:VEVENT').length, 1);
for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75);
assert.match(ics.replace(/\r\n /g, ''), /Zoë\\, Test\\nBEGIN:VEVENT/);
assert.throws(() => calendar.interviewCalendar({ ...event, startsAt: 'invalid' }));
assert.throws(() => calendar.interviewCalendar({ ...event, id: 'bad\r\nUID:injected' }));

const booking = { id: '11111111-1111-4111-8111-111111111111', current_round: 2, interview_status: 'scheduled', interview_scheduled_at: '2026-10-30T12:00:00Z', interview_location: 'Teams', interview_meeting_link: 'https://teams.example.test/meeting', interview_notes: 'Private internal notes', candidate_applications: { candidate_name: 'Test candidate', email: 'candidate@example.invalid' }, client_submissions: { review_token: 'private-client-token', recruitment_clients: { contact_name: 'Test client', company_name: 'Test company', contact_email: 'client@example.invalid' }, jobs: { title: 'Finance Manager' } } };
const chain = { select(){ return this; }, eq(){ return this; }, async single(){ return { data: booking, error: null }; } };
const confirmation = load('lib/interview-confirmation.ts', { '@/lib/interview-calendar': calendar, '@supabase/supabase-js': { createClient(){ return { from(){ return chain; } }; } } });
const route = load('app/api/send-email/route.ts', { '@/lib/interview-confirmation': confirmation, 'next/server': { NextResponse: Response } });
const originalFetch = global.fetch;
const calls = [];
let failCandidate = false;
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.invalid';
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-publishable';
process.env.RESEND_API_KEY = 'test-key';
global.fetch = async (url, options) => {
  if (String(url).includes('/auth/v1/user')) return Response.json({ id: 'staff-test' });
  assert.equal(url, 'https://api.resend.com/emails');
  const payload = JSON.parse(options.body);
  calls.push({ payload, headers: options.headers });
  return Response.json({ id: 'mock-only' }, { status: failCandidate && payload.to[0] === 'candidate@example.invalid' ? 500 : 200 });
};
const request = auth => new Request('https://portal.example.invalid/api/send-email', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer test-staff' } : {}) }, body: JSON.stringify({ kind: 'interview_scheduled', submissionCandidateId: booking.id, to: 'forged@example.invalid', interviewWhen: 'forged time' }) });
(async () => {
  assert.equal((await route.POST(request(false))).status, 401);
  assert.equal(calls.length, 0);
  const result = await (await route.POST(request(true))).json();
  assert.deepEqual(result.sent, ['client', 'candidate']);
  assert.deepEqual(calls.map(c => c.payload.to), [['client@example.invalid'], ['candidate@example.invalid']]);
  for (const { payload } of calls) {
    const decoded = Buffer.from(payload.attachments[0].content, 'base64').toString('utf8');
    assert.match(decoded, /TRIGGER:-PT30M/);
    assert.match(decoded, /DTSTART:20261030T120000Z/);
    assert.doesNotMatch(payload.html + decoded, /Private internal notes|forged@example/);
    if(payload.to[0] === "candidate@example.invalid") assert.doesNotMatch(payload.html + decoded, /private-client-token|client-review/);
    else assert.match(payload.html, /private-client-token/);
    assert.match(payload.html, /UK \(London\)/);
    assert.match(payload.html, /South Africa/);
  }
  const keys = calls.map(c => c.headers['Idempotency-Key']);
  calls.length = 0;
  failCandidate = true;
  const failed = await (await route.POST(request(true))).json();
  assert.deepEqual(failed.sent, ['client']);
  assert.match(failed.warnings[0], /candidate/);
  assert.deepEqual(calls.map(c => c.headers['Idempotency-Key']), keys);
  booking.interview_status = 'requested';
  assert.equal((await route.POST(request(true))).status, 409);
  console.log('Calendar UTC, reminder, escaping/folding, authenticated booking emails, saved recipients, privacy, partial failures and retry deduplication passed. No emails sent.');
})().finally(() => { global.fetch = originalFetch; }).catch(error => { console.error(error); process.exitCode = 1; });
