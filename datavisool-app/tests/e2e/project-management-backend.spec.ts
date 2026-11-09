/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {execFileSync} from 'node:child_process';
import {expect, test, type Locator, type Page, type TestInfo} from '@playwright/test';

const username = process.env.DATAVISOOL_E2E_USERNAME;
const password = process.env.DATAVISOOL_E2E_PASSWORD;
const backend = process.env.DATAVISOOL_SERVER_DEV_TARGET || '';
const database = process.env.DATAVISOOL_TEST_MYSQL_DATABASE || '';
const mysqlPassword = process.env.DATAVISOOL_TEST_MYSQL_PASSWORD;
const mysqlBinary = process.env.DATAVISOOL_TEST_MYSQL_BINARY || 'mysql';
const enabled = process.env.DATAVISOOL_E2E_ALLOW_WRITES === 'isolated'
    && !!username && !!password && !!mysqlPassword
    && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(backend)
    && /^datavisool_project_test_[a-z0-9_]+$/.test(database);

test.use({trace: 'off', screenshot: 'off', video: 'off'});
test.setTimeout(90_000);
test.skip(!enabled, '需要本机隔离后端、指定格式的独立测试库、测试账号和隔离写入开关');

function sql(query: string): string {
    if (!enabled) throw new Error('只允许使用项目管理隔离测试库');
    return execFileSync(mysqlBinary, [
        '--protocol=tcp', '-h', '127.0.0.1', '-u', 'root', '--batch', '--skip-column-names', database, '-e', query,
    ], {encoding: 'utf8', env: {...process.env, MYSQL_PWD: mysqlPassword}}).trim();
}

function validId(id: string) {
    expect(id).toMatch(/^\d+$/);
    return id;
}

async function login(page: Page) {
    await page.addInitScript(() => localStorage.setItem('datavisool-i18n-locale', 'zh-CN'));
    await page.goto('/login');
    await page.getByLabel('用户名').fill(username!);
    await page.getByLabel('密码').fill(password!);
    await page.getByRole('button', {name: '登录', exact: true}).click();
    await expect(page).toHaveURL(/\/home\/console$/);
    const token = await page.evaluate(() => JSON.parse(localStorage.getItem('DATAVISOOL_USER_INFO') || '{}').token as string);
    expect(token).toBeTruthy();
    return {Authorization: `Bearer ${token}`};
}

async function seed(page: Page, headers: Record<string, string>, name: string, des = '浏览器测试项目') {
    const response = await page.request.post('/api/project/create', {headers, data: {
        name, des, dataJson: JSON.stringify({canvasManager: {width: 1280, height: 720}}),
    }});
    const body = await response.json();
    expect(body.code).toBe(200);
    const id = validId(String(body.data));
    expect(sql(`SELECT COUNT(*) FROM project WHERE id=${id} AND deleted=0`)).toBe('1');
    return id;
}

async function list(page: Page) {
    await page.goto('/home/server');
    await expect(page.getByRole('heading', {name: '项目列表', exact: true})).toBeVisible();
}

function card(page: Page, name: string): Locator {
    return page.locator('.project-list-item').filter({has: page.locator('.project-name-content', {hasText: name})});
}

async function menu(page: Page, name: string, operation: string) {
    const item = card(page, name);
    await expect(item).toHaveCount(1);
    await item.locator('.project-cover-menu').click();
    await page.getByText(operation, {exact: true}).last().click();
}

async function search(page: Page, value: string) {
    const input = page.getByPlaceholder('搜索项目并回车');
    await input.fill(value);
    const response = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/project/pageList');
    await input.press('Enter');
    expect((await (await response).json()).code).toBe(200);
}

async function shot(page: Page, info: TestInfo, name: string) {
    await page.emulateMedia({reducedMotion: 'reduce'});
    const path = info.outputPath(`${name}.png`);
    await page.screenshot({path, animations: 'disabled'});
    await info.attach(name, {path, contentType: 'image/png'});
}

