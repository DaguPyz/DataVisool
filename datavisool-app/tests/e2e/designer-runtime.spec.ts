/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {expect, test, type Page} from '@playwright/test';
import ProjectDataCodecUtil from '../../src/util/ProjectDataCodecUtil.ts';

const editingProject = {canvasManager: {width: 840, height: 480, adaptationType: 'none'}};
const publishedProject = {canvasManager: {width: 960, height: 540, adaptationType: 'none'}};
const blueprintRuntimeProject = {
    canvasManager: {width: 840, height: 480, adaptationType: 'none'},
    layerManager: {
        layerHeader: 'graph-target',
        layerTail: 'graph-target',
        layerConfigs: {
            'graph-target': {
                id: 'graph-target', name: '蓝图目标图层', type: 'BaseColorBlock',
                width: 200, height: 100, x: 100, y: 100, order: 1,
            },
        },
        elemConfigs: {
            'graph-target': {
                base: {id: 'graph-target', name: '蓝图目标图层', type: 'BaseColorBlock'},
                style: {background: '#009DFF33', borderRadius: 0, borderWidth: 0, borderColor: '#74747400', borderStyle: 'none'},
                filter: {enable: false, blur: 0, brightness: 1, contrast: 1, opacity: 1, saturate: 1, hueRotate: 0},
            },
        },
    },
    bluePrintManager: [{
        pageId: 'runtime-graph-page',
        pageName: '运行测试',
        bpNodeLayoutMap: {
            'graph-global': {id: 'graph-global', type: 'BPGlobalNode', position: {x: 0, y: 0}},
            'graph-global-logic': {id: 'graph-global-logic', type: 'BPLogicalProcessNode', position: {x: 200, y: 0}},
            'graph-visible': {id: 'graph-visible', type: 'BPVisibleNode', position: {x: 400, y: 0}},
            'graph-timer': {id: 'graph-timer', type: 'BPTimerNode', position: {x: 0, y: 200}},
            'graph-timer-logic': {id: 'graph-timer-logic', type: 'BPLogicalProcessNode', position: {x: 200, y: 200}},
        },
        bpNodeConfigMap: {
            'graph-global': {id: 'graph-global', type: 'BPGlobalNode', name: '全局'},
            'graph-global-logic': {id: 'graph-global-logic', type: 'BPLogicalProcessNode', handler: '() => []'},
            'graph-visible': {id: 'graph-visible', type: 'BPVisibleNode', nodeConfig: {nodeIds: ['graph-target']}},
            'graph-timer': {id: 'graph-timer', type: 'BPTimerNode', interval: 0.1, loop: true},
            'graph-timer-logic': {
                id: 'graph-timer-logic',
                type: 'BPLogicalProcessNode',
                handler: '() => { globalThis.__bpGraphTimerRuns = (globalThis.__bpGraphTimerRuns || 0) + 1; return []; }',
            },
        },
        bpAPMap: {
            'graph-global:allLoaded:1': ['graph-global-logic:execute:0'],
            'graph-global-logic:afterExecute:1': ['graph-visible:changeVisible:0'],
            'graph-timer:scheduledExecute:1': ['graph-timer-logic:execute:0'],
        },
        bpAPLineMap: {},
        bpLines: {},
    }],
};
const blueprintPopupRuntimeProject = {
    ...blueprintRuntimeProject,
    bluePrintManager: blueprintRuntimeProject.bluePrintManager.map(page => ({
        ...page,
        bpNodeLayoutMap: {
            ...page.bpNodeLayoutMap,
            'graph-popup': {id: 'graph-popup', type: 'BPPopupBoxNode', position: {x: 600, y: 0}},
        },
        bpNodeConfigMap: {
            ...page.bpNodeConfigMap,
            'graph-popup': {
                id: 'graph-popup', type: 'BPPopupBoxNode', nodeId: 'graph-target',
                title: '蓝图弹框', titleColor: '#ffffff', background: '#1f1f1f',
            },
        },
        bpAPMap: {
            ...page.bpAPMap,
            'graph-global:allLoaded:1': [...(page.bpAPMap['graph-global:allLoaded:1'] ?? []), 'graph-popup:open:0'],
        },
    })),
};
const projectViewTimeout = 20_000;

test.setTimeout(60_000);

