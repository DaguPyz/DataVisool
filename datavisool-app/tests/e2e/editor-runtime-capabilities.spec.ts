/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {expect, test} from '@playwright/test';
import {DesignerMode} from '@datavisool/sdk/types';

const projectData = {canvasManager: {width: 840, height: 480, adaptationType: 'none'}};
const projectViewTimeout = 20_000;

test.setTimeout(60_000);

test.beforeEach(async ({page}) => {
    await page.addInitScript(() => {
        localStorage.setItem('datavisool-i18n-locale', 'zh-CN');
        localStorage.setItem('DATAVISOOL_USER_INFO', JSON.stringify({
            id: 'runtime-capabilities-fixture', username: 'tester', name: 'Test User', token: 'fixture-token', roles: ['ROLE_USER'],
        }));
    });
    await page.route('**/static/logo/**', route => route.fulfill({status: 404}));
    await page.route(url => url.pathname.startsWith('/api/'), route => {
        const {pathname} = new URL(route.request().url());
        let data: unknown = [];
        if (pathname.startsWith('/api/project/getProjectData/')) {
            const id = pathname.split('/').at(-1);
            data = {id, name: `项目 ${id}`, dataJson: JSON.stringify(projectData)};
        }
        return route.fulfill({json: {code: 200, msg: '', data}});
    });
});

test('运行时和蓝图节点 capability 在应用停用后拒绝迟到调用', async ({page}) => {
    await page.goto('/designer?id=runtime-capabilities');
    await expect(page.locator('#designer-ds-content')).toBeVisible({timeout: projectViewTimeout});

    const result = await page.evaluate(async editMode => {
        const {startApplication} = await import(/* @vite-ignore */ '/src/bootstrap/startApplication.ts');
        const application = await startApplication();
        const runtime = application.get('designerRuntime');
        const registry = await runtime.prepareBlueprintNodes();
        const definition = registry.get('BPGlobalNode');
        if (!definition) throw new Error('BPGlobalNode definition was not registered.');

        const controller = definition.createController({
            id: 'node-1', type: 'BPGlobalNode', name: 'before', input: [], output: [],
        } as any);
        let notifications = 0;
        const unsubscribe = controller.subscribe(() => { notifications += 1; });
        controller.update({name: 'after'});
        unsubscribe();
        const controllerState = {
            layoutType: definition.type,
            infoType: controller.getNodeInfo('node-1')?.type,
            updatedName: controller.getConfig()?.name,
            notifications,
        };
        controller.destroy();
        const controllerDestroyed = controller.getConfig() === null;

        const persistedTypes = registry.list().map(item => item.type);
        const factory = await runtime.prepare(editMode);
        await application.stop();

        const errorName = (error: unknown) => error instanceof Error ? error.name : String(error);
        const outcome = async (operation: () => unknown | Promise<unknown>) => {
            try {
                const value = await operation() as {close?: () => void; destroy?: () => void} | undefined;
                value?.close?.();
                value?.destroy?.();
                return {status: 'resolved'};
            } catch (error) {
                return {status: 'rejected', name: errorName(error)};
            }
        };

        const afterStop = await Promise.all([
            outcome(() => runtime.prepareBlueprintNodes()),
            outcome(() => runtime.prepare(editMode)),
            outcome(() => factory()),
            outcome(() => definition.createController()),
        ]);
        return {persistedTypes, controllerState, controllerDestroyed, afterStop};
    }, DesignerMode.EDIT);

    expect(result.persistedTypes).toEqual([
        'BPGlobalNode',
        'BPGlobalVariableNode',
        'BPLayerNode',
        'BPConditionNode',
        'BPLogicalProcessNode',
        'BPMqttNode',
        'BPPopupBoxNode',
        'BPTimerNode',
        'BPVisibleNode',
        'BPWebSocketNode',
    ]);
    expect(result.controllerState).toEqual({
        layoutType: 'BPGlobalNode',
        infoType: 'BPGlobal',
        updatedName: 'after',
        notifications: 1,
    });
    expect(result.controllerDestroyed).toBe(true);
    expect(result.afterStop).toEqual(Array.from({length: 4}, () => ({status: 'rejected', name: 'AbortError'})));
});
