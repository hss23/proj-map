import type { Page } from '@playwright/test';
import {
  expect,
  test,
  apiAs,
  cardButtons,
  drawer,
  expectQueueCount,
  openApp,
  queueButton,
  queueDrawer,
  queueList,
  resultCards,
  settle,
  toast,
} from './helpers';

test.beforeEach(async () => {
  const alex = await apiAs('alex');
  await alex.clearQueue();
  await alex.dispose();
});

/** Names of the first `n` unclaimed result cards currently in the list. */
async function unclaimedCardNames(page: Page, n: number): Promise<string[]> {
  const buttons = resultCards(page).getByRole('button', { name: /^Add .+ to my queue$/ });
  await expect(buttons.first()).toBeAttached();
  const labels = await buttons.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
  return labels.slice(0, n).map((l) => l.replace(/^Add /, '').replace(/ to my queue$/, ''));
}

async function quickAdd(page: Page, name: string) {
  const card = resultCards(page).filter({ has: page.getByRole('button', { name: `Add ${name} to my queue` }) });
  await card.hover();
  await card.getByRole('button', { name: `Add ${name} to my queue` }).click();
  await expect(toast(page, `Added ${name} to your queue`)).toBeVisible();
}

async function apiQueueNames() {
  const alex = await apiAs('alex');
  const items = await alex.queue();
  await alex.dispose();
  return items;
}

