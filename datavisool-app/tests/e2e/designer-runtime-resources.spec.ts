/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {expect, test} from '@playwright/test';

const fontName = 'MigrationFixtureFont';
const fontUrl = '/fixture-assets/migration-font.ttf';
const scriptUrl = '/fixture-assets/migration-script.js';
const remoteUrl = '/fixture-assets/migration-remote.js';
const remoteType = 'MigrationRemoteText';
const fontBytes = readFileSync(fileURLToPath(new URL('../../../测试资源/bea6c59f2bcb4a4e8e0bdb8a89c64e1f.ttf', import.meta.url)));
const legacyProject = {
    canvasManager: {width: 840, height: 480, adaptationType: 'none'},
    layerManager: {
        layerHeader: 'legacy-remote-text', layerTail: 'legacy-remote-text',
        layerConfigs: {
            'legacy-remote-text': {id: 'legacy-remote-text', type: remoteType, name: '旧远程文本', x: 20, y: 20, width: 240, height: 80, order: 1},
        },
        elemConfigs: {
            'legacy-remote-text': {
                base: {id: 'legacy-remote-text', type: remoteType, name: '旧远程文本'},
                style: {color: '#ffffff', fontSize: 20, fontFamily: fontName, alignItems: 'center', justifyContent: 'center', lineHeight: 1, letterSpacing: 0},
                data: {sourceType: 'static', value: '旧项目资源兼容'},
            },
        },
    },
};
const remoteScript = `window.__DATAVISOOL_REMOTE_COMPONENT_TEMP__ = class extends window.DataVisoolSDK.AbstractDesignerDefinition {
    getBaseInfo() { return {compName: '旧远程文本', compKey: '${remoteType}', categorize: 'info', width: 240, height: 80, source: 'remote'}; }
    getController() { return window.DATAVISOOL_ENV.definitions.BaseText.getController(); }
    getInitConfig() { return window.DATAVISOOL_ENV.definitions.BaseText.getInitConfig(); }
    getChartImg() { return window.DATAVISOOL_ENV.definitions.BaseText.getChartImg(); }
};`;

test.setTimeout(60_000);

for (const mode of ['edit', 'preview', 'release'] as const) {
    test(`旧项目字体、动态脚本和远程组件在 ${mode} 场景加载并释放会话资源`, async ({page}) => {
        const requests: string[] = [];
        await page.addInitScript(() => {
            localStorage.setItem('datavisool-i18n-locale', 'zh-CN');
            localStorage.setItem('DATAVISOOL_USER_INFO', JSON.stringify({id: 'resource-fixture', username: 'tester', token: 'fixture-token', roles: ['ROLE_USER']}));
        });
        await page.route('**/static/logo/**', route => route.fulfill({status: 404}));
        await page.route('**/fixture-assets/**', route => {
            const pathname = new URL(route.request().url()).pathname;
            if (pathname === fontUrl) return route.fulfill({contentType: 'font/ttf', body: fontBytes});
            if (pathname === remoteUrl) return route.fulfill({contentType: 'text/javascript', body: remoteScript});
            if (pathname === scriptUrl) return route.fulfill({contentType: 'text/javascript', body: 'globalThis.__migrationResourceScriptRuns = (globalThis.__migrationResourceScriptRuns || 0) + 1;'});
            return route.abort();
        });
        await page.route(url => url.pathname.startsWith('/api/'), route => {
            const url = new URL(route.request().url());
            requests.push(url.pathname + url.search);
            let data: unknown = [];
            if (url.pathname.startsWith('/api/project/getProjectData/')) {
                data = {id: 'resource-fixture', name: '旧资源项目', dataJson: JSON.stringify(legacyProject)};
            } else if (url.pathname === '/api/project/update') {
                data = true;
            } else if (url.pathname === '/api/font/list') {
                data = [{name: fontName, url: fontUrl}];
            } else if (url.pathname === '/api/dynamicScript/list') {
                data = [{url: scriptUrl}];
            } else if (url.pathname === '/api/remote/component/list') {
                data = [{id: 'remote-resource-fixture', url: remoteUrl}];
            } else if (url.pathname.startsWith('/api/release/getReleaseInfo/')) {
                data = {encrypt: false};
            } else if (url.pathname === '/api/release/getReleaseData') {
                data = {
                    name: '旧资源发布项目',
                    dataJson: JSON.stringify({projectJson: JSON.stringify(legacyProject), fonts: [{name: fontName, value: fontUrl}], dynamicScripts: [{value: scriptUrl}], components: [{value: remoteUrl}]}),
                };
            }
            return route.fulfill({json: {code: 200, msg: '', data}});
        });

        const path = mode === 'edit' ? '/designer?id=resource-fixture'
            : mode === 'preview' ? '/preview?id=resource-fixture' : `/release/${Buffer.from('resource-fixture').toString('base64')}`;
        await page.goto(path);
        await expect(page.locator('.base-text-component')).toHaveText('旧项目资源兼容', {timeout: 20_000});
        await expect.poll(() => page.evaluate(name => Array.from(document.fonts).some(font => font.family.includes(name) && font.status === 'loaded'), fontName)).toBe(true);
        await expect(page.locator('.base-text-component')).toHaveCSS('font-family', fontName);
        await expect.poll(() => page.evaluate(() => (globalThis as any).__migrationResourceScriptRuns)).toBe(1);
        await expect(page.locator(`script[src$="${scriptUrl}"]`)).toHaveCount(1);
        if (mode === 'release') {
            expect(requests.some(url => url.startsWith('/api/release/getReleaseData'))).toBe(true);
            expect(requests.some(url => url.startsWith('/api/project/getProjectData/') || url.startsWith('/api/font/list') || url.startsWith('/api/dynamicScript/list') || url.startsWith('/api/remote/component/list'))).toBe(false);
        } else {
            expect(requests).toContain('/api/project/getProjectData/resource-fixture');
            expect(requests).toContain('/api/font/list');
            expect(requests).toContain('/api/dynamicScript/list?projectId=resource-fixture');
            expect(requests).toContain('/api/remote/component/list');
        }

        await page.evaluate(async () => {
            const {startApplication} = await import(/* @vite-ignore */ '/src/bootstrap/startApplication.ts');
            await (await startApplication()).get('router').navigate('/home/console');
        });
        await expect(page.locator('.base-text-component')).toHaveCount(0);
        await expect(page.locator(`script[src$="${scriptUrl}"]`)).toHaveCount(0);
        await expect.poll(() => page.evaluate(name => Array.from(document.fonts).some(font => font.family.includes(name)), fontName)).toBe(false);
        expect(await page.evaluate(() => (globalThis as any).__migrationResourceScriptRuns)).toBe(1);
    });
}