function navigate(page: Page, path: string) {
    return page.evaluate(async to => {
        const entry = '/src/bootstrap/startApplication.ts';
        const {startApplication} = await import(/* @vite-ignore */ entry);
        const application = await startApplication();
        await application.get('router').navigate(to);
    }, path);
}

test.beforeEach(async ({page}) => {
    await page.addInitScript(() => {
        localStorage.setItem('datavisool-i18n-locale', 'zh-CN');
        localStorage.setItem('DATAVISOOL_USER_INFO', JSON.stringify({
            id: 'designer-fixture', username: 'tester', name: 'Test User', token: 'fixture-token', roles: ['ROLE_USER'],
        }));
    });
    await page.route('**/static/logo/**', route => route.fulfill({status: 404}));
    await page.route(url => url.pathname.startsWith('/api/'), route => {
        const {pathname} = new URL(route.request().url());
        let data: unknown = [];
        if (pathname.startsWith('/api/project/getProjectData/')) {
            const id = pathname.split('/').at(-1);
            data = {id, name: `项目 ${id}`, dataJson: JSON.stringify(editingProject)};
        } else if (pathname === '/api/release/getReleaseInfo/published') {
            data = {encrypt: false};
        } else if (pathname === '/api/release/getReleaseData') {
            data = {
                name: '发布项目',
                dataJson: JSON.stringify({
                    projectJson: JSON.stringify(publishedProject),
                    fonts: [], dynamicScripts: [], components: [],
                }),
            };
        }
        return route.fulfill({json: {code: 200, msg: '', data}});
    });
});

test('主编辑器、预览和发布沿用各自的数据来源及运行模式', async ({page}) => {
    await page.goto('/designer?id=fixture');
    await expect(page.locator('#designer-ds-content')).toBeVisible({timeout: projectViewTimeout});
    await expect(page.getByRole('group', {name: '画布缩放'})).toBeVisible();
    await expect(page).toHaveTitle('项目 fixture');
    await expect.poll(() => page.evaluate(() => window.DATAVISOOL_ENV.mode)).toBe('0');

    await navigate(page, '/preview?id=fixture');
    await expect(page.locator('.datavisool-project-view')).toHaveCSS('width', '840px', {timeout: projectViewTimeout});
    await expect.poll(() => page.evaluate(() => window.DATAVISOOL_ENV.mode)).toBe('1');
    expect(await page.evaluate(() => Boolean(window.DATAVISOOL_ENV.editorLoader))).toBe(false);

    const releaseRequest = page.waitForRequest('**/api/release/getReleaseData');
    await navigate(page, `/release/${Buffer.from('published').toString('base64')}`);
    expect((await releaseRequest).postDataJSON()).toEqual({id: 'published', password: null});
    await expect(page.locator('.datavisool-project-release')).toHaveCSS('width', '960px', {timeout: projectViewTimeout});
    await expect.poll(() => page.evaluate(() => window.DATAVISOOL_ENV.mode)).toBe('2');
});

