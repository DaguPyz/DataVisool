/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {expect, test, type Page, type TestInfo} from '@playwright/test';

interface Target {
    label: string;
    type: 'MySQL' | 'PostgresSQL' | 'Oracle' | 'SQLServer';
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    url: string;
    probeSql: string;
    probeValue: string;
    probeCall?: string;
    longUser?: string;
    unavailable?: string;
}

const env = process.env;
const guarded = env.DATAVISOOL_E2E_ALLOW_WRITES === 'isolated'
    && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(env.DATAVISOOL_SERVER_DEV_TARGET || '')
    && /^datavisool_datasource_test_[a-z0-9_]+$/.test(env.DATAVISOOL_TEST_MYSQL_DATABASE || '')
    && !!env.DATAVISOOL_E2E_USERNAME && !!env.DATAVISOOL_E2E_PASSWORD && !!env.DATAVISOOL_TEST_MYSQL_PASSWORD;
const targets: Target[] = guarded && env.DATAVISOOL_TEST_TARGETS
    ? JSON.parse(readFileSync(env.DATAVISOOL_TEST_TARGETS, 'utf8')) : [];
const mysql = targets.find(target => target.type === 'MySQL' && !target.unavailable);
const api = '/api/commonDatabase/';
const uniqueName = (prefix: string) => prefix + '-' + randomUUID().slice(0, 8);
const card = (page: Page, name: string) => page.locator('article').filter({has: page.getByRole('heading', {name, exact: true})});
const panel = (page: Page) => page.locator('.datasource-panel');
const button = (page: Page, name: string) => page.getByRole('button', {name, exact: true});

function stored(id: string) {
    expect(guarded).toBe(true);
    expect(id).toMatch(/^\d+$/);
    const query = "SELECT JSON_OBJECT('name', name, 'des', des, 'url', url, 'scripts', allow_sql_script + 0, 'deleted', deleted + 0) FROM common_database WHERE id=" + id;
    const output = execFileSync(env.DATAVISOOL_TEST_MYSQL_BINARY || 'mysql', [
        '--default-character-set=utf8mb4', '--protocol=tcp', '-h', '127.0.0.1', '-P', env.DATAVISOOL_TEST_MYSQL_CLI_PORT || '3306',
        '-u', env.DATAVISOOL_TEST_MYSQL_USER || 'root', '--batch', '--raw', '--skip-column-names',
        env.DATAVISOOL_TEST_MYSQL_DATABASE!, '-e', query,
    ], {encoding: 'utf8', env: {...env, MYSQL_PWD: env.DATAVISOOL_TEST_MYSQL_PASSWORD}});
    return JSON.parse(output.trim());
}

test.use({trace: 'off', screenshot: 'off', video: 'off', actionTimeout: 12_000, viewport: {width: 1440, height: 900}});
test.setTimeout(90_000);
test.skip(!guarded || !targets.length, '需要本机独立元数据库、测试账号、隔离写入开关和数据库目标配置');

