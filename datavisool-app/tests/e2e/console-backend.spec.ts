/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {expect, test} from '@playwright/test';

const username = process.env.DATAVISOOL_E2E_USERNAME;
const password = process.env.DATAVISOOL_E2E_PASSWORD;
const backend = process.env.DATAVISOOL_SERVER_DEV_TARGET;
const allowWrites = process.env.DATAVISOOL_E2E_ALLOW_WRITES === 'isolated';

test.use({trace: 'off', screenshot: 'off', video: 'off'});

test('真实后端和数据库：登录、新建项目、读取控制台并清理', async ({page}, testInfo) => {
    test.skip(!username || !password || !backend || !allowWrites, '需要隔离后端、测试账号以及写入确认环境变量');
    await page.addInitScript(() => localStorage.setItem('datavisool-i18n-locale', 'zh-CN'));
    await page.setViewportSize({width: 1440, height: 900});
    await page.goto('/login');
    await page.getByLabel('用户名').fill(username!);
    await page.getByLabel('密码').fill(password!);
    const endpoints = [
        '/api/project/pageList', '/api/font/pageList', '/api/video/page', '/api/model/page',
        '/api/dynamicScript/pageList', '/api/aiModel/pageList', '/api/remote/component/pageList',
        '/api/commonDatabase/pageList', '/api/commonApi/pageList', '/api/release/pageList',
    ];
    const requests = endpoints.map((path) => page.waitForResponse((response) => new URL(response.url()).pathname === path));
    await page.getByRole('button', {name: '登录', exact: true}).click();
    await expect(page).toHaveURL(/\/home\/console$/);
    for (const response of await Promise.all(requests)) {
        expect((await response.json()).code, new URL(response.url()).pathname).toBe(200);
    }
    const dashboard = page.locator('[aria-busy]').filter({has: page.getByRole('heading', {name: '控制台', exact: true})});
    await expect(dashboard).toHaveAttribute('aria-busy', 'false');
    await expect(dashboard.getByRole('alert')).toHaveCount(0);
    const projectCard = page.getByRole('region', {name: '核心指标'}).locator('article')
        .filter({has: page.getByRole('heading', {name: '项目总数', exact: true})});
    await expect(projectCard.locator('strong').first()).toHaveText('0');

    let projectId: string | undefined;
    const token = await page.evaluate(() => JSON.parse(localStorage.getItem('DATAVISOOL_USER_INFO') || '{}').token as string);
    expect(Boolean(token)).toBe(true);
    try {
        const name = `控制台数据库验证-${Date.now()}`;
        await page.getByRole('button', {name: '新建项目', exact: true}).click();
        const dialog = page.locator('.new-project-dialog');
        await dialog.getByPlaceholder('请输入项目名称').fill(name);
        const created = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/project/create');
        await dialog.getByRole('button', {name: '创建项目'}).click();
        const createdBody = await (await created).json();
        expect(createdBody.code).toBe(200);
        projectId = String(createdBody.data);
        expect(projectId).toMatch(/^\d+$/);
        await expect(page).toHaveURL(new RegExp(`/designer\\?id=${projectId}$`));

        const list = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/project/pageList');
        await page.goto('/home/console');
        const listBody = await (await list).json();
        expect(listBody.code).toBe(200);
        const project = listBody.data.records.find((record: {id: string | number}) => String(record.id) === projectId);
        expect(project?.name).toBe(name);
        expect(project?.updateTime).toBeTruthy();
        await expect(dashboard).toHaveAttribute('aria-busy', 'false');
        await expect(projectCard.locator('strong').first()).toHaveText('1');
        const activity = dashboard.locator('button[data-type="project"]').filter({hasText: name});
        await expect(activity).toBeVisible();
        const expectedTime = await page.evaluate((value) => {
            const date = Array.isArray(value)
                ? new Date(value[0], value[1] - 1, value[2], value[3] || 0, value[4] || 0)
                : new Date(String(value).replace(' ', 'T'));
            return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
        }, project.updateTime);
        await expect(activity.locator('time')).toHaveText(expectedTime);
        const screenshot = testInfo.outputPath('console-real-database.png');
        await page.screenshot({path: screenshot, animations: 'disabled'});
        await testInfo.attach('console-real-database', {path: screenshot, contentType: 'image/png'});
    } finally {
        if (projectId && /^\d+$/.test(projectId)) {
            const cleanup = await page.request.get(`/api/project/del/${projectId}`, {headers: {Authorization: `Bearer ${token}`}});
            const body = await cleanup.json();
            expect(body.code).toBe(200);
            expect(body.data).toBe(true);
        }
    }
});
