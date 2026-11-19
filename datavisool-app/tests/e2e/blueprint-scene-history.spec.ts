/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {expect, test, type Page} from '@playwright/test';
import ProjectDataCodecUtil from '../../src/util/ProjectDataCodecUtil.ts';

const projectViewTimeout = 20_000;
const emptyProject = {canvasManager: {width: 840, height: 480, adaptationType: 'none'}};

test.setTimeout(60_000);

function saveProject(page: Page) {
    return page.getByRole('button', {name: '更多项目操作'}).click()
        .then(() => page.getByRole('menuitem', {name: '保存项目'}).click());
}

test.beforeEach(async ({page}) => {
    await page.addInitScript(() => {
        localStorage.setItem('datavisool-i18n-locale', 'zh-CN');
        localStorage.setItem('DATAVISOOL_USER_INFO', JSON.stringify({
            id: 'blueprint-history-fixture', username: 'tester', name: 'Test User', token: 'fixture-token', roles: ['ROLE_USER'],
        }));
    });
    await page.route('**/static/logo/**', route => route.fulfill({status: 404}));
    await page.route(url => url.pathname.startsWith('/api/'), route => {
        const {pathname} = new URL(route.request().url());
        let data: unknown = [];
        if (pathname.startsWith('/api/project/getProjectData/')) {
            const id = pathname.split('/').at(-1);
            data = {id, name: `项目 ${id}`, dataJson: JSON.stringify(emptyProject)};
        } else if (pathname === '/api/project/update') {
            return route.fulfill({json: {code: 200, msg: '', data: true}});
        }
        return route.fulfill({json: {code: 200, msg: '', data}});
    });
});

test('scene blueprint history keeps page edits separate and interleaves with canvas history', async ({page}) => {
    await page.goto('/designer?id=blueprint-pages');
    const canvas = page.locator('#designer-ds-content');
    await expect(canvas).toBeVisible({timeout: projectViewTimeout});
    const toolbar = page.getByRole('toolbar', {name: '画布工具'});
    const text = canvas.locator('.base-text-component');
    await toolbar.getByRole('button', {name: '添加基础文本'}).click();
    await expect(text).toHaveCount(1);

    await toolbar.getByRole('button', {name: '打开蓝图编辑器'}).click();
    const tabs = page.getByRole('tablist', {name: '蓝图页面'}).getByRole('tab');
    await expect(tabs).toHaveCount(1);
    await page.getByRole('button', {name: '新增页面'}).click();
    await expect(tabs).toHaveCount(2);

    const blueprintCanvas = page.locator('.blue-print-canvas');
    const addCondition = async () => {
        await blueprintCanvas.click({button: 'right', position: {x: 400, y: 280}});
        await page.locator('.bp-context-menu .context-menu-item').filter({hasText: /^条件判断$/}).click();
        await expect(page.locator('.bp-node-container')).toHaveCount(1);
    };
    await addCondition();
    await tabs.first().click();
    await addCondition();

    await page.keyboard.press('Meta+z');
    await expect(page.locator('.bp-node-container')).toHaveCount(0);
    await tabs.last().click();
    await expect(page.locator('.bp-node-container')).toHaveCount(1);
    await page.keyboard.press('Meta+z');
    await expect(page.locator('.bp-node-container')).toHaveCount(0);
    await page.keyboard.press('Meta+z');
    await expect(tabs).toHaveCount(1);
    await expect(text).toHaveCount(1);
    await page.keyboard.press('Meta+z');
    await expect(text).toHaveCount(0);

    await page.keyboard.press('Meta+Shift+z');
    await expect(text).toHaveCount(1);
    await page.keyboard.press('Meta+Shift+z');
    await expect(tabs).toHaveCount(2);
    await tabs.last().click();
    await page.keyboard.press('Meta+Shift+z');
    await expect(page.locator('.bp-node-container')).toHaveCount(1);
    await tabs.first().click();
    await page.keyboard.press('Meta+Shift+z');
    await expect(page.locator('.bp-node-container')).toHaveCount(1);
});

test('blueprint change remains undoable and redoable after editor-blueprint stops', async ({page}) => {
    await page.clock.install();
    const savedPayloads: string[] = [];
    await page.route('**/api/project/update', async route => {
        savedPayloads.push(route.request().postDataJSON().dataJson);
        await route.fulfill({json: {code: 200, msg: '', data: true}});
    });
    await page.goto('/designer?id=blueprint-plugin-stop');
    const canvas = page.locator('#designer-ds-content');
    await expect(canvas).toBeVisible({timeout: projectViewTimeout});
    const toolbar = page.getByRole('toolbar', {name: '画布工具'});
    await toolbar.getByRole('button', {name: '打开蓝图编辑器'}).click();
    const tabs = page.getByRole('tablist', {name: '蓝图页面'}).getByRole('tab');
    await page.getByRole('button', {name: '新增页面'}).click();
    await expect(tabs).toHaveCount(2);
    await page.locator('.blue-print-canvas').click({button: 'right', position: {x: 400, y: 280}});
    await page.locator('.bp-context-menu .context-menu-item').filter({hasText: /^条件判断$/}).click();
    await expect(page.locator('.bp-node-container')).toHaveCount(1);

    await page.evaluate(async () => {
        const {startApplication} = await import(/* @vite-ignore */ '/src/bootstrap/startApplication.ts');
        await (await startApplication()).stopPlugin('editor-blueprint');
    });
    await expect(page.locator('.bp-header-title')).toHaveCount(0);
    await page.keyboard.press('Meta+z');
    await saveProject(page);
    await expect.poll(() => savedPayloads.length).toBe(1);
    const afterUndo = JSON.parse(ProjectDataCodecUtil.decompressIfNeeded(savedPayloads[0]!));
    expect(afterUndo.bluePrintManager).toHaveLength(2);
    expect(afterUndo.bluePrintManager[1].bpNodeLayoutMap).toEqual({});

    // The manual save action permits one request every five seconds.
    await page.clock.fastForward(5_000);
    await page.keyboard.press('Meta+Shift+z');
    await saveProject(page);
    await expect.poll(() => savedPayloads.length).toBe(2);
    const afterRedo = JSON.parse(ProjectDataCodecUtil.decompressIfNeeded(savedPayloads[1]!));
    expect(Object.keys(afterRedo.bluePrintManager[1].bpNodeLayoutMap)).toHaveLength(1);
});
