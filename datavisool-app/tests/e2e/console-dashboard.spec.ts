/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {expect, test, type Page, type Route} from '@playwright/test';

type PageData = {total: number; records: Record<string, unknown>[]};
type DashboardData = Record<string, PageData>;

const day = (daysAgo: number) => {
    const value = new Date();
    value.setHours(12, 0, 0, 0);
    value.setDate(value.getDate() - daysAgo);
    return [value.getFullYear(), value.getMonth() + 1, value.getDate(), 0, 0, 0];
};

function sampleData(): DashboardData {
    return {
        '/api/project/pageList': {total: 12, records: [{id: 'p1', name: '示例项目', updateTime: day(7)}]},
        '/api/font/pageList': {total: 2, records: [{id: 'f1', name: '示例字体', updateTime: day(8)}]},
        '/api/video/page': {total: 3, records: [{id: 'v1', name: '示例视频', updateTime: day(9)}]},
        '/api/model/page': {total: 4, records: [{id: 'm1', name: '示例模型', updateTime: day(10)}]},
        '/api/dynamicScript/pageList': {total: 5, records: [{id: 's1', name: '示例脚本', updateTime: day(6)}]},
        '/api/aiModel/pageList': {total: 6, records: [{id: 'a1', name: '示例AI模型', updateTime: day(5)}]},
        '/api/remote/component/pageList': {total: 7, records: [{id: 'c1', componentName: '示例组件', updateTime: day(4)}]},
        '/api/commonDatabase/pageList': {total: 8, records: [{id: 'd1', name: '示例数据库', updateTime: day(3)}]},
        '/api/commonApi/pageList': {total: 9, records: [{id: 'api1', name: '示例接口', updateTime: day(2)}]},
        '/api/release/pageList': {total: 10, records: [
            {id: 'r1', name: '最新发布', description: '发布说明', updateTime: day(0), state: true, expirationDate: 30},
            {id: 'r2', name: '已停用发布', updateTime: day(1), state: false},
            {id: 'r3', name: '状态未知发布', updateTime: day(4)},
            {id: 'r4', name: '较早发布', updateTime: day(5), state: 1},
            {id: 'r5', name: '历史发布', updateTime: day(6), state: 0},
            {id: 'r6', name: '超出展示数量', updateTime: day(7), state: true},
        ]},
    };
}

async function prepareDashboard(page: Page, options: {
    data?: DashboardData;
    role?: string;
    handler?: (route: Route, path: string) => Promise<boolean>;
} = {}) {
    const data = options.data ?? sampleData();
    await page.addInitScript((role) => {
        localStorage.setItem('datavisool-i18n-locale', 'zh-CN');
        localStorage.setItem('DATAVISOOL_USER_INFO', JSON.stringify({
            id: 'test-user', name: '测试用户', username: 'tester', token: 'test-token', roles: [role],
        }));
    }, options.role ?? 'ROLE_SYSTEM_ADMIN');
    await page.route('**/static/logo/**', (route) => route.fulfill({status: 404}));
    await page.route('**/api/**', async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (!path.startsWith('/api/')) return route.continue();
        if (options.handler && await options.handler(route, path)) return;
        const response = data[path] ?? {total: 0, records: []};
        await route.fulfill({json: {code: 200, msg: '成功', data: response}});
    });
    await page.goto('/home/console');
}

const dashboard = (page: Page) => page.locator('[aria-busy]').filter({has: page.getByRole('heading', {name: '控制台', exact: true})});
const loaded = async (page: Page) => expect(dashboard(page)).toHaveAttribute('aria-busy', 'false');

