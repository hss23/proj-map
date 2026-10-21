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
    await page.getByRole('button', { name: /^Sort by:/ }).click();
    await page.getByRole('menuitemradio', { name: /^Distance/ }).click();
    await expect(page.getByRole('button', { name: /^Sort by:/ })).toHaveAccessibleName('Sort by: Distance');
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
    await expect(page.getByRole('button', { name: /^Sort by:/ })).toHaveAccessibleName('Sort by: Name (A–Z)');
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

test.describe('Flow 2b: sort and view controls', () => {
  test('sort dropdown: shows every option with a hint, marks the current one, and is keyboard operable', async ({ page }) => {
    await openApp(page);
    const trigger = page.getByRole('button', { name: /^Sort by:/ });
    await expect(trigger).toHaveAccessibleName('Sort by: Lead score');

    await trigger.click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    const options = menu.getByRole('menuitemradio');
    await expect(options).toHaveCount(4);
    await expect(options.nth(0)).toHaveAttribute('aria-checked', 'true');
    await expect(menu).toContainText('Best opportunities first');
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused(); // focus returns to the trigger

    // Keyboard only: open, move to "Renewal soonest", select.
    await page.keyboard.press('Enter');
    await expect(menu).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(trigger).toHaveAccessibleName('Sort by: Renewal soonest');
    await expect(page).toHaveURL(/sort=renewal/);
  });

  test('sort options stay legible in dark mode (regression: native list was white-on-white)', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Toggle dark mode' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.getByRole('button', { name: /^Sort by:/ }).click();
    const { fg, bg } = await page.getByRole('menuitemradio', { name: /^Distance/ }).evaluate((el) => {
      const label = el.querySelector('span span') as HTMLElement;
      const menu = el.closest('[role="menu"]') as HTMLElement;
      return { fg: getComputedStyle(label).color, bg: getComputedStyle(menu).backgroundColor };
    });
    const lum = (c: string) => {
      const [r, g, b] = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    // Light text on a dark menu, with a large luminance gap.
    expect(lum(fg) - lum(bg)).toBeGreaterThan(120);
  });

  test('grid / list toggle switches the card layout and is remembered', async ({ page }) => {
    await openApp(page);
    const grid = page.getByRole('button', { name: 'Grid view' });
    const list = page.getByRole('button', { name: 'List view' });
    await expect(grid).toHaveAttribute('aria-pressed', 'true');
    await expect(resultsList(page)).toHaveClass(/grid-cols-2/);
    const count = await cardButtons(page).count();

    await list.click();
    await expect(list).toHaveAttribute('aria-pressed', 'true');
    await expect(resultsList(page)).not.toHaveClass(/grid-cols-2/);
    expect(await cardButtons(page).count()).toBe(count);

    await page.reload();
    await expect(page.getByRole('button', { name: 'List view' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('results title names the neighbourhoods in view', async ({ page }) => {
    await openApp(page, 'c=49.2835,-123.1185&z=16');
    await expect(page.getByRole('heading', { level: 2 }).first()).toContainText(/Results in .*Downtown/);
  });

  test('map style toggles between muted and colour, and is remembered', async ({ page }) => {
    await openApp(page);
    const container = page.locator('.leaflet-container');
    await expect(container).toHaveClass(/map-muted/);
    await page.getByRole('button', { name: 'Colour map' }).click();
    await expect(container).not.toHaveClass(/map-muted/);
    await page.reload();
    await expect(page.locator('.leaflet-container')).not.toHaveClass(/map-muted/);
    await page.getByRole('button', { name: 'Muted map' }).click();
    await expect(page.locator('.leaflet-container')).toHaveClass(/map-muted/);
  });
});