test('旧版序列化蓝图仅在预览和发布执行，运行视图不加载编辑器会话且退出后停止定时器', async ({page}) => {
    const editorBlueprintUiRequests: string[] = [];
    const popupUiRequests: string[] = [];
    const pixiRequests: string[] = [];
    page.on('request', request => {
        const pathname = new URL(request.url()).pathname;
        if (pathname.includes('/src/plugins/editor-blueprint/') && !pathname.endsWith('/editorBlueprintPlugin.tsx'))
            editorBlueprintUiRequests.push(pathname);
        if (/\/popup-box\/(showModal|ModalRenderUtil)\.(ts|tsx)$/.test(pathname))
            popupUiRequests.push(pathname);
        if (/pixi/i.test(pathname)) pixiRequests.push(pathname);
    });
    await page.route('**/api/project/getProjectData/blueprint-graph', route => route.fulfill({json: {
        code: 200, msg: '',
        data: {id: 'blueprint-graph', name: '蓝图运行图', dataJson: JSON.stringify(blueprintRuntimeProject)},
    }}));
    await page.route('**/api/release/getReleaseInfo/blueprint-graph-release', route => route.fulfill({json: {
        code: 200, msg: '', data: {encrypt: false},
    }}));
    await page.route('**/api/release/getReleaseData', route => route.fulfill({json: {
        code: 200, msg: '',
        data: {
            name: '蓝图运行图发布版',
            dataJson: JSON.stringify({projectJson: JSON.stringify(blueprintRuntimeProject), fonts: [], dynamicScripts: [], components: []}),
        },
    }}));

    const target = page.locator('#graph-target [data-layer-transform="graph-target"]');
    const timerRuns = () => page.evaluate(() => (window as any).__bpGraphTimerRuns as number | undefined);
    const expectTimerStoppedAfterLeaving = async () => {
        await navigate(page, '/designer?id=empty-after-blueprint-runtime');
        await expect(page.locator('#designer-ds-content')).toBeVisible({timeout: projectViewTimeout});
        await expect.poll(() => page.evaluate(() => window.DATAVISOOL_ENV.mode)).toBe('0');
        const stoppedAt = await timerRuns();
        if (typeof stoppedAt !== 'number') throw new Error('Blueprint timer did not run before the runtime view closed.');
        expect(stoppedAt).toBeGreaterThan(0);
        await page.waitForTimeout(350);
        expect(await timerRuns()).toBe(stoppedAt);
    };

    await page.goto('/designer?id=blueprint-graph');
    await expect(page.locator('#designer-ds-content')).toBeVisible({timeout: projectViewTimeout});
    await expect(target).toHaveCSS('visibility', 'visible');
    await page.waitForTimeout(350);
    expect(await timerRuns()).toBeUndefined();

    await navigate(page, '/preview?id=blueprint-graph');
    await expect(page.locator('.datavisool-project-view')).toBeVisible({timeout: projectViewTimeout});
    await expect(target).toHaveCSS('visibility', 'hidden', {timeout: projectViewTimeout});
    await expect.poll(async () => (await timerRuns()) ?? 0).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => window.DATAVISOOL_ENV.mode)).toBe('1');
    await expectTimerStoppedAfterLeaving();

    const beforeRelease = await timerRuns();
    await navigate(page, `/release/${Buffer.from('blueprint-graph-release').toString('base64')}`);
    await expect(page.locator('.datavisool-project-release')).toBeVisible({timeout: projectViewTimeout});
    await expect(target).toHaveCSS('visibility', 'hidden', {timeout: projectViewTimeout});
    await expect.poll(async () => (await timerRuns()) ?? 0).toBeGreaterThan(beforeRelease ?? 0);
    await expect.poll(() => page.evaluate(() => window.DATAVISOOL_ENV.mode)).toBe('2');
    await expectTimerStoppedAfterLeaving();

    expect(editorBlueprintUiRequests).toEqual([]);
    expect(popupUiRequests).toEqual([]);
    expect(pixiRequests).toEqual([]);
});

test('运行弹框由原管理器销毁，延迟导入完成时不会为旧任务重新打开', async ({page}) => {
    const projectPath = '**/api/project/getProjectData/blueprint-popup-runtime';
    await page.route(projectPath, route => route.fulfill({json: {
        code: 200, msg: '',
        data: {id: 'blueprint-popup-runtime', name: '弹框资源清理', dataJson: JSON.stringify(blueprintPopupRuntimeProject)},
    }}));

    const popup = page.locator('.popup-box-dialog');
    let releasePopupImport!: () => void;
    let reportPopupImportStarted!: () => void;
    const popupImportGate = new Promise<void>(resolve => { releasePopupImport = resolve; });
    const popupImportStarted = new Promise<void>(resolve => { reportPopupImportStarted = resolve; });
    await page.route('**/src/plugins/designer-runtime/internal/designer/blueprint/node/core/impl/popup-box/showModal.ts*', async route => {
        reportPopupImportStarted();
        await popupImportGate;
        await route.continue();
    });
    try {
        await page.goto('/preview?id=blueprint-popup-runtime');
        await expect(page.locator('.datavisool-project-view')).toBeVisible({timeout: projectViewTimeout});
        await popupImportStarted;
        await navigate(page, '/designer?id=empty-after-stale-popup');
        await expect(page.locator('#designer-ds-content')).toBeVisible({timeout: projectViewTimeout});
        releasePopupImport();
        await page.waitForTimeout(250);
        await expect(popup).toHaveCount(0);

        await navigate(page, '/preview?id=blueprint-popup-runtime');
        await expect(page.locator('.datavisool-project-view')).toBeVisible({timeout: projectViewTimeout});
        await expect(popup).toBeVisible({timeout: projectViewTimeout});
        await navigate(page, '/designer?id=empty-after-popup-runtime');
        await expect(page.locator('#designer-ds-content')).toBeVisible({timeout: projectViewTimeout});
        await expect(popup).toHaveCount(0);
    } finally {
        releasePopupImport();
    }
});

