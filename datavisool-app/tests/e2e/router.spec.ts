/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {expect, test, type Page} from '@playwright/test';
import type {RouteDefinition, RouterService} from '../../src/contracts/router.ts';
import type {Plugin} from '../../src/visloom/index.ts';

async function serveFixture(page: Page) {
    await page.route('**/static/logo/**', route => route.fulfill({status: 404}));
    await page.route(url => url.pathname === '/src/index.tsx', async route => {
        const url = new URL('/tests/e2e/fixtures/router-host.tsx', route.request().url());
        const response = await route.fetch({url: url.href});
        await route.fulfill({response});
    });
}

test('第三方子路由可直达、刷新并跟随布局替换', async ({page}) => {
    await serveFixture(page);
    await page.goto('/home/reports/42');
    await expect(page.locator('.home-content').getByRole('heading', {name: 'Report 42'})).toBeVisible();
    await page.reload();
    await expect(page.locator('.home-content').getByRole('heading', {name: 'Report 42'})).toBeVisible();

    await page.goto('/home/reports/42?layout=alternate');
    const alternateLayout = page.getByRole('main', {name: 'Alternate layout'});
    await expect(alternateLayout.getByRole('heading', {name: 'Report 42'})).toBeVisible();
    await page.reload();
    await expect(alternateLayout.getByRole('heading', {name: 'Report 42'})).toBeVisible();
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
            '/src/contracts/router.ts',
            '/src/plugins/error-ui/errorUiPlugin.ts',
            '/src/plugins/router/routerPlugin.tsx',
        ];
        const [{createAppRuntime}, {routerKey}, {createErrorUiPlugin}, {createRouterPlugin}] =
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
                requires: [routerKey],
                provides: [],
                activate(context) {
                    const registration = context.get<RouterService>(routerKey).registerRoutes(routes, requiredPaths);
                    context.onStop(registration);
                    context.onDispose(registration.dispose);
                },
            };
            const runtime = await createAppRuntime([contributor, createRouterPlugin({homePath: '/'}), createErrorUiPlugin()]);
            try {
                runtime.get(routerKey).createView();
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
