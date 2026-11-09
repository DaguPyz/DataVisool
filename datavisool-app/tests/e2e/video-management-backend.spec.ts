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
    && /^datavisool_video_test_[a-z0-9_]+$/.test(db)
    && /^datavisool-video-e2e-[a-z0-9-]+$/.test(container);
const video = readFileSync(resolve(process.cwd(), '../测试资源/录屏2026-10-29 14.05.48.mov'));
test.use({trace: 'off', screenshot: 'off', video: 'off'});
test.setTimeout(90_000);
test.skip(!enabled, '需要本机隔离后端、视频专用 MySQL 容器和测试库、账号及隔离写入开关');
function sql(query: string) {
    if (!enabled) throw new Error('只允许访问视频管理隔离测试数据库');
    return execFileSync('docker', ['exec', '-e', `MYSQL_PWD=${dbPassword}`, container, 'mysql', '-uroot', '--batch', '--skip-column-names', db, '-e', query], {encoding: 'utf8'}).trim();
}
const header = (page: Page) => page.locator('header').filter({has: page.getByRole('heading', {name: '视频资源管理', exact: true})});
const card = (page: Page, name: string) => page.locator('article').filter({has: page.getByRole('heading', {name, exact: true})});
const modal = (page: Page) => page.locator('.datavisool-dialog:visible');
const confirm = (page: Page) => page.getByRole('dialog').last();
async function login(page: Page) {
    await page.addInitScript(() => localStorage.setItem('datavisool-i18n-locale', 'zh-CN'));
    await page.goto('/login'); await page.getByLabel('用户名').fill(username); await page.getByLabel('密码').fill(password);
    await page.getByRole('button', {name: '登录', exact: true}).click(); await expect(page).toHaveURL(/\/home\/console$/);
    const token = await page.evaluate(() => JSON.parse(localStorage.getItem('DATAVISOOL_USER_INFO') || '{}').token as string);
    await page.goto('/home/videoResource'); await expect(page.getByRole('heading', {name: '视频资源管理', exact: true})).toBeVisible();
    return {Authorization: `Bearer ${token}`};
}
async function seed(page: Page, headers: Record<string, string>, names: string[]) {
    for (const name of names) {
        const response = await page.request.post('/api/video/upload', {headers, multipart: {files: {name, mimeType: 'video/quicktime', buffer: video}}});
        const data = await response.json(); expect(data.code).toBe(200); expect(data.data).toHaveLength(1);
    }
}
async function refresh(page: Page) { await page.reload(); await expect(page.getByRole('heading', {name: '视频资源管理', exact: true})).toBeVisible(); }
async function search(page: Page, value: string) {
    const input = page.getByPlaceholder('搜索视频名称'); await input.fill(value);
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/video/page');
    await input.press('Enter'); return await response;
}
async function openUpload(page: Page) { await header(page).getByRole('button', {name: '上传', exact: true}).click(); await expect(modal(page)).toBeVisible(); }
async function openMenu(page: Page, name: string, action: string) {
    await card(page, name).getByRole('button', {name: '更多操作'}).click();
    await page.getByRole('menuitem', {name: action, exact: true}).click();
}
async function clickConfirm(page: Page, action: string) { await confirm(page).getByRole('button', {name: action, exact: true}).click(); }

test.beforeEach(async () => { sql('DELETE FROM video WHERE user_id=1'); });

