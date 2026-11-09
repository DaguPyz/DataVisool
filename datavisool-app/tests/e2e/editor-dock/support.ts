/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {expect, test, type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import path from 'node:path';

const backend=process.env.DATAVISOOL_SERVER_DEV_TARGET || '';
const database=process.env.DATAVISOOL_TEST_MYSQL_DATABASE || '';
const container=process.env.DATAVISOOL_TEST_MYSQL_CONTAINER || '';
const user=process.env.DATAVISOOL_E2E_USERNAME || '';
const password=process.env.DATAVISOOL_E2E_PASSWORD || '';
export const enabled=process.env.DATAVISOOL_E2E_ALLOW_WRITES==='isolated' && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(backend) && /^datavisool_dock_test_[a-z0-9_]+$/.test(database) && /^datavisool-dock-e2e-[a-z0-9-]+$/.test(container) && !!user && !!password;
const localToolbarEnabled=process.env.DATAVISOOL_E2E_ALLOW_WRITES==='isolated'
    && process.env.DATAVISOOL_TEST_MYSQL_LOCAL==='isolated'
    && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(backend)
    && /^datavisool_dock_test_toolbar_[a-z0-9_]+$/.test(database)
    && /^\d+$/.test(process.env.DATAVISOOL_TEST_MYSQL_PORT || '')
    && /^\/private\/tmp\/datavisool-toolbar-local-[a-z0-9-]+$/.test(process.env.DATAVISOOL_TEST_RESOURCE_ROOT || '')
    && !!user && !!password;
export function setup(options: {localToolbarMysql?: boolean} = {}){test.skip(!(enabled || (options.localToolbarMysql && localToolbarEnabled)),'需要编辑器面板专用本机隔离后端和测试库'); test.use({headless:true,trace:'off',screenshot:'off',video:'off'});test.setTimeout(90000);}
export async function login(page:Page){
    await page.addInitScript(()=>{if(!localStorage.getItem('datavisool-i18n-locale'))localStorage.setItem('datavisool-i18n-locale','zh-CN');});
    await page.goto('/login'); await page.getByLabel('用户名').fill(user); await page.getByLabel('密码').fill(password); await page.getByRole('button',{name:'登录',exact:true}).click(); await expect(page).toHaveURL(/\/home\/console$/,{timeout:20000});
    const token=await page.evaluate(()=>JSON.parse(localStorage.getItem('DATAVISOOL_USER_INFO')||'{}').token as string); expect(token).toBeTruthy(); return {Authorization:`Bearer ${token}`};
}
export async function editor(page:Page, headers?:Record<string,string>){
    const auth=headers || await login(page); const res=await page.request.post('/api/project/create',{headers:auth,data:{name:`面板测试-${Date.now()}`,des:'隔离测试',dataJson:JSON.stringify({canvasManager:{width:1920,height:1080}})}}); const body=await res.json(); expect(body.code).toBe(200); const id=String(body.data); expect(id).toMatch(/^\d+$/);
    await page.goto(`/designer?id=${id}`); await expect(page.locator('#designer-ds-content')).toBeVisible({timeout:60000}); return {id,headers:auth};
}
export async function open(page:Page,name:string){await page.getByRole('button',{name,exact:true}).click();}
export async function save(page:Page){const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/project/update'); await page.getByRole('button',{name:'更多项目操作'}).click(); await page.getByRole('menuitem',{name:'保存项目'}).click(); expect((await (await response).json()).data).toBe(true);}
export async function shot(page:Page,dir:string,name:string){await page.emulateMedia({reducedMotion:'reduce'}); await page.screenshot({path:`../测试报告/${dir}/${name}.png`,animations:'disabled'});}
export async function layers(page:Page):Promise<Array<{id:string;type:string;name:string;x:number;y:number;hide:boolean;lock:boolean}>>{return page.evaluate(()=>Object.values((window as any).DATAVISOOL_ENV.currentManager.layerManager.layerConfigs));}
export async function uploadImage(page:Page,headers:Record<string,string>,name:string){const file=readFileSync(path.resolve('../测试资源/7bcfead4-cc1e-4f26-8dc1-b6446402c38c.png'));const res=await page.request.post('/api/image/upload',{headers,multipart:{file:{name,mimeType:'image/png',buffer:file}}});const body=await res.json();expect(body.code).toBe(200);expect(body.data).toBeTruthy();return body.data as string;}
export async function uploadVideo(page:Page,headers:Record<string,string>,name:string){const file=readFileSync(path.resolve('../测试资源/录屏2026-10-29 14.05.48.mov'));const res=await page.request.post('/api/video/upload',{headers,multipart:{files:{name,mimeType:'video/quicktime',buffer:file}}});const body=await res.json();expect(body.code).toBe(200);expect(body.data).toBeTruthy();}
export async function drag(page:Page,source:import('@playwright/test').Locator,target:{x:number;y:number}){await source.scrollIntoViewIfNeeded();const b=(await source.boundingBox())!; await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(target.x,target.y,{steps:12});await page.mouse.up();}
