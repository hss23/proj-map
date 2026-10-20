import {
  expect,
  test,
  apiAs,
  expectQueueCount,
  openApp,
  toast,
} from './helpers';

test.beforeEach(async () => {
  const alex = await apiAs('alex');
  await alex.clearQueue();
  await alex.dispose();
});

test.describe('Flow 8: field agent on a phone', () => {
  test('map + bottom sheet: browse, open a business, claim it, check the queue', async ({ page }) => {
    await openApp(page);
    const sheet = page.getByRole('region', { name: 'Results and queue' });
    await expect(sheet).toBeVisible();
    await expect(page.locator('.leaflet-container')).toBeVisible();
    // Desktop side panels are not rendered on a phone.
    await expect(page.getByRole('complementary', { name: 'Search results' })).toHaveCount(0);

    const tab = (name: RegExp) => sheet.getByRole('tab', { name });
    await expect(tab(/^Results$/)).toHaveAttribute('aria-selected', 'true');
    await expect(tab(/^Details$/)).toBeDisabled();

    // Open the first unclaimed business.
    const card = sheet
      .getByRole('list', { name: 'Businesses' })
      .getByRole('listitem')
      .filter({ has: page.getByRole('button', { name: /^Add .+ to my queue$/ }) })
      .first();
    const name = (await card.getByRole('button', { name: /lead score \d+$/ }).getAttribute('aria-label'))!.split(', ')[0];
    await card.getByRole('button', { name: /lead score \d+$/ }).tap();

    await expect(tab(/^Details$/)).toHaveAttribute('aria-selected', 'true');
    await expect(sheet.getByRole('heading', { level: 2 })).toHaveText(name);

    await sheet.getByRole('button', { name: 'Add to my queue' }).tap();
    await expect(toast(page, `Added ${name} to your queue`)).toBeVisible();
    await expect(tab(/^Queue \(1\)$/)).toBeVisible();
    await expectQueueCount(page, 1);

    await tab(/^Queue \(1\)$/).tap();
    await expect(sheet.getByRole('list', { name: 'Queue, in calling order' })).toContainText(name);

    // Back to results.
    await tab(/^Results$/).tap();
    await expect(sheet.getByRole('list', { name: 'Businesses' })).toBeVisible();
  });

  test('the sheet handle cycles between peek, half and full height', async ({ page }) => {
    await openApp(page);
    const sheet = page.getByRole('region', { name: 'Results and queue' });
    const handle = sheet.getByRole('button', { name: /Resize panel/ });
    const height = async () => (await sheet.boundingBox())!.height;

    await expect(handle).toHaveAccessibleName('Resize panel (currently half)');
    const half = await height();
    await handle.tap();
    await expect(handle).toHaveAccessibleName('Resize panel (currently full)');
    await expect.poll(height).toBeGreaterThan(half);
    await handle.tap();
    await expect(handle).toHaveAccessibleName('Resize panel (currently peek)');
    await expect.poll(height).toBeLessThan(half);
  });
});