for (const width of [1440, 1024, 700, 390]) test(`页面及上传窗口布局 ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height: 900}); await page.emulateMedia({reducedMotion: 'reduce'});
    const headers = await login(page); await seed(page, headers, ['layout-video.mov']); await refresh(page);
    await expect(card(page, 'layout-video.mov')).toBeVisible();
    await expect(header(page).getByPlaceholder('搜索视频名称')).toBeVisible();
    const dim = await page.evaluate(() => ({scroll: document.documentElement.scrollWidth, width: innerWidth}));
    expect(dim.scroll).toBeLessThanOrEqual(dim.width);
    await page.screenshot({path: `../测试报告/视频管理/视频管理-${width}.png`, animations: 'disabled'});
    await openUpload(page);
    await expect(modal(page).getByText('点击或拖拽视频文件上传')).toBeVisible();
    if (width === 390) await page.screenshot({path: '../测试报告/视频管理/视频管理-390-上传.png', animations: 'disabled'});
    const rect = await modal(page).boundingBox();
    expect(rect!.x).toBeGreaterThanOrEqual(0); expect(rect!.x + rect!.width).toBeLessThanOrEqual(width + 1);
    await expect(modal(page).getByRole('button', {name: '取消'})).toBeInViewport();
});

test('空状态、选择上限、移除及取消重置', async ({page}) => {
    await login(page); await expect(page.getByText('暂无视频资源')).toBeVisible();
    await header(page).getByRole('button', {name: '删除', exact: true}).click(); await expect(page.getByText('请选择要删除的视频')).toBeVisible();
    await page.getByRole('button', {name: '上传', exact: true}).last().click();
    const input = modal(page).locator('input[type=file]'); await expect(input).toHaveAttribute('accept', 'video/*');
    await expect(modal(page).getByRole('button', {name: '上传', exact: true})).toBeDisabled();
    const files = Array.from({length: 11}, (_, i) => ({name: `item-${i}.mov`, mimeType: 'video/quicktime', buffer: Buffer.from('x')}));
    await input.setInputFiles(files); await expect(modal(page).locator('.datavisool-upload-list-item')).toHaveCount(10);
    await expect(modal(page).getByText('item-10.mov')).toHaveCount(0);
    await modal(page).getByRole('button', {name: '移除 item-0.mov', exact: true}).click();
    await expect(modal(page).locator('.datavisool-upload-list-item')).toHaveCount(9);
    await modal(page).getByRole('button', {name: '取消'}).click(); await openUpload(page);
    await expect(modal(page).locator('.datavisool-upload-list-item')).toHaveCount(0);
    expect(sql('SELECT COUNT(*) FROM video WHERE deleted=0')).toBe('0');
});

test('真实视频上传、静态内容、名称大小和格式显示', async ({page}) => {
    await login(page); await openUpload(page);
    await modal(page).locator('input[type=file]').setInputFiles({name: 'actual-video.mov', mimeType: 'video/quicktime', buffer: video});
    const result = page.waitForResponse(r => new URL(r.url()).pathname === '/api/video/upload');
    await modal(page).getByRole('button', {name: '上传', exact: true}).click();
    const data = await (await result).json(); expect(data.code).toBe(200); expect(data.data).toHaveLength(1);
    await expect(modal(page)).toHaveCount(0); await expect(card(page, 'actual-video.mov')).toBeVisible();
    await expect(card(page, 'actual-video.mov')).toContainText('MOV'); await expect(card(page, 'actual-video.mov')).toContainText('0.55 MB');
    const [id, name, fileName, size, type] = sql("SELECT id,name,url,size,type FROM video WHERE name='actual-video.mov' AND deleted=0").split('\t');
    expect(id).toMatch(/^\d+$/); expect(name).toBe('actual-video.mov'); expect(Number(size)).toBe(video.length); expect(type).toBe('video/quicktime');
    const file = await page.request.get(`/static/videos/${encodeURIComponent(fileName)}`); expect(file.status()).toBe(200); expect((await file.body()).equals(video)).toBe(true);
});

test('拖拽视频并上传', async ({page}) => {
    await login(page); await openUpload(page);
    const bytes = Array.from(video);
    const data = await page.evaluateHandle(values => { const d = new DataTransfer(); d.items.add(new File([new Uint8Array(values)], 'drag.mov', {type: 'video/quicktime'})); return d; }, bytes);
    await modal(page).getByRole('button', {name: /点击或拖拽视频文件上传/}).dispatchEvent('drop', {dataTransfer: data});
    await expect(modal(page).getByText('drag.mov')).toBeVisible();
    const result = page.waitForResponse(r => new URL(r.url()).pathname === '/api/video/upload');
    await modal(page).getByRole('button', {name: '上传', exact: true}).click(); expect((await (await result).json()).code).toBe(200);
    await expect(card(page, 'drag.mov')).toBeVisible(); expect(sql("SELECT COUNT(*) FROM video WHERE name='drag.mov' AND deleted=0")).toBe('1');
});

test('重命名取消、保存和单项删除', async ({page}) => {
    const headers = await login(page); await seed(page, headers, ['rename.mov']); await refresh(page);
    const id = sql("SELECT id FROM video WHERE name='rename.mov'");
    await openMenu(page, 'rename.mov', '重命名');
    await confirm(page).getByPlaceholder('请输入新的视频名称').fill(' cancel.mov '); await clickConfirm(page, '取消');
    expect(sql(`SELECT name FROM video WHERE id=${id}`)).toBe('rename.mov');
    await openMenu(page, 'rename.mov', '重命名'); await confirm(page).getByPlaceholder('请输入新的视频名称').fill('  renamed.mov  ');
    const update = page.waitForResponse(r => new URL(r.url()).pathname === '/api/video/update');
    await clickConfirm(page, '确定'); expect(await (await update).json()).toMatchObject({code: 200, data: true});
    await expect(card(page, 'renamed.mov')).toBeVisible(); expect(sql(`SELECT name FROM video WHERE id=${id}`)).toBe('renamed.mov');
    await refresh(page); await expect(card(page, 'renamed.mov')).toBeVisible();
    await openMenu(page, 'renamed.mov', '删除'); await clickConfirm(page, '取消'); expect(sql(`SELECT deleted FROM video WHERE id=${id}`)).toBe('0');
    await openMenu(page, 'renamed.mov', '删除');
    const del = page.waitForResponse(r => new URL(r.url()).pathname === '/api/video/batchDelete');
    await clickConfirm(page, '确定'); expect(await (await del).json()).toMatchObject({code: 200, data: true});
    await expect(card(page, 'renamed.mov')).toHaveCount(0); expect(sql(`SELECT deleted FROM video WHERE id=${id}`)).toBe('1');
});

test('复制资源链接', async ({page, context}) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {origin: 'http://127.0.0.1:4179'});
    const headers = await login(page); await seed(page, headers, ['copy.mov']); await refresh(page);
    const file = sql("SELECT url FROM video WHERE name='copy.mov'");
    await openMenu(page, 'copy.mov', '复制链接');
    await expect(page.getByText('链接已复制')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`http://127.0.0.1:4179/static/videos/${file}`);
});

