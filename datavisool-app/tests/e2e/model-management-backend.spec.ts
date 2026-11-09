/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {expect, test, type Page} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {zipSync, strToU8} from 'fflate';

const backend = process.env.DATAVISOOL_SERVER_DEV_TARGET || '';
const username = process.env.DATAVISOOL_E2E_USERNAME || '';
const password = process.env.DATAVISOOL_E2E_PASSWORD || '';
const dbPassword = process.env.DATAVISOOL_TEST_MYSQL_PASSWORD || '';
const db = process.env.DATAVISOOL_TEST_MYSQL_DATABASE || '';
const container = process.env.DATAVISOOL_TEST_MYSQL_CONTAINER || '';
const enabled = process.env.DATAVISOOL_E2E_ALLOW_WRITES === 'isolated' && !!username && !!password && !!dbPassword
    && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(backend)
    && /^datavisool_model_test_[a-z0-9_]+$/.test(db)
    && /^datavisool-model-e2e-[a-z0-9-]+$/.test(container);
const obj = Buffer.from('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n');
const vertices = Buffer.alloc(36);
[0,0,0,1,0,0,0,1,0].forEach((v, i) => vertices.writeFloatLE(v, i * 4));
const modelJson = {asset: {version: '2.0'}, scene: 0, scenes: [{nodes: [0]}], nodes: [{mesh: 0}], meshes: [{primitives: [{attributes: {POSITION: 0}}]}], accessors: [{bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0,0,0], max: [1,1,0]}], bufferViews: [{buffer: 0, byteOffset: 0, byteLength: 36}], buffers: [{byteLength: 36, uri: `data:application/octet-stream;base64,${vertices.toString('base64')}`}]};
const gltf = Buffer.from(JSON.stringify(modelJson));
const glbJson = Buffer.from(JSON.stringify({...modelJson, buffers: [{byteLength: 36}]}));
const glbJsonPadded = Buffer.concat([glbJson, Buffer.alloc((4 - glbJson.length % 4) % 4, 0x20)]);
const glb = Buffer.alloc(12 + 8 + glbJsonPadded.length + 8 + vertices.length);
glb.writeUInt32LE(0x46546c67, 0); glb.writeUInt32LE(2, 4); glb.writeUInt32LE(glb.length, 8);
glb.writeUInt32LE(glbJsonPadded.length, 12); glb.writeUInt32LE(0x4e4f534a, 16); glbJsonPadded.copy(glb, 20);
glb.writeUInt32LE(vertices.length, 20 + glbJsonPadded.length); glb.writeUInt32LE(0x004e4942, 24 + glbJsonPadded.length); vertices.copy(glb, 28 + glbJsonPadded.length);
const bundleGltf = Buffer.from(JSON.stringify({...modelJson, buffers: [{byteLength: 36, uri: 'triangle.bin'}]}));
const bundle = Buffer.from(zipSync({'scene/triangle.gltf': new Uint8Array(bundleGltf), 'scene/triangle.bin': new Uint8Array(vertices), 'scene/triangle.obj': new Uint8Array(obj), 'scene/readme.txt': strToU8('fixture')}));
const invalidBundle = Buffer.from(zipSync({'notes.txt': strToU8('no model')}));

test.use({trace: 'off', screenshot: 'off', video: 'off'});
test.setTimeout(90_000);
test.skip(!enabled, '需要本机隔离后端、模型专用 MySQL 容器和测试库、账号及隔离写入开关');
function sql(query: string) {
    if (!enabled) throw new Error('只允许访问模型管理隔离测试数据库');
    return execFileSync('docker', ['exec', '-e', `MYSQL_PWD=${dbPassword}`, container, 'mysql', '-uroot', '--batch', '--skip-column-names', db, '-e', query], {encoding: 'utf8'}).trim();
}
const header = (page: Page) => page.locator('header').filter({has: page.getByRole('heading', {name: '3D模型资源管理', exact: true})});
const card = (page: Page, name: string) => page.locator('article').filter({has: page.getByRole('heading', {name, exact: true})});
const modal = (page: Page) => page.locator('.datavisool-dialog:visible');
const confirm = (page: Page) => page.getByRole('dialog').last();
async function login(page: Page) {
    await page.addInitScript(() => localStorage.setItem('datavisool-i18n-locale', 'zh-CN'));
    await page.goto('/login'); await page.getByLabel('用户名').fill(username); await page.getByLabel('密码').fill(password);
    await page.getByRole('button', {name: '登录', exact: true}).click(); await expect(page).toHaveURL(/\/home\/console$/);
    const token = await page.evaluate(() => JSON.parse(localStorage.getItem('DATAVISOOL_USER_INFO') || '{}').token as string);
    await page.goto('/home/modelResource'); await expect(page.getByRole('heading', {name: '3D模型资源管理', exact: true})).toBeVisible();
    return {Authorization: `Bearer ${token}`};
}
async function seed(page: Page, headers: Record<string, string>, names: string[]) {
    for (const name of names) {
        const response = await page.request.post('/api/model/upload', {headers, multipart: {files: {name, mimeType: 'text/plain', buffer: obj}}});
        const body = await response.json(); expect(body.code).toBe(200); expect(body.data).toHaveLength(1);
    }
}
async function refresh(page: Page) { await page.reload(); await expect(page.getByRole('heading', {name: '3D模型资源管理', exact: true})).toBeVisible(); }
async function search(page: Page, value: string) {
    const input = page.getByPlaceholder('搜索模型名称'); await input.fill(value);
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/model/page');
    await input.press('Enter'); return await response;
}
async function openUpload(page: Page) { await header(page).getByRole('button', {name: '上传模型', exact: true}).click(); await expect(modal(page)).toBeVisible(); }
async function openMenu(page: Page, name: string, action: string) { await card(page, name).getByRole('button', {name: '更多操作'}).click(); await page.getByRole('menuitem', {name: action, exact: true}).click(); }
async function clickConfirm(page: Page, action: string) { await confirm(page).getByRole('button', {name: action, exact: true}).click(); }