test('空列表、无匹配提示和搜索清除', async ({page}, info) => {
    const headers = await login(page);
    const name = `搜索测试-${Date.now()}`;
    await list(page);
    await search(page, `不存在-${Date.now()}`);
    await expect(page.getByText('暂无项目', {exact: true})).toBeVisible();
    await expect(page.locator('.project-list-pagination')).toHaveCount(0);
    await shot(page, info, 'project-empty');
    await seed(page, headers, name);
    await search(page, '');
    await expect(card(page, name)).toBeVisible();
    await search(page, `  ${name}  `);
    await expect(card(page, name)).toBeVisible();
    await expect(page.locator('.project-list-item')).toHaveCount(1);
});

test('新建对话框默认值、取消重置和输入长度限制', async ({page}, info) => {
    await login(page);
    await list(page);
    await page.getByRole('button', {name: '新建项目', exact: true}).click();
    const dialog = page.locator('.new-project-dialog');
    await expect(dialog.getByPlaceholder('请输入项目名称')).toHaveValue('未命名项目');
    await expect(dialog.getByPlaceholder('项目简要描述...')).toHaveValue('');
    await expect(dialog.locator('.dimension-field input').nth(0)).toHaveValue('1920');
    await expect(dialog.locator('.dimension-field input').nth(1)).toHaveValue('1080');
    await dialog.getByPlaceholder('请输入项目名称').fill('名'.repeat(60));
    await dialog.getByPlaceholder('项目简要描述...').fill('描'.repeat(210));
    await expect(dialog.getByPlaceholder('请输入项目名称')).toHaveValue('名'.repeat(50));
    await expect(dialog.getByPlaceholder('项目简要描述...')).toHaveValue('描'.repeat(200));
    await expect(dialog.locator('.field-count')).toHaveText('50/50');
    await expect(dialog.locator('.textarea-count')).toHaveText('200/200');
    await shot(page, info, 'project-create-form');
    await dialog.getByRole('button', {name: '取消'}).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole('button', {name: '新建项目', exact: true}).click();
    await expect(dialog.getByPlaceholder('请输入项目名称')).toHaveValue('未命名项目');
    await expect(dialog.getByPlaceholder('项目简要描述...')).toHaveValue('');
    await dialog.getByRole('button', {name: '取消'}).click();
});

test('新建项目并核对真实数据库', async ({page}) => {
    await login(page);
    await list(page);
    const name = `新建项目-${Date.now()}`;
    await page.getByRole('button', {name: '新建项目', exact: true}).click();
    const dialog = page.locator('.new-project-dialog');
    await dialog.getByPlaceholder('请输入项目名称').fill(name);
    await dialog.getByPlaceholder('项目简要描述...').fill('真实数据库验证');
    await dialog.locator('.dimension-field input').nth(0).fill('1366');
    await dialog.locator('.dimension-field input').nth(1).fill('768');
    const result = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/project/create');
    await dialog.getByRole('button', {name: '创建项目'}).click();
    const body = await (await result).json();
    expect(body.code).toBe(200);
    const id = validId(String(body.data));
    await expect(page).toHaveURL(new RegExp(`/designer\\?id=${id}$`));
    const data = sql(`SELECT name, des, JSON_UNQUOTE(JSON_EXTRACT(data_json, '$.canvasManager.width')), JSON_UNQUOTE(JSON_EXTRACT(data_json, '$.canvasManager.height')) FROM project WHERE id=${id} AND deleted=0`);
    expect(data).toBe(`${name}\t真实数据库验证\t1366\t768`);
    await list(page);
    await search(page, name);
    await expect(card(page, name)).toContainText('真实数据库验证');
});