test('展示指标、资源分布、最近更新和发布记录', async ({page}) => {
    await prepareDashboard(page);
    await loaded(page);
    await expect(page.getByRole('button', {name: '通知功能暂未开放'})).toBeDisabled();
    const kpis = page.getByRole('region', {name: '核心指标'});
    for (const [label, value] of [['项目总数', '12'], ['资源总量', '44'], ['已发布版本', '10'], ['近 2 周更新', '15']]) {
        const card = kpis.locator('article').filter({has: page.getByRole('heading', {name: label, exact: true})});
        await expect(card.locator('strong').first()).toHaveText(value);
        await expect(card.getByRole('img', {name: `${label} · 最近 2 周`}).locator('rect')).toHaveCount(14);
    }
    await expect(page.getByLabel('资源总量 44 项')).toBeVisible();
    for (const [name, count] of [['字体', '2'], ['视频', '3'], ['3D 模型', '4'], ['动态脚本', '5'], ['AI模型', '6'], ['服务器组件', '7'], ['数据库', '8'], ['API', '9']]) {
        await expect(page.getByRole('button', {name: `查看 ${name}`, exact: true})).toContainText(count);
    }
    const updates = page.locator('button[data-type]');
    await expect(updates).toHaveCount(5);
    await expect(updates.nth(0)).toContainText('最新发布');
    await expect(updates.nth(1)).toContainText('已停用发布');
    const rows = page.locator('table tbody tr');
    await expect(rows).toHaveCount(5);
    await expect(rows.nth(0)).toContainText('最新发布');
    await expect(rows.nth(0)).toContainText('发布说明');
    await expect(rows.nth(0)).toContainText('30 天');
    await expect(rows.nth(0)).toContainText('已发布');
    await expect(rows.nth(1)).toContainText('已停用');
    await expect(rows.nth(2)).toContainText('—');
    await expect(page.getByText('超出展示数量')).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
});

test('空数据时显示空状态和零值', async ({page}) => {
    const empty = Object.fromEntries(Object.keys(sampleData()).map((key) => [key, {total: 0, records: []}]));
    await prepareDashboard(page, {data: empty});
    await loaded(page);
    await expect(page.getByLabel('资源总量 0 项')).toBeVisible();
    await expect(page.getByText('暂无最近更新')).toBeVisible();
    await expect(page.getByText('暂无发布记录')).toBeVisible();
    await expect(page.locator('button[data-type]')).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
});

test('部分接口失败后保留其他数据，重新加载可恢复', async ({page}) => {
    let failDatabase = true;
    let databaseRequests = 0;
    await prepareDashboard(page, {handler: async (route, path) => {
        if (path !== '/api/commonDatabase/pageList') return false;
        databaseRequests++;
        if (!failDatabase) return false;
        await route.fulfill({json: {code: 500, msg: '测试接口失败', data: null}});
        return true;
    }});
    await loaded(page);
    await expect(dashboard(page).getByRole('alert')).toContainText('部分数据加载失败');
    await expect(page.getByLabel('资源总量 36 项')).toBeVisible();
    failDatabase = false;
    await page.getByRole('button', {name: '重新加载'}).click();
    await expect(dashboard(page).getByRole('alert')).toHaveCount(0);
    await loaded(page);
    await expect(page.getByLabel('资源总量 44 项')).toBeVisible();
    expect(databaseRequests).toBe(2);
});

test('请求未完成时显示加载状态', async ({page}) => {
    let release!: () => void;
    const wait = new Promise<void>((resolve) => { release = resolve; });
    try {
        await prepareDashboard(page, {handler: async (route, path) => {
            if (path !== '/api/project/pageList') return false;
            await wait;
            await route.fulfill({json: {code: 200, msg: '成功', data: sampleData()[path]}});
            return true;
        }});
        await expect(dashboard(page)).toHaveAttribute('aria-busy', 'true');
        await expect(page.getByRole('status').filter({hasText: '正在加载数据'})).toHaveCount(2);
    } finally {
        release();
    }
    await loaded(page);
    await expect(page.getByRole('status').filter({hasText: '正在加载数据'})).toHaveCount(0);
});

test('十个数据接口均携带登录凭据和分页参数', async ({page}) => {
    const requests: Record<string, {body: unknown; authorization?: string}> = {};
    const paths = Object.keys(sampleData());
    await prepareDashboard(page, {handler: async (route, path) => {
        if (paths.includes(path)) requests[path] = {body: route.request().postDataJSON(), authorization: route.request().headers().authorization};
        return false;
    }});
    await loaded(page);
    expect(Object.keys(requests).sort()).toEqual(paths.sort());
    for (const request of Object.values(requests)) {
        expect(request.body).toEqual({current: 1, size: 50});
        expect(request.authorization).toBe('Bearer test-token');
    }
});