test.beforeEach(async () => { sql('DELETE FROM three_d_model WHERE user_id=1'); });

for (const width of [1440, 1024, 700, 390]) test(`页面及上传窗口布局 ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height: 900}); await page.emulateMedia({reducedMotion: 'reduce'});
    const headers = await login(page); await seed(page, headers, ['layout.obj']); await refresh(page);
    await expect(card(page, 'layout.obj')).toBeVisible(); await expect(header(page).getByPlaceholder('搜索模型名称')).toBeVisible();
    const dim = await page.evaluate(() => ({scroll: document.documentElement.scrollWidth, width: innerWidth})); expect(dim.scroll).toBeLessThanOrEqual(dim.width);
    await page.screenshot({path: `../测试报告/3D模型管理/模型管理-${width}.png`, animations: 'disabled'});
    await openUpload(page); await expect(modal(page).getByText('支持 .glb、.gltf、.fbx、.obj 或 .zip 多文件模型')).toBeVisible();
    if (width === 390) await page.screenshot({path: '../测试报告/3D模型管理/模型管理-390-上传.png', animations: 'disabled'});
    const rect = await modal(page).boundingBox(); expect(rect!.x).toBeGreaterThanOrEqual(0); expect(rect!.x + rect!.width).toBeLessThanOrEqual(width + 1);
    await expect(modal(page).getByRole('button', {name: '取消'})).toBeInViewport();
});

test('空状态、文件格式检查、上限、移除与取消重置', async ({page}) => {
    await login(page); await expect(page.getByText('暂无3D模型资源')).toBeVisible();
    await header(page).getByRole('button', {name: '删除', exact: true}).click(); await expect(page.getByText('请选择要删除的模型')).toBeVisible();
    await page.getByRole('button', {name: '上传模型', exact: true}).last().click();
    const input = modal(page).locator('input[type=file]'); await expect(input).toHaveAttribute('accept', '.glb,.gltf,.fbx,.obj,.zip');
    await expect(modal(page).getByRole('button', {name: '上传模型', exact: true})).toBeDisabled();
    await input.setInputFiles({name: 'bad.txt', mimeType: 'text/plain', buffer: Buffer.from('bad')});
    await expect(page.getByText('仅支持 .glb、.gltf、.fbx、.obj 或 .zip 文件')).toBeVisible();
    await expect(modal(page).getByText('bad.txt')).toHaveCount(0);
    await input.setInputFiles(Array.from({length: 11}, (_, i) => ({name: `item-${i}.obj`, mimeType: 'text/plain', buffer: obj})));
    await expect(modal(page).locator('.datavisool-upload-list-item')).toHaveCount(10); await expect(modal(page).getByText('item-10.obj')).toHaveCount(0);
    await modal(page).getByRole('button', {name: '移除 item-0.obj', exact: true}).click(); await expect(modal(page).locator('.datavisool-upload-list-item')).toHaveCount(9);
    await modal(page).getByRole('button', {name: '取消'}).click(); await openUpload(page); await expect(modal(page).locator('.datavisool-upload-list-item')).toHaveCount(0);
    expect(sql('SELECT COUNT(*) FROM three_d_model WHERE deleted=0')).toBe('0');
});

test('真实 OBJ 上传并核对数据库与文件内容', async ({page}) => {
    await login(page); await openUpload(page); await modal(page).locator('input[type=file]').setInputFiles({name: 'triangle.obj', mimeType: 'text/plain', buffer: obj});
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/model/upload');
    await modal(page).getByRole('button', {name: '上传模型', exact: true}).click(); const body = await (await response).json();
    expect(body.code).toBe(200); expect(body.data).toHaveLength(1); await expect(card(page, 'triangle.obj')).toBeVisible(); await expect(card(page, 'triangle.obj')).toContainText('OBJ');
    const [id, path, size, compressed] = sql("SELECT id,url,size,is_compressed FROM three_d_model WHERE name='triangle.obj' AND deleted=0").split('\t');
    expect(id).toMatch(/^\d+$/); expect(Number(size)).toBe(obj.length); expect(compressed).toBe('0');
    const resource = await page.request.get(`/static/models/${path}`); expect(resource.status()).toBe(200); expect((await resource.body()).equals(obj)).toBe(true);
    const meshCount = await page.evaluate(async modelPath => {
        const loaderPath = '/node_modules/three/examples/jsm/loaders/OBJLoader.js';
        const {OBJLoader} = await import(loaderPath);
        const loaded = await new OBJLoader().loadAsync(`/static/models/${modelPath}`);
        let count = 0; loaded.traverse((node: any) => { if (node.isMesh) count++; }); return count;
    }, path);
    expect(meshCount).toBe(1);
});

test('真实 glTF、GLB 多文件上传', async ({page}) => {
    await login(page); await openUpload(page);
    await modal(page).locator('input[type=file]').setInputFiles([{name: 'triangle.gltf', mimeType: 'model/gltf+json', buffer: gltf}, {name: 'triangle.glb', mimeType: 'model/gltf-binary', buffer: glb}]);
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/model/upload');
    await modal(page).getByRole('button', {name: '上传模型', exact: true}).click(); const body = await (await response).json(); expect(body.code).toBe(200); expect(body.data).toHaveLength(2);
    await expect(card(page, 'triangle.gltf')).toContainText('GLTF/GLB'); await expect(card(page, 'triangle.glb')).toContainText('GLTF/GLB');
    for (const [name, expected] of [['triangle.gltf', gltf], ['triangle.glb', glb]] as const) {
        const path = sql(`SELECT url FROM three_d_model WHERE name='${name}' AND deleted=0`);
        const resource = await page.request.get(`/static/models/${path}`); expect(resource.status()).toBe(200); expect((await resource.body()).equals(expected)).toBe(true);
        const meshCount = await page.evaluate(async modelPath => {
            const loaderPath = '/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
            const {GLTFLoader} = await import(loaderPath);
            const data = await (await fetch(`/static/models/${modelPath}`)).arrayBuffer();
            const parsed = await new GLTFLoader().parseAsync(data, '/');
            let count = 0; parsed.scene.traverse((node: any) => { if (node.isMesh) count++; });
            return count;
        }, path);
        expect(meshCount).toBe(1);
    }
});

test('ZIP 模型包上传并核对主文件和附属文件', async ({page}) => {
    await login(page); await openUpload(page); await modal(page).locator('input[type=file]').setInputFiles({name: 'bundle.zip', mimeType: 'application/zip', buffer: bundle});
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/model/upload');
    await modal(page).getByRole('button', {name: '上传模型', exact: true}).click(); const body = await (await response).json(); expect(body.code).toBe(200); expect(body.data).toHaveLength(1);
    await expect(card(page, 'bundle.zip')).toContainText('ZIP');
    const [path, compressed] = sql("SELECT url,is_compressed FROM three_d_model WHERE name='bundle.zip' AND deleted=0").split('\t');
    expect(compressed).toBe('1'); expect(path).toMatch(/\/scene\/triangle\.gltf$/);
    expect((await (await page.request.get(`/static/models/${path}`)).body()).equals(bundleGltf)).toBe(true);
    const binary = path.replace('triangle.gltf', 'triangle.bin'); expect((await (await page.request.get(`/static/models/${binary}`)).body()).equals(vertices)).toBe(true);
    const readme = path.replace('triangle.gltf', 'readme.txt'); expect(await (await page.request.get(`/static/models/${readme}`)).text()).toBe('fixture');
    const meshCount = await page.evaluate(async modelPath => {
        const loaderPath = '/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
        const {GLTFLoader} = await import(loaderPath);
        const loaded = await new GLTFLoader().loadAsync(`/static/models/${modelPath}`);
        let count = 0; loaded.scene.traverse((node: any) => { if (node.isMesh) count++; }); return count;
    }, path);
    expect(meshCount).toBe(1);
});

test('拖拽 OBJ 模型上传', async ({page}) => {
    await login(page); await openUpload(page);
    const data = await page.evaluateHandle(() => {const d = new DataTransfer(); d.items.add(new File(['v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n'], 'drag.obj', {type: 'text/plain'})); return d;});
    await modal(page).locator('.datavisool-upload-dragger').dispatchEvent('drop', {dataTransfer: data}); await expect(modal(page).getByText('drag.obj')).toBeVisible();
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/model/upload');
    await modal(page).getByRole('button', {name: '上传模型', exact: true}).click(); expect((await (await response).json()).code).toBe(200);
    await expect(card(page, 'drag.obj')).toBeVisible(); expect(sql("SELECT COUNT(*) FROM three_d_model WHERE name='drag.obj' AND deleted=0")).toBe('1');
});

test('重命名取消、保存和单项删除', async ({page}) => {
    const headers = await login(page); await seed(page, headers, ['rename.obj']); await refresh(page);
    const id = sql("SELECT id FROM three_d_model WHERE name='rename.obj'");
    await card(page, 'rename.obj').getByRole('button', {name: '编辑'}).click();
    await confirm(page).getByPlaceholder('请输入新的模型名称').fill('cancel.obj'); await clickConfirm(page, '取消');
    expect(sql(`SELECT name FROM three_d_model WHERE id=${id}`)).toBe('rename.obj');
    await openMenu(page, 'rename.obj', '重命名'); await confirm(page).getByPlaceholder('请输入新的模型名称').fill('  renamed.obj  ');
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/model/update');
    await clickConfirm(page, '确定'); expect(await (await response).json()).toMatchObject({code: 200, data: true});
    await expect(card(page, 'renamed.obj')).toBeVisible(); expect(sql(`SELECT name FROM three_d_model WHERE id=${id}`)).toBe('renamed.obj');
    await refresh(page); await expect(card(page, 'renamed.obj')).toBeVisible();
    await card(page, 'renamed.obj').getByRole('button', {name: '删除'}).click(); await clickConfirm(page, '取消'); expect(sql(`SELECT deleted FROM three_d_model WHERE id=${id}`)).toBe('0');
    await openMenu(page, 'renamed.obj', '删除'); const del = page.waitForResponse(r => new URL(r.url()).pathname === '/api/model/batchDelete');
    await clickConfirm(page, '确定'); expect((await (await del).json()).data).toBe(true);
    await expect(card(page, 'renamed.obj')).toHaveCount(0); expect(sql(`SELECT deleted FROM three_d_model WHERE id=${id}`)).toBe('1');
});

test('复制模型链接', async ({page, context}) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {origin: 'http://127.0.0.1:4179'});
    const headers = await login(page); await seed(page, headers, ['copy.obj']); await refresh(page);
    const path = sql("SELECT url FROM three_d_model WHERE name='copy.obj'"); await openMenu(page, 'copy.obj', '复制链接');
    await expect(page.getByText('链接已复制')).toBeVisible(); expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`http://127.0.0.1:4179/static/models/${path}`);
});

