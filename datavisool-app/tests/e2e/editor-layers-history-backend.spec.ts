/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {expect, test, type Page} from '@playwright/test';
import {editor, layers, open, save, setup} from './editor-dock/support';

setup();

const panel = (page: Page) => page.locator('.layer-list');
const rows = (page: Page) => panel(page).locator('.layer-item');

test('图层面板重命名、隐藏和锁定进入画布统一历史并保存', async ({page}) => {
    await editor(page);
    await page.getByRole('button', {name: '添加基础文本'}).click();
    await page.getByRole('button', {name: '添加基础色块'}).click();
    await open(page, '图层');
    await expect(rows(page)).toHaveCount(2);

    const text = rows(page).filter({hasText: '基础文本'});
    const id = await text.getAttribute('data-id');
    expect(id).toBeTruthy();
    await text.dblclick();
    const input = panel(page).locator(`.layer-item[data-id="${id}"] input`);
    await input.fill('历史记录图层');
    await input.press('Enter');
    await expect.poll(async () => (await layers(page)).find(layer => layer.id === id)?.name).toBe('历史记录图层');

    const renamed = rows(page).filter({hasText: '历史记录图层'});
    await renamed.hover();
    await renamed.locator('.layer-operator').nth(1).click();
    await expect.poll(async () => (await layers(page)).find(layer => layer.id === id)?.hide).toBe(true);
    await renamed.locator('.layer-operator').nth(2).click();
    await expect.poll(async () => (await layers(page)).find(layer => layer.id === id)?.lock).toBe(true);

    await page.keyboard.press('Meta+z');
    await expect.poll(async () => (await layers(page)).find(layer => layer.id === id)?.lock).toBe(false);
    await page.keyboard.press('Meta+z');
    await expect.poll(async () => (await layers(page)).find(layer => layer.id === id)?.hide).toBe(false);
    await page.keyboard.press('Meta+z');
    await expect.poll(async () => (await layers(page)).find(layer => layer.id === id)?.name).toBe('基础文本');

    await page.keyboard.press('Meta+Shift+z');
    await expect.poll(async () => (await layers(page)).find(layer => layer.id === id)?.name).toBe('历史记录图层');
    await page.keyboard.press('Meta+Shift+z');
    await expect.poll(async () => (await layers(page)).find(layer => layer.id === id)?.hide).toBe(true);
    await page.keyboard.press('Meta+Shift+z');
    await expect.poll(async () => (await layers(page)).find(layer => layer.id === id)?.lock).toBe(true);

    await save(page);
    await page.reload();
    await expect(page.locator('#designer-ds-content')).toBeVisible({timeout: 60000});
    await expect.poll(async () => (await layers(page)).find(layer => layer.id === id)).toMatchObject({
        name: '历史记录图层',
        hide: true,
        lock: true,
    });
});
