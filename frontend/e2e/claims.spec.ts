import {
  expect,
  test,
  apiAs,
  drawer,
  expectQueueCount,
  findUnclaimed,
  openBusiness,
  toast,
} from './helpers';

// Businesses Sam claims during a test, released afterwards so tests stay independent.
const samClaims: number[] = [];

test.beforeEach(async () => {
  const alex = await apiAs('alex');
  await alex.clearQueue();
  await alex.dispose();
});

test.afterEach(async () => {
  const sam = await apiAs('sam');
  for (const id of samClaims.splice(0)) await sam.remove(id);
  await sam.dispose();
});

test.describe('Flow 5: one lead, one agent', () => {
  test("after I claim a lead, other agents see it locked and keep their own queues", async ({ page }) => {
    const alex = await apiAs('alex');
    const b = await findUnclaimed(alex, { bbox: '-123.14,49.27,-123.10,49.295' }, 2);
    await alex.dispose();
    const sam = await apiAs('sam');
    const samQueueSize = (await sam.queue()).length;
    await sam.dispose();

    // Alex claims it.
    await openBusiness(page, b);
    await drawer(page).getByRole('button', { name: 'Add to my queue' }).click();
    await expect(toast(page, `Added ${b.name} to your queue`)).toBeVisible();
    await expectQueueCount(page, 1);

    // Switch to Sam via the (mock) sign-in menu.
    await page.getByRole('button', { name: /^Signed in as Alex Morgan/ }).click();
    await page.getByRole('button', { name: /^Sam Chen/ }).click();
    await expect(page.getByRole('button', { name: /^Signed in as Sam Chen/ })).toBeVisible();
    await expectQueueCount(page, samQueueSize); // Sam's own queue, not Alex's

    // Sam finds the same business through search and sees it's taken.
    await page.keyboard.press('Control+k');
    await page.getByPlaceholder(/Jump to a business/).fill(b.name);
    await page.getByRole('option', { name: new RegExp(b.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first().click();
    const d = drawer(page);
    await expect(d.getByRole('heading', { level: 2 })).toHaveText(b.name);
    await expect(d.getByRole('button', { name: 'Claimed by Alex Morgan' })).toBeDisabled();

    // Sam's queue panel doesn't contain Alex's lead.
    await page.keyboard.press('q');
    await expect(page.getByRole('list', { name: 'Queue, in calling order' })).not.toContainText(b.name);

    // Switching back restores Alex's view.
    await page.getByRole('button', { name: /^Signed in as Sam Chen/ }).click();
    await page.getByRole('button', { name: /^Alex Morgan/ }).click();
    await expectQueueCount(page, 1);
  });

  test('if another agent claims it a moment before me, I am told who and nothing is half-saved', async ({ page }) => {
    const alex = await apiAs('alex');
    const b = await findUnclaimed(alex, { bbox: '-123.14,49.27,-123.10,49.295' }, 4);
    await alex.dispose();

    // Alex is looking at an unclaimed lead...
    await openBusiness(page, b);
    const d = drawer(page);
    await expect(d.getByRole('button', { name: 'Add to my queue' })).toBeEnabled();

    // ...while Sam claims it from his own device.
    const sam = await apiAs('sam');
    expect((await sam.add(b.id)).status()).toBe(201);
    samClaims.push(b.id);
    await sam.dispose();

    // Alex clicks Add: the server says 409, the optimistic update rolls back, and the UI explains.
    await d.getByRole('button', { name: 'Add to my queue' }).click();
    await expect(toast(page, `${b.name} was just claimed by Sam Chen`)).toBeVisible();
    await expect(d.getByRole('button', { name: 'Claimed by Sam Chen' })).toBeDisabled();
    await expectQueueCount(page, 0);

    const check = await apiAs('alex');
    expect(await check.queue()).toHaveLength(0);
    await check.dispose();
  });

  test('once released, the lead becomes available to everyone again', async ({ page }) => {
    const alex = await apiAs('alex');
    const b = await findUnclaimed(alex, { bbox: '-123.14,49.27,-123.10,49.295' }, 6);
    await alex.dispose();

    const sam = await apiAs('sam');
    await sam.add(b.id);
    await openBusiness(page, b);
    await expect(drawer(page).getByRole('button', { name: 'Claimed by Sam Chen' })).toBeDisabled();

    await sam.remove(b.id);
    await sam.dispose();
    await page.reload();
    await expect(drawer(page).getByRole('button', { name: 'Add to my queue' })).toBeEnabled();
  });
});