test('编辑器预览等待保存结果，失败时关闭预览窗口', async ({page}) => {
    const id = 'preview-fixture';
    let finishSave!: () => void;
    const saveGate = new Promise<void>(resolve => { finishSave = resolve; });
    await page.route('**/api/project/update', async route => {
        await saveGate;
        await route.fulfill({json: {code: 200, msg: '', data: false}});
    });

    await page.goto(`/designer?id=${id}`);
    await expect(page.locator('#designer-ds-content')).toBeVisible({timeout: projectViewTimeout});
    const opened = page.waitForEvent('popup');
    const saving = page.waitForRequest('**/api/project/update');
    try {
        await page.getByRole('button', {name: '预览项目'}).click();
        const preview = await opened;
        expect(preview.url()).toBe('about:blank');
        expect((await saving).postDataJSON()).toMatchObject({id});
        finishSave();
        await expect.poll(() => preview.isClosed()).toBe(true);
        await expect(page.getByRole('button', {name: '保存失败 · 点击重试'})).toBeVisible();
    } finally {
        finishSave();
    }
});

test('编辑器加载失败后可重试并切换项目', async ({page}) => {
    const path = '**/api/project/getProjectData/retry';
    await page.route(path, route => route.fulfill({
        json: {code: 200, msg: '', data: null},
    }));
    await page.goto('/designer?id=retry');
    await expect(page.getByRole('heading', {name: '项目加载失败'})).toBeVisible({timeout: projectViewTimeout});
    await page.unroute(path);
    await page.getByRole('button', {name: '重试'}).click();
    await expect(page.locator('#designer-ds-content')).toBeVisible();
    await expect(page).toHaveTitle('项目 retry');
    await navigate(page, '/designer?id=second');
    await expect(page).toHaveTitle('项目 second');
    await expect(page.locator('#designer-ds-content')).toBeVisible();
});

test('切换项目时取消上一会话尚未返回的请求', async ({page}) => {
    await page.goto('/designer?id=first');
    await expect(page.locator('#designer-ds-content')).toBeVisible({timeout: projectViewTimeout});

    const path = '**/api/project/getProjectData/stale';
    let releaseResponse!: () => void;
    const responseGate = new Promise<void>(resolve => { releaseResponse = resolve; });
    await page.route(path, async route => {
        await responseGate;
        await route.fulfill({json: {
            code: 200, msg: '',
            data: {id: 'stale', name: '过期项目', dataJson: JSON.stringify(editingProject)},
        }}).catch(() => {});
    });

    try {
        const requestStarted = page.waitForRequest(path);
        await navigate(page, '/designer?id=stale');
        const request = await requestStarted;
        const requestCancelled = page.waitForEvent('requestfailed', candidate => candidate === request);
        await navigate(page, '/designer?id=current');
        expect((await requestCancelled).failure()?.errorText).toContain('ERR_ABORTED');
        await expect(page).toHaveTitle('项目 current');
        await expect(page.locator('#designer-ds-content')).toBeVisible();
    } finally {
        releaseResponse();
    }
});

test('工具栏和快捷键共用撤销历史，切换项目后清空旧记录', async ({page}) => {
    await page.goto('/designer?id=first-history');
    const canvas = page.locator('#designer-ds-content');
    await expect(canvas).toBeVisible({timeout: projectViewTimeout});
    const text = canvas.locator('.base-text-component');
    const toolbar = page.getByRole('toolbar', {name: '画布工具'});
    const addText = toolbar.getByRole('button', {name: '添加基础文本'});
    const undo = toolbar.getByRole('button', {name: '撤销', exact: true});
    const redo = toolbar.getByRole('button', {name: '重做', exact: true});

    await addText.click();
    await expect(text).toHaveCount(1);
    await page.keyboard.press('Meta+z');
    await expect(text).toHaveCount(0);
    await redo.click();
    await expect(text).toHaveCount(1);
    await undo.click();
    await expect(text).toHaveCount(0);

    await navigate(page, '/designer?id=second-history');
    await expect(page).toHaveTitle('项目 second-history');
    await expect(canvas).toBeVisible();
    await redo.click();
    await expect(text).toHaveCount(0);
    await addText.click();
    await expect(text).toHaveCount(1);
    await undo.click();
    await expect(text).toHaveCount(0);
    await page.keyboard.press('Meta+Shift+z');
    await expect(text).toHaveCount(1);
});

