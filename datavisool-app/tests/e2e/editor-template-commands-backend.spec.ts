/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {expect, test, type Page} from '@playwright/test';
import {editor, layers, open, setup} from './editor-dock/support';

setup();

const templatePanel = (page: Page) => page.locator('.template-lib');
const templateCard = (page: Page, name: string) => templatePanel(page).locator('.template-item').filter({hasText: name});
const saveTemplateMenuItem = (page: Page) => page.locator('.context-menu-item').filter({hasText: '存为模板'});

async function openTemplateLibrary(page: Page) {
    if (!await templatePanel(page).isVisible()) await open(page, '模板库');
    await expect(templatePanel(page)).toBeVisible();
}

async function openSaveDialogFromLayerContextMenu(page: Page) {
    await page.getByRole('button', {name: '添加基础文本'}).click();
    await expect.poll(async () => (await layers(page)).length).toBeGreaterThan(0);
    await open(page, '图层');

    const row = page.locator('.layer-list .layer-item').first();
    await row.click();
    await expect(row).toHaveClass(/layer-selected/);
    await row.click({button: 'right'});
    await saveTemplateMenuItem(page).click({timeout: 10_000});

    const dialog = page.getByRole('dialog').last();
    await expect(dialog).toContainText('存为模板');
    return {dialog, row};
}

async function openSaveDialogThroughCommand(page: Page, layerId: string) {
    await page.evaluate(async id => {
        const entry = '/src/bootstrap/startApplication.ts';
        const {startApplication} = await import(/* @vite-ignore */ entry);
        const runtime: any = await startApplication();
        runtime.get('editorCanvas').select([id], 'canvas');
        const command = runtime.get('editorCommands').execute('template.save-selection');
        (window as any).__editorTemplateSaveCommand = command;
        void command.catch((error: unknown) => console.error(error));
    }, layerId);

    const dialog = page.getByRole('dialog').last();
    await expect(dialog).toContainText('存为模板');
    return dialog;
}

async function stopTemplateLibrary(page: Page) {
    return page.evaluate(async () => {
        const entry = '/src/bootstrap/startApplication.ts';
        const {startApplication} = await import(/* @vite-ignore */ entry);
        const runtime: any = await startApplication();
        await runtime.stopPlugin('editor-template-library');
        return runtime.get('editorCommands').has('template.save-selection') as boolean;
    });
}

function readMultipartField(body: string, fieldName: string): string {
    const marker = `name="${fieldName}"\r\n\r\n`;
    const start = body.indexOf(marker);
    expect(start, `multipart field '${fieldName}' exists`).toBeGreaterThanOrEqual(0);
    const valueStart = start + marker.length;
    const end = body.indexOf('\r\n--', valueStart);
    expect(end, `multipart field '${fieldName}' has a boundary`).toBeGreaterThan(valueStart);
    return body.slice(valueStart, end);
}

test('图层右键保存模板校验空名称并可取消', async ({page}) => {
    await editor(page);
    const createRequests: string[] = [];
    page.on('request', request => {
        if (new URL(request.url()).pathname === '/api/template/create') createRequests.push(request.url());
    });

    const {dialog} = await openSaveDialogFromLayerContextMenu(page);
    await dialog.getByRole('button', {name: '确定', exact: true}).click();
    await expect(dialog.getByText('请输入模板名称', {exact: true})).toBeVisible();
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', {name: '取消', exact: true}).click();
    await expect(dialog).toHaveCount(0);
    expect(createRequests).toEqual([]);
});

test('创建模板刷新已打开的模板库，重开后仍可插入', async ({page}) => {
    const {id, headers} = await editor(page);
    await openTemplateLibrary(page);
    await page.getByRole('button', {name: '添加基础文本'}).click();
    await expect.poll(async () => (await layers(page)).length).toBe(1);
    const layer = (await layers(page))[0];

    const dialog = await openSaveDialogThroughCommand(page, layer.id);
    const name = `命令创建模板-${Date.now()}`;
    await dialog.getByPlaceholder('请输入模板名称').fill(name);
    const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === '/api/template/create');
    await dialog.getByRole('button', {name: '确定', exact: true}).click();
    expect((await (await responsePromise).json()).code).toBe(200);

    await expect(templateCard(page, name)).toBeVisible({timeout: 10_000});
    const beforeInsert = (await layers(page)).length;
    await templateCard(page, name).dblclick();
    await expect.poll(async () => (await layers(page)).length).toBe(beforeInsert + 1);

    await page.reload();
    await expect(page.locator('#designer-ds-content')).toBeVisible({timeout: 60_000});
    await openTemplateLibrary(page);
    await expect(templateCard(page, name)).toBeVisible({timeout: 10_000});
    const afterReload = (await layers(page)).length;
    await templateCard(page, name).dblclick();
    await expect.poll(async () => (await layers(page)).length).toBe(afterReload + 1);

    const list = await (await page.request.post('/api/template/getAllTemplate', {
        headers,
        data: {name},
    })).json();
    expect(list.data).toHaveLength(1);
    await expect(page).toHaveURL(new RegExp(`/designer\\?id=${id}$`));
});

