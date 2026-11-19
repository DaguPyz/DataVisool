/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {expect, test, type Page} from '@playwright/test';

const projectData = {canvasManager: {width: 840, height: 480, adaptationType: 'none'}};
const projectViewTimeout = 20_000;

test.setTimeout(60_000);

async function isOverlayOpen(page: Page, id: string) {
    return page.evaluate(async overlayId => {
        const entry = '/src/bootstrap/startApplication.ts';
        const {startApplication} = await import(/* @vite-ignore */ entry);
        return (await startApplication()).get('editorShell').isOverlayOpen(overlayId);
    }, id);
}

test.beforeEach(async ({page}) => {
    await page.addInitScript(() => {
        localStorage.setItem('datavisool-i18n-locale', 'zh-CN');
        localStorage.setItem('DATAVISOOL_USER_INFO', JSON.stringify({
            id: 'contributions-fixture', username: 'tester', name: 'Test User', token: 'fixture-token', roles: ['ROLE_USER'],
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

test('画布设置与蓝图在 workspace overlay 组内互斥', async ({page}) => {
    await page.goto('/designer?id=overlay-contributions');
    await expect(page.locator('#designer-ds-content')).toBeVisible({timeout: projectViewTimeout});

    await page.evaluate(async () => {
        const {startApplication} = await import(/* @vite-ignore */ '/src/bootstrap/startApplication.ts');
        await (await startApplication()).get('editorCommands').execute('project.dialog', 'canvas');
    });
    await expect.poll(() => isOverlayOpen(page, 'project.canvas')).toBe(true);
    await expect(page.locator('.datavisool-header-canvas-config-dialog')).toBeVisible();

    await page.evaluate(async () => {
        const {startApplication} = await import(/* @vite-ignore */ '/src/bootstrap/startApplication.ts');
        await (await startApplication()).get('editorCommands').execute('blueprint.open');
    });
    await expect.poll(() => isOverlayOpen(page, 'project.canvas')).toBe(false);
    await expect.poll(() => isOverlayOpen(page, 'blueprint')).toBe(true);
    await expect(page.locator('.bp-header-title')).toHaveText('蓝图编辑器');
    await expect(page.locator('.datavisool-header-canvas-config-dialog')).toHaveCount(0);

    await page.evaluate(async () => {
        const {startApplication} = await import(/* @vite-ignore */ '/src/bootstrap/startApplication.ts');
        await (await startApplication()).get('editorCommands').execute('project.dialog', 'canvas');
    });
    await expect.poll(() => isOverlayOpen(page, 'blueprint')).toBe(false);
    await expect.poll(() => isOverlayOpen(page, 'project.canvas')).toBe(true);
    await expect(page.locator('.bp-header-title')).toHaveCount(0);
    await expect(page.locator('.datavisool-header-canvas-config-dialog')).toBeVisible();
});

test('停用蓝图插件撤销其工具栏、overlay 和命令，画布仍能添加并撤销', async ({page}) => {
    await page.goto('/designer?id=stop-blueprint');
    const canvas = page.locator('#designer-ds-content');
    await expect(canvas).toBeVisible({timeout: projectViewTimeout});
    const blueprintButton = page.getByRole('button', {name: '打开蓝图编辑器', exact: true});
    await blueprintButton.click();
    await expect(page.locator('.bp-header-title')).toBeVisible();

    const registrationState = await page.evaluate(async () => {
        const {startApplication} = await import(/* @vite-ignore */ '/src/bootstrap/startApplication.ts');
        const application = await startApplication();
        await application.stopPlugin('editor-blueprint');
        const commands = application.get('editorCommands');
        const shell = application.get('editorShell');
        return {
            commands: ['blueprint.open', 'blueprint.close', 'blueprint.delete-selection'].map(id => commands.has(id)),
            overlayCanOpen: shell.openOverlay('blueprint'),
            overlayOpen: shell.isOverlayOpen('blueprint'),
        };
    });
    expect(registrationState).toEqual({commands: [false, false, false], overlayCanOpen: false, overlayOpen: false});
    await expect(blueprintButton).toHaveCount(0);
    await expect(page.locator('.bp-header-title')).toHaveCount(0);

    const text = canvas.locator('.base-text-component');
    const toolbar = page.getByRole('toolbar', {name: '画布工具'});
    await toolbar.getByRole('button', {name: '添加基础文本'}).click();
    await expect(text).toHaveCount(1);
    await toolbar.getByRole('button', {name: '撤销', exact: true}).click();
    await expect(text).toHaveCount(0);
});

test('快捷键帮助重复开关只保留一个 dialog，停用插件撤销入口和命令', async ({page}) => {
    await page.goto('/designer?id=stop-shortcuts');
    await expect(page.locator('#designer-ds-content')).toBeVisible({timeout: projectViewTimeout});
    const helpButton = page.getByRole('button', {name: '快捷键帮助', exact: true});
    await helpButton.click();
    const helpDialog = page.locator('.hotkey-modal');
    await expect(helpDialog).toBeVisible();

    await page.evaluate(async () => {
        const {startApplication} = await import(/* @vite-ignore */ '/src/bootstrap/startApplication.ts');
        const commands = (await startApplication()).get('editorCommands');
        await commands.execute('shortcuts.help');
        await commands.execute('shortcuts.help');
    });
    await expect(helpDialog).toHaveCount(1);

    await page.evaluate(async () => {
        const {startApplication} = await import(/* @vite-ignore */ '/src/bootstrap/startApplication.ts');
        const commands = (await startApplication()).get('editorCommands');
        await commands.execute('shortcuts.help', {toggle: true});
    });
    await expect(helpDialog).toHaveCount(0);
    await expect.poll(() => isOverlayOpen(page, 'shortcut-help')).toBe(false);

    await page.evaluate(async () => {
        const {startApplication} = await import(/* @vite-ignore */ '/src/bootstrap/startApplication.ts');
        const commands = (await startApplication()).get('editorCommands');
        await commands.execute('shortcuts.help', {toggle: true});
        await commands.execute('shortcuts.help');
    });
    await expect(helpDialog).toHaveCount(1);
    const registrationState = await page.evaluate(async () => {
        const {startApplication} = await import(/* @vite-ignore */ '/src/bootstrap/startApplication.ts');
        const application = await startApplication();
        await application.stopPlugin('editor-shortcuts');
        const commands = application.get('editorCommands');
        const shell = application.get('editorShell');
        return {
            command: commands.has('shortcuts.help'),
            overlayCanOpen: shell.openOverlay('shortcut-help'),
            overlayOpen: shell.isOverlayOpen('shortcut-help'),
        };
    });
    expect(registrationState).toEqual({command: false, overlayCanOpen: false, overlayOpen: false});
    await expect(helpButton).toHaveCount(0);
    await expect(helpDialog).toHaveCount(0);
});

test('命令重复注册报错，注销会撤销入口并中止迟到结果', async ({page}) => {
    await page.goto('/designer?id=command-lifecycle');
    await expect(page.locator('#designer-ds-content')).toBeVisible({timeout: projectViewTimeout});

    const result = await page.evaluate(async () => {
        const {startApplication} = await import(/* @vite-ignore */ '/src/bootstrap/startApplication.ts');
        const application = await startApplication();
        const commands = application.get('editorCommands');
        let duplicateError: string | undefined;
        try {
            commands.register('blueprint.open', () => undefined);
        } catch (error) {
            duplicateError = error instanceof Error ? error.message : String(error);
        }

        await application.stopPlugin('editor-template-library');
        const cancelledRegistration = commands.register('template.save-selection', () => true);
        cancelledRegistration();
        const unavailableAfterUnregister = await commands.execute('template.save-selection')
            .then(() => 'resolved', error => error instanceof Error ? error.message : String(error));
        const errorName = (error: unknown) => error && typeof error === 'object' && 'name' in error
            ? String(error.name)
            : String(error);

        let commandSignal: AbortSignal | undefined;
        let releaseLateResult!: (value: boolean) => void;
        let markStarted!: () => void;
        const started = new Promise<void>(resolve => { markStarted = resolve; });
        const unregisterRunning = commands.register('template.save-selection', signal => {
            commandSignal = signal;
            markStarted();
            return new Promise<boolean>(resolve => { releaseLateResult = resolve; });
        });
        const pending = commands.execute('template.save-selection');
        await started;
        unregisterRunning();
        const abortedAfterUnregister = commandSignal?.aborted ?? false;
        releaseLateResult(true);
        const lateResult = await pending.then(() => 'resolved', error => errorName(error));

        return {
            duplicateError,
            unavailableAfterUnregister,
            abortedAfterUnregister,
            lateResult,
            commandStillRegistered: commands.has('template.save-selection'),
        };
    });

    expect(result.duplicateError).toContain("already registered");
    expect(result.unavailableAfterUnregister).toContain("'template.save-selection' is unavailable");
    expect(result.abortedAfterUnregister).toBe(true);
    expect(result.lateResult).toBe('AbortError');
    expect(result.commandStillRegistered).toBe(false);
});

test('更多操作菜单打开期间停用功能会立即撤回菜单项', async ({page}) => {
    await page.goto('/designer?id=unregister-open-menu');
    await expect(page.locator('#designer-ds-content')).toBeVisible({timeout: projectViewTimeout});
    await page.getByRole('button', {name: '更多项目操作'}).click();
    const openBlueprint = page.getByRole('menuitem', {name: '打开蓝图', exact: true});
    await expect(openBlueprint).toBeVisible();
    await page.evaluate(async () => {
        const {startApplication} = await import(/* @vite-ignore */ '/src/bootstrap/startApplication.ts');
        await (await startApplication()).stopPlugin('editor-blueprint');
    });
    await expect(openBlueprint).toHaveCount(0);
    await expect(page.getByRole('menuitem', {name: '保存项目', exact: true})).toBeVisible();
});

test('重新打开同一个弹窗后旧实例的关闭回调失效', async ({page}) => {
    await page.goto('/designer?id=stale-overlay-close');
    await expect(page.locator('#designer-ds-content')).toBeVisible({timeout: projectViewTimeout});
    await page.evaluate(async () => {
        const {startApplication} = await import(/* @vite-ignore */ '/src/bootstrap/startApplication.ts');
        const shell = (await startApplication()).get('editorShell');
        const state = {phase: 0, close: [] as Array<() => void>};
        (window as any).__overlayLifecycle = state;
        (window as any).__removeLifecycleOverlay = shell.registerOverlay({
            id: 'test-lifecycle',
            View({onClose}: {onClose(): void}) { state.close[state.phase] ??= onClose; return null; },
        });
        shell.openOverlay('test-lifecycle');
    });
    await expect.poll(() => page.evaluate(() => Boolean((window as any).__overlayLifecycle.close[0]))).toBe(true);
    await page.evaluate(async () => {
        const {startApplication} = await import(/* @vite-ignore */ '/src/bootstrap/startApplication.ts');
        const shell = (await startApplication()).get('editorShell');
        shell.closeOverlay('test-lifecycle');
        (window as any).__overlayLifecycle.phase = 1;
        shell.openOverlay('test-lifecycle');
    });
    await expect.poll(() => page.evaluate(() => Boolean((window as any).__overlayLifecycle.close[1]))).toBe(true);
    await page.evaluate(() => (window as any).__overlayLifecycle.close[0]());
    await expect.poll(() => isOverlayOpen(page, 'test-lifecycle')).toBe(true);
    await page.evaluate(() => (window as any).__overlayLifecycle.close[1]());
    await expect.poll(() => isOverlayOpen(page, 'test-lifecycle')).toBe(false);
    await page.evaluate(() => (window as any).__removeLifecycleOverlay());
});

test('画布就绪后可通过命令打开按需加载的模板保存窗口', async ({page}) => {
    await page.goto('/designer?id=lazy-template-snapshot');
    await expect(page.locator('#designer-ds-content')).toBeVisible({timeout: projectViewTimeout});
    await page.getByRole('button', {name: '添加基础文本', exact: true}).click();
    await expect(page.locator('#designer-ds-content .base-text-component')).toHaveCount(1);
    const snapshotState = await page.evaluate(async () => {
        const {startApplication} = await import(/* @vite-ignore */ '/src/bootstrap/startApplication.ts');
        const application = await startApplication();
        const canvas = application.get('editorCanvas');
        const id = Object.keys(window.DATAVISOOL_ENV.currentManager.layerManager.layerConfigs)[0];
        canvas.select([id], 'canvas');
        const snapshot = canvas.readSelectionTemplate();
        return {
            ids: snapshot && Object.keys(snapshot.layers),
            configs: snapshot && Object.keys(snapshot.configs),
            active: snapshot && canvas.isSceneActive(snapshot.sceneVersion),
        };
    });
    expect(snapshotState.ids).toHaveLength(1);
    expect(snapshotState.configs).toEqual(snapshotState.ids);
    expect(snapshotState.active).toBe(true);
    await page.evaluate(async () => {
        const {startApplication} = await import(/* @vite-ignore */ '/src/bootstrap/startApplication.ts');
        (window as any).__lazyTemplateResult = (await startApplication()).get('editorCommands').execute('template.save-selection');
    });
    const dialog = page.getByRole('dialog').filter({hasText: '存为模板'});
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', {name: '取消', exact: true}).click();
    expect(await page.evaluate(() => (window as any).__lazyTemplateResult)).toBe(false);
});
