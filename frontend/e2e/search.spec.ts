import {
  expect,
  test,
  apiAs,
  cardButtons,
  namesInList,
  nextSearch,
  openApp,
  resultCards,
  resultsList,
  scoresInList,
  settle,
  totalResults,
} from './helpers';

test.beforeEach(async () => {
  const alex = await apiAs('alex');
  await alex.clearQueue();
  await alex.dispose();
});

test.describe('Flow 1: find businesses in my area', () => {
  test('map loads clustered businesses and a matching results list', async ({ page }) => {
    await openApp(page);

    await expect(page.locator('.leaflet-container')).toBeVisible();
    await expect(page.locator('.biz-cluster').first()).toBeVisible();
    // Clusters advertise how many hot leads they hide.
    await expect(page.locator('.biz-cluster .hot').first()).toBeVisible();

    const total = await totalResults(page);
    expect(total).toBeGreaterThan(50);
    expect(await cardButtons(page).count()).toBe(Math.min(total, 300));

    // Default sort is lead score, best first.
    const scores = await scoresInList(page);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));

    // The URL reflects the viewport so the view can be shared.
    await expect(page).toHaveURL(/[?&]c=[-\d.]+%2C[-\d.]+&z=\d+/);
  });

  test('zooming in splits clusters into individual business pins with hover cards', async ({ page }) => {
    const alex = await apiAs('alex');
    const { items } = await alex.search({ bbox: '-123.14,49.27,-123.10,49.295' });
    await alex.dispose();
    const b = items[0];

    // Zoom 18 disables clustering; centre on a known business so its pin isn't under a map control.
    await openApp(page, `c=${b.lat},${b.lng}&z=18`);
    const pin = page.locator(`.leaflet-marker-icon.biz-pin[title="${b.name}"]`);
    await expect(pin).toBeVisible();
    await pin.hover();
    const tip = page.locator('.leaflet-tooltip.biz-tooltip');
    await expect(tip).toContainText(b.name);
    await expect(tip).toContainText('Click for details');
  });

  test('panning the map searches the new area; with "search as I move" off, it waits for "Search this area"', async ({ page }) => {
    await openApp(page);
    await settle(page);
    const map = page.locator('.leaflet-container');
    const box = (await map.boundingBox())!;

    // Pan: a new search fires automatically.
    let search = nextSearch(page);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 250, box.y + box.height / 2 - 150, { steps: 10 });
    await page.mouse.up();
    expect((await search).ok()).toBeTruthy();

    // Turn auto-search off, pan again: no request until the agent asks.
    await page.getByLabel('Search as I move the map').uncheck();
    let fired = false;
    const onReq = (r: { url(): string }) => {
      if (r.url().includes('/api/businesses?')) fired = true;
    };
    page.on('request', onReq);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 300, box.y + box.height / 2, { steps: 10 });
    await page.mouse.up();
    const button = page.getByRole('button', { name: 'Search this area' });
    await expect(button).toBeVisible();
    await page.waitForTimeout(600);
    expect(fired).toBe(false);
    page.off('request', onReq);

    search = nextSearch(page);
    await button.click();
    expect((await search).ok()).toBeTruthy();
    await expect(button).toBeHidden();
  });
});

