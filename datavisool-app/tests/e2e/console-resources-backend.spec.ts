/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {expect, test, type Page} from '@playwright/test';

const username = process.env.DATAVISOOL_E2E_USERNAME;
const password = process.env.DATAVISOOL_E2E_PASSWORD;
const backend = process.env.DATAVISOOL_SERVER_DEV_TARGET;
const database = process.env.DATAVISOOL_TEST_MYSQL_DATABASE || '';
const mysqlPassword = process.env.DATAVISOOL_TEST_MYSQL_PASSWORD;
const mysqlBinary = process.env.DATAVISOOL_TEST_MYSQL_BINARY || 'mysql';
const serverLog = process.env.DATAVISOOL_TEST_SERVER_LOG;
const enabled = process.env.DATAVISOOL_E2E_ALLOW_WRITES === 'isolated'
    && !!username && !!password && !!backend && !!mysqlPassword
    && /^datavisool_console_test_[a-z0-9_]+$/.test(database);
const resourceRoot = path.resolve(process.cwd(), '../测试资源');

test.use({trace: 'off', screenshot: 'off', video: 'off'});
test.setTimeout(120_000);

let projectId = '';
let projectName = '';

function sql(query: string): string {
    if (!enabled) throw new Error('只允许使用指定命名规则的隔离测试库');
    return execFileSync(mysqlBinary, [
        '--protocol=tcp', '-h', '127.0.0.1', '-u', 'root', '--batch', '--skip-column-names', database, '-e', query,
    ], {encoding: 'utf8', env: {...process.env, MYSQL_PWD: mysqlPassword}}).trim();
}

function displayTime(value: string): string {
    const parts = String(value).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    if (!parts) throw new Error('创建时间格式不符合预期');
    return `${parts[1]}/${Number(parts[2])}/${Number(parts[3])} ${parts[4]}:${parts[5]}`;
}

async function expectInvalidDateLog(table: string, id: string, column = 'update_time') {
    expect(serverLog, '需要提供临时后端日志路径').toBeTruthy();
    const expected = `表=${table}, 字段=${column}, 记录ID=${id}, 值=0000-00-00 00:00:00`;
    await expect.poll(() => readFileSync(serverLog!, 'utf8').includes(expected), {message: `缺少 ${table} 异常时间日志`}).toBe(true);
}

async function login(page: Page): Promise<string> {
    await page.addInitScript(() => localStorage.setItem('datavisool-i18n-locale', 'zh-CN'));
    await page.goto('/login');
    await page.getByLabel('用户名').fill(username!);
    await page.getByLabel('密码').fill(password!);
    await page.getByRole('button', {name: '登录', exact: true}).click();
    await expect(page).toHaveURL(/\/home\/console$/);
    const token = await page.evaluate(() => JSON.parse(localStorage.getItem('DATAVISOOL_USER_INFO') || '{}').token as string);
    expect(Boolean(token)).toBe(true);
    return token;
}

