/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {createElement, useEffect, useState, useSyncExternalStore, type ComponentType, type ReactNode} from 'react';
import type {Plugin} from '@datavisool/sdk/plugin';
import type {EditorCanvasService} from '@datavisool/sdk/plugin/contracts/editorCanvas';
import {designerWorkspaceChangedKey} from '@datavisool/sdk/plugin/contracts/designerRuntime';
import type {EditorCanvasContribution} from '@datavisool/sdk/plugin/contracts/editorShell';
import {tx} from '@/i18n/miniI18n.ts';
import {createCanvasShortcutInput} from './shortcutInput.ts';
import {createLazyCanvasRuntime} from './lazyCanvasRuntime.ts';
import type {EditorCanvasRuntime} from './editorCanvasRuntime.tsx';

const emptySelection = Object.freeze({ids: Object.freeze([]), source: 'system' as const});
const selectCanvas = (runtime: EditorCanvasRuntime) => runtime.contribution.Canvas;
const selectZoomControls = (runtime: EditorCanvasRuntime) => runtime.contribution.ZoomControls;
const EmptyFooter: ComponentType<{inspectorAction?: ReactNode}> = () => null;
const selectFooter = (runtime: EditorCanvasRuntime) => runtime.contribution.Footer ?? EmptyFooter;

type CanvasRuntimeLoader = {
    ensure(): Promise<EditorCanvasRuntime>;
    subscribe(listener: () => void): () => void;
    getRevision(): number;
    isAbort(error: unknown): boolean;
};

