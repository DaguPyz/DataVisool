/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {expect, test, type Page} from '@playwright/test';

const projectData = {canvasManager: {width: 840, height: 480, adaptationType: 'none'}};
const projectViewTimeout = 20_000;

test.setTimeout(60_000);

function navigate(page: Page, path: string) {
    return page.evaluate(async to => {
        const {startApplication} = await import(/* @vite-ignore */ '/src/bootstrap/startApplication.ts');
        await (await startApplication()).get('router').navigate(to);
    }, path);
}

async function readLayerCount(page: Page) {
    return page.evaluate(() => Object.keys(window.DATAVISOOL_ENV.currentManager.layerManager.layerConfigs).length);
}

async function readClipboard(page: Page) {
    return page.evaluate(() => navigator.clipboard.readText());
}

async function addAndSelectText(page: Page) {
    await page.getByRole('button', {name: '添加基础文本', exact: true}).click();
    await page.locator('.designer-left-menus-top').getByRole('button', {name: '图层', exact: true}).click();
    const row = page.locator('.layer-list .layer-item').filter({hasText: '基础文本'}).first();
    await expect(row).toBeVisible();
    await row.click();
    await expect(row).toHaveClass(/layer-selected/);
    return row;
}

async function dispatchPaste(page: Page, text: string) {
    await page.evaluate(value => {
        const clipboardData = new DataTransfer();
        clipboardData.setData('text/plain', value);
        document.dispatchEvent(new ClipboardEvent('paste', {
            clipboardData,
            bubbles: true,
            cancelable: true,
        }));
    }, text);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
}

test.beforeEach(async ({page}) => {
    await page.addInitScript(() => {
        localStorage.setItem('datavisool-i18n-locale', 'zh-CN');
        localStorage.setItem('DATAVISOOL_USER_INFO', JSON.stringify({
            id: 'clipboard-fixture', username: 'tester', name: 'Test User', token: 'fixture-token', roles: ['ROLE_USER'],
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

test('图层列表复制后连续粘贴各自形成一次可撤销动作', async ({page}) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/designer?id=clipboard-history');
    await expect(page.locator('#designer-ds-content')).toBeVisible({timeout: projectViewTimeout});
    await addAndSelectText(page);

    await page.keyboard.press('Meta+C');
    await expect.poll(() => readClipboard(page)).toContain('DATAVISOOL_COPY');
    expect(JSON.parse(await readClipboard(page))).toMatchObject({flag: 'DATAVISOOL_COPY'});

    const rows = page.locator('.layer-list .layer-item');
    const toolbar = page.getByRole('toolbar', {name: '画布工具'});
    await page.keyboard.press('Meta+V');
    await expect.poll(() => rows.count()).toBe(2);
    await page.keyboard.press('Meta+V');
    await expect.poll(() => rows.count()).toBe(3);

    await toolbar.getByRole('button', {name: '撤销', exact: true}).click();
    await expect(rows).toHaveCount(2);
    await toolbar.getByRole('button', {name: '撤销', exact: true}).click();
    await expect(rows).toHaveCount(1);
});

test('普通输入框的全选删除和文本复制粘贴不操作画布图层', async ({page}) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/designer?id=clipboard-input');
    await expect(page.locator('#designer-ds-content')).toBeVisible({timeout: projectViewTimeout});
    await addAndSelectText(page);
    await page.locator('.designer-left-menus-top').getByRole('button', {name: '全局变量', exact: true}).click();
    await page.locator('.global-variable').getByRole('button', {name: '新建全局变量', exact: true}).click();

    const input = page.locator('.global-variable-edit-panel input').first();
    const copiedText = 'ordinary clipboard text';
    await input.fill(copiedText);
    await page.keyboard.press('Meta+A');
    await page.keyboard.press('Meta+C');
    await expect.poll(() => readClipboard(page)).toBe(copiedText);

    await page.keyboard.press('Meta+A');
    await page.keyboard.press('Backspace');
    await expect(input).toHaveValue('');
    expect(await readLayerCount(page)).toBe(1);

    await page.keyboard.press('Meta+V');
    await expect(input).toHaveValue(copiedText);
    expect(await readLayerCount(page)).toBe(1);
});

test('切换项目后保留一份 paste 监听，停用 shortcuts 后移除监听', async ({page}) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/designer?id=clipboard-listener-first');
    await expect(page.locator('#designer-ds-content')).toBeVisible({timeout: projectViewTimeout});
    await addAndSelectText(page);
    await page.keyboard.press('Meta+C');
    await expect.poll(() => readClipboard(page)).toContain('DATAVISOOL_COPY');
    const payload = await readClipboard(page);

    await navigate(page, '/designer?id=clipboard-listener-next');
    await expect(page).toHaveTitle('项目 clipboard-listener-next');
    await expect(page.locator('#designer-ds-content')).toBeVisible({timeout: projectViewTimeout});
    expect(await readLayerCount(page)).toBe(0);
    await dispatchPaste(page, payload);
    await expect.poll(() => readLayerCount(page)).toBe(1);

    await page.evaluate(async () => {
        const {startApplication} = await import(/* @vite-ignore */ '/src/bootstrap/startApplication.ts');
        await (await startApplication()).stopPlugin('editor-shortcuts');
    });
    await expect(page.getByRole('button', {name: '快捷键帮助', exact: true})).toHaveCount(0);
    await dispatchPaste(page, payload);
    await expect.poll(() => readLayerCount(page)).toBe(1);
});