test('新建项目拒绝空名称和纯空白名称，修正后可创建', async ({page}) => {
    await login(page);
    await list(page);
    const count = sql('SELECT COUNT(*) FROM project WHERE deleted=0');
    let createRequestCount = 0;
    page.on('request', (request) => {
        if (new URL(request.url()).pathname === '/api/project/create') createRequestCount += 1;
    });
    await page.getByRole('button', {name: '新建项目', exact: true}).click();
    const dialog = page.locator('.new-project-dialog');
    const nameInput = dialog.getByPlaceholder('请输入项目名称');
    for (const invalidName of ['', '   ', '\u00a0']) {
        await nameInput.fill(invalidName);
        await dialog.getByRole('button', {name: '创建项目'}).click();
        await expect(dialog).toBeVisible();
        await expect(dialog.getByRole('alert')).toHaveText('请输入项目名称');
        expect(createRequestCount).toBe(0);
        expect(sql('SELECT COUNT(*) FROM project WHERE deleted=0')).toBe(count);
    }

    const validName = `空名修正后-${Date.now()}`;
    await nameInput.fill(validName);
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    const createResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/project/create');
    await dialog.getByRole('button', {name: '创建项目'}).click();
    const result = await (await createResponse).json();
    expect(result.code).toBe(200);
    expect(createRequestCount).toBe(1);
    const id = validId(String(result.data));
    expect(sql(`SELECT name FROM project WHERE id=${id} AND deleted=0`)).toBe(validName);
    await expect(page).toHaveURL(new RegExp(`/designer\\?id=${id}$`));
    await list(page);
    await search(page, validName);
    await expect(card(page, validName)).toBeVisible();
    expect(Number(sql('SELECT COUNT(*) FROM project WHERE deleted=0'))).toBe(Number(count) + 1);
});

test('新建请求失败时保留对话框和输入', async ({page}) => {
    await login(page);
    await list(page);
    const initialCount = Number(sql('SELECT COUNT(*) FROM project WHERE deleted=0'));
    await page.getByRole('button', {name: '新建项目', exact: true}).click();
    const dialog = page.locator('.new-project-dialog');
    const name = `创建失败-${Date.now()}`;
    const nameInput = dialog.getByPlaceholder('请输入项目名称');
    const descriptionInput = dialog.getByPlaceholder('项目简要描述...');
    await nameInput.fill(name);
    await descriptionInput.fill('首次请求失败后保留的描述');
    await dialog.locator('.dimension-field input').nth(0).fill('1440');
    await dialog.locator('.dimension-field input').nth(1).fill('900');
    await page.route('**/api/project/create', (route) => route.fulfill({
        status: 503, contentType: 'application/json', body: JSON.stringify({code: 503, msg: '模拟创建失败'}),
    }));
    const response = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/project/create');
    await dialog.getByRole('button', {name: '创建项目'}).click();
    expect((await response).status()).toBe(503);
    await expect(page.getByText('创建失败', {exact: true}).last()).toBeVisible();
    await expect(dialog).toBeVisible();
    // 覆盖旧表单提交后延迟 100ms 清空输入的情况。
    await page.waitForTimeout(250);
    await expect(nameInput).toHaveValue(name);
    await expect(descriptionInput).toHaveValue('首次请求失败后保留的描述');
    await expect(dialog.locator('.dimension-field input').nth(0)).toHaveValue('1440');
    await expect(dialog.locator('.dimension-field input').nth(1)).toHaveValue('900');
    await expect(page).toHaveURL(/\/home\/server$/);
    expect(Number(sql('SELECT COUNT(*) FROM project WHERE deleted=0'))).toBe(initialCount);

    await page.unroute('**/api/project/create');
    const retry = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/project/create');
    await dialog.getByRole('button', {name: '创建项目'}).click();
    const result = await (await retry).json();
    expect(result.code).toBe(200);
    const id = validId(String(result.data));
    expect(sql(`SELECT name, des, JSON_UNQUOTE(JSON_EXTRACT(data_json, '$.canvasManager.width')), JSON_UNQUOTE(JSON_EXTRACT(data_json, '$.canvasManager.height')) FROM project WHERE id=${id} AND deleted=0`))
        .toBe(`${name}\t首次请求失败后保留的描述\t1440\t900`);
    expect(Number(sql('SELECT COUNT(*) FROM project WHERE deleted=0'))).toBe(initialCount + 1);
    await expect(page).toHaveURL(`/designer?id=${id}`);
});