test.describe('Flow 4: build and prioritise my work queue', () => {
  test('quick-add from a result card updates the card, header and server', async ({ page }) => {
    await openApp(page);
    await settle(page);
    await expectQueueCount(page, 0);
    const [name] = await unclaimedCardNames(page, 1);

    await quickAdd(page, name);
    await expectQueueCount(page, 1);
    const card = resultCards(page).filter({ hasText: name }).first();
    await expect(card.getByText('Queued')).toBeVisible();

    const items = await apiQueueNames();
    expect(items.map((i) => i.business.name)).toEqual([name]);
  });

  test('add from the detail drawer with a chosen priority, then change it', async ({ page }) => {
    await openApp(page);
    await settle(page);
    const [name] = await unclaimedCardNames(page, 1);
    await cardButtons(page).and(page.getByRole('button', { name: new RegExp(`^${escape(name)},`) })).click();

    const d = drawer(page);
    await d.getByRole('radiogroup', { name: 'Priority for new lead' }).getByRole('radio', { name: 'High' }).click();
    await d.getByRole('button', { name: 'Add to my queue' }).click();
    await expect(d.getByText('In your queue').first()).toBeVisible();
    await expect(d.getByRole('radiogroup', { name: 'Priority' }).getByRole('radio', { name: 'High' })).toHaveAttribute('aria-checked', 'true');
    expect((await apiQueueNames())[0]).toMatchObject({ priority: 'high', business: { name } });

    await d.getByRole('radiogroup', { name: 'Priority' }).getByRole('radio', { name: 'Low' }).click();
    await expect.poll(async () => (await apiQueueNames())[0]?.priority).toBe('low');
  });

  test('keyboard: select with J, add with A, open queue with Q', async ({ page }) => {
    await openApp(page);
    await settle(page);
    const d = drawer(page);
    // Step through results until one that nobody has claimed.
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('j');
      await expect(d.getByRole('heading', { level: 2 })).toBeVisible();
      await settle(page); // selecting flies the map, which re-runs the search
      if ((await d.getByRole('button', { name: 'Add to my queue' }).count()) > 0) break;
    }
    const name = await d.getByRole('heading', { level: 2 }).innerText();

    await page.keyboard.press('a');
    await expect(toast(page, `Added ${name} to your queue`)).toBeVisible();
    await expectQueueCount(page, 1);
    await expect(d.getByText('In your queue').first()).toBeVisible();

    await page.keyboard.press('q');
    await expect(queueDrawer(page)).toBeVisible();
    await expect(queueList(page).getByRole('listitem')).toHaveCount(1);
  });

  test('reorder (keyboard and drag), add a note, remove with Undo; everything persists', async ({ page }) => {
    await openApp(page);
    await settle(page);
    const names = await unclaimedCardNames(page, 3);
    for (const n of names) await quickAdd(page, n);
    await expectQueueCount(page, 3);

    await queueButton(page).click();
    const q = queueDrawer(page);
    const rows = queueList(page).getByRole('listitem');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText(names[0]);
    await expect(q.getByText(/3\s*medium/)).toBeVisible();

    // Keyboard reorder: move the 3rd item to the top.
    await q.getByRole('button', { name: `Reorder ${names[2]}, position 3` }).focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Space');
    await expect(rows.nth(0)).toContainText(names[2]);
    await expect.poll(async () => (await apiQueueNames()).map((i) => i.business.name)).toEqual([names[2], names[0], names[1]]);

    // Mouse drag: move the (new) last item to the top.
    const handle = q.getByRole('button', { name: `Reorder ${names[1]}, position 3` });
    const target = q.getByRole('button', { name: `Reorder ${names[2]}, position 1` });
    const from = (await handle.boundingBox())!;
    const to = (await target.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, to.y - 4, { steps: 15 });
    await page.mouse.up();
    await expect.poll(async () => (await apiQueueNames()).map((i) => i.business.name)).toEqual([names[1], names[2], names[0]]);

    // Priority from the queue row.
    await q.getByRole('radiogroup', { name: `Priority for ${names[0]}` }).getByRole('radio', { name: 'High' }).click();
    await expect(q.getByText(/1\s*high/)).toBeVisible();

    // Inline note.
    const row = rows.filter({ hasText: names[0] });
    await row.hover();
    await row.getByRole('button', { name: 'Add note' }).click();
    await row.getByRole('textbox', { name: 'Note' }).fill('Ask for Dana, office manager');
    await page.keyboard.press('Enter');
    await expect(row.getByText('Ask for Dana, office manager')).toBeVisible();
    await expect.poll(async () => (await apiQueueNames()).find((i) => i.business.name === names[0])?.note).toBe('Ask for Dana, office manager');

    // Remove, then Undo restores it at the same position with its note and priority.
    await q.getByRole('button', { name: `Remove ${names[2]} from queue` }).click();
    await expect(rows).toHaveCount(2);
    await expectQueueCount(page, 2);
    const removed = toast(page, `Removed ${names[2]}`);
    await expect(removed).toBeVisible();
    await removed.getByRole('button', { name: 'Undo' }).click();
    await expect(rows).toHaveCount(3);
    await expect.poll(async () => (await apiQueueNames()).map((i) => i.business.name)).toEqual([names[1], names[2], names[0]]);

    // Reload: queue, order, priority and note are all persisted.
    await page.reload();
    await expectQueueCount(page, 3);
    await page.keyboard.press('q');
    await expect(rows.nth(0)).toContainText(names[1]);
    await expect(rows.nth(1)).toContainText(names[2]);
    await expect(rows.nth(2)).toContainText(names[0]);
    await expect(rows.nth(2)).toContainText('Ask for Dana, office manager');
    await expect(
      queueList(page).getByRole('radiogroup', { name: `Priority for ${names[0]}` }).getByRole('radio', { name: 'High' }),
    ).toHaveAttribute('aria-checked', 'true');
  });

  test('"Show on map" draws the queue as a numbered route', async ({ page }) => {
    await openApp(page);
    await settle(page);
    const names = await unclaimedCardNames(page, 3);
    for (const n of names) await quickAdd(page, n);

    await queueButton(page).click();
    await queueDrawer(page).getByRole('button', { name: 'Show on map' }).click();
    await expect(page.locator('.queue-stop')).toHaveCount(3);
    await expect(page.locator('.queue-stop').first()).toHaveText('1');
    await expect(page.locator('path.leaflet-interactive[stroke-dasharray="6 8"]')).toHaveCount(1);

    await queueDrawer(page).getByRole('button', { name: 'Hide route' }).click();
    await expect(page.locator('.queue-stop')).toHaveCount(0);
  });

  test('empty queue explains how to get started', async ({ page }) => {
    await openApp(page);
    await queueButton(page).click();
    await expect(queueDrawer(page).getByText('Your queue is empty')).toBeVisible();
  });
});

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
