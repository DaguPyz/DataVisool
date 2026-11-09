/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {expect, test, type Page} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const backend = process.env.DATAVISOOL_SERVER_DEV_TARGET || '';
const username = process.env.DATAVISOOL_E2E_USERNAME || '';
const password = process.env.DATAVISOOL_E2E_PASSWORD || '';
const dbPassword = process.env.DATAVISOOL_TEST_MYSQL_PASSWORD || '';
const db = process.env.DATAVISOOL_TEST_MYSQL_DATABASE || '';
const container = process.env.DATAVISOOL_TEST_MYSQL_CONTAINER || '';
const enabled = process.env.DATAVISOOL_E2E_ALLOW_WRITES === 'isolated' && !!username && !!password && !!dbPassword
    && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(backend)
    && /^datavisool_script_test_[a-z0-9_]+$/.test(db)
    && /^datavisool-script-e2e-[a-z0-9-]+$/.test(container);
const script = readFileSync(resolve(process.cwd(), '../测试资源/18b1cbe0-90cd-4b0d-9913-3719f5739b12.js'));

test.use({trace: 'off', screenshot: 'off', video: 'off'});
test.setTimeout(90_000);
test.skip(!enabled, '需要本机隔离后端、动态脚本专用 MySQL 容器及测试库、账号和隔离写入开关');
function sql(query: string) {
    if (!enabled) throw new Error('只允许访问动态脚本隔离测试数据库');
    return execFileSync('docker', ['exec', '-e', `MYSQL_PWD=${dbPassword}`, container, 'mysql', '-uroot', '--batch', '--skip-column-names', db, '-e', query], {encoding: 'utf8'}).trim();
}
const header = (page: Page) => page.locator('header').filter({has: page.getByRole('heading', {name: '动态脚本管理', exact: true})});
const card = (page: Page, name: string) => page.locator('article').filter({has: page.getByRole('heading', {name, exact: true})});
const modal = (page: Page) => page.locator('.datavisool-dialog:visible');
const confirm = (page: Page) => page.getByRole('dialog').last();
async function login(page: Page) {
    await page.addInitScript(() => localStorage.setItem('datavisool-i18n-locale', 'zh-CN'));
    await page.goto('/login');
    await page.getByLabel('用户名').fill(username); await page.getByLabel('密码').fill(password);
    await page.getByRole('button', {name: '登录', exact: true}).click();
    await expect(page).toHaveURL(/\/home\/console$/);
    const token = await page.evaluate(() => JSON.parse(localStorage.getItem('DATAVISOOL_USER_INFO') || '{}').token as string);
    await page.goto('/home/dynamicScript');
    await expect(page.getByRole('heading', {name: '动态脚本管理', exact: true})).toBeVisible();
    return {Authorization: `Bearer ${token}`};
}
async function seed(page: Page, headers: Record<string, string>, name: string) {
    const response = await page.request.post('/api/dynamicScript/saveOrUpdate', {headers, multipart: {type: 'REMOTE', name, url: `https://example.test/${name}`}});
    expect(await response.json()).toMatchObject({code: 200, data: true});
}
async function refresh(page: Page) { await page.reload(); await expect(page.getByRole('heading', {name: '动态脚本管理', exact: true})).toBeVisible(); }
async function search(page: Page, value: string) {
    const input = page.getByPlaceholder('搜索动态脚本'); await input.fill(value);
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/dynamicScript/pageList');
    await input.press('Enter'); return await response;
}
async function openCreate(page: Page) { await header(page).getByRole('button', {name: '创建'}).click(); await expect(modal(page)).toBeVisible(); }
async function localType(page: Page) {
    await modal(page).locator('.datavisool-select-trigger').click();
    await page.getByRole('option', {name: '本地脚本'}).click();
}
async function clickConfirm(page: Page, name: string) { await confirm(page).getByRole('button', {name, exact: true}).click(); }

test.beforeEach(async () => { sql('DELETE FROM dynamic_script WHERE user_id=1'); });

