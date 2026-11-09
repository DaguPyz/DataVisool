/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {execFileSync} from 'node:child_process';
import {expect, test, type Page} from '@playwright/test';

const backend=process.env.DATAVISOOL_SERVER_DEV_TARGET || '';
const username=process.env.DATAVISOOL_E2E_USERNAME || '';
const password=process.env.DATAVISOOL_E2E_PASSWORD || '';
const database=process.env.DATAVISOOL_TEST_MYSQL_DATABASE || '';
const container=process.env.DATAVISOOL_TEST_MYSQL_CONTAINER || '';
const mysqlPassword=process.env.DATAVISOOL_TEST_MYSQL_PASSWORD || '';
const enabled=process.env.DATAVISOOL_E2E_ALLOW_WRITES==='isolated' && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(backend) && !!username && !!password && !!mysqlPassword && /^datavisool_component_test_[a-z0-9_]+$/.test(database) && /^datavisool-component-e2e-[a-z0-9-]+$/.test(container);
test.skip(!enabled,'需要本机组件库专用隔离后端、测试数据库和测试账号');
test.use({headless:true, trace:'off', screenshot:'off',video:'off'});
test.setTimeout(90000);

async function openEditor(page:Page) {
    await page.addInitScript(()=>{if(!localStorage.getItem('datavisool-i18n-locale')) localStorage.setItem('datavisool-i18n-locale','zh-CN');});
    await page.goto('/login'); await page.getByLabel('用户名').fill(username); await page.getByLabel('密码').fill(password); await page.getByRole('button',{name:'登录',exact:true}).click();
    await expect(page).toHaveURL(/\/home\/console$/);
    const token=await page.evaluate(()=>JSON.parse(localStorage.getItem('DATAVISOOL_USER_INFO')||'{}').token as string);
    const res=await page.request.post('/api/project/create',{headers:{Authorization:`Bearer ${token}`},data:{name:`组件库测试-${Date.now()}`,des:'隔离测试',dataJson:JSON.stringify({canvasManager:{width:1920,height:1080}})}});
    const data=await res.json(); expect(data.code).toBe(200); expect(String(data.data)).toMatch(/^\d+$/);
    await page.goto(`/designer?id=${data.data}`); await expect(page.locator('#designer-ds-content')).toBeVisible({timeout:60000});
    await page.getByRole('button',{name:'组件库',exact:true}).click(); await expect(page.locator('.dl-component-list')).toBeVisible(); await expect.poll(()=>page.locator('.list-item').count(),{timeout:60000}).toBeGreaterThan(0);
    return {id:String(data.data),token};
}


type Item={compKey:string;compName:string;categorize?:string;subCategorize?:string};
const panel=(p:Page)=>p.locator('.dl-component-list');
const items=(p:Page)=>panel(p).locator('.list-item');
const cat=(p:Page,name:string)=>panel(p).locator('.clo-item').filter({has:p.locator('svg')}).and(panel(p).locator(`[title="${name}"]`));
const sub=(p:Page,name:string)=>panel(p).locator('.clt-item').filter({hasText:new RegExp(`^${name}$`)});
async function catalog(p:Page):Promise<Item[]> {return p.evaluate(()=>Object.values((window as any).DATAVISOOL_ENV.definitions).map((x:any)=>x.getBaseInfo()).filter((x:any)=>!['LoopContainer','group'].includes(x.compKey)).map(({compKey,compName,categorize,subCategorize}:any)=>({compKey,compName,categorize,subCategorize})));}
async function shown(p:Page){return items(p).evaluateAll(nodes=>nodes.map(e=>e.getAttribute('data-type')));}
async function layers(p:Page):Promise<Array<{id:string;type:string;x:number;y:number}>> {return p.evaluate(()=>Object.values((window as any).DATAVISOOL_ENV.currentManager.layerManager.layerConfigs));}
async function clickCat(p:Page,name:string){await cat(p,name).scrollIntoViewIfNeeded(); await cat(p,name).click();}
async function picture(p:Page,name:string){await p.emulateMedia({reducedMotion:'reduce'}); await p.screenshot({path:`../测试报告/编辑器组件库/${name}.png`,animations:'disabled'});}

