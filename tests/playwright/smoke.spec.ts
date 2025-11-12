import { test, expect } from '@playwright/test';

// Helper to try front-end ports 3000 then 3001
async function gotoFrontend(page, path = '/') {
  const ports = [3000, 3001];
  for (const p of ports) {
    try {
      const url = `http://localhost:${p}${path}`;
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 3000 }).catch(() => null);
      if (resp && (resp.status() === 200 || resp.status() === 304 || resp.status() === 0)) {
        return url;
      }
      // if navigation returned null, try next
    } catch (e) {
      // ignore and try next port
    }
  }
  throw new Error('Could not reach frontend on ports 3000 or 3001');
}

test('propose trade as Alice and accept as Bob via UI', async ({ browser, request }) => {
  // Determine frontend base (try 3000 then 3001)
  let frontendBase = '';
  const try3000 = await request.get('http://localhost:3000/').catch(() => null);
  if (try3000 && try3000.ok()) frontendBase = 'http://localhost:3000';
  else {
    const try3001 = await request.get('http://localhost:3001/').catch(() => null);
    if (try3001 && try3001.ok()) frontendBase = 'http://localhost:3001';
  }
  if (!frontendBase) throw new Error('Could not reach frontend on ports 3000 or 3001');

  // Create a trade via API (propose) to avoid SPA reloads clearing in-memory auth.
  // Proposer: user 1 (Alice), Receiver: user 2 (Bob), proposer offers item 1 for item 3
  const proposeResp = await request.post('http://localhost:4000/api/trades', {
    data: { proposerId: '1', receiverId: '2', proposerItemIds: ['1'], receiverItemIds: ['3'], proposerCash: 0 }
  });
  expect(proposeResp.ok()).toBeTruthy();

  // Create a context to act as Bob (receiver) for the UI accept step
  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();

  // Attach console and pageerror listeners to surface client-side errors
  pageB.on('console', msg => console.log('PAGE LOG:', msg.type(), msg.text()));
  pageB.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  const frontend = frontendBase;
    // Seed localStorage with Bob's user object so ProtectedRoute and TradesPage see an authenticated user
    const bobResp = await request.get('http://localhost:4000/api/users/2');
    const bob = await bobResp.json();
    // Navigate to the frontend root first (same origin) so we can set localStorage
    await pageB.goto(frontend + '/', { waitUntil: 'domcontentloaded' });
    await pageB.evaluate((b) => localStorage.setItem('leverage_currentUser', JSON.stringify(b)), bob);
    // Now navigate to the trades page directly (app will read localStorage on mount)
    await pageB.goto(`${frontend}/trades`, { waitUntil: 'domcontentloaded' });
  // Wait for header/logo to appear which indicates in-memory auth was set
  await pageB.waitForSelector('text=Leverage', { timeout: 7000 });

  // Navigate to Trades page via header link (avoid full reload which would clear in-memory auth)
  await pageB.waitForSelector('text=Trades', { timeout: 10000 });
  await pageB.click('text=Trades');
  // Wait for any reasonable Trades-page indicator: heading, Accept button, or empty-state message.
  try {
    await Promise.any([
      pageB.waitForSelector('text=Your Active Trades', { timeout: 20000 }),
      pageB.waitForSelector('button:has-text("Accept")', { timeout: 20000 }),
      pageB.waitForSelector('text=No trades in this category.', { timeout: 20000 }),
      pageB.waitForSelector('text=No trades', { timeout: 20000 })
    ]);
  } catch (e) {
    // Dump a slice of the rendered HTML to help debugging
    const snippet = (await pageB.content()).slice(0, 8000);
    console.log('TRADES PAGE SNIPPET (on failure):', snippet);
    throw new Error('Trades page did not render expected elements in time');
  }

  // Click the first 'Accept' button (action required should show Accept for receiver)
  const acceptButtons = pageB.locator('button:has-text("Accept")');
  const count = await acceptButtons.count();
  expect(count).toBeGreaterThan(0);
  await acceptButtons.first().click();

  // Confirm the modal (Yes, accept)
  await pageB.waitForSelector('text=Yes, accept', { timeout: 3000 });
  await pageB.click('text=Yes, accept');

  // Give server a moment to process
  await pageB.waitForTimeout(500);

  // Verify backend state via API: item 1 should now be owned by user 2
  const user1 = await request.get('http://localhost:4000/api/users/1');
  const user2 = await request.get('http://localhost:4000/api/users/2');
  const u1json = await user1.json();
  const u2json = await user2.json();

  // inventories are under inventory property
  const u1ItemIds = (u1json.inventory || []).map((i: any) => String(i.id));
  const u2ItemIds = (u2json.inventory || []).map((i: any) => String(i.id));

  // item '1' (Laptop) should no longer be in user1, and should be in user2
  expect(u1ItemIds).not.toContain('1');
  expect(u2ItemIds).toContain('1');

  await contextB.close();
});
