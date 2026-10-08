/* eslint-disable @typescript-eslint/no-require-imports -- Node test runner uses CommonJS to execute transpiled server modules. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');

function loadTs(file, bindings = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loadedModule = { exports: {} };
  vm.runInNewContext(code, { module: loadedModule, exports: loadedModule.exports, require: name => bindings[name] || require(name),
    Request, Response, File, FormData, console, ...bindings.globals });
  return loadedModule.exports;
}
const content = loadTs('lib/client-cv-content.ts');
const fixture = Object.fromEntries(content.CV_CONTENT_FIELDS.map(field => [field, field === 'ai_comments' ? 'The CV reports payroll and Xero experience.' : 'Original CV wording.']));

test('Approval appends edited text, preserves prior comments and avoids duplicates', () => {
  assert.equal(content.appendApprovedComments('Existing recruiter note.', '  Edited comment. '), 'Existing recruiter note.\n\nEdited comment.');
  assert.equal(content.appendApprovedComments('Edited comment.', 'Edited comment.'), 'Edited comment.');
  assert.equal(content.appendApprovedComments('', ''), '');
});

test('Reformat response keeps private suggestion separate and rejects incomplete CVs', () => {
  const parsed = content.parseCvContent({ ...fixture, recruiter_summary: 'Unapproved model output', unexpected: 'Ignore me' });
  assert.equal(parsed.ai_comments, fixture.ai_comments);
  assert.equal(Object.hasOwn(parsed, 'recruiter_summary'), false);
  assert.equal(Object.hasOwn(parsed, 'unexpected'), false);
  assert.throws(() => content.parseCvContent({ ai_comments: 'Only a comment' }), /incomplete/);
});

test('Actual API strips unapproved client comments, returns private suggestion, and cleans up source upload', async () => {
  let deleted = false;
  let prompt;
  const fetch = async (url, options = {}) => {
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: 'recruiter' });
    if (url === 'https://fixture.test/original.pdf') return new Response('fixture CV', { headers: { 'Content-Type': 'application/pdf' } });
    if (url.endsWith('/files') && options.method === 'POST') return Response.json({ id: 'uploaded-fixture' });
    if (url.endsWith('/responses')) {
      prompt = JSON.parse(options.body).input[0].content[0].text;
      return Response.json({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ ...fixture, recruiter_summary: 'Must not be client visible' }) }] }] });
    }
    if (url.endsWith('/files/uploaded-fixture') && options.method === 'DELETE') { deleted = true; return Response.json({ deleted: true }); }
    throw new Error('Unexpected request');
  };
  const route = loadTs('app/api/reformat-cv/route.ts', {
    '@/lib/client-cv-content': content,
    globals: { fetch, process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.test', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'fixture', OPENAI_API_KEY: 'fixture', NODE_ENV: 'test' } } },
  });
  const response = await route.POST(new Request('https://fixture.test/api/reformat-cv', {
    method: 'POST', headers: { Authorization: 'Bearer fixture', 'Content-Type': 'application/json' },
    body: JSON.stringify({ cvUrl: 'https://fixture.test/original.pdf', candidateName: 'Fixture Candidate' }),
  }));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.recruiter_summary, '');
  assert.equal(result.ai_comments, fixture.ai_comments);
  assert.equal(result.professional_profile, fixture.professional_profile);
  assert.equal(deleted, true);
  assert.match(prompt, /must never be copied to recruiter_summary/);
});

test('Client review RPCs and export template exclude private suggestions', () => {
  const page = fs.readFileSync(path.join(__dirname, '../app/client-cvs/page.tsx'), 'utf8');
  const html = page.slice(page.indexOf('function documentHtml('), page.indexOf('function PreviewSection('));
  assert.equal(html.includes('ai_comments'), false);
  assert.equal(html.includes('cv.recruiter_summary'), true);
  const review = fs.readFileSync(path.join(__dirname, '../app/client-review/[token]/page.tsx'), 'utf8');
  assert.equal(review.includes('ai_comments'), false);
  const migration = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261008103339_client_interview_availability.sql'), 'utf8');
  assert.equal(migration.includes("'ai_comments'"), false);
  assert.equal(migration.includes("'recruiter_summary', cv.recruiter_summary"), true);
});
