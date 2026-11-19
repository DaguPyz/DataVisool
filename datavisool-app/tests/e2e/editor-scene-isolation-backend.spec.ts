/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {test, expect, type Page} from '@playwright/test';
import {setup, editor, open, save} from './editor-dock/support';

setup();

const subProjects = (page: Page) => page.locator('.sub-project');
const projectItem = (page: Page, name: string) =>
    subProjects(page).locator('.sub-project-item').filter({hasText: name});
const variables = (page: Page) => page.locator('.global-variable');
const variableRow = (page: Page, key: string) =>
    variables(page).locator('.gv-item').filter({has: page.locator(`.gv-key[title="${key}"]`)});
const canvasDialog = (page: Page) => page.locator('.datavisool-header-canvas-config-dialog');

async function createSubProject(page: Page, name: string) {
    await subProjects(page).getByRole('button', {name: '新建子项目', exact: true}).first().click();
    const dialog = page.locator('.new-project-dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByPlaceholder('请输入项目名称').fill(name);
    const response = page.waitForResponse(request =>
        new URL(request.url()).pathname === '/api/project/createSubProject');
    await dialog.getByRole('button', {name: '创建项目'}).click();
    const body = await (await response).json();
    expect(body.code).toBe(200);
    await expect(projectItem(page, name)).toBeVisible();
    return String(body.data);
}

async function switchWorkspace(page: Page, name: string, id: string) {
    await projectItem(page, name).click();
    await expect.poll(() => page.evaluate(() => window.DATAVISOOL_ENV.currentManager.id)).toBe(id);
}

async function setCanvasWidth(page: Page, width: number) {
    await page.getByRole('toolbar', {name: '画布工具'})
        .getByRole('button', {name: '画布设置', exact: true}).click();
    const dialog = canvasDialog(page);
    await expect(dialog).toBeVisible();
    const widthInput = dialog.getByRole('spinbutton').first();
    await widthInput.fill(String(width));
    await widthInput.blur();
    await dialog.getByRole('button', {name: '确定', exact: true}).click();
    await expect(dialog).toHaveCount(0);
}

async function createVariable(page: Page, name: string, value: string) {
    await variables(page).getByRole('button', {name: '新建全局变量'}).click();
    const dialog = page.getByRole('dialog').last();
    await expect(dialog.locator('.global-variable-edit-panel')).toBeVisible();
    await dialog.locator('.global-variable-edit-panel input').first().fill(name);
    const code = dialog.locator('.global-variable-edit-panel .CodeMirror').first();
    await code.click();
    await page.keyboard.press('Meta+a');
    await page.keyboard.insertText(value);
    await dialog.getByRole('button', {name: '保存', exact: true}).click();
    await expect(variableRow(page, name)).toBeVisible();
}

async function activeCanvasWidth(page: Page) {
    return page.evaluate(() => window.DATAVISOOL_ENV.currentManager.canvasManager.canvasConfig.width);
}

test('主项目与子项目各自保存变量和画布尺寸', async ({page}) => {
    const {id} = await editor(page);
    await open(page, '子项目');
    const childName = `隔离子项目-${Date.now()}`;
    const childId = await createSubProject(page, childName);

    await open(page, '全局变量');
    const rootVariable = `主项目变量-${Date.now()}`;
    await createVariable(page, rootVariable, '101');
    await setCanvasWidth(page, 1337);
    expect(await activeCanvasWidth(page)).toBe(1337);

    // Workspace switching saves the scene being left before loading the next one.
    await open(page, '子项目');
    await switchWorkspace(page, childName, childId);
    await open(page, '全局变量');
    await expect(variableRow(page, rootVariable)).toHaveCount(0);
    const childVariable = `子项目变量-${Date.now()}`;
    await createVariable(page, childVariable, '202');
    await setCanvasWidth(page, 641);
    expect(await activeCanvasWidth(page)).toBe(641);

    await open(page, '子项目');
    await projectItem(page, '主项目').click();
    await expect.poll(() => page.evaluate(() => window.DATAVISOOL_ENV.currentManager.id)).toBe(id);
    await expect.poll(() => activeCanvasWidth(page)).toBe(1337);
    await open(page, '全局变量');
    await expect(variableRow(page, rootVariable)).toBeVisible();
    await expect(variableRow(page, childVariable)).toHaveCount(0);

    await page.reload();
    await expect(page.locator('#designer-ds-content')).toBeVisible({timeout: 60000});
    await expect.poll(() => activeCanvasWidth(page)).toBe(1337);
    await open(page, '子项目');
    await switchWorkspace(page, childName, childId);
    await expect.poll(() => activeCanvasWidth(page)).toBe(641);
    await open(page, '全局变量');
    await expect(variableRow(page, childVariable)).toBeVisible();
    await expect(variableRow(page, rootVariable)).toHaveCount(0);
});

test('场景切换期间完成的旧变量草稿不会写入新场景', async ({page}) => {
    const {id} = await editor(page);
    await open(page, '子项目');
    const childName = `草稿隔离子项目-${Date.now()}`;
    const childId = await createSubProject(page, childName);

    await open(page, '全局变量');
    const originalName = `原始变量-${Date.now()}`;
    const changedName = `不应写入-${Date.now()}`;
    await createVariable(page, originalName, '303');
    await variableRow(page, originalName).getByRole('button', {name: '编辑'}).click();
    const dialog = page.getByRole('dialog').last();
    await dialog.locator('.global-variable-edit-panel input').first().fill(changedName);
    const filterEditor = dialog.locator('.global-variable-edit-panel .CodeMirror').nth(1);
    await filterEditor.click();
    await page.keyboard.press('Meta+a');
    await page.keyboard.insertText(
        'async function filter(data) { window.__sceneVariableSaveStarted = true; await new Promise(resolve => window.__releaseSceneVariableSave = resolve); window.__sceneVariableSaveFinished = true; return data; }',
    );

    // The edit dialog covers the dock. Trigger its real React tab handler while the async save is pending.
    await dialog.getByRole('button', {name: '保存', exact: true}).click();
    await expect.poll(() => page.evaluate(() => Boolean((window as any).__sceneVariableSaveStarted))).toBe(true);
    await page.getByRole('button', {name: '子项目', exact: true}).first()
        .evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.locator('.global-variable-edit-panel')).toHaveCount(0);
    await switchWorkspace(page, childName, childId);
    await page.evaluate(() => (window as any).__releaseSceneVariableSave());
    await expect.poll(() => page.evaluate(() => Boolean((window as any).__sceneVariableSaveFinished)), {timeout: 10000}).toBe(true);

    await open(page, '全局变量');
    await expect(variableRow(page, originalName)).toHaveCount(0);
    await expect(variableRow(page, changedName)).toHaveCount(0);

    await open(page, '子项目');
    await projectItem(page, '主项目').click();
    await expect.poll(() => page.evaluate(() => window.DATAVISOOL_ENV.currentManager.id)).toBe(id);
    await open(page, '全局变量');
    await expect(variableRow(page, originalName)).toBeVisible();
    await expect(variableRow(page, changedName)).toHaveCount(0);
});

