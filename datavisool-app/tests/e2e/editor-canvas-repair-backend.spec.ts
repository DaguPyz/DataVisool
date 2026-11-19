/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {expect, test, type Page} from '@playwright/test';
import ProjectDataCodecUtil from '../../src/util/ProjectDataCodecUtil.ts';
import {editor, layers, save, setup} from './editor-dock/support';

setup();

type RepairFixture = {
    id: string;
    headers: Record<string, string>;
    headerId: string;
    tailId: string;
    orphanId?: string;
};

type Corruption = 'orphan' | 'tail-mismatch';

async function createRepairFixture(page: Page, corruption: Corruption): Promise<RepairFixture> {
    const {id, headers} = await editor(page);
    const toolbar = page.getByRole('toolbar', {name: '画布工具'});
    const addText = toolbar.getByRole('button', {name: '添加基础文本', exact: true});
    await addText.click();
    await expect.poll(async () => (await layers(page)).length).toBe(1);
    await addText.click();
    await expect.poll(async () => (await layers(page)).length).toBe(2);
    await save(page);

    const response = await page.request.get(`/api/project/getProjectData/${id}`, {headers});
    const body = await response.json();
    expect(body.code).toBe(200);
    const dataJson = body.data?.dataJson;
    expect(typeof dataJson).toBe('string');
    const projectData = JSON.parse(ProjectDataCodecUtil.decompressIfNeeded(dataJson)) as {
        layerManager: {
            layerConfigs: Record<string, {id?: string; next?: string; prev?: string}>;
            layerHeader: string;
            layerTail: string;
        };
    };
    const layerManager = projectData.layerManager;
    const headerId = layerManager.layerHeader;
    const tailId = layerManager.layerTail;
    const chain: string[] = [];
    const visited = new Set<string>();
    let currentId: string | undefined = headerId;
    while (currentId && !visited.has(currentId)) {
        const layer = layerManager.layerConfigs[currentId];
        if (!layer) break;
        visited.add(currentId);
        chain.push(currentId);
        currentId = layer.next;
    }
    expect(chain).toHaveLength(2);

    let orphanId: string | undefined;
    if (corruption === 'orphan') {
        const lastReachableId = chain[0];
        orphanId = chain[1];
        layerManager.layerConfigs[lastReachableId].next = undefined;
    } else {
        // Keep the full chain intact and point the tail anchor at the head.
        layerManager.layerTail = headerId;
    }

    const update = await page.request.post('/api/project/update', {
        headers,
        data: {id, dataJson: JSON.stringify(projectData)},
    });
    const updateBody = await update.json();
    expect(updateBody.code).toBe(200);
    expect(updateBody.data).toBe(true);

    await page.reload();
    await expect(page.locator('#designer-ds-content')).toBeVisible({timeout: 60000});
    return {id, headers, headerId, tailId, orphanId};
}

async function openRepair(page: Page) {
    await page.getByRole('button', {name: '更多项目操作'}).click();
    await page.getByRole('menuitem', {name: '画布修复', exact: true}).click();
    const dialog = page.locator('.canvas-repair-modal-dialog');
    await expect(dialog).toBeVisible();
    return dialog;
}

async function readRepairState(page: Page) {
    return page.evaluate(() => {
        const layerManager = (window as any).DATAVISOOL_ENV.currentManager.layerManager;
        return {
            layerHeader: layerManager.layerHeader,
            layerTail: layerManager.layerTail,
            layerConfigs: Object.fromEntries(Object.entries(layerManager.layerConfigs).map(([id, layer]: [string, any]) => [id, {
                id: layer.id,
                name: layer.name,
                prev: layer.prev,
                next: layer.next,
            }])),
        };
    });
}

