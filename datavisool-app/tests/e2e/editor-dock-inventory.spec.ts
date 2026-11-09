/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {test,expect} from '@playwright/test';
import {setup,editor,open,shot} from './editor-dock/support';
setup();
const entries=[['资源库','source-library','编辑器资源库'],['图层','layer-list','编辑器图层'],['模板库','template-lib','编辑器模板库'],['全局变量','global-variable','编辑器全局变量'],['子项目','sub-project','编辑器子项目'],['AI驱动','ai-driven-card','编辑器AI驱动']];
for(const [label,selector,dir] of entries) test(`${label}入口与桌面显示`,async({page})=>{
    await page.setViewportSize({width:1440,height:900}); await editor(page); await open(page,label); const panel=page.locator(`.${selector}`).first(); await expect(panel).toBeVisible(); await shot(page,dir,`${label}-1440`);
});
