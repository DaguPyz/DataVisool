/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {expect, test, type Page, type Route} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

type Font = {id: string; name: string; url?: string};
type Call = {path: string; body: any; authorization?: string};
const fixture = resolve(process.cwd(), '../测试资源/bea6c59f2bcb4a4e8e0bdb8a89c64e1f.ttf');
const sample = (): Font[] => Array.from({length: 15}, (_, i) => ({id: String(i + 1), name: `测试字体${String(i + 1).padStart(2, '0')}`}));
const card = (page: Page, name: string) => page.locator('article').filter({has: page.getByRole('heading', {name, exact: true})});
const dialog = (page: Page) => page.locator('.datavisool-dialog:visible');
const header = (page: Page) => page.locator('header').filter({has: page.getByRole('heading', {name: '字体管理', exact: true})});

async function setup(page: Page, options: {fonts?: Font[]; handler?: (route: Route, path: string) => Promise<boolean>} = {}) {
    let fonts = options.fonts ?? sample();
    const calls: Call[] = [];
    await page.addInitScript(() => {
        localStorage.setItem('datavisool-i18n-locale', 'zh-CN');
        localStorage.setItem('DATAVISOOL_USER_INFO', JSON.stringify({id: 'test-user', name: '测试用户', username: 'tester', token: 'test-token', roles: ['ROLE_SYSTEM_ADMIN']}));
    });
    await page.route('**/static/logo/**', route => route.fulfill({status: 404}));
    await page.route('**/static/font/fixture.ttf', route => route.fulfill({status: 200, contentType: 'font/ttf', body: readFileSync(fixture)}));
    await page.route('**/api/**', async route => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        if (!path.startsWith('/api/')) return route.continue();
        let body: any = null;
        if (request.headers()['content-type']?.includes('application/json')) body = request.postDataJSON();
        calls.push({path, body, authorization: request.headers().authorization});
        if (options.handler && await options.handler(route, path)) return;
        let data: any = {total: 0, records: []};
        if (path === '/api/font/pageList') {
            const current = body.current, size = body.size;
            const filtered = fonts.filter(font => !body.searchValue || font.name.includes(body.searchValue));
            data = {current, size, total: filtered.length, records: filtered.slice((current - 1) * size, current * size)};
        } else if (path === '/api/font/update') { fonts = fonts.map(font => font.id === body.id ? {...font, name: body.name} : font); data = true; }
        else if (path === '/api/font/batchDel') { fonts = fonts.filter(font => !body.includes(font.id)); data = true; }
        await route.fulfill({json: {code: 200, msg: '成功', data}});
    });
    await page.goto('/home/font');
    await expect(page.getByRole('heading', {name: '字体管理', exact: true})).toBeVisible();
    await expect.poll(() => calls.some(call => call.path === '/api/font/pageList')).toBeTruthy();
    return {calls, getFonts: () => fonts};
}
async function openUpload(page: Page) {
    await header(page).getByRole('button', {name: '上传字体'}).click();
    await expect(dialog(page)).toBeVisible();
}
for (const width of [1440, 1024, 700, 390]) {
    test(`布局与上传窗口 ${width}px`, async ({page}) => {
        await page.setViewportSize({width, height: 900});
        await page.emulateMedia({reducedMotion: 'reduce'});
        await setup(page);
        await expect(card(page, '测试字体01')).toBeVisible();
        await expect(header(page).getByPlaceholder('搜索字体名称 / 预览内容')).toBeVisible();
        await expect(header(page).getByRole('button', {name: '上传字体'})).toBeVisible();
        const overflow = await page.evaluate(() => ({page: document.documentElement.scrollWidth, viewport: innerWidth}));
        expect(overflow.page).toBeLessThanOrEqual(overflow.viewport);
        await page.screenshot({path: `../测试报告/字体管理/字体管理-${width}.png`, animations: 'disabled'});
        await openUpload(page);
        await expect(dialog(page).getByText('点击或拖拽字体文件上传')).toBeVisible();
        if (width === 390) await page.screenshot({path: '../测试报告/字体管理/字体管理-390-上传.png', animations: 'disabled'});
        const bounds = await dialog(page).boundingBox();
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
    });
}
test('真实字体文件加载、卡片预览和初始分页请求', async ({page}) => {
    const {calls} = await setup(page, {fonts: [{id: '1', name: '浏览器测试字体', url: '/static/font/fixture.ttf'}]});
    const item = card(page, '浏览器测试字体');
    await expect(item.getByText('已启用')).toBeVisible();
    await expect(item.getByText('字体预览 AaBbCc123')).toBeVisible();
    await expect.poll(() => page.evaluate(() => [...document.fonts].some(font => font.family === '浏览器测试字体' && font.status === 'loaded'))).toBe(true);
    expect(await item.getByText('字体预览 AaBbCc123').evaluate(el => getComputedStyle(el).fontFamily)).toContain('浏览器测试字体');
    expect(calls.find(call => call.path === '/api/font/pageList')).toMatchObject({body: {current: 1, size: 12}, authorization: 'Bearer test-token'});
});
test('空状态、搜索、清空与分页', async ({page}) => {
    const {calls} = await setup(page);
    await expect(page.locator('article')).toHaveCount(12);
    await expect(page.locator('.datavisool-pagination-total')).toContainText('共 15 条');
    await page.locator('.datavisool-pagination-item').filter({hasText: /^2$/}).click();
    await expect(page.locator('article')).toHaveCount(3);
    await expect(card(page, '测试字体13')).toBeVisible();
    const search = page.getByPlaceholder('搜索字体名称 / 预览内容');
    await search.fill('  字体01  '); await search.press('Enter');
    await expect(card(page, '测试字体01')).toBeVisible();
    await expect(page.locator('article')).toHaveCount(1);
    expect(calls.filter(c => c.path === '/api/font/pageList').at(-1)?.body).toMatchObject({current: 1, size: 12, searchValue: '字体01'});
    await search.fill('没有匹配'); await search.press('Enter');
    await expect(page.getByText('暂无字体')).toBeVisible();
    await page.getByRole('button', {name: '上传字体', exact: true}).last().click();
    await expect(dialog(page)).toBeVisible();
    await dialog(page).getByRole('button', {name: '取消'}).click();
    await search.fill(''); await search.press('Enter');
    await expect(page.locator('article')).toHaveCount(12);
});
test('上传选择、扩展名校验、数量限制、移除及取消重置', async ({page}) => {
    await setup(page, {fonts: []}); await openUpload(page);
    const input = dialog(page).locator('input[type=file]');
    await expect(input).toHaveAttribute('accept', '.ttf,.otf,.woff,.woff2,.eot');
    await expect(dialog(page).getByRole('button', {name: '上传字体'})).toBeDisabled();
    await input.setInputFiles({name: '错误.txt', mimeType: 'text/plain', buffer: Buffer.from('x')});
    await expect(page.getByText('请上传字体文件')).toBeVisible();
    const files = ['a.ttf', 'b.otf', 'c.woff', 'd.woff2', 'e.eot', 'f.TTF', 'g.ttf', 'h.ttf', 'i.ttf', 'j.ttf', 'k.ttf'].map(name => ({name, mimeType: 'application/octet-stream', buffer: Buffer.from('x')}));
    await input.setInputFiles(files);
    await expect(dialog(page).getByText('已选择 10 个字体文件')).toBeVisible();
    await expect(page.getByText('最多上传 10 个字体文件')).toBeVisible();
    await expect(dialog(page).locator('li')).toHaveCount(10);
    await expect(dialog(page).getByText('k.ttf')).toHaveCount(0);
    await dialog(page).locator('li').first().getByRole('button', {name: '删除'}).click();
    await expect(dialog(page).getByText('已选择 9 个字体文件')).toBeVisible();
    await dialog(page).getByRole('button', {name: '取消'}).click(); await openUpload(page);
    await expect(dialog(page).locator('li')).toHaveCount(0);
});
test('拖拽文件并成功上传，提交 multipart 与凭据', async ({page}) => {
    let upload = '';
    const {calls} = await setup(page, {fonts: [], handler: async (route, path) => {
        if (path !== '/api/font/upload') return false;
        upload = route.request().postData() || '';
        await route.fulfill({json: {code: 200, msg: '成功', data: true}}); return true;
    }});
    await openUpload(page);
    const drop = dialog(page).getByRole('button').filter({hasText: '点击或拖拽字体文件上传'});
    const dt = await page.evaluateHandle(() => {const d = new DataTransfer(); d.items.add(new File(['font-data'], '拖拽.ttf', {type: 'font/ttf'})); return d;});
    await drop.dispatchEvent('drop', {dataTransfer: dt});
    await expect(dialog(page).getByText('拖拽.ttf')).toBeVisible();
    await dialog(page).getByRole('button', {name: '上传字体'}).click();
    await expect(dialog(page)).toHaveCount(0);
    expect(upload).toContain('name="fontFile"'); expect(upload).toContain('font-data');
    expect(calls.find(c => c.path === '/api/font/upload')?.authorization).toBe('Bearer test-token');
    await expect.poll(() => calls.filter(c => c.path === '/api/font/pageList').length).toBe(2);
});
test('上传失败保留文件，可重试', async ({page}) => {
    let attempts = 0;
    await setup(page, {fonts: [], handler: async (route, path) => {
        if (path !== '/api/font/upload') return false;
        attempts++; await route.fulfill({json: attempts === 1 ? {code: 500, msg: '模拟上传失败', data: null} : {code: 200, msg: '成功', data: true}}); return true;
    }});
    await openUpload(page); await dialog(page).locator('input[type=file]').setInputFiles(fixture);
    await dialog(page).getByRole('button', {name: '上传字体'}).click();
    await expect(page.getByText('模拟上传失败')).toBeVisible();
    await expect(dialog(page).locator('li')).toHaveCount(1);
    await dialog(page).getByRole('button', {name: '上传字体'}).click();
    await expect(dialog(page)).toHaveCount(0); expect(attempts).toBe(2);
});
test('编辑取消、保存及单项和批量删除', async ({page}) => {
    const {calls, getFonts} = await setup(page, {fonts: sample().slice(0, 3)});
    await header(page).getByRole('button', {name: '删除', exact: true}).click();
    await expect(page.getByText('请选择要删除的字体')).toBeVisible();
    await card(page, '测试字体01').getByRole('button', {name: '编辑'}).click();
    await expect(page.getByRole('dialog').last().getByPlaceholder('请输入字体名称')).toHaveValue('测试字体01');
    await page.getByRole('dialog').last().getByPlaceholder('请输入字体名称').fill('取消名称');
    await page.getByRole('dialog').last().getByRole('button', {name: '取消'}).click();
    expect(calls.filter(c => c.path === '/api/font/update')).toHaveLength(0);
    await card(page, '测试字体01').getByRole('button', {name: '编辑'}).click();
    await page.getByRole('dialog').last().getByPlaceholder('请输入字体名称').fill('新字体名称');
    await page.getByRole('dialog').last().getByRole('button', {name: '确定'}).click();
    await expect(card(page, '新字体名称')).toBeVisible();
    expect(calls.find(c => c.path === '/api/font/update')?.body).toMatchObject({id: '1', name: '新字体名称'});
    await card(page, '新字体名称').getByRole('button', {name: '删除'}).click();
    await page.getByRole('dialog').last().getByRole('button', {name: '取消'}).click(); expect(getFonts()).toHaveLength(3);
    await card(page, '新字体名称').getByRole('button', {name: '删除'}).click();
    await page.getByRole('dialog').last().getByRole('button', {name: '确定'}).click();
    await expect(card(page, '新字体名称')).toHaveCount(0);
    expect(calls.filter(c => c.path === '/api/font/batchDel').at(-1)?.body).toEqual(['1']);
    await card(page, '测试字体02').click();
    await card(page, '测试字体03').locator('.datavisool-checkbox-control').click();
    await expect(card(page, '测试字体03').getByRole('checkbox')).toBeChecked();
    await header(page).getByRole('button', {name: '删除', exact: true}).click();
    await page.getByRole('dialog').last().getByRole('button', {name: '确定'}).click();
    await expect(page.getByText('暂无字体')).toBeVisible();
    expect(calls.filter(c => c.path === '/api/font/batchDel').at(-1)?.body).toEqual(['2', '3']);
});
test('筛选结果翻页时保留搜索条件', async ({page}) => {
    const fonts = [...Array.from({length: 13}, (_, i) => ({id: String(i + 1), name: `目标${i + 1}`})), {id: '99', name: '无关字体'}];
    const {calls} = await setup(page, {fonts});
    await page.getByPlaceholder('搜索字体名称 / 预览内容').fill('目标');
    await page.getByPlaceholder('搜索字体名称 / 预览内容').press('Enter');
    await expect(page.locator('.datavisool-pagination-total')).toContainText('共 13 条');
    await page.locator('.datavisool-pagination-item').filter({hasText: /^2$/}).click();
    await expect(page.locator('article')).toHaveCount(1);
    expect(calls.filter(c => c.path === '/api/font/pageList').at(-1)?.body.searchValue).toBe('目标');
    await expect(page.getByText('无关字体')).toHaveCount(0);
});
test('上传接口返回 false 时不能提示成功', async ({page}) => {
    let release!: () => void;
    const waiting = new Promise<void>(resolve => {release = resolve;});
    await setup(page, {fonts: [], handler: async (route, path) => {
        if (path !== '/api/font/upload') return false;
        await waiting;
        await route.fulfill({json: {code: 200, msg: '成功', data: false}}); return true;
    }});
    await openUpload(page); await dialog(page).locator('input[type=file]').setInputFiles(fixture);
    try {
        await dialog(page).getByRole('button', {name: '上传字体'}).click();
        await expect(dialog(page).getByRole('button', {name: '上传中...'})).toBeVisible();
    } finally { release(); }
    await expect.poll(async () => (await page.getByText('操作成功').count()) + (await page.getByText('上传失败', {exact: true}).count())).toBeGreaterThan(0);
    await expect(page.getByText('操作成功')).toHaveCount(0);
    await expect(dialog(page)).toBeVisible();
});