test('新建返回空项目编号时保留输入，提交中重复点击只发送一次请求', async ({page}) => {
    await login(page);
    await list(page);
    const initialCount = Number(sql('SELECT COUNT(*) FROM project WHERE deleted=0'));
    await page.getByRole('button', {name: '新建项目', exact: true}).click();
    const dialog = page.locator('.new-project-dialog');
    const name = `空编号重试-${Date.now()}`;
    const nameInput = dialog.getByPlaceholder('请输入项目名称');
    await nameInput.fill(name);
    await dialog.getByPlaceholder('项目简要描述...').fill('空编号后重试');

    let createRequestCount = 0;
    page.on('request', (request) => {
        if (new URL(request.url()).pathname === '/api/project/create') createRequestCount += 1;
    });
    let releaseResponse!: () => void;
    const pendingResponse = new Promise<void>((resolve) => { releaseResponse = resolve; });
    await page.route('**/api/project/create', async (route) => {
        await pendingResponse;
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({code: 200, data: null}),
        });
    });

    const emptyIdResponse = page.waitForResponse((response) =>
        new URL(response.url()).pathname === '/api/project/create');
    const submit = dialog.getByRole('button', {name: '创建项目'});
    try {
        await submit.dblclick();
        await expect.poll(() => createRequestCount).toBe(1);
    } finally {
        releaseResponse();
    }
    expect((await (await emptyIdResponse).json()).data).toBeNull();
    await expect(page.getByText('创建失败', {exact: true}).last()).toBeVisible();
    expect(createRequestCount).toBe(1);
    await expect(dialog).toBeVisible();
    await expect(nameInput).toHaveValue(name);
    await expect(dialog.getByPlaceholder('项目简要描述...')).toHaveValue('空编号后重试');
    await expect(page).toHaveURL('/home/server');
    expect(Number(sql('SELECT COUNT(*) FROM project WHERE deleted=0'))).toBe(initialCount);

    await page.unroute('**/api/project/create');
    const retry = page.waitForResponse((response) =>
        new URL(response.url()).pathname === '/api/project/create');
    await submit.click();
    const result = await (await retry).json();
    const id = validId(String(result.data));
    expect(result.code).toBe(200);
    expect(sql(`SELECT name, des FROM project WHERE id=${id} AND deleted=0`))
        .toBe(`${name}\t空编号后重试`);
    expect(Number(sql('SELECT COUNT(*) FROM project WHERE deleted=0'))).toBe(initialCount + 1);
    await expect(page).toHaveURL(`/designer?id=${id}`);
});

test('重命名并刷新页面、搜索验证持久化', async ({page}) => {
    const headers = await login(page);
    const stamp = Date.now();
    const original = `重命名前-${stamp}`;
    const renamed = `重命名后-${stamp}`;
    const id = await seed(page, headers, original);
    await list(page);
    await search(page, original);
    await menu(page, original, '重命名');
    const input = page.locator('.project-rename-input input');
    await input.fill(renamed);
    const response = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/project/update');
    await input.press('Enter');
    expect((await (await response).json()).data).toBe(true);
    expect(sql(`SELECT name FROM project WHERE id=${id}`)).toBe(renamed);
    await page.reload();
    await search(page, renamed);
    await expect(card(page, renamed)).toBeVisible();
});

test('重命名可通过保存按钮和移出输入框保存', async ({page}) => {
    const headers = await login(page);
    const stamp = Date.now();
    const original = `重命名方式-${stamp}`;
    const first = `按钮保存-${stamp}`;
    const second = `失焦保存-${stamp}`;
    const id = await seed(page, headers, original);
    await list(page);
    await search(page, original);
    await menu(page, original, '重命名');
    await page.locator('.project-rename-input input').fill(first);
    let response = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/project/update');
    await page.locator('.project-item-rename-save').click();
    expect((await (await response).json()).data).toBe(true);
    expect(sql(`SELECT name FROM project WHERE id=${id}`)).toBe(first);
    await menu(page, first, '重命名');
    const input = page.locator('.project-rename-input input');
    await input.fill(second);
    response = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/project/update');
    await input.blur();
    expect((await (await response).json()).data).toBe(true);
    expect(sql(`SELECT name FROM project WHERE id=${id}`)).toBe(second);
});

