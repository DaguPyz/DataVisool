/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {expect, test, type Page, type Request} from '@playwright/test';
import {execFileSync} from 'node:child_process';

const username = process.env.DATAVISOOL_E2E_USERNAME;
const password = process.env.DATAVISOOL_E2E_PASSWORD;
const backend = process.env.DATAVISOOL_SERVER_DEV_TARGET || '';
const database = process.env.DATAVISOOL_TEST_MYSQL_DATABASE || '';
const mysqlPassword = process.env.DATAVISOOL_TEST_MYSQL_PASSWORD;
const mysqlUser = process.env.DATAVISOOL_TEST_MYSQL_USER || 'root';
const mysqlCliPort = process.env.DATAVISOOL_TEST_MYSQL_CLI_PORT || '3306';
const mysqlBinary = process.env.DATAVISOOL_TEST_MYSQL_BINARY || 'mysql';
const enabled = process.env.DATAVISOOL_E2E_ALLOW_WRITES === 'isolated'
    && !!username && !!password && !!mysqlPassword
    && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(backend)
    && /^datavisool_datasource_test_[a-z0-9_]+$/.test(database);

test.use({trace: 'off', screenshot: 'off', video: 'off'});
test.setTimeout(90_000);
test.skip(!enabled, '需要本机隔离后端、datavisool_datasource_test_ 开头的独立数据库、测试账号和隔离写入开关');

type DataSource = {
    name: string;
    type: string;
    ip: string;
    port: string;
    username: string;
    password: string;
    databaseName: string;
    des?: string;
    allowSqlScript?: boolean;
};

const pageListPath = '/api/commonDatabase/pageList';
const addPath = '/api/commonDatabase/add';
const batchDeletePath = '/api/commonDatabase/batchDel';