test('点击视频卡片可预览播放', async ({page}) => {
    const headers = await login(page); await seed(page, headers, ['play.mov']); await refresh(page);
    await card(page, 'play.mov').click();
    await expect(page.getByRole('dialog', {name: '预览视频 play.mov'})).toBeVisible();
    await expect(page.locator('video')).toBeVisible();
    await expect(page.locator('video')).toHaveAttribute('src', /\/static\/videos\//);
    await expect(page.locator('video')).toHaveAttribute('controls', '');
    await expect.poll(() => page.locator('video').evaluate(element => element.readyState)).toBeGreaterThan(0);
    await page.locator('video').evaluate(element => element.play());
    await expect.poll(() => page.locator('video').evaluate(element => element.currentTime)).toBeGreaterThan(0);
    await page.screenshot({path: '../测试报告/视频管理/视频管理-点击卡片.png', animations: 'disabled'});
    await page.locator('.datavisool-dialog:visible').getByRole('button', {name: '关闭'}).click();
    await expect(page.locator('video')).toHaveCount(0);
});

test('搜索、普通分页、无结果和清空', async ({page}) => {
    const headers = await login(page); await seed(page, headers, Array.from({length: 11}, (_, i) => `ordinary-${String(i).padStart(2, '0')}.mov`)); await refresh(page);
    await expect(page.locator('article')).toHaveCount(10);
    await page.locator('.datavisool-pagination-item').filter({hasText: /^2$/}).click(); await expect(page.locator('article')).toHaveCount(1);
    const response = await search(page, '  ordinary-00  ');
    expect(response.request().postDataJSON()).toMatchObject({current: 1, size: 10, searchValue: 'ordinary-00'});
    await expect(card(page, 'ordinary-00.mov')).toBeVisible(); await expect(page.locator('article')).toHaveCount(1);
    await search(page, 'not-present'); await expect(page.getByText('暂无视频资源')).toBeVisible();
    await search(page, ''); await expect(page.locator('article')).toHaveCount(10);
});

test('搜索后翻页保留筛选条件', async ({page}) => {
    const headers = await login(page); await seed(page, headers, [...Array.from({length: 11}, (_, i) => `target-${String(i).padStart(2, '0')}.mov`), 'unrelated.mov']); await refresh(page);
    await search(page, 'target-'); await expect(page.locator('.datavisool-pagination-total')).toContainText('共 11 条');
    const next = page.waitForResponse(r => new URL(r.url()).pathname === '/api/video/page' && r.request().postDataJSON().current === 2);
    await page.locator('.datavisool-pagination-item').filter({hasText: /^2$/}).click(); const response = await next;
    expect.soft(response.request().postDataJSON().searchValue).toBe('target-');
    expect.soft((await response.json()).data.total).toBe(11);
    await expect.soft(page.locator('article')).toHaveCount(1);
});

test('批量选择、取消及确认删除', async ({page}) => {
    const headers = await login(page); await seed(page, headers, ['batch-a.mov', 'batch-b.mov']); await refresh(page);
    await header(page).getByRole('button', {name: '删除', exact: true}).click(); await expect(page.getByText('请选择要删除的视频')).toBeVisible();
    await card(page, 'batch-a.mov').getByRole('checkbox').click(); await card(page, 'batch-b.mov').getByRole('checkbox').click();
    await expect(card(page, 'batch-a.mov').getByRole('checkbox')).toBeChecked();
    await expect(card(page, 'batch-b.mov').getByRole('checkbox')).toBeChecked();
    await header(page).getByRole('button', {name: '删除', exact: true}).click(); await clickConfirm(page, '取消');
    expect(sql('SELECT COUNT(*) FROM video WHERE deleted=0')).toBe('2');
    await header(page).getByRole('button', {name: '删除', exact: true}).click();
    const result = page.waitForResponse(r => new URL(r.url()).pathname === '/api/video/batchDelete');
    await clickConfirm(page, '确定'); expect((await (await result).json()).data).toBe(true);
    await expect(page.getByText('暂无视频资源')).toBeVisible(); expect(sql('SELECT COUNT(*) FROM video WHERE deleted=1')).toBe('2');
});

test('删除末页唯一记录后回到有效页面', async ({page}) => {
    const headers = await login(page); await seed(page, headers, Array.from({length: 11}, (_, i) => `last-${String(i).padStart(2, '0')}.mov`)); await refresh(page);
    await page.locator('.datavisool-pagination-item').filter({hasText: /^2$/}).click(); await expect(page.locator('article')).toHaveCount(1);
    await page.locator('article').first().getByRole('button', {name: '更多操作'}).click(); await page.getByRole('menuitem', {name: '删除', exact: true}).click();
    const result = page.waitForResponse(r => new URL(r.url()).pathname === '/api/video/batchDelete');
    await clickConfirm(page, '确定'); expect((await (await result).json()).data).toBe(true);
    await expect(page.locator('.datavisool-pagination-total')).toContainText('共 10 条'); expect(sql('SELECT COUNT(*) FROM video WHERE deleted=0')).toBe('10');
    await expect(page.locator('article')).toHaveCount(10);
});

test('非视频文件应在选择时拒绝', async ({page}) => {
    await login(page); await openUpload(page);
    const dropped = await page.evaluateHandle(() => {const d = new DataTransfer(); d.items.add(new File(['invalid'], 'not-video.txt', {type: 'text/plain'})); return d;});
    await modal(page).locator('.datavisool-upload-dragger').dispatchEvent('drop', {dataTransfer: dropped});
    await expect(page.getByText('请选择支持的视频文件')).toBeVisible();
    await expect(modal(page).getByText('not-video.txt')).toHaveCount(0);
    await expect(modal(page).getByRole('button', {name: '上传', exact: true})).toBeDisabled();
});

test('直接提交非视频文件会被真实后端拒绝', async ({page}) => {
    const headers = await login(page);
    const response = await page.request.post('/api/video/upload', {headers, multipart: {files: {name: 'not-video.txt', mimeType: 'text/plain', buffer: Buffer.from('invalid')}}});
    expect((await response.json()).code).not.toBe(200);
    expect(sql('SELECT COUNT(*) FROM video WHERE deleted=0')).toBe('0');
});

test('上传业务失败保留文件并可真实重试', async ({page}) => {
    await login(page); let fail = true;
    await page.route('**/api/video/upload', async route => {if (fail) {fail = false; await route.fulfill({json: {code: 500, msg: '模拟上传失败', data: null}});} else await route.continue();});
    await openUpload(page); await modal(page).locator('input[type=file]').setInputFiles({name: 'retry.mov', mimeType: 'video/quicktime', buffer: video});
    await modal(page).getByRole('button', {name: '上传', exact: true}).click(); await expect(page.getByText('模拟上传失败')).toBeVisible();
    await expect(modal(page).getByText('retry.mov')).toBeVisible(); expect(sql('SELECT COUNT(*) FROM video WHERE deleted=0')).toBe('0');
    const result = page.waitForResponse(r => new URL(r.url()).pathname === '/api/video/upload');
    await modal(page).getByRole('button', {name: '上传', exact: true}).click(); expect((await (await result).json()).code).toBe(200);
    await expect(card(page, 'retry.mov')).toBeVisible(); expect(sql("SELECT COUNT(*) FROM video WHERE name='retry.mov' AND deleted=0")).toBe('1');
});

test('重命名业务失败不应显示成功', async ({page}) => {
    const headers = await login(page); await seed(page, headers, ['rename-fail.mov']); await refresh(page);
    await page.route('**/api/video/update', route => route.fulfill({json: {code: 500, msg: '模拟重命名失败', data: null}}));
    await openMenu(page, 'rename-fail.mov', '重命名'); await confirm(page).getByPlaceholder('请输入新的视频名称').fill('should-not-save.mov');
    await page.evaluate(() => {
        (window as any).__videoMessages = [];
        new MutationObserver(() => {
            for (const message of document.querySelectorAll('.datavisool-global-message-content')) {
                (window as any).__videoMessages.push(message.textContent);
            }
        }).observe(document.body, {childList: true, subtree: true});
    });
    await clickConfirm(page, '确定'); await expect(page.getByText('模拟重命名失败')).toBeVisible();
    await page.waitForTimeout(1000);
    await page.screenshot({path: '../测试报告/视频管理/视频管理-重命名失败.png', animations: 'disabled'});
    expect(sql("SELECT COUNT(*) FROM video WHERE name='rename-fail.mov' AND deleted=0")).toBe('1');
    expect(await page.evaluate(() => (window as any).__videoMessages)).not.toContain('重命名成功');
});

test('上传接口返回异常成功值不应关闭窗口', async ({page}) => {
    await login(page); await page.route('**/api/video/upload', route => route.fulfill({json: {code: 200, msg: '成功', data: false}}));
    await openUpload(page); await modal(page).locator('input[type=file]').setInputFiles({name: 'false.mov', mimeType: 'video/quicktime', buffer: video});
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/video/upload');
    await modal(page).getByRole('button', {name: '上传', exact: true}).click(); await response;
    await expect(page.getByText('上传失败')).toBeVisible();
    await expect(page.getByText('上传成功')).toHaveCount(0); await expect(modal(page).getByText('false.mov')).toBeVisible();
    expect(sql('SELECT COUNT(*) FROM video WHERE deleted=0')).toBe('0');
});

test('上传中禁止取消和重复提交', async ({page}) => {
    await login(page); let release!: () => void; const waiting = new Promise<void>(resolve => {release = resolve;}); let sent = 0;
    await page.route('**/api/video/upload', async route => {sent++; await waiting; await route.continue();});
    await openUpload(page); await modal(page).locator('input[type=file]').setInputFiles({name: 'slow.mov', mimeType: 'video/quicktime', buffer: video});
    try {
        await modal(page).getByRole('button', {name: '上传', exact: true}).click();
        await expect.poll(() => sent).toBe(1);
        await expect(modal(page).getByRole('button', {name: '取消'})).toBeDisabled();
        await expect(modal(page).getByRole('button', {name: '上传中...'})).toBeDisabled();
    } finally { release(); }
    await expect(card(page, 'slow.mov')).toBeVisible();
    expect(sql("SELECT COUNT(*) FROM video WHERE name='slow.mov' AND deleted=0")).toBe('1');
});

test('选择两个真实视频并批量上传', async ({page}) => {
    await login(page); await openUpload(page);
    await modal(page).locator('input[type=file]').setInputFiles(['multi-a.mov', 'multi-b.mov'].map(name => ({name, mimeType: 'video/quicktime', buffer: video})));
    await expect(modal(page).locator('.datavisool-upload-list-item')).toHaveCount(2);
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/video/upload');
    await modal(page).getByRole('button', {name: '上传', exact: true}).click();
    const body = await (await response).json(); expect(body.code).toBe(200); expect(body.data).toHaveLength(2);
    await expect(card(page, 'multi-a.mov')).toBeVisible(); await expect(card(page, 'multi-b.mov')).toBeVisible();
    expect(sql("SELECT COUNT(*) FROM video WHERE name IN ('multi-a.mov','multi-b.mov') AND deleted=0")).toBe('2');
});

test('重命名空白时提示并保留输入', async ({page}) => {
    const headers = await login(page); await seed(page, headers, ['blank-name.mov']); await refresh(page);
    await openMenu(page, 'blank-name.mov', '重命名');
    await confirm(page).getByPlaceholder('请输入新的视频名称').fill('   '); await clickConfirm(page, '确定');
    await expect(confirm(page).getByPlaceholder('请输入新的视频名称')).toBeVisible();
    expect(sql("SELECT COUNT(*) FROM video WHERE name='blank-name.mov' AND deleted=0")).toBe('1');
});

test('空视频文件在页面选择和直接提交时均被拒绝', async ({page}) => {
    const headers = await login(page); await openUpload(page);
    await modal(page).locator('input[type=file]').setInputFiles({name: 'empty.mov', mimeType: 'video/quicktime', buffer: Buffer.alloc(0)});
    await expect(page.getByText('视频文件不能为空')).toBeVisible();
    await expect(modal(page).getByText('empty.mov')).toHaveCount(0);
    await expect(modal(page).getByRole('button', {name: '上传', exact: true})).toBeDisabled();
    const response = await page.request.post('/api/video/upload', {headers, multipart: {files: {name: 'empty.mov', mimeType: 'video/quicktime', buffer: Buffer.alloc(0)}}});
    expect((await response.json()).code).not.toBe(200);
    expect(sql('SELECT COUNT(*) FROM video WHERE deleted=0')).toBe('0');
});

test('真实接口拒绝空白视频名称', async ({page}) => {
    const headers = await login(page); await seed(page, headers, ['valid-name.mov']);
    const id = sql("SELECT id FROM video WHERE name='valid-name.mov'");
    for (const name of ['', '   ', '\u00a0\u00a0']) {
        const response = await page.request.post('/api/video/update', {headers, data: {id, name}});
        expect((await response.json()).code).not.toBe(200);
    }
    expect(sql(`SELECT name FROM video WHERE id=${id}`)).toBe('valid-name.mov');
});

test('小屏幕预览可关闭且不改变多选', async ({page}) => {
    await page.setViewportSize({width: 390, height: 844});
    const headers = await login(page); await seed(page, headers, ['mobile-preview.mov']); await refresh(page);
    const item = card(page, 'mobile-preview.mov');
    await item.getByRole('checkbox').click(); await expect(item.getByRole('checkbox')).toBeChecked();
    await item.getByRole('button', {name: '预览视频 mobile-preview.mov'}).click();
    await expect(page.locator('video')).toBeVisible();
    const close = page.getByRole('dialog', {name: '预览视频 mobile-preview.mov'}).getByRole('button', {name: '关闭'});
    await expect(close).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('video')).toBeFocused();
    const bounds = await page.locator('.datavisool-dialog:visible').boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(391);
    await page.screenshot({path: '../测试报告/视频管理/视频管理-390-预览.png', animations: 'disabled'});
    await page.keyboard.press('Escape'); await expect(page.locator('video')).toHaveCount(0);
    await expect(item.getByRole('checkbox')).toBeChecked();
    await expect(item.getByRole('button', {name: '预览视频 mobile-preview.mov'})).toBeFocused();
});

