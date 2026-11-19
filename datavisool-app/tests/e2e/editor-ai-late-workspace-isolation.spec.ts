/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {createServer} from 'node:http';
import {expect, test, type Page} from '@playwright/test';
import {editor, layers, open, setup} from './editor-dock/support';

setup();
test.setTimeout(90_000);

const subprojectPanel = (page: Page) => page.locator('.sub-project');
const subprojectItem = (page: Page, name: string) =>
    subprojectPanel(page).locator('.sub-project-item').filter({hasText: name});

async function createSubproject(page: Page, name: string): Promise<string> {
    const panel = subprojectPanel(page);
    await panel.getByRole('button', {name: '新建子项目', exact: true}).first().click();
    const dialog = page.locator('.new-project-dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByPlaceholder('请输入项目名称').fill(name);
    const created = page.waitForResponse(response => new URL(response.url()).pathname === '/api/project/createSubProject');
    await dialog.getByRole('button', {name: '创建项目'}).click();
    const body = await (await created).json();
    expect(body.code).toBe(200);
    const id = String(body.data);
    await expect(subprojectItem(page, name)).toBeVisible();
    return id;
}

function createDeferredModelServer() {
    let requestCount = 0;
    let responseStage = 0;
    let artifactPath = '';
    let artifactRevision = 0;
    let releaseFirstResponse!: () => void;
    let firstRequestReceived = false;
    const firstResponseGate = new Promise<void>(resolve => { releaseFirstResponse = resolve; });

    const server = createServer((request, response) => {
        let body = '';
        request.on('data', chunk => { body += chunk; });
        request.on('end', async () => {
            requestCount++;
            if (requestCount === 1) {
                firstRequestReceived = true;
                await firstResponseGate;
            }

            const payload = JSON.parse(body || '{}') as {messages?: Array<{role: string; content?: string}>};
            const lastTool = [...(payload.messages ?? [])].reverse().find(message => message.role === 'tool');
            if (lastTool?.content) {
                try {
                    const parsed = JSON.parse(lastTool.content) as {result?: Record<string, unknown>} & Record<string, unknown>;
                    const result = parsed.result ?? parsed;
                    artifactPath = typeof result.path === 'string' ? result.path : artifactPath;
                    artifactRevision = typeof result.workspaceRevision === 'number' ? result.workspaceRevision : artifactRevision;
                } catch { /* The next scripted tool call can proceed with the last known revision. */ }
            }

            let toolName = '';
            let args: Record<string, unknown> = {};
            if (responseStage === 0) {
                toolName = 'begin_canvas_artifact';
                args = {toolName: 'create_canvas_components'};
            } else if (responseStage === 1) {
                toolName = 'write_canvas_artifact';
                args = {
                    path: artifactPath,
                    expectedRevision: artifactRevision,
                    content: JSON.stringify({components: [{
                        id: 'late_text', type: 'BaseColorBlock', name: '迟到的AI组件',
                        x: 120, y: 140, width: 240, height: 100, useDefaultConfig: true,
                    }]}),
                };
            } else if (responseStage === 2) {
                toolName = 'validate_canvas_artifact';
                args = {path: artifactPath, expectedRevision: artifactRevision};
            } else if (responseStage === 3) {
                toolName = 'create_canvas_components';
                args = {path: artifactPath, expectedRevision: artifactRevision};
            }
            responseStage++;

            const delta = toolName
                ? {role: 'assistant', tool_calls: [{index: 0, id: `late-call-${responseStage}`, type: 'function', function: {name: toolName, arguments: JSON.stringify(args)}}]}
                : {role: 'assistant', content: 'AI画布操作已完成'};
            const finishReason = toolName ? 'tool_calls' : 'stop';
            response.writeHead(200, {'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache'});
            response.end([
                `data: ${JSON.stringify({id: 'late-workspace-test', model: 'test-model', choices: [{index: 0, delta, finish_reason: null}]})}`,
                `data: ${JSON.stringify({id: 'late-workspace-test', model: 'test-model', choices: [{index: 0, delta: {}, finish_reason: finishReason}], usage: {prompt_tokens: 3, completion_tokens: 2, total_tokens: 5}})}`,
                'data: [DONE]',
                '',
            ].join('\n\n'));
        });
    });

    return {
        server,
        get firstRequestReceived() { return firstRequestReceived; },
        releaseFirstResponse,
    };
}

async function readAiWorkspace(page: Page) {
    return page.evaluate(async () => {
        const {startApplication} = await import(/* @vite-ignore */ '/src/bootstrap/startApplication.ts');
        return (await startApplication()).get('editorCanvas').readAiWorkspace();
    });
}

test('AI模型迟到工具响应不能改写切换后的子项目画布、历史或草稿', async ({page}) => {
    const modelServer = createDeferredModelServer();
    await new Promise<void>(resolve => modelServer.server.listen(0, '127.0.0.1', resolve));
    const address = modelServer.server.address();
    if (!address || typeof address === 'string') throw new Error('迟到响应模拟模型未启动');

    let modelId = '';
    let headers: Record<string, string> | undefined;
    let rootId = '';
    let childId = '';
    let draftSessionPrepared = false;
    try {
        const root = await editor(page);
        rootId = root.id;
        headers = root.headers;
        const createdModel = await page.request.post('/api/aiModel/create', {
            headers,
            data: {
                name: `迟到响应模拟模型-${Date.now()}`,
                provider: 'deepseek',
                baseUrl: `http://127.0.0.1:${address.port}/v1`,
                apiKey: 'synthetic-local-key',
                enabled: 1,
                isDefault: 0,
            },
        });
        const modelBody = await createdModel.json();
        expect(modelBody.code).toBe(200);
        modelId = String(modelBody.data);

        await open(page, '子项目');
        const childName = `迟到响应隔离-${Date.now()}`;
        childId = await createSubproject(page, childName);
        await subprojectItem(page, childName).click();
        await expect.poll(async () => (await readAiWorkspace(page))?.scope.activeId).toBe(childId);

        await subprojectPanel(page).getByText('主项目', {exact: true}).click();
        await expect.poll(async () => (await readAiWorkspace(page))?.scope.activeId).toBe(rootId);
        await open(page, 'AI驱动');
        const assistant = page.locator('.ai-driven-card');
        await expect(assistant).toContainText('迟到响应模拟模型');
        await page.getByPlaceholder('请输入需求').fill('请创建一个基础色块组件');
        const submitted = page.waitForResponse(response => new URL(response.url()).pathname === '/api/aiDriven/task/submit');
        await assistant.getByRole('button', {name: '发送'}).click();
        expect((await (await submitted).json()).code).toBe(200);
        await expect.poll(() => modelServer.firstRequestReceived, {timeout: 20_000}).toBe(true);

        await open(page, '子项目');
        await subprojectItem(page, childName).click();
        await expect.poll(async () => (await readAiWorkspace(page))?.scope.activeId).toBe(childId);
        await page.getByRole('button', {name: '添加基础文本'}).click();
        await expect.poll(async () => (await layers(page)).length).toBe(1);
        await expect(page.locator('#designer-ds-content .base-text-component')).toBeVisible();
        const baselineId = (await layers(page))[0].id;
        expect(baselineId).toBeTruthy();
        const beforeSnapshot = await readAiWorkspace(page);
        expect(beforeSnapshot?.components).toHaveLength(1);
        const draftState = await page.evaluate(async () => {
            const {startApplication} = await import(/* @vite-ignore */ '/src/bootstrap/startApplication.ts');
            const canvas = (await startApplication()).get('editorCanvas');
            const workspace = canvas.readAiWorkspace();
            if (!workspace) throw new Error('子项目没有活动的AI画布上下文');
            const abort = new AbortController();
            const session = await canvas.prepareAiEditing(workspace.scope, abort.signal);
            (window as any).__lateAiWorkspaceFixture = {abort, session};
            return {active: session.isActive(), draft: session.readDraft() ?? null};
        });
        draftSessionPrepared = true;
        expect(draftState.active).toBe(true);

        // Opening the subproject dock closes the assistant. Reopen it so the
        // persisted task resumes consuming the delayed frontend operation.
        const restoredTask = page.waitForResponse(response =>
            new URL(response.url()).pathname === '/api/aiDriven/task/status');
        await open(page, 'AI驱动');
        expect((await (await restoredTask).json()).code).toBe(200);
        const completion = page.waitForResponse(response => new URL(response.url()).pathname === '/api/aiDriven/task/operation/complete', {timeout: 60_000});
        modelServer.releaseFirstResponse();
        const completedResponse = await completion;
        const operationReceipt = completedResponse.request().postDataJSON();
        expect(operationReceipt).toMatchObject({projectId: rootId, status: 'failed'});
        expect(operationReceipt.result).toMatchObject({code: 'agent_scope_workspace_changed'});
        expect((await completedResponse.json()).code).toBe(200);

        await expect(page.locator('#designer-ds-content')).toBeVisible();
        expect(await readAiWorkspace(page)).toEqual(beforeSnapshot);
        const draftAfter = await page.evaluate(() => {
            const session = (window as any).__lateAiWorkspaceFixture?.session;
            return session?.readDraft() ?? null;
        });
        expect(draftAfter).toEqual(draftState.draft);
        expect(await layers(page)).toHaveLength(1);

        await page.getByRole('button', {name: '撤销', exact: true}).click();
        await expect.poll(async () => (await layers(page)).length).toBe(0);
        await page.getByRole('button', {name: '重做', exact: true}).click();
        await expect.poll(async () => (await layers(page)).length).toBe(1);
        expect((await layers(page))[0].id).toBe(baselineId);
    } finally {
        modelServer.releaseFirstResponse();
        if (draftSessionPrepared) {
            await page.evaluate(() => {
                const fixture = (window as any).__lateAiWorkspaceFixture;
                fixture?.session?.dispose();
                fixture?.abort?.abort();
                delete (window as any).__lateAiWorkspaceFixture;
            }).catch(() => undefined);
        }
        modelServer.server.closeAllConnections();
        await new Promise<void>(resolve => modelServer.server.close(() => resolve()));
        if (modelId && headers)
            await page.request.post('/api/aiModel/batchDel', {headers, data: [modelId]}).catch(() => undefined);
        if (rootId && childId && headers)
            await page.request.post(`/api/project/deleteSubProject/${rootId}/${childId}`, {headers, data: {}}).catch(() => undefined);
    }
});