test('重命名拒绝空名称和纯空白名称，修正后可保存', async ({page}) => {
    const headers = await login(page);
    const name = `空名称重命名-${Date.now()}`;
    const id = await seed(page, headers, name);
    await list(page);
    await search(page, name);
    let updateRequestCount = 0;
    page.on('request', (request) => {
        if (new URL(request.url()).pathname === '/api/project/update') updateRequestCount += 1;
    });
    for (const invalidName of ['', '   ', '\u00a0']) {
        await menu(page, name, '重命名');
        const input = page.locator('.project-rename-input input');
        await input.fill(invalidName);
        await input.press('Enter');
        await expect(card(page, name)).toBeVisible();
        await expect(page.getByText('请输入项目名称', {exact: true}).last()).toBeVisible();
        expect(sql(`SELECT name FROM project WHERE id=${id}`)).toBe(name);
        expect(updateRequestCount).toBe(0);
    }

    const renamed = `空名修正后-${Date.now()}`;
    await menu(page, name, '重命名');
    const input = page.locator('.project-rename-input input');
    await input.fill(renamed);
    const updateResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/project/update');
    await input.press('Enter');
    expect((await (await updateResponse).json()).data).toBe(true);
    expect(updateRequestCount).toBe(1);
    expect(sql(`SELECT name FROM project WHERE id=${id}`)).toBe(renamed);
    await expect(card(page, renamed)).toBeVisible();

    await menu(page, renamed, '重命名');
    const emptyInput = page.locator('.project-rename-input input');
    await emptyInput.fill('');
    await emptyInput.blur();
    await expect(page.getByText('请输入项目名称', {exact: true}).last()).toBeVisible();
    await expect(card(page, renamed)).toBeVisible();
    expect(updateRequestCount).toBe(1);
    expect(sql(`SELECT name FROM project WHERE id=${id}`)).toBe(renamed);
});

test('项目接口拒绝空白名称并允许省略名称的部分更新', async ({page}) => {
    const headers = await login(page);
    const initialCount = Number(sql('SELECT COUNT(*) FROM project WHERE deleted=0'));
    const invalidNames = ['', '   ', '\u00a0', ' \u00a0 '];

    for (const invalidName of invalidNames) {
        const response = await page.request.post('/api/project/create', {headers, data: {
            name: invalidName,
            des: '非法名称接口验证',
            dataJson: JSON.stringify({canvasManager: {width: 1280, height: 720}}),
        }});
        const result = await response.json();
        expect(result.code).toBe(10001);
        expect(result.msg).toBe('项目名称不能为空');
        expect(Number(sql('SELECT COUNT(*) FROM project WHERE deleted=0'))).toBe(initialCount);
    }

    const originalName = `接口重命名保护-${Date.now()}`;
    const id = await seed(page, headers, originalName);
    const countWithProject = initialCount + 1;
    for (const invalidName of invalidNames) {
        const response = await page.request.post('/api/project/update', {headers, data: {
            id,
            name: invalidName,
        }});
        const result = await response.json();
        expect(result.code).toBe(10001);
        expect(result.msg).toBe('项目名称不能为空');
        expect(Number(sql('SELECT COUNT(*) FROM project WHERE deleted=0'))).toBe(countWithProject);
        expect(sql(`SELECT name FROM project WHERE id=${id}`)).toBe(originalName);
    }

    const description = `部分更新-${Date.now()}`;
    const partialUpdate = await page.request.post('/api/project/update', {headers, data: {
        id,
        des: description,
    }});
    const partialUpdateResult = await partialUpdate.json();
    expect(partialUpdateResult.code).toBe(200);
    expect(partialUpdateResult.data).toBe(true);
    expect(sql(`SELECT name, des FROM project WHERE id=${id}`)).toBe(`${originalName}\t${description}`);
    expect(Number(sql('SELECT COUNT(*) FROM project WHERE deleted=0'))).toBe(countWithProject);
});

