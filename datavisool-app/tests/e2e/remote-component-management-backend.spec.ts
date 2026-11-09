/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {expect, test, type Page} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {strToU8, zipSync} from 'fflate';

const backend = process.env.DATAVISOOL_SERVER_DEV_TARGET || '';
const username = process.env.DATAVISOOL_E2E_USERNAME || '';
const password = process.env.DATAVISOOL_E2E_PASSWORD || '';
const dbPassword = process.env.DATAVISOOL_TEST_MYSQL_PASSWORD || '';
const db = process.env.DATAVISOOL_TEST_MYSQL_DATABASE || '';
const container = process.env.DATAVISOOL_TEST_MYSQL_CONTAINER || '';
const enabled = process.env.DATAVISOOL_E2E_ALLOW_WRITES === 'isolated' && !!username && !!password && !!dbPassword
    && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(backend)
    && /^datavisool_remote_test_[a-z0-9_]+$/.test(db)
    && /^datavisool-remote-e2e-[a-z0-9-]+$/.test(container);
const script = Buffer.from('globalThis.__DATAVISOOL_REMOTE_COMPONENT_TEMP__ = {test: "remote fixture"};\n');
const replacement = Buffer.from('globalThis.__DATAVISOOL_REMOTE_COMPONENT_TEMP__ = {test: "replacement"};\n');
const zip = Buffer.from(zipSync({'index.js': new Uint8Array(script), 'assets/info.txt': strToU8('remote package asset')}));
const badZip = Buffer.from(zipSync({'readme.txt': strToU8('no entry')}));
test.use({trace: 'off', screenshot: 'off', video: 'off'});
test.setTimeout(60_000);
test.skip(!enabled, '需要本机隔离后端、服务器组件专用 MySQL 容器和测试库、账号及隔离写入开关');
function sql(query: string) {
    if (!enabled) throw new Error('只允许访问服务器组件隔离测试数据库');
    return execFileSync('docker', ['exec', '-e', `MYSQL_PWD=${dbPassword}`, container, 'mysql', '-uroot', '--batch', '--skip-column-names', db, '-e', query], {encoding: 'utf8'}).trim();
}
const header = (page: Page) => page.locator('header').filter({has: page.getByRole('heading', {name: '服务器组件', exact: true})});
const card = (page: Page, name: string) => page.locator('article').filter({has: page.getByRole('heading', {name, exact: true})});
const modal = (page: Page) => page.locator('.datavisool-dialog:visible');
const confirm = (page: Page) => page.getByRole('dialog').last();
async function login(page: Page) {
    await page.addInitScript(() => localStorage.setItem('datavisool-i18n-locale', 'zh-CN'));
    await page.goto('/login'); await page.getByLabel('用户名').fill(username); await page.getByLabel('密码').fill(password);
    await page.getByRole('button', {name: '登录', exact: true}).click(); await expect(page).toHaveURL(/\/home\/console$/);
    const token = await page.evaluate(() => JSON.parse(localStorage.getItem('DATAVISOOL_USER_INFO') || '{}').token as string);
    await page.goto('/home/remoteComponent'); await expect(page.getByRole('heading', {name: '服务器组件', exact: true})).toBeVisible();
    return {Authorization: `Bearer ${token}`};
}
async function seed(page: Page, headers: Record<string, string>, names: string[]) {
    for (const name of names) {
        const response = await page.request.post('/api/remote/component/upload', {headers, multipart: {componentFile: {name, mimeType: 'text/javascript', buffer: script}}});
        expect(await response.json()).toMatchObject({code: 200, data: true});
    }
}
async function refresh(page: Page) { await page.reload(); await expect(page.getByRole('heading', {name: '服务器组件', exact: true})).toBeVisible(); }
async function search(page: Page, value: string) {
    const input = page.getByPlaceholder('搜索服务器组件'); await input.fill(value);
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/remote/component/pageList');
    await input.press('Enter'); return await response;
}
async function openUpload(page: Page) { await header(page).getByRole('button', {name: '上传', exact: true}).click(); await expect(modal(page)).toBeVisible(); }
async function choose(page: Page, name: string, buffer: Buffer = script) {await modal(page).locator('input[type=file]').setInputFiles({name, mimeType: 'application/octet-stream', buffer});}
async function submit(page: Page, button = '上传') { const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/remote/component/upload'); await modal(page).getByRole('button', {name: button, exact: true}).click(); return await (await response).json(); }
async function clickConfirm(page: Page, action: string) { await confirm(page).getByRole('button', {name: action, exact: true}).click(); }
test.beforeEach(() => { sql('DELETE FROM remote_component_document WHERE user_id=1'); sql('DELETE FROM remote_component WHERE user_id=1'); });

for (const width of [1440, 1024, 700, 390]) test(`页面和上传窗口布局 ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height: 900}); await page.emulateMedia({reducedMotion: 'reduce'});
    const headers = await login(page); await seed(page, headers, ['layout.js']); await refresh(page); await expect(card(page, 'layout.js')).toBeVisible();
    const dim = await page.evaluate(() => ({scroll: document.documentElement.scrollWidth, width: innerWidth}));
    await page.screenshot({path: `../测试报告/服务器组件管理/服务器组件-${width}.png`, animations: 'disabled'});
    expect.soft(dim.scroll).toBeLessThanOrEqual(dim.width);
    await openUpload(page); await expect(modal(page).getByText('点击或拖拽 js / mjs / zip 文件上传')).toBeVisible();
    if (width === 390) await page.screenshot({path: '../测试报告/服务器组件管理/服务器组件-390-上传.png', animations: 'disabled'});
    const rect = await modal(page).boundingBox(); expect.soft(rect!.x).toBeGreaterThanOrEqual(0); expect.soft(rect!.x + rect!.width).toBeLessThanOrEqual(width + 1);
    await expect.soft(modal(page).getByRole('button', {name: '取消'})).toBeInViewport();
});

test('空状态、无选择删除、文件类型、移除和取消', async ({page}) => {
    await login(page); await expect(page.getByText('暂无服务器组件')).toBeVisible();
    await header(page).getByRole('button', {name: '删除', exact: true}).click(); await expect(page.getByText('请选择要删除的服务器组件')).toBeVisible();
    await page.getByRole('button', {name: '上传', exact: true}).last().click();
    await expect(modal(page).getByRole('button', {name: '上传', exact: true})).toBeDisabled();
    await expect(modal(page).locator('input[type=file]')).toHaveAttribute('accept', '.js,.mjs,.zip');
    await choose(page, 'bad.txt'); await expect(page.getByText('请上传 js、mjs 或 zip 文件')).toBeVisible(); await expect(modal(page).getByText('bad.txt')).toHaveCount(0);
    await choose(page, 'first.js'); await expect(modal(page).getByText('first.js')).toBeVisible();
    await modal(page).getByRole('button', {name: '移除 first.js', exact: true}).click();
    await choose(page, 'second.mjs'); await expect(modal(page).getByText('second.mjs')).toBeVisible();
    await modal(page).getByRole('button', {name: '移除 second.mjs', exact: true}).click(); await expect(modal(page).getByRole('button', {name: '上传', exact: true})).toBeDisabled();
    await choose(page, 'discard.js'); await modal(page).getByRole('button', {name: '取消'}).click(); await openUpload(page); await expect(modal(page).getByText('discard.js')).toHaveCount(0);
    expect(sql('SELECT COUNT(*) FROM remote_component WHERE deleted=0')).toBe('0');
});

test('真实 JS 上传、数据库和脚本读取执行', async ({page}) => {
    await login(page); await openUpload(page); await choose(page, 'sample.js'); expect(await submit(page)).toMatchObject({code: 200, data: true});
    await expect(card(page, 'sample.js')).toBeVisible(); const path = sql("SELECT url FROM remote_component WHERE component_name='sample.js' AND deleted=0");
    expect((await (await page.request.get(`/static/components/${path}`)).body()).equals(script)).toBe(true);
    expect(await page.evaluate(async path => {const text = await (await fetch(`/static/components/${path}`)).text(); (0, eval)(text); return (globalThis as any).__DATAVISOOL_REMOTE_COMPONENT_TEMP__.test;}, path)).toBe('remote fixture');
});

test('真实 mjs、大写后缀、ZIP 包和资源读取', async ({page}) => {
    await login(page); await openUpload(page); await choose(page, 'module.MJS'); expect(await submit(page)).toMatchObject({code: 200, data: true}); await expect(card(page, 'module.MJS')).toBeVisible();
    await openUpload(page); await choose(page, 'package.zip', zip); expect(await submit(page)).toMatchObject({code: 200, data: true}); await expect(card(page, 'package.zip')).toBeVisible();
    const path = sql("SELECT url FROM remote_component WHERE component_name='package.zip' AND deleted=0"); expect(path).toMatch(/\/index\.js$/);
    expect((await (await page.request.get(`/static/components/${path}`)).body()).equals(script)).toBe(true);
    expect(await (await page.request.get(`/static/components/${path.replace('index.js', 'assets/info.txt')}`)).text()).toBe('remote package asset');
});

test('拖拽 JS 上传真实后端', async ({page}) => {
    await login(page); await openUpload(page);
    const data = await page.evaluateHandle(() => {const d = new DataTransfer(); d.items.add(new File(['globalThis.testRemote = true;'], 'drag.js', {type: 'text/javascript'})); return d;});
    await modal(page).locator('input[type=file]').dispatchEvent('drop', {dataTransfer: data}); await expect(modal(page).getByText('drag.js')).toBeVisible();
    expect(await submit(page)).toMatchObject({code: 200, data: true}); await expect(card(page, 'drag.js')).toBeVisible(); expect(sql("SELECT COUNT(*) FROM remote_component WHERE component_name='drag.js' AND deleted=0")).toBe('1');
});

test('替换和取消替换更新原记录', async ({page}) => {
    const headers = await login(page); await seed(page, headers, ['original.js']); await refresh(page);
    const original = sql("SELECT id,url FROM remote_component WHERE component_name='original.js'");
    await card(page, 'original.js').getByRole('button', {name: '替换'}).click(); await choose(page, 'cancel.js', replacement); await modal(page).getByRole('button', {name: '取消'}).click();
    expect(sql("SELECT id,url FROM remote_component WHERE component_name='original.js'")).toBe(original);
    await card(page, 'original.js').getByRole('button', {name: '替换'}).click(); await choose(page, 'new.js', replacement); expect(await submit(page, '替换')).toMatchObject({code: 200, data: true});
    await expect(card(page, 'original.js')).toBeVisible(); const [id, path] = sql("SELECT id,url FROM remote_component WHERE component_name='original.js' AND deleted=0").split('\t');
    expect(id).toBe(original.split('\t')[0]); expect(path).not.toBe(original.split('\t')[1]); expect(sql('SELECT COUNT(*) FROM remote_component WHERE deleted=0')).toBe('1');
    expect((await (await page.request.get(`/static/components/${path}`)).body()).equals(replacement)).toBe(true);
});

test('无入口 ZIP 真实后端拒绝', async ({page}) => {
    await login(page); await openUpload(page); await choose(page, 'invalid.zip', badZip); const body = await submit(page);
    expect(body.code).not.toBe(200); await expect(modal(page).getByText('invalid.zip')).toBeVisible(); expect(sql('SELECT COUNT(*) FROM remote_component WHERE deleted=0')).toBe('0');
});

test('重命名取消及保存', async ({page}) => {
    const headers = await login(page); await seed(page, headers, ['before.js']); await refresh(page);
    await card(page, 'before.js').getByRole('button', {name: '编辑'}).click(); await confirm(page).getByPlaceholder('请输入组件名称').fill('cancelled'); await clickConfirm(page, '取消');
    expect(sql("SELECT component_name FROM remote_component WHERE deleted=0")).toBe('before.js');
    await card(page, 'before.js').getByRole('button', {name: '编辑'}).click(); await confirm(page).getByPlaceholder('请输入组件名称').fill('after.js');
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/remote/component/update'); await clickConfirm(page, '确定'); expect((await (await response).json()).data).toBe(true);
    await expect(card(page, 'after.js')).toBeVisible(); await refresh(page); await expect(card(page, 'after.js')).toBeVisible(); expect(sql('SELECT component_name FROM remote_component WHERE deleted=0')).toBe('after.js');
});

test('空白名称应拒绝并提示', async ({page}) => {
    const headers = await login(page); await seed(page, headers, ['valid.js']); await refresh(page);
    await card(page, 'valid.js').getByRole('button', {name: '编辑'}).click(); await confirm(page).getByPlaceholder('请输入组件名称').fill('   ');
    await clickConfirm(page, '确定');
    expect.soft(sql('SELECT HEX(component_name) FROM remote_component WHERE deleted=0')).toBe(Buffer.from('valid.js').toString('hex').toUpperCase());
    await expect.soft(confirm(page).getByPlaceholder('请输入组件名称')).toBeVisible({timeout: 2000});
    await expect(page.getByText('请输入组件名称', {exact: true})).toBeVisible();
});

test('搜索、清空和普通分页', async ({page}) => {
    const headers = await login(page); await seed(page, headers, Array.from({length: 11}, (_, i) => `plain-${String(i).padStart(2, '0')}.js`)); await refresh(page);
    await expect(page.locator('article')).toHaveCount(10); await page.locator('.datavisool-pagination-item').filter({hasText: /^2$/}).click(); await expect(page.locator('article')).toHaveCount(1);
    const response = await search(page, '  plain-00  '); expect(response.request().postDataJSON()).toMatchObject({current: 1, searchValue: 'plain-00'}); await expect(card(page, 'plain-00.js')).toBeVisible();
    await search(page, 'no-matches'); await expect(page.getByText('暂无服务器组件')).toBeVisible(); await search(page, ''); await expect(page.locator('article')).toHaveCount(10);
});

test('搜索后翻页保留条件', async ({page}) => {
    const headers = await login(page); await seed(page, headers, [...Array.from({length: 11}, (_, i) => `match-${String(i).padStart(2, '0')}.js`), 'unrelated.js']); await refresh(page);
    await search(page, 'match-'); await expect(page.locator('.datavisool-pagination-total')).toContainText('共 11 条');
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/remote/component/pageList' && r.request().postDataJSON().current === 2);
    await page.locator('.datavisool-pagination-item').filter({hasText: /^2$/}).click(); const next = await response;
    expect.soft(next.request().postDataJSON().searchValue).toBe('match-'); expect.soft((await next.json()).data.total).toBe(11); await expect.soft(page.locator('article')).toHaveCount(1, {timeout: 3000});
});

test('单项删除的取消和确认', async ({page}) => {
    const headers = await login(page); await seed(page, headers, ['single.js']); await refresh(page);
    await card(page, 'single.js').getByRole('button', {name: '删除'}).click(); await clickConfirm(page, '取消'); expect(sql('SELECT COUNT(*) FROM remote_component WHERE deleted=0')).toBe('1');
    await card(page, 'single.js').getByRole('button', {name: '删除'}).click(); const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/remote/component/batchDel'); await clickConfirm(page, '确定');
    expect((await (await response).json()).data).toBe(true); await expect(page.getByText('暂无服务器组件')).toBeVisible(); expect(sql('SELECT COUNT(*) FROM remote_component WHERE deleted=1')).toBe('1');
});

test('多选切换、批量删除取消与确认', async ({page}) => {
    const headers = await login(page); await seed(page, headers, ['a.js', 'b.js', 'c.js']); await refresh(page);
    await card(page, 'a.js').click(); await expect(card(page, 'a.js').getByRole('button', {name: '取消选择组件'})).toBeVisible();
    await card(page, 'b.js').getByRole('button', {name: '选择组件'}).click(); await card(page, 'b.js').getByRole('button', {name: '取消选择组件'}).click();
    await card(page, 'c.js').getByRole('button', {name: '选择组件'}).click();
    await header(page).getByRole('button', {name: '删除', exact: true}).click(); await clickConfirm(page, '取消'); expect(sql('SELECT COUNT(*) FROM remote_component WHERE deleted=0')).toBe('3');
    await header(page).getByRole('button', {name: '删除', exact: true}).click(); const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/remote/component/batchDel'); await clickConfirm(page, '确定');
    expect((await (await response).json()).data).toBe(true); await expect(card(page, 'b.js')).toBeVisible(); await expect(page.locator('article')).toHaveCount(1); expect(sql('SELECT COUNT(*) FROM remote_component WHERE deleted=1')).toBe('2');
});

test('删除末页唯一记录回到有效页', async ({page}) => {
    const headers = await login(page); await seed(page, headers, Array.from({length: 11}, (_, i) => `last-${String(i).padStart(2, '0')}.js`)); await refresh(page);
    await page.locator('.datavisool-pagination-item').filter({hasText: /^2$/}).click(); await expect(page.locator('article')).toHaveCount(1);
    await page.locator('article').first().getByRole('button', {name: '删除'}).click(); const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/remote/component/batchDel'); await clickConfirm(page, '确定');
    expect((await (await response).json()).data).toBe(true); await expect(page.locator('.datavisool-pagination-total')).toContainText('共 10 条');
    expect(sql('SELECT COUNT(*) FROM remote_component WHERE deleted=0')).toBe('10'); await expect(page.locator('article')).toHaveCount(10, {timeout: 3000});
});

test('空文件选择阶段阻止并提示', async ({page}) => {
    await login(page); await openUpload(page); await choose(page, 'empty.js', Buffer.alloc(0));
    await expect.soft(modal(page).getByText('empty.js')).toHaveCount(0, {timeout: 2000}); await expect.soft(modal(page).getByRole('button', {name: '上传', exact: true})).toBeDisabled({timeout: 2000});
    await expect(page.getByText('组件文件不能为空')).toBeVisible(); expect(sql('SELECT COUNT(*) FROM remote_component WHERE deleted=0')).toBe('0');
});

test('模拟上传失败保留文件后可真实重试', async ({page}) => {
    await login(page); let fail = true; await page.route('**/api/remote/component/upload', async route => {if (fail) {fail = false; await route.fulfill({json: {code: 500, msg: '模拟上传失败', data: null}});} else await route.continue();});
    await openUpload(page); await choose(page, 'retry.js'); await modal(page).getByRole('button', {name: '上传', exact: true}).click(); await expect(page.getByText('模拟上传失败')).toBeVisible();
    await expect(modal(page).getByText('retry.js')).toBeVisible(); expect(sql('SELECT COUNT(*) FROM remote_component WHERE deleted=0')).toBe('0');
    expect(await submit(page)).toMatchObject({code: 200, data: true}); await expect(card(page, 'retry.js')).toBeVisible();
});

test('上传中禁止取消与重复提交', async ({page}) => {
    await login(page); let release!: () => void; const wait = new Promise<void>(resolve => {release = resolve;}); let sent = 0;
    await page.route('**/api/remote/component/upload', async route => {sent++; await wait; await route.continue();}); await openUpload(page); await choose(page, 'slow.js');
    try {await modal(page).getByRole('button', {name: '上传', exact: true}).click(); await expect.poll(() => sent).toBe(1); await expect(modal(page).getByRole('button', {name: '取消'})).toBeDisabled(); await expect(modal(page).getByRole('button', {name: '上传中...'})).toBeDisabled();} finally {release();}
    await expect(card(page, 'slow.js')).toBeVisible(); expect(sql("SELECT COUNT(*) FROM remote_component WHERE component_name='slow.js' AND deleted=0")).toBe('1');
});

test('模拟编辑错误不应显示成功并保留输入', async ({page}) => {
    const headers = await login(page); await seed(page, headers, ['fail.js']); await refresh(page);
    await page.route('**/api/remote/component/update', route => route.fulfill({json: {code: 500, msg: '模拟编辑失败', data: null}}));
    await card(page, 'fail.js').getByRole('button', {name: '编辑'}).click(); await confirm(page).getByPlaceholder('请输入组件名称').fill('should-not-save');
    await clickConfirm(page, '确定'); await expect(page.getByText('模拟编辑失败')).toBeVisible(); expect(sql('SELECT component_name FROM remote_component WHERE deleted=0')).toBe('fail.js');
    await expect.soft(confirm(page).getByPlaceholder('请输入组件名称')).toBeVisible({timeout: 2500});
});

test('模拟删除返回 false 不应提示成功', async ({page}) => {
    const headers = await login(page); await seed(page, headers, ['false.js']); await refresh(page);
    await page.route('**/api/remote/component/batchDel', route => route.fulfill({json: {code: 200, msg: '成功', data: false}}));
    await card(page, 'false.js').getByRole('button', {name: '删除'}).click(); const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/remote/component/batchDel'); await clickConfirm(page, '确定'); await response;
    await page.waitForTimeout(500);
    await expect.soft(page.getByText('删除成功')).toHaveCount(0, {timeout: 2500}); await expect(page.getByText('删除失败')).toBeVisible(); await expect(confirm(page)).toBeVisible(); expect(sql('SELECT COUNT(*) FROM remote_component WHERE deleted=0')).toBe('1');
});

test('模拟编辑返回 false 不应提示成功', async ({page}) => {
    const headers = await login(page); await seed(page, headers, ['edit-false.js']); await refresh(page);
    await page.route('**/api/remote/component/update', route => route.fulfill({json: {code: 200, msg: '成功', data: false}}));
    await card(page, 'edit-false.js').getByRole('button', {name: '编辑'}).click(); await confirm(page).getByPlaceholder('请输入组件名称').fill('not-saved');
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/remote/component/update'); await clickConfirm(page, '确定'); await response; await page.waitForTimeout(500);
    await expect.soft(page.getByText('操作成功')).toHaveCount(0); await expect(page.getByText('修改失败')).toBeVisible(); await expect(confirm(page).getByPlaceholder('请输入组件名称')).toHaveValue('not-saved'); expect(sql('SELECT component_name FROM remote_component WHERE deleted=0')).toBe('edit-false.js');
});

test('拒绝替换和编辑其他用户组件', async ({page}) => {
    const headers = await login(page); await seed(page, headers, ['foreign.js']); const id = sql("SELECT id FROM remote_component WHERE component_name='foreign.js'");
    sql(`UPDATE remote_component SET user_id=2 WHERE id=${id}`);
    try {
        const upload = await page.request.post('/api/remote/component/upload', {headers, multipart: {id, componentFile: {name: 'hijack.js', mimeType: 'text/javascript', buffer: replacement}}});
        expect((await upload.json()).code).not.toBe(200);
        const edit = await page.request.post('/api/remote/component/update', {headers, data: {id, componentName: 'hijacked'}});
        expect((await edit.json()).data).toBe(false);
        expect(sql(`SELECT component_name FROM remote_component WHERE id=${id}`)).toBe('foreign.js');
    } finally {sql(`DELETE FROM remote_component WHERE id=${id}`);}
});

test('语法错误脚本不应保存为可用组件', async ({page}) => {
    await login(page); await openUpload(page); await choose(page, 'invalid.js', Buffer.from('const = ;'));
    const body = await submit(page);
    expect(body.code).not.toBe(200);
    await expect(page.getByText('组件脚本语法无效或过于复杂')).toBeVisible();
    await expect(modal(page).getByText('invalid.js')).toBeVisible();
    expect(sql('SELECT COUNT(*) FROM remote_component WHERE deleted=0')).toBe('0');
});

test('真实后端拒绝空白名称并去除名称两端空白', async ({page}) => {
    const headers = await login(page); await seed(page, headers, ['name.js']);
    const id = sql("SELECT id FROM remote_component WHERE component_name='name.js'");
    for (const name of ['', '   ', '\u00a0\u00a0']) {
        const response = await page.request.post('/api/remote/component/update', {headers, data: {id, componentName: name}});
        expect((await response.json()).code).not.toBe(200);
    }
    expect(sql(`SELECT component_name FROM remote_component WHERE id=${id}`)).toBe('name.js');
    const response = await page.request.post('/api/remote/component/update', {headers, data: {id, componentName: '  new name  '}});
    expect((await response.json()).data).toBe(true); expect(sql(`SELECT component_name FROM remote_component WHERE id=${id}`)).toBe('new name');
});

test('真实后端校验 ZIP 入口脚本且不执行上传代码', async ({page}) => {
    const headers = await login(page);
    const bad = Buffer.from(zipSync({'index.js': strToU8('const = ;')}));
    const badResponse = await page.request.post('/api/remote/component/upload', {headers, multipart: {componentFile: {name: 'bad.zip', mimeType: 'application/zip', buffer: bad}}});
    expect((await badResponse.json()).code).not.toBe(200); expect(sql('SELECT COUNT(*) FROM remote_component WHERE deleted=0')).toBe('0');
    const safeSource = 'throw new Error("uploaded script must not run on server"); export const result = 42;';
    const valid = await page.request.post('/api/remote/component/upload', {headers, multipart: {componentFile: {name: 'valid.mjs', mimeType: 'text/javascript', buffer: Buffer.from(safeSource)}}});
    expect((await valid.json()).data).toBe(true); expect(sql('SELECT COUNT(*) FROM remote_component WHERE deleted=0')).toBe('1');
});