test('关闭变量编辑后完成的异步保存不提交草稿', async ({page}) => {
    await editor(page);
    await open(page, '全局变量');
    const originalName = `关闭前变量-${Date.now()}`;
    const changedName = `关闭后不应保存-${Date.now()}`;
    await createVariable(page, originalName, '404');
    await variableRow(page, originalName).getByRole('button', {name: '编辑'}).click();
    const dialog = page.getByRole('dialog').last();
    await dialog.locator('.global-variable-edit-panel input').first().fill(changedName);
    await dialog.locator('.CodeMirror').nth(1).click();
    await page.keyboard.press('Meta+a');
    await page.keyboard.insertText(
        'async function filter(data) { window.__sceneVariableSaveStarted = true; await new Promise(resolve => window.__releaseSceneVariableSave = resolve); window.__sceneVariableSaveFinished = true; return data; }',
    );
    await dialog.getByRole('button', {name: '保存', exact: true}).click();
    await expect.poll(() => page.evaluate(() => Boolean((window as any).__sceneVariableSaveStarted))).toBe(true);
    await dialog.getByRole('button', {name: '关闭', exact: true}).click();
    await expect(page.locator('.global-variable-edit-panel')).toHaveCount(0);
    await page.evaluate(() => (window as any).__releaseSceneVariableSave());
    await expect.poll(() => page.evaluate(() => Boolean((window as any).__sceneVariableSaveFinished))).toBe(true);
    await expect(variableRow(page, originalName)).toBeVisible();
    await expect(variableRow(page, changedName)).toHaveCount(0);
    await save(page);
    await page.reload();
    await expect(page.locator('#designer-ds-content')).toBeVisible({timeout: 60000});
    await open(page, '全局变量');
    await expect(variableRow(page, originalName)).toBeVisible();
    await expect(variableRow(page, changedName)).toHaveCount(0);
});

test('从图层右键进入循环容器并从标题栏返回', async ({page}) => {
    await editor(page);
    await page.getByRole('button', {name: '新建循环容器', exact: true}).click();
    await open(page, '图层');
    const loopLayer = page.locator('.layer-items .layer-item').first();
    await expect(loopLayer).toBeVisible();
    await loopLayer.click({button: 'right'});
    await page.locator('.canvas-context-menu .context-menu-item')
        .filter({hasText: '循环容器'}).click();

    await expect(page.locator('.designer-ds-content')).toHaveClass(/canvas-transparent/);
    await page.getByRole('button', {name: '更多项目操作'}).click();
    const returnItem = page.getByRole('menuitem', {name: '返回主项目'});
    await expect(returnItem).toBeVisible();
    await returnItem.click();
    await expect(page.locator('.designer-ds-content')).not.toHaveClass(/canvas-transparent/);
    await page.getByRole('button', {name: '更多项目操作'}).click();
    await expect(page.getByRole('menuitem', {name: '返回主项目'})).toHaveCount(0);
});