for (const width of [1440, 1024, 700, 390]) test(`页面及创建窗口布局 ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height: 900}); await page.emulateMedia({reducedMotion: 'reduce'});
    const headers = await login(page); await seed(page, headers, 'layout-remote.js'); await refresh(page);
    await expect(card(page, 'layout-remote.js')).toBeVisible();
    await expect(header(page).getByPlaceholder('搜索动态脚本')).toBeVisible();
    const bounds = await page.evaluate(() => ({scroll: document.documentElement.scrollWidth, viewport: innerWidth}));
    expect(bounds.scroll).toBeLessThanOrEqual(bounds.viewport);
    await page.screenshot({path: `../测试报告/动态脚本管理/动态脚本-${width}.png`, animations: 'disabled'});
    await openCreate(page);
    await expect(modal(page).getByPlaceholder('请输入脚本链接或 CDN 地址')).toBeVisible();
    if (width === 390) await page.screenshot({path: '../测试报告/动态脚本管理/动态脚本-390-创建.png', animations: 'disabled'});
    const rect = await modal(page).boundingBox();
    expect(rect!.x).toBeGreaterThanOrEqual(0); expect(rect!.x + rect!.width).toBeLessThanOrEqual(width + 1);
    await expect(modal(page).getByRole('button', {name: '添加'})).toBeInViewport();
});

test('空状态、默认类型、必填校验与取消重置', async ({page}) => {
    await login(page); await expect(page.getByText('暂无动态脚本')).toBeVisible();
    await header(page).getByRole('button', {name: '删除', exact: true}).click();
    await expect(page.getByText('请选择要删除的项目')).toBeVisible();
    await page.getByRole('button', {name: '创建', exact: true}).last().click();
    await expect(modal(page).getByText('在线脚本')).toBeVisible();
    await modal(page).getByRole('button', {name: '添加'}).click();
    await expect(page.getByText('请输入远程脚本地址')).toBeVisible();
    await modal(page).getByPlaceholder('请输入脚本链接或 CDN 地址').fill('https://example.test/cancel.js');
    await modal(page).getByRole('button', {name: '取消'}).click();
    await openCreate(page); await expect(modal(page).getByPlaceholder('请输入脚本链接或 CDN 地址')).toHaveValue('');
    await localType(page);
    await modal(page).getByRole('button', {name: '添加'}).click();
    await expect(page.getByText('请选择脚本文件')).toBeVisible();
    await modal(page).getByRole('button', {name: '取消'}).click();
    expect(sql('SELECT COUNT(*) FROM dynamic_script WHERE deleted=0')).toBe('0');
});

test('在线脚本创建、改名和单项删除的真实数据', async ({page}) => {
    await login(page); await openCreate(page);
    const url = 'https://example.test/scripts/remote-example.js';
    await modal(page).getByPlaceholder('请输入脚本链接或 CDN 地址').fill(url);
    const save = page.waitForResponse(r => new URL(r.url()).pathname === '/api/dynamicScript/saveOrUpdate');
    await modal(page).getByRole('button', {name: '添加'}).click(); expect(await (await save).json()).toMatchObject({code: 200, data: true});
    await expect(card(page, 'remote-example.js')).toContainText('在线脚本');
    const [id, name, type, savedUrl] = sql("SELECT id,name,type,url FROM dynamic_script WHERE name='remote-example.js' AND deleted=0").split('\t');
    expect(id).toMatch(/^\d+$/); expect([name, type, savedUrl]).toEqual(['remote-example.js', 'REMOTE', url]);
    await card(page, name).getByRole('button', {name: '编辑'}).click();
    await confirm(page).getByPlaceholder('请输入脚本名称').fill('renamed-script.js'); await clickConfirm(page, '取消');
    expect(sql(`SELECT name FROM dynamic_script WHERE id=${id}`)).toBe(name);
    await card(page, name).getByRole('button', {name: '编辑'}).click();
    await confirm(page).getByPlaceholder('请输入脚本名称').fill('renamed-script.js');
    const update = page.waitForResponse(r => new URL(r.url()).pathname === '/api/dynamicScript/update');
    await clickConfirm(page, '确定'); expect(await (await update).json()).toMatchObject({code: 200, data: true});
    await expect(card(page, 'renamed-script.js')).toBeVisible();
    expect(sql(`SELECT name FROM dynamic_script WHERE id=${id}`)).toBe('renamed-script.js');
    await refresh(page); await expect(card(page, 'renamed-script.js')).toBeVisible();
    await card(page, 'renamed-script.js').getByRole('button', {name: '删除'}).click(); await clickConfirm(page, '取消');
    expect(sql(`SELECT deleted FROM dynamic_script WHERE id=${id}`)).toBe('0');
    await card(page, 'renamed-script.js').getByRole('button', {name: '删除'}).click();
    const del = page.waitForResponse(r => new URL(r.url()).pathname === '/api/dynamicScript/batchDel');
    await clickConfirm(page, '删除'); expect(await (await del).json()).toMatchObject({code: 200, data: true});
    await expect(card(page, 'renamed-script.js')).toHaveCount(0); expect(sql(`SELECT deleted FROM dynamic_script WHERE id=${id}`)).toBe('1');
});

test('本地脚本选择、移除、拖拽、上传和替换', async ({page}) => {
    await login(page); await openCreate(page); await localType(page);
    const file = modal(page).locator('input[type=file]');
    await file.setInputFiles({name: 'bad.txt', mimeType: 'text/plain', buffer: Buffer.from('x')});
    await expect(page.getByText('请上传js文件')).toBeVisible();
    await file.setInputFiles({name: 'local-original.js', mimeType: 'text/javascript', buffer: script});
    await expect(modal(page).getByText('local-original.js')).toBeVisible();
    await modal(page).getByRole('button', {name: '移除已选择文件'}).click();
    await expect(modal(page).getByText('local-original.js')).toHaveCount(0);
    const data = await page.evaluateHandle(() => {const d = new DataTransfer(); d.items.add(new File(['console.log("dragged")'], 'local-drag.js', {type: 'text/javascript'})); return d;});
    await modal(page).getByRole('button', {name: '点击或拖拽上传 JavaScript 文件'}).dispatchEvent('drop', {dataTransfer: data});
    await expect(modal(page).getByText('local-drag.js')).toBeVisible();
    const save = page.waitForResponse(r => new URL(r.url()).pathname === '/api/dynamicScript/saveOrUpdate');
    await modal(page).getByRole('button', {name: '添加'}).click(); expect(await (await save).json()).toMatchObject({code: 200, data: true});
    await expect(card(page, 'local-drag.js')).toContainText('本地脚本');
    const [id, fileName] = sql("SELECT id,url FROM dynamic_script WHERE name='local-drag.js' AND deleted=0").split('\t');
    expect(id).toMatch(/^\d+$/);
    expect(await (await page.request.get(`/static/lib/${fileName}`)).text()).toContain('console.log("dragged")');
    await card(page, 'local-drag.js').getByRole('button', {name: '替换'}).click();
    await expect(modal(page).getByText('替换动态脚本')).toBeVisible();
    await expect(modal(page).locator('.datavisool-select-trigger')).toBeDisabled();
    await modal(page).locator('input[type=file]').setInputFiles({name: 'local-replaced.js', mimeType: 'text/javascript', buffer: script});
    const replace = page.waitForResponse(r => new URL(r.url()).pathname === '/api/dynamicScript/saveOrUpdate');
    await modal(page).getByRole('button', {name: '替换', exact: true}).click(); expect(await (await replace).json()).toMatchObject({code: 200, data: true});
    await expect(card(page, 'local-replaced.js')).toBeVisible();
    const [renamed, newFile] = sql(`SELECT name,url FROM dynamic_script WHERE id=${id}`).split('\t');
    expect(renamed).toBe('local-replaced.js'); expect(newFile).not.toBe(fileName);
    expect((await (await page.request.get(`/static/lib/${newFile}`)).body()).equals(script)).toBe(true);
    expect((await page.request.get(`/static/lib/${fileName}`)).status()).toBe(404);
});

test('在线脚本替换与取消', async ({page}) => {
    const headers = await login(page); await seed(page, headers, 'remote-old.js'); await refresh(page);
    const id = sql("SELECT id FROM dynamic_script WHERE name='remote-old.js'");
    await card(page, 'remote-old.js').getByRole('button', {name: '替换'}).click();
    await expect(modal(page).locator('.datavisool-select-trigger')).toBeDisabled();
    await modal(page).getByPlaceholder('请输入脚本链接或 CDN 地址').fill('https://example.test/remote-new.js');
    await modal(page).getByRole('button', {name: '取消'}).click();
    expect(sql(`SELECT name FROM dynamic_script WHERE id=${id}`)).toBe('remote-old.js');
    await card(page, 'remote-old.js').getByRole('button', {name: '替换'}).click();
    await modal(page).getByPlaceholder('请输入脚本链接或 CDN 地址').fill('https://example.test/remote-new.js');
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/dynamicScript/saveOrUpdate');
    await modal(page).getByRole('button', {name: '替换', exact: true}).click();
    expect(await (await response).json()).toMatchObject({code: 200, data: true});
    await expect(card(page, 'remote-new.js')).toBeVisible();
    expect(sql(`SELECT name,url FROM dynamic_script WHERE id=${id}`)).toBe('remote-new.js\thttps://example.test/remote-new.js');
});

test('搜索、分页与搜索后翻页保持筛选条件', async ({page}) => {
    const headers = await login(page);
    for (let i = 1; i <= 11; i++) await seed(page, headers, `target-${String(i).padStart(2, '0')}.js`);
    await seed(page, headers, 'unrelated.js'); await refresh(page);
    await expect(page.locator('article')).toHaveCount(10);
    const result = await search(page, '  target-  ');
    expect(result.request().postDataJSON()).toMatchObject({current: 1, size: 10, searchValue: 'target-'});
    await expect(page.locator('.datavisool-pagination-total')).toContainText('共 11 条');
    const next = page.waitForResponse(r => new URL(r.url()).pathname === '/api/dynamicScript/pageList' && r.request().postDataJSON().current === 2);
    await page.locator('.datavisool-pagination-item').filter({hasText: /^2$/}).click();
    const nextResponse = await next;
    expect.soft(nextResponse.request().postDataJSON().searchValue).toBe('target-');
    expect.soft((await nextResponse.json()).data.total).toBe(11);
    await expect.soft(page.locator('article')).toHaveCount(1);
    await expect.soft(card(page, 'unrelated.js')).toHaveCount(0);
});

test('无结果、清空搜索及普通分页', async ({page}) => {
    const headers = await login(page);
    for (let i = 1; i <= 11; i++) await seed(page, headers, `ordinary-${i}.js`);
    await refresh(page); await expect(page.locator('article')).toHaveCount(10);
    await page.locator('.datavisool-pagination-item').filter({hasText: /^2$/}).click(); await expect(page.locator('article')).toHaveCount(1);
    await search(page, 'not-present'); await expect(page.getByText('暂无动态脚本')).toBeVisible();
    await search(page, ''); await expect(page.locator('article')).toHaveCount(10);
});

test('默认选中、取消选择及多选批量删除', async ({page}) => {
    const headers = await login(page); await seed(page, headers, 'batch-a.js'); await seed(page, headers, 'batch-b.js'); await refresh(page);
    await expect(card(page, 'batch-a.js').getByRole('button', {name: '取消选择'})).toBeVisible();
    await card(page, 'batch-a.js').getByRole('button', {name: '取消选择'}).click();
    await header(page).getByRole('button', {name: '删除', exact: true}).click();
    await expect(page.getByText('请选择要删除的项目')).toBeVisible();
    await card(page, 'batch-a.js').click(); await card(page, 'batch-b.js').getByRole('button', {name: '选择脚本'}).click();
    await header(page).getByRole('button', {name: '删除', exact: true}).click(); await clickConfirm(page, '取消');
    expect(sql('SELECT COUNT(*) FROM dynamic_script WHERE deleted=0')).toBe('2');
    await header(page).getByRole('button', {name: '删除', exact: true}).click();
    const del = page.waitForResponse(r => new URL(r.url()).pathname === '/api/dynamicScript/batchDel');
    await clickConfirm(page, '删除'); expect((await (await del).json()).data).toBe(true);
    await expect(page.getByText('暂无动态脚本')).toBeVisible(); expect(sql('SELECT COUNT(*) FROM dynamic_script WHERE deleted=1')).toBe('2');
});

test('远程脚本地址格式校验', async ({page}) => {
    await login(page); await openCreate(page);
    await modal(page).getByPlaceholder('请输入脚本链接或 CDN 地址').fill('not-a-url');
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/dynamicScript/saveOrUpdate', {timeout: 3000}).catch(() => null);
    await modal(page).getByRole('button', {name: '添加'}).click();
    await response;
    await expect(modal(page)).toBeVisible();
    expect(sql('SELECT COUNT(*) FROM dynamic_script WHERE deleted=0')).toBe('0');
});

test('接口返回 false 时不能提示创建成功', async ({page}) => {
    await login(page);
    let release!: () => void; const wait = new Promise<void>(resolve => {release = resolve;});
    await page.route('**/api/dynamicScript/saveOrUpdate', async route => {await wait; await route.fulfill({json: {code: 200, msg: '成功', data: false}});});
    await openCreate(page); await modal(page).getByPlaceholder('请输入脚本链接或 CDN 地址').fill('https://example.test/failure.js');
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/dynamicScript/saveOrUpdate');
    await modal(page).getByRole('button', {name: '添加'}).click(); release(); await response;
    await expect.poll(async () => (await page.getByText('操作成功').count()) + (await page.getByText('操作失败', {exact: true}).count())).toBeGreaterThan(0);
    await expect(page.getByText('操作成功')).toHaveCount(0);
    await expect(modal(page)).toBeVisible();
    expect(sql('SELECT COUNT(*) FROM dynamic_script WHERE deleted=0')).toBe('0');
});

test('创建失败后保留输入并可连接真实后端重试', async ({page}) => {
    await login(page);
    let fail = true;
    await page.route('**/api/dynamicScript/saveOrUpdate', async route => {
        if (fail) {fail = false; await route.fulfill({json: {code: 500, msg: '模拟保存失败', data: null}});}
        else await route.continue();
    });
    await openCreate(page);
    const address = 'https://example.test/retry-script.js';
    await modal(page).getByPlaceholder('请输入脚本链接或 CDN 地址').fill(address);
    await modal(page).getByRole('button', {name: '添加'}).click();
    await expect(page.getByText('模拟保存失败')).toBeVisible();
    await expect(modal(page).getByPlaceholder('请输入脚本链接或 CDN 地址')).toHaveValue(address);
    expect(sql('SELECT COUNT(*) FROM dynamic_script WHERE deleted=0')).toBe('0');
    const result = page.waitForResponse(r => new URL(r.url()).pathname === '/api/dynamicScript/saveOrUpdate');
    await modal(page).getByRole('button', {name: '添加'}).click();
    expect((await (await result).json()).data).toBe(true);
    await expect(card(page, 'retry-script.js')).toBeVisible();
    expect(sql("SELECT COUNT(*) FROM dynamic_script WHERE name='retry-script.js' AND deleted=0")).toBe('1');
});

test('连续提交创建不会产生重复记录', async ({page}) => {
    await login(page);
    let release!: () => void; const waiting = new Promise<void>(resolve => {release = resolve;});
    let sent = 0;
    await page.route('**/api/dynamicScript/saveOrUpdate', async route => {sent++; await waiting; await route.continue();});
    await openCreate(page);
    await modal(page).getByPlaceholder('请输入脚本链接或 CDN 地址').fill('https://example.test/duplicate.js');
    try {
        await modal(page).getByRole('button', {name: '添加'}).click();
        await expect.poll(() => sent).toBe(1);
        await expect(modal(page).getByRole('button', {name: '添加'})).toBeDisabled();
        await expect(modal(page).getByRole('button', {name: '取消'})).toBeDisabled();
        await expect(modal(page).getByPlaceholder('请输入脚本链接或 CDN 地址')).toBeDisabled();
        await modal(page).getByRole('button', {name: '添加'}).click({timeout: 2000}).catch(() => undefined);
        await page.waitForTimeout(500);
    } finally {release();}
    await expect.poll(() => Number(sql("SELECT COUNT(*) FROM dynamic_script WHERE name='duplicate.js' AND deleted=0"))).toBeGreaterThan(0);
    expect(sent).toBe(1);
    expect(sql("SELECT COUNT(*) FROM dynamic_script WHERE name='duplicate.js' AND deleted=0")).toBe('1');
});

test('删除末页唯一脚本后应回到有数据的页面', async ({page}) => {
    const headers = await login(page);
    for (let i = 1; i <= 11; i++) await seed(page, headers, `last-page-${String(i).padStart(2, '0')}.js`);
    await refresh(page); await page.locator('.datavisool-pagination-item').filter({hasText: /^2$/}).click();
    await expect(page.locator('article')).toHaveCount(1);
    await card(page, 'last-page-11.js').getByRole('button', {name: '删除'}).click();
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/dynamicScript/batchDel');
    await clickConfirm(page, '删除'); expect((await (await response).json()).data).toBe(true);
    await expect(page.locator('.datavisool-pagination-total')).toContainText('共 10 条');
    expect(sql('SELECT COUNT(*) FROM dynamic_script WHERE deleted=0')).toBe('10');
    await expect(page.locator('article')).toHaveCount(10);
});

test('重命名时拒绝空白名称', async ({page}) => {
    const headers = await login(page); await seed(page, headers, 'valid-name.js'); await refresh(page);
    await card(page, 'valid-name.js').getByRole('button', {name: '编辑'}).click();
    await confirm(page).getByPlaceholder('请输入脚本名称').fill('   ');
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/dynamicScript/update', {timeout: 3000}).catch(() => null);
    await clickConfirm(page, '确定'); await response;
    expect(sql("SELECT COUNT(*) FROM dynamic_script WHERE name='valid-name.js' AND deleted=0")).toBe('1');
    await expect(page.getByText('请输入脚本名称')).toBeVisible();
    await expect(confirm(page)).toBeVisible();
});

test('接口拒绝无效地址及空白名称，支持有效 CDN 地址', async ({page}) => {
    const headers = await login(page);
    for (const url of ['not-a-url', 'javascript:alert(1)', 'https://bad host/script.js', 'http://example.test:99999/x.js']) {
        const response = await page.request.post('/api/dynamicScript/saveOrUpdate', {headers, multipart: {type: 'REMOTE', name: 'invalid.js', url}});
        expect((await response.json()).code).not.toBe(200);
    }
    const missingType = await page.request.post('/api/dynamicScript/saveOrUpdate', {headers, multipart: {name: 'invalid.js', url: 'not-a-url'}});
    expect((await missingType.json()).code).not.toBe(200);
    expect(sql('SELECT COUNT(*) FROM dynamic_script WHERE deleted=0')).toBe('0');
    for (const [name, url] of [['protocol-relative.js', '//cdn.example.test/lib.js'], ['unicode.js', 'https://例子.测试/script.js']]) {
        const response = await page.request.post('/api/dynamicScript/saveOrUpdate', {headers, multipart: {type: 'REMOTE', name, url}});
        expect(await response.json()).toMatchObject({code: 200, data: true});
    }
    const id = sql("SELECT id FROM dynamic_script WHERE name='protocol-relative.js'");
    for (const name of ['', '   ', '\u00a0\u00a0']) {
        const response = await page.request.post('/api/dynamicScript/update', {headers, data: {id, name}});
        expect((await response.json()).code).not.toBe(200);
    }
    const replace = await page.request.post('/api/dynamicScript/saveOrUpdate', {headers, multipart: {id, type: 'REMOTE', name: 'modified.js', url: 'not-a-url'}});
    expect((await replace.json()).code).not.toBe(200);
    expect(sql(`SELECT name,url FROM dynamic_script WHERE id=${id}`)).toBe('protocol-relative.js\t//cdn.example.test/lib.js');
});

test('筛选后删除末页最后一项时保留筛选并回到第一页', async ({page}) => {
    const headers = await login(page);
    for (let i = 1; i <= 11; i++) await seed(page, headers, `filtered-${String(i).padStart(2, '0')}.js`);
    await seed(page, headers, 'unrelated.js');
    await refresh(page);
    await search(page, 'filtered-');
    await expect(page.locator('.datavisool-pagination-total')).toContainText('共 11 条');
    await page.locator('.datavisool-pagination-item').filter({hasText: /^2$/}).click();
    await expect(card(page, 'filtered-11.js')).toBeVisible();
    await card(page, 'filtered-11.js').getByRole('button', {name: '删除'}).click();
    await clickConfirm(page, '删除');
    await expect(page.locator('.datavisool-pagination-total')).toContainText('共 10 条');
    await expect(page.locator('article')).toHaveCount(10);
    await expect(card(page, 'unrelated.js')).toHaveCount(0);
});
