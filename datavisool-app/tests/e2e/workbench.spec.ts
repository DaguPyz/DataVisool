/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {expect, test, type Page} from '@playwright/test';

const logoutEndpoint = '/api/authenticate/logout';
const updateEndpoint = '/api/webUpdate/check';

async function prepareWorkbench(page: Page, role = 'ROLE_USER') {
    await page.addInitScript(role => {
        localStorage.setItem('datavisool-i18n-locale', 'zh-CN');
        localStorage.setItem('DATAVISOOL_USER_INFO', JSON.stringify({
            id: 'fixture-user', username: 'tester', name: 'Test User', token: 'fixture-token', roles: [role],
        }));
    }, role);
    await page.route('**/static/logo/**', route => route.fulfill({status: 404}));
    await page.route(url => url.pathname.startsWith('/api/'), route => route.fulfill({
        json: {code: 200, msg: '', data: {records: [], total: 0}},
    }));
}

test('工作台默认打开控制台并按角色显示登记的菜单', async ({page}) => {
    await prepareWorkbench(page);
    await page.goto('/home');
    await expect(page).toHaveURL('/home/console');
    await expect(page.getByRole('heading', {name: '控制台', exact: true})).toBeVisible();
    await expect(page.getByRole('menuitem', {name: '用户管理'})).toHaveCount(0);
    await page.getByRole('menuitem', {name: 'AI模型管理', exact: true}).click();
    await expect(page).toHaveURL('/home/aiModel');
});

test('退出失败保留会话，重试成功后返回登录入口', async ({page}) => {
    await prepareWorkbench(page);
    let fail = true;
    await page.route(url => url.pathname === logoutEndpoint, route => {
        expect(route.request().headers().authorization).toBe('Bearer fixture-token');
        return route.fulfill({status: fail ? 503 : 200, json: {code: fail ? 503 : 200, msg: ''}});
    });
    await page.goto('/home/console');
    const logOut = async () => {
        await page.getByRole('button', {name: '账号菜单'}).click();
        await page.getByText('退出登录', {exact: true}).click();
    };

    await logOut();
    await expect(page.getByText('退出失败，请重试', {exact: true})).toBeVisible();
    await expect(page).toHaveURL('/home/console');
    expect(await page.evaluate(() => localStorage.getItem('DATAVISOOL_USER_INFO'))).toContain('fixture-token');

    fail = false;
    await logOut();
    await expect(page).toHaveURL('/login');
    expect(await page.evaluate(() => localStorage.getItem('DATAVISOOL_USER_INFO'))).toBeNull();
});

test('应用停用时取消工作台的升级检查请求', async ({page}) => {
    await prepareWorkbench(page, 'ROLE_SYSTEM_ADMIN');
    await page.route(url => url.pathname === updateEndpoint, () => {});
    const sent = page.waitForRequest(request => new URL(request.url()).pathname === updateEndpoint);
    await page.goto('/home/console');
    await expect(page.getByRole('menuitem', {name: '用户管理'})).toBeVisible();
    const updateRequest = await sent;
    const failed = page.waitForEvent('requestfailed', {predicate: request => request === updateRequest});

    await page.evaluate(async () => {
        const appModule = '/src/bootstrap/startApplication.ts';
        const {startApplication} = await import(/* @vite-ignore */ appModule);
        await (await startApplication()).stop();
    });

    expect((await failed).failure()?.errorText).toBe('net::ERR_ABORTED');
    await expect(page.locator('.datavisool-home')).toHaveCount(0);
});
