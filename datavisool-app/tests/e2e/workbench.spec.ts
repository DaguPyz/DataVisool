/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {expect, test, type Page} from '@playwright/test';
import type {RoleType, SessionService} from '../../src/contracts/session.ts';

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
    const navigation = page.locator('.home-left');
    await expect(navigation).toHaveCSS('width', '240px');
    await expect(page.getByRole('menuitem', {name: '用户管理'})).toHaveCount(0);
    await page.getByRole('menuitem', {name: 'AI模型管理', exact: true}).click();
    await expect(page).toHaveURL('/home/aiModel');

    await page.setViewportSize({width: 700, height: 900});
    await expect(navigation).toHaveCSS('width', '64px');
});

test('导航在直达、历史切换和角色变化后同步菜单状态', async ({page}) => {
    await prepareWorkbench(page);
    await page.goto('/home/api');
    const menu = page.locator('.home-primary-menu');
    const group = menu.getByRole('menuitem', {name: '数据源管理', exact: true});
    const api = menu.getByRole('menuitem', {name: 'API管理', exact: true});
    const ai = menu.getByRole('menuitem', {name: 'AI模型管理', exact: true});
    await expect(group).toHaveAttribute('aria-expanded', 'true');
    await expect(api).toHaveAttribute('aria-current', 'page');

    await ai.click();
    await expect(page).toHaveURL('/home/aiModel');
    await expect(ai).toHaveAttribute('aria-current', 'page');
    await page.goBack();
    await expect(group).toHaveAttribute('aria-expanded', 'true');
    await expect(api).toHaveAttribute('aria-current', 'page');
    await page.goForward();
    await expect(ai).toHaveAttribute('aria-current', 'page');

    const setRole = (role: string) => page.evaluate(async role => {
        const appModule = '/src/bootstrap/startApplication.ts';
        const sessionModule = '/src/contracts/session.ts';
        const [{startApplication}, {sessionKey}] = await Promise.all([
            import(/* @vite-ignore */ appModule),
            import(/* @vite-ignore */ sessionModule),
        ]);
        const session: SessionService = (await startApplication()).get(sessionKey);
        session.setUserInfo({...session.getUserInfo()!, roles: [role as RoleType]});
    }, role);
    const users = menu.getByRole('menuitem', {name: '用户管理', exact: true});
    await setRole('ROLE_ADMIN');
    await expect(users).toHaveCount(0);
    await expect(ai).toBeVisible();
    await setRole('ROLE_SYSTEM_ADMIN');
    await expect(users).toBeVisible();
    await setRole('ROLE_USER');
    await expect(users).toHaveCount(0);
});

test('旧账号设置地址和账号菜单都打开设置页', async ({page}) => {
    await prepareWorkbench(page);
    await page.goto('/home/userInfo');
    await expect(page).toHaveURL('/home/setting');

    await page.goto('/home/console');
    await page.getByRole('button', {name: '账号菜单'}).click();
    await page.getByText('账号设置', {exact: true}).click();
    await expect(page).toHaveURL('/home/setting');
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

test('应用停用时取消升级检查和待执行的切页', async ({page}) => {
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
        const runtime = await startApplication();
        const modelMenu = [...document.querySelectorAll<HTMLButtonElement>('.home-primary-menu button')]
            .find(button => button.textContent?.trim() === 'AI模型管理');
        if (!modelMenu) throw new Error('未找到待跳转的菜单');
        modelMenu.click();
        await runtime.stop();
    });

    expect((await failed).failure()?.errorText).toBe('net::ERR_ABORTED');
    await expect(page.locator('.datavisool-home')).toHaveCount(0);
    await expect(page).toHaveURL('/home/console');
});