/** Only the canvas owner facade is registered at application startup. */
export function createEditorCanvasPlugin(): Plugin {
    return {
        id: 'editor-canvas',
        requires: ['designerRuntime', 'designerCatalog', 'editorShell', 'editorCommands'],
        provides: ['editorCanvas'],
        activate(context) {
            let pluginActive = true;
            const shortcutInput = createCanvasShortcutInput();
            const runtimeLoader = createLazyCanvasRuntime(
                () => import('./editorCanvasRuntime.tsx'),
                module => module.createEditorCanvasRuntime(context, shortcutInput),
            );
            const reportLoadError = (error: unknown) => {
                if (!runtimeLoader.isAbort(error)) console.error('加载画布能力失败', error);
            };
            const ensureRuntime = runtimeLoader.ensure;
            const currentService = () => runtimeLoader.current?.service;
            const captureScene = () => {
                const scene = context.designerRuntime.readEditingScene();
                if (!scene?.identity || !scene.isActive()) return undefined;
                return {scene, identity: scene.identity, version: scene.version};
            };
            const isSceneRequestCurrent = (request: NonNullable<ReturnType<typeof captureScene>>) => {
                const current = context.designerRuntime.readEditingScene();
                return current === request.scene && Boolean(current?.isActive()
                    && current.identity === request.identity && current.version === request.version);
            };
            const createSceneAbortError = () => new DOMException('画布场景在等待运行时初始化时已切换。', 'AbortError');
            const loadThen = <T,>(
                request: ReturnType<typeof captureScene>,
                action: (service: EditorCanvasService) => T | Promise<T>,
                signal?: AbortSignal,
            ): Promise<T> => {
                if (!request || signal?.aborted || !isSceneRequestCurrent(request))
                    return Promise.reject(createSceneAbortError());
                return ensureRuntime().then(runtime => {
                    if (signal?.aborted || !isSceneRequestCurrent(request)) throw createSceneAbortError();
                    return action(runtime.service);
                });
            };
            const scheduleOnCurrentScene = (action: (service: EditorCanvasService) => void) => {
                const request = captureScene();
                if (!request) return;
                void loadThen(request, action).catch(reportLoadError);
            };

            const canvas: EditorCanvasService = {
                registerShortcutInput: shortcutInput.register,
                prepareInspectorDomain(signal) {
                    return loadThen(captureScene(), service => service.prepareInspectorDomain(signal), signal);
                },
                prepareLayerDomain(signal) {
                    return loadThen(captureScene(), service => service.prepareLayerDomain(signal), signal);
                },
                isSceneActive(sceneVersion) { return currentService()?.isSceneActive(sceneVersion) ?? false; },
                readAiWorkspace() { return currentService()?.readAiWorkspace(); },
                prepareAiEditing(scope, signal) {
                    return loadThen(captureScene(), service => service.prepareAiEditing(scope, signal), signal);
                },
                recordChange(change) { return currentService()?.recordChange(change) ?? false; },
                performAction(action) {
                    const request = captureScene();
                    return request
                        ? loadThen(request, service => service.performAction(action)).catch(error => {
                            if (!runtimeLoader.isAbort(error)) reportLoadError(error);
                        })
                        : Promise.resolve();
                },
                paste(data) {
                    const request = captureScene();
                    return request
                        ? loadThen(request, service => service.paste(data)).catch(error => {
                            if (!runtimeLoader.isAbort(error)) reportLoadError(error);
                        })
                        : Promise.resolve();
                },
                readSelection() { return currentService()?.readSelection() ?? emptySelection; },
                readInputContext() {
                    return currentService()?.readInputContext() ?? {pointerTarget: null, contextMenuOpen: false};
                },
                closeContextMenu() { currentService()?.closeContextMenu(); },
                readSelectionTemplate() { return currentService()?.readSelectionTemplate(); },
                select(ids, source, interaction) {
                    const service = currentService();
                    if (service) service.select(ids, source, interaction);
                    else scheduleOnCurrentScene(next => next.select(ids, source, interaction));
                },
                getLayerType(id) { return currentService()?.getLayerType(id); },
                focus() {
                    const service = currentService();
                    if (service) service.focus();
                    else scheduleOnCurrentScene(next => next.focus());
                },
                resolveDrop(event) { return currentService()?.resolveDrop(event) ?? null; },
                insertLayer(layer, config) {
                    const service = currentService();
                    if (service) service.insertLayer(layer, config);
                    else scheduleOnCurrentScene(next => next.insertLayer(layer, config));
                },
                insertTemplate(template) {
                    const service = currentService();
                    if (service) service.insertTemplate(template);
                    else scheduleOnCurrentScene(next => next.insertTemplate(template));
                },
                insertTemplateAtomically(template, requiredSourceIds) {
                    return currentService()?.insertTemplateAtomically(template, requiredSourceIds);
                },
                renameLayer(id, name, sceneVersion) {
                    return currentService()?.renameLayer(id, name, sceneVersion) ?? false;
                },
                updateBaseTextContent(id, value, sceneVersion) {
                    return currentService()?.updateBaseTextContent(id, value, sceneVersion) ?? false;
                },
                undo() {
                    const service = currentService();
                    if (service) service.undo();
                    else scheduleOnCurrentScene(next => next.undo());
                },
                redo() {
                    const service = currentService();
                    if (service) service.redo();
                    else scheduleOnCurrentScene(next => next.redo());
                },
                prepareRepair() { return loadThen(captureScene(), service => service.prepareRepair()); },
            };
            context.provide('editorCanvas', canvas);

            const contribution: EditorCanvasContribution = {
                Canvas: props => <RuntimeComponentSlot loader={runtimeLoader} select={selectCanvas} props={props} />,
                ZoomControls: () => <RuntimeComponentSlot loader={runtimeLoader} select={selectZoomControls} />,
                Footer: props => <RuntimeComponentSlot loader={runtimeLoader} select={selectFooter} props={props} />,
                history: {undo: canvas.undo, redo: canvas.redo},
            };
            const unregisterCanvas = context.editorShell.registerCanvas(contribution);
            const unregisterWorkspaceListener = context.on(designerWorkspaceChangedKey, () => {
                if (!pluginActive) return;
                // Workspace entry is the first real use of canvas runtime; failure is local and retriable.
                if (context.designerRuntime.readEditingScene()?.isActive())
                    void ensureRuntime().catch(reportLoadError);
            });
            context.onDispose(async () => {
                pluginActive = false;
                const errors: unknown[] = [];
                try { unregisterWorkspaceListener(); } catch (error) { errors.push(error); }
                try { unregisterCanvas(); } catch (error) { errors.push(error); }
                try { await runtimeLoader.dispose(); } catch (error) { errors.push(error); }
                try { shortcutInput.dispose(); } catch (error) { errors.push(error); }
                if (errors.length) throw new AggregateError(errors, '释放画布插件失败。');
            });
            context.onStop({
                pause() {
                    shortcutInput.pause();
                    runtimeLoader.pause();
                },
                prepare() { return runtimeLoader.prepare(); },
                cancel() {
                    if (!pluginActive) return;
                    runtimeLoader.cancel();
                    shortcutInput.resume();
                },
                withdraw() {
                    shortcutInput.pause();
                    runtimeLoader.withdraw();
                },
            });
        },
    };
}

function RuntimeComponentSlot({
    loader,
    select,
    props,
}: {
    readonly loader: CanvasRuntimeLoader;
    readonly select: (runtime: EditorCanvasRuntime) => ComponentType<any> | undefined;
    readonly props?: object;
}) {
    const [attempt, setAttempt] = useState(0);
    const [Component, setComponent] = useState<ComponentType<any>>();
    const [error, setError] = useState<unknown>();
    const revision = useSyncExternalStore(
        loader.subscribe,
        loader.getRevision,
        () => 0,
    );

    useEffect(() => {
        let current = true;
        setError(undefined);
        void loader.ensure().then(runtime => {
            if (current) setComponent(() => select(runtime));
        }).catch(loadError => {
            if (current && !loader.isAbort(loadError)) setError(loadError);
        });
        return () => { current = false; };
    }, [attempt, revision, select, loader]);

    if (Component) return createElement(Component, props);
    if (error) {
        return createElement('div', {role: 'alert', className: 'editor-canvas-load-error'},
            createElement('span', null, tx('画布加载失败。')),
            createElement('button', {type: 'button', onClick: () => {
                setComponent(undefined);
                setAttempt(value => value + 1);
            }}, tx('重试')),
        );
    }
    return createElement('div', {'aria-busy': true, 'aria-label': tx('正在加载画布能力')});
}