test('替换应更新原模型而不是新增记录', async ({page}) => {
    const headers = await login(page); await seed(page, headers, ['original.obj']); await refresh(page);
    const [id, originalPath] = sql("SELECT id,url FROM three_d_model WHERE name='original.obj'").split('\t');
    await card(page, 'original.obj').getByRole('button', {name: '替换'}).click(); await expect(modal(page).getByText('替换模型', {exact: true}).first()).toBeVisible();
    await expect(modal(page).locator('input[type=file]')).not.toHaveAttribute('multiple', '');
    await modal(page).locator('input[type=file]').setInputFiles({name: 'replacement.gltf', mimeType: 'model/gltf+json', buffer: gltf});
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/model/upload');
    const listRefresh = page.waitForResponse(r => new URL(r.url()).pathname === '/api/model/page');
    await modal(page).getByRole('button', {name: '替换', exact: true}).click(); const result = await response;
    expect((await result.json()).code).toBe(200); await listRefresh;
    await expect(modal(page)).toHaveCount(0);
    await page.screenshot({path: '../测试报告/3D模型管理/模型管理-替换结果.png', animations: 'disabled'});
    await expect.poll(() => Number(sql('SELECT COUNT(*) FROM three_d_model WHERE deleted=0'))).toBeGreaterThan(0);
    const rows = sql('SELECT COUNT(*) FROM three_d_model WHERE deleted=0');
    const currentPath = sql(`SELECT url FROM three_d_model WHERE id=${id} AND deleted=0`);
    expect(rows).toBe('1'); expect(currentPath).not.toBe(originalPath);
    expect(sql(`SELECT name FROM three_d_model WHERE id=${id}`)).toBe('replacement.gltf');
    expect((await (await page.request.get(`/static/models/${currentPath}`)).body()).equals(gltf)).toBe(true);
    expect((await (await page.request.get(`/static/models/${originalPath}`)).body()).equals(obj)).toBe(true);
});