test('真实数据库中上传资源、发布项目并核对控制台', async ({page}, testInfo) => {
    test.skip(!enabled, '需要独立测试库、测试账号与明确的隔离写入开关');
    await page.setViewportSize({width: 1440, height: 900});
    const token = await login(page);
    const headers = {Authorization: `Bearer ${token}`};
    const post = async (url: string, data: unknown) => {
        const response = await page.request.post(url, {headers, data});
        const body = await response.json();
        expect(body.code, url).toBe(200);
        return body.data;
    };
    const upload = async (url: string, field: string, file: string, mimeType: string, extra: Record<string, string> = {}) => {
        const response = await page.request.post(url, {headers, multipart: {
            ...extra, [field]: {name: path.basename(file), mimeType, buffer: readFileSync(file)},
        }});
        const body = await response.json();
        expect(body.code, url).toBe(200);
        expect(body.data, url).toBeTruthy();
        return body.data;
    };

    projectName = `真实资源测试-${Date.now()}`;
    const projectJson = JSON.stringify({canvasManager: {width: 1280, height: 720}});
    projectId = String(await post('/api/project/create', {name: projectName, des: '隔离测试', dataJson: projectJson}));
    expect(projectId).toMatch(/^\d+$/);
    await upload('/api/font/upload', 'fontFile', path.join(resourceRoot, 'bea6c59f2bcb4a4e8e0bdb8a89c64e1f.ttf'), 'font/ttf');
    await upload('/api/video/upload', 'files', path.join(resourceRoot, '录屏2026-10-29 14.05.48.mov'), 'video/quicktime');
    await upload('/api/dynamicScript/saveOrUpdate', 'scriptFile', path.join(resourceRoot, '18b1cbe0-90cd-4b0d-9913-3719f5739b12.js'), 'text/javascript', {type: 'LOCAL'});
    await upload('/api/remote/component/upload', 'componentFile', path.join(resourceRoot, 'e45086a6260449c0bd019830daac490b.js'), 'text/javascript');
    await upload('/api/image/upload', 'file', path.join(resourceRoot, '7bcfead4-cc1e-4f26-8dc1-b6446402c38c.png'), 'image/png');
    const model = await page.request.post('/api/model/upload', {headers, multipart: {
        files: {name: '测试三角形.obj', mimeType: 'text/plain', buffer: Buffer.from('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n')},
    }});
    expect((await model.json()).code).toBe(200);
    await post('/api/commonApi/create', {name: '测试API', url: 'http://127.0.0.1:1/test', method: 'GET'});
    await post('/api/aiModel/create', {name: '测试AI模型', provider: 'deepseek', baseUrl: 'https://example.invalid', enabled: 0, isDefault: 0});
    const encryptedDatabase = await page.evaluate(async () => {
        const module = await import('/src/util/HybridCryptoUtil.ts');
        return module.HybridCryptoUtil.encryptRequest(JSON.stringify({name: '测试数据库', type: 'MySQL', ip: '127.0.0.1', port: '1', databaseName: 'test', username: 'test', password: 'test', url: 'jdbc:mysql://127.0.0.1:1/test'}));
    });
    await post('/api/commonDatabase/add', encryptedDatabase);
    const releaseId = String(await post('/api/release/release', {
        projectId, releaseType: 'INCREMENT', encrypt: false, expirationDate: 30,
        dependencies: [{id: projectId, name: projectName, projectJson}],
    }));
    expect(releaseId).toMatch(/^\d+$/);

    const response = page.waitForResponse((value) => new URL(value.url()).pathname === '/api/release/pageList');
    await page.goto('/home/console');
    const releasePage = await (await response).json();
    expect(releasePage.code).toBe(200);
    expect(releasePage.data.records.some((record: {id: string}) => String(record.id) === releaseId)).toBe(true);
    const dashboard = page.locator('[aria-busy]').filter({has: page.getByRole('heading', {name: '控制台', exact: true})});
    await expect(dashboard).toHaveAttribute('aria-busy', 'false');
    await expect(dashboard.getByRole('alert')).toHaveCount(0);
    await expect(page.getByLabel('资源总量 8 项')).toBeVisible();
    for (const name of ['字体', '视频', '3D 模型', '动态脚本', 'AI模型', '服务器组件', '数据库', 'API']) {
        await expect(page.getByRole('button', {name: `查看 ${name}`, exact: true})).toContainText('1');
    }
    const release = page.locator('table tbody tr').filter({hasText: projectName});
    await expect(release).toContainText('已发布');
    await expect(release).toContainText('30 天');
    expect(sql("SELECT COUNT(*) FROM image WHERE deleted=0")).toBe('1');
    expect(sql("SELECT COUNT(*) FROM project_release WHERE deleted=0")).toBe('1');
    const resourceCard = page.getByRole('region', {name: '核心指标'}).locator('article')
        .filter({has: page.getByRole('heading', {name: '资源总量', exact: true})});
    await expect(resourceCard.locator('strong').first()).toHaveText('8');
    const screenshot = testInfo.outputPath('console-real-resources.png');
    await page.screenshot({path: screenshot, animations: 'disabled'});
    await testInfo.attach('console-real-resources', {path: screenshot, contentType: 'image/png'});
    await release.scrollIntoViewIfNeeded();
    const releaseScreenshot = testInfo.outputPath('console-real-release.png');
    await page.screenshot({path: releaseScreenshot, animations: 'disabled'});
    await testInfo.attach('console-real-release', {path: releaseScreenshot, contentType: 'image/png'});
});

