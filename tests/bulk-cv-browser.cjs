/* eslint-disable @typescript-eslint/no-require-imports -- Standalone synthetic browser check. */
const { chromium, expect } = require('@playwright/test');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

// Build first with the synthetic public settings documented in docs/bulk-cv-import.md.
// Every Supabase and AI request is intercepted. Never point this at production.
async function main() {
  const port = 3100;
  const origin = `http://localhost:${port}`;
  const server = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '-p', String(port)], {
    cwd: path.join(__dirname, '..'), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'synthetic-public-key' },
  });
  let logs = '';
  server.stdout.on('data', data => { logs += data; });
  server.stderr.on('data', data => { logs += data; });
  let browser;
  try {
    for (let n = 0; n < 100; n++) {
      if (server.exitCode !== null) throw new Error(`Local server exited: ${logs}`);
      try { if ((await fetch(`${origin}/candidates/import`)).ok) break; } catch { /* Startup only. */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const jwt = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: 'synthetic-recruiter', exp: expires })).toString('base64url')}.synthetic`;
    const session = { access_token: jwt, refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_in: 3600, expires_at: expires, user: { id: 'synthetic-recruiter' } };
    await context.addCookies([{ name: 'sb-fixture-auth-token', value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`, url: origin }]);
    const inserts = [];
    const uploads = [];
    const consoleErrors = [];
    const unexpected = [];
    const existing = [{ id: 'existing-alice', email: 'alice@example.test' }];
    await context.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin === origin && url.pathname === '/api/extract-candidate') {
        const bob = request.postDataBuffer().includes(Buffer.from('bob.pdf'));
        return route.fulfill({ json: { candidate_name: bob ? 'Synthetic Bob' : 'Synthetic Alice', email: bob ? 'bob@example.test' : 'alice@example.test', phone: '', location: 'Fixture City' } });
      }
      if (url.hostname === 'fixture.supabase.co') {
        if (url.pathname.startsWith('/rest/v1/jobs')) return route.fulfill({ json: request.headers().accept?.includes('object') ? { id: 'job-1', status: 'open' } : [{ id: 'job-1', title: 'Synthetic analyst', status: 'open', client_company: 'Fixture Company' }] });
        if (url.pathname.startsWith('/rest/v1/candidate_applications')) {
          assert.equal(url.searchParams.get('job_id') || (request.postDataJSON()?.job_id && 'eq.job-1'), 'eq.job-1');
          if (request.method() === 'POST') {
            const value = request.postDataJSON(); inserts.push(value); existing.push({ id: `saved-${inserts.length}`, email: value.email });
            return route.fulfill({ status: 201, body: '' });
          }
          return route.fulfill({ json: existing });
        }
        if (url.pathname.startsWith('/storage/v1/object/candidate-cvs/')) {
          uploads.push(request.postDataBuffer()); return route.fulfill({ json: { Key: url.pathname } });
        }
        unexpected.push(url.pathname); return route.abort();
      }
      if (url.origin === origin) return route.continue();
      unexpected.push(url.hostname); return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', error => consoleErrors.push(error.message));
    await page.goto(`${origin}/candidates/import?job=job-1`);
    await expect(page.getByLabel('Job for this batch')).toHaveValue('job-1');
    await page.getByLabel('Choose downloaded CVs').setInputFiles([
      { name: 'alice.pdf', mimeType: 'application/pdf', buffer: Buffer.from('Synthetic Alice CV') },
      { name: 'bob.pdf', mimeType: 'application/pdf', buffer: Buffer.from('Synthetic Bob CV') },
    ]);
    await expect(page.getByLabel('Job for this batch')).toBeDisabled();
    await page.getByRole('button', { name: 'Read queued CVs' }).click();
    const alice = page.getByRole('region', { name: 'alice.pdf' });
    const bob = page.getByRole('region', { name: 'bob.pdf' });
    await expect(bob.getByLabel('Email', { exact: true })).toHaveValue('bob@example.test');
    await expect(alice.getByText('Possible duplicate', { exact: true })).toBeVisible();
    await expect(alice.getByRole('checkbox', { name: /I have checked/ })).toBeDisabled();
    await expect(page.getByRole('button', { name: /Import 0 reviewed/ })).toBeDisabled();
    await bob.getByLabel('Candidate name', { exact: true }).fill('Reviewed Synthetic Bob');
    await bob.getByRole('checkbox', { name: /I have checked/ }).check();
    fs.mkdirSync(path.join(__dirname, 'artifacts'), { recursive: true });
    await page.screenshot({ path: path.join(__dirname, 'artifacts/bulk-import-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(bob.getByRole('checkbox', { name: /I have checked/ })).toBeVisible();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: path.join(__dirname, 'artifacts/bulk-import-mobile.png'), fullPage: true });
    await page.getByRole('button', { name: /Import 1 reviewed/ }).click();
    await expect(bob.getByText(/Imported\. Source: LinkedIn Easy Apply/)).toBeVisible();
    assert.equal(inserts.length, 1);
    assert.equal(inserts[0].candidate_name, 'Reviewed Synthetic Bob');
    assert.equal(inserts[0].popia_consent, false);
    assert.match(inserts[0].recruiter_notes, /LinkedIn Easy Apply/);
    assert.ok(uploads[0].includes(Buffer.from('Synthetic Bob CV')));
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(unexpected, []);
    console.log('Desktop/mobile browser: job association, multiple files, extraction, duplicate warnings, editing, explicit review, original-CV upload and attributed insert passed. All external calls mocked.');
  } finally {
    await browser?.close(); server.kill();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