test('重命名遵守新建项目的 50 字名称上限，接口也拒绝超限', async ({page}) => {
    const headers = await login(page);
    const name = `重命名长度-${Date.now()}`;
    const id = await seed(page, headers, name);
    await list(page);
    await search(page, name);
    await menu(page, name, '重命名');
    const input = page.locator('.project-rename-input input');
    await input.fill('名'.repeat(60));
    await expect(input).toHaveValue('名'.repeat(50));
    const response = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/project/update');
    await input.press('Enter');
    expect((await (await response).json()).data).toBe(true);
    expect(sql(`SELECT CHAR_LENGTH(name), name FROM project WHERE id=${id}`)).toBe(`50\t${'名'.repeat(50)}`);

    for (const excessiveName of ['名'.repeat(51), '名'.repeat(60)]) {
        const rejected = await page.request.post('/api/project/update', {headers, data: {
            id,
            name: excessiveName,
        }});
        expect((await rejected.json()).code).toBe(10001);
        expect(sql(`SELECT CHAR_LENGTH(name), name FROM project WHERE id=${id}`)).toBe(`50\t${'名'.repeat(50)}`);
    }
});

test('接口按与输入框相同的长度计数，并允许旧超长项目修改描述或缩短名称', async ({page}) => {
    const headers = await login(page);
    const boundaryName = '中A' + '😀'.repeat(24);
    const id = await seed(page, headers, boundaryName);
    const count = sql('SELECT COUNT(*) FROM project WHERE deleted=0');
    const rejected = await page.request.post('/api/project/create', {headers, data: {name: boundaryName + 'a'}});
    expect((await rejected.json()).code).toBe(10001);
    expect(sql('SELECT COUNT(*) FROM project WHERE deleted=0')).toBe(count);

    const legacyName = '旧'.repeat(60);
    sql(`UPDATE project SET name=REPEAT('旧', 60) WHERE id=${id}`);
    const edited = await page.request.post('/api/project/update', {headers, data: {id, des: '修改描述'}});
    expect((await edited.json()).data).toBe(true);
    expect(sql(`SELECT name, des FROM project WHERE id=${id}`)).toBe(`${legacyName}\t修改描述`);

    await list(page);
    await search(page, legacyName);
    await menu(page, legacyName, '重命名');
    const input = page.locator('.project-rename-input input');
    await expect(input).toHaveValue(legacyName);
    await input.fill(boundaryName);
    const update = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/project/update');
    await input.press('Enter');
    expect((await (await update).json()).data).toBe(true);
    await expect(card(page, boundaryName)).toBeVisible();
    expect(sql(`SELECT name FROM project WHERE id=${id}`)).toBe(boundaryName);
});

test('重命名接口失败时页面保留数据库中的原名称', async ({page}) => {
    const headers = await login(page);
    const name = `重命名失败-${Date.now()}`;
    const id = await seed(page, headers, name);
    await list(page);
    await search(page, name);
    await menu(page, name, '重命名');
    const input = page.locator('.project-rename-input input');
    await input.fill(`合法长度但接口失败-${Date.now()}`);
    await page.route('**/api/project/update', (route) => route.fulfill({
        status: 503, contentType: 'application/json', body: JSON.stringify({code: 503, msg: '模拟保存失败'}),
    }));
    const response = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/project/update');
    await input.press('Enter');
    expect((await response).status()).toBe(503);
    await expect(card(page, name)).toBeVisible();
    expect(sql(`SELECT name FROM project WHERE id=${id}`)).toBe(name);
});

test('新建时宽高不能小于 300 像素', async ({page}) => {
    await login(page);
    await list(page);
    const name = `画布最小尺寸-${Date.now()}`;
    await page.getByRole('button', {name: '新建项目', exact: true}).click();
    const dialog = page.locator('.new-project-dialog');
    await dialog.getByPlaceholder('请输入项目名称').fill(name);
    await dialog.locator('.dimension-field input').nth(0).fill('100');
    await dialog.locator('.dimension-field input').nth(1).fill('200');
    const response = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/project/create');
    await dialog.getByRole('button', {name: '创建项目'}).click();
    const body = await (await response).json();
    expect(body.code).toBe(200);
    const id = validId(String(body.data));
    const dimensions = sql(`SELECT JSON_UNQUOTE(JSON_EXTRACT(data_json, '$.canvasManager.width')), JSON_UNQUOTE(JSON_EXTRACT(data_json, '$.canvasManager.height')) FROM project WHERE id=${id}`);
    const [width, height] = dimensions.split('\t').map(Number);
    expect(width).toBeGreaterThanOrEqual(300);
    expect(height).toBeGreaterThanOrEqual(300);
});

