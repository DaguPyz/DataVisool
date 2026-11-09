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
    && /^datavisool_font_test_[a-z0-9_]+$/.test(db)
    && /^datavisool-font-e2e-[a-z0-9-]+$/.test(container);
const fontData = readFileSync(resolve(process.cwd(), '../测试资源/bea6c59f2bcb4a4e8e0bdb8a89c64e1f.ttf'));

test.use({trace: 'off', screenshot: 'off', video: 'off'});
test.setTimeout(120_000);
test.skip(!enabled, '需要本机隔离后端、字体测试专用 MySQL 容器和数据库、账号与隔离写入开关');
function sql(query: string) {
    if (!enabled) throw new Error('只允许访问字体管理隔离测试数据库');
    return execFileSync('docker', ['exec', '-e', `MYSQL_PWD=${dbPassword}`, container, 'mysql', '-uroot', '--batch', '--skip-column-names', db, '-e', query], {encoding: 'utf8'}).trim();
}
function card(page: Page, name: string) {
    return page.locator('article').filter({has: page.getByRole('heading', {name, exact: true})});
}
function uploadDialog(page: Page) { return page.locator('.datavisool-dialog:visible'); }
function top(page: Page) { return page.locator('header').filter({has: page.getByRole('heading', {name: '字体管理', exact: true})}); }
async function login(page: Page) {
    await page.addInitScript(() => localStorage.setItem('datavisool-i18n-locale', 'zh-CN'));
    await page.goto('/login');
    await page.getByLabel('用户名').fill(username);
    await page.getByLabel('密码').fill(password);
    await page.getByRole('button', {name: '登录', exact: true}).click();
    await expect(page).toHaveURL(/\/home\/console$/);
    await page.goto('/home/font');
    await expect(page.getByRole('heading', {name: '字体管理', exact: true})).toBeVisible();
}
async function search(page: Page, value: string) {
    const box = page.getByPlaceholder('搜索字体名称 / 预览内容');
    await box.fill(value);
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/font/pageList');
    await box.press('Enter');
    expect((await (await response).json()).code).toBe(200);
}
async function upload(page: Page, names: string[]) {
    await top(page).getByRole('button', {name: '上传字体'}).click();
    await uploadDialog(page).locator('input[type=file]').setInputFiles(names.map(name => ({name: `${name}.ttf`, mimeType: 'font/ttf', buffer: fontData})));
    await expect(uploadDialog(page).getByText(`已选择 ${names.length} 个字体文件`)).toBeVisible();
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/font/upload').then(r => r.json());
    await uploadDialog(page).getByRole('button', {name: '上传字体'}).click();
    expect(await response).toMatchObject({code: 200, data: true});
    await expect(uploadDialog(page)).toHaveCount(0);
}

test('真实上传、字体加载、改名、取消及删除，数据库与静态文件一致', async ({page}) => {
    const name = `e2e_font_${Date.now()}`;
    const renamed = `${name}_renamed`;
    await login(page);
    await expect(page.getByText('暂无字体')).toBeVisible();
    await top(page).getByRole('button', {name: '删除', exact: true}).click();
    await expect(page.getByText('请选择要删除的字体')).toBeVisible();
    await top(page).getByRole('button', {name: '上传字体'}).click();
    const input = uploadDialog(page).locator('input[type=file]');
    await input.setInputFiles({name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from('invalid')});
    await expect(page.getByText('请上传字体文件')).toBeVisible();
    await expect(uploadDialog(page).getByRole('button', {name: '上传字体'})).toBeDisabled();
    await uploadDialog(page).getByRole('button', {name: '取消'}).click();
    await upload(page, [name]);
    await expect(card(page, name)).toBeVisible();
    const rows = sql(`SELECT id,name,url,deleted FROM font WHERE name='${name}'`);
    const [id, savedName, url, deleted] = rows.split('\t');
    expect(id).toMatch(/^\d+$/); expect(savedName).toBe(name); expect(deleted).toBe('0');
    expect(url).toBeTruthy();
    await expect.poll(() => page.evaluate(family => [...document.fonts].some(f => f.family === family && f.status === 'loaded'), name)).toBe(true);
    const staticResponse = await page.request.get(`/static/font/${encodeURIComponent(url)}`);
    expect(staticResponse.status()).toBe(200);
    expect((await staticResponse.body()).equals(fontData)).toBe(true);
    await search(page, 'e2e_no_such_font');
    await expect(page.getByText('暂无字体')).toBeVisible();
    await search(page, '');
    await expect(card(page, name)).toBeVisible();
    await card(page, name).getByRole('button', {name: '编辑'}).click();
    await page.getByRole('dialog').last().getByPlaceholder('请输入字体名称').fill(renamed);
    await page.getByRole('dialog').last().getByRole('button', {name: '取消'}).click();
    expect(sql(`SELECT name FROM font WHERE id=${id} AND deleted=0`)).toBe(name);
    await card(page, name).getByRole('button', {name: '编辑'}).click();
    await page.getByRole('dialog').last().getByPlaceholder('请输入字体名称').fill(renamed);
    const update = page.waitForResponse(r => new URL(r.url()).pathname === '/api/font/update');
    await page.getByRole('dialog').last().getByRole('button', {name: '确定'}).click();
    expect(await (await update).json()).toMatchObject({code: 200, data: true});
    await expect(card(page, renamed)).toBeVisible();
    expect(sql(`SELECT name FROM font WHERE id=${id} AND deleted=0`)).toBe(renamed);
    await page.reload(); await search(page, renamed); await expect(card(page, renamed)).toBeVisible();
    await card(page, renamed).getByRole('button', {name: '删除'}).click();
    await page.getByRole('dialog').last().getByRole('button', {name: '取消'}).click();
    expect(sql(`SELECT deleted FROM font WHERE id=${id}`)).toBe('0');
    await card(page, renamed).getByRole('button', {name: '删除'}).click();
    const del = page.waitForResponse(r => new URL(r.url()).pathname === '/api/font/batchDel');
    await page.getByRole('dialog').last().getByRole('button', {name: '确定'}).click();
    expect(await (await del).json()).toMatchObject({code: 200, data: true});
    await expect(card(page, renamed)).toHaveCount(0);
    expect(sql(`SELECT deleted FROM font WHERE id=${id}`)).toBe('1');
});

