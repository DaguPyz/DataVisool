/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {expect, test, type Page} from '@playwright/test';
import {execFileSync} from 'node:child_process';

const backend = process.env.DATAVISOOL_SERVER_DEV_TARGET || '';
const user = process.env.DATAVISOOL_E2E_USERNAME || '';
const password = process.env.DATAVISOOL_E2E_PASSWORD || '';
const db = process.env.DATAVISOOL_TEST_MYSQL_DATABASE || '';
const container = process.env.DATAVISOOL_TEST_MYSQL_CONTAINER || '';
const dbPassword = process.env.DATAVISOOL_TEST_MYSQL_PASSWORD || '';
const newPassword = 'User-Test-9271!';
const enabled = process.env.DATAVISOOL_E2E_ALLOW_WRITES === 'isolated' && !!user && !!password && !!dbPassword
    && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(backend)
    && /^datavisool_user_test_[a-z0-9_]+$/.test(db) && /^datavisool-user-e2e-[a-z0-9-]+$/.test(container);
test.skip(!enabled, '需要独立用户管理测试库、专用容器、本地后端和隔离写入开关');
test.use({trace:'off', screenshot:'off', video:'off'});
test.setTimeout(50_000);
function sql(query:string) { if(!enabled) throw Error('禁止操作非隔离库'); return execFileSync('docker',['exec','-e',`MYSQL_PWD=${dbPassword}`,container,'mysql','-uroot','--default-character-set=utf8mb4','--batch','--skip-column-names',db,'-e',query],{encoding:'utf8'}).trim(); }
const row = (p:Page, name:string) => p.locator('[class*="tableRow"]').filter({has:p.locator('strong').getByText(name,{exact:true})});
const modal = (p:Page) => p.getByRole('dialog').filter({hasText:/新增用户|编辑用户/});
const confirm = (p:Page) => p.getByRole('dialog').last();
async function login(p:Page) {
    await p.addInitScript(()=>localStorage.setItem('datavisool-i18n-locale','zh-CN'));
    await p.goto('/login'); await p.getByLabel('用户名').fill(user); await p.getByLabel('密码').fill(password); await p.getByRole('button',{name:'登录',exact:true}).click();
    await expect(p).toHaveURL(/\/home\/console$/, {timeout:20000});
    const token = await p.evaluate(()=>JSON.parse(localStorage.getItem('DATAVISOOL_USER_INFO') || '{}').token as string);
    const loaded=p.waitForResponse(r=>new URL(r.url()).pathname==='/api/user/pageList'); await p.goto('/home/user'); await expect(p.getByRole('heading',{name:'用户管理',exact:true})).toBeVisible(); await loaded;
    return {Authorization:`Bearer ${token}`};
}
async function seed(p:Page, headers:Record<string,string>, name:string, extra:Record<string,unknown>={}) {
    const res=await p.request.post('/api/user/create',{headers,data:{username:`login_${name}`,name,phone:'13800000000',email:`${name}@example.test`,password:newPassword,...extra}});
    const body=await res.json(); expect(body.code).toBe(200); return String(body.data);
}
async function reload(p:Page) {const response=p.waitForResponse(r=>new URL(r.url()).pathname==='/api/user/pageList'); await p.reload(); await response;}
async function openCreate(p:Page) {await p.locator('header').getByRole('button',{name:'新建用户'}).click(); await expect(modal(p)).toBeVisible();}
async function search(p:Page, value:string) {const input=p.getByPlaceholder('搜索用户名 / 姓名 / 邮箱'); await input.fill(value); const response=p.waitForResponse(r=>new URL(r.url()).pathname==='/api/user/pageList'); await input.press('Enter'); await response;}
async function remove(p:Page,name:string) {await row(p,name).getByRole('button',{name:'删除'}).click(); await confirm(p).getByRole('button',{name:'确定'}).click();}
test.beforeEach(()=>sql('DELETE FROM auth_user_role WHERE user_id <> 1; DELETE FROM local_auth WHERE user_id <> 1; DELETE FROM user WHERE id <> 1;'));