test('复制与删除支持取消和确认，数据库结果一致', async ({page}) => {
    const headers = await login(page);
    const name = `复制删除-${Date.now()}`;
    const id = await seed(page, headers, name);
    await list(page);
    await search(page, name);
    await menu(page, name, '复制');
    let dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('确认克隆项目吗？');
    await dialog.getByRole('button', {name: '取消'}).click();
    await expect(page.locator('.project-list-item')).toHaveCount(1);
    await menu(page, name, '复制');
    dialog = page.getByRole('dialog');
    const copied = page.waitForResponse((r) => new URL(r.url()).pathname === `/api/project/copy/${id}`);
    await dialog.getByRole('button', {name: '确认'}).click();
    const copyBody = await (await copied).json();
    expect(copyBody.code).toBe(200);
    const copyId = validId(String(copyBody.data));
    await expect(page.locator('.project-list-item')).toHaveCount(2);
    expect(sql(`SELECT name, des FROM project WHERE id=${copyId} AND deleted=0`)).toBe(`${name} - 副本\t浏览器测试项目`);
    expect(sql(`SELECT (SELECT data_json FROM project WHERE id=${id}) = data_json FROM project WHERE id=${copyId}`)).toBe('1');
    await menu(page, `${name} - 副本`, '删除');
    dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('确定要删除该项目吗？');
    await dialog.getByRole('button', {name: '取消'}).click();
    expect(sql(`SELECT deleted FROM project WHERE id=${copyId}`)).toBe('0');
    await menu(page, `${name} - 副本`, '删除');
    dialog = page.getByRole('dialog');
    const removed = page.waitForResponse((r) => new URL(r.url()).pathname === `/api/project/del/${copyId}`);
    await dialog.getByRole('button', {name: '确认'}).click();
    expect((await (await removed).json()).data).toBe(true);
    await expect(page.locator('.project-list-item')).toHaveCount(1);
    expect(sql(`SELECT deleted FROM project WHERE id=${copyId}`)).toBe('1');
    expect(sql(`SELECT deleted FROM project WHERE id=${id}`)).toBe('0');
});

test('搜索结果分页及切换', async ({page}, info) => {
    const headers = await login(page);
    const prefix = `分页测试-${Date.now()}`;
    for (let i = 1; i <= 7; i++) await seed(page, headers, `${prefix}-${i}`);
    await page.setViewportSize({width: 1440, height: 900});
    await list(page);
    await search(page, prefix);
    await expect(page.locator('.project-list-item')).toHaveCount(6);
    await expect(page.locator('.datavisool-pagination-total')).toContainText('共 7 条');
    await shot(page, info, 'project-list-1440');
    await page.locator('.datavisool-pagination-item').filter({hasText: /^2$/}).click();
    await expect(page.locator('.project-list-item')).toHaveCount(1);
    await expect(page.locator('.datavisool-pagination-total')).toContainText('第 7-7 条');
    await page.locator('.datavisool-pagination-item').filter({hasText: /^1$/}).click();
    await expect(page.locator('.project-list-item')).toHaveCount(6);
});