test('真实搜索翻页保留筛选、批量删除及窄屏上传', async ({page}) => {
    const marker = `e2e_page_${Date.now()}`;
    const names = Array.from({length: 13}, (_, i) => `${marker}_${String(i + 1).padStart(2, '0')}`);
    const unrelated = `e2e_other_${Date.now()}`;
    await login(page);
    for (let i = 0; i < names.length; i += 2) await upload(page, names.slice(i, i + 2));
    await upload(page, [unrelated]);
    expect(sql(`SELECT COUNT(*) FROM font WHERE name LIKE '${marker}%' AND deleted=0`)).toBe('13');
    await search(page, `  ${marker}  `);
    await expect(page.locator('.datavisool-pagination-total')).toContainText('共 13 条');
    await expect(page.locator('article')).toHaveCount(12);
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/font/pageList' && r.request().postDataJSON().current === 2);
    await page.locator('.datavisool-pagination-item').filter({hasText: /^2$/}).click();
    const second = await response;
    expect(second.request().postDataJSON()).toMatchObject({current: 2, size: 12, searchValue: marker});
    expect((await second.json()).data.total).toBe(13);
    await expect(page.locator('article')).toHaveCount(1);
    await expect(page.getByRole('heading', {name: unrelated, exact: true})).toHaveCount(0);
    await page.locator('.datavisool-pagination-item').filter({hasText: /^1$/}).click();
    await expect(page.locator('article')).toHaveCount(12);
    await card(page, names[0]).click();
    await card(page, names[1]).locator('.datavisool-checkbox-control').click();
    await top(page).getByRole('button', {name: '删除', exact: true}).click();
    await page.getByRole('dialog').last().getByRole('button', {name: '取消'}).click();
    expect(sql(`SELECT COUNT(*) FROM font WHERE name IN ('${names[0]}','${names[1]}') AND deleted=0`)).toBe('2');
    await top(page).getByRole('button', {name: '删除', exact: true}).click();
    const del = page.waitForResponse(r => new URL(r.url()).pathname === '/api/font/batchDel');
    await page.getByRole('dialog').last().getByRole('button', {name: '确定'}).click();
    expect(await (await del).json()).toMatchObject({code: 200, data: true});
    await expect(card(page, names[0])).toHaveCount(0);
    await expect(card(page, names[1])).toHaveCount(0);
    expect(sql(`SELECT COUNT(*) FROM font WHERE name IN ('${names[0]}','${names[1]}') AND deleted=1`)).toBe('2');
    await expect(page.locator('.datavisool-pagination-total')).toContainText('共 11 条');
    await page.setViewportSize({width: 390, height: 900});
    await top(page).getByRole('button', {name: '上传字体'}).click();
    const rect = await uploadDialog(page).boundingBox();
    expect(rect!.x).toBeGreaterThanOrEqual(0);
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(391);
    await expect(uploadDialog(page).getByRole('button', {name: '取消'})).toBeVisible();
    await uploadDialog(page).getByRole('button', {name: '取消'}).click();
});
