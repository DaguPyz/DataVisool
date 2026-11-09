/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {expect, test, type BrowserContext, type Page} from '@playwright/test';

const backend=process.env.DATAVISOOL_SERVER_DEV_TARGET || '';
const username=process.env.DATAVISOOL_E2E_USERNAME || '';
const password=process.env.DATAVISOOL_E2E_PASSWORD || '';
const database=process.env.DATAVISOOL_TEST_MYSQL_DATABASE || '';
const container=process.env.DATAVISOOL_TEST_MYSQL_CONTAINER || '';
const isolated=process.env.DATAVISOOL_E2E_ALLOW_WRITES === 'isolated';
const enabled=/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(backend) && !!username && !!password && isolated
    && /^datavisool_help_test_[a-z0-9_]+$/.test(database) && /^datavisool-help-e2e-[a-z0-9-]+$/.test(container);
const externalMode=process.env.DATAVISOOL_HELP_GUIDE_MODE === 'external';
const externalGuide='https://guide.example.test/help/?source=e2e';
test.skip(!enabled,'需要本机隔离后端、帮助页专用数据库与容器、测试账号和隔离开关');
test.use({trace:'off',screenshot:'off',video:'off'}); test.setTimeout(45_000);
const help=(p:Page)=>p.locator('[class*="moreInfoContainer"]');
const card=(p:Page,label:string)=>help(p).getByRole(label==='使用文档'?'link':'button',{name:new RegExp(label)});
const qr=(p:Page)=>p.getByRole('dialog').filter({has:p.getByRole('img',{name:'联系作者'})});
async function login(p:Page) {
    await p.addInitScript(()=>{if(!localStorage.getItem('datavisool-i18n-locale')) localStorage.setItem('datavisool-i18n-locale','zh-CN');});
    await p.goto('/login'); await p.getByLabel('用户名').fill(username); await p.getByLabel('密码').fill(password); await p.getByRole('button',{name:'登录',exact:true}).click();
    await expect(p).toHaveURL(/\/home\/console$/, {timeout:20000});
    const token=await p.evaluate(()=>JSON.parse(localStorage.getItem('DATAVISOOL_USER_INFO')||'{}').token as string);
    return {Authorization:`Bearer ${token}`};
}
async function openHelp(p:Page) {await p.getByRole('menuitem',{name:'帮助',exact:true}).click(); await expect(p).toHaveURL(/\/home\/more$/); await expect(p.getByRole('heading',{name:'帮助信息'})).toBeVisible();}
async function closeQr(p:Page) {await p.locator('.datavisool-dialog-mask.visible').last().click({position:{x:5,y:5},force:true}); await expect(qr(p)).not.toBeVisible();}
async function trapExternal(context:BrowserContext,url:string) {await context.route(url,route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>External test page</title>'}));}

test.describe('默认帮助入口',()=>{
    test.skip(externalMode,'此组验证默认内置文档地址');
    for(const width of [1440,1024,700,390,320]) test(`页面与卡片布局 ${width}px`,async({page})=>{
        await page.setViewportSize({width,height:900}); await page.emulateMedia({reducedMotion:'reduce'}); await login(page); await openHelp(page);
        const labels=['使用文档','视频教程','联系支持','社区交流']; for(const label of labels) await expect(card(page,label)).toBeVisible();
        await page.screenshot({path:`../测试报告/帮助/帮助-${width}.png`,animations:'disabled'});
        const boxes=await Promise.all(labels.map(async label=>(await card(page,label).boundingBox())!));
        expect.soft(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        for(const box of boxes){expect.soft(box.x).toBeGreaterThanOrEqual(0); expect.soft(box.x+box.width).toBeLessThanOrEqual(width+1);}
        for(let i=0;i<boxes.length;i++) for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j]; expect.soft(a.x+a.width<=b.x+1 || b.x+b.width<=a.x+1 || a.y+a.height<=b.y+1 || b.y+b.height<=a.y+1).toBe(true);}
    });
    test('首页入口与真实后端登录会话',async({page})=>{const headers=await login(page); const id=await page.evaluate(()=>JSON.parse(localStorage.getItem('DATAVISOOL_USER_INFO')||'{}').id as string); const me=await page.request.get(`/api/user/getUser/${id}`,{headers}); const data=await me.json(); expect(data.code).toBe(200); expect(data.data.username).toBe(username); await openHelp(page); await expect(help(page)).toContainText('获取更多关于'); await expect(help(page)).toContainText('DataVisool Web'); await expect(card(page,'使用文档')).toHaveAttribute('href','/docs'); await page.reload(); await expect(page.getByRole('heading',{name:'帮助信息'})).toBeVisible();});
    test('使用文档入口和返回工作台',async({page})=>{await login(page); await openHelp(page); await expect(card(page,'使用文档')).not.toHaveAttribute('target','_blank'); await card(page,'使用文档').click(); await expect(page).toHaveURL(/\/docs\/zh-cn\/?$/); await expect(page.getByRole('heading',{level:1})).toContainText('DataVisool'); await page.getByRole('link',{name:'返回工作台'}).click(); await expect(page).toHaveURL(/\/home\/console$/); await openHelp(page);});
    test('使用文档支持键盘打开和返回',async({page})=>{await login(page); await openHelp(page); await card(page,'使用文档').focus(); await expect(card(page,'使用文档')).toBeFocused(); await page.keyboard.press('Enter'); await expect(page).toHaveURL(/\/docs\/zh-cn\/?$/); await page.goBack(); await expect(page.getByRole('heading',{name:'帮助信息'})).toBeVisible();});
    test('视频教程以安全的新页面打开指定地址',async({page,context})=>{await trapExternal(context,'https://www.bilibili.com/**'); await login(page); await openHelp(page); const opened=context.waitForEvent('page'); await card(page,'视频教程').click(); const popup=await opened; await popup.waitForLoadState('domcontentloaded'); const url=new URL(popup.url()); expect(url.origin).toBe('https://www.bilibili.com'); expect(url.pathname).toBe('/video/BV1z1421m7v2/'); expect(url.searchParams.get('share_source')).toBe('copy_web'); expect(await popup.evaluate(()=>window.opener)).toBeNull(); await expect(popup).toHaveTitle('External test page'); await popup.close(); await expect(page.getByRole('heading',{name:'帮助信息'})).toBeVisible();});
    test('模拟外部浏览器打开失败时给出提示',async({page})=>{await login(page); await openHelp(page); await page.evaluate(()=>{window.open=()=>{throw new Error('模拟打开失败');};}); await card(page,'视频教程').click(); await expect(page.getByText('无法打开链接，请检查应用权限或系统浏览器设置')).toBeVisible();});
    for(const label of ['联系支持','社区交流']) test(`${label}二维码、遮罩关闭和再次打开`,async({page})=>{await login(page); await openHelp(page); await card(page,label).click(); await expect(qr(page)).toBeVisible(); await expect(qr(page).getByText('微信扫码添加')).toBeVisible(); const image=qr(page).getByRole('img',{name:'联系作者'}); await expect.poll(()=>image.evaluate((el:HTMLImageElement)=>el.complete && el.naturalWidth>0)).toBe(true); await closeQr(page); await card(page,label).click(); await expect(qr(page)).toBeVisible(); await closeQr(page);});
    for(const width of [1440,700,390,320]) test(`二维码弹窗布局 ${width}px`,async({page})=>{await page.setViewportSize({width,height:900}); await page.emulateMedia({reducedMotion:'reduce'}); await login(page); await openHelp(page); await card(page,'联系支持').click(); await expect(qr(page)).toBeVisible(); await expect.poll(()=>qr(page).getByRole('img',{name:'联系作者'}).evaluate((el:HTMLImageElement)=>el.naturalWidth>0)).toBe(true); await page.screenshot({path:`../测试报告/帮助/帮助-联系支持-${width}.png`,animations:'disabled'}); const box=(await qr(page).boundingBox())!; expect.soft(box.x).toBeGreaterThanOrEqual(0); expect.soft(box.x+box.width).toBeLessThanOrEqual(width+1); const image=(await qr(page).getByRole('img',{name:'联系作者'}).boundingBox())!; expect.soft(image.x).toBeGreaterThanOrEqual(0); expect.soft(image.x+image.width).toBeLessThanOrEqual(width+1); await closeQr(page);});
    for(const label of ['联系支持','社区交流']) test(`${label}窗口键盘操作与焦点恢复`,async({page})=>{
        await login(page); await openHelp(page); const trigger=card(page,label); await trigger.focus(); await page.keyboard.press('Enter');
        const dialog=page.getByRole('dialog',{name:'微信扫码添加'}); const close=dialog.getByRole('button',{name:'关闭'});
        await expect(dialog).toBeVisible(); await expect(close).toBeFocused();
        await page.keyboard.press('Tab'); await expect(close).toBeFocused(); await page.keyboard.press('Shift+Tab'); await expect(close).toBeFocused();
        await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible(); await expect(trigger).toBeFocused();
        await page.keyboard.press('Enter'); await expect(close).toBeFocused(); await close.click(); await expect(dialog).not.toBeVisible(); await expect(trigger).toBeFocused();
    });
    test('设置关于页共用联系窗口支持键盘关闭',async({page})=>{
        await login(page); await page.getByRole('menuitem',{name:'设置',exact:true}).click(); await page.locator('[class*="navCard"]').getByText('关于',{exact:true}).click();
        const trigger=page.locator('[class*="contentCard"]').getByRole('button',{name:/联系我们/}); await trigger.focus(); await trigger.click();
        const dialog=page.getByRole('dialog',{name:'微信扫码添加'}); await expect(dialog.getByRole('button',{name:'关闭'})).toBeFocused();
        await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible(); await expect(trigger).toBeFocused();
    });
    test('升级提示中的联系窗口关闭后返回原窗口',async({page})=>{
        await page.route('**/api/webUpdate/check?*',route=>route.fulfill({json:{code:200,msg:'成功',data:{available:true,needUpgrade:true,latestVersion:'2099.1.0'}}}));
        await login(page); await expect(page.getByRole('heading',{name:'发现新版本'})).toBeVisible();
        const trigger=page.getByRole('button',{name:'联系售后人员'}); await trigger.focus(); await trigger.click();
        const dialog=page.getByRole('dialog',{name:'联系售后人员'}); await expect(dialog.getByRole('button',{name:'关闭'})).toBeFocused();
        await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible(); await expect(trigger).toBeFocused(); await expect(page.getByRole('heading',{name:'发现新版本'})).toBeVisible();
    });
    test('英文联系窗口提供本地化名称和关闭按钮',async({page})=>{
        await login(page); await page.getByRole('menuitem',{name:'设置',exact:true}).click(); await page.locator('[class*="navCard"]').getByText('通用',{exact:true}).click();
        await page.getByRole('combobox').click(); await page.getByRole('option',{name:'English',exact:true}).click(); await page.getByRole('menuitem',{name:'Help',exact:true}).click();
        await help(page).getByRole('button',{name:/Contact support/}).click(); const dialog=page.getByRole('dialog',{name:'Scan with WeChat to add'});
        await expect(dialog).toBeVisible(); await expect(dialog.getByRole('button',{name:'Close'})).toBeFocused(); await dialog.getByRole('button',{name:'Close'}).click(); await expect(dialog).not.toBeVisible();
    });
    test('英文语言下帮助页四个入口和返回中文',async({page})=>{await login(page); await page.getByRole('menuitem',{name:'设置',exact:true}).click(); await page.locator('[class*="navCard"]').getByText('通用',{exact:true}).click(); await page.getByRole('combobox').click(); await page.getByRole('option',{name:'English',exact:true}).click(); await page.getByRole('menuitem',{name:'Help',exact:true}).click(); await expect(page.getByRole('heading',{name:'Help',exact:true})).toBeVisible(); for(const text of ['Documentation','Video tutorial','Contact support','Community']) await expect(help(page).getByRole('heading',{name:text,exact:true})).toBeVisible(); await page.reload(); await expect(page.getByRole('heading',{name:'Help',exact:true})).toBeVisible(); await page.getByRole('menuitem',{name:'Settings',exact:true}).click(); await page.locator('[class*="navCard"]').getByText('General',{exact:true}).click(); await page.getByRole('combobox').click(); await page.getByRole('option',{name:'Simplified Chinese',exact:true}).click(); await page.getByRole('menuitem',{name:'帮助',exact:true}).click(); await expect(page.getByRole('heading',{name:'帮助信息'})).toBeVisible();});
    test('普通用户可访问帮助与文档入口',async({page,browser})=>{const headers=await login(page); const name=`help_user_${Date.now()}`; const res=await page.request.post('/api/user/create',{headers,data:{username:name,name:'帮助测试用户',password:'Help-Only-Account9!'}}); expect((await res.json()).code).toBe(200); const context=await browser.newContext({baseURL:'http://127.0.0.1:4179'}); await context.addInitScript(()=>localStorage.setItem('datavisool-i18n-locale','zh-CN')); const p=await context.newPage(); await p.goto('/login'); await p.getByLabel('用户名').fill(name); await p.getByLabel('密码').fill('Help-Only-Account9!'); await p.getByRole('button',{name:'登录',exact:true}).click(); await expect(p).toHaveURL(/\/home\/console$/); await openHelp(p); await card(p,'使用文档').click(); await expect(p).toHaveURL(/\/docs\/zh-cn\/?$/); await expect(p.getByRole('heading',{level:1})).toContainText('DataVisool'); await context.close();});
});

test('外部文档配置以隔离新页面打开',async({page,context})=>{
    test.skip(!externalMode,'仅在明确设置外部文档测试地址时执行');
    await trapExternal(context,'https://guide.example.test/**'); await login(page); await openHelp(page); const link=card(page,'使用文档'); await expect(link).toHaveAttribute('href',externalGuide); await expect(link).toHaveAttribute('target','_blank'); await expect(link).toHaveAttribute('rel','noopener noreferrer'); const opened=context.waitForEvent('page'); await link.click(); const popup=await opened; await popup.waitForLoadState('domcontentloaded'); expect(popup.url()).toBe(externalGuide); expect(await popup.evaluate(()=>window.opener)).toBeNull(); await expect(popup).toHaveTitle('External test page'); await popup.close();
});