test('蓝图与画布改动按提交顺序撤销和重做', async ({page}) => {
    await page.goto('/designer?id=history-order');
    const canvas = page.locator('#designer-ds-content');
    await expect(canvas).toBeVisible({timeout: projectViewTimeout});
    const toolbar = page.getByRole('toolbar', {name: '画布工具'});
    const blueprint = toolbar.getByRole('button', {name: '打开蓝图编辑器'});
    const text = canvas.locator('.base-text-component');
    await toolbar.getByRole('button', {name: '添加基础文本'}).click();
    await expect(text).toHaveCount(1);
    await blueprint.click();
    const tabs = page.getByRole('tablist', {name: '蓝图页面'}).getByRole('tab');
    await expect(tabs.first()).toBeVisible();
    const count = await tabs.count();
    await page.getByRole('button', {name: '新增页面'}).click();
    await expect(tabs).toHaveCount(count + 1);

    await page.keyboard.press('Meta+z');
    await expect(tabs).toHaveCount(count);
    await expect(text).toHaveCount(1);
    await page.keyboard.press('Meta+Shift+z');
    await expect(tabs).toHaveCount(count + 1);
    await expect(text).toHaveCount(1);
});

test('项目保存失败后保留编辑界面，重试沿用原存储格式', async ({page}) => {
    const submitted: Array<{id: string; dataJson: string}> = [];
    await page.route('**/api/project/update', route => {
        submitted.push(route.request().postDataJSON());
        return route.fulfill({json: {code: 200, msg: '', data: submitted.length > 1}});
    });
    await page.goto('/designer?id=save-fixture');
    await expect(page.locator('#designer-ds-content')).toBeVisible({timeout: projectViewTimeout});
    await page.getByRole('button', {name: '更多项目操作'}).click();
    await page.getByRole('menuitem', {name: '保存项目'}).click();
    const retry = page.getByRole('button', {name: '保存失败 · 点击重试'});
    await expect(retry).toBeVisible();
    await expect(page.locator('#designer-ds-content')).toBeVisible();
    await retry.click();
    await expect(page.getByRole('button', {name: /^已保存 /})).toBeVisible();
    expect(submitted).toHaveLength(2);
    const decoded = submitted.map(({id, dataJson}) => {
        expect(id).toBe('save-fixture');
        expect(ProjectDataCodecUtil.isCompressed(dataJson)).toBe(true);
        return JSON.parse(ProjectDataCodecUtil.decompressIfNeeded(dataJson));
    });
    expect(decoded[1]).toEqual(decoded[0]);
    expect(decoded[1]).toMatchObject({canvasManager: {width: 840, height: 480}});
});

test('编辑器按注册顺序呈现各面板，并装配蓝图和快捷键入口', async ({page}) => {
    await page.goto('/designer?id=panels');
    await expect(page.locator('#designer-ds-content')).toBeVisible({timeout: projectViewTimeout});
    const dock = page.locator('.designer-left-menus-top');
    const panels = [
        ['组件库', '组件库'],
        ['资源库', '资源库'],
        ['图层', '图层列表'],
        ['模板库', '模板库'],
        ['全局变量', '全局变量'],
        ['子项目', '子项目'],
    ];
    await expect(dock.getByRole('button')).toHaveText(panels.map(([label]) => label));
    const content = page.locator('.designer-left-panel');
    for (const [label, heading] of panels) {
        await dock.getByRole('button', {name: label, exact: true}).click();
        await expect(content.getByRole('heading', {name: heading, exact: true})).toBeVisible();
    }
    await page.getByRole('button', {name: 'AI驱动', exact: true}).click();
    await expect(page.locator('.ai-driven-card')).toBeVisible();
    await expect(content).toHaveCount(0);
    await page.getByRole('button', {name: 'AI驱动', exact: true}).click();
    await page.getByRole('button', {name: '快捷键帮助', exact: true}).click();
    await expect(page.locator('.hotkey-modal')).toBeVisible();
    await page.locator('.hotkey-modal').getByRole('button', {name: '关闭', exact: true}).click();
    await expect(page.locator('.hotkey-modal')).toBeHidden();
    await page.getByRole('button', {name: '打开蓝图编辑器', exact: true}).click();
    await expect(page.locator('.bp-header-title')).toHaveText('蓝图编辑器');
});