test('取消替换不会修改原模型', async ({page}) => {
    const headers = await login(page); await seed(page, headers, ['cancel-replace.obj']); await refresh(page);
    const old = sql("SELECT id,url FROM three_d_model WHERE name='cancel-replace.obj'");
    await card(page, 'cancel-replace.obj').getByRole('button', {name: '替换'}).click();
    await modal(page).locator('input[type=file]').setInputFiles({name: 'discard.gltf', mimeType: 'model/gltf+json', buffer: gltf});
    await modal(page).getByRole('button', {name: '取消'}).click();
    expect(sql("SELECT id,url FROM three_d_model WHERE name='cancel-replace.obj'")).toBe(old); expect(sql('SELECT COUNT(*) FROM three_d_model WHERE deleted=0')).toBe('1');
});

test('搜索、普通分页、无结果和清空', async ({page}) => {
    const headers = await login(page); await seed(page, headers, Array.from({length: 11}, (_, i) => `ordinary-${String(i).padStart(2, '0')}.obj`)); await refresh(page);
    await expect(page.locator('article')).toHaveCount(10); await page.locator('.datavisool-pagination-item').filter({hasText: /^2$/}).click(); await expect(page.locator('article')).toHaveCount(1);
    const response = await search(page, '  ordinary-00  '); expect(response.request().postDataJSON()).toMatchObject({current: 1, size: 10, searchValue: 'ordinary-00'});
    await expect(card(page, 'ordinary-00.obj')).toBeVisible(); await expect(page.locator('article')).toHaveCount(1);
    await search(page, 'not-present'); await expect(page.getByText('暂无3D模型资源')).toBeVisible(); await search(page, ''); await expect(page.locator('article')).toHaveCount(10);
});