test('上传进行中阻止取消和重复提交', async ({page}) => {
    let release!: () => void;
    const waiting = new Promise<void>(resolve => {release = resolve;});
    let requests = 0;
    await setup(page, {fonts: [], handler: async (route, path) => {
        if (path !== '/api/font/upload') return false;
        requests++;
        await waiting;
        await route.fulfill({json: {code: 200, msg: '成功', data: true}});
        return true;
    }});
    try {
        await openUpload(page);
        await dialog(page).locator('input[type=file]').setInputFiles(fixture);
        await dialog(page).getByRole('button', {name: '上传字体'}).click();
        await expect(dialog(page).getByRole('button', {name: '取消'})).toBeDisabled();
        await expect(dialog(page).locator('input[type=file]')).toBeDisabled();
        await expect(dialog(page).getByRole('button', {name: '上传中...'})).toBeDisabled();
        expect(requests).toBe(1);
    } finally { release(); }
    await expect(dialog(page)).toHaveCount(0);
});

test('编辑接口返回业务错误时保留原字体', async ({page}) => {
    await setup(page, {fonts: sample().slice(0, 1), handler: async (route, path) => {
        if (path !== '/api/font/update') return false;
        await route.fulfill({json: {code: 500, msg: '模拟保存失败', data: null}});
        return true;
    }});
    await card(page, '测试字体01').getByRole('button', {name: '编辑'}).click();
    await page.getByRole('dialog').last().getByPlaceholder('请输入字体名称').fill('未保存名称');
    await page.getByRole('dialog').last().getByRole('button', {name: '确定'}).click();
    await expect(page.getByText('模拟保存失败')).toBeVisible();
    await expect(card(page, '测试字体01')).toBeVisible();
});