test('视频资源加载失败时显示提示并可关闭', async ({page}) => {
    const headers = await login(page); await seed(page, headers, ['unavailable.mov']); await refresh(page);
    await page.route('**/static/videos/**', route => route.fulfill({status: 404}));
    await card(page, 'unavailable.mov').getByRole('button', {name: '预览视频 unavailable.mov'}).click();
    await expect(page.getByRole('alert').filter({hasText: '无法播放此视频'})).toBeVisible();
    await page.locator('.datavisool-dialog:visible').getByRole('button', {name: '关闭'}).click();
    await expect(page.locator('video')).toHaveCount(0);
});

test('上传响应为空数组时保留文件并提示失败', async ({page}) => {
    await login(page);
    await page.route('**/api/video/upload', route => route.fulfill({json: {code: 200, msg: '成功', data: []}}));
    await openUpload(page);
    await modal(page).locator('input[type=file]').setInputFiles({name: 'empty-response.mov', mimeType: 'video/quicktime', buffer: video});
    await modal(page).getByRole('button', {name: '上传', exact: true}).click();
    await expect(page.getByText('上传失败')).toBeVisible();
    await expect(modal(page).getByText('empty-response.mov')).toBeVisible();
    expect(sql('SELECT COUNT(*) FROM video WHERE deleted=0')).toBe('0');
});