test('搜索后翻页保留筛选条件', async ({page}) => {
    const headers = await login(page); await seed(page, headers, [...Array.from({length: 11}, (_, i) => `target-${String(i).padStart(2, '0')}.obj`), 'unrelated.obj']); await refresh(page);
    await search(page, 'target-'); await expect(page.locator('.datavisool-pagination-total')).toContainText('共 11 条');
    const next = page.waitForResponse(r => new URL(r.url()).pathname === '/api/model/page' && r.request().postDataJSON().current === 2);
    await page.locator('.datavisool-pagination-item').filter({hasText: /^2$/}).click(); const response = await next;
    expect.soft(response.request().postDataJSON().searchValue).toBe('target-'); expect.soft((await response.json()).data.total).toBe(11); await expect.soft(page.locator('article')).toHaveCount(1);
});

test('批量选择、取消及确认删除', async ({page}) => {
    const headers = await login(page); await seed(page, headers, ['batch-a.obj', 'batch-b.obj']); await refresh(page);
    await header(page).getByRole('button', {name: '删除', exact: true}).click(); await expect(page.getByText('请选择要删除的模型')).toBeVisible();
    await card(page, 'batch-a.obj').click(); await card(page, 'batch-b.obj').click();
    await header(page).getByRole('button', {name: '删除', exact: true}).click(); await clickConfirm(page, '取消'); expect(sql('SELECT COUNT(*) FROM three_d_model WHERE deleted=0')).toBe('2');
    await header(page).getByRole('button', {name: '删除', exact: true}).click(); const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/model/batchDelete');
    await clickConfirm(page, '确定'); expect((await (await response).json()).data).toBe(true); await expect(page.getByText('暂无3D模型资源')).toBeVisible(); expect(sql('SELECT COUNT(*) FROM three_d_model WHERE deleted=1')).toBe('2');
});

test('删除末页唯一记录后回到有效页面', async ({page}) => {
    const headers = await login(page); await seed(page, headers, Array.from({length: 11}, (_, i) => `last-${String(i).padStart(2, '0')}.obj`)); await refresh(page);
    await page.locator('.datavisool-pagination-item').filter({hasText: /^2$/}).click(); await expect(page.locator('article')).toHaveCount(1);
    await page.locator('article').first().getByRole('button', {name: '删除', exact: true}).click(); const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/model/batchDelete');
    await clickConfirm(page, '确定'); expect((await (await response).json()).data).toBe(true); await expect(page.locator('.datavisool-pagination-total')).toContainText('共 10 条');
    expect(sql('SELECT COUNT(*) FROM three_d_model WHERE deleted=0')).toBe('10'); await expect(page.locator('article')).toHaveCount(10);
});

test('空白名称应提示并保留输入', async ({page}) => {
    const headers = await login(page); await seed(page, headers, ['blank.obj']); await refresh(page);
    await card(page, 'blank.obj').getByRole('button', {name: '编辑'}).click(); await confirm(page).getByPlaceholder('请输入新的模型名称').fill('   '); await clickConfirm(page, '确定');
    await expect(confirm(page).getByPlaceholder('请输入新的模型名称')).toBeVisible(); await expect(page.getByText('请输入新的模型名称', {exact: true})).toBeVisible();
    expect(sql("SELECT COUNT(*) FROM three_d_model WHERE name='blank.obj' AND deleted=0")).toBe('1');
});

test('无主模型的 ZIP 被真实后端拒绝并保留输入', async ({page}) => {
    await login(page); await openUpload(page); await modal(page).locator('input[type=file]').setInputFiles({name: 'invalid.zip', mimeType: 'application/zip', buffer: invalidBundle});
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/model/upload'); await modal(page).getByRole('button', {name: '上传模型', exact: true}).click();
    expect((await (await response).json()).code).not.toBe(200); await expect(modal(page).getByText('invalid.zip')).toBeVisible(); expect(sql('SELECT COUNT(*) FROM three_d_model WHERE deleted=0')).toBe('0');
});

test('上传业务失败保留文件并可真实重试', async ({page}) => {
    await login(page); let fail = true;
    await page.route('**/api/model/upload', async route => {if (fail) {fail = false; await route.fulfill({json: {code: 500, msg: '模拟上传失败', data: null}});} else await route.continue();});
    await openUpload(page); await modal(page).locator('input[type=file]').setInputFiles({name: 'retry.obj', mimeType: 'text/plain', buffer: obj});
    await modal(page).getByRole('button', {name: '上传模型', exact: true}).click(); await expect(page.getByText('模拟上传失败')).toBeVisible();
    await expect(modal(page).getByText('retry.obj')).toBeVisible(); expect(sql('SELECT COUNT(*) FROM three_d_model WHERE deleted=0')).toBe('0');
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/model/upload');
    await modal(page).getByRole('button', {name: '上传模型', exact: true}).click(); expect((await (await response).json()).code).toBe(200);
    await expect(card(page, 'retry.obj')).toBeVisible(); expect(sql("SELECT COUNT(*) FROM three_d_model WHERE name='retry.obj' AND deleted=0")).toBe('1');
});

