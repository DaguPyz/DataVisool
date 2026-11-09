/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {expect, test} from '@playwright/test';

const username = process.env.DATAVISOOL_E2E_USERNAME;
const password = process.env.DATAVISOOL_E2E_PASSWORD;
const backend = process.env.DATAVISOOL_SERVER_DEV_TARGET;
test.use({trace: 'off', screenshot: 'off', video: 'off'});

test.describe('登录真实后端', () => {
    test.skip(!username || !password || !backend, '需要提供测试后端和测试账号环境变量');

    test.beforeEach(async ({page}) => {
        await page.addInitScript(() => localStorage.setItem('datavisool-i18n-locale', 'zh-CN'));
    });

    test('错误密码被拒绝且不建立登录状态', async ({page}) => {
        await page.goto('/login');
        await page.getByLabel('用户名').fill(username!);
        await page.getByLabel('密码').fill('invalid-test-password');
        const response = page.waitForResponse((value) => new URL(value.url()).pathname === '/api/authenticate/login');
        await page.getByRole('button', {name: '登录', exact: true}).click();
        const result = await (await response).json();
        expect(result.code).not.toBe(200);
        await expect(page).toHaveURL(/\/login$/);
        expect(await page.evaluate(() => localStorage.getItem('DATAVISOOL_USER_INFO'))).toBeNull();
        await expect(page.getByRole('alert')).toBeVisible();
    });

    test('正确账号登录、刷新保持登录并通过后端鉴权，退出清除登录状态', async ({page}) => {
        const unauthorized = await page.request.post('/api/project/pageList', {data: {current: 1, size: 1}});
        expect((await unauthorized.json()).code).toBe(10002);
        const invalid = await page.request.post('/api/project/pageList', {
            headers: {Authorization: 'Bearer invalid-test-token'}, data: {current: 1, size: 1},
        });
        expect((await invalid.json()).code).toBe(10002);
        await page.goto('/login');
        await page.getByLabel('用户名').fill(username!);
        await page.getByLabel('密码').fill(password!);
        const responsePromise = page.waitForResponse((value) => new URL(value.url()).pathname === '/api/authenticate/login');
        await page.getByRole('button', {name: '登录', exact: true}).click();
        const response = await responsePromise;
        const submitted = response.request().postDataJSON();
        expect(submitted.username).toBe(username);
        expect(typeof submitted.password.encryptedData).toBe('string');
        expect(typeof submitted.password.encryptedAesKey).toBe('string');
        expect(typeof submitted.password.iv).toBe('string');
        expect((await response.json()).code).toBe(200);
        await expect(page).toHaveURL(/\/home\/console$/);
        await expect(page.getByRole('heading', {name: '控制台', exact: true})).toBeVisible();
        await page.reload();
        await expect(page.getByRole('heading', {name: '控制台', exact: true})).toBeVisible();
        const authResult = await page.evaluate(async () => {
            const user = JSON.parse(localStorage.getItem('DATAVISOOL_USER_INFO') || '{}');
            if (!user.token) return null;
            const result = await fetch('/api/project/pageList', {
                method: 'POST', headers: {'Content-Type': 'application/json', Authorization: `Bearer ${user.token}`},
                body: JSON.stringify({current: 1, size: 1}),
            });
            return (await result.json()).code;
        });
        expect(authResult).toBe(200);
        await page.getByRole('button', {name: '账号菜单'}).click();
        await page.getByText('退出登录', {exact: true}).click();
        await expect(page).toHaveURL(/\/login$/);
        expect(await page.evaluate(() => localStorage.getItem('DATAVISOOL_USER_INFO'))).toBeNull();
    });

    test('退出后旧令牌不能再访问受保护接口', async ({page}) => {
        await page.goto('/login');
        await page.getByLabel('用户名').fill(username!);
        await page.getByLabel('密码').fill(password!);
        await page.getByRole('button', {name: '登录', exact: true}).click();
        await expect(page).toHaveURL(/\/home\/console$/);
        const token = await page.evaluate(() => JSON.parse(localStorage.getItem('DATAVISOOL_USER_INFO') || '{}').token as string);
        expect(Boolean(token)).toBe(true);
        await page.getByRole('button', {name: '账号菜单'}).click();
        await page.getByText('退出登录', {exact: true}).click();
        await expect(page).toHaveURL(/\/login$/);
        const response = await page.request.post('/api/project/pageList', {
            headers: {Authorization: `Bearer ${token}`}, data: {current: 1, size: 1},
        });
        expect((await response.json()).code).toBe(10002);
        const repeated = await page.request.post('/api/authenticate/logout', {
            headers: {Authorization: `Bearer ${token}`},
        });
        expect((await repeated.json()).code).toBe(200);
    });

    test('同一账号的其他登录不受退出影响', async ({browser, baseURL}) => {
        const contexts = await Promise.all([browser.newContext({baseURL}), browser.newContext({baseURL})]);
        try {
            const pages = await Promise.all(contexts.map((context) => context.newPage()));
            await Promise.all(pages.map(async (page) => {
                await page.addInitScript(() => localStorage.setItem('datavisool-i18n-locale', 'zh-CN'));
                await page.goto('/login');
                await page.getByLabel('用户名').fill(username!);
                await page.getByLabel('密码').fill(password!);
                await page.getByRole('button', {name: '登录', exact: true}).click();
                await expect(page).toHaveURL(/\/home\/console$/);
            }));
            const tokens = await Promise.all(pages.map((page) => page.evaluate(
                () => JSON.parse(localStorage.getItem('DATAVISOOL_USER_INFO') || '{}').token as string,
            )));
            expect(tokens[0]).not.toBe(tokens[1]);
            await pages[0].getByRole('button', {name: '账号菜单'}).click();
            await pages[0].getByText('退出登录', {exact: true}).click();
            await expect(pages[0]).toHaveURL(/\/login$/);
            for (const [index, token] of tokens.entries()) {
                const result = await pages[index].request.post('/api/project/pageList', {
                    headers: {Authorization: `Bearer ${token}`}, data: {current: 1, size: 1},
                });
                expect((await result.json()).code).toBe(index === 0 ? 10002 : 200);
            }
        } finally {
            await Promise.all(contexts.map((context) => context.close()));
        }
    });

    test('退出请求失败时保留登录信息', async ({page}) => {
        await page.goto('/login');
        await page.getByLabel('用户名').fill(username!);
        await page.getByLabel('密码').fill(password!);
        await page.getByRole('button', {name: '登录', exact: true}).click();
        await expect(page).toHaveURL(/\/home\/console$/);
        await page.route('**/api/authenticate/logout', (route) => route.fulfill({
            status: 503, contentType: 'application/json', body: JSON.stringify({code: 503, msg: '退出失败，请重试'}),
        }));
        await page.getByRole('button', {name: '账号菜单'}).click();
        const response = page.waitForResponse((value) => new URL(value.url()).pathname === '/api/authenticate/logout');
        await page.getByText('退出登录', {exact: true}).click();
        expect((await response).status()).toBe(503);
        await expect(page.getByRole('alert')).toBeVisible();
        await expect(page).toHaveURL(/\/home\/console$/);
        expect(await page.evaluate(() => Boolean(localStorage.getItem('DATAVISOOL_USER_INFO')))).toBe(true);
    });
});