test('混合空文件的上传整体被后端拒绝', async ({page}) => {
    const headers = await login(page);
    const response = await page.evaluate(async authorization => {
        const form = new FormData();
        form.append('files', new File(['nonempty'], 'nonempty.mov', {type: 'video/quicktime'}));
        form.append('files', new File([], 'empty.mov', {type: 'video/quicktime'}));
        const result = await fetch('/api/video/upload', {method: 'POST', headers: {Authorization: authorization}, body: form});
        return result.json();
    }, headers.Authorization);
    expect(response.code).not.toBe(200);
    expect(sql('SELECT COUNT(*) FROM video WHERE deleted=0')).toBe('0');
});

test('重命名返回 false 时保留输入并提示失败', async ({page}) => {
    const headers = await login(page); await seed(page, headers, ['false-rename.mov']); await refresh(page);
    await page.route('**/api/video/update', route => route.fulfill({json: {code: 200, msg: '成功', data: false}}));
    await openMenu(page, 'false-rename.mov', '重命名');
    await confirm(page).getByPlaceholder('请输入新的视频名称').fill('attempt.mov');
    await clickConfirm(page, '确定');
    await expect(page.getByText('重命名失败')).toBeVisible();
    await expect(confirm(page).getByPlaceholder('请输入新的视频名称')).toHaveValue('attempt.mov');
    expect(sql("SELECT COUNT(*) FROM video WHERE name='false-rename.mov' AND deleted=0")).toBe('1');
});