test('重命名业务失败不应显示成功', async ({page}) => {
    const headers = await login(page); await seed(page, headers, ['rename-fail.obj']); await refresh(page);
    await page.route('**/api/model/update', route => route.fulfill({json: {code: 500, msg: '模拟重命名失败', data: null}}));
    await card(page, 'rename-fail.obj').getByRole('button', {name: '编辑'}).click(); await confirm(page).getByPlaceholder('请输入新的模型名称').fill('should-not-save.obj');
    await page.evaluate(() => {(window as any).__modelMessages = []; new MutationObserver(() => {for (const message of document.querySelectorAll('.datavisool-global-message-content')) (window as any).__modelMessages.push(message.textContent);}).observe(document.body, {childList: true, subtree: true});});
    await clickConfirm(page, '确定'); await expect(page.getByText('模拟重命名失败')).toBeVisible(); await page.waitForTimeout(1000);
    await page.screenshot({path: '../测试报告/3D模型管理/模型管理-重命名失败.png', animations: 'disabled'});
    expect(sql("SELECT COUNT(*) FROM three_d_model WHERE name='rename-fail.obj' AND deleted=0")).toBe('1'); expect(await page.evaluate(() => (window as any).__modelMessages)).not.toContain('重命名成功');
});

test('上传接口返回 false 不应关闭窗口', async ({page}) => {
    await login(page); await page.route('**/api/model/upload', route => route.fulfill({json: {code: 200, msg: '成功', data: false}}));
    await openUpload(page); await modal(page).locator('input[type=file]').setInputFiles({name: 'false.obj', mimeType: 'text/plain', buffer: obj});
    await page.evaluate(() => {(window as any).__uploadMessages = []; new MutationObserver(() => {for (const message of document.querySelectorAll('.datavisool-global-message-content')) (window as any).__uploadMessages.push(message.textContent);}).observe(document.body, {childList: true, subtree: true});});
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/model/upload'); await modal(page).getByRole('button', {name: '上传模型', exact: true}).click(); await response;
    await expect.poll(() => page.evaluate(() => (window as any).__uploadMessages.length)).toBeGreaterThan(0);
    expect(await page.evaluate(() => (window as any).__uploadMessages)).not.toContain('操作成功');
    await expect(page.getByText('上传失败')).toBeVisible(); await expect(modal(page).getByText('false.obj')).toBeVisible(); expect(sql('SELECT COUNT(*) FROM three_d_model WHERE deleted=0')).toBe('0');
});

test('上传中禁止取消和重复提交', async ({page}) => {
    await login(page); let release!: () => void; const waiting = new Promise<void>(resolve => {release = resolve;}); let sent = 0;
    await page.route('**/api/model/upload', async route => {sent++; await waiting; await route.continue();});
    await openUpload(page); await modal(page).locator('input[type=file]').setInputFiles({name: 'slow.obj', mimeType: 'text/plain', buffer: obj});
    try {await modal(page).getByRole('button', {name: '上传模型', exact: true}).click(); await expect.poll(() => sent).toBe(1); await expect(modal(page).getByRole('button', {name: '取消'})).toBeDisabled(); await expect(modal(page).getByRole('button', {name: '上传中...'})).toBeDisabled();} finally {release();}
    await expect(card(page, 'slow.obj')).toBeVisible(); expect(sql("SELECT COUNT(*) FROM three_d_model WHERE name='slow.obj' AND deleted=0")).toBe('1');
});

test('空模型文件在页面选择和直接提交时均被拒绝', async ({page}) => {
    const headers = await login(page); await openUpload(page);
    await modal(page).locator('input[type=file]').setInputFiles({name: 'empty.obj', mimeType: 'text/plain', buffer: Buffer.alloc(0)});
    await expect(page.getByText('模型文件不能为空')).toBeVisible();
    await expect(modal(page).getByText('empty.obj')).toHaveCount(0);
    await expect(modal(page).getByRole('button', {name: '上传模型', exact: true})).toBeDisabled();
    const response = await page.request.post('/api/model/upload', {headers, multipart: {files: {name: 'empty.obj', mimeType: 'text/plain', buffer: Buffer.alloc(0)}}});
    expect((await response.json()).code).not.toBe(200);
    expect(sql('SELECT COUNT(*) FROM three_d_model WHERE deleted=0')).toBe('0');
});

test('FBX 后缀文件上传和静态资源读取', async ({page}) => {
    const sample = Buffer.from('; FBX 7.4.0 project file\nFBXHeaderExtension:  {\n  FBXVersion: 7400\n}\n');
    await login(page); await openUpload(page);
    await modal(page).locator('input[type=file]').setInputFiles({name: 'sample.FBX', mimeType: 'application/octet-stream', buffer: sample});
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/model/upload');
    await modal(page).getByRole('button', {name: '上传模型', exact: true}).click(); expect((await (await response).json()).code).toBe(200);
    await expect(card(page, 'sample.FBX')).toContainText('FBX');
    const path = sql("SELECT url FROM three_d_model WHERE name='sample.FBX' AND deleted=0");
    expect((await (await page.request.get(`/static/models/${path}`)).body()).equals(sample)).toBe(true);
});

test('损坏的 GLB 不应上传成功', async ({page}) => {
    await login(page); await openUpload(page);
    await modal(page).locator('input[type=file]').setInputFiles({name: 'invalid.glb', mimeType: 'model/gltf-binary', buffer: Buffer.from('not-a-glb')});
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/model/upload');
    await modal(page).getByRole('button', {name: '上传模型', exact: true}).click(); const body = await (await response).json();
    expect(body.code).not.toBe(200);
    await expect(modal(page).getByText('invalid.glb')).toBeVisible();
    expect(sql('SELECT COUNT(*) FROM three_d_model WHERE deleted=0')).toBe('0');
});

