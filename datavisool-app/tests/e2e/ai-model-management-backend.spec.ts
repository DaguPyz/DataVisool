/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {expect, test, type Page} from '@playwright/test';
import {execFileSync} from 'node:child_process';

const backend = process.env.DATAVISOOL_SERVER_DEV_TARGET || '';
const username = process.env.DATAVISOOL_E2E_USERNAME || '';
const password = process.env.DATAVISOOL_E2E_PASSWORD || '';
const dbPassword = process.env.DATAVISOOL_TEST_MYSQL_PASSWORD || '';
const db = process.env.DATAVISOOL_TEST_MYSQL_DATABASE || '';
const container = process.env.DATAVISOOL_TEST_MYSQL_CONTAINER || '';
const enabled = process.env.DATAVISOOL_E2E_ALLOW_WRITES === 'isolated' && !!username && !!password && !!dbPassword
    && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(backend)
    && /^datavisool_aimodel_test_[a-z0-9_]+$/.test(db)
    && /^datavisool-aimodel-e2e-[a-z0-9-]+$/.test(container);
const testKey = 'synthetic-only-not-a-provider-key';
test.use({trace: 'off', screenshot: 'off', video: 'off'});
test.setTimeout(45_000);
test.skip(!enabled, '需要本机隔离后端、AI 模型专用 MySQL 容器和测试库、账号及隔离写入开关');
function sql(query: string) {
    if (!enabled) throw new Error('只允许访问 AI 模型隔离测试数据库');
    return execFileSync('docker', ['exec', '-e', `MYSQL_PWD=${dbPassword}`, container, 'mysql', '-uroot', '--batch', '--skip-column-names', db, '-e', query], {encoding: 'utf8'}).trim();
}
const header = (page: Page) => page.locator('header').filter({has: page.getByRole('heading', {name: 'AI模型管理', exact: true})});
const card = (page: Page, name: string) => page.locator('article').filter({has: page.locator('[title]').filter({hasText: name})}).filter({hasText: name});
const modal = (page: Page) => page.locator('.ai-model-dialog-compact:visible');
const confirm = (page: Page) => page.getByRole('dialog').last();
async function login(page: Page) {
    await page.addInitScript(() => localStorage.setItem('datavisool-i18n-locale', 'zh-CN'));
    await page.goto('/login'); await page.getByLabel('用户名').fill(username); await page.getByLabel('密码').fill(password);
    await page.getByRole('button', {name: '登录', exact: true}).click(); await expect(page).toHaveURL(/\/home\/console$/, {timeout: 15000});
    const token = await page.evaluate(() => JSON.parse(localStorage.getItem('DATAVISOOL_USER_INFO') || '{}').token as string);
    await page.goto('/home/aiModel'); await expect(page.getByRole('heading', {name: 'AI模型管理', exact: true})).toBeVisible();
    return {Authorization: `Bearer ${token}`};
}
async function seed(page: Page, headers: Record<string, string>, name: string, extra: Record<string, unknown> = {}) {
    const response = await page.request.post('/api/aiModel/create', {headers, data: {name, provider: 'deepseek', baseUrl: 'https://example.test/v1', apiKey: testKey, temperature: 0.7, enabled: 1, isDefault: 0, ...extra}});
    const body = await response.json(); expect(body.code).toBe(200); expect(String(body.data)).toMatch(/^\d+$/); return String(body.data);
}
async function refresh(page: Page) {await page.reload(); await expect(page.getByRole('heading', {name: 'AI模型管理', exact: true})).toBeVisible();}
async function openCreate(page: Page) {await header(page).getByRole('button', {name: '新建模型'}).click(); await expect(modal(page)).toBeVisible();}
async function search(page: Page, value: string) {
    const input = page.getByPlaceholder('搜索名称 / 提供商 / 接入地址'); await input.fill(value);
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/aiModel/pageList'); await input.press('Enter'); return await response;
}
async function menu(page: Page, name: string, action: string) {await card(page,name).getByRole('button',{name:'更多操作'}).click(); await page.getByRole('menuitem',{name:action,exact:true}).click();}
async function clickConfirm(page: Page, action: string) {await confirm(page).getByRole('button',{name:action,exact:true}).click();}
async function watchMessages(page: Page) {
    await page.evaluate(() => {
        (window as any).__aiModelMessages = [];
        new MutationObserver(() => document.querySelectorAll('.datavisool-global-message-content').forEach(item => (window as any).__aiModelMessages.push(item.textContent)))
            .observe(document.body, {childList: true, subtree: true});
    });
}
const status = (page: Page, label: string) => modal(page).locator('[data-ai-model-status-card]').filter({hasText:label}).getByRole('switch');
test.beforeEach(() => {sql('DELETE FROM ai_model WHERE user_id=1');});