test('筛选结果删除末页后仍保留筛选并回到有效页', async ({page}) => {
    const headers = await login(page);
    await seed(page, headers, [...Array.from({length: 11}, (_, i) => `filtered-${String(i).padStart(2, '0')}.mov`), 'unrelated.mov']);
    await refresh(page); await search(page, 'filtered-');
    await expect(page.locator('.datavisool-pagination-total')).toContainText('共 11 条');
    await page.locator('.datavisool-pagination-item').filter({hasText: /^2$/}).click();
    await expect(page.locator('article')).toHaveCount(1);
    await page.locator('article').first().getByRole('button', {name: '更多操作'}).click();
    await page.getByRole('menuitem', {name: '删除', exact: true}).click();
    await clickConfirm(page, '确定');
    await expect(page.locator('.datavisool-pagination-total')).toContainText('共 10 条');
    await expect(page.locator('article')).toHaveCount(10);
    await expect(card(page, 'unrelated.mov')).toHaveCount(0);
    expect(sql("SELECT COUNT(*) FROM video WHERE name LIKE 'filtered-%' AND deleted=0")).toBe('10');
});

test('支持浏览器上报的常见视频类型并拒绝伪装文本', async ({page}) => {
    await login(page); await openUpload(page);
    const input = modal(page).locator('input[type=file]');
    await input.setInputFiles([
        {name: 'movie.mkv', mimeType: 'application/x-matroska', buffer: Buffer.from('valid')},
        {name: 'movie.avi', mimeType: '', buffer: Buffer.from('valid')},
        {name: 'disguised.mp4', mimeType: 'text/plain', buffer: Buffer.from('invalid')},
    ]);
    await expect(page.getByText('请选择支持的视频文件')).toBeVisible();
    await expect(modal(page).getByText('movie.mkv')).toBeVisible();
    await expect(modal(page).getByText('movie.avi')).toBeVisible();
    await expect(modal(page).getByText('disguised.mp4')).toHaveCount(0);
});
