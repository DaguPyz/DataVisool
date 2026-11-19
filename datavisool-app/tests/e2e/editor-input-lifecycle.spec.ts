/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {expect, test, type Page} from '@playwright/test';

const projectData = {canvasManager: {width: 840, height: 480, adaptationType: 'none'}};
const projectViewTimeout = 20_000;

async function readLayerCount(page: Page) {
    return page.evaluate(() => Object.keys(window.DATAVISOOL_ENV.currentManager.layerManager.layerConfigs).length);
}

test.beforeEach(async ({page}) => {
    await page.addInitScript(() => {
        localStorage.setItem('datavisool-i18n-locale', 'zh-CN');
        localStorage.setItem('DATAVISOOL_USER_INFO', JSON.stringify({
            id: 'input-lifecycle-fixture', username: 'tester', name: 'Test User', token: 'fixture-token', roles: ['ROLE_USER'],
        }));
    });
    await page.route('**/static/logo/**', route => route.fulfill({status: 404}));
    await page.route(url => url.pathname.startsWith('/api/'), route => {
        const {pathname} = new URL(route.request().url());
        let data: unknown = [];
        if (pathname.startsWith('/api/project/getProjectData/')) {
            const id = pathname.split('/').at(-1);
            data = {id, name: `项目 ${id}`, dataJson: JSON.stringify(projectData)};
        }
        return route.fulfill({json: {code: 200, msg: '', data}});
    });
});

test('停用快捷键会立即退出临时抓手，画布快捷键失效且工具栏仍可用', async ({page}) => {
    await page.goto('/designer?id=input-lifecycle');
    const canvas = page.locator('#designer-ds-content');
    const viewport = page.locator('.designer-ds-container');
    await expect(canvas).toBeVisible({timeout: projectViewTimeout});

    const toolbar = page.getByRole('toolbar', {name: '画布工具'});
    const selectTool = toolbar.getByRole('button', {name: '选择工具'});
    const handTool = toolbar.getByRole('button', {name: '抓手工具'});

    // Check the canvas has focus and keyboard tool changes work before stopping the shortcut plugin.
    await canvas.click({position: {x: 20, y: 20}});
    await page.keyboard.press('h');
    await expect(handTool).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('v');
    await expect(selectTool).toHaveAttribute('aria-pressed', 'true');

    await page.keyboard.down('Space');
    try {
        await expect(viewport).toHaveClass(/datavisool-workspace-hand/);
        await selectTool.focus();
        await expect(viewport).not.toHaveClass(/datavisool-workspace-hand/);
        await viewport.focus();
        await expect(viewport).toHaveClass(/datavisool-workspace-hand/);
        await page.evaluate(async () => {
            const {startApplication} = await import(/* @vite-ignore */ '/src/bootstrap/startApplication.ts');
            await (await startApplication()).stopPlugin('editor-shortcuts');
        });

        const classes = await viewport.getAttribute('class');
        expect(classes?.split(/\s+/)).not.toContain('datavisool-workspace-hand');

        // The same canvas-tool shortcut no longer changes the selected tool after stop.
        await page.keyboard.press('h');
        await expect(handTool).toHaveAttribute('aria-pressed', 'false');
        await expect(selectTool).toHaveAttribute('aria-pressed', 'true');
    } finally {
        await page.keyboard.up('Space');
    }

    // Canvas-owned toolbar contributions remain active independently of editor-shortcuts.
    await toolbar.getByRole('button', {name: '添加基础文本', exact: true}).click();
    await expect.poll(() => readLayerCount(page)).toBe(1);
    await handTool.click();
    await expect(handTool).toHaveAttribute('aria-pressed', 'true');
    await selectTool.click();
    await expect(selectTool).toHaveAttribute('aria-pressed', 'true');
});