function uniqueSuffix() {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function sql(query: string) {
    if (!enabled) throw new Error('只允许查询数据源管理隔离测试库');
    return execFileSync(mysqlBinary, [
        '--protocol=tcp', '--default-character-set=utf8mb4', '-h', '127.0.0.1', '-P', mysqlCliPort, '-u', mysqlUser, '--batch', '--skip-column-names', database, '-e', query,
    ], {encoding: 'utf8', env: {...process.env, MYSQL_PWD: mysqlPassword}}).trim();
}

function sqlString(value: string) {
    return `'${value.replace(/'/g, "''")}'`;
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

async function goToDatabaseList(page: Page) {
    const response = page.waitForResponse((value) => new URL(value.url()).pathname === pageListPath);
    await page.goto('/home/database');
    expect((await response).status()).toBe(200);
    await expect(page.getByRole('heading', {name: '数据源管理', exact: true})).toBeVisible();
}

async function createDataSource(page: Page, headers: Record<string, string>, data: DataSource) {
    const encrypted = await page.evaluate(async (source) => {
        const module = await import('/src/util/HybridCryptoUtil.ts');
        return module.HybridCryptoUtil.encryptRequest(JSON.stringify(source));
    }, data);
    const response = await page.request.post(addPath, {headers, data: encrypted});
    const body = await response.json();
    expect(body.code).toBe(200);
    const id = String(body.data);
    expect(id).toMatch(/^\d+$/);
    return id;
}

async function submitDataSource(page: Page, headers: Record<string, string>, data: DataSource) {
    const encrypted = await page.evaluate(async (source) => {
        const module = await import('/src/util/HybridCryptoUtil.ts');
        return module.HybridCryptoUtil.encryptRequest(JSON.stringify(source));
    }, data);
    const response = await page.request.post(addPath, {headers, data: encrypted});
    return await response.json();
}

function sourceData(name: string, overrides: Partial<DataSource> = {}): DataSource {
    return {
        name,
        type: 'MySQL',
        ip: '127.0.0.1',
        port: '1',
        username: 'e2e-test',
        password: 'e2e-test-password',
        databaseName: 'e2e_test',
        des: '数据源管理 Playwright 临时测试记录',
        allowSqlScript: false,
        ...overrides,
    };
}

function sourceCard(page: Page, name: string) {
    return page.getByRole('article').filter({has: page.getByRole('heading', {name, exact: true})});
}

function pageHeader(page: Page) {
    return page.locator('header').filter({has: page.getByRole('heading', {name: '数据源管理', exact: true})}).first();
}

function batchDeleteButton(page: Page) {
    return pageHeader(page).getByRole('button', {name: '删除', exact: true});
}

async function search(page: Page, value: string) {
    const input = page.getByPlaceholder('搜索数据源名称/类型/描述');
    const response = page.waitForResponse((result) => new URL(result.url()).pathname === pageListPath
        && result.request().method() === 'POST');
    await input.fill(value);
    await input.press('Enter');
    const body = await (await response).json();
    expect(body.code).toBe(200);
    return body.data as {total: number; records: unknown[]};
}

async function openCreatePanel(page: Page) {
    await pageHeader(page).getByRole('button', {name: '新建数据源', exact: true}).click();
    const panel = page.locator('.datasource-panel');
    await expect(panel).toBeVisible();
    return panel;
}

async function fillRequiredFields(panel: ReturnType<Page['locator']>, name: string) {
    await panel.getByPlaceholder('请输入数据库显示名称').fill(name);
    await panel.getByPlaceholder('请输入 IP / 域名').fill('127.0.0.1');
    await panel.getByPlaceholder('请输入端口').fill('1');
    await panel.getByPlaceholder('请输入用户名').fill('e2e-test');
    await panel.getByPlaceholder('请输入密码').fill('e2e-test-password');
    await panel.getByPlaceholder('请输入数据库名称').fill('e2e_test');
}

test.describe('数据源管理页面行为', () => {
    let headers: Record<string, string>;
    let createdIds: string[];

    test.beforeEach(async ({page}) => {
        createdIds = [];
        headers = await login(page);
        await goToDatabaseList(page);
    });

    test.afterEach(async ({page}) => {
        createdIds = [...new Set(createdIds)];
        if (createdIds.length === 0) return;
        const response = await page.request.post(batchDeletePath, {headers, data: createdIds});
        const body = await response.json();
        expect(body.code).toBe(200);
    });

    test('名称搜索会返回匹配的数据源，并去除首尾空格', async ({page}) => {
        const marker = `名称搜索_${uniqueSuffix()}`;
        const name = `${marker}_MySQL`;
        createdIds.push(await createDataSource(page, headers, sourceData(name)));
        await goToDatabaseList(page);

        const result = await search(page, `  ${marker}  `);
        expect(result.total).toBe(1);
        await expect(sourceCard(page, name)).toBeVisible();
        await expect(page.getByRole('article')).toHaveCount(1);
    });

    test('类型搜索可按数据库类型筛选', async ({page}) => {
        const marker = uniqueSuffix();
        const name = `类型字段测试_${marker}`;
        createdIds.push(await createDataSource(page, headers, sourceData(name, {type: 'PostgresSQL'})));
        await goToDatabaseList(page);

        const result = await search(page, 'PostgresSQL');
        expect(result.total).toBeGreaterThan(0);
        await expect(sourceCard(page, name)).toBeVisible();
    });

    test('描述搜索可按描述内容筛选', async ({page}) => {
        const marker = `描述搜索_${uniqueSuffix()}`;
        const name = `描述字段测试_${uniqueSuffix()}`;
        createdIds.push(await createDataSource(page, headers, sourceData(name, {des: marker})));
        await goToDatabaseList(page);

        const result = await search(page, marker);
        expect(result.total).toBeGreaterThan(0);
        await expect(sourceCard(page, name)).toBeVisible();
    });

    test('每页 10 条，分页可以显示第 11 条记录', async ({page}) => {
        const marker = `pagination_${uniqueSuffix()}`;
        const before = await page.request.post(pageListPath, {headers, data: {current: 1, size: 1}});
        const baseline = (await before.json()).data.total as number;
        let recordCount = (1 - baseline % 10 + 10) % 10;
        while (recordCount < 11) recordCount += 10;
        const names = Array.from({length: recordCount}, (_, index) => `${marker}_${index + 1}`);
        for (const name of names)
            createdIds.push(await createDataSource(page, headers, sourceData(name)));
        await goToDatabaseList(page);

        const expectedTotal = baseline + recordCount;
        expect(expectedTotal % 10).toBe(1);
        await expect(page.getByRole('article')).toHaveCount(10);
        const pagination = page.getByRole('navigation', {name: '分页'});
        await expect(pagination.getByText(`第 1-10 条，共 ${expectedTotal} 条`)).toBeVisible();
        const totalPages = Math.ceil(expectedTotal / 10);
        for (let currentPage = 2; currentPage <= totalPages; currentPage++) {
            const response = page.waitForResponse((value) => new URL(value.url()).pathname === pageListPath);
            await pagination.getByRole('button', {name: '下一页'}).click();
            expect((await (await response).json()).code).toBe(200);
            await expect(pagination.getByRole('button', {name: `第 ${currentPage} 页`})).toHaveAttribute('aria-current', 'page');
        }
        await expect(page.getByRole('article')).toHaveCount(1);
        await expect(pagination.getByText(`第 ${expectedTotal}-${expectedTotal} 条，共 ${expectedTotal} 条`)).toBeVisible();
        const lastName = await page.getByRole('article').getByRole('heading').innerText();
        expect(names).toContain(lastName);
    });

    test('删除末页唯一数据源后列表仍显示剩余数据', async ({page}) => {
        const marker = `last_page_${uniqueSuffix()}`;
        const before = await page.request.post(pageListPath, {headers, data: {current: 1, size: 1}});
        const baseline = (await before.json()).data.total as number;
        let recordCount = (1 - baseline % 10 + 10) % 10;
        while (recordCount < 11) recordCount += 10;
        const names = Array.from({length: recordCount}, (_, index) => `${marker}_${index + 1}`);
        for (const name of names)
            createdIds.push(await createDataSource(page, headers, sourceData(name)));
        await goToDatabaseList(page);
        const pagination = page.getByRole('navigation', {name: '分页'});
        const expectedTotal = baseline + recordCount;
        const totalPages = Math.ceil(expectedTotal / 10);
        for (let currentPage = 2; currentPage <= totalPages; currentPage++) {
            const response = page.waitForResponse((value) => new URL(value.url()).pathname === pageListPath);
            await pagination.getByRole('button', {name: '下一页'}).click();
            expect((await (await response).json()).code).toBe(200);
        }
        const lastCard = page.getByRole('article');
        await expect(lastCard).toHaveCount(1);
        const lastName = await lastCard.getByRole('heading').innerText();
        expect(names).toContain(lastName);
        await expect(lastCard).toBeVisible();

        await lastCard.getByRole('button', {name: '删除'}).click();
        const confirmations = page.locator('.datavisool-global-modal-card');
        const confirmation = confirmations.last();
        await expect(confirmation).toContainText('确定删除该数据库链接吗？');
        const deleteResponse = page.waitForResponse((response) => new URL(response.url()).pathname === batchDeletePath);
        const listResponse = page.waitForResponse((response) => new URL(response.url()).pathname === pageListPath);
        await confirmation.getByRole('button', {name: '确定', exact: true}).click();
        expect((await (await deleteResponse).json()).code).toBe(200);
        const refreshed = await listResponse;
        const refreshedBody = await refreshed.json();
        expect(refreshedBody.code).toBe(200);
        const afterDeleteCount = await page.getByRole('article').count();
        const remainingTotal = refreshedBody.data.total as number;
        await expect(sourceCard(page, lastName)).toHaveCount(0);

        const firstPage = pagination.getByRole('button', {name: '第 1 页'});
        const firstPageResponse = page.waitForResponse((response) => new URL(response.url()).pathname === pageListPath);
        await firstPage.click();
        expect((await (await firstPageResponse).json()).code).toBe(200);
        await expect(page.getByRole('article')).toHaveCount(10);
        await expect(pagination.getByText(`第 1-10 条，共 ${remainingTotal} 条`)).toBeVisible();
        expect({afterDeleteCount, remainingTotal, recoveredCount: await page.getByRole('article').count()})
            .toEqual({afterDeleteCount: 10, remainingTotal: expectedTotal - 1, recoveredCount: 10});
    });

    test('单条删除取消保留记录，确认后删除记录', async ({page}) => {
        const name = `单删_${uniqueSuffix()}`;
        const id = await createDataSource(page, headers, sourceData(name));
        createdIds.push(id);
        await goToDatabaseList(page);
        await search(page, name);
        const card = sourceCard(page, name);
        await expect(card).toBeVisible();

        await card.getByRole('button', {name: '删除'}).click();
        const confirmations = page.locator('.datavisool-global-modal-card');
        let confirmation = confirmations.last();
        await confirmation.getByRole('button', {name: '取消', exact: true}).click();
        await expect(confirmations).toHaveCount(0);
        await expect(card).toBeVisible();

        await card.getByRole('button', {name: '删除'}).click();
        confirmation = confirmations.last();
        const deleted = page.waitForResponse((response) => new URL(response.url()).pathname === batchDeletePath);
        const refreshed = page.waitForResponse((response) => new URL(response.url()).pathname === pageListPath);
        await confirmation.getByRole('button', {name: '确定', exact: true}).click();
        expect((await (await deleted).json()).code).toBe(200);
        expect((await (await refreshed).json()).code).toBe(200);
        await expect(card).toHaveCount(0);
    });

    test('选择与批量删除支持取消和确认', async ({page}) => {
        const names = [`批删甲_${uniqueSuffix()}`, `批删乙_${uniqueSuffix()}`];
        for (const name of names)
            createdIds.push(await createDataSource(page, headers, sourceData(name)));
        await goToDatabaseList(page);
        await search(page, '批删');

        const cards = names.map((name) => sourceCard(page, name));
        for (const card of cards)
            await card.click();
        for (const card of cards)
            await expect(card.getByRole('checkbox')).toBeChecked();

        const confirmations = page.locator('.datavisool-global-modal-card');
        await batchDeleteButton(page).click();
        await expect(confirmations.last()).toContainText('确定删除选中的数据库链接吗？删除后无法恢复，请谨慎操作！');
        let confirmation = confirmations.last();
        await confirmation.getByRole('button', {name: '取消', exact: true}).click();
        await expect(confirmations).toHaveCount(0);
        for (const card of cards)
            await expect(card).toBeVisible();

        await batchDeleteButton(page).click();
        confirmation = confirmations.last();
        const deleted = page.waitForResponse((response) => new URL(response.url()).pathname === batchDeletePath);
        const refreshed = page.waitForResponse((response) => new URL(response.url()).pathname === pageListPath);
        await confirmation.getByRole('button', {name: '确定', exact: true}).click();
        expect((await (await deleted).json()).code).toBe(200);
        expect((await (await refreshed).json()).code).toBe(200);
        for (const card of cards)
            await expect(card).toHaveCount(0);
    });

    test('空选择时批量删除提示选择数据源', async ({page}) => {
        await batchDeleteButton(page).click();
        await expect(page.getByText('请选择要删除的数据源', {exact: true})).toBeVisible();
        await expect(page.locator('.datavisool-global-modal-card')).toHaveCount(0);
    });

    test('必填校验阻止空表单提交', async ({page}) => {
        let requests = 0;
        page.on('request', (request) => {
            if (new URL(request.url()).pathname === addPath) requests++;
        });
        const panel = await openCreatePanel(page);
        await panel.getByRole('button', {name: '提交', exact: true}).click();
        for (const error of ['请选择数据库类型', '请输入数据库显示名称', '请输入IP/域名', '请输入端口', '请输入用户名', '请输入密码', '请输入数据库名称'])
            await expect(panel.locator('.datasource-form-error').filter({hasText: error})).toBeVisible();
        expect(requests).toBe(0);
    });

    test('后端拒绝纯空格名称并且不写入元数据库', async ({page}) => {
        const marker = `whitespace_${uniqueSuffix()}`;
        const data = sourceData('   ', {des: marker});
        const before = sql(`SELECT COUNT(*) FROM common_database WHERE des=${sqlString(marker)} AND deleted=0`);
        const body = await submitDataSource(page, headers, data);
        if (body.code === 200 && /^\d+$/.test(String(body.data))) createdIds.push(String(body.data));
        const persisted = sql(`SELECT COUNT(*) FROM common_database WHERE des=${sqlString(marker)} AND deleted=0`);
        expect({accepted: body.code === 200, persisted}).toEqual({accepted: false, persisted: before});
    });

    for (const port of ['0', '65536']) {
        test(`后端拒绝超出有效范围的端口 ${port} 并且不写入元数据库`, async ({page}) => {
            const marker = `invalid_port_${port}_${uniqueSuffix()}`;
            const data = sourceData(marker, {port, des: marker});
            const before = sql(`SELECT COUNT(*) FROM common_database WHERE des=${sqlString(marker)} AND deleted=0`);
            const body = await submitDataSource(page, headers, data);
            if (body.code === 200 && /^\d+$/.test(String(body.data))) createdIds.push(String(body.data));
            const persisted = sql(`SELECT COUNT(*) FROM common_database WHERE des=${sqlString(marker)} AND deleted=0`);
            expect({accepted: body.code === 200, persisted}).toEqual({accepted: false, persisted: before});
        });
    }

    test('描述最多输入 500 字，开关展示高风险提示，密码可显隐', async ({page}) => {
        const panel = await openCreatePanel(page);
        const name = `表单边界_${uniqueSuffix()}`;
        await panel.locator('.datasource-select').click();
        await page.getByText('MySQL', {exact: true}).last().click();
        await fillRequiredFields(panel, name);
        const description = panel.getByPlaceholder('请输入描述信息...');
        await description.fill('描'.repeat(520));
        await expect(description).toHaveValue('描'.repeat(500));
        await expect(panel.locator('.datasource-description-count')).toContainText('500 / 500');

        const scriptSwitch = panel.getByRole('switch');
        await expect(scriptSwitch).toHaveAttribute('aria-checked', 'false');
        await scriptSwitch.click();
        await expect(scriptSwitch).toHaveAttribute('aria-checked', 'true');
        await expect(panel.getByText('高风险操作', {exact: true})).toBeVisible();

        const passwordInput = panel.getByPlaceholder('请输入密码');
        await expect(passwordInput).toHaveAttribute('type', 'password');
        await panel.getByRole('button', {name: '显示密码'}).click();
        await expect(passwordInput).toHaveAttribute('type', 'text');
        await panel.getByRole('button', {name: '隐藏密码'}).click();
        await expect(passwordInput).toHaveAttribute('type', 'password');

        // The UI accepts 500 characters, while the database column stores at most 255.
        await description.fill('描'.repeat(255));

        const added = page.waitForResponse((response) => new URL(response.url()).pathname === addPath);
        const refreshed = page.waitForResponse((response) => new URL(response.url()).pathname === pageListPath);
        await panel.getByRole('button', {name: '提交', exact: true}).click();
        const body = await (await added).json();
        expect(body.code).toBe(200);
        createdIds.push(String(body.data));
        expect(sql(`SELECT CHAR_LENGTH(des) FROM common_database WHERE id=${String(body.data)} AND deleted=0`)).toBe('255');
        expect((await (await refreshed).json()).code).toBe(200);
        await search(page, name);
        const card = sourceCard(page, name);
        await expect(card).toBeVisible();
        await expect(card).toContainText('SQL脚本');
    });

    test('取消后重新打开表单会清空输入并恢复默认开关', async ({page}) => {
        const panel = await openCreatePanel(page);
        await panel.locator('.datasource-select').click();
        await page.getByText('Oracle', {exact: true}).last().click();
        await fillRequiredFields(panel, `取消重置_${uniqueSuffix()}`);
        await panel.getByPlaceholder('请输入密码').fill('one-off-password');
        await panel.getByRole('switch').click();
        await panel.getByPlaceholder('请输入描述信息...').fill('临时描述');
        await panel.getByRole('button', {name: '取消', exact: true}).click();
        await expect(panel).toHaveCount(0);

        const reopened = await openCreatePanel(page);
        await expect(reopened.getByPlaceholder('请输入数据库显示名称')).toHaveValue('');
        await expect(reopened.getByPlaceholder('请输入密码')).toHaveValue('');
        await expect(reopened.getByPlaceholder('请输入描述信息...')).toHaveValue('');
        await expect(reopened.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
        await expect(reopened.getByText('高风险操作', {exact: true})).toHaveCount(0);
    });

    test('提交按钮在请求完成前重复点击只发送一次请求', async ({page}) => {
        const requests: Request[] = [];
        let release!: () => void;
        const name = `repeat_submit_${uniqueSuffix()}`;
        const pending = new Promise<void>((resolve) => { release = resolve; });
        await page.route(`**${addPath}`, async (route) => {
            requests.push(route.request());
            await pending;
            await route.continue();
        });

        try {
            const panel = await openCreatePanel(page);
            await panel.locator('.datasource-select').click();
            await page.getByText('MySQL', {exact: true}).last().click();
            await fillRequiredFields(panel, name);
            const submit = panel.getByRole('button', {name: '提交', exact: true});
            await submit.click();
            await expect.poll(() => requests.length).toBeGreaterThan(0);
            await submit.click();
            await page.waitForTimeout(300);
        } finally {
            release();
            for (const request of requests) {
                const response = await request.response();
                if (!response) continue;
                const body = await response.json();
                const id = String(body.data ?? '');
                if (body.code === 200 && /^\d+$/.test(id)) createdIds.push(id);
            }
        }

        const persisted = sql(`SELECT COUNT(*) FROM common_database WHERE name=${sqlString(name)} AND deleted=0`);
        expect({requests: requests.length, persisted}).toEqual({requests: 1, persisted: '1'});
    });
});