test('数据库中存入无效更新时间时，页面应使用创建时间', async ({page}, testInfo) => {
    test.skip(!enabled, '需要独立测试库、测试账号与明确的隔离写入开关');
    if (!projectId) {
        [projectId, projectName] = sql("SELECT id,name FROM project WHERE deleted=0 AND name LIKE '真实资源测试-%' ORDER BY create_time DESC LIMIT 1").split('\t');
    }
    expect(projectId).toMatch(/^\d+$/);
    const token = await login(page);
    sql(`SET SESSION sql_mode=''; UPDATE project SET update_time='0000-00-00 00:00:00' WHERE id=${projectId};`);
    try {
        expect(sql(`SELECT CAST(update_time AS CHAR) FROM project WHERE id=${projectId}`)).toBe('0000-00-00 00:00:00');
        const response = await page.request.post('/api/project/pageList', {
            headers: {Authorization: `Bearer ${token}`}, data: {current: 1, size: 50},
        });
        const body = await response.json();
        if (body.code !== 200) {
            await page.goto('/home/console');
            const dashboard = page.locator('[aria-busy]').filter({has: page.getByRole('heading', {name: '控制台', exact: true})});
            await expect(dashboard).toHaveAttribute('aria-busy', 'false');
            await expect(dashboard.getByRole('alert')).toContainText('部分数据加载失败');
            const card = page.getByRole('region', {name: '核心指标'}).locator('article')
                .filter({has: page.getByRole('heading', {name: '资源总量', exact: true})});
            await expect(card.locator('strong').first()).toHaveText('8');
            const screenshot = testInfo.outputPath('console-invalid-database-date.png');
            await page.screenshot({path: screenshot, animations: 'disabled'});
            await testInfo.attach('console-invalid-database-date', {path: screenshot, contentType: 'image/png'});
        }
        expect(body.code).toBe(200);
        const project = body.data.records.find((record: {id: string}) => String(record.id) === projectId);
        expect(project).toBeTruthy();
        expect(project.createTime).toBeTruthy();
        expect(project.updateTime).toBeFalsy();
        const loaded = page.waitForResponse((value) => new URL(value.url()).pathname === '/api/project/pageList');
        await page.goto('/home/console');
        expect((await (await loaded).json()).code).toBe(200);
        const activity = page.locator('button[data-type="project"]').filter({hasText: projectName});
        await expect(activity).toBeVisible();
        await expect(activity.locator('time')).toHaveText(displayTime(project.createTime));
        await expectInvalidDateLog('project', projectId);
        const card = page.getByRole('region', {name: '核心指标'}).locator('article')
            .filter({has: page.getByRole('heading', {name: '资源总量', exact: true})});
        await expect(card.locator('strong').first()).toHaveText('8');
        const screenshot = testInfo.outputPath('console-invalid-database-date-fixed.png');
        await page.screenshot({path: screenshot, animations: 'disabled'});
        await testInfo.attach('console-invalid-database-date-fixed', {path: screenshot, contentType: 'image/png'});
    } finally {
        sql(`UPDATE project SET update_time=create_time WHERE id=${projectId};`);
    }
});

