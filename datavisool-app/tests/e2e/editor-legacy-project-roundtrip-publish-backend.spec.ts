/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {expect, test} from '@playwright/test';
import {login, open, setup} from './editor-dock/support';
import ProjectDataCodecUtil from '../../src/util/ProjectDataCodecUtil.ts';

setup();

const legacyTextId = 'migration-v1-root-text';
const legacyVariableId = 'migration-v1-variable';
const legacyVariableKey = 'migrationV1Value';
const originalText = 'V1_MAIN_PROJECT_MARKER';
const editedLayerName = '通过属性面板修改的旧图层';
const blueprintPageId = 'migration-v1-blueprint-page';

const legacyBlueprint = {
    pageId: blueprintPageId,
    pageName: '旧版显示流程',
    bpNodeLayoutMap: {
        'migration-v1-global': {id: 'migration-v1-global', type: 'BPGlobalNode', position: {x: 0, y: 0}},
        'migration-v1-process': {id: 'migration-v1-process', type: 'BPLogicalProcessNode', position: {x: 200, y: 0}},
        'migration-v1-visible': {id: 'migration-v1-visible', type: 'BPVisibleNode', position: {x: 400, y: 0}},
    },
    bpNodeConfigMap: {
        'migration-v1-global': {id: 'migration-v1-global', type: 'BPGlobalNode', name: '全局'},
        'migration-v1-process': {id: 'migration-v1-process', type: 'BPLogicalProcessNode', handler: '() => []'},
        'migration-v1-visible': {
            id: 'migration-v1-visible',
            type: 'BPVisibleNode',
            nodeConfig: {nodeIds: [legacyTextId]},
        },
    },
    bpAPMap: {
        'migration-v1-global:allLoaded:1': ['migration-v1-process:execute:0'],
        'migration-v1-process:afterExecute:1': ['migration-v1-visible:changeVisible:0'],
    },
    bpAPLineMap: {},
    bpLines: {},
};

const legacyProject = {
    canvasManager: {width: 840, height: 480, adaptationType: 'none'},
    layerManager: {
        layerHeader: legacyTextId,
        layerTail: legacyTextId,
        layerConfigs: {
            [legacyTextId]: {
                id: legacyTextId,
                name: '旧版主项目文本',
                type: 'BaseText',
                width: 240,
                height: 60,
                x: 40,
                y: 35,
                order: 1,
            },
        },
        elemConfigs: {
            [legacyTextId]: {
                base: {id: legacyTextId, name: '旧版主项目文本', type: 'BaseText'},
                style: {
                    color: '#243447',
                    fontSize: 22,
                    fontFamily: 'Arial',
                    alignItems: 'center',
                    justifyContent: 'center',
                    lineHeight: 1,
                    letterSpacing: 0,
                },
                data: {sourceType: 'static', value: originalText},
            },
        },
    },
    globalVariableManager: {
        globalVariables: {
            [legacyVariableId]: {
                id: legacyVariableId,
                key: legacyVariableKey,
                value: 'V1_VARIABLE_VALUE',
                bindTarget: [],
                reRender: false,
            },
        },
    },
    bluePrintManager: [legacyBlueprint],
};

async function readStoredProject(page: import('@playwright/test').Page, headers: Record<string, string>, id: string) {
    const response = await page.request.get(`/api/project/getProjectData/${id}`, {headers});
    const body = await response.json();
    expect(body.code).toBe(200);
    expect(body.data?.dataJson).toEqual(expect.any(String));
    return JSON.parse(ProjectDataCodecUtil.decompressIfNeeded(body.data.dataJson)) as typeof legacyProject;
}

async function readLayerName(page: import('@playwright/test').Page, id: string) {
    return page.evaluate(async layerId => {
        const {startApplication} = await import(/* @vite-ignore */ '/src/bootstrap/startApplication.ts');
        const canvas = (await startApplication()).get('editorCanvas');
        const domain = await canvas.prepareInspectorDomain();
        return domain.readTarget(layerId)?.layer.name;
    }, id);
}