test('两周统计包含边界日期并排除更早和无效时间', async ({page}) => {
    const data = Object.fromEntries(Object.keys(sampleData()).map((key) => [key, {total: 0, records: []}])) as DashboardData;
    data['/api/project/pageList'] = {total: 4, records: [
        {id: 'today', name: '今天', updateTime: day(0)},
        {id: 'boundary', name: '两周边界', updateTime: day(13)},
        {id: 'old', name: '更早项目', updateTime: day(14)},
        {id: 'invalid', name: '无效时间', updateTime: 'invalid'},
    ]};
    await prepareDashboard(page, {data});
    await loaded(page);
    const card = page.locator('article').filter({has: page.getByRole('heading', {name: '近 2 周更新', exact: true})});
    await expect(card.locator('strong').first()).toHaveText('2');
    await expect(page.locator('button[data-type="project"]')).toHaveCount(3);
    await expect(page.locator('button[data-type="project"]').first()).toContainText('今天');
});

test('所有资源入口跳转到对应管理页面', async ({page}) => {
    await prepareDashboard(page);
    for (const [label, path] of [
        ['字体', '/home/font'], ['视频', '/home/videoResource'], ['3D 模型', '/home/modelResource'],
        ['动态脚本', '/home/dynamicScript'], ['AI模型', '/home/aiModel'],
        ['服务器组件', '/home/remoteComponent'], ['数据库', '/home/database'], ['API', '/home/api'],
    ]) {
        await loaded(page);
        await page.getByRole('button', {name: `查看 ${label}`, exact: true}).click();
        await expect(page).toHaveURL(new RegExp(`${path}$`));
        await page.goto('/home/console');
    }
});

test('最近更新、查看全部和发布记录操作跳转正确', async ({page}) => {
    await prepareDashboard(page);
    await loaded(page);
    await page.locator('button[data-type="api"]').click();
    await expect(page).toHaveURL(/\/home\/api$/);
    await page.goto('/home/console');
    await loaded(page);
    await page.getByRole('button', {name: '查看全部'}).first().click();
    await expect(page).toHaveURL(/\/home\/server$/);
    await page.goto('/home/console');
    await loaded(page);
    await page.getByRole('button', {name: '查看全部'}).last().click();
    await expect(page).toHaveURL(/\/home\/releaseManagement$/);
    await page.goto('/home/console');
    await loaded(page);
    await page.locator('table tbody tr').first().getByRole('button', {name: '查看', exact: true}).click();
    await expect(page).toHaveURL(/\/home\/releaseManagement$/);
});

test('每种最近更新都跳转到对应管理页面', async ({page}) => {
    const data = Object.fromEntries(Object.keys(sampleData()).map((key) => [key, {total: 0, records: []}])) as DashboardData;
    const cases = [
        ['/api/project/pageList', 'project', '/home/server'],
        ['/api/font/pageList', 'font', '/home/font'],
        ['/api/video/page', 'video', '/home/videoResource'],
        ['/api/model/page', 'model', '/home/modelResource'],
        ['/api/dynamicScript/pageList', 'script', '/home/dynamicScript'],
        ['/api/aiModel/pageList', 'ai-model', '/home/aiModel'],
        ['/api/remote/component/pageList', 'remote-component', '/home/remoteComponent'],
        ['/api/commonDatabase/pageList', 'database', '/home/database'],
        ['/api/commonApi/pageList', 'api', '/home/api'],
        ['/api/release/pageList', 'release', '/home/releaseManagement'],
    ];
    data[cases[0][0]] = {total: 1, records: [{id: 'activity', name: '测试更新', updateTime: day(0)}]};
    await prepareDashboard(page, {data});
    for (let i = 0; i < cases.length; i++) {
        const [api, type, target] = cases[i];
        if (i > 0) {
            data[cases[i - 1][0]] = {total: 0, records: []};
            data[api] = {total: 1, records: [{id: 'activity', name: '测试更新', updateTime: day(0)}]};
            await page.goto('/home/console');
        }
        await loaded(page);
        await page.locator(`button[data-type="${type}"]`).click();
        await expect(page).toHaveURL(new RegExp(`${target}$`));
    }
});