test('定位并追加孤儿节点，撤销重做后保存且重开正常', async ({page}) => {
    const fixture = await createRepairFixture(page, 'orphan');
    const orphanId = fixture.orphanId!;
    const dialog = await openRepair(page);
    await expect(dialog.locator('.canvas-repair-state-tag')).toContainText('1 个孤儿 · 1 个问题');
    const orphan = dialog.locator('.canvas-repair-orphan-item').filter({hasText: orphanId});
    await expect(orphan).toBeVisible();
    await orphan.getByRole('button', {name: '定位'}).click();
    await dialog.getByRole('button', {name: '取消', exact: true}).click();

    await expect.poll(() => page.evaluate(async () => {
        const {startApplication} = await import(/* @vite-ignore */ '/src/bootstrap/startApplication.ts');
        return (await startApplication()).get('editorCanvas').readSelection().ids;
    })).toEqual([orphanId]);
    const repair = await openRepair(page);
    await repair.getByRole('button', {name: '追加到画布前端', exact: true}).click();
    await expect(repair).toHaveCount(0);
    let state = await readRepairState(page);
    expect(state.layerHeader).toBe(orphanId);
    expect(state.layerTail).toBe(fixture.headerId);
    expect(state.layerConfigs[orphanId].next).toBe(fixture.headerId);
    expect(state.layerConfigs[fixture.headerId].prev).toBe(orphanId);

    const toolbar = page.getByRole('toolbar', {name: '画布工具'});
    await toolbar.getByRole('button', {name: '撤销', exact: true}).click();
    state = await readRepairState(page);
    expect(state.layerHeader).toBe(fixture.headerId);
    expect(state.layerTail).toBe(fixture.tailId);
    expect(state.layerConfigs[fixture.headerId].next).toBeUndefined();
    await toolbar.getByRole('button', {name: '重做', exact: true}).click();
    state = await readRepairState(page);
    expect(state.layerHeader).toBe(orphanId);
    expect(state.layerConfigs[orphanId].next).toBe(fixture.headerId);

    await save(page);
    await page.reload();
    await expect(page.locator('#designer-ds-content')).toBeVisible({timeout: 60000});
    const reopened = await openRepair(page);
    await expect(reopened.locator('.canvas-repair-state-tag')).toHaveText('链路状态正常');
    await expect(reopened.locator('.canvas-repair-summary-card').filter({hasText: '可达图层'}))
        .toContainText('2');
    await expect(reopened.locator('.canvas-repair-summary-card').filter({hasText: '孤儿节点'}))
        .toContainText('0');
});

test('修复错误尾指针后支持撤销重做并保存重开', async ({page}) => {
    const fixture = await createRepairFixture(page, 'tail-mismatch');
    const dialog = await openRepair(page);
    await expect(dialog.locator('.canvas-repair-state-tag')).toContainText('0 个孤儿 · 1 个问题');
    await expect(dialog.locator('.canvas-repair-issue-tag-tail-mismatch')).toBeVisible();
    await dialog.locator('.canvas-repair-footer-actions')
        .getByRole('button', {name: '修复尾指针', exact: true}).click();
    await expect(dialog).toHaveCount(0);

    const toolbar = page.getByRole('toolbar', {name: '画布工具'});
    expect((await readRepairState(page)).layerTail).toBe(fixture.tailId);
    await toolbar.getByRole('button', {name: '撤销', exact: true}).click();
    expect((await readRepairState(page)).layerTail).toBe(fixture.headerId);
    await toolbar.getByRole('button', {name: '重做', exact: true}).click();
    expect((await readRepairState(page)).layerTail).toBe(fixture.tailId);

    await save(page);
    await page.reload();
    await expect(page.locator('#designer-ds-content')).toBeVisible({timeout: 60000});
    const reopened = await openRepair(page);
    await expect(reopened.locator('.canvas-repair-state-tag')).toHaveText('链路状态正常');
});

test('删除孤儿节点支持撤销重做，保存后仅保留可达图层', async ({page}) => {
    const fixture = await createRepairFixture(page, 'orphan');
    const orphanId = fixture.orphanId!;
    const dialog = await openRepair(page);
    await expect(dialog.locator('.canvas-repair-orphan-item').filter({hasText: orphanId})).toBeVisible();
    await dialog.getByRole('button', {name: '删除全部孤儿节点', exact: true}).click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(async () => (await layers(page)).length).toBe(1);
    expect((await readRepairState(page)).layerHeader).toBe(fixture.headerId);

    const toolbar = page.getByRole('toolbar', {name: '画布工具'});
    await toolbar.getByRole('button', {name: '撤销', exact: true}).click();
    await expect.poll(async () => (await layers(page)).length).toBe(2);
    expect((await readRepairState(page)).layerConfigs[orphanId]).toBeTruthy();
    await toolbar.getByRole('button', {name: '重做', exact: true}).click();
    await expect.poll(async () => (await layers(page)).length).toBe(1);
    expect((await readRepairState(page)).layerConfigs[orphanId]).toBeUndefined();

    await save(page);
    await page.reload();
    await expect(page.locator('#designer-ds-content')).toBeVisible({timeout: 60000});
    await expect.poll(async () => (await layers(page)).length).toBe(1);
    const reopened = await openRepair(page);
    await expect(reopened.locator('.canvas-repair-state-tag')).toHaveText('链路状态正常');
    await expect(reopened.locator('.canvas-repair-summary-card').filter({hasText: '总图层'}))
        .toContainText('1');
});