test('直接接口拒绝空白模型名称并保留原值', async ({page}) => {
    const headers = await login(page); await seed(page, headers, ['valid-name.obj']);
    const id = sql("SELECT id FROM three_d_model WHERE name='valid-name.obj'");
    for (const name of ['', '   ', '\u00a0\u00a0']) {
        const response = await page.request.post('/api/model/update', {headers, data: {id, name}});
        expect((await response.json()).code).not.toBe(200);
    }
    expect(sql(`SELECT name FROM three_d_model WHERE id=${id}`)).toBe('valid-name.obj');
});

test('筛选后删除末页最后一项仍保留筛选并回到有效页', async ({page}) => {
    const headers = await login(page); await seed(page, headers, [...Array.from({length: 11}, (_, i) => `filtered-${String(i).padStart(2, '0')}.obj`), 'unrelated.obj']); await refresh(page);
    await search(page, 'filtered-'); await expect(page.locator('.datavisool-pagination-total')).toContainText('共 11 条');
    await page.locator('.datavisool-pagination-item').filter({hasText: /^2$/}).click(); await expect(page.locator('article')).toHaveCount(1);
    await page.locator('article').first().getByRole('button', {name: '删除', exact: true}).click(); await clickConfirm(page, '确定');
    await expect(page.locator('.datavisool-pagination-total')).toContainText('共 10 条'); await expect(page.locator('article')).toHaveCount(10);
    await expect(card(page, 'unrelated.obj')).toHaveCount(0); expect(sql("SELECT COUNT(*) FROM three_d_model WHERE name LIKE 'filtered-%' AND deleted=0")).toBe('10');
});

test('单模型与 ZIP 模型互相替换保留编号和旧资源', async ({page}) => {
    const headers = await login(page); await seed(page, headers, ['switch-original.obj']); await refresh(page);
    const [id, oldPath] = sql("SELECT id,url FROM three_d_model WHERE name='switch-original.obj'").split('\t');
    await card(page, 'switch-original.obj').getByRole('button', {name: '替换'}).click();
    await modal(page).locator('input[type=file]').setInputFiles({name: 'switch-bundle.zip', mimeType: 'application/zip', buffer: bundle});
    let response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/model/upload');
    await modal(page).getByRole('button', {name: '替换', exact: true}).click(); expect((await (await response).json()).code).toBe(200);
    await expect(card(page, 'switch-bundle.zip')).toBeVisible();
    const [zipPath, zipFlag] = sql(`SELECT url,is_compressed FROM three_d_model WHERE id=${id} AND deleted=0`).split('\t');
    expect(zipFlag).toBe('1'); expect(zipPath).toMatch(/\/scene\/triangle\.gltf$/);
    expect((await (await page.request.get(`/static/models/${oldPath}`)).body()).equals(obj)).toBe(true);
    expect((await (await page.request.get(`/static/models/${zipPath}`)).body()).equals(bundleGltf)).toBe(true);
    await card(page, 'switch-bundle.zip').getByRole('button', {name: '替换'}).click();
    await modal(page).locator('input[type=file]').setInputFiles({name: 'switch-final.glb', mimeType: 'model/gltf-binary', buffer: glb});
    response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/model/upload');
    await modal(page).getByRole('button', {name: '替换', exact: true}).click(); expect((await (await response).json()).code).toBe(200);
    await expect(card(page, 'switch-final.glb')).toBeVisible();
    const [finalPath, flag] = sql(`SELECT url,is_compressed FROM three_d_model WHERE id=${id} AND deleted=0`).split('\t');
    expect(flag).toBe('0'); expect((await (await page.request.get(`/static/models/${finalPath}`)).body()).equals(glb)).toBe(true);
    expect((await (await page.request.get(`/static/models/${zipPath}`)).body()).equals(bundleGltf)).toBe(true);
    expect((await (await page.request.get(`/static/models/${zipPath.replace('triangle.gltf', 'triangle.bin')}`)).body()).equals(vertices)).toBe(true);
    expect(sql('SELECT COUNT(*) FROM three_d_model WHERE deleted=0')).toBe('1');
});

test('不能替换其他用户模型及一次替换多个文件', async ({page}) => {
    const headers = await login(page); await seed(page, headers, ['foreign.obj', 'own.obj']);
    const foreignId = sql("SELECT id FROM three_d_model WHERE name='foreign.obj'");
    const ownId = sql("SELECT id FROM three_d_model WHERE name='own.obj'");
    sql(`UPDATE three_d_model SET user_id=2 WHERE id=${foreignId}`);
    try {
        const forbidden = await page.request.post('/api/model/upload', {headers, multipart: {id: foreignId, files: {name: 'hijack.obj', mimeType: 'text/plain', buffer: obj}}});
        expect((await forbidden.json()).code).not.toBe(200);
        const multiple = await page.evaluate(async ({authorization, id}) => {
            const form = new FormData(); form.append('id', id);
            form.append('files', new File(['v 0 0 0\n'], 'one.obj', {type: 'text/plain'}));
            form.append('files', new File(['v 0 0 0\n'], 'two.obj', {type: 'text/plain'}));
            return (await fetch('/api/model/upload', {method: 'POST', headers: {Authorization: authorization}, body: form})).json();
        }, {authorization: headers.Authorization, id: ownId});
        expect(multiple.code).not.toBe(200);
        expect(sql(`SELECT name FROM three_d_model WHERE id=${foreignId}`)).toBe('foreign.obj');
        expect(sql(`SELECT name FROM three_d_model WHERE id=${ownId}`)).toBe('own.obj');
        expect(sql('SELECT COUNT(*) FROM three_d_model WHERE deleted=0')).toBe('2');
    } finally {
        sql(`DELETE FROM three_d_model WHERE id=${foreignId}`);
    }
});