test('无效更新时间应回退显示有效的创建时间', async ({page}) => {
    const data = sampleData();
    data['/api/commonDatabase/pageList'].records = [{id: 'fallback', name: '时间回退示例', updateTime: 'invalid', createTime: day(0)}];
    data['/api/release/pageList'].records.unshift({id: 'fallback-release', name: '发布时间回退示例', updateTime: 'invalid', createTime: day(0)});
    await prepareDashboard(page, {data});
    await loaded(page);
    const [year, month, date] = day(0);
    const expectedTime = `${year}/${month}/${date} 00:00`;
    const activity = page.locator('button[data-type="database"]').filter({hasText: '时间回退示例'});
    await expect(activity).toBeVisible();
    await expect(activity.locator('time')).toHaveText(expectedTime);
    await expect(page.locator('table tbody tr').filter({hasText: '发布时间回退示例'})).toContainText(expectedTime);
});

test('普通用户同样加载 AI 模型并可进入管理页面', async ({page}) => {
    let requestBody: unknown;
    await prepareDashboard(page, {role: 'ROLE_USER', handler: async (route, path) => {
        if (path === '/api/aiModel/pageList') requestBody = route.request().postDataJSON();
        return false;
    }});
    await loaded(page);
    expect(requestBody).toEqual({current: 1, size: 50});
    await expect(page.getByLabel('资源总量 44 项')).toBeVisible();
    await page.getByRole('button', {name: '查看 AI模型'}).click();
    await expect(page).toHaveURL(/\/home\/aiModel$/);
});

test('新建项目可取消，填写后提交画布尺寸并打开设计器', async ({page}) => {
    let submitted: Record<string, unknown> | undefined;
    await prepareDashboard(page, {handler: async (route, path) => {
        if (path !== '/api/project/create') return false;
        submitted = route.request().postDataJSON();
        await route.fulfill({json: {code: 200, msg: '成功', data: 'new-project-id'}});
        return true;
    }});
    await loaded(page);
    await page.getByRole('button', {name: '新建项目', exact: true}).click();
    const dialog = page.locator('.new-project-dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', {name: '取消'}).click();
    await expect(dialog).toBeHidden();
    await page.getByRole('button', {name: '新建项目', exact: true}).click();
    await dialog.getByPlaceholder('请输入项目名称').fill('浏览器测试项目');
    await dialog.getByPlaceholder('项目简要描述...').fill('项目测试说明');
    const dimensions = dialog.locator('.dimension-field input');
    await dimensions.nth(0).fill('1280');
    await dimensions.nth(1).fill('720');
    await dialog.getByRole('button', {name: '创建项目'}).click();
    await expect(page).toHaveURL(/\/designer\?id=new-project-id$/);
    expect(submitted).toEqual({name: '浏览器测试项目', des: '项目测试说明', dataJson: JSON.stringify({canvasManager: {width: 1280, height: 720}})});
});

test('项目创建失败时留在控制台并提示错误', async ({page}) => {
    await prepareDashboard(page, {handler: async (route, path) => {
        if (path !== '/api/project/create') return false;
        await route.fulfill({json: {code: 200, msg: '成功', data: ''}});
        return true;
    }});
    await loaded(page);
    await page.getByRole('button', {name: '新建项目', exact: true}).click();
    await page.locator('.new-project-dialog').getByRole('button', {name: '创建项目'}).click();
    await expect(page.getByText('创建失败', {exact: true})).toBeVisible();
    await expect(page.locator('.new-project-dialog')).toBeVisible();
    await expect(page).toHaveURL(/\/home\/console$/);
});

test('新建项目防止重复提交，并支持键盘打开和取消', async ({page}) => {
    let createCount = 0;
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    await prepareDashboard(page, {handler: async (route, path) => {
        if (path !== '/api/project/create') return false;
        createCount++;
        await pending;
        await route.fulfill({json: {code: 200, msg: '成功', data: 'new-project-id'}});
        return true;
    }});
    await loaded(page);
    const open = page.getByRole('button', {name: '新建项目', exact: true});
    await open.focus();
    await page.keyboard.press('Enter');
    const dialog = page.locator('.new-project-dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', {name: '取消'}).focus();
    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();
    await open.click();
    try {
        await dialog.getByRole('button', {name: '创建项目'}).dblclick();
        await expect.poll(() => createCount).toBe(1);
    } finally {
        release();
    }
    await expect(page).toHaveURL(/\/designer\?id=new-project-id$/);
    expect(createCount).toBe(1);
});