test('数据库中发布记录的无效更新时间应回退创建时间', async ({page}) => {
    test.skip(!enabled, '需要独立测试库、测试账号与明确的隔离写入开关');
    const [releaseId, releaseName] = sql("SELECT id,name FROM project_release WHERE deleted=0 AND name LIKE '真实资源测试-%' ORDER BY create_time DESC LIMIT 1").split('\t');
    expect(releaseId).toMatch(/^\d+$/);
    const token = await login(page);
    sql(`SET SESSION sql_mode=''; UPDATE project_release SET update_time='0000-00-00 00:00:00' WHERE id=${releaseId};`);
    try {
        expect(sql(`SELECT CAST(update_time AS CHAR) FROM project_release WHERE id=${releaseId}`)).toBe('0000-00-00 00:00:00');
        const response = await page.request.post('/api/release/pageList', {
            headers: {Authorization: `Bearer ${token}`}, data: {current: 1, size: 50},
        });
        const body = await response.json();
        expect(body.code).toBe(200);
        const release = body.data.records.find((record: {id: string}) => String(record.id) === releaseId);
        expect(release.createTime).toBeTruthy();
        expect(release.updateTime).toBeFalsy();
        await page.goto('/home/console');
        const row = page.locator('table tbody tr').filter({hasText: releaseName});
        await expect(row).toBeVisible();
        await expect(row.locator('td').nth(2)).toHaveText(displayTime(release.createTime));
        await expectInvalidDateLog('project_release', releaseId);
    } finally {
        sql(`UPDATE project_release SET update_time=create_time WHERE id=${releaseId};`);
    }
});

test('项目创建时间无效时保留记录并记录日志', async ({page}) => {
    test.skip(!enabled, '需要独立测试库、测试账号与明确的隔离写入开关');
    const id = sql("SELECT id FROM project WHERE deleted=0 AND name LIKE '真实资源测试-%' ORDER BY create_time DESC LIMIT 1");
    expect(id).toMatch(/^\d+$/);
    const token = await login(page);
    sql(`SET SESSION sql_mode=''; UPDATE project SET create_time='0000-00-00 00:00:00', update_time=update_time WHERE id=${id};`);
    try {
        expect(sql(`SELECT CAST(create_time AS CHAR) FROM project WHERE id=${id}`)).toBe('0000-00-00 00:00:00');
        const response = await page.request.post('/api/project/pageList', {
            headers: {Authorization: `Bearer ${token}`}, data: {current: 1, size: 50},
        });
        const body = await response.json();
        expect(body.code).toBe(200);
        const project = body.data.records.find((record: {id: string}) => String(record.id) === id);
        expect(project).toBeTruthy();
        expect(project.createTime).toBeFalsy();
        expect(project.updateTime).toBeTruthy();
        await expectInvalidDateLog('project', id, 'create_time');
    } finally {
        sql(`UPDATE project SET create_time=update_time WHERE id=${id};`);
    }
});

test('字体更新时间无效时保留资源并记录日志', async ({page}) => {
    test.skip(!enabled, '需要独立测试库、测试账号与明确的隔离写入开关');
    const id = sql('SELECT id FROM font WHERE deleted=0 ORDER BY id DESC LIMIT 1');
    expect(id).toMatch(/^\d+$/);
    const token = await login(page);
    sql(`SET SESSION sql_mode=''; UPDATE font SET update_time='0000-00-00 00:00:00' WHERE id=${id};`);
    try {
        expect(sql(`SELECT CAST(update_time AS CHAR) FROM font WHERE id=${id}`)).toBe('0000-00-00 00:00:00');
        const response = await page.request.post('/api/font/pageList', {
            headers: {Authorization: `Bearer ${token}`}, data: {current: 1, size: 50},
        });
        const body = await response.json();
        expect(body.code).toBe(200);
        const font = body.data.records.find((record: {id: string}) => String(record.id) === id);
        expect(font).toBeTruthy();
        expect(font.updateTime).toBeFalsy();
        expect(font.createTime).toBeTruthy();
        await expectInvalidDateLog('font', id);
    } finally {
        sql(`UPDATE font SET update_time=create_time WHERE id=${id};`);
    }
});
