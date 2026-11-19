/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {expect, test, type Page} from '@playwright/test';
import {editor, layers, open, setup} from './editor-dock/support';
import ProjectDataCodecUtil from '../../src/util/ProjectDataCodecUtil.ts';

setup();

const projectAction = async (page: Page, name: string) => {
    await page.getByRole('button', {name: '更多项目操作'}).click();
    await page.getByRole('menuitem', {name, exact: true}).click();
};

async function navigate(page: Page, id: string) {
    await page.evaluate(async projectId => {
        const entry = '/src/bootstrap/startApplication.ts';
        const {startApplication} = await import(/* @vite-ignore */ entry);
        await (await startApplication()).get('router').navigate(`/designer?id=${projectId}`);
    }, id);
    await expect.poll(() => page.evaluate(() => window.DATAVISOOL_ENV.currentManager?.id)).toBe(id);
}

async function startPlainExport(page: Page) {
    await projectAction(page, '导出项目');
    const dialog = page.getByRole('dialog', {name: '导出选项'});
    const encrypt = dialog.getByRole('checkbox', {name: '整包加密'});
    await encrypt.press('Space');
    await expect(encrypt).not.toBeChecked();
    const pending = page.waitForEvent('download', {timeout: 15_000});
    await dialog.getByRole('button', {name: '下一步'}).click();
    return pending;
}

test('真实项目包往返恢复原画布，导入期间排队的保存不覆盖导入结果', async ({page}, testInfo) => {
    const {id, headers} = await editor(page);
    const toolbar = page.getByRole('toolbar', {name: '画布工具'});
    await toolbar.getByRole('button', {name: '添加基础文本'}).click();
    await expect.poll(async () => (await layers(page)).length).toBe(1);
    const archive = await startPlainExport(page);
    const archivePath = testInfo.outputPath('round-trip.zip');
    await archive.saveAs(archivePath);
    expect(await archive.failure()).toBeNull();

    const target = await editor(page, headers);
    expect(target.id).not.toBe(id);
    expect(await layers(page)).toHaveLength(0);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Fetch.enable', {patterns: [{urlPattern: '*/api/import/importProject', requestStage: 'Response'}]});
    const importResponsePaused = new Promise<string>(resolve => {
        cdp.once('Fetch.requestPaused', event => resolve(event.requestId));
    });
    const saveRequests: string[] = [];
    page.on('request', request => {
        if (new URL(request.url()).pathname === '/api/project/update') saveRequests.push(request.url());
    });

    try {
        const chooser = page.waitForEvent('filechooser');
        await projectAction(page, '导入项目');
        await (await chooser).setFiles(archivePath);
        const dialog = page.getByRole('dialog', {name: '导入项目'});
        await dialog.getByRole('button', {name: '开始导入'}).click();
        const requestId = await importResponsePaused;
        await expect(dialog).toHaveCount(0);
        await projectAction(page, '保存项目');
        await expect(page.getByRole('button', {name: '保存中'})).toBeVisible();
        const response = await cdp.send('Fetch.getResponseBody', {requestId});
        const body = response.base64Encoded ? Buffer.from(response.body, 'base64').toString('utf8') : response.body;
        expect(JSON.parse(body)).toMatchObject({code: 200, data: true});
        await cdp.send('Fetch.continueResponse', {requestId});
    } finally {
        await cdp.send('Fetch.disable');
        await cdp.detach();
    }
    await expect(page.locator('#designer-ds-content .base-text-component')).toBeVisible();
    await expect.poll(async () => (await layers(page)).map(layer => layer.type)).toEqual(['BaseText']);
    await expect(page).toHaveURL(new RegExp(`/designer\\?id=${target.id}$`));
    expect(saveRequests).toEqual([]);
});

test('子项目导出使用当前画布的 ID、名称和数据', async ({page}) => {
    const {id, headers} = await editor(page);
    const toolbar = page.getByRole('toolbar', {name: '画布工具'});
    await toolbar.getByRole('button', {name: '添加基础文本'}).click();
    const created = await page.request.post('/api/project/createSubProject', {
        headers, data: {pid: id, name: '导出子项目', dataJson: '{"canvasManager":{"width":710,"height":480}}'},
    });
    const body = await created.json();
    expect(body.code).toBe(200);
    const child = String(body.data);
    await open(page, '子项目');
    await page.locator('.sub-project-item').filter({hasText: '导出子项目'}).click();
    await expect.poll(() => page.evaluate(() => window.DATAVISOOL_ENV.currentManager?.id)).toBe(child);
    await toolbar.getByRole('button', {name: '添加基础色块'}).click();
    await expect.poll(async () => (await layers(page)).length).toBe(1);
    const request = page.waitForRequest('**/api/export/exportProject', {timeout: 15_000});
    const archive = await startPlainExport(page);
    expect(archive.suggestedFilename()).toBe('导出子项目.zip');
    const payload = (await request).postDataJSON();
    const entry = payload.projects.find((project: {isEntry: boolean}) => project.isEntry);
    expect(entry).toMatchObject({sourceProjectId: child, sourcePid: id, name: '导出子项目'});
    expect(payload.projects).toContainEqual(expect.objectContaining({sourceProjectId: id, isEntry: false}));
    expect(payload).toMatchObject({id: child, name: '导出子项目'});
    expect(JSON.parse(ProjectDataCodecUtil.decompressIfNeeded(entry.projectJson))).toMatchObject({canvasManager: {width: 710}});
    expect(await archive.failure()).toBeNull();
});

test('切换项目后忽略旧文件选择', async ({page}) => {
    const {headers} = await editor(page);
    const target = await page.request.post('/api/project/create', {
        headers, data: {name: '切换后的项目', dataJson: '{}'},
    });
    const nextId = String((await target.json()).data);
    let uploads = 0;
    await page.route('**/api/import/importProject', route => {
        uploads++;
        return route.abort();
    });

    const opened = page.waitForEvent('filechooser');
    await projectAction(page, '导入项目');
    const chooser = await opened;
    await navigate(page, nextId);
    await chooser.setFiles({name: 'unused.zip', mimeType: 'application/zip', buffer: Buffer.from('unused')});
    await expect(page.getByRole('dialog', {name: '导入项目'})).toHaveCount(0);
    expect(uploads).toBe(0);
});

test('切换项目会关闭已经打开的导出确认窗口', async ({page}) => {
    const {headers} = await editor(page);
    const target = await page.request.post('/api/project/create', {
        headers, data: {name: '新导出上下文', dataJson: '{}'},
    });
    const nextId = String((await target.json()).data);
    await projectAction(page, '导出项目');
    const dialog = page.getByRole('dialog', {name: '导出选项'});
    await expect(dialog).toBeVisible();
    await navigate(page, nextId);
    await expect(dialog).toHaveCount(0);
});