for(const width of [1440,1024,700,390]) test(`页面与弹窗布局 ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:900}); await page.emulateMedia({reducedMotion:'reduce'}); const h=await login(page); await seed(page,h,'layout'); await reload(page); await expect(row(page,'layout')).toBeVisible();
    await page.screenshot({path:`../测试报告/用户管理/用户管理-${width}.png`,animations:'disabled'});
    expect.soft(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const createBox=await page.locator('header').getByRole('button',{name:'新建用户'}).boundingBox(); const deleteBox=await page.locator('header').getByRole('button',{name:'删除',exact:true}).boundingBox(); expect.soft(createBox!.width).toBeGreaterThanOrEqual(90); expect.soft(deleteBox!.width).toBeGreaterThanOrEqual(70);
    await openCreate(page); const box=await modal(page).boundingBox(); expect.soft(box!.x).toBeGreaterThanOrEqual(0); expect.soft(box!.x+box!.width).toBeLessThanOrEqual(width+1);
    if(width===390) await page.screenshot({path:'../测试报告/用户管理/用户管理-390-新增.png',animations:'disabled'});
    await modal(page).getByRole('button',{name:'提交'}).scrollIntoViewIfNeeded(); await expect(modal(page).getByRole('button',{name:'提交'})).toBeInViewport();
});

test('空状态、必填验证和取消重置',async({page})=>{
    await login(page); await expect(page.getByText('暂无用户')).toBeVisible(); await page.locator('header').getByRole('button',{name:'删除',exact:true}).click(); await expect(page.getByText('请选择要删除的用户')).toBeVisible();
    await openCreate(page); await modal(page).getByRole('button',{name:'提交'}).click(); await expect(page.getByText('请输入用户名',{exact:true})).toBeVisible();
    await modal(page).getByPlaceholder('用于登录的用户名').fill('discard'); await modal(page).getByRole('button',{name:'提交'}).click(); await expect(page.getByText('请输入姓名',{exact:true})).toBeVisible();
    await modal(page).getByPlaceholder('用于显示的姓名').fill('取消测试'); await modal(page).getByRole('button',{name:'提交'}).click(); await expect(page.getByText('密码至少8个字符且不超过72字节')).toBeVisible(); await modal(page).getByPlaceholder('至少8个字符，最多72字节').fill('😀😀😀😀'); await modal(page).getByRole('button',{name:'提交'}).click(); await expect(page.getByText('密码至少8个字符且不超过72字节').first()).toBeVisible(); await modal(page).getByPlaceholder('至少8个字符，最多72字节').fill('weak'); await modal(page).getByRole('button',{name:'提交'}).click(); await expect(page.getByText('密码至少8个字符且不超过72字节').first()).toBeVisible(); await modal(page).getByRole('button',{name:'取消'}).click(); await openCreate(page); await expect(modal(page).getByPlaceholder('用于登录的用户名')).toHaveValue(''); expect(sql('SELECT COUNT(*) FROM user WHERE id<>1')).toBe('0');
});

test('创建、编辑及角色授权保存',async({page})=>{
    await login(page); await openCreate(page); await modal(page).getByPlaceholder('用于登录的用户名').fill('  create_login  '); await modal(page).getByPlaceholder('用于显示的姓名').fill('  创建姓名  ');
    await modal(page).getByPlaceholder('请输入电话').fill('  13811112222 '); await modal(page).getByPlaceholder('请输入邮箱').fill('  create@example.test ');
    await modal(page).getByPlaceholder('至少8个字符，最多72字节').fill(newPassword); await modal(page).getByRole('button',{name:/普通用户/}).click(); let response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/user/createEncrypted'); await modal(page).getByRole('button',{name:'提交'}).click(); expect((await (await response).json()).code).toBe(200);
    await expect(row(page,'创建姓名')).toContainText('create_login'); expect(sql("SELECT CONCAT(username,':',name,':',phone,':',email) FROM user WHERE username='create_login' AND deleted=0")).toBe('create_login:创建姓名:13811112222:create@example.test');
    expect(sql("SELECT COUNT(*) FROM auth_user_role aur JOIN user u ON aur.user_id=u.id JOIN auth_role r ON r.id=aur.role_id WHERE u.username='create_login' AND r.name='ROLE_USER' AND aur.deleted=0")).toBe('1');
    await row(page,'创建姓名').getByRole('button',{name:'编辑'}).click(); await expect(modal(page).getByPlaceholder('用于显示的姓名')).toHaveValue('创建姓名');
    await modal(page).getByPlaceholder('用于显示的姓名').fill('修改姓名'); await modal(page).getByPlaceholder('请输入电话').fill('13999990000');
    response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/user/update'); await modal(page).getByRole('button',{name:'提交'}).click(); expect((await (await response).json()).data).toBe(true); await expect(row(page,'修改姓名')).toContainText('13999990000');
    expect(sql("SELECT name FROM user WHERE username='create_login'")).toBe('修改姓名'); await reload(page); await expect(row(page,'修改姓名')).toBeVisible();
});

test('重复用户名创建被拒绝并保留输入',async({page})=>{
    const h=await login(page); await seed(page,h,'duplicate'); await openCreate(page); await modal(page).getByPlaceholder('用于登录的用户名').fill('login_duplicate'); await modal(page).getByPlaceholder('用于显示的姓名').fill('重复用户'); await modal(page).getByPlaceholder('至少8个字符，最多72字节').fill(newPassword);
    const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/user/createEncrypted'); await modal(page).getByRole('button',{name:'提交'}).click(); expect((await (await response).json()).code).not.toBe(200); await expect(modal(page)).toBeVisible(); await expect(modal(page).getByPlaceholder('用于显示的姓名')).toHaveValue('重复用户'); expect(sql("SELECT COUNT(*) FROM user WHERE username='login_duplicate'")).toBe('1');
});

for(const field of ['name','username','email']) test(`按${field}搜索`,async({page})=>{
    const h=await login(page); await seed(page,h,'findname',{username:'unique_login',email:'unique_email@example.test'}); await reload(page);
    await search(page,field==='name'?'findname':field==='username'?'unique_login':'unique_email'); await expect(row(page,'findname')).toBeVisible({timeout:3000});
});

test('搜索无结果、清空搜索',async({page})=>{const h=await login(page); await seed(page,h,'searchable'); await reload(page); await search(page,'missing_value'); await expect(page.getByText('暂无用户')).toBeVisible(); await search(page,''); await expect(row(page,'searchable')).toBeVisible();});

test('搜索后分页保持筛选',async({page})=>{const h=await login(page); for(let i=0;i<11;i++) await seed(page,h,`match${String(i).padStart(2,'0')}`); await seed(page,h,'other'); await reload(page); await search(page,'match'); await expect(page.locator('.datavisool-pagination-total')).toContainText('共 11 条'); const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/user/pageList' && r.request().postDataJSON().current===2); await page.getByRole('button',{name:'第 2 页'}).click(); expect((await response).request().postDataJSON().searchValue).toBe('match'); await expect(page.locator('.datavisool-pagination-total')).toContainText('共 11 条');});

test('单个和批量删除、取消及全选',async({page})=>{const h=await login(page); for(const name of ['one','two','three']) await seed(page,h,name); await reload(page); await row(page,'one').getByRole('button',{name:'删除'}).click(); await confirm(page).getByRole('button',{name:'取消'}).click(); await expect(row(page,'one')).toBeVisible(); await remove(page,'one'); await expect(row(page,'one')).toHaveCount(0); await page.getByRole('button',{name:'全选'}).click(); await page.locator('header').getByRole('button',{name:'删除',exact:true}).click(); await confirm(page).getByRole('button',{name:'取消'}).click(); expect(sql('SELECT COUNT(*) FROM user WHERE id<>1 AND deleted=0')).toBe('2'); await page.locator('header').getByRole('button',{name:'删除',exact:true}).click(); await confirm(page).getByRole('button',{name:'确定'}).click(); await expect(page.getByText('暂无用户')).toBeVisible(); expect(sql('SELECT COUNT(*) FROM user WHERE id<>1 AND deleted=1')).toBe('3');});

test('删除末页最后用户后返回有效页',async({page})=>{const h=await login(page); for(let i=0;i<11;i++) await seed(page,h,`last${i}`); await reload(page); await page.getByRole('button',{name:'第 2 页'}).click(); await expect(page.getByRole('button',{name:'选择用户'})).toHaveCount(1); await page.getByRole('button',{name:'删除',exact:true}).last().click(); await confirm(page).getByRole('button',{name:'确定'}).click(); await expect(page.getByRole('button',{name:'选择用户'})).toHaveCount(10,{timeout:4000});});

for(const operation of ['create','update','batchDel']) test(`模拟${operation}返回 false 应提示失败`,async({page})=>{
    const h=await login(page); if(operation!=='create'){await seed(page,h,'falsecase'); await reload(page);} const endpoint = operation==='create' ? 'createEncrypted' : operation; await page.route(`**/api/user/${endpoint}`,route=>route.fulfill({json:{code:200,msg:'成功',data:false}}));
    if(operation==='create'){await openCreate(page); await modal(page).getByPlaceholder('用于登录的用户名').fill('false_login'); await modal(page).getByPlaceholder('用于显示的姓名').fill('false_name'); await modal(page).getByPlaceholder('至少8个字符，最多72字节').fill(newPassword); const response=page.waitForResponse(r=>new URL(r.url()).pathname===`/api/user/${endpoint}`); await modal(page).getByRole('button',{name:'提交'}).click(); await response; await page.waitForTimeout(500); await expect(modal(page)).toBeVisible({timeout:3000}); await expect(page.getByText('创建失败',{exact:true})).toBeVisible(); await expect(modal(page).getByPlaceholder('用于显示的姓名')).toHaveValue('false_name');}
    if(operation==='update'){await row(page,'falsecase').getByRole('button',{name:'编辑'}).click(); await modal(page).getByPlaceholder('用于显示的姓名').fill('not_saved'); const response=page.waitForResponse(r=>new URL(r.url()).pathname===`/api/user/${endpoint}`); await modal(page).getByRole('button',{name:'提交'}).click(); await response; await page.waitForTimeout(500); await expect(modal(page)).toBeVisible({timeout:3000}); await expect(page.getByText('保存失败',{exact:true})).toBeVisible(); await expect(modal(page).getByPlaceholder('用于显示的姓名')).toHaveValue('not_saved');}
    if(operation==='batchDel'){await row(page,'falsecase').getByRole('button',{name:'删除'}).click(); const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/user/batchDel'); await confirm(page).getByRole('button',{name:'确定'}).click(); await response; await page.waitForTimeout(500); await expect(page.getByText('删除成功')).toHaveCount(0,{timeout:3000}); await expect(page.getByText('删除失败',{exact:true})).toBeVisible(); await expect(confirm(page)).toBeVisible();}
});

test('默认角色及指定密码登录',async({page,browser})=>{
    await login(page); await openCreate(page); await modal(page).getByPlaceholder('用于登录的用户名').fill('default_user'); await modal(page).getByPlaceholder('用于显示的姓名').fill('默认角色'); await modal(page).getByPlaceholder('至少8个字符，最多72字节').fill(newPassword);
    const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/user/createEncrypted'); await modal(page).getByRole('button',{name:'提交'}).click(); expect((await (await response).json()).code).toBe(200); await expect(row(page,'默认角色')).toBeVisible();
    expect(sql("SELECT COUNT(*) FROM auth_user_role aur JOIN user u ON aur.user_id=u.id JOIN auth_role r ON r.id=aur.role_id WHERE u.username='default_user' AND r.name='ROLE_USER' AND aur.deleted=0")).toBe('1');
    const context=await browser.newContext({baseURL:'http://127.0.0.1:4179'}); await context.addInitScript(()=>localStorage.setItem('datavisool-i18n-locale','zh-CN')); const p=await context.newPage(); await p.goto('/login'); await p.getByLabel('用户名').fill('default_user'); await p.getByLabel('密码').fill(newPassword); await p.getByRole('button',{name:'登录',exact:true}).click(); await expect(p).toHaveURL(/\/home\/console$/, {timeout:15000}); await context.close();
});

test('编辑时移除并重新授予普通用户角色',async({page})=>{
    const h=await login(page); await seed(page,h,'rolechange'); await reload(page); await row(page,'rolechange').getByRole('button',{name:'编辑'}).click(); await modal(page).getByRole('button',{name:/普通用户/}).click(); let response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/user/update'); await modal(page).getByRole('button',{name:'提交'}).click(); expect((await (await response).json()).data).toBe(true); await expect(modal(page)).toHaveCount(0); expect(sql("SELECT COUNT(*) FROM auth_user_role aur JOIN user u ON aur.user_id=u.id WHERE u.username='login_rolechange' AND aur.deleted=0")).toBe('0');
    await row(page,'rolechange').getByRole('button',{name:'编辑'}).click(); await modal(page).getByRole('button',{name:/普通用户/}).click(); response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/user/update'); await modal(page).getByRole('button',{name:'提交'}).click(); expect((await (await response).json()).data).toBe(true); await expect(modal(page)).toHaveCount(0); expect(sql("SELECT COUNT(*) FROM auth_user_role aur JOIN user u ON aur.user_id=u.id WHERE u.username='login_rolechange' AND aur.deleted=0")).toBe('1');
});

test('普通用户不能调用用户列表和创建接口',async({page,browser})=>{
    const h=await login(page); await seed(page,h,'limited'); const context=await browser.newContext({baseURL:'http://127.0.0.1:4179'}); await context.addInitScript(()=>localStorage.setItem('datavisool-i18n-locale','zh-CN')); const p=await context.newPage(); await p.goto('/login'); await p.getByLabel('用户名').fill('login_limited'); await p.getByLabel('密码').fill(newPassword); await p.getByRole('button',{name:'登录',exact:true}).click(); await expect(p).toHaveURL(/\/home\/console$/, {timeout:15000}); const token=await p.evaluate(()=>JSON.parse(localStorage.getItem('DATAVISOOL_USER_INFO')||'{}').token); const headers={Authorization:`Bearer ${token}`};
    const list=await p.request.post('/api/user/pageList',{headers,data:{current:1,size:10}}); const create=await p.request.post('/api/user/create',{headers,data:{username:'forbidden',name:'forbidden'}}); expect(list.ok() && (await list.json().catch(()=>({}))).code===200).toBe(false); expect(create.ok() && (await create.json().catch(()=>({}))).code===200).toBe(false); expect(sql("SELECT COUNT(*) FROM user WHERE username='forbidden'")).toBe('0'); await context.close();
});

test('模拟创建失败后保留输入并可重试真实后端',async({page})=>{
    await login(page); let fail=true; await page.route('**/api/user/createEncrypted',async route=>{if(fail){fail=false; await route.fulfill({json:{code:500,msg:'模拟创建失败',data:null}});}else await route.continue();}); await openCreate(page); await modal(page).getByPlaceholder('用于登录的用户名').fill('retry_login'); await modal(page).getByPlaceholder('用于显示的姓名').fill('retry_name'); await modal(page).getByPlaceholder('至少8个字符，最多72字节').fill(newPassword); await modal(page).getByRole('button',{name:'提交'}).click(); await expect(page.getByText('模拟创建失败')).toBeVisible(); await expect(modal(page).getByPlaceholder('用于显示的姓名')).toHaveValue('retry_name'); const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/user/createEncrypted'); await modal(page).getByRole('button',{name:'提交'}).click(); expect((await (await response).json()).code).toBe(200); await expect(row(page,'retry_name')).toBeVisible();
});

test('创建请求未完成时防止重复提交',async({page})=>{
    await login(page); let release!:()=>void; const gate=new Promise<void>(resolve=>{release=resolve}); let count=0; await page.route('**/api/user/createEncrypted',async route=>{count++; await gate; await route.continue();}); await openCreate(page); await modal(page).getByPlaceholder('用于登录的用户名').fill('pending_login'); await modal(page).getByPlaceholder('用于显示的姓名').fill('pending_name'); await modal(page).getByPlaceholder('至少8个字符，最多72字节').fill(newPassword);
    try {await modal(page).getByRole('button',{name:'提交'}).click(); await expect.poll(()=>count).toBe(1); await modal(page).getByRole('button',{name:'提交'}).click({timeout:1500}).catch(()=>{}); await page.waitForTimeout(400); expect.soft(count).toBe(1);} finally {release();} await expect(row(page,'pending_name').first()).toBeVisible(); await expect.poll(()=>sql("SELECT COUNT(*) FROM user WHERE username='pending_login' AND deleted=0")).toBe('1');
});

test('编辑用户名不能与其他用户重复',async({page})=>{
    const h=await login(page); await seed(page,h,'first'); await seed(page,h,'second'); await reload(page); await row(page,'second').getByRole('button',{name:'编辑'}).click(); await modal(page).getByPlaceholder('用于登录的用户名').fill('login_first'); const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/user/update'); await modal(page).getByRole('button',{name:'提交'}).click(); await response; await page.waitForTimeout(500); expect(sql("SELECT COUNT(*) FROM user WHERE username='login_first' AND deleted=0")).toBe('1'); await expect(modal(page)).toBeVisible();
});

test('初始密码由管理员指定并加密提交，旧默认密码不再可用',async({page,browser})=>{
    const h=await login(page); await openCreate(page); await modal(page).getByPlaceholder('用于登录的用户名').fill('secure_login'); await modal(page).getByPlaceholder('用于显示的姓名').fill('secure_name'); await modal(page).getByPlaceholder('至少8个字符，最多72字节').fill(newPassword);
    const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/user/createEncrypted'); await modal(page).getByRole('button',{name:'提交'}).click(); const result=await response; expect(result.request().postData()).not.toContain(newPassword); expect((await result.json()).code).toBe(200); await expect(row(page,'secure_name')).toBeVisible();
    expect(sql("SELECT LEFT(la.password,4) FROM local_auth la JOIN user u ON u.id=la.user_id WHERE u.username='secure_login'")).toMatch(/^\$2[aby]\$/);
    const context=await browser.newContext({baseURL:'http://127.0.0.1:4179'}); await context.addInitScript(()=>localStorage.setItem('datavisool-i18n-locale','zh-CN')); const p=await context.newPage(); await p.goto('/login'); await p.getByLabel('用户名').fill('secure_login'); await p.getByLabel('密码').fill('123456'); const failedLogin=p.waitForResponse(r=>new URL(r.url()).pathname==='/api/authenticate/login'); await p.getByRole('button',{name:'登录',exact:true}).click(); expect((await (await failedLogin).json()).code).not.toBe(200); await expect(p).toHaveURL(/\/login/); await p.getByLabel('密码').fill(newPassword); await p.getByRole('button',{name:'登录',exact:true}).click(); await expect(p).toHaveURL(/\/home\/console$/, {timeout:15000}); await context.close();
    for(const pwd of ['', '123456', '😀'.repeat(4), 'a'.repeat(73)]) {const res=await page.request.post('/api/user/create',{headers:h,data:{username:`invalid${pwd.length}`,name:'invalid',password:pwd}}); expect((await res.json()).code).not.toBe(200);}
});

test('并发创建相同用户名由数据库保证唯一',async({page})=>{
    const h=await login(page); const create=()=>page.request.post('/api/user/create',{headers:h,data:{username:'concurrent_user',name:'并发测试',password:newPassword}}); const results=await Promise.all([create(),create()]); const bodies=await Promise.all(results.map(r=>r.json())); expect(bodies.filter(x=>x.code===200)).toHaveLength(1); expect(sql("SELECT COUNT(*) FROM user WHERE username='concurrent_user' AND deleted=0")).toBe('1');
});

test('删除用户后允许再次使用用户名',async({page})=>{
    const h=await login(page); await seed(page,h,'reuse'); await reload(page); await remove(page,'reuse'); await expect(row(page,'reuse')).toHaveCount(0); await seed(page,h,'reuse'); expect(sql("SELECT COUNT(*) FROM user WHERE username='login_reuse' AND deleted=0")).toBe('1');
});
