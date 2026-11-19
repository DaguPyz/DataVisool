/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {expect, test, type Page} from '@playwright/test';
import {setup, editor, open, save, layers} from './editor-dock/support';

setup();

const inspector = (page: Page) => page.getByRole('region', {name: '组件属性'});

async function readInspectorSnapshot(page: Page, id: string) {
    return page.evaluate(async componentId => {
        const {startApplication} = await import(/* @vite-ignore */ '/src/bootstrap/startApplication.ts');
        const canvas = (await startApplication()).get('editorCanvas');
        const domain = await canvas.prepareInspectorDomain();
        const target = domain.readTarget(componentId);
        const config = domain.createControllerFacade(componentId)?.getConfig();
        return {
            layerName: target?.layer.name,
            statuses: domain.readStatuses(componentId)?.items ?? [],
            config,
        };
    }, id);
}

async function addText(page: Page) {
    await page.getByRole('button', {name: '添加基础文本', exact: true}).click();
    await expect.poll(async () => (await layers(page)).filter(layer => layer.type === 'BaseText')).toHaveLength(1);
    return (await layers(page)).find(layer => layer.type === 'BaseText')!;
}

test('基础属性和组件状态通过 Inspector 保存并在重载后保留', async ({page}) => {
    await page.setViewportSize({width: 1440, height: 900});
    await editor(page);
    const layer = await addText(page);

    await open(page, '图层');
    const row = page.locator(`.layer-list .layer-item[data-id="${layer.id}"]`);
    await row.click();
    const panel = inspector(page);
    await expect(panel).toBeVisible();

    const menu = page.locator('.designer-right .datavisool-config-menu');
    await menu.getByRole('button', {name: '基础', exact: true}).click();
    const nameField = panel.getByLabel('名称', {exact: true}).getByRole('textbox');
    const editedName = 'Inspector 保存文本';
    await nameField.fill(editedName);
    await expect.poll(async () => (await readInspectorSnapshot(page, layer.id)).layerName).toBe(editedName);

    const stateName = `Inspector 状态 ${Date.now()}`;
    const beforeState = await readInspectorSnapshot(page, layer.id);
    const originalFontSize = beforeState.config?.style?.fontSize;
    expect(originalFontSize).toBe(16);
    await panel.locator('.detail-operate [title="状态管理"]').click();
    const stateList = page.locator('.datavisool-component-status-list');
    await expect(stateList).toBeVisible();
    const existingStateCount = beforeState.statuses.length;
    await stateList.getByRole('button', {name: '添加', exact: true}).click();
    await expect(stateList.locator('.status-item')).toHaveCount(existingStateCount + 1);

    const newState = stateList.locator('.status-item').last();
    await newState.dblclick();
    const stateNameInput = newState.locator('input.status-name-input');
    await expect(stateNameInput).toBeVisible();
    await stateNameInput.fill(stateName);
    await stateNameInput.press('Enter');
    const renamedState = stateList.locator('.status-item').filter({hasText: stateName});
    await expect(renamedState).toBeVisible();
    await renamedState.click();
    await expect(renamedState).toHaveClass(/status-item-active/);

    await menu.getByRole('button', {name: '样式', exact: true}).click();
    const fontSizeInput = panel.getByLabel('字号', {exact: true}).getByRole('spinbutton');
    await expect.soft(fontSizeInput).toHaveValue(String(originalFontSize));
    const stateFontSize = 34;
    await fontSizeInput.fill(String(stateFontSize));
    await fontSizeInput.press('Enter');
    const state = (await readInspectorSnapshot(page, layer.id)).statuses.find(item => item.name === stateName);
    expect(state).toBeTruthy();
    await expect.poll(async () => {
        const snapshot = await readInspectorSnapshot(page, layer.id);
        return snapshot.config?.status?.[state!.id]?.config?.style?.fontSize;
    }).toBe(stateFontSize);
    // Preserve a user-visible assertion too: a field that snaps back after editing is a regression.
    await expect.soft(fontSizeInput).toHaveValue(String(stateFontSize));

    await save(page);
    await page.reload();
    await expect(page.locator('#designer-ds-content')).toBeVisible({timeout: 60_000});

    await open(page, '图层');
    await page.locator(`.layer-list .layer-item[data-id="${layer.id}"]`).click();
    await expect(panel).toBeVisible();
    await menu.getByRole('button', {name: '基础', exact: true}).click();
    await expect(panel.getByLabel('名称', {exact: true}).getByRole('textbox')).toHaveValue(editedName);

    const restored = await readInspectorSnapshot(page, layer.id);
    const restoredState = restored.statuses.find(item => item.id === state!.id);
    expect(restored.layerName).toBe(editedName);
    expect(restoredState?.name).toBe(stateName);
    expect(restored.config?.status?.[state!.id]?.config?.style?.fontSize).toBe(stateFontSize);
});