test('停用模板库插件撤下当前面板和按钮', async ({page}) => {
    await page.goto('/designer?id=unregister');
    await expect(page.locator('#designer-ds-content')).toBeVisible({timeout: projectViewTimeout});
    const dock = page.locator('.designer-left-menus-top');
    const templates = dock.getByRole('button', {name: '模板库', exact: true});
    await templates.click();
    await expect(page.locator('.designer-left-panel').getByRole('heading', {name: '模板库'})).toBeVisible();
    await page.evaluate(async () => {
        const entry = '/src/bootstrap/startApplication.ts';
        const {startApplication} = await import(/* @vite-ignore */ entry);
        await (await startApplication()).stopPlugin('editor-template-library');
    });
    await expect(templates).toHaveCount(0);
    await expect(page.locator('.designer-left-panel')).toHaveCount(0);
    await dock.getByRole('button', {name: '组件库', exact: true}).click();
    await expect(page.locator('.designer-left-panel').getByRole('heading', {name: '组件库'})).toBeVisible();
});

test('场景能力在切换和关闭后失效，返回主项目保留独立数据', async ({page}) => {
    await page.goto('/login');
    const result = await page.evaluate(async () => {
        const entry = '/src/bootstrap/startApplication.ts';
        const {startApplication} = await import(/* @vite-ignore */ entry);
        const application = await startApplication();
        const createSession = await application.get('designerRuntime').prepare('0');
        const session = createSession();
        try {
            await session.load('scene-root');
            const workspace = session.editing!;
            const root = workspace.readScene()!;
            const repairRequiresBoundCanvas = await application.get('editorCanvas').prepareRepair()
                .then(() => false, error => error?.name === 'AbortError');
            root.updateCanvasConfig({...root.readCanvasConfig(), width: 731});
            root.updateFilterConfig({enable: true, blur: 3});
            root.themes.replace([{id: 'root-theme', name: '根主题', colors: {main: '#123456'}}]);
            root.variables.save({key: 'shared-name', value: {count: 1}, triggerSource: {sourceType: 'static'}});
            const variable = root.variables.list()[0];
            const detached = root.variables.read(variable.id)!;
            (detached.value as {count: number}).count = 99;
            const themes = root.themes.read();
            themes[0].colors.main = '#ffffff';
            const detachedReads = {
                value: root.variables.read(variable.id)!.value,
                color: root.themes.read()[0].colors.main,
            };

            await workspace.open('scene-child');
            const child = workspace.readScene()!;
            const staleWrites = {
                active: root.isActive(),
                canvas: root.updateCanvasConfig({width: 999}),
                filter: root.updateFilterConfig({blur: 99}),
                theme: root.themes.replace([]),
                variable: root.variables.save({key: 'stale', value: 99}),
                copy: root.variables.copy(variable.id),
                remove: root.variables.remove(variable.id),
            };
            const childBefore = {width: child.readCanvasConfig()!.width, variables: child.variables.list()};
            child.updateCanvasConfig({...child.readCanvasConfig(), width: 532});
            child.variables.save({key: 'shared-name', value: 2, triggerSource: {sourceType: 'static'}});
            const childSnapshot = session.getSnapshot();
            await workspace.open('scene-root');
            const returned = workspace.readScene()!;
            const rootData = {
                width: returned.readCanvasConfig()!.width,
                filter: returned.readFilterConfig(),
                themes: returned.themes.read(),
                variables: returned.variables.list().map(item => returned.variables.read(item.id)),
                oldHandleStillExpired: !root.isActive(),
                childHandleExpired: !child.isActive(),
                newVersion: returned.version > root.version,
            };
            session.close();
            return {
                detachedReads, staleWrites, childBefore, rootData, repairRequiresBoundCanvas,
                childSnapshot: {id: childSnapshot?.id, width: childSnapshot?.data.canvasManager?.width},
                afterClose: {
                    active: returned.isActive(),
                    scene: workspace.readScene(),
                    save: returned.variables.save({key: 'after-close'}),
                    canvas: returned.updateCanvasConfig({width: 777}),
                },
            };
        } finally {
            session.close();
        }
    });
    expect(result.detachedReads).toEqual({value: {count: 1}, color: '#123456'});
    expect(result.repairRequiresBoundCanvas).toBe(true);
    expect(result.staleWrites).toEqual({
        active: false, canvas: false, filter: false, theme: false,
        variable: 'inactive-scene', copy: 'inactive-scene', remove: false,
    });
    expect(result.childBefore).toEqual({width: 840, variables: []});
    expect(result.childSnapshot).toEqual({id: 'scene-child', width: 532});
    expect(result.rootData).toMatchObject({
        width: 731, filter: {enable: true, blur: 3},
        themes: [{id: 'root-theme', colors: {main: '#123456'}}],
        variables: [{key: 'shared-name', value: {count: 1}}],
        oldHandleStillExpired: true, childHandleExpired: true, newVersion: true,
    });
    expect(result.afterClose).toEqual({active: false, scene: undefined, save: 'inactive-scene', canvas: false});
});

