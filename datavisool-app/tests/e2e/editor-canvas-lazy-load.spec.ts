/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {expect, test} from '@playwright/test';

const projectData = {canvasManager: {width: 840, height: 480, adaptationType: 'none'}};
const projectViewTimeout = 20_000;

const canvasImplementationPaths = [
    '/plugins/editor-canvas/editorCanvasRuntime.tsx',
    '/plugins/editor-canvas/history/HistoryRecordOperateProxy.ts',
    '/plugins/editor-canvas/state/EventOperateStore.ts',
    '/plugins/editor-canvas/viewport/ViewportStore.ts',
] as const;

const editorPanelPaths = [
    '/plugins/editor-component-library/ComponentList.tsx',
    '/plugins/editor-resource-library/SourceList.tsx',
    '/plugins/editor-variables/GlobalVariableList.tsx',
    '/plugins/editor-template-library/TemplateLib.tsx',
    '/plugins/editor-blueprint/session/EditorBlueprintOverlay.tsx',
    '/plugins/editor-inspector/DesignerRight.tsx',
] as const;

const trackedModulePaths = [...canvasImplementationPaths, ...editorPanelPaths];
const moduleRequestCounts = (requests: readonly string[]) => Object.fromEntries(
    trackedModulePaths.map(path => [path, requests.filter(request => request.includes(path)).length]),
);

test.setTimeout(90_000);

