/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {expect, test, type Page} from '@playwright/test';
import {editor, layers, open, save, setup} from './editor-dock/support';

setup();

const componentLibrary = (page:Page) => page.locator('.dl-component-list');
const inspector = (page:Page) => page.getByRole('region', {name:'组件属性'});

async function addMultiLineChart(page:Page, expectedCount:number) {
    if (!(await componentLibrary(page).isVisible()))
        await page.getByRole('button', {name:'打开组件库', exact:true}).click();
    const chart = componentLibrary(page).locator('[data-type="AntdMultiLine"]');
    await expect(chart).toBeVisible();
    await chart.dblclick();
    await expect.poll(async() => (await layers(page)).filter(layer => layer.type === 'AntdMultiLine').length).toBe(expectedCount);
}

async function openChartThemeConfig(page:Page, id:string) {
    await open(page, '图层');
    const row = page.locator(`.layer-list .layer-item[data-id="${id}"]`);
    await expect(row).toBeVisible();
    await row.click();
    const panel = inspector(page);
    await expect(panel.locator('.component-info-name')).toHaveText('Antd多折线图');
    const themeMenu = page.locator('.designer-right .datavisool-config-menu').getByRole('button', {name:'主题', exact:true});
    await expect(themeMenu).toBeVisible();
    await themeMenu.click();
    await expect(panel.locator('.datavisool-theme-config')).toBeVisible();
    return panel;
}

async function componentConfig(page:Page, id:string) {
    return page.evaluate(componentId => {
        const config = (window as any).DATAVISOOL_ENV.currentManager.layerManager.controllers[componentId]?.getConfig?.();
        return config ? JSON.parse(JSON.stringify(config)) : null;
    }, id);
}

test('属性主题只更新选中图表并在保存重开后保留', async({page}) => {
    await page.setViewportSize({width:1440, height:900});
    await editor(page);
    await addMultiLineChart(page, 1);
    await addMultiLineChart(page, 2);

    const charts = (await layers(page)).filter(layer => layer.type === 'AntdMultiLine');
    expect(charts).toHaveLength(2);
    expect(charts[0].id).not.toBe(charts[1].id);
    const [selected, untouched] = charts;
    await expect.poll(() => componentConfig(page, selected.id)).toBeTruthy();
    await expect.poll(() => componentConfig(page, untouched.id)).toBeTruthy();
    const untouchedBefore = await componentConfig(page, untouched.id);
    const expectedColors = ['#FF5500', '#FFFFFF', '#33221B', '#4D2D22', '#B34A1E', '#1A1412'];

    const panel = await openChartThemeConfig(page, selected.id);
    const preset = panel.locator('.datavisool-theme-config .datavisool-theme-item').filter({hasText:'烈焰战区'});
    await expect(preset).toBeVisible();
    await preset.click();

    await expect.poll(async() => (await componentConfig(page, selected.id))?.style?.color).toEqual(expectedColors);
    await expect.poll(async() => (await componentConfig(page, untouched.id))?.style?.color).toEqual(untouchedBefore.style.color);
    expect((await componentConfig(page, untouched.id)).style.color).not.toEqual(expectedColors);

    await save(page);
    await page.reload();
    await expect(page.locator('#designer-ds-content')).toBeVisible({timeout:60000});
    await expect.poll(async() => (await componentConfig(page, selected.id))?.style?.color).toEqual(expectedColors);
    await expect.poll(async() => (await componentConfig(page, untouched.id))?.style?.color).toEqual(untouchedBefore.style.color);
});

test('属性主题编辑器新增的主题可从全局主题入口读取并保存重开', async({page}) => {
    await page.setViewportSize({width:1440, height:900});
    await editor(page);
    await addMultiLineChart(page, 1);
    const chart = (await layers(page)).find(layer => layer.type === 'AntdMultiLine');
    expect(chart).toBeTruthy();
    const panel = await openChartThemeConfig(page, chart!.id);

    const name = `属性面板主题-${Date.now()}`;
    await panel.getByRole('button', {name:'自定义主题'}).click();
    const themeEditor = page.locator('.datavisool-theme-editor-modal');
    await expect(themeEditor).toBeVisible();
    await themeEditor.getByPlaceholder('请输入主题名称').fill(name);
    await themeEditor.getByRole('button', {name:'添加 / 更新'}).click();
    await expect(themeEditor.locator('.datavisool-theme-item').filter({hasText:name})).toBeVisible();
    await themeEditor.getByRole('button', {name:'关闭', exact:true}).click();
    await expect(panel.locator('.datavisool-theme-config .datavisool-theme-item').filter({hasText:name})).toBeVisible();

    await save(page);
    await page.reload();
    await expect(page.locator('#designer-ds-content')).toBeVisible({timeout:60000});
    await open(page, '主题设置');
    const globalThemeDialog = page.locator('.datavisool-theme-config-global-dialog');
    await expect(globalThemeDialog.locator('.datavisool-theme-item').filter({hasText:name})).toBeVisible();
    await globalThemeDialog.getByRole('button', {name:'取消', exact:true}).click();
});

test('全局主题新增后已打开的属性主题列表同步更新', async({page}) => {
    await page.setViewportSize({width:1440, height:900});
    await editor(page);
    await addMultiLineChart(page, 1);
    const chart = (await layers(page)).find(layer => layer.type === 'AntdMultiLine')!;
    const panel = await openChartThemeConfig(page, chart.id);
    const name = `全局面板主题-${Date.now()}`;

    await open(page, '主题设置');
    const globalDialog = page.locator('.datavisool-theme-config-global-dialog');
    await globalDialog.getByRole('button', {name:'自定义主题', exact:true}).click();
    const themeEditor = page.locator('.datavisool-theme-editor-modal');
    await themeEditor.getByPlaceholder('请输入主题名称').fill(name);
    await themeEditor.getByRole('button', {name:'添加 / 更新'}).click();
    await expect(themeEditor.locator('.datavisool-theme-item').filter({hasText:name})).toBeVisible();
    await themeEditor.getByRole('button', {name:'关闭', exact:true}).click();
    await globalDialog.getByRole('button', {name:'取消', exact:true}).click();

    await expect(panel.locator('.datavisool-theme-config .datavisool-theme-item').filter({hasText:name})).toBeVisible();
});
