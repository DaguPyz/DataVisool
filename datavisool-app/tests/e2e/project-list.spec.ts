/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {expect, test, type Page} from '@playwright/test';

interface Project {
    id: string;
    name: string;
}

async function mockProjects(page: Page, projects: Project[]) {
    await page.addInitScript(() => {
        localStorage.setItem('datavisool-i18n-locale', 'zh-CN');
        localStorage.setItem('DATAVISOOL_USER_INFO', JSON.stringify({
            id: 'fixture-user', username: 'tester', name: '项目测试', token: 'project-test-token', roles: ['ROLE_USER'],
        }));
    });
    await page.route('**/static/logo/**', route => route.fulfill({status: 404}));
    await page.route('**/api/**', async route => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        if (!path.startsWith('/api/')) return route.continue();
        let data: unknown = null;
        if (path.startsWith('/api/project/')) {
            expect(request.headers().authorization).toBe('Bearer project-test-token');
        }
        if (path === '/api/project/pageList') {
            const {current, size, searchValue = ''} = request.postDataJSON();
            const matches = projects.filter(project => project.name.includes(searchValue));
            data = {total: matches.length, records: matches.slice((current - 1) * size, current * size), current, size};
        } else if (path === '/api/project/update') {
            const {id, name} = request.postDataJSON();
            const project = projects.find(project => project.id === id);
            if (project) project.name = name;
            data = !!project;
        } else if (path.startsWith('/api/project/copy/')) {
            const project = projects.find(project => project.id === path.split('/').at(-1));
            if (project) projects.push({id: '100', name: `${project.name} - 副本`});
            data = project ? '100' : '';
        } else if (path.startsWith('/api/project/del/')) {
            const index = projects.findIndex(project => project.id === path.split('/').at(-1));
            if (index >= 0) projects.splice(index, 1);
            data = index >= 0;
        } else if (path === '/api/project/create') {
            data = '101';
        }
        await route.fulfill({json: {code: 200, msg: '', data}});
    });
}

const card = (page: Page, name: string) => page.locator('.project-list-item').filter({
    has: page.getByText(name, {exact: true}),
});

async function operate(page: Page, name: string, operation: string) {
    await card(page, name).locator('.project-cover-menu').click();
    await page.getByText(operation, {exact: true}).last().click();
}

test('工作台打开项目列表，搜索分页和删除后回退到有效页', async ({page}) => {
    await mockProjects(page, Array.from({length: 7}, (_, i) => ({id: String(i + 1), name: `示例项目 ${i + 1}`})));
    await page.goto('/home');
    const menu = page.getByRole('menuitem', {name: '项目列表', exact: true});
    await menu.click();
    await expect(page).toHaveURL('/home/server');
    await expect(menu).toHaveAttribute('aria-current', 'page');

    const search = page.getByPlaceholder('搜索项目并回车');
    await search.fill('  示例项目  ');
    await search.press('Enter');
    await expect(page.locator('.project-list-item')).toHaveCount(6);
    await page.getByRole('button', {name: '下一页'}).click();
    await expect(card(page, '示例项目 7')).toBeVisible();
    await operate(page, '示例项目 7', '删除');
    await page.getByRole('dialog').getByRole('button', {name: '确认'}).click();
    await expect(page.locator('.project-list-item')).toHaveCount(6);
    await expect(card(page, '示例项目 7')).toHaveCount(0);
    await expect(page.locator('.datavisool-pagination-total')).toContainText('第 1-6 条，共 6 条');
});

test('重命名、复制、新建和项目设置沿用现有请求与导航', async ({page}) => {
    await mockProjects(page, [{id: '9', name: '原项目'}]);
    await page.goto('/home/server');

    await operate(page, '原项目', '重命名');
    const input = page.locator('.project-rename-input input');
    await input.fill('改名项目');
    await input.press('Enter');
    await expect(card(page, '改名项目')).toBeVisible();

    await operate(page, '改名项目', '复制');
    await page.getByRole('dialog').getByRole('button', {name: '确认'}).click();
    await expect(card(page, '改名项目 - 副本')).toBeVisible();
    await operate(page, '改名项目 - 副本', '设置');
    await expect(page).toHaveURL('/home/projectSetting/100');
    await expect(page.locator('.setting-title')).toHaveText('项目设置 - 改名项目 - 副本');
    await page.goBack();
    await expect(page).toHaveURL('/home/server');

    await page.getByRole('button', {name: '新建项目', exact: true}).click();
    const dialog = page.locator('.new-project-dialog');
    await dialog.getByPlaceholder('请输入项目名称').fill('插件测试项目');
    const sent = page.waitForRequest(request => new URL(request.url()).pathname === '/api/project/create');
    await dialog.getByRole('button', {name: '创建项目'}).click();
    expect((await sent).postDataJSON()).toEqual({
        name: '插件测试项目', des: '', dataJson: JSON.stringify({canvasManager: {width: 1920, height: 1080}}),
    });
    await expect(page).toHaveURL('/designer?id=101');
});

test('新搜索取消旧请求并展示最新查询的结果', async ({page}) => {
    await mockProjects(page, [{id: '9', name: '目标项目'}, {id: '10', name: '其他项目'}]);
    const searchPath = '/api/project/pageList';
    await page.route(`**${searchPath}`, route => {
        if (route.request().postDataJSON().searchValue !== '旧查询') return route.fallback();
    });
    await page.goto('/home/server');
    await expect(card(page, '其他项目')).toBeVisible();
    const input = page.getByPlaceholder('搜索项目并回车');
    await input.fill('旧查询');
    const sent = page.waitForRequest(request => new URL(request.url()).pathname === searchPath
        && request.postDataJSON().searchValue === '旧查询');
    await input.press('Enter');
    const oldRequest = await sent;
    const failed = page.waitForEvent('requestfailed', {predicate: request => request === oldRequest});
    await input.fill('目标');
    await input.press('Enter');
    expect((await failed).failure()?.errorText).toBe('net::ERR_ABORTED');
    await expect(page.locator('.project-list-item')).toHaveCount(1);
    await expect(card(page, '目标项目')).toBeVisible();
});