test.beforeEach(async({page})=>{
    if (!enabled) throw new Error('禁止在非隔离环境清理测试组件');
    execFileSync('docker',['exec','-e','MYSQL_PWD',container,'mysql','-uroot',database,'-e',"DELETE FROM remote_component WHERE component_name IN ('e2e-remote-text.js','e2e-custom-category.js','e2e-custom-subcategory.js')"],{env:{...process.env,MYSQL_PWD:mysqlPassword}});
    await page.route('**/*',route=>{const u=new URL(route.request().url()); return ['127.0.0.1','localhost'].includes(u.hostname)?route.continue():route.abort();});
});

for(const width of [1920,1440,1024,700,390,320]) test(`面板布局与可见性 ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:900}); await openEditor(page); await picture(page,`组件库-${width}`);
    const box=(await panel(page).boundingBox())!; expect.soft(box.x).toBeGreaterThanOrEqual(0); expect.soft(box.x+box.width).toBeLessThanOrEqual(width+1);
    const close=(await panel(page).getByRole('button',{name:'关闭 组件库'}).boundingBox())!; expect.soft(close.x+close.width).toBeLessThanOrEqual(width+1);
    await expect(panel(page).getByPlaceholder('搜索组件')).toBeVisible(); await expect(items(page).first()).toBeVisible();
});

test('左侧与画布工具栏入口、关闭和重新打开',async({page})=>{
    await openEditor(page); const dock=page.getByRole('button',{name:'组件库',exact:true}); await expect(dock).toHaveAttribute('aria-expanded','true');
    await panel(page).getByRole('button',{name:'关闭 组件库'}).click(); await expect(panel(page)).toHaveCount(0); await expect(dock).toBeFocused();
    await dock.click(); await expect(panel(page)).toBeVisible(); await dock.click(); await expect(panel(page)).toHaveCount(0);
    await page.getByRole('button',{name:'打开组件库'}).click(); await expect(panel(page)).toBeVisible();
    await page.getByRole('button',{name:'资源库',exact:true}).click(); await expect(panel(page)).toHaveCount(0); await dock.click(); await expect(panel(page)).toBeVisible();
});

test('组件清单完整且滚动可访问',async({page})=>{
    await openEditor(page); const all=await catalog(page); expect(all.length).toBeGreaterThan(0); expect(await shown(page)).toEqual(all.map(x=>x.compKey));
    const last=items(page).last(); await last.scrollIntoViewIfNeeded(); await expect(last).toBeInViewport();
    const previews=items(page).locator('img'); expect(await previews.count()).toBeGreaterThan(0); await expect.poll(()=>previews.first().evaluate((e:HTMLImageElement)=>e.complete&&e.naturalWidth>0)).toBe(true);
});

test('全部九个主分类逐项筛选',async({page})=>{
    await openEditor(page); const all=await catalog(page);
    for(const [label,key] of [['所有','all'],['图表','chart'],['信息','info'],['地图','map'],['装饰','ornament'],['模型','model'],['媒体','media'],['web元素','web'],['其他','other']]){
        await clickCat(page,label); await expect(cat(page,label)).toHaveClass(/clo-item-active/); await expect(sub(page,'所有')).toHaveClass(/clt-item-active/);
        expect.soft(await shown(page),label).toEqual(all.filter(x=>key==='all'||x.categorize===key).map(x=>x.compKey));
    }
});

test('图表全部十二个子分类筛选和切换重置',async({page})=>{
    await openEditor(page); const all=await catalog(page); await clickCat(page,'图表');
    for(const [label,key] of [['条形图','bar'],['柱状图','column'],['折线图','line'],['饼图','pie'],['散点图','scatter'],['词云图','wordCloud'],['面积图','area'],['雷达图','radar'],['漏斗图','funnel'],['进度图','progress'],['玫瑰图','rose'],['玉珏图','radial']]){
        await sub(page,label).scrollIntoViewIfNeeded(); await sub(page,label).click(); await expect(sub(page,label)).toHaveClass(/clt-item-active/);
        expect.soft(await shown(page),label).toEqual(all.filter(x=>x.categorize==='chart'&&x.subCategorize===key).map(x=>x.compKey));
    }
    await clickCat(page,'信息'); await expect(sub(page,'所有')).toHaveClass(/clt-item-active/); expect(await shown(page)).toEqual(all.filter(x=>x.categorize==='info').map(x=>x.compKey));
});

test('搜索、大小写、清除与无结果提示',async({page})=>{
    await openEditor(page); const all=await catalog(page); const search=panel(page).getByPlaceholder('搜索组件');
    await search.fill('文本'); expect(await shown(page)).toEqual(all.filter(x=>x.compName.includes('文本')).map(x=>x.compKey));
    await search.fill('ANTD'); expect(await shown(page)).toEqual(all.filter(x=>x.compName.toLowerCase().includes('antd')).map(x=>x.compKey));
    await search.fill('不存在的组件-83921'); await expect(items(page)).toHaveCount(0); await expect(panel(page).getByRole('status')).toHaveText('无匹配组件'); await picture(page,'组件库-无搜索结果');
    await search.fill(''); expect(await shown(page)).toEqual(all.map(x=>x.compKey));
});

test('分类和关键词应同时生效',async({page})=>{
    await openEditor(page); await clickCat(page,'信息'); const all=await catalog(page); const search=panel(page).getByPlaceholder('搜索组件');
    await search.fill('基础'); await picture(page,'组件库-分类搜索');
    expect(await shown(page)).toEqual(all.filter(x=>x.categorize==='info'&&x.compName.includes('基础')).map(x=>x.compKey));
});

test('子分类和关键词应同时生效',async({page})=>{
    await openEditor(page); await clickCat(page,'图表'); await sub(page,'条形图').click(); const all=await catalog(page);
    await panel(page).getByPlaceholder('搜索组件').fill('基础');
    expect(await shown(page)).toEqual(all.filter(x=>x.categorize==='chart'&&x.subCategorize==='bar'&&x.compName.includes('基础')).map(x=>x.compKey));
});

test('搜索后切换分类仍应限制结果',async({page})=>{
    await openEditor(page); const all=await catalog(page); await panel(page).getByPlaceholder('搜索组件').fill('基础'); await clickCat(page,'装饰');
    expect(await shown(page)).toEqual(all.filter(x=>x.categorize==='ornament'&&x.compName.includes('基础')).map(x=>x.compKey));
});

test('搜索框清除按钮及关闭重新打开后清空搜索',async({page})=>{
    await openEditor(page); const search=panel(page).getByPlaceholder('搜索组件'); const all=await catalog(page);
    await search.fill('文本'); const clear=panel(page).locator('.datavisool-input-clear'); await expect(clear).toBeVisible(); await clear.click(); await expect(search).toHaveValue(''); expect(await shown(page)).toEqual(all.map(x=>x.compKey));
    await search.fill('文本'); await panel(page).getByRole('button',{name:'关闭 组件库'}).click(); await page.getByRole('button',{name:'组件库',exact:true}).click(); await expect(panel(page).getByPlaceholder('搜索组件')).toHaveValue(''); await expect(items(page)).toHaveCount(all.length); expect(await shown(page)).toEqual(all.map(x=>x.compKey));
});

test('分类和组件卡片支持键盘访问',async({page})=>{
    await openEditor(page); await panel(page).getByPlaceholder('搜索组件').focus(); await page.keyboard.press('Tab'); await expect(cat(page,'所有')).toBeFocused();
    await page.keyboard.press('Tab'); const category=cat(page,'图表'); await expect(category).toBeFocused(); await page.keyboard.press('Enter'); await expect(category).toHaveAttribute('aria-pressed','true');
    const bar=sub(page,'条形图'); await bar.focus(); await page.keyboard.press('Space'); await expect(bar).toHaveAttribute('aria-pressed','true');
    const card=items(page).first(); await card.focus(); const key=await card.getAttribute('data-type'); await page.keyboard.press('Enter');
    await expect.poll(async()=>(await layers(page)).filter(layer=>layer.type===key).length).toBe(1); await page.keyboard.press('Space');
    await expect.poll(async()=>(await layers(page)).filter(layer=>layer.type===key).length).toBe(2);
});

test('单击与拖到画布外不会添加组件',async({page})=>{
    await page.setViewportSize({width:1440,height:900}); await openEditor(page); const initial=await layers(page); const first=items(page).first();
    await first.click(); expect(await layers(page)).toEqual(initial);
    const b=(await first.boundingBox())!; await page.mouse.move(b.x+b.width/2,b.y+b.height/2); await page.mouse.down(); await page.mouse.move(30,800,{steps:10});
    expect(await page.evaluate(()=>document.body.style.cursor)).toBe('not-allowed'); await page.mouse.up(); expect(await layers(page)).toEqual(initial); expect(await page.evaluate(()=>document.body.style.cursor)).toBe('');
});

test('拖拽组件到画布、再次添加、撤销重做与真实保存',async({page})=>{
    await page.setViewportSize({width:1440,height:900}); const {id,token}=await openEditor(page); await panel(page).getByPlaceholder('搜索组件').fill('基础文本');
    const item=panel(page).locator('[data-type="BaseText"]'); await expect(item).toBeVisible(); const b=(await item.boundingBox())!; const canvas=(await page.locator('#designer-ds-content').boundingBox())!;
    const target={x:Math.max(canvas.x+canvas.width*.65,520),y:canvas.y+canvas.height*.55};
    await page.mouse.move(b.x+b.width/2,b.y+b.height/2); await page.mouse.down(); await page.mouse.move(target.x,target.y,{steps:12}); expect(await page.evaluate(()=>document.body.style.cursor)).toBe('grabbing'); await page.mouse.up();
    await expect.poll(async()=>(await layers(page)).length).toBe(1); let current=await layers(page); expect(current[0].type).toBe('BaseText'); expect(current[0].x).toBeGreaterThan(0); expect(current[0].y).toBeGreaterThan(0); await expect(page.locator(`[data-layer-transform="${current[0].id}"]`)).toBeVisible(); await picture(page,'组件库-拖拽添加');
    await item.dblclick(); await expect.poll(async()=>(await layers(page)).length).toBe(2);
    await page.getByRole('button',{name:'撤销',exact:true}).click(); await expect.poll(async()=>(await layers(page)).length).toBe(1);
    await page.getByRole('button',{name:'重做',exact:true}).click(); await expect.poll(async()=>(await layers(page)).length).toBe(2);
    const save=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/project/update'); await page.getByRole('button',{name:'更多项目操作'}).click(); await page.getByRole('menuitem',{name:'保存项目'}).click(); expect((await (await save).json()).data).toBe(true);
    const stored=await page.request.get(`/api/project/getProjectData/${id}`,{headers:{Authorization:`Bearer ${token}`}}); expect((await stored.json()).data.dataJson.length).toBeGreaterThan(100);
    await page.reload(); await expect(page.locator('#designer-ds-content')).toBeVisible({timeout:60000}); await expect.poll(async()=>(await layers(page)).length,{timeout:30000}).toBe(2); current=await layers(page); expect(current.map(x=>x.type)).toEqual(['BaseText','BaseText']);
});

for(const [label,key] of [['图表','AntdBaseBar'],['信息','BaseText'],['地图','MapLibreGis'],['装饰','BaseColorBlock'],['模型','ThreeModel'],['媒体','BaseImage'],['web元素','BaseButton'],['其他','ECharts']]) test(`${label}代表组件双击添加`,async({page})=>{
    await openEditor(page); await clickCat(page,label); const item=panel(page).locator(`[data-type="${key}"]`); await item.scrollIntoViewIfNeeded(); await item.dblclick();
    await expect.poll(async()=>(await layers(page)).length).toBe(1); const [layer]=await layers(page); expect(layer.type).toBe(key); await expect(page.locator(`[data-layer-transform="${layer.id}"]`)).toBeVisible();
});

test('模型分类应能找到 3D 模型组件',async({page})=>{
    await openEditor(page); await clickCat(page,'模型'); await expect(panel(page).locator('[data-type="ThreeModel"]')).toBeVisible({timeout:2500});
});

test('组件预览图逐项加载',async({page})=>{
    await openEditor(page); const all=await catalog(page); let withImages=0;
    for(const entry of all){const card=panel(page).locator(`[data-type="${entry.compKey}"]`); await card.scrollIntoViewIfNeeded(); const image=card.locator('img');
        if(await image.count()){withImages++; await expect.soft.poll(()=>image.evaluate((e:HTMLImageElement)=>e.complete&&e.naturalWidth>0),{message:entry.compName,timeout:5000}).toBe(true);}}
    expect(withImages).toBeGreaterThan(0);
});

test('英文组件库标题、分类与按英文名称搜索',async({page})=>{
    const {id}=await openEditor(page); await page.evaluate(()=>localStorage.setItem('datavisool-i18n-locale','en-US')); await page.goto(`/designer?id=${id}`);
    await expect(page.locator('#designer-ds-content')).toBeVisible({timeout:60000}); await page.getByRole('button',{name:'Component Library',exact:true}).click();
    await expect(panel(page).getByRole('heading',{name:'Component Library'})).toBeVisible(); await expect(panel(page).locator('.clo-item[title="Charts"]')).toBeVisible();
    const search=panel(page).getByPlaceholder('Search components'); await search.fill('Base Text'); await expect(panel(page).locator('[data-type="BaseText"]')).toBeVisible(); await picture(page,'组件库-英文');
    await search.fill('no-such-component-38921'); await expect(items(page)).toHaveCount(0); await expect(panel(page).getByRole('status')).toHaveText('No matching components');
});

test('真实后端服务器组件加载、搜索、添加及重开',async({page})=>{
    const {id,token}=await openEditor(page);
    const script=`window.__DATAVISOOL_REMOTE_COMPONENT_TEMP__ = class RemoteFixture extends window.DataVisoolSDK.AbstractDesignerDefinition {
        getBaseInfo(){return {compName:'远程测试文本',compKey:'E2ERemoteText',categorize:'info',width:320,height:200,source:'remote'}}
        getController(){return window.DATAVISOOL_ENV.definitions.BaseText.getController()}
        getInitConfig(){return window.DATAVISOOL_ENV.definitions.BaseText.getInitConfig()}
        getChartImg(){return window.DATAVISOOL_ENV.definitions.BaseText.getChartImg()}
    };`;
    const upload=await page.request.post('/api/remote/component/upload',{headers:{Authorization:`Bearer ${token}`},multipart:{componentFile:{name:'e2e-remote-text.js',mimeType:'text/javascript',buffer:Buffer.from(script)}}}); expect(await upload.json()).toMatchObject({code:200,data:true});
    await page.reload(); await expect(page.locator('#designer-ds-content')).toBeVisible({timeout:60000}); await page.getByRole('button',{name:'组件库',exact:true}).click();
    await panel(page).getByPlaceholder('搜索组件').fill('远程测试文本'); const remote=panel(page).locator('[data-type="E2ERemoteText"]'); await expect(remote).toBeVisible(); await remote.dblclick();
    await expect.poll(async()=>(await layers(page)).length).toBe(1); const [layer]=await layers(page); expect(layer.type).toBe('E2ERemoteText'); await expect(page.locator(`[data-layer-transform="${layer.id}"]`)).toBeVisible();
    const saved=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/project/update'); await page.getByRole('button',{name:'更多项目操作'}).click(); await page.getByRole('menuitem',{name:'保存项目'}).click(); expect((await (await saved).json()).data).toBe(true);
    await page.goto(`/designer?id=${id}`); await expect(page.locator('#designer-ds-content')).toBeVisible({timeout:60000}); await expect.poll(async()=>(await layers(page)).some(x=>x.type==='E2ERemoteText'),{timeout:30000}).toBe(true);
});

test('搜索前后空格不应影响匹配',async({page})=>{
    await openEditor(page); await panel(page).getByPlaceholder('搜索组件').fill('  基础文本  '); await expect(panel(page).locator('[data-type="BaseText"]')).toBeVisible({timeout:2500});
});

test('⌘F 全局搜索组件并添加到画布',async({page})=>{
    await openEditor(page); await page.getByRole('button',{name:'组件库',exact:true}).focus(); await page.keyboard.press('Meta+f');
    const search=page.getByPlaceholder('请输入图层名、组件名或组件 Key'); await expect(search).toBeVisible({timeout:4000}); await search.fill('BaseText');
    const result=page.locator('.search-layer-component-item').filter({hasText:'BaseText'}).first(); await expect(result).toBeVisible(); await result.click();
    await expect.poll(async()=>(await layers(page)).some(x=>x.type==='BaseText')).toBe(true);
});

test('服务器组件自定义分类和子分类',async({page})=>{
    const pageErrors:string[]=[]; page.on('pageerror',error=>pageErrors.push(error.message));
    const {token}=await openEditor(page); const headers={Authorization:`Bearer ${token}`};
    const upload=async(name:string,script:string)=>{const response=await page.request.post('/api/remote/component/upload',{headers,multipart:{componentFile:{name,mimeType:'text/javascript',buffer:Buffer.from(script)}}}); expect(await response.json()).toMatchObject({code:200,data:true});};
    const body=`getBaseInfo(){return {compName:'自定义分类测试',compKey:'E2ECustomCategory',categorize:'e2eCustom',subCategorize:'e2eSub',width:320,height:200}} getController(){return window.DATAVISOOL_ENV.definitions.BaseText.getController()} getInitConfig(){return window.DATAVISOOL_ENV.definitions.BaseText.getInitConfig()} getChartImg(){return null}`;
    await upload('e2e-custom-category.js',`window.__DATAVISOOL_REMOTE_COMPONENT_TEMP__=class extends window.DataVisoolSDK.AbstractDesignerDefinition { ${body} getCategorize(){return {key:'e2eCustom',name:'自定义分类',icon:()=>window.React.createElement('svg')}} }`);
    await page.reload(); await expect(page.locator('#designer-ds-content')).toBeVisible({timeout:60000}); await page.getByRole('button',{name:'组件库',exact:true}).click();
    await clickCat(page,'自定义分类'); await expect(panel(page).locator('[data-type="E2ECustomCategory"]')).toBeVisible();
    await upload('e2e-custom-subcategory.js',`window.__DATAVISOOL_REMOTE_COMPONENT_TEMP__=class extends window.DataVisoolSDK.AbstractDesignerDefinition {getBaseInfo(){return {compName:'子分类测试组件',compKey:'E2ECustomSub',categorize:'e2eCustom',subCategorize:'e2eSub'}} getChartImg(){return null} getSubCategorize(){return {key:'e2eSub',name:'自定义子分类',parentKey:'e2eCustom'}} }`);
    await page.reload(); await expect(page.locator('#designer-ds-content')).toBeVisible({timeout:60000}); await page.getByRole('button',{name:'组件库',exact:true}).click();
    await expect(panel(page)).toBeVisible({timeout:5000}); await clickCat(page,'自定义分类'); await expect(sub(page,'自定义子分类')).toBeVisible();
    await sub(page,'自定义子分类').click(); await expect(panel(page).locator('[data-type="E2ECustomCategory"]')).toBeVisible(); await expect(panel(page).locator('[data-type="E2ECustomSub"]')).toBeVisible();
    await expect(cat(page,'自定义分类')).toHaveCount(1); await expect(sub(page,'自定义子分类')).toHaveCount(1); expect(pageErrors).toEqual([]); await picture(page,'组件库-自定义子分类');
});
