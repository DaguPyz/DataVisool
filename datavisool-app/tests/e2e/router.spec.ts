/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {expect, test, type Page} from '@playwright/test';
import type {RouteDefinition} from '@datavisool/sdk/plugin/contracts/router';
import type {Plugin} from '@datavisool/sdk/plugin';

async function serveFixture(page: Page) {
    await page.addInitScript(() => {
        localStorage.setItem('datavisool-i18n-locale', 'zh-CN');
        localStorage.setItem('DATAVISOOL_USER_INFO', JSON.stringify({
            id: 'fixture-user', username: 'tester', name: 'Test User', token: 'fixture-token', roles: ['ROLE_USER'],
        }));
    });
    await page.route('**/static/logo/**', route => route.fulfill({status: 404}));
    await page.route(url => url.pathname.startsWith('/api/'), route => route.fulfill({
        json: {code: 200, msg: '', data: {records: [], total: 0}},
    }));
    await page.route(url => url.pathname === '/src/index.tsx', async route => {
        const url = new URL('/tests/e2e/fixtures/router-host.tsx', route.request().url());
        const response = await route.fetch({url: url.href});
        await route.fulfill({response});
    });
}

test('替换布局提供者后，原有菜单和第三方子路由仍可用', async ({page}) => {
    await serveFixture(page);
    await page.goto('/home/reports/42');
    await expect(page.locator('.home-left').getByRole('menuitem', {name: '控制台', exact: true})).toBeVisible();
    await expect(page.locator('.home-content').getByRole('heading', {name: 'Report 42'})).toBeVisible();
    await page.reload();
    await expect(page.locator('.home-content').getByRole('heading', {name: 'Report 42'})).toBeVisible();

    await page.goto('/home/reports/42?layout=alternate');
    const alternateLayout = page.getByRole('main', {name: 'Alternate layout'});
    const consoleMenu = page.getByRole('region', {name: 'Alternate navigation'})
        .getByRole('menuitem', {name: '控制台', exact: true});
    await expect(consoleMenu).toBeVisible();
    await expect(alternateLayout.getByRole('heading', {name: 'Report 42'})).toBeVisible();
    await page.reload();
    await expect(alternateLayout.getByRole('heading', {name: 'Report 42'})).toBeVisible();

    await consoleMenu.click();
    await expect(page).toHaveURL('/home/console');
    await expect(alternateLayout.getByRole('heading', {name: '控制台', exact: true})).toBeVisible();
});

test('替换导航提供者后仍接收原有菜单和第三方菜单', async ({page}) => {
    await serveFixture(page);
    await page.goto('/home/reports/42?navigation=alternate');
    const sidebar = page.locator('.home-left');
    const menus = sidebar.getByRole('navigation', {name: 'Alternate menu'});
    await expect(sidebar.getByRole('img', {name: '品牌主图'})).toBeVisible();
    await expect(sidebar.getByRole('button', {name: '账号菜单'})).toBeVisible();
    await expect(menus.getByRole('button', {name: 'Reports'})).toHaveAttribute('aria-current', 'page');
    await expect(menus.getByRole('button', {name: '用户管理'})).toHaveCount(0);
    await expect(page.getByRole('heading', {name: 'Report 42'})).toBeVisible();

    const consoleMenu = menus.getByRole('button', {name: '控制台', exact: true});
    await consoleMenu.click();
    await expect(page).toHaveURL('/home/console');
    await expect(consoleMenu).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', {name: '控制台', exact: true})).toBeVisible();
});

test('导航服务和浏览器后退都会发布已匹配的路由', async ({page}) => {
    await serveFixture(page);
    await page.goto('/home/reports');
    await page.getByRole('button', {name: 'Open report'}).click();
    await expect(page).toHaveURL('/home/reports/7%2F2?range=week#summary');
    await expect(page.getByRole('heading', {name: 'Report 7/2'})).toBeVisible();
    const events = page.locator('#route-events');
    await expect(events).toHaveText('/home/reports/7%2F2?range=week#summary app:home reports:list reports:detail');

    await page.goBack();
    await expect(page).toHaveURL('/home/reports');
    await expect(page.getByRole('heading', {name: 'Report 7/2'})).toHaveCount(0);
    await expect(events).toHaveText('/home/reports app:home reports:list');
});

test('路由组装拒绝重复 ID、冲突路径、缺失父级和循环', async ({page}) => {
    await page.route('**/static/logo/**', route => route.fulfill({status: 404}));
    await page.goto('/login');

    const errors = await page.evaluate(async () => {
        const modules = [
            '/src/bootstrap/createAppRuntime.ts',
            '/src/plugins/error-ui/errorUiPlugin.ts',
            '/src/plugins/router/routerPlugin.tsx',
        ];
        const [{createAppRuntime}, {createErrorUiPlugin}, {createRouterPlugin}] =
            await Promise.all(modules.map(path => import(/* @vite-ignore */ path)));

        const route = (id: string, path: string, parentId?: string): RouteDefinition => ({id, path, parentId, render: () => null});
        const cases = [
            {routes: [route('same', '/first'), route('same', '/second')]},
            {routes: [route('first', '/reports/:id'), route('second', '/Reports/:name')]},
            {routes: [route('detail', 'detail', 'missing')]},
            {routes: [route('first', 'one', 'second'), route('second', 'two', 'first')]},
            {routes: [route('fallback', '/*')], requiredPaths: ['/missing']},
        ];
        const failures: string[] = [];
        for (const {routes, requiredPaths} of cases) {
            const contributor: Plugin = {
                id: 'fixture-routes',
                requires: ['router'],
                provides: [],
                activate(context) {
                    const registration = context.router.registerRoutes(routes, requiredPaths);
                    context.onStop(registration);
                    context.onDispose(registration.dispose);
                },
            };
            const runtime = await createAppRuntime([contributor, createRouterPlugin({homePath: '/'}), createErrorUiPlugin()]);
            try {
                runtime.get('router').createView();
            } catch (error) {
                failures.push(String(error));
            } finally {
                await runtime.stop();
            }
        }
        return failures;
    });

    expect(errors).toHaveLength(5);
    expect(errors[0]).toContain("Duplicate route ID 'same'");
    expect(errors[1]).toContain("Conflicting path '/Reports/:name'");
    expect(errors[2]).toContain("missing parent route 'missing'");
    expect(errors[3]).toContain('parent cycle');
    expect(errors[4]).toContain("Required route '/missing' is not registered");
});
