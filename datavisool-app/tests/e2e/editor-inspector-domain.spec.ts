/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {expect, test, type Page} from '@playwright/test';

const emptyProject = {canvasManager: {width: 840, height: 480, adaptationType: 'none'}};

async function startEditor(page: Page, id: string) {
    await page.goto(`/designer?id=${id}`);
    await expect(page.locator('#designer-ds-content')).toBeVisible({timeout: 20_000});
}

async function waitForPublicTarget(page: Page, id: string) {
    return page.evaluate(async layerId => {
        const app = (window as any).__inspectorDomainApp;
        const canvas = app.get('editorCanvas');
        const domain = await canvas.prepareInspectorDomain();
        let target;
        for (let i = 0; i < 40; i++) {
            target = domain.readTarget(layerId);
            if (target) break;
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        if (!target) throw new Error(`Inspector target ${layerId} did not become available`);
        const facade = domain.createControllerFacade(layerId);
        (window as any).__inspectorDomainBinding = {domain, facade};
        return {targetId: target.id, targetType: target.type, facadeCurrent: facade?.isCurrent()};
    }, id);
}

test.beforeEach(async ({page}) => {
    await page.addInitScript(() => {
        localStorage.setItem('datavisool-i18n-locale', 'zh-CN');
        localStorage.setItem('DATAVISOOL_USER_INFO', JSON.stringify({
            id: 'inspector-domain-fixture', username: 'tester', name: 'Test User', token: 'fixture-token', roles: ['ROLE_USER'],
        }));
    });
    await page.route('**/static/logo/**', route => route.fulfill({status: 404}));
    await page.route(url => url.pathname.startsWith('/api/'), route => {
        const pathname = new URL(route.request().url()).pathname;
        const id = pathname.split('/').at(-1) ?? 'fixture';
        const data = pathname.startsWith('/api/project/getProjectData/')
            ? {id, name: `项目 ${id}`, dataJson: JSON.stringify(emptyProject)}
            : [];
        return route.fulfill({json: {code: 200, msg: '', data}});
    });
});

test.setTimeout(60_000);

test('inspector domain and controller facade stay bound to their original scene and controller', async ({page}) => {
    await startEditor(page, 'inspector-domain-first');
    await page.evaluate(async () => {
        const entry = '/src/bootstrap/startApplication.ts';
        const {startApplication} = await import(/* @vite-ignore */ entry);
        const app = await startApplication();
        (window as any).__inspectorDomainApp = app;
        const canvas = app.get('editorCanvas');
        const layerId = 'inspector-domain-shared-layer';
        canvas.insertLayer({id: layerId, name: 'Domain fixture', type: 'BaseText', x: 10, y: 10, width: 200, height: 50, lock: false, hide: false});
        canvas.select([layerId], 'canvas', {kind: 'inspect', id: layerId});
    });
    const original = await waitForPublicTarget(page, 'inspector-domain-shared-layer');
    expect(original.targetId).toBe('inspector-domain-shared-layer');
    expect(original.facadeCurrent).toBe(true);

    await page.locator('.designer-right').getByRole('button', {name: '基础'}).click();
    const width = page.locator('.datavisool-config-panel input[type="number"]').first();
    await expect(width).toHaveValue('200');
    await width.fill('260');
    await width.press('Enter');
    await expect.poll(() => page.evaluate(() => {
        const {domain} = (window as any).__inspectorDomainBinding;
        return domain.readTarget('inspector-domain-shared-layer')?.layer.width;
    })).toBe(260);
    await page.evaluate(() => (window as any).__inspectorDomainApp.get('editorCanvas').undo());
    await expect.poll(() => page.evaluate(() => {
        const {domain} = (window as any).__inspectorDomainBinding;
        return domain.readTarget('inspector-domain-shared-layer')?.layer.width;
    })).toBe(200);

    const sameScene = await page.evaluate(async () => {
        const app = (window as any).__inspectorDomainApp;
        const canvas = app.get('editorCanvas');
        const {domain, facade} = (window as any).__inspectorDomainBinding;
        await canvas.performAction('doDelete');
        let deleted = false;
        for (let i = 0; i < 40; i++) {
            deleted = domain.readTarget('inspector-domain-shared-layer') === undefined;
            if (deleted) break;
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        canvas.undo();
        let restored = false;
        for (let i = 0; i < 40; i++) {
            restored = Boolean(domain.readTarget('inspector-domain-shared-layer'));
            if (restored) break;
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        return {deleted, restored, oldFacadeCurrent: facade.isCurrent()};
    });
    expect(sameScene.deleted).toBe(true);
    expect(sameScene.restored).toBe(true);
    expect(sameScene.oldFacadeCurrent).toBe(false);

    await page.evaluate(async () => {
        const app = (window as any).__inspectorDomainApp;
        await app.get('router').navigate('/designer?id=inspector-domain-second');
    });
    await expect(page).toHaveTitle('项目 inspector-domain-second');
    await expect(page.locator('#designer-ds-content')).toBeVisible();
    await page.evaluate(() => {
        const canvas = (window as any).__inspectorDomainApp.get('editorCanvas');
        const layerId = 'inspector-domain-shared-layer';
        canvas.insertLayer({id: layerId, name: 'New scene fixture', type: 'BaseText', x: 20, y: 20, width: 200, height: 50, lock: false, hide: false});
        canvas.select([layerId], 'canvas', {kind: 'inspect', id: layerId});
    });
    const sceneSwitch = await page.evaluate(async () => {
        const app = (window as any).__inspectorDomainApp;
        const canvas = app.get('editorCanvas');
        const {domain: oldDomain, facade: oldFacade} = (window as any).__inspectorDomainBinding;
        const newDomain = await canvas.prepareInspectorDomain();
        const id = 'inspector-domain-shared-layer';
        let target;
        for (let i = 0; i < 40; i++) {
            target = newDomain.readTarget(id);
            if (target) break;
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        const newFacade = newDomain.createControllerFacade(id);
        await Promise.resolve();
        await new Promise(resolve => setTimeout(resolve, 0));
        oldFacade.update({__staleInspectorWrite: true});
        return {
            oldDomainActive: oldDomain.isActive(),
            oldTarget: oldDomain.readTarget(id),
            oldFacadeCurrent: oldFacade.isCurrent(),
            newTarget: Boolean(target),
            staleWriteReachedNewController: newFacade?.getConfig()?.__staleInspectorWrite === true,
        };
    });
    expect(sceneSwitch).toEqual({
        oldDomainActive: false,
        oldTarget: undefined,
        oldFacadeCurrent: false,
        newTarget: true,
        staleWriteReachedNewController: false,
    });
});

test('aborting one inspector consumer invalidates its edits without withdrawing other consumers', async ({page}) => {
    await startEditor(page, 'inspector-consumers');
    await page.evaluate(async () => {
        const {startApplication} = await import(/* @vite-ignore */ '/src/bootstrap/startApplication.ts');
        const app = await startApplication();
        (window as any).__inspectorDomainApp = app;
        app.get('editorCanvas').insertLayer({id: 'consumer-layer', type: 'BaseText', name: 'Consumer', x: 0, y: 0, width: 200, height: 50});
    });
    await waitForPublicTarget(page, 'consumer-layer');
    const result = await page.evaluate(async () => {
        const canvas = (window as any).__inspectorDomainApp.get('editorCanvas');
        const consumer = new AbortController();
        const other = new AbortController();
        const domain = await canvas.prepareInspectorDomain(consumer.signal);
        const otherDomain = await canvas.prepareInspectorDomain(other.signal);
        const defaultDomain = await canvas.prepareInspectorDomain();
        const oldFacade = domain.createControllerFacade('consumer-layer');
        consumer.abort();
        oldFacade.update({__withdrawnConsumerWrite: true});
        const rejectedEdit = domain.applyLayerEdit('consumer-layer', {kind: 'resize', width: 999});
        let rejectionName;
        try { await canvas.prepareInspectorDomain(consumer.signal); }
        catch (error) { rejectionName = (error as Error).name; }
        const validEdit = otherDomain.applyLayerEdit('consumer-layer', {kind: 'resize', width: 320});
        return {
            active: domain.isActive(), current: oldFacade.isCurrent(), rejectedEdit, rejectionName,
            otherActive: otherDomain.isActive(), defaultActive: defaultDomain.isActive(), validEdit,
            width: defaultDomain.readTarget('consumer-layer')?.layer.width,
            staleWrite: otherDomain.createControllerFacade('consumer-layer')?.getConfig()?.__withdrawnConsumerWrite === true,
        };
    });
    expect(result).toEqual({
        active: false, current: false, rejectedEdit: false, rejectionName: 'AbortError',
        otherActive: true, defaultActive: true, validEdit: true, width: 320, staleWrite: false,
    });
});