for (const width of [1440, 1024, 700, 390]) test(`页面及新建窗口布局 ${width}px`, async ({page}) => {
    await page.setViewportSize({width,height:900}); await page.emulateMedia({reducedMotion:'reduce'});
    const headers = await login(page); await seed(page,headers,'layout-model'); await refresh(page); await expect(card(page,'layout-model')).toBeVisible();
    await page.screenshot({path:`../测试报告/AI模型管理/AI模型管理-${width}.png`,animations:'disabled'});
    const dimensions = await page.evaluate(() => ({scroll:document.documentElement.scrollWidth,width:innerWidth})); expect.soft(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
    await openCreate(page); await expect(modal(page).getByText('新建 AI 模型')).toBeVisible();
    if (width === 390) await page.screenshot({path:'../测试报告/AI模型管理/AI模型管理-390-新建.png',animations:'disabled'});
    const box = await modal(page).boundingBox(); expect.soft(box!.x).toBeGreaterThanOrEqual(0); expect.soft(box!.x+box!.width).toBeLessThanOrEqual(width+1);
    await expect.soft(modal(page).getByPlaceholder('例如：默认对话模型')).toBeInViewport();
    await modal(page).getByRole('button',{name:'创建',exact:true}).scrollIntoViewIfNeeded(); await expect.soft(modal(page).getByRole('button',{name:'创建',exact:true})).toBeInViewport();
});

test('空状态、默认值、验证和取消重置', async ({page}) => {
    await login(page); await expect(page.getByText('还没有 AI 模型配置')).toBeVisible(); await header(page).getByRole('button',{name:'删除',exact:true}).click(); await expect(page.getByText('请选择要删除的项目')).toBeVisible();
    await page.getByRole('button',{name:'新建模型',exact:true}).last().click(); await expect(modal(page).getByRole('combobox')).toContainText('DeepSeek');
    await expect(modal(page).getByPlaceholder('例如：https://api.deepseek.com')).toHaveValue('https://api.deepseek.com'); await expect(status(page,'启用状态')).toBeChecked(); await expect(status(page,'默认模型')).not.toBeChecked();
    await modal(page).getByRole('button',{name:'创建',exact:true}).click(); await expect(modal(page).getByText('请输入模型名称')).toBeVisible(); await expect(modal(page).getByText('请输入API Key')).toBeVisible();
    await modal(page).getByPlaceholder('例如：默认对话模型').fill('discard'); await modal(page).getByRole('button',{name:'取消'}).click(); await openCreate(page); await expect(modal(page).getByPlaceholder('例如：默认对话模型')).toHaveValue(''); expect(sql('SELECT COUNT(*) FROM ai_model WHERE deleted=0')).toBe('0');
});

test('真实创建配置、密钥加密与列表脱敏', async ({page}) => {
    const headers = await login(page); await openCreate(page); await modal(page).getByPlaceholder('例如：默认对话模型').fill('  created-model  '); await modal(page).getByPlaceholder('请输入API Key').fill(testKey);
    await modal(page).getByPlaceholder('补充说明模型用途、适用场景或限流说明').fill('测试说明'); await modal(page).getByRole('spinbutton').fill('4096'); await status(page,'默认模型').click();
    const response = page.waitForResponse(r=>new URL(r.url()).pathname==='/api/aiModel/create'); await modal(page).getByRole('button',{name:'创建',exact:true}).click(); expect((await (await response).json()).code).toBe(200);
    await expect(card(page,'created-model')).toBeVisible(); await expect(card(page,'created-model')).toContainText('默认模型'); await expect(card(page,'created-model')).toContainText('测试说明');
    expect(sql("SELECT CONCAT(name,':',provider,':',enabled,':',is_default,':',max_tokens,':',IF(api_key LIKE 'enc:v1:%','encrypted','not-encrypted')) FROM ai_model WHERE deleted=0")).toBe('created-model:deepseek:1:1:4096:encrypted');
    const list = await page.request.post('/api/aiModel/pageList',{headers,data:{current:1,size:10}}); const json = await list.json(); expect(json.data.records[0].hasApiKey).toBe(true); expect(json.data.records[0].apiKey).toBeFalsy(); expect(JSON.stringify(json)).not.toContain(testKey);
});

test('切换提供商、默认地址及自定义地址保留', async ({page}) => {
    await login(page); await openCreate(page); await modal(page).getByRole('combobox').click(); await expect(page.getByRole('option')).toHaveCount(12); await page.getByRole('option',{name:'OpenAI',exact:true}).click();
    await expect(modal(page).getByPlaceholder('例如：https://api.openai.com/v1')).toHaveValue('https://api.openai.com/v1');
    await modal(page).getByPlaceholder('例如：https://api.openai.com/v1').fill('https://gateway.example.test/v1');
    await modal(page).getByRole('combobox').click(); await page.getByRole('option',{name:'智谱 GLM'}).click();
    await expect(modal(page).getByPlaceholder('例如：https://open.bigmodel.cn/api/paas/v4')).toHaveValue('https://gateway.example.test/v1');
    await expect(modal(page).getByText('智谱温度范围为 0 到 1；建议只调整 Temperature 或 Top P 其中之一。')).toBeVisible();
});

test('编辑保留旧密钥并更新名称、地址和状态', async ({page}) => {
    const headers = await login(page); const id = await seed(page,headers,'before-edit'); const before = sql(`SELECT SHA2(api_key,256) FROM ai_model WHERE id=${id}`); await refresh(page);
    await card(page,'before-edit').getByRole('button',{name:'编辑'}).click(); await expect(modal(page).getByText('已保存 API Key，留空则保持原值，不会明文回显。')).toBeVisible();
    await expect(modal(page).locator('input[type=password]')).toHaveValue(''); await modal(page).getByPlaceholder('例如：默认对话模型').fill('edited-model');
    await modal(page).getByPlaceholder('例如：https://api.deepseek.com').fill('https://changed.example.test/v1'); await status(page,'启用状态').click();
    const response = page.waitForResponse(r=>new URL(r.url()).pathname==='/api/aiModel/update'); await modal(page).getByRole('button',{name:'保存'}).click(); expect((await (await response).json()).data).toBe(true);
    await expect(card(page,'edited-model')).toContainText('已停用'); expect(sql(`SELECT CONCAT(name,':',enabled,':',base_url) FROM ai_model WHERE id=${id}`)).toBe('edited-model:0:https://changed.example.test/v1'); expect(sql(`SELECT SHA2(api_key,256) FROM ai_model WHERE id=${id}`)).toBe(before);
});

test('替换已保存密钥不会泄露明文', async ({page}) => {
    const headers = await login(page); const id = await seed(page,headers,'key-update'); const before = sql(`SELECT SHA2(api_key,256) FROM ai_model WHERE id=${id}`); await refresh(page);
    await card(page,'key-update').getByRole('button',{name:'编辑'}).click(); await modal(page).locator('input[type=password]').fill('new-synthetic-key');
    const response = page.waitForResponse(r=>new URL(r.url()).pathname==='/api/aiModel/update'); await modal(page).getByRole('button',{name:'保存'}).click(); expect((await (await response).json()).data).toBe(true);
    expect(sql(`SELECT SHA2(api_key,256) FROM ai_model WHERE id=${id}`)).not.toBe(before); expect(sql(`SELECT IF(api_key LIKE 'enc:v1:%',1,0) FROM ai_model WHERE id=${id}`)).toBe('1');
    const list = await page.request.post('/api/aiModel/pageList',{headers,data:{current:1,size:10}}); expect(JSON.stringify(await list.json())).not.toContain('new-synthetic-key');
});

test('清空已保存密钥', async ({page}) => {
    const headers = await login(page); const id = await seed(page,headers,'clear-key'); await refresh(page); await card(page,'clear-key').getByRole('button',{name:'编辑'}).click();
    await modal(page).locator('[data-ai-model-field]').filter({hasText:'API Key 操作'}).getByRole('switch').click(); await expect(modal(page).locator('input[type=password]')).toBeDisabled();
    const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/aiModel/update');
    await modal(page).getByRole('button',{name:'保存'}).click(); expect((await (await response).json()).data).toBe(true);
    await expect(modal(page)).toHaveCount(0); expect(sql(`SELECT IF(api_key IS NULL OR api_key='',1,0) FROM ai_model WHERE id=${id}`)).toBe('1');
    await expect(card(page,'clear-key')).toContainText('未设置');
    const result=await (await page.request.post('/api/aiModel/pageList',{headers,data:{current:1,size:10}})).json(); expect(result.data.records[0].hasApiKey).toBe(false);
});

test('复制模型默认不复制密钥与默认标记', async ({page}) => {
    const headers = await login(page); await seed(page,headers,'source-model',{isDefault:1}); await refresh(page); await menu(page,'source-model','复制模型');
    await expect(modal(page).getByPlaceholder('例如：默认对话模型')).toHaveValue('source-model（复制）'); await expect(modal(page).locator('input[type=password]')).toHaveValue(''); await expect(status(page,'默认模型')).not.toBeChecked();
    await modal(page).locator('input[type=password]').fill('synthetic-copy-key'); const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/aiModel/create'); await modal(page).getByRole('button',{name:'创建'}).click(); expect((await (await response).json()).code).toBe(200);
    await expect(card(page,'source-model（复制）')).toBeVisible(); expect(sql('SELECT COUNT(*) FROM ai_model WHERE deleted=0')).toBe('2'); expect(sql('SELECT COUNT(*) FROM ai_model WHERE deleted=0 AND is_default=1')).toBe('1');
});

test('默认模型只能有一个且默认自动启用', async ({page}) => {
    const headers = await login(page); const a=await seed(page,headers,'default-a',{isDefault:1}); const b=await seed(page,headers,'default-b',{enabled:0,isDefault:0}); await refresh(page);
    await card(page,'default-b').getByRole('button',{name:'编辑'}).click(); await expect(status(page,'启用状态')).not.toBeChecked(); await status(page,'默认模型').click(); await expect(status(page,'启用状态')).toBeChecked();
    const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/aiModel/update'); await modal(page).getByRole('button',{name:'保存'}).click(); expect((await (await response).json()).data).toBe(true);
    expect(sql(`SELECT CONCAT(is_default,':',enabled) FROM ai_model WHERE id=${a}`)).toBe('0:1'); expect(sql(`SELECT CONCAT(is_default,':',enabled) FROM ai_model WHERE id=${b}`)).toBe('1:1');
});

test('复制接入地址', async ({page,context}) => {
    const headers = await login(page); await seed(page,headers,'copy-address'); await context.grantPermissions(['clipboard-read','clipboard-write']); await refresh(page);
    await card(page,'copy-address').getByRole('button',{name:'复制地址'}).click(); await expect(page.getByText('复制成功')).toBeVisible(); expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe('https://example.test/v1');
});

test('搜索名称、提供商、地址和普通分页', async ({page}) => {
    const headers = await login(page); for(let i=0;i<11;i++) await seed(page,headers,`plain-${String(i).padStart(2,'0')}`, {baseUrl:`https://host-${i}.example.test`}); await refresh(page);
    await expect(page.locator('article')).toHaveCount(10); await page.getByRole('button',{name:'第 2 页'}).click(); await expect(page.locator('article')).toHaveCount(1);
    let response=await search(page,'  plain-00  '); expect(response.request().postDataJSON()).toMatchObject({current:1,searchValue:'plain-00'}); await expect(card(page,'plain-00')).toBeVisible();
    await search(page,'host-0.example'); await expect(card(page,'plain-00')).toBeVisible(); await search(page,'unmatched'); await expect(page.getByText('还没有 AI 模型配置')).toBeVisible();
    await search(page,'deepseek'); await expect(page.locator('.datavisool-pagination-total')).toContainText('共 11 条'); await search(page,''); await expect(page.locator('article')).toHaveCount(10);
});

test('搜索后翻页保留条件', async ({page}) => {
    const headers=await login(page); for(let i=0;i<11;i++) await seed(page,headers,`match-${String(i).padStart(2,'0')}`); await seed(page,headers,'unrelated'); await refresh(page);
    await search(page,'match-'); await expect(page.locator('.datavisool-pagination-total')).toContainText('共 11 条'); const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/aiModel/pageList'&&r.request().postDataJSON().current===2);
    await page.getByRole('button',{name:'第 2 页'}).click(); const result=await response; expect.soft(result.request().postDataJSON().searchValue).toBe('match-'); expect.soft((await result.json()).data.total).toBe(11); await expect.soft(page.locator('article')).toHaveCount(1,{timeout:3000});
});

test('单项及批量删除、取消和选择切换', async ({page}) => {
    const headers=await login(page); await seed(page,headers,'one'); await seed(page,headers,'two'); await seed(page,headers,'three'); await refresh(page);
    await menu(page,'one','删除'); await clickConfirm(page,'取消'); expect(sql('SELECT COUNT(*) FROM ai_model WHERE deleted=0')).toBe('3');
    await menu(page,'one','删除'); let response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/aiModel/batchDel'); await clickConfirm(page,'确定'); expect((await (await response).json()).data).toBe(true); await expect(card(page,'one')).toHaveCount(0);
    for(const name of ['two','three']) { const select=card(page,name).getByRole('button',{name:/选择模型|取消选择/}); if(await select.getAttribute('aria-pressed')==='false') await select.click(); }
    await header(page).getByRole('button',{name:'删除',exact:true}).click(); await clickConfirm(page,'取消'); expect(sql('SELECT COUNT(*) FROM ai_model WHERE deleted=0')).toBe('2');
    await header(page).getByRole('button',{name:'删除',exact:true}).click(); response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/aiModel/batchDel'); await clickConfirm(page,'确定'); expect((await (await response).json()).data).toBe(true);
    await expect(page.getByText('还没有 AI 模型配置')).toBeVisible(); expect(sql('SELECT COUNT(*) FROM ai_model WHERE deleted=1')).toBe('3');
});

test('删除末页唯一记录应回到有效页', async ({page}) => {
    const headers=await login(page); for(let i=0;i<11;i++) await seed(page,headers,`last-${String(i).padStart(2,'0')}`); await refresh(page); await page.getByRole('button',{name:'第 2 页'}).click(); await expect(page.locator('article')).toHaveCount(1);
    await page.locator('article').first().getByRole('button',{name:'更多操作'}).click(); await page.getByRole('menuitem',{name:'删除',exact:true}).click(); const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/aiModel/batchDel'); await clickConfirm(page,'确定'); expect((await (await response).json()).data).toBe(true);
    await expect(page.locator('.datavisool-pagination-total')).toContainText('共 10 条'); expect(sql('SELECT COUNT(*) FROM ai_model WHERE deleted=0')).toBe('10'); await expect(page.locator('article')).toHaveCount(10,{timeout:3000});
});

test('模拟创建业务失败保留输入并可真实重试', async ({page}) => {
    await login(page); let fail=true; await page.route('**/api/aiModel/create',async route=>{if(fail){fail=false;await route.fulfill({json:{code:500,msg:'模拟创建失败',data:null}});}else await route.continue();});
    await openCreate(page); await modal(page).getByPlaceholder('例如：默认对话模型').fill('retry-model'); await modal(page).locator('input[type=password]').fill(testKey); await modal(page).getByRole('button',{name:'创建'}).click();
    await expect(page.getByText('模拟创建失败')).toBeVisible(); await expect(modal(page).getByPlaceholder('例如：默认对话模型')).toHaveValue('retry-model');
    const passwordInput = modal(page).locator('input[type=password]'); await expect(passwordInput).toHaveValue(testKey);
    expect(sql('SELECT COUNT(*) FROM ai_model WHERE deleted=0')).toBe('0');
    const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/aiModel/create'); await modal(page).getByRole('button',{name:'创建'}).click(); expect((await (await response).json()).code).toBe(200); await expect(card(page,'retry-model')).toBeVisible();
});

test('模拟编辑返回 false 不应显示成功', async ({page}) => {
    const headers=await login(page); await seed(page,headers,'update-fail'); await refresh(page); await page.route('**/api/aiModel/update',route=>route.fulfill({json:{code:200,msg:'成功',data:false}}));
    await watchMessages(page);
    await card(page,'update-fail').getByRole('button',{name:'编辑'}).click(); await modal(page).getByPlaceholder('例如：默认对话模型').fill('never-saved'); const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/aiModel/update'); await modal(page).getByRole('button',{name:'保存'}).click(); await response; await page.waitForTimeout(700);
    expect.soft(await page.evaluate(()=>(window as any).__aiModelMessages)).not.toContain('操作成功'); await expect(modal(page)).toBeVisible(); await expect(modal(page).getByPlaceholder('例如：默认对话模型')).toHaveValue('never-saved'); await expect(page.getByText('保存失败')).toBeVisible(); expect(sql('SELECT name FROM ai_model WHERE deleted=0')).toBe('update-fail');
});

test('模拟删除返回 false 不应显示成功', async ({page}) => {
    const headers=await login(page); await seed(page,headers,'delete-fail'); await refresh(page); await page.route('**/api/aiModel/batchDel',route=>route.fulfill({json:{code:200,msg:'成功',data:false}}));
    await watchMessages(page);
    await menu(page,'delete-fail','删除'); const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/aiModel/batchDel'); await clickConfirm(page,'确定'); await response; await page.waitForTimeout(700);
    expect.soft(await page.evaluate(()=>(window as any).__aiModelMessages)).not.toContain('删除成功'); await expect(page.getByText('删除失败')).toBeVisible(); await expect(confirm(page)).toBeVisible(); expect(sql('SELECT COUNT(*) FROM ai_model WHERE deleted=0')).toBe('1');
});

test('连续提交创建只产生一条记录', async ({page}) => {
    await login(page); let release!:()=>void; const wait=new Promise<void>(resolve=>{release=resolve;}); let sent=0;
    await page.route('**/api/aiModel/create',async route=>{sent++; await wait; await route.continue();}); await openCreate(page); await modal(page).getByPlaceholder('例如：默认对话模型').fill('duplicate'); await modal(page).locator('input[type=password]').fill(testKey);
    try {await modal(page).getByRole('button',{name:'创建'}).click(); await expect.poll(()=>sent).toBe(1); await modal(page).getByRole('button',{name:'创建'}).click({timeout:1500}).catch(()=>{}); await page.waitForTimeout(500); expect.soft(sent).toBe(1);} finally {release();}
    await expect(card(page,'duplicate').first()).toBeVisible(); await page.waitForTimeout(800); expect.soft(sql("SELECT COUNT(*) FROM ai_model WHERE name='duplicate' AND deleted=0")).toBe('1');
});

test('卡片更新时间按日期时间显示', async ({page}) => {
    const headers=await login(page); await seed(page,headers,'time-format'); await refresh(page);
    const time=card(page,'time-format').getByText(/^更新于/); await expect(time).toBeVisible();
    await expect(time).toHaveText(/^更新于 \d{2}\/\d{2} \d{2}:\d{2}$/);
});

test('无效接入地址不能保存', async ({page}) => {
    await login(page); await openCreate(page); await modal(page).getByPlaceholder('例如：默认对话模型').fill('bad-address'); await modal(page).getByPlaceholder('例如：https://api.deepseek.com').fill('not-a-url'); await modal(page).locator('input[type=password]').fill(testKey);
    await modal(page).getByRole('button',{name:'创建'}).click();
    await expect(modal(page).getByText('请输入有效的 HTTP 或 HTTPS 接入地址')).toBeVisible(); expect(sql("SELECT COUNT(*) FROM ai_model WHERE name='bad-address' AND deleted=0")).toBe('0'); await expect(modal(page)).toBeVisible();
});

test('直接请求清空密钥后数据库不再保留密钥', async ({page}) => {
    const headers=await login(page); const id=await seed(page,headers,'direct-clear');
    const response=await page.request.post('/api/aiModel/update',{headers,data:{id,name:'direct-clear',provider:'deepseek',baseUrl:'https://example.test/v1',temperature:0.7,enabled:1,isDefault:0,clearApiKey:1}});
    expect((await response.json()).data).toBe(true); expect(sql(`SELECT IF(api_key IS NULL OR api_key='',1,0) FROM ai_model WHERE id=${id}`)).toBe('1');
});

test('模拟创建返回 false 不应关闭窗口或提示成功', async ({page}) => {
    await login(page); await page.route('**/api/aiModel/create',route=>route.fulfill({json:{code:200,msg:'成功',data:false}})); await openCreate(page);
    await watchMessages(page);
    await modal(page).getByPlaceholder('例如：默认对话模型').fill('create-false'); await modal(page).locator('input[type=password]').fill(testKey);
    const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/aiModel/create'); await modal(page).getByRole('button',{name:'创建'}).click(); await response; await page.waitForTimeout(700);
    expect.soft(await page.evaluate(()=>(window as any).__aiModelMessages)).not.toContain('操作成功'); await expect(modal(page)).toBeVisible(); await expect(modal(page).locator('input[type=password]')).toHaveValue(testKey); await expect(page.getByText('创建失败')).toBeVisible(); expect(sql('SELECT COUNT(*) FROM ai_model WHERE deleted=0')).toBe('0');
});

test('无法编辑或删除其他用户的模型', async ({page}) => {
    const headers=await login(page); const id=await seed(page,headers,'other-owner'); sql(`UPDATE ai_model SET user_id=2 WHERE id=${id}`);
    try {
        const update=await page.request.post('/api/aiModel/update',{headers,data:{id,name:'hijacked',provider:'deepseek'}}); expect((await update.json()).code).not.toBe(200);
        const del=await page.request.post('/api/aiModel/batchDel',{headers,data:[id]}); expect((await del.json()).data).toBe(false);
        expect(sql(`SELECT CONCAT(name,':',deleted) FROM ai_model WHERE id=${id}`)).toBe('other-owner:0');
    } finally {sql(`DELETE FROM ai_model WHERE id=${id}`);}
});

test('名称和描述长度限制', async ({page}) => {
    await login(page); await openCreate(page);
    await modal(page).getByPlaceholder('例如：默认对话模型').fill('名'.repeat(110)); await expect(modal(page).getByPlaceholder('例如：默认对话模型')).toHaveValue('名'.repeat(100));
    await modal(page).getByPlaceholder('补充说明模型用途、适用场景或限流说明').fill('描'.repeat(310)); await expect(modal(page).getByPlaceholder('补充说明模型用途、适用场景或限流说明')).toHaveValue('描'.repeat(300));
});

test('默认模型开关与停用状态一致', async ({page}) => {
    const headers=await login(page); const id=await seed(page,headers,'default-status',{isDefault:1}); await refresh(page);
    await card(page,'default-status').getByRole('button',{name:'编辑'}).click(); await expect(status(page,'默认模型')).toBeChecked(); await status(page,'启用状态').click();
    const isDefault=await status(page,'默认模型').isChecked(); const isEnabled=await status(page,'启用状态').isChecked(); expect.soft(isDefault && !isEnabled).toBe(false);
    const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/aiModel/update'); await modal(page).getByRole('button',{name:'保存'}).click(); expect((await (await response).json()).data).toBe(true);
    expect.soft(sql(`SELECT CONCAT(is_default,':',enabled) FROM ai_model WHERE id=${id}`)).toBe(`${Number(isDefault)}:${Number(isEnabled)}`);
});

test('可切换全部提供商选项', async ({page}) => {
    await login(page); await openCreate(page);
    const providers=['OpenAI','千问 Qwen','Kimi','智谱 GLM','MiniMax','豆包（火山方舟）','腾讯混元','Google Gemini','xAI Grok','DeepSeek','小米 MiMo','Anthropic'];
    for(const provider of providers) {
        await modal(page).getByRole('combobox').click(); await page.getByRole('option',{name:provider,exact:true}).click(); await expect(modal(page).getByRole('combobox')).toContainText(provider);
    }
});

test('真实后端拒绝无效接入地址并保留原配置', async ({page}) => {
    const headers=await login(page); const id=await seed(page,headers,'valid-endpoint');
    for (const baseUrl of ['not-a-url','ftp://example.test/v1','https://','http://localhost:99999/v1']) {
        const created=await page.request.post('/api/aiModel/create',{headers,data:{name:'bad-api',provider:'deepseek',baseUrl}}); expect((await created.json()).code).not.toBe(200);
        const updated=await page.request.post('/api/aiModel/update',{headers,data:{id,name:'valid-endpoint',provider:'deepseek',baseUrl}}); expect((await updated.json()).code).not.toBe(200);
    }
    expect(sql('SELECT COUNT(*) FROM ai_model WHERE deleted=0')).toBe('1'); expect(sql(`SELECT base_url FROM ai_model WHERE id=${id}`)).toBe('https://example.test/v1');
    const local=await page.request.post('/api/aiModel/create',{headers,data:{name:'local-api',provider:'deepseek',baseUrl:'http://localhost:11434/v1'}}); expect((await local.json()).code).toBe(200);
});

test('筛选后删除末页保留搜索并回到有效页', async ({page}) => {
    const headers=await login(page); for(let i=0;i<11;i++) await seed(page,headers,`filtered-${String(i).padStart(2,'0')}`); await seed(page,headers,'other'); await refresh(page);
    await search(page,'filtered-'); await expect(page.locator('.datavisool-pagination-total')).toContainText('共 11 条'); await page.getByRole('button',{name:'第 2 页'}).click(); await expect(page.locator('article')).toHaveCount(1);
    await page.locator('article').first().getByRole('button',{name:'更多操作'}).click(); await page.getByRole('menuitem',{name:'删除',exact:true}).click(); await clickConfirm(page,'确定');
    await expect(page.locator('.datavisool-pagination-total')).toContainText('共 10 条'); await expect(page.locator('article')).toHaveCount(10); await expect(card(page,'other')).toHaveCount(0);
});
