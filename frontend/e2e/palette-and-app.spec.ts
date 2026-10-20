import {
  expect,
  test,
  apiAs,
  cardButtons,
  drawer,
  openApp,
  resultsList,
  settle,
} from './helpers';

test.beforeEach(async () => {
  const alex = await apiAs('alex');
  await alex.clearQueue();
  await alex.dispose();
});

test.describe('Flow 6: jump anywhere, shortcuts and preferences', () => {
  test('command palette finds a business outside the current view and flies to it', async ({ page }) => {
    // A business in Surrey, far from Alex's downtown start.
    const alex = await apiAs('alex');
    const { items } = await alex.search({ bbox: '-122.87,49.17,-122.83,49.2' });
    await alex.dispose();
    const far = items[0];
    expect(far).toBeTruthy();

    await openApp(page);
    await page.getByRole('button', { name: 'Search businesses (command palette)' }).click();
    const input = page.getByPlaceholder(/Jump to a business/);
    await input.fill(far.name);
    await expect(page.getByRole('option').first()).toContainText(far.name);
    await page.keyboard.press('Enter');

    await expect(drawer(page).getByRole('heading', { level: 2 })).toHaveText(far.name);
    // Map moved to Surrey (URL centre follows the map).
    await expect.poll(() => Number(/c=([-\d.]+)/.exec(page.url())?.[1])).toBeLessThan(49.22);
  });

  test('palette can apply an industry filter and run actions', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press('Control+k');
    await page.getByPlaceholder(/Jump to a business/).fill('Hospitality');
    await page.getByRole('option', { name: 'Show only Hospitality' }).click();
    await expect(page.getByRole('button', { name: 'Remove filter Hospitality' })).toBeVisible();

    await page.keyboard.press('Control+k');
    await page.getByRole('option', { name: /Clear all filters/ }).click();
    await expect(page.getByRole('button', { name: 'Remove filter Hospitality' })).toBeHidden();
  });

  test('"/" focuses the keyword filter and "?" shows the shortcut help', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press('/');
    await expect(page.getByLabel('Filter businesses in this area by keyword')).toBeFocused();
    await page.keyboard.press('Escape');

    await page.keyboard.press('?');
    const help = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await expect(help).toBeVisible();
    await expect(help).toContainText('Add selected business to my queue');
    await page.keyboard.press('Escape');
    await expect(help).toBeHidden();
  });

  test('dark mode toggles and is remembered', async ({ page }) => {
    await openApp(page);
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    await page.getByRole('button', { name: 'Toggle dark mode' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);
  });

  test('results panel can be collapsed to give the map more room', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Toggle results panel' }).click();
    await expect(resultsList(page)).toBeHidden();
    await page.getByRole('button', { name: 'Toggle results panel' }).click();
    await expect(cardButtons(page).first()).toBeVisible();
  });

  test('map controls: zoom, territory and fit to results', async ({ page }) => {
    await openApp(page, 'c=49.2827,-123.1207&z=13');
    await settle(page);
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await expect(page).toHaveURL(/z=14/);
    await page.getByRole('button', { name: 'Zoom out' }).click();
    await expect(page).toHaveURL(/z=13/);

    await page.getByRole('button', { name: 'Fit map to results' }).click();
    await settle(page);
    await page.getByRole('button', { name: 'Go to my territory' }).click();
    await expect(page).toHaveURL(/z=14/);
  });
});

test.describe('Flow 7: resilience', () => {
  test('when the backend is unavailable the agent sees an error and can retry', async ({ page }) => {
    await page.route('**/api/businesses?**', (route) =>
      route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'BACKEND_UNAVAILABLE', message: 'The prospect service is unreachable.' } }),
      }),
    );
    await page.goto('/');
    await expect(page.getByText("Couldn't load businesses")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('The prospect service is unreachable.')).toBeVisible();

    await page.unroute('**/api/businesses?**');
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(cardButtons(page).first()).toBeVisible();
  });

  test('a failed queue action rolls back and tells the agent', async ({ page }) => {
    await openApp(page);
    await settle(page);
    await page.route('**/api/queue', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } }) })
        : route.continue(),
    );
    const add = resultsList(page).getByRole('button', { name: /^Add .+ to my queue$/ }).first();
    await add.hover();
    await add.click();
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'Something went wrong' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'My queue, 0 leads' })).toBeVisible();
  });
});