test('损坏的 GLB 头、长度、JSON 及 ZIP 内主模型均被真实后端拒绝', async ({page}) => {
    const headers = await login(page);
    const badMagic = Buffer.from(glb); badMagic[0] = 0;
    const badVersion = Buffer.from(glb); badVersion.writeUInt32LE(1, 4);
    const badLength = Buffer.from(glb); badLength.writeUInt32LE(glb.length + 4, 8);
    const badChunkLength = Buffer.from(glb); badChunkLength.writeUInt32LE(glb.length, 12);
    const badJson = Buffer.from(glb); badJson[20] = 0;
    const zipBad = Buffer.from(zipSync({'broken.glb': strToU8('not-a-glb')}));
    for (const [name, buffer] of [['magic.glb', badMagic], ['version.glb', badVersion], ['length.glb', badLength], ['chunk.glb', badChunkLength], ['json.glb', badJson], ['broken.zip', zipBad]] as const) {
        const response = await page.request.post('/api/model/upload', {headers, multipart: {files: {name, mimeType: 'application/octet-stream', buffer}}});
        expect((await response.json()).code).not.toBe(200);
    }
    expect(sql('SELECT COUNT(*) FROM three_d_model WHERE deleted=0')).toBe('0');
});

test('混合空文件上传整体拒绝，数据与文件不发生部分写入', async ({page}) => {
    const headers = await login(page);
    const response = await page.evaluate(async authorization => {
        const form = new FormData(); form.append('files', new File(['v 0 0 0\n'], 'valid.obj', {type: 'text/plain'}));
        form.append('files', new File([], 'empty.obj', {type: 'text/plain'}));
        return (await fetch('/api/model/upload', {method: 'POST', headers: {Authorization: authorization}, body: form})).json();
    }, headers.Authorization);
    expect(response.code).not.toBe(200); expect(sql('SELECT COUNT(*) FROM three_d_model WHERE deleted=0')).toBe('0');
});

test('替换损坏文件失败后原记录及文件不变', async ({page}) => {
    const headers = await login(page); await seed(page, headers, ['preserved.obj']); await refresh(page);
    const [id, originalPath] = sql("SELECT id,url FROM three_d_model WHERE name='preserved.obj'").split('\t');
    await card(page, 'preserved.obj').getByRole('button', {name: '替换'}).click();
    await modal(page).locator('input[type=file]').setInputFiles({name: 'invalid.glb', mimeType: 'model/gltf-binary', buffer: Buffer.from('invalid')});
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/model/upload'); await modal(page).getByRole('button', {name: '替换', exact: true}).click();
    expect((await (await response).json()).code).not.toBe(200); await expect(modal(page).getByText('invalid.glb')).toBeVisible();
    expect(sql(`SELECT name,url FROM three_d_model WHERE id=${id}`)).toBe(`preserved.obj\t${originalPath}`);
    expect((await (await page.request.get(`/static/models/${originalPath}`)).body()).equals(obj)).toBe(true);
    expect(sql('SELECT COUNT(*) FROM three_d_model WHERE deleted=0')).toBe('1');
});

test('上传空数组与重命名 false 时保留输入并提示失败', async ({page}) => {
    const headers = await login(page); await seed(page, headers, ['false-name.obj']); await refresh(page);
    await page.route('**/api/model/update', route => route.fulfill({json: {code: 200, msg: '成功', data: false}}));
    await card(page, 'false-name.obj').getByRole('button', {name: '编辑'}).click(); await confirm(page).getByPlaceholder('请输入新的模型名称').fill('attempt.obj'); await clickConfirm(page, '确定');
    await expect(page.getByText('重命名失败')).toBeVisible(); await expect(confirm(page).getByPlaceholder('请输入新的模型名称')).toHaveValue('attempt.obj');
    expect(sql("SELECT COUNT(*) FROM three_d_model WHERE name='false-name.obj' AND deleted=0")).toBe('1');
    await clickConfirm(page, '取消');
    await page.route('**/api/model/upload', route => route.fulfill({json: {code: 200, msg: '成功', data: []}}));
    await openUpload(page); await modal(page).locator('input[type=file]').setInputFiles({name: 'false-list.obj', mimeType: 'text/plain', buffer: obj});
    await modal(page).getByRole('button', {name: '上传模型', exact: true}).click();
    await expect(page.getByText('上传失败')).toBeVisible(); await expect(modal(page).getByText('false-list.obj')).toBeVisible();
});
