/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {expect, test, type Page} from '@playwright/test';
import {editor, layers, open, save, setup} from './editor-dock/support';

setup();

const inspector = (page: Page) => page.getByRole('region', {name: '组件属性'});

async function componentConfig(page: Page, id: string) {
    return page.evaluate(componentId => {
        const controller = (window as any).DATAVISOOL_ENV.currentManager.layerManager.controllers[componentId];
        const config = controller?.getConfig?.();
        return config ? JSON.parse(JSON.stringify(config)) : null;
    }, id);
}

test('组件滤镜通过统一历史撤销重做并在保存重开后保留', async ({page}) => {
    await page.setViewportSize({width: 1440, height: 900});
    await editor(page);
    await page.getByRole('button', {name: '添加基础文本', exact: true}).click();
    await expect.poll(async () => (await layers(page)).filter(layer => layer.type === 'BaseText')).toHaveLength(1);
    const layer = (await layers(page)).find(item => item.type === 'BaseText')!;

    await open(page, '图层');
    await page.locator(`.layer-list .layer-item[data-id="${layer.id}"]`).click();
    const panel = inspector(page);
    const menu = page.locator('.designer-right .datavisool-config-menu');
    await menu.getByRole('button', {name: '滤镜', exact: true}).click();
    await expect(panel.locator('.filter-config')).toBeVisible();

    await panel.locator('.filter-config').getByRole('switch').click();
    await expect.poll(async () => (await componentConfig(page, layer.id))?.filter?.enable).toBe(true);
    await page.getByRole('button', {name: '撤销', exact: true}).click();
    await expect.poll(async () => (await componentConfig(page, layer.id))?.filter?.enable).toBe(false);
    await page.getByRole('button', {name: '重做', exact: true}).click();
    await expect.poll(async () => (await componentConfig(page, layer.id))?.filter?.enable).toBe(true);

    await save(page);
    await page.reload();
    await expect(page.locator('#designer-ds-content')).toBeVisible({timeout: 60_000});
    await expect.poll(async () => (await componentConfig(page, layer.id))?.filter?.enable).toBe(true);
});
