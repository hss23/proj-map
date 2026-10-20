import {
  expect,
  test,
  apiAs,
  cardButtons,
  drawer,
  findUnclaimed,
  namesInList,
  openApp,
  openBusiness,
  settle,
} from './helpers';

test.beforeEach(async () => {
  const alex = await apiAs('alex');
  await alex.clearQueue();
  await alex.dispose();
});

test.describe('Flow 3: review a business at a glance', () => {
  test('clicking a result opens the detail drawer with score, reasons, actions and facts', async ({ page }) => {
    await openApp(page);
    await settle(page);
    const [firstName] = await namesInList(page);

    await cardButtons(page).first().click();
    const d = drawer(page);
    await expect(d).toBeVisible();
    await expect(d.getByRole('heading', { level: 2 })).toHaveText(firstName);
    await expect(page).toHaveURL(/sel=\d+/);

    // Lead score ring + explainable signals.
    await expect(d.getByRole('img', { name: /Lead score \d+ out of 100/ })).toBeVisible();
    await expect(d.getByText('Why this lead')).toBeVisible();
    expect(await d.locator('section').first().getByRole('listitem').count()).toBeGreaterThan(1);

    // One-click actions.
    await expect(d.getByRole('link', { name: 'Call' })).toHaveAttribute('href', /^tel:\d+/);
    await expect(d.getByRole('link', { name: 'Directions' })).toHaveAttribute('href', /google\.com\/maps\/dir\/\?api=1&destination=/);
    await expect(d.getByRole('button', { name: 'Copy' })).toBeVisible();

    // Facts an agent needs before calling.
    for (const fact of ['TELUS today', 'Competitor', 'Contract ends', 'Employees', 'Revenue', 'Last contacted']) {
      await expect(d.getByText(fact, { exact: true })).toBeVisible();
    }
  });

  test('J / K and the arrows step through results; Esc closes', async ({ page }) => {
    await openApp(page);
    await settle(page);
    await cardButtons(page).first().click();
    const d = drawer(page);
    const firstName = await d.getByRole('heading', { level: 2 }).innerText();
    await expect(d.getByText(/^1 of \d+$/)).toBeVisible();

    await page.keyboard.press('j');
    await expect(d.getByText(/^2 of \d+$/)).toBeVisible();
    await expect(d.getByRole('heading', { level: 2 })).not.toHaveText(firstName);

    await d.getByRole('button', { name: 'Previous result' }).click();
    await expect(d.getByText(/^1 of \d+$/)).toBeVisible();
    await expect(d.getByRole('heading', { level: 2 })).toHaveText(firstName);

    await page.keyboard.press('Escape');
    await expect(d).toBeHidden();
    await expect(page).not.toHaveURL(/sel=/);
  });

  test('clicking a pin on the map opens that business', async ({ page }) => {
    const alex = await apiAs('alex');
    const b = await findUnclaimed(alex, { bbox: '-123.14,49.27,-123.10,49.295' });
    await alex.dispose();

    // Zoom 18 disables clustering, so the pin itself is clickable.
    await openApp(page, `c=${b.lat},${b.lng}&z=18`);
    const pin = page.locator(`.leaflet-marker-icon.biz-pin[title="${b.name}"]`);
    await expect(pin).toBeVisible();
    await pin.click();
    await expect(drawer(page).getByRole('heading', { level: 2 })).toHaveText(b.name);
  });

  test('hovering a result card highlights its location on the map', async ({ page }) => {
    await openApp(page);
    await settle(page);
    await cardButtons(page).first().hover();
    await expect(page.locator('path.hover-halo')).toHaveCount(1);
    await page.mouse.move(5, 5);
    await expect(page.locator('path.hover-halo')).toHaveCount(0);
  });

  test('a deep link opens the business directly (shared with a teammate)', async ({ page }) => {
    const alex = await apiAs('alex');
    const b = await findUnclaimed(alex, {}, 5);
    await alex.dispose();

    await openBusiness(page, b);
    await expect(drawer(page).getByRole('heading', { level: 2 })).toHaveText(b.name);
    await expect(drawer(page).getByRole('button', { name: 'Add to my queue' })).toBeEnabled();
  });

  test("a lead claimed by another agent is clearly locked", async ({ page }) => {
    const alex = await apiAs('alex');
    const { items } = await alex.search();
    await alex.dispose();
    const claimed = items.find((b) => b.claim.status === 'other')!;
    expect(claimed, 'seed data pre-claims some leads for Priya and Sam').toBeTruthy();
    const owner = claimed.claim.status === 'other' ? claimed.claim.agentName : '';

    await openBusiness(page, claimed);
    const d = drawer(page);
    await expect(d.getByText(`Claimed by ${owner}`).first()).toBeVisible();
    await expect(d.getByRole('button', { name: `Claimed by ${owner}` })).toBeDisabled();
    await expect(d.getByText(/only be worked by one agent/)).toBeVisible();
    await expect(d.getByRole('button', { name: 'Add to my queue' })).toHaveCount(0);
  });
});