test.describe('Flow 2: narrow down with keyword, presets and filters', () => {
  test('keyword filter narrows the list, shows a chip and can be cleared', async ({ page }) => {
    await openApp(page);
    const before = await totalResults(page);

    await page.getByLabel('Filter businesses in this area by keyword').fill('dental');
    await expect.poll(() => totalResults(page)).toBeLessThan(before);
    await settle(page);

    const texts = await resultCards(page).allInnerTexts();
    expect(texts.length).toBeGreaterThan(0);
    for (const t of texts) expect(t.toLowerCase()).toContain('dental');
    await expect(page.getByRole('button', { name: 'Remove filter “dental”' })).toBeVisible();
    await expect(page).toHaveURL(/q=dental/);

    await page.getByRole('button', { name: 'Remove filter “dental”' }).click();
    await expect.poll(() => totalResults(page)).toBe(before);
    await expect(page.getByLabel('Filter businesses in this area by keyword')).toHaveValue('');
  });

  test('"Hot leads" preset shows only scores ≥ 75 and toggles off again', async ({ page }) => {
    await openApp(page);
    const before = await totalResults(page);
    const hot = page.getByRole('button', { name: 'Hot leads' });

    await hot.click();
    await expect(hot).toHaveAttribute('aria-pressed', 'true');
    await expect(page).toHaveURL(/min=75/);
    await expect(page.getByRole('button', { name: 'Remove filter Score 75+' })).toBeVisible();
    await expect.poll(() => totalResults(page)).toBeLessThan(before);
    await settle(page);
    for (const s of await scoresInList(page)) expect(s).toBeGreaterThanOrEqual(75);

    await hot.click();
    await expect(hot).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => totalResults(page)).toBe(before);
  });

  test('industry filter uses live per-area counts, and filters combine with AND', async ({ page }) => {
    await openApp(page);
    await settle(page);

    await page.getByRole('button', { name: 'Industry' }).click();
    const healthcare = page.getByRole('checkbox', { name: /Healthcare/ });
    const label = await page.locator('label').filter({ has: healthcare }).innerText();
    const facetCount = Number(/(\d+)\s*$/.exec(label)?.[1]);
    expect(facetCount).toBeGreaterThan(0);

    await healthcare.check();
    await expect.poll(() => totalResults(page)).toBe(facetCount);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Remove filter Healthcare' })).toBeVisible();

    // AND with a size filter: never more results than either filter alone.
    await page.getByRole('button', { name: 'Size' }).click();
    await page.getByRole('button', { name: '10–49', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect.poll(() => totalResults(page)).toBeLessThanOrEqual(facetCount);
    await expect(page.getByRole('button', { name: 'Remove filter 10–49 employees' })).toBeVisible();

    await page.getByRole('button', { name: 'Clear all' }).click();
    await expect(page.getByRole('button', { name: 'Clear all' })).toBeHidden();
  });

  test('"More" filters: min score slider, renewal window and claim status', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'More' }).click();

    // Keyboard-drive the slider to 60.
    const slider = page.getByRole('slider', { name: 'Minimum lead score' });
    await slider.focus();
    for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowRight');
    await expect(page.getByText('60+', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '90 days' }).click();
    await page.getByRole('radio', { name: 'Unclaimed' }).click();
    await page.keyboard.press('Escape');

    await expect(page).toHaveURL(/min=60/);
    await expect(page).toHaveURL(/renew=90/);
    await expect(page).toHaveURL(/claim=unclaimed/);
    await settle(page);
    for (const s of await scoresInList(page)) expect(s).toBeGreaterThanOrEqual(60);
    // Every card shows a renewal badge and none is claimed.
    for (const t of await resultCards(page).allInnerTexts()) {
      expect(t).toMatch(/Renews in|Out of contract/);
      expect(t).not.toMatch(/Queued|Priya|Sam/);
    }
  });

  test('sorting by distance orders results nearest first', async ({ page }) => {
    await openApp(page);
    await page.getByLabel('Sort by').selectOption('distance');
    await expect(page).toHaveURL(/sort=distance/);
    await settle(page);

    const texts = await resultCards(page).allInnerTexts();
    const km = texts.map((t) => {
      const m = /·\s*(\d+(?:\.\d+)?)\s(km|m)(?!\w)/.exec(t.replace(/\n/g, ' '));
      return m ? Number(m[1]) / (m[2] === 'm' ? 1000 : 1) : NaN;
    });
    expect(km.every(Number.isFinite)).toBe(true);
    expect(km).toEqual([...km].sort((a, b) => a - b));
  });

  test('no matches shows a helpful empty state that recovers', async ({ page }) => {
    await openApp(page);
    await page.getByLabel('Filter businesses in this area by keyword').fill('zzqxv');
    await expect(page.getByText('No businesses match here')).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(resultsList(page)).toBeVisible();
    await expect(page.getByLabel('Filter businesses in this area by keyword')).toHaveValue('');
  });

  test('a shared URL restores filters and sort', async ({ page }) => {
    await openApp(page, 'min=75&ind=Healthcare,Retail&sort=name');
    await expect(page.getByRole('button', { name: 'Hot leads' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Remove filter Healthcare' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove filter Retail' })).toBeVisible();
    await expect(page.getByLabel('Sort by')).toHaveValue('name');
    await settle(page);
    const names = await namesInList(page);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })));
    for (const s of await scoresInList(page)) expect(s).toBeGreaterThanOrEqual(75);
  });

  test('junk URL parameters are ignored instead of breaking the page', async ({ page }) => {
    await openApp(page, 'min=999&ind=Spaceships&sort=random&claim=everyone&z=2&c=abc');
    await expect(page.getByRole('button', { name: 'Clear all' })).toBeHidden();
    await expect(cardButtons(page).first()).toBeVisible();
  });
});
