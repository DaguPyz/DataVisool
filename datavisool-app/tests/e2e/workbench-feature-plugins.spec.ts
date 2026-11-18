/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {expect, test} from '@playwright/test';

const listPages = [
    ['/home/database', '数据源管理', '/api/commonDatabase/pageList'],
    ['/home/api', 'API管理', '/api/commonApi/pageList'],
    ['/home/font', '字体管理', '/api/font/pageList'],
    ['/home/videoResource', '视频资源管理', '/api/video/page'],
    ['/home/dynamicScript', '动态脚本管理', '/api/dynamicScript/pageList'],
    ['/home/modelResource', '3D模型资源管理', '/api/model/page'],
    ['/home/remoteComponent', '服务器组件', '/api/remote/component/pageList'],
    ['/home/releaseManagement', '发布管理', '/api/release/pageList'],
    ['/home/aiModel', 'AI模型管理', '/api/aiModel/pageList'],
    ['/home/user', '用户管理', '/api/user/pageList'],
] as const;

test.beforeEach(async ({page}) => {
    await page.addInitScript(() => {
        localStorage.setItem('datavisool-i18n-locale', 'zh-CN');
        localStorage.setItem('DATAVISOOL_USER_INFO', JSON.stringify({
            id: '1', name: '测试用户', username: 'tester', token: 'feature-token', roles: ['ROLE_SYSTEM_ADMIN'],
        }));
    });
    await page.route('**/static/logo/**', route => route.fulfill({status: 404}));
    await page.route(url => url.pathname.startsWith('/api/'), async route => {
        const body = route.request().postDataJSON();
        await route.fulfill({json: {code: 200, data: {records: [], total: 0, size: body?.size ?? 10, current: 1}, msg: ''}});
    });
});

for (const [path, title, endpoint] of listPages) {
    test(`${title}原地址和授权列表请求`, async ({page}) => {
        const request = page.waitForRequest(req => new URL(req.url()).pathname === endpoint);
        await page.goto(path);
        await expect(page.getByRole('heading', {name: title, exact: true})).toBeVisible();
        await expect(page).toHaveURL(path);
        const sent = await request;
        expect(sent.method()).toBe('POST');
        expect(sent.headers().authorization).toBe('Bearer feature-token');
        expect(sent.postDataJSON()).toMatchObject({current: 1, size: expect.any(Number)});
    });
}

test('设置保留旧地址、账号信息和帮助文档入口', async ({page}) => {
    const account = page.waitForRequest(req => new URL(req.url()).pathname === '/api/user/getUser/1');
    await page.goto('/home/userInfo');
    await expect(page).toHaveURL('/home/setting');
    await expect(page.getByText('显示名称', {exact: true})).toBeVisible();
    expect((await account).headers().authorization).toBe('Bearer feature-token');

    await page.getByRole('menuitem', {name: '帮助', exact: true}).click();
    await expect(page).toHaveURL('/home/more');
    await expect(page.getByRole('heading', {name: '帮助信息'})).toBeVisible();
    await expect(page.getByRole('link', {name: /使用文档/})).toHaveAttribute('href', process.env.VITE_USER_GUIDE_URL?.trim() || '/docs');
});

test('项目脚本和全局脚本的查询范围相互独立', async ({page}) => {
    const endpoint = '/api/dynamicScript/pageList';
    await page.goto('/home/dynamicScript');
    await expect(page.getByRole('heading', {name: '动态脚本管理'})).toBeVisible();

    const scoped = page.waitForRequest(req => new URL(req.url()).pathname === endpoint);
    await page.evaluate(async () => {
        const appModule = '/src/bootstrap/startApplication.ts';
        const {startApplication} = await import(/* @vite-ignore */ appModule);
        const runtime = await startApplication();
        await runtime.get('router').navigate('/home/projectSetting/123', {state: {projectId: '123', title: '示例项目'}});
    });
    expect((await scoped).postDataJSON()).toMatchObject({projectId: '123'});
    await expect(page.getByRole('heading', {name: '项目动态脚本'})).toBeVisible();

    const global = page.waitForRequest(req => new URL(req.url()).pathname === endpoint);
    await page.goBack();
    expect((await global).postDataJSON()).not.toHaveProperty('projectId');
    await expect(page.getByRole('heading', {name: '动态脚本管理'})).toBeVisible();
});