test('登录、预览和发布不加载Canvas实现，首次设计器进入只加载一次且停用取消不重载', async ({page}) => {
    const requests: string[] = [];
    page.on('request', request => requests.push(new URL(request.url()).pathname));

    // 启动与生产相同的插件集合，但由本用例加入一个可撤回的 stop veto 来触发真实 cancel。
    await page.route('**/src/index.tsx', route => route.abort());
    await page.route('**/static/logo/**', route => route.fulfill({status: 404}));
    await page.route(url => new URL(url).pathname.startsWith('/api/'), route => {
        const {pathname} = new URL(route.request().url());
        let data: unknown = [];
        if (pathname.startsWith('/api/project/getProjectData/')) {
            const id = pathname.split('/').at(-1);
            data = {id, name: `项目 ${id}`, dataJson: JSON.stringify(projectData)};
        } else if (pathname.startsWith('/api/release/getReleaseInfo/')) {
            data = {encrypt: false};
        } else if (pathname === '/api/release/getReleaseData') {
            data = {name: '画布懒加载发布夹具', dataJson: JSON.stringify({
                projectJson: JSON.stringify(projectData), fonts: [], dynamicScripts: [], components: [],
            })};
        }
        return route.fulfill({json: {code: 200, msg: '', data}});
    });
    await page.addInitScript(() => {
        localStorage.setItem('datavisool-i18n-locale', 'zh-CN');
        localStorage.removeItem('DATAVISOOL_USER_INFO');
        localStorage.removeItem('token');
    });

    await page.goto('/login');
    await page.evaluate(async () => {
        const [{createAppRuntime}, {createAppPlugins}] = await Promise.all([
            import(/* @vite-ignore */ '/src/bootstrap/createAppRuntime.ts'),
            import(/* @vite-ignore */ '/src/bootstrap/appPlugins.ts'),
            import(/* @vite-ignore */ '/src/index.less'),
            import(/* @vite-ignore */ '/src/theme/default.less'),
            import(/* @vite-ignore */ '/node_modules/@datavisool/ui/dist/style.css'),
        ]);
        let vetoNextStop = true;
        let withdrawCount = 0;
        let cancelCount = 0;
        const stopVetoPlugin = {
            id: 'e2e-canvas-lazy-stop-veto',
            requires: [],
            provides: [],
            activate(context: {onStop(participant: {pause(): void; cancel(): void; withdraw(): void}): void}) {
                context.onStop({
                    pause() {},
                    cancel() { cancelCount += 1; },
                    async withdraw() {
                        withdrawCount += 1;
                        if (vetoNextStop) {
                            vetoNextStop = false;
                            await new Promise(resolve => setTimeout(resolve, 50));
                            throw new Error('intentional browser stop/cancel probe');
                        }
                    },
                });
                Object.assign(window, {
                    __canvasLazyStopState: () => ({withdrawCount, cancelCount}),
                });
            },
        };
        const application = await createAppRuntime([...createAppPlugins(), stopVetoPlugin]);
        Object.assign(window, {__canvasLazyApplication: application});
        application.get('ui').mount(document.getElementById('root')!);
    });
    await expect(page.getByRole('heading', {name: '登录控制台'})).toBeVisible();
    const loginCounts = moduleRequestCounts(requests);
    expect(loginCounts).toEqual(Object.fromEntries(trackedModulePaths.map(path => [path, 0])));

    await page.evaluate(async () => {
        const application = (window as any).__canvasLazyApplication;
        application.get('session').setUserInfo({
            id: 'canvas-lazy-fixture', username: 'tester', name: 'Test User',
            token: 'fixture-token', roles: ['ROLE_USER'],
        });
        await application.get('router').navigate('/preview?id=canvas-lazy-fixture');
    });
    await expect(page.locator('.datavisool-project-view')).toBeVisible({timeout: projectViewTimeout});
    const previewCounts = moduleRequestCounts(requests);
    expect(previewCounts).toEqual(loginCounts);

    await page.evaluate(async releaseId => {
        await (window as any).__canvasLazyApplication.get('router').navigate(`/release/${releaseId}`);
    }, Buffer.from('canvas-lazy-release').toString('base64'));
    await expect(page.locator('.datavisool-project-release')).toBeVisible({timeout: projectViewTimeout});
    expect(moduleRequestCounts(requests)).toEqual(loginCounts);

    await page.evaluate(async () => {
        await (window as any).__canvasLazyApplication.get('router').navigate('/designer?id=canvas-lazy-fixture');
    });
    await expect(page.locator('#designer-ds-content')).toBeVisible({timeout: projectViewTimeout});
    const designerCounts = moduleRequestCounts(requests);
    expect(designerCounts['/plugins/editor-canvas/editorCanvasRuntime.tsx']).toBe(1);
    for (const path of canvasImplementationPaths.slice(1)) expect(designerCounts[path]).toBe(1);
    for (const path of editorPanelPaths) expect(designerCounts[path]).toBe(0);

    const openPanel = async (label: string, path: typeof editorPanelPaths[number]) => {
        const requested = page.waitForRequest(request => new URL(request.url()).pathname.includes(path));
        await page.getByRole('button', {name: label, exact: true}).click();
        await requested;
        expect(moduleRequestCounts(requests)[path]).toBe(1);
    };
    await openPanel('组件库', editorPanelPaths[0]);
    await openPanel('资源库', editorPanelPaths[1]);
    await openPanel('全局变量', editorPanelPaths[2]);
    await openPanel('模板库', editorPanelPaths[3]);
    const blueprintPanelRequested = page.waitForRequest(request =>
        new URL(request.url()).pathname.includes(editorPanelPaths[4]));
    await page.getByRole('button', {name: '打开蓝图编辑器', exact: true}).click();
    await blueprintPanelRequested;
    expect(moduleRequestCounts(requests)[editorPanelPaths[4]]).toBe(1);
    await page.evaluate(() => (window as any).__canvasLazyApplication.get('editorShell').closeOverlay('blueprint'));
    await expect.poll(() => page.evaluate(() =>
        (window as any).__canvasLazyApplication.get('editorShell').isOverlayOpen('blueprint'))).toBe(false);
    await page.getByRole('button', {name: '添加基础文本'}).click();
    const layer = page.locator('#designer-ds-content [data-layer-transform]').first();
    await expect(layer).toHaveAttribute('data-layer-transform', /.+/);
    const layerId = await layer.getAttribute('data-layer-transform');
    expect(layerId).toBeTruthy();
    await page.getByRole('button', {name: '图层', exact: true}).click();
    const inspectorRequested = page.waitForRequest(request =>
        new URL(request.url()).pathname.includes(editorPanelPaths[5]));
    await page.locator(`.layer-item[data-id="${layerId}"]`).click();
    await inspectorRequested;
    const inspector = page.getByRole('region', {name: '组件属性'});
    await expect(inspector).toBeVisible();
    expect(moduleRequestCounts(requests)[editorPanelPaths[5]]).toBe(1);
    const beforeStopCounts = moduleRequestCounts(requests);
    const selectionBeforeStop = await page.evaluate(id => {
        const canvas = (window as any).__canvasLazyApplication.get('editorCanvas');
        canvas.select([id], 'canvas');
        return canvas.readSelection().ids;
    }, layerId!);
    expect(selectionBeforeStop).toContain(layerId);

    const cancelledStop = await page.evaluate(async () => {
        const application = (window as any).__canvasLazyApplication;
        let errorName = '';
        try { await application.stop(); }
        catch (error) { errorName = (error as Error).name; }
        return {
            errorName,
            lifecycle: (window as any).__canvasLazyStopState(),
            selection: application.get('editorCanvas').readSelection().ids,
        };
    });
    expect(cancelledStop.errorName).toBe('PluginLifecycleError');
    expect(cancelledStop.lifecycle).toEqual({withdrawCount: 1, cancelCount: 1});
    expect(cancelledStop.selection).toEqual(selectionBeforeStop);
    await expect(inspector).toBeVisible();
    expect(moduleRequestCounts(requests)).toEqual(beforeStopCounts);

    await page.evaluate(async () => await (window as any).__canvasLazyApplication.stop());
    expect(moduleRequestCounts(requests)).toEqual(beforeStopCounts);
});
