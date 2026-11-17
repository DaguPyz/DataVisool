/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {expect, test} from '@playwright/test';

test.beforeEach(async ({page}) => {
    await page.addInitScript(() => localStorage.setItem('datavisool-i18n-locale', 'zh-CN'));
    await page.route('**/static/logo/**', route => route.fulfill({status: 404}));
});

test('可以直达应用错误页并返回上一页', async ({page}) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', {name: '登录控制台'})).toBeVisible();
    await page.goto('/error');
    await expect(page.getByRole('heading', {name: '页面暂时无法正常显示'})).toBeVisible();
    await expect(page.locator('.app-error-page-code strong')).toHaveText(/^ERR-\d{14}-/);

    await page.getByRole('button', {name: '返回上一页'}).click();
    await expect(page).toHaveURL('/login');
    await expect(page.getByRole('heading', {name: '登录控制台'})).toBeVisible();
});

test('路由页面加载失败时显示错误页并支持重载', async ({page}) => {
    const loginModule = (url: URL) => url.pathname === '/src/plugins/login/Login.tsx';
    await page.route(loginModule, route => route.abort());
    await page.goto('/login');
    await expect(page.getByRole('heading', {name: '页面暂时无法正常显示'})).toBeVisible();

    await page.unroute(loginModule);
    await page.getByRole('button', {name: '重新加载'}).click();
    await expect(page.getByRole('heading', {name: '登录控制台'})).toBeVisible();
});