test('保存弹窗保留打开时快照，画布克隆并清空选区后仍保存原图层', async ({page}) => {
    await editor(page);
    const {dialog} = await openSaveDialogFromLayerContextMenu(page);
    const original = (await layers(page))[0];

    await page.evaluate(async () => {
        const entry = '/src/bootstrap/startApplication.ts';
        const {startApplication} = await import(/* @vite-ignore */ entry);
        const runtime: any = await startApplication();
        const canvas = runtime.get('editorCanvas');
        await canvas.performAction('doClone');
        await new Promise(resolve => window.setTimeout(resolve, 40));
        canvas.select([], 'system');
    });
    await expect.poll(async () => (await layers(page)).length).toBe(2);
    await expect.poll(() => page.evaluate(async () => {
        const entry = '/src/bootstrap/startApplication.ts';
        const {startApplication} = await import(/* @vite-ignore */ entry);
        return (await startApplication() as any).get('editorCanvas').readSelection().ids;
    })).toEqual([]);

    const name = `快照模板-${Date.now()}`;
    await dialog.getByPlaceholder('请输入模板名称').fill(name);
    const requestPromise = page.waitForRequest(request => new URL(request.url()).pathname === '/api/template/create');
    const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === '/api/template/create');
    await dialog.getByRole('button', {name: '确定', exact: true}).click();
    const request = await requestPromise;
    const requestBody = request.postData() ?? '';
    const template = JSON.parse(readMultipartField(requestBody, 'templateJson')) as {
        layers: Record<string, {name: string; type: string; x: number; y: number; lock: boolean}>;
        configs: Record<string, unknown>;
    };
    expect(Object.keys(template.layers)).toEqual([original.id]);
    expect(template.layers[original.id]).toMatchObject({name: original.name, type: original.type, x: 0, y: 0, lock: false});
    expect((await (await responsePromise).json()).code).toBe(200);
});

test('停用模板插件关闭草稿、移除右键项，并等待已开始的创建请求完成', async ({page}) => {
    const {headers} = await editor(page);
    const {dialog, row} = await openSaveDialogFromLayerContextMenu(page);

    expect(await stopTemplateLibrary(page)).toBe(false);
    await expect(dialog).toHaveCount(0);
    await row.click({button: 'right'});
    await expect(saveTemplateMenuItem(page)).toHaveCount(0);

    await page.reload();
    await expect(page.locator('#designer-ds-content')).toBeVisible({timeout: 60_000});
    const {dialog: pendingDialog} = await openSaveDialogFromLayerContextMenu(page);
    const name = `停止等待模板-${Date.now()}`;
    await pendingDialog.getByPlaceholder('请输入模板名称').fill(name);

    let releaseRequest!: () => void;
    const requestGate = new Promise<void>(resolve => { releaseRequest = resolve; });
    let requestArrived!: () => void;
    const createReached = new Promise<void>(resolve => { requestArrived = resolve; });
    await page.route('**/api/template/create', async route => {
        requestArrived();
        await requestGate;
        await route.continue();
    });

    const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === '/api/template/create');
    await pendingDialog.getByRole('button', {name: '确定', exact: true}).click();
    let stopPromise: Promise<boolean> | undefined;
    try {
        await createReached;
        stopPromise = stopTemplateLibrary(page).then(hasCommand => {
            expect(hasCommand).toBe(false);
            return true;
        });
        const stoppedBeforeUpload = await Promise.race([
            stopPromise.then(() => true),
            page.waitForTimeout(250).then(() => false),
        ]);
        expect(stoppedBeforeUpload).toBe(false);
        await expect(pendingDialog).toBeVisible();
    } finally {
        releaseRequest();
        if (stopPromise) await stopPromise.catch(() => false);
    }

    expect(stopPromise).toBeDefined();
    await stopPromise;
    expect((await (await responsePromise).json()).code).toBe(200);
    await expect(pendingDialog).toHaveCount(0);

    const list = await (await page.request.post('/api/template/getAllTemplate', {headers, data: {name}})).json();
    expect(list.data).toHaveLength(1);
});
