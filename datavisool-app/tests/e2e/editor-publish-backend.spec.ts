/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {expect, test} from '@playwright/test';
import {editor, layers, open, setup} from './editor-dock/support';

setup();

test('主项目保存后预览，从子项目发起发布并通过密码访问主画布', async ({page, browser, baseURL}) => {
    const {id, headers} = await editor(page);
    const toolbar = page.getByRole('toolbar', {name: '画布工具'});
    await toolbar.getByRole('button', {name: '添加基础文本'}).click();
    await expect(page.locator('#designer-ds-content .base-text-component')).toBeVisible();

    const previewOpened = page.waitForEvent('popup');
    await page.getByRole('button', {name: '预览项目'}).click();
    const preview = await previewOpened;
    await preview.waitForURL(url => url.pathname === '/preview' && url.searchParams.get('id') === id);
    await expect(preview.locator('.datavisool-project-view .base-text-component')).toBeVisible();
    await preview.close();

    const childResponse = await page.request.post('/api/project/createSubProject', {
        headers, data: {pid: id, name: '当前编辑的子项目', dataJson: '{}'},
    });
    const childBody = await childResponse.json();
    expect(childBody.code).toBe(200);
    await open(page, '子项目');
    await page.locator('.sub-project-item').filter({hasText: '当前编辑的子项目'}).click();
    await expect.poll(() => page.evaluate(() => window.DATAVISOOL_ENV.currentManager?.id)).toBe(String(childBody.data));
    await toolbar.getByRole('button', {name: '添加基础色块'}).click();
    await expect.poll(async () => (await layers(page)).length).toBe(1);

    await page.getByRole('button', {name: '发布项目', exact: true}).click();
    const dialog = page.locator('.datavisool-header-release-config-dialog');
    await dialog.getByRole('switch').click();
    const password = 'Fixture-Release-42';
    await dialog.getByPlaceholder('请输入访问密码').fill(password);
    const released = page.waitForResponse(response => new URL(response.url()).pathname === '/api/release/release');
    await dialog.getByRole('button', {name: '发布项目', exact: true}).click();
    const response = await released;
    expect(response.request().postDataJSON()).toMatchObject({projectId: id});
    const body = await response.json();
    expect(body.code).toBe(200);
    expect(body.data).toBeTruthy();
    await expect(dialog.getByRole('button', {name: '查看发布'})).toBeVisible();

    const visitor = await browser.newContext({baseURL, locale: 'zh-CN'});
    try {
        const release = await visitor.newPage();
        await release.goto(`/release/${Buffer.from(String(body.data)).toString('base64')}`);
        const releaseCanvas = release.locator('.datavisool-project-release');
        await expect(release.getByText('密码校验', {exact: true})).toBeVisible();
        await expect(releaseCanvas).toHaveCount(0);
        const passwordInput = release.getByPlaceholder('请修输入密码');
        const confirm = release.getByRole('button', {name: '确认', exact: true});
        await passwordInput.fill('Fixture-Wrong-42');
        const denied = release.waitForResponse(response => new URL(response.url()).pathname === '/api/release/getReleaseData');
        await confirm.click();
        expect((await (await denied).json()).data).toBeFalsy();
        await expect(confirm).toBeVisible();
        await expect(releaseCanvas).toHaveCount(0);

        await passwordInput.fill(password);
        await confirm.click();
        await expect(releaseCanvas.locator('.base-text-component')).toBeVisible();
        await expect(confirm).toHaveCount(0);
    } finally {
        await visitor.close();
    }
});
