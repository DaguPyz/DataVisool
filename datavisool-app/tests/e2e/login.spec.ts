/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {generateKeyPairSync} from 'node:crypto';
import {expect, test} from '@playwright/test';

test.beforeEach(async ({page}) => {
    await page.addInitScript(() => localStorage.setItem('datavisool-i18n-locale', 'zh-CN'));
    await page.route('**/static/logo/**', (route) => route.fulfill({status: 404}));
});

test('直接访问根地址会显示登录页并保留地址', async ({page}) => {
    await page.goto('/');
    await expect(page.getByRole('heading', {name: '登录控制台'})).toBeVisible();
    await expect(page).toHaveURL('/');
});

test('应用停用时取消未完成的登录请求', async ({page}) => {
    const {publicKey} = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: {type: 'spki', format: 'der'},
        privateKeyEncoding: {type: 'pkcs8', format: 'der'},
    });
    await page.route('**/api/security/getEncryptKey', route => route.fulfill({
        json: {code: 200, msg: '', data: {key: publicKey.toString('base64')}},
    }));
    const loginEndpoint = '/api/authenticate/login';
    await page.route(`**${loginEndpoint}`, () => {});
    await page.goto('/login');
    await page.getByLabel('用户名').fill('sample-user');
    await page.getByLabel('密码').fill('sample-password');

    const sent = page.waitForRequest(request => new URL(request.url()).pathname === loginEndpoint);
    await page.getByRole('button', {name: '登录', exact: true}).click();
    const loginRequest = await sent;
    const failed = page.waitForEvent('requestfailed', {predicate: request => request === loginRequest});
    await page.evaluate(async () => {
        const appModule = '/src/bootstrap/startApplication.ts';
        const {startApplication} = await import(/* @vite-ignore */ appModule);
        await (await startApplication()).stop();
    });

    expect((await failed).failure()?.errorText).toBe('net::ERR_ABORTED');
    expect(await page.evaluate(() => localStorage.getItem('DATAVISOOL_USER_INFO'))).toBeNull();
});

test('账号密码可以输入，密码默认隐藏', async ({page}) => {
    await page.goto('/login');
    const username = page.getByLabel('用户名');
    const password = page.getByLabel('密码');
    await username.fill('sample-user');
    await password.fill('sample-password');
    await expect(username).toHaveValue('sample-user');
    await expect(password).toHaveValue('sample-password');
    await expect(password).toHaveAttribute('type', 'password');
});

test('服务条款可以打开和关闭', async ({page}) => {
    await page.goto('/login');
    await page.getByRole('button', {name: '《服务条款》'}).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('DataVisool Web 服务条款', {exact: true})).toBeVisible();
    await dialog.getByRole('button', {name: '关闭'}).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('heading', {name: '登录控制台'})).toBeVisible();
});

for (const width of [1440, 1024, 700, 390]) {
    test(`${width}px 页面与操作控件可见且无横向溢出`, async ({page}, testInfo) => {
        await page.setViewportSize({width, height: 900});
        await page.emulateMedia({reducedMotion: 'reduce'});
        await page.goto('/login');
        await expect(page.getByRole('heading', {name: '登录控制台'})).toBeVisible();
        await expect(page.getByLabel('用户名')).toBeVisible();
        await expect(page.getByLabel('密码')).toBeVisible();
        await expect(page.getByRole('button', {name: '登录', exact: true})).toBeVisible();
        await expect(page.getByRole('button', {name: '《服务条款》'})).toBeVisible();
        const size = await page.evaluate(() => ({width: innerWidth, scroll: document.documentElement.scrollWidth}));
        expect(size.scroll).toBeLessThanOrEqual(size.width + 1);
        const screenshot = testInfo.outputPath(`login-${width}.png`);
        await page.screenshot({path: screenshot, animations: 'disabled'});
        await testInfo.attach(`login-${width}`, {path: screenshot, contentType: 'image/png'});
    });
}