test('旧 V1 项目经真实编辑保存重开，并从子项目发布主项目快照', async ({page}) => {
    await page.setViewportSize({width: 1440, height: 900});
    const headers = await login(page);
    const projectName = `旧 V1 迁移验收-${Date.now()}`;
    const created = await page.request.post('/api/project/create', {
        headers,
        data: {name: projectName, des: '隔离后端旧格式回归', dataJson: JSON.stringify(legacyProject)},
    });
    const createdBody = await created.json();
    expect(createdBody.code).toBe(200);
    const projectId = String(createdBody.data);
    expect(projectId).toMatch(/^\d+$/);

    await page.goto(`/designer?id=${projectId}`);
    await expect(page.locator('#designer-ds-content')).toBeVisible({timeout: 60_000});
    await expect(page.locator('.base-text-component')).toContainText(originalText);

    await open(page, '图层');
    const layerRow = page.locator(`.layer-list .layer-item[data-id="${legacyTextId}"]`);
    await expect(layerRow).toContainText('旧版主项目文本');
    await layerRow.click();
    const inspector = page.getByRole('region', {name: '组件属性'});
    await expect(inspector).toBeVisible();
    await page.locator('.designer-right .datavisool-config-menu')
        .getByRole('button', {name: '基础', exact: true}).click();
    const nameInput = inspector.getByLabel('名称', {exact: true}).getByRole('textbox');
    await nameInput.fill(editedLayerName);
    await expect.poll(() => readLayerName(page, legacyTextId)).toBe(editedLayerName);

    const saveResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/project/update');
    await page.getByRole('button', {name: '更多项目操作'}).click();
    await page.getByRole('menuitem', {name: '保存项目', exact: true}).click();
    expect((await (await saveResponse).json()).data).toBe(true);

    const savedProject = await readStoredProject(page, headers, projectId);
    expect(savedProject).not.toHaveProperty('version');
    expect(savedProject).not.toHaveProperty('artboards');
    expect(savedProject.layerManager.layerConfigs[legacyTextId]).toMatchObject({name: editedLayerName, type: 'BaseText'});
    expect(savedProject.layerManager.elemConfigs[legacyTextId]).toMatchObject({
        base: {id: legacyTextId, type: 'BaseText'},
        style: {color: '#243447', fontSize: 22, fontFamily: 'Arial'},
        data: {sourceType: 'static', value: originalText},
    });
    expect(savedProject.globalVariableManager.globalVariables[legacyVariableId]).toMatchObject({
        id: legacyVariableId,
        key: legacyVariableKey,
        value: 'V1_VARIABLE_VALUE',
    });
    expect(savedProject.bluePrintManager[0]).toMatchObject({
        pageId: blueprintPageId,
        bpNodeLayoutMap: legacyBlueprint.bpNodeLayoutMap,
        bpNodeConfigMap: legacyBlueprint.bpNodeConfigMap,
        bpAPMap: legacyBlueprint.bpAPMap,
    });

    await page.getByRole('button', {name: '返回首页', exact: true}).click();
    await expect(page).toHaveURL(/\/home\//);
    await page.goto(`/designer?id=${projectId}`);
    await expect(page.locator('#designer-ds-content')).toBeVisible({timeout: 60_000});
    await expect(page.locator('.base-text-component')).toContainText(originalText);
    await open(page, '图层');
    await expect(page.locator(`.layer-list .layer-item[data-id="${legacyTextId}"]`)).toContainText(editedLayerName);
    const runtimeVariable = await page.evaluate(async key => {
        const {startApplication} = await import(/* @vite-ignore */ '/src/bootstrap/startApplication.ts');
        const scene = (await startApplication()).get('designerRuntime').readEditingScene();
        const summary = scene?.variables.list().find(variable => variable.key === key);
        return summary ? scene?.variables.read(summary.id) : undefined;
    }, legacyVariableKey);
    expect(runtimeVariable).toMatchObject({id: legacyVariableId, key: legacyVariableKey, value: 'V1_VARIABLE_VALUE'});
    const reopenedProject = await readStoredProject(page, headers, projectId);
    expect(reopenedProject.layerManager.elemConfigs[legacyTextId].data).toMatchObject({value: originalText});
    expect(reopenedProject.bluePrintManager[0].bpAPMap).toEqual(legacyBlueprint.bpAPMap);

    const previewOpened = page.waitForEvent('popup');
    await page.getByRole('button', {name: '预览项目', exact: true}).click();
    const preview = await previewOpened;
    try {
        await preview.waitForURL(url => url.pathname === '/preview' && url.searchParams.get('id') === projectId);
        const previewLayer = preview.locator(`#${legacyTextId} [data-layer-transform="${legacyTextId}"]`);
        await expect(previewLayer).toHaveCSS('visibility', 'hidden', {timeout: 20_000});
    } finally {
        await preview.close();
    }

    const childName = `发布快照子项目-${Date.now()}`;
    const childResponse = await page.request.post('/api/project/createSubProject', {
        headers,
        data: {pid: projectId, name: childName, dataJson: JSON.stringify({canvasManager: {width: 640, height: 360}})},
    });
    const childBody = await childResponse.json();
    expect(childBody.code).toBe(200);
    const childId = String(childBody.data);
    await open(page, '子项目');
    await page.locator('.sub-project-item').filter({hasText: childName}).click();
    await expect.poll(() => page.evaluate(() => String(window.DATAVISOOL_ENV.currentManager?.id))).toBe(childId);
    await page.getByRole('button', {name: '添加基础色块', exact: true}).click();
    await expect.poll(() => page.evaluate(() => Object.values(window.DATAVISOOL_ENV.currentManager?.layerManager.layerConfigs ?? {}).map(layer => layer.type)))
        .toEqual(['BaseColorBlock']);

    await page.getByRole('button', {name: '发布项目', exact: true}).click();
    const releaseDialog = page.locator('.datavisool-header-release-config-dialog');
    const releaseResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/release/release');
    await releaseDialog.getByRole('button', {name: '发布项目', exact: true}).click();
    const releaseRequest = await releaseResponse;
    const releaseRequestData = releaseRequest.request().postDataJSON() as {
        projectId: number | string;
        dependencies: Array<{id: number | string; projectJson: string}>;
    };
    expect(String(releaseRequestData.projectId)).toBe(projectId);
    expect(releaseRequestData.dependencies).toHaveLength(1);

    const releaseBody = await releaseRequest.json();
    expect(releaseBody.code).toBe(200);
    const releaseId = String(releaseBody.data);
    expect(releaseId).toBeTruthy();
    const storedRelease = await page.request.post('/api/release/getReleaseData', {
        headers,
        data: {id: releaseId, password: null},
    });
    const storedReleaseBody = await storedRelease.json();
    expect(storedReleaseBody.code).toBe(200);
    const releaseJson = storedReleaseBody.data.dataJson as string;
    // The existing release format stores Java Long IDs as JSON numbers; compare
    // the encoded ID before JavaScript's number parser can round it.
    expect(releaseJson).toMatch(new RegExp(`"id"\\s*:\\s*"?${projectId}"?(?=\\s*[,}])`));
    const releasePackage = JSON.parse(releaseJson) as {projectJson: string};
    const publishedProject = JSON.parse(ProjectDataCodecUtil.decompressIfNeeded(releasePackage.projectJson)) as typeof legacyProject;
    const publishedLayers = Object.values(publishedProject.layerManager.layerConfigs);
    expect(publishedLayers).toHaveLength(1);
    expect(publishedLayers[0]).toMatchObject({id: legacyTextId, name: editedLayerName, type: 'BaseText'});
    expect(publishedLayers.some(layer => layer.type === 'BaseColorBlock')).toBe(false);
    expect(publishedProject.layerManager.elemConfigs[legacyTextId].data).toMatchObject({value: originalText});
    expect(publishedProject.globalVariableManager.globalVariables[legacyVariableId]).toMatchObject({
        key: legacyVariableKey,
        value: 'V1_VARIABLE_VALUE',
    });
    expect(publishedProject.bluePrintManager[0].bpAPMap).toEqual(legacyBlueprint.bpAPMap);

    const publishedPage = await page.context().newPage();
    try {
        await publishedPage.goto(`/release/${Buffer.from(releaseId).toString('base64')}`);
        await expect(publishedPage.locator('.datavisool-project-release')).toBeVisible({timeout: 20_000});
        await expect(publishedPage.locator(`#${legacyTextId} [data-layer-transform="${legacyTextId}"]`))
            .toHaveCSS('visibility', 'hidden', {timeout: 20_000});
        await expect(publishedPage.locator('[data-type="BaseColorBlock"]')).toHaveCount(0);
    } finally {
        await publishedPage.close();
    }
});