test('画布修复能力绑定实际画布，切换项目和关闭后拒绝旧句柄', async ({page}) => {
    await page.goto('/designer?id=repair-root');
    await expect(page.locator('#designer-ds-content')).toBeVisible({timeout: projectViewTimeout});
    const initiallyAvailable = await page.evaluate(async () => {
        const {startApplication} = await import(/* @vite-ignore */ '/src/bootstrap/startApplication.ts');
        const application = await startApplication();
        const scene = application.get('designerRuntime').readEditingScene()!;
        const repair = await application.get('editorCanvas').prepareRepair();
        (window as any).__runtimeRepairProbe = {scene, repair};
        return Boolean(repair.readRepairAnalysis(scene.version));
    });
    expect(initiallyAvailable).toBe(true);

    await navigate(page, '/designer?id=repair-child');
    await expect(page).toHaveTitle('项目 repair-child');
    await expect(page.locator('#designer-ds-content')).toBeVisible({timeout: projectViewTimeout});
    const afterSwitch = await page.evaluate(async () => {
        const {startApplication} = await import(/* @vite-ignore */ '/src/bootstrap/startApplication.ts');
        const application = await startApplication();
        const {scene: previous, repair} = (window as any).__runtimeRepairProbe;
        const current = application.get('designerRuntime').readEditingScene()!;
        const nextRepair = await application.get('editorCanvas').prepareRepair();
        return {
            changedIdentity: current.identity !== previous.identity,
            oldRead: repair.readRepairAnalysis(previous.version),
            oldWrite: repair.repairTailPointer(previous.version),
            currentAvailable: Boolean(nextRepair.readRepairAnalysis(current.version)),
        };
    });
    expect(afterSwitch).toEqual({changedIdentity: true, oldRead: undefined, oldWrite: false, currentAvailable: true});

    await navigate(page, '/login');
    await expect(page.locator('.datavisool-designer-main-editor')).toHaveCount(0);
    const afterClose = await page.evaluate(async () => {
        const {startApplication} = await import(/* @vite-ignore */ '/src/bootstrap/startApplication.ts');
        const application = await startApplication();
        const {scene, repair} = (window as any).__runtimeRepairProbe;
        delete (window as any).__runtimeRepairProbe;
        return {
            oldRead: repair.readRepairAnalysis(scene.version),
            oldWrite: repair.repairTailPointer(scene.version),
            prepareRefused: await application.get('editorCanvas').prepareRepair()
                .then(() => false, error => error?.name === 'AbortError'),
        };
    });
    expect(afterClose).toEqual({oldRead: undefined, oldWrite: false, prepareRefused: true});
});

test('撤销项目插件的编辑器登记后卸载画布并释放会话', async ({page}) => {
    await page.goto('/designer?id=unregister-project');
    await expect(page.locator('#designer-ds-content')).toBeVisible({timeout: projectViewTimeout});
    await page.evaluate(async () => {
        const entry = '/src/bootstrap/startApplication.ts';
        const {startApplication} = await import(/* @vite-ignore */ entry);
        const application = await startApplication();
        await application.stopPlugin('editor-subprojects');
        await application.stopPlugin('editor-shortcuts');
        await application.stopPlugin('editor-project');
    });
    await expect(page.locator('.datavisool-designer-main-editor')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => Boolean(window.DATAVISOOL_ENV?.currentManager))).toBe(false);
    expect(await page.evaluate(() => Boolean(window.DATAVISOOL_ENV?.editorLoader))).toBe(false);

    await navigate(page, '/preview?id=unregister-project');
    await expect(page.locator('.datavisool-project-view')).toHaveCSS('width', '840px', {timeout: projectViewTimeout});
});