test.beforeEach(async ({page, baseURL}) => {
    expect(baseURL).toMatch(/^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
    await page.addInitScript(() => localStorage.setItem('datavisool-i18n-locale', 'zh-CN'));
    await page.goto('/login');
    await page.getByLabel('用户名').fill(env.DATAVISOOL_E2E_USERNAME!);
    await page.getByLabel('密码').fill(env.DATAVISOOL_E2E_PASSWORD!);
    await button(page, '登录').click();
    await expect(page).toHaveURL(/\/home\/console$/);
    await page.getByText('数据源管理', {exact: true}).first().click();
    await page.getByText('数据库管理', {exact: true}).first().click();
    await expect(page).toHaveURL(/\/home\/database$/);
    await expect(page.getByRole('heading', {name: '数据源管理', exact: true})).toBeVisible();
});

async function action(page: Page, endpoint: string, click: () => Promise<unknown>) {
    const [response] = await Promise.all([
        page.waitForResponse(r => new URL(r.url()).pathname === api + endpoint, {timeout: 40_000}),
        click(),
    ]);
    return {body: await response.json(), request: response.request()};
}

async function search(page: Page, term: string) {
    const field = page.getByPlaceholder('搜索数据源名称/类型/描述');
    await field.fill(term);
    const [response] = await Promise.all([
        page.waitForResponse(r => new URL(r.url()).pathname === api + 'pageList'
            && r.request().postDataJSON()?.searchValue === term.trim()),
        field.press('Enter'),
    ]);
    const body = await response.json();
    expect(body.code).toBe(200);
    return body.data;
}

async function save(page: Page, endpoint: 'add' | 'update') {
    const {body, request} = await action(page, endpoint, () => button(page, '提交').click());
    expect(body.code, body.msg).toBe(200);
    expect(Object.keys(request.postDataJSON()).sort()).toEqual(['encryptedAesKey', 'encryptedData', 'iv']);
    await expect(panel(page)).toBeHidden();
    return body.data;
}

async function fillNew(page: Page, target: Target, name: string, url = '', description = '', scripts = false) {
    expect(['127.0.0.1', 'localhost']).toContain(target.host);
    await button(page, '新建数据源').first().click();
    const form = panel(page);
    await form.getByRole('combobox').click();
    await page.getByRole('option', {name: target.type, exact: true}).click();
    await form.getByPlaceholder('请输入数据库显示名称').fill(name);
    await form.getByPlaceholder('请输入 IP / 域名').fill(target.host);
    await form.getByPlaceholder('请输入端口').fill(String(target.port));
    await form.getByPlaceholder('请输入用户名').fill(target.user);
    await form.getByPlaceholder('请输入密码').fill(target.password);
    await form.getByPlaceholder('请输入数据库名称').fill(target.database);
    if (url) await form.getByPlaceholder('请输入 URL', {exact: false}).fill(url);
    if (description) await form.getByPlaceholder('请输入描述信息...').fill(description);
    if (scripts) await form.getByRole('switch').click();
}

async function create(page: Page, target: Target, name: string, url = '', description = '', scripts = false) {
    await fillNew(page, target, name, url, description, scripts);
    const id = String(await save(page, 'add'));
    expect(id).toMatch(/^\d+$/);
    return id;
}

async function edit(page: Page, name: string) {
    await search(page, name);
    const result = await action(page, 'get', () => card(page, name).getByRole('button', {name: '编辑'}).click());
    expect(result.body.code).toBe(200);
    expect(Object.keys(result.body.data).sort()).toEqual(['encryptedAesKey', 'encryptedData', 'iv']);
    await expect(panel(page).getByPlaceholder('请输入数据库显示名称')).toHaveValue(name);
}

async function connect(page: Page, name: string, id: string, info?: TestInfo) {
    const {body} = await action(page, 'test/' + id, () => card(page, name).getByRole('button', {name: '测试'}).click());
    if (body.code !== 200 && info) {
        await expect(page.getByText(body.msg, {exact: true}).first()).toBeVisible();
        await shot(page, info, '连接失败');
    }
    return body;
}

async function execute(page: Page, id: string, sql: string) {
    const token = await page.evaluate(() => JSON.parse(localStorage.getItem('DATAVISOOL_USER_INFO')!).token);
    const response = await page.request.post('/api/db/executor/execute', {
        headers: {Authorization: 'Bearer ' + token},
        data: {id, statement: Buffer.from(sql, 'utf8').toString('base64')},
    });
    return response.json();
}

async function verifyProbe(page: Page, id: string, target: Target) {
    expect(target.probeSql).toMatch(/^SELECT\s/i);
    const body = await execute(page, id, target.probeSql);
    expect(body.code, body.msg).toBe(200);
    expect(String(Object.values(body.data[0])[0])).toBe(String(target.probeValue));
}

async function shot(page: Page, info: TestInfo, name: string) {
    const file = info.outputPath(name + '.png');
    await page.screenshot({path: file, animations: 'disabled', mask: [page.locator('input[placeholder="请输入密码"]:not(:placeholder-shown)')]});
    await info.attach(name, {path: file, contentType: 'image/png'});
}

for (const target of targets) {
    for (const mode of ['自动拼接', '明确填写'] as const) {
        test(target.label + ' · ' + mode + ' URL，测试连接并读回标记', async ({page}, info) => {
            test.skip(!!target.unavailable, target.unavailable);
            const name = uniqueName(target.label + '-' + mode);
            const id = await create(page, target, name, mode === '明确填写' ? target.url : '');
            await search(page, name);
            const body = await connect(page, name, id, info);
            expect(body.code, body.msg).toBe(200);
            expect(body.data).toBe(true);
            await expect(page.getByText('连接正常', {exact: true}).first()).toBeVisible();
            await verifyProbe(page, id, target);
        });
    }
}

test('编辑密码后真实连接失败，改回并刷新后恢复', async ({page}, info) => {
    test.skip(!mysql, '需可用 MySQL 目标');
    const target = mysql!;
    const name = uniqueName('编辑凭据');
    const id = await create(page, target, name, target.url);
    await search(page, name);
    expect((await connect(page, name, id)).data).toBe(true);
    await edit(page, name);
    const field = panel(page).getByPlaceholder('请输入密码');
    expect(await field.inputValue() === target.password).toBe(true);
    await field.fill('invalid-' + randomUUID());
    expect(await save(page, 'update')).toBe(true);
    await search(page, name);
    const failed = await connect(page, name, id, info);
    expect(failed.code).not.toBe(200);
    await expect(page.getByText('正在测试数据库连接，请稍后...', {exact: true})).toHaveCount(0);
    await edit(page, name);
    const newName = uniqueName('修正凭据');
    await panel(page).getByPlaceholder('请输入数据库显示名称').fill(newName);
    await field.fill(target.password);
    await save(page, 'update');
    await page.reload();
    await search(page, newName);
    expect((await connect(page, newName, id)).data).toBe(true);
    await verifyProbe(page, id, target);
});

test('刷新后列表和编辑显示已保存的描述；只改名称保留描述', async ({page}) => {
    test.skip(!mysql, '需可用 MySQL 目标');
    const name = uniqueName('描述回显');
    const des = '数据核对用的自定义说明';
    const id = await create(page, mysql!, name, mysql!.url, des, true);
    expect(stored(id)).toMatchObject({name, des, url: mysql!.url, scripts: 1, deleted: 0});
    await page.reload();
    await search(page, name);
    expect.soft(await card(page, name).locator('p').innerText(), '列表描述').toBe(des);
    await expect(card(page, name).getByText('SQL脚本')).toBeVisible();
    await edit(page, name);
    const form = panel(page);
    expect.soft(await form.getByPlaceholder('请输入描述信息...').inputValue(), '编辑回显描述').toBe(des);
    await expect(form.getByRole('switch')).toBeChecked();
    await expect(form.getByPlaceholder('请输入 URL', {exact: false})).toHaveValue(mysql!.url);
    await form.getByRole('switch').click();
    const renamed = name + '-已改';
    await form.getByPlaceholder('请输入数据库显示名称').fill(renamed);
    await save(page, 'update');
    expect.soft(stored(id), '只改名称及开关后核对原描述').toMatchObject({name: renamed, scripts: 0, des});
    await search(page, renamed);
    await expect(card(page, renamed).getByText('SQL脚本')).toHaveCount(0);
    await edit(page, renamed);
    expect.soft(await form.getByPlaceholder('请输入描述信息...').inputValue(), '改名后描述').toBe(des);
});

test('复制取消与确认，副本保留 URL、凭据、描述和脚本开关', async ({page}, info) => {
    test.skip(!mysql, '需可用 MySQL 目标');
    const target = mysql!;
    const name = uniqueName('连接副本');
    const des = '专用连接及说明';
    const id = await create(page, target, name, target.url, des, true);
    await search(page, name);
    const copy = card(page, name).getByRole('button', {name: '复制'});
    await copy.click();
    const dialogs = page.getByRole('dialog', {name: '复制确认'});
    await expect(dialogs.last()).toBeVisible();
    await shot(page, info, '复制确认');
    expect.soft(await dialogs.count(), '每次复制只展示一个确认窗口').toBe(1);
    await dialogs.last().getByRole('button', {name: '取消'}).click();
    expect((await search(page, name)).total).toBe(1);
    await copy.click();
    const {body} = await action(page, 'copy/' + id, () => dialogs.last().getByRole('button', {name: '确定'}).click());
    expect(body.data, body.msg).toBe(true);
    const records = (await search(page, name)).records;
    const newName = name + '（副本）';
    const clone = records.find((r: {name: string}) => r.name === newName);
    expect(clone).toBeTruthy();
    expect(String(clone.id)).not.toBe(id);
    expect.soft(stored(String(clone.id)), '数据库中的副本配置').toMatchObject({name: newName, des, url: target.url, scripts: 1});
    await expect(card(page, newName).getByText('SQL脚本')).toBeVisible();
    await edit(page, newName);
    const form = panel(page);
    expect(await form.getByPlaceholder('请输入密码').inputValue() === target.password).toBe(true);
    expect.soft(await form.getByPlaceholder('请输入 URL', {exact: false}).inputValue(), '副本 URL').toBe(target.url);
    expect.soft(await form.getByPlaceholder('请输入描述信息...').inputValue(), '副本描述').toBe(des);
    await button(page, '取消').click();
    expect((await connect(page, newName, String(clone.id))).data).toBe(true);
    await verifyProbe(page, String(clone.id), target);
});

test('打开 SQL 脚本开关后调用只读存储过程', async ({page}) => {
    test.skip(!mysql?.probeCall, '需已创建只读测试存储过程的 MySQL 目标');
    const name = uniqueName('脚本开关');
    const id = await create(page, mysql!, name, mysql!.url);
    const sql = mysql!.probeCall!;
    expect((await execute(page, id, sql)).code, '关闭开关时拒绝非 SELECT').not.toBe(200);
    await edit(page, name);
    await panel(page).getByRole('switch').click();
    await save(page, 'update');
    const body = await execute(page, id, sql);
    expect(body.code, body.msg).toBe(200);
});

test('多尺寸列表和新建窗口的可见范围、操作位置与截图', async ({page}, info) => {
    test.setTimeout(150_000);
    const prefix = uniqueName('布局');
    for (const target of targets.filter(t => !t.unavailable)) {
        await create(page, target, target.label + ' · ' + prefix, target.url, '', target === mysql);
    }
    const active = targets.filter(t => !t.unavailable);
    await search(page, prefix);
    await expect(page.locator('article')).toHaveCount(active.length);
    await expect(page.getByText('操作成功', {exact: true})).toHaveCount(0);
    const grid = page.locator('article').first().locator('..');
    const measurements = [];
    for (const [width, height] of [[1920, 1080], [1440, 900], [1024, 768], [700, 900], [390, 844]]) {
        await page.setViewportSize({width, height});
        await page.emulateMedia({reducedMotion: 'reduce'});
        await page.evaluate(() => document.fonts.ready);
        await expect(grid.locator('img').first()).toBeVisible();
        const dimensions = await grid.evaluate(el => ({
            columns: getComputedStyle(el).gridTemplateColumns.split(' ').length,
            viewport: window.innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            logosLoaded: Array.from(el.querySelectorAll('img')).every(image => image.naturalWidth > 0),
        }));
        await shot(page, info, '列表-' + width);
        expect.soft(dimensions.documentWidth, width + 'px 列表横向溢出').toBeLessThanOrEqual(width);
        expect.soft(dimensions.logosLoaded, width + 'px 图标载入').toBe(true);
        const createButton = button(page, '新建数据源').first();
        const box = (await createButton.boundingBox())!;
        expect.soft(box.x + box.width, width + 'px 新建按钮右缘').toBeLessThanOrEqual(width + 1);
        // Use the normal button; clipping on a narrow layout should be recorded separately.
        await createButton.click();
        const dialog = panel(page);
        await expect(dialog).toHaveClass(/visible/);
        const field = dialog.getByPlaceholder('请输入数据库显示名称');
        await field.click();
        const bounds = (await dialog.boundingBox())!;
        const submit = (await button(page, '提交').boundingBox())!;
        measurements.push({width, height, ...dimensions, dialog: bounds, submit});
        expect.soft(bounds.x + bounds.width, width + 'px 窗口右缘').toBeLessThanOrEqual(width + 1);
        expect.soft(submit.x + submit.width, width + 'px 提交按钮右缘').toBeLessThanOrEqual(width + 1);
        if (width === 390 || width === 1440) await shot(page, info, '新建-' + width);
        const lastField = dialog.getByPlaceholder('请输入描述信息...');
        await lastField.fill('滚动至底部验证');
        await expect(lastField).toBeInViewport();
        await button(page, '取消').click();
        await expect(dialog).toBeHidden();
    }
    await info.attach('视口测量', {body: Buffer.from(JSON.stringify(measurements, null, 2)), contentType: 'application/json'});
    await page.setViewportSize({width: 1440, height: 900});
    await search(page, uniqueName('无结果'));
    await expect(page.getByText('暂无数据源', {exact: true})).toBeVisible();
    await shot(page, info, '空结果');
    await page.locator('main').getByRole('button', {name: '新建数据源'}).click();
    await expect(panel(page)).toBeVisible();
});

test('另一会话删除了记录，旧卡片测试应提示连接不可用', async ({page}, info) => {
    test.skip(!mysql, '需可用 MySQL 目标');
    const name = uniqueName('已删除连接');
    const id = await create(page, mysql!, name, mysql!.url);
    await search(page, name);
    const token = await page.evaluate(() => JSON.parse(localStorage.getItem('DATAVISOOL_USER_INFO')!).token);
    const removal = await page.request.post(api + 'batchDel', {
        headers: {Authorization: 'Bearer ' + token}, data: [id],
    });
    expect((await removal.json()).data).toBe(true);
    expect(stored(id).deleted).toBe(1);
    const body = await connect(page, name, id);
    expect(body.data === true).toBe(false);
    await expect(page.getByText('正在测试数据库连接，请稍后...', {exact: true})).toHaveCount(0);
    if (await page.getByText('连接正常', {exact: true}).count()) await shot(page, info, '已删除连接');
    await expect(page.getByText('连接正常', {exact: true})).toHaveCount(0, {timeout: 500});
});

test('有效的长 Oracle 用户名可保存，出错后保留输入、允许改用短账号重试', async ({page}) => {
    const oracle = targets.find(target => target.type === 'Oracle' && target.longUser && !target.unavailable);
    test.skip(!oracle, '需同时提供两个能直连同一 Oracle 目标的长短用户名');
    const target = oracle!;
    const name = uniqueName('Oracle长用户名');
    await fillNew(page, {...target, user: target.longUser!}, name, target.url);
    const {body} = await action(page, 'add', () => button(page, '提交').click());
    expect.soft(body.code, '已通过原生客户端认证的长用户名：' + body.msg).toBe(200);
    let id = body.data;
    if (body.code !== 200) {
        const form = panel(page);
        await expect(form.getByPlaceholder('请输入数据库显示名称')).toHaveValue(name);
        await expect(form.getByPlaceholder('请输入用户名')).toHaveValue(target.longUser!);
        await form.getByPlaceholder('请输入用户名').fill(target.user);
        id = await save(page, 'add');
    }
    await search(page, name);
    const connected = await connect(page, name, String(id));
    expect(connected.code, connected.msg).toBe(200);
    await verifyProbe(page, String(id), target);
});

test('复制可用的 Oracle 服务名连接后，副本也能连接同一数据库', async ({page}, info) => {
    const oracle = targets.find(target => target.type === 'Oracle' && !target.unavailable);
    test.skip(!oracle, '需可用 Oracle 目标');
    const target = oracle!;
    const name = uniqueName('Oracle副本');
    const id = await create(page, target, name, target.url);
    await search(page, name);
    expect((await connect(page, name, id)).data).toBe(true);
    await card(page, name).getByRole('button', {name: '复制'}).click();
    const confirm = page.getByRole('dialog', {name: '复制确认'}).last().getByRole('button', {name: '确定'});
    expect((await action(page, 'copy/' + id, () => confirm.click())).body.data).toBe(true);
    const newName = name + '（副本）';
    const list = await search(page, newName);
    const cloneId = String(list.records.find((r: {name: string}) => r.name === newName).id);
    expect.soft(stored(cloneId).url, 'Oracle 副本 JDBC URL').toBe(target.url);
    const result = await connect(page, newName, cloneId, info);
    expect(result.code, result.msg).toBe(200);
    await verifyProbe(page, cloneId, target);
});

test('页面应拦截空白名称及无效端口，元库不应产生记录', async ({page}) => {
    test.skip(!mysql, '需可用 MySQL 目标');
    const cases = [
        {name: '   ', port: String(mysql!.port), label: '纯空格名称'},
        {name: uniqueName('端口零'), port: '0', label: '端口 0'},
        {name: uniqueName('端口越界'), port: '65536', label: '端口 65536'},
    ];
    for (const item of cases) {
        await fillNew(page, mysql!, item.name);
        const form = panel(page);
        await form.getByPlaceholder('请输入端口').fill(item.port);
        const settled = Promise.race([
            page.waitForResponse(r => new URL(r.url()).pathname === api + 'add').then(r => r.json()),
            form.locator('.datasource-form-error').first().waitFor({state: 'visible'}).then(() => null),
        ]);
        await button(page, '提交').click();
        const result = await settled;
        if (result?.code === 200) {
            const row = stored(String(result.data));
            expect.soft(row.deleted, item.label + '被保存为有效记录').not.toBe(0);
            await expect(form).toBeHidden();
        } else {
            await expect(form).toBeVisible();
            await button(page, '取消').click();
            await expect(form).toBeHidden();
        }
    }
});

test('按名称筛选后的下一页、上一页和清空搜索', async ({page}) => {
    test.skip(!mysql, '需可用 MySQL 目标');
    const prefix = uniqueName('筛选翻页');
    const token = await page.evaluate(() => JSON.parse(localStorage.getItem('DATAVISOOL_USER_INFO')!).token);
    // Only the prerequisite records are seeded through the API. Pagination is exercised through the list.
    for (let i = 0; i < 12; i++) {
        const encrypted = await page.evaluate(async name => {
            const {HybridCryptoUtil} = await import('/src/util/HybridCryptoUtil.ts');
            return HybridCryptoUtil.encryptRequest(JSON.stringify({
                name, type: 'MySQL', ip: '127.0.0.1', port: '1', databaseName: 'fixture', username: 'qa', password: 'fixture',
            }));
        }, i < 11 ? prefix + '-' + i : uniqueName('其他记录'));
        const response = await page.request.post(api + 'add', {headers: {Authorization: 'Bearer ' + token}, data: encrypted});
        expect((await response.json()).code).toBe(200);
    }
    const matches = await search(page, prefix);
    expect(matches.total).toBe(11);
    await expect(page.locator('article')).toHaveCount(10);
    const next = await action(page, 'pageList', () => button(page, '下一页').click());
    expect.soft(next.request.postDataJSON().searchValue, '第 2 页应沿用筛选词').toBe(prefix);
    expect.soft(next.body.data.total, '筛选结果总数').toBe(11);
    expect.soft(next.body.data.records.map((r: {name: string}) => r.name)).toEqual([expect.stringContaining(prefix)]);
    await action(page, 'pageList', () => button(page, '上一页').click());
    expect((await search(page, '')).total).toBeGreaterThan(11);
});

test('描述框允许的 500 字应能保存，改为 255 字后可重试', async ({page}) => {
    test.skip(!mysql, '需可用 MySQL 目标');
    const name = uniqueName('描述长度');
    await fillNew(page, mysql!, name, mysql!.url, '描'.repeat(500));
    const form = panel(page);
    await expect(form.locator('.datasource-description-count')).toContainText('500 / 500');
    const {body} = await action(page, 'add', () => button(page, '提交').click());
    expect.soft(body.code, body.msg).toBe(200);
    if (body.code !== 200) {
        await expect(form.getByPlaceholder('请输入描述信息...')).toHaveValue('描'.repeat(500));
        await form.getByPlaceholder('请输入描述信息...').fill('描'.repeat(255));
        const id = String(await save(page, 'add'));
        expect(stored(id).des).toBe('描'.repeat(255));
    }
});