test('窄屏可横向查看发布表格并打开新建项目表单', async ({page}, testInfo) => {
    await page.setViewportSize({width: 390, height: 844});
    await prepareDashboard(page);
    await loaded(page);
    const table = page.locator('table');
    const scrollArea = table.locator('..');
    const sizes = await scrollArea.evaluate((element) => ({client: element.clientWidth, scroll: element.scrollWidth}));
    expect(sizes.scroll).toBeGreaterThan(sizes.client);
    await scrollArea.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
    await expect.poll(() => scrollArea.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    await table.locator('tbody tr').first().getByRole('button', {name: '查看', exact: true}).click();
    await expect(page).toHaveURL(/\/home\/releaseManagement$/);
    await page.goto('/home/console');
    await loaded(page);
    await page.getByRole('button', {name: '新建项目', exact: true}).click();
    const dialog = page.locator('.new-project-dialog');
    await dialog.getByPlaceholder('请输入项目名称').fill('窄屏测试');
    await expect(dialog.getByPlaceholder('请输入项目名称')).toHaveValue('窄屏测试');
    const screenshot = testInfo.outputPath('console-390-dialog.png');
    await page.screenshot({path: screenshot, animations: 'disabled'});
    await testInfo.attach('console-390-dialog', {path: screenshot, contentType: 'image/png'});
    await dialog.getByRole('button', {name: '取消'}).click();
    await expect(dialog).toBeHidden();
});

for (const [width, columns] of [[1920, 4], [1200, 2], [700, 1], [390, 1]] as const) {
    test(`${width}px 布局、关键内容与横向溢出`, async ({page}, testInfo) => {
        await page.setViewportSize({width, height: 900});
        await page.emulateMedia({reducedMotion: 'reduce'});
        await prepareDashboard(page);
        await loaded(page);
        const grid = page.getByRole('region', {name: '核心指标'});
        const cards = grid.locator('article');
        await expect(cards).toHaveCount(4);
        for (const [index, value] of ['12', '44', '10', '15'].entries()) {
            await expect(cards.nth(index).locator('strong').first()).toHaveText(value);
        }
        const topPositions = await cards.evaluateAll((elements) => elements.map((element) => Math.round(element.getBoundingClientRect().top)));
        expect(new Set(topPositions).size).toBe(4 / columns);
        await expect(page.getByRole('heading', {name: '资源概览'})).toBeVisible();
        await expect(page.getByRole('heading', {name: '最近更新'})).toBeVisible();
        await expect(page.getByRole('heading', {name: '最近发布'})).toBeVisible();
        const sizes = await dashboard(page).evaluate((element) => ({client: element.clientWidth, scroll: element.scrollWidth}));
        expect(sizes.scroll).toBeLessThanOrEqual(sizes.client + 1);
        const screenshot = testInfo.outputPath(`console-${width}.png`);
        await page.screenshot({path: screenshot});
        await testInfo.attach(`console-${width}`, {path: screenshot, contentType: 'image/png'});
        await page.locator('.home-route').evaluate((element) => { element.scrollTop = element.scrollHeight; });
        const bottomScreenshot = testInfo.outputPath(`console-${width}-bottom.png`);
        await page.screenshot({path: bottomScreenshot});
        await testInfo.attach(`console-${width}-bottom`, {path: bottomScreenshot, contentType: 'image/png'});
    });
}

test.describe('控制台视觉基线', () => {
    test.use({timezoneId: 'Asia/Shanghai'});

    test('Chromium 1440px 截图与基线一致', async ({page}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await page.emulateMedia({reducedMotion: 'reduce'});
        await page.clock.setFixedTime(new Date('2026-11-06T04:00:00Z'));
        const data = sampleData();
        for (const collection of Object.values(data)) {
            for (const record of collection.records) record.updateTime = [2026, 11, 6, 0, 0, 0];
        }
        await prepareDashboard(page, {data});
        await loaded(page);
        const cards = page.getByRole('region', {name: '核心指标'}).locator('article');
        for (const [index, value] of ['12', '44', '10', '15'].entries()) {
            await expect(cards.nth(index).locator('strong').first()).toHaveText(value);
        }
        await expect(page).toHaveScreenshot('console-1440.png', {animations: 'disabled', maxDiffPixelRatio: 0.001});
    });
});