test('删除最后一页的最后一个项目后仍可看到其他项目', async ({page}) => {
    const headers = await login(page);
    const prefix = `删除末页-${Date.now()}`;
    const projects: Array<{name: string; id: string}> = [];
    for (let i = 1; i <= 7; i++) {
        const name = `${prefix}-${i}`;
        projects.push({name, id: await seed(page, headers, name)});
    }
    await list(page);
    await search(page, prefix);
    await page.locator('.datavisool-pagination-item').filter({hasText: /^2$/}).click();
    await expect(page.locator('.project-list-item')).toHaveCount(1);
    await page.locator('.project-list-item .project-cover-menu').click();
    await page.getByText('删除', {exact: true}).last().click();
    const removed = page.waitForResponse((r) => new URL(r.url()).pathname.startsWith('/api/project/del/'));
    await page.getByRole('dialog').getByRole('button', {name: '确认'}).click();
    const removedResponse = await removed;
    const removedResult = await removedResponse.json();
    expect(removedResult.data).toBe(true);
    const removedProjectId = validId(new URL(removedResponse.url()).pathname.split('/').pop()!);
    await expect(page.locator('.project-list-item')).toHaveCount(6);
    await expect(page.locator('.datavisool-pagination-total')).toHaveText('第 1-6 条，共 6 条');
    await expect(page.locator('.datavisool-pagination-item').filter({hasText: /^1$/})).toHaveClass(/active/);
    await expect(page.getByPlaceholder('搜索项目并回车')).toHaveValue(prefix);
    expect(sql(`SELECT deleted FROM project WHERE id=${removedProjectId}`)).toBe('1');

    const remainingProjects = projects.filter(({id}) => id !== removedProjectId);
    for (const [index, project] of remainingProjects.entries()) {
        const countBeforeDelete = remainingProjects.length - index;
        await expect(page.locator('.datavisool-pagination-total'))
            .toHaveText(`第 1-${countBeforeDelete} 条，共 ${countBeforeDelete} 条`);
        await menu(page, project.name, '删除');
        const deletion = page.waitForResponse((response) =>
            new URL(response.url()).pathname === `/api/project/del/${project.id}`);
        await page.getByRole('dialog').getByRole('button', {name: '确认'}).click();
        expect((await (await deletion).json()).data).toBe(true);
        expect(sql(`SELECT deleted FROM project WHERE id=${project.id}`)).toBe('1');
    }

    await expect(page.getByText('暂无项目', {exact: true})).toBeVisible();
    await expect(page.locator('.project-list-pagination')).toHaveCount(0);
    await expect(page.getByPlaceholder('搜索项目并回车')).toHaveValue(prefix);
    expect(sql(`SELECT COUNT(*) FROM project WHERE id IN (${projects.map(({id}) => id).join(',')}) AND deleted=0`)).toBe('0');
    expect(sql(`SELECT COUNT(*) FROM project WHERE id IN (${projects.map(({id}) => id).join(',')}) AND deleted=1`)).toBe('7');
});

test('编辑、预览、设置和双击入口指向当前项目', async ({page, context}) => {
    const headers = await login(page);
    const name = `入口测试-${Date.now()}`;
    const id = await seed(page, headers, name);
    await list(page);
    await search(page, name);
    await menu(page, name, '设置');
    await expect(page).toHaveURL(new RegExp(`/home/projectSetting/${id}$`));
    await list(page);
    await search(page, name);
    const popupPromise = context.waitForEvent('page');
    await menu(page, name, '预览');
    const popup = await popupPromise;
    await popup.waitForURL(new RegExp(`/preview\\?id=${id}$`));
    await popup.close();
    await menu(page, name, '编辑');
    await expect(page).toHaveURL(new RegExp(`/designer\\?id=${id}$`));
    await list(page);
    await search(page, name);
    await card(page, name).locator('.project-item-content').dblclick();
    await expect(page).toHaveURL(new RegExp(`/designer\\?id=${id}$`));
});

for (const width of [1440, 1024, 700, 390]) {
    test(`${width}px 页面、卡片和新建窗口布局`, async ({page}, info) => {
        const headers = await login(page);
        const name = `布局测试-${width}-${Date.now()}`;
        await seed(page, headers, name);
        await page.setViewportSize({width, height: 900});
        await list(page);
        await search(page, name);
        await expect(card(page, name)).toBeVisible();
        await expect(page.getByPlaceholder('搜索项目并回车')).toBeVisible();
        await expect(page.getByRole('button', {name: '新建项目', exact: true})).toBeVisible();
        const viewport = await page.evaluate(() => ({width: innerWidth, scroll: document.documentElement.scrollWidth}));
        expect(viewport.scroll).toBeLessThanOrEqual(viewport.width + 1);
        await shot(page, info, `project-list-${width}`);
        await page.getByRole('button', {name: '新建项目', exact: true}).click();
        const dialog = page.locator('.new-project-dialog');
        await expect(dialog.getByPlaceholder('请输入项目名称')).toBeVisible();
        await expect(dialog.getByRole('button', {name: '创建项目'})).toBeVisible();
        const box = await dialog.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
        if (width === 390) await shot(page, info, 'project-create-390');
    });
}
