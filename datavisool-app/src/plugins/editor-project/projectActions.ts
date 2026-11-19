/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {DesignerProjectSession} from '@datavisool/sdk/plugin/contracts/designerRuntime';
import type {EditorProjectActions} from '@datavisool/sdk/plugin/contracts/editorProject';
import type {EditorProjectSaveStatusStore} from './projectSaveStatus.ts';
import type {IProjectInfoManager} from '@datavisool/sdk/types';
import {throttle} from 'lodash';
import {globalMessage} from '@datavisool/ui';
import NProgress from 'nprogress';
import baseApi from '@/api/engineering/BaseApi.ts';
import {singleSave} from './auto-save/AutoSaveManager.ts';
import ProjectDataCodecUtil from '@/util/ProjectDataCodecUtil.ts';
import ProjectUtil from '@/util/ProjectUtil.ts';
import {isTauriRuntime, openDesktopWebview} from '@/util/TauriCompatUtil.ts';
import {withDesktopWebviewUserAgent} from '@/util/WebviewUserAgentUtil.ts';
import {exportProject, importProject} from './projectTransfer.ts';
import {publishProject} from './release/publishProject.ts';

export type QueueProjectWrite = <T>(write: () => Promise<T>) => Promise<T | undefined>;
export interface ProjectOverlayControl {
    isActive(): boolean;
    open(id: string): boolean;
    close(id: string): void;
    registerPauseCleanup?(cleanup: () => void): () => void;
}
type TrackProjectTask = <T>(task: Promise<T>) => Promise<T>;

export function getSaveData(project: Pick<DesignerProjectSession, 'getSnapshot'>): IProjectInfoManager | null {
    const snapshot = project.getSnapshot();
    if (!snapshot) return null;
    return {
        id: snapshot.id,
        dataJson: ProjectDataCodecUtil.compressIfBeneficial(ProjectUtil.serializeProjectData(snapshot.data)),
    };
}

export function createProjectActions(
    id: string,
    project: DesignerProjectSession,
    enqueue: QueueProjectWrite,
    saveStatus: EditorProjectSaveStatusStore,
    overlays: ProjectOverlayControl,
    trackProjectTask: TrackProjectTask = <T,>(task: Promise<T>) => task,
): EditorProjectActions {
    const snapshotKey = `DATAVISOOL_${id}`;
    const errorKey = `PROJECT_ERROR_${id}`;
    let closed = false;
    let pending = 0;
    let snapshotTimer: number | undefined;
    let recoveryTimer: number | undefined;
    let restoreFetch: (() => void) | undefined;
    let workspaceChange: {id: string; kind: 'switch' | 'restore'} | undefined;
    let transfer: AbortController | undefined;
    let releaseRequest: AbortController | undefined;
    let statusGeneration = 0;
    const importedWorkspaces = new Set<string>();
    const editing = project.editing;
    const workspaceNotice = 'switchWorkspace';

    const cancelWorkspaceChange = () => {
        if (workspaceChange) globalMessage.messageApi?.destroy(workspaceNotice);
        workspaceChange = undefined;
        editing?.cancelLoad();
    };
    const unregisterPauseCleanup = overlays.registerPauseCleanup?.(cancelWorkspaceChange);

    const beginWorkspaceChange = (target: string, kind: 'switch' | 'restore') => {
        cancelWorkspaceChange();
        transfer?.abort();
        return workspaceChange = {id: target, kind};
    };

    const startTransfer = (operation: (signal: AbortSignal) => Promise<void>, failureMessage: string) => {
        if (closed || !overlays.isActive()) return;
        transfer?.abort();
        const request = new AbortController();
        transfer = request;
        const task = trackProjectTask(Promise.resolve().then(() => operation(request.signal)));
        void task.catch(error => {
            if (!request.signal.aborted) {
                console.error(failureMessage, error);
                globalMessage.messageApi?.error(error instanceof Error ? error.message : failureMessage);
            }
        }).finally(() => {
            if (transfer === request) transfer = undefined;
        });
    };

    const openWorkspace = async (target: string) => {
        const opened = await editing?.open(target, {refresh: importedWorkspaces.has(target)});
        if (opened) importedWorkspaces.delete(target);
        return opened;
    };

    saveStatus.reset();

    const activeWorkspaceId = () => project.editing?.read()?.activeId ?? project.getProjectId();
    const canUpdateStatus = (workspaceId: string | undefined, generation: number) =>
        !closed && generation === statusGeneration && activeWorkspaceId() === workspaceId;

    const saveProject = async (switchingWorkspace: boolean) => {
        if (closed || !overlays.isActive()) return false;
        const statusWorkspaceId = activeWorkspaceId();
        const currentStatusGeneration = statusGeneration;
        NProgress.configure({minimum: 0.5});
        NProgress.start();
        pending++;
        if (canUpdateStatus(statusWorkspaceId, currentStatusGeneration)) {
            saveStatus.setSaving(true);
            saveStatus.setSaveState('saving');
        }
        try {
            const data = getSaveData(project);
            let replacedByImport = false;
            const result = data ? await enqueue(async () => {
                if (importedWorkspaces.has(data.id!)) {
                    replacedByImport = true;
                    return false;
                }
                return baseApi.updateProject(data);
            }) : false;
            if (closed) return false;
            if (replacedByImport && switchingWorkspace) {
                if (canUpdateStatus(statusWorkspaceId, currentStatusGeneration)) saveStatus.reset();
                return true;
            }
            if (result) {
                if (canUpdateStatus(statusWorkspaceId, currentStatusGeneration)) {
                    saveStatus.setLatestSaveTime(new Date().toLocaleTimeString());
                    saveStatus.setSaveState('saved');
                }
                return true;
            }
            if (canUpdateStatus(statusWorkspaceId, currentStatusGeneration)) {
                saveStatus.setSaveState('failed');
                globalMessage.messageApi?.error(replacedByImport ? '项目已导入，请重新加载后再保存' : '保存失败');
            }
            return false;
        } catch (error) {
            if (canUpdateStatus(statusWorkspaceId, currentStatusGeneration)) {
                saveStatus.setSaveState('failed');
                console.error('保存项目失败', error);
                globalMessage.messageApi?.error('保存失败');
            }
            return false;
        } finally {
            pending--;
            if (!closed && pending === 0) {
                if (canUpdateStatus(statusWorkspaceId, currentStatusGeneration)) saveStatus.setSaving(false);
                NProgress.done();
            }
        }
    };
    const save = () => saveProject(false);
    const throttledSave = throttle(save, 5000, {trailing: false});

    const snapshot = async (name?: string) => {
        if (closed || !overlays.isActive()) return;
        try {
            const data = getSaveData(project);
            if (!data || closed || !overlays.isActive()) return;
            const saved = await enqueue(async () => {
                if (closed || !overlays.isActive()) return false;
                await singleSave(snapshotKey, () => JSON.stringify(data), () => ({id, name: name ?? project.name}));
                return true;
            });
            if (saved && name && !closed && overlays.isActive()) localStorage.setItem(errorKey, '1');
        } catch (error) {
            if (!closed && overlays.isActive()) console.error('写入项目快照失败', error);
        }
    };

    return {
        rootProjectId: id,
        readWorkspace: () => editing?.read(),
        switchWorkspace(target) {
            return trackProjectTask((async () => {
                const current = editing?.read();
                if (closed || !overlays.isActive() || !editing || !current) return;
                if (target === current.activeId && !current.nested && !importedWorkspaces.has(target)) {
                    cancelWorkspaceChange();
                    return;
                }
                if (workspaceChange?.id === target && workspaceChange.kind === 'switch') return;
                const change = beginWorkspaceChange(target, 'switch');
                globalMessage.messageApi?.open({key: workspaceNotice, type: 'loading', content: '正在切换工作空间', duration: 0});
                try {
                    if (!(await saveProject(true)) || workspaceChange !== change || closed || !overlays.isActive()) return;
                    const activated = await openWorkspace(target);
                    if (workspaceChange !== change || closed || !overlays.isActive()) return;
                    if (activated) {
                        statusGeneration++;
                        saveStatus.reset();
                        globalMessage.messageApi?.success('切换成功');
                    }
                    else globalMessage.messageApi?.error('切换工作空间失败');
                } catch (error) {
                    if (workspaceChange === change) {
                        console.error('切换工作空间失败', error);
                        globalMessage.messageApi?.error('切换工作空间失败');
                    }
                } finally {
                    if (workspaceChange === change) cancelWorkspaceChange();
                }
            })());
        },
        onWorkspaceDeleted(deletedId) {
            return trackProjectTask((async () => {
                const current = editing?.read();
                if (closed || !overlays.isActive() || !editing || !current) return;
                if (current.activeId === deletedId) {
                    transfer?.abort();
                    const change = beginWorkspaceChange(current.rootId, 'switch');
                    try {
                        if (await openWorkspace(current.rootId) && workspaceChange === change && !closed && overlays.isActive()) {
                            statusGeneration++;
                            saveStatus.reset();
                        }
                    } finally {
                        if (workspaceChange === change) cancelWorkspaceChange();
                    }
                } else if (workspaceChange?.id === deletedId) {
                    cancelWorkspaceChange();
                }
                importedWorkspaces.delete(deletedId);
            })());
        },
        renameWorkspace(target, name) {
            if (!closed && overlays.isActive()) editing?.rename(target, name);
        },
        restoreSnapshot(content) {
            return trackProjectTask((async () => {
                const current = editing?.read();
                if (closed || !overlays.isActive() || !editing || !current) return false;
                const currentStatusGeneration = statusGeneration;
                const snapshot = JSON.parse(content);
                if (typeof snapshot?.dataJson !== 'string') return false;
                const decoded = ProjectDataCodecUtil.decompressIfNeeded(snapshot.dataJson);
                const data = ProjectUtil.deserializeProjectData(decoded);
                if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
                const target = typeof snapshot.id === 'string' && snapshot.id ? snapshot.id : current.rootId;
                const change = beginWorkspaceChange(target, 'restore');
                try {
                    const restored = await editing.restore(target, data);
                    const stillCurrent = !closed && overlays.isActive() && workspaceChange === change && currentStatusGeneration === statusGeneration;
                    if (restored && stillCurrent) {
                        importedWorkspaces.delete(target);
                        statusGeneration++;
                        saveStatus.reset();
                    }
                    return restored && stillCurrent;
                } finally {
                    if (workspaceChange === change) cancelWorkspaceChange();
                }
            })());
        },
        cancelSnapshotRestore() {
            if (workspaceChange?.kind === 'restore') cancelWorkspaceChange();
        },
        saveStatus: Object.freeze({read: saveStatus.read, subscribe: saveStatus.subscribe}),
        save,
        openPreview() {
            return trackProjectTask((async () => {
                if (closed || !overlays.isActive()) return;
                const projectId = project.getProjectId();
                if (!projectId) return;
                const isTauri = isTauriRuntime();
                // Reserve the browser window while the click still has user activation.
                const previewWindow = isTauri ? null : window.open('about:blank', '_blank');
                if (!(await save()) || closed || !overlays.isActive()) {
                    previewWindow?.close();
                    return;
                }
                const url = `/preview?${new URLSearchParams({id: projectId})}`;
                if (isTauri) {
                    void openDesktopWebview(`preview-${projectId}`, withDesktopWebviewUserAgent({
                        url,
                        title: 'DataVisool Preview',
                        decorations: false,
                        width: 1280,
                        height: 800,
                    }));
                } else if (previewWindow && !previewWindow.closed) {
                    previewWindow.location.replace(url);
                }
            })());
        },
        publish(options, signal) {
            return trackProjectTask((async () => {
                if (closed || !overlays.isActive() || signal.aborted || releaseRequest) return;
                const root = project.getSnapshot('root');
                if (!root) return;
                if (importedWorkspaces.has(root.id)) throw new Error('项目已导入，请重新加载后再发布');
                const request = new AbortController();
                const abort = () => request.abort();
                signal.addEventListener('abort', abort, {once: true});
                releaseRequest = request;
                try {
                    return await publishProject(root, project.readRemoteComponentPaths(), options, request.signal, write => enqueue(async () => {
                        if (!request.signal.aborted && importedWorkspaces.has(root.id))
                            throw new Error('项目已导入，请重新加载后再发布');
                        if (request.signal.aborted || closed || !overlays.isActive()) return undefined;
                        return write();
                    }));
                } catch (error) {
                    if (!request.signal.aborted) throw error;
                } finally {
                    signal.removeEventListener('abort', abort);
                    if (releaseRequest === request) releaseRequest = undefined;
                }
            })());
        },
        importProject() {
            if (closed) return;
            const target = project.getProjectId();
            if (target) startTransfer(signal => importProject(target, signal, enqueue, () => importedWorkspaces.add(target)), '项目导入失败');
        },
        exportProject() {
            if (closed) return;
            startTransfer(async signal => {
                const snapshot = project.getSnapshot();
                if (!snapshot) return;
                if (importedWorkspaces.has(snapshot.id)) throw new Error('项目已导入，请重新加载后再导出');
                await exportProject(snapshot, project.readRemoteComponentPaths(), signal);
            }, '项目导出失败');
        },
        saveThrottled() { void throttledSave(); },
        start() {
            if (closed || !overlays.isActive() || snapshotTimer !== undefined) return;
            snapshotTimer = window.setInterval(() => void snapshot(), 5 * 60 * 1000);
            recoveryTimer = window.setTimeout(() => {
                if (!closed && overlays.isActive() && project.loaded && localStorage.getItem(errorKey) === '1') {
                    overlays.open('project.restore');
                }
            }, 2000);

            const originalFetch = window.fetch;
            const wrappedFetch: typeof window.fetch = async (input, init) => {
                try {
                    return await originalFetch.call(window, input, init);
                } catch (error) {
                    if (!closed && !(error instanceof DOMException && error.name === 'AbortError')) {
                        void snapshot('紧急错误备份');
                    }
                    throw error;
                }
            };
            window.fetch = wrappedFetch;
            restoreFetch = () => {
                if (window.fetch === wrappedFetch) window.fetch = originalFetch;
            };
        },
        close() {
            if (closed) return;
            closed = true;
            cancelWorkspaceChange();
            transfer?.abort();
            releaseRequest?.abort();
            clearInterval(snapshotTimer);
            clearTimeout(recoveryTimer);
            restoreFetch?.();
            throttledSave.cancel();
            if (pending) NProgress.done();
            statusGeneration++;
            saveStatus.reset();
            unregisterPauseCleanup?.();
            ['project.project', 'project.canvas', 'project.theme', 'project.global-filter', 'project.release', 'project.cover', 'project.repair', 'project.restore'].forEach(overlays.close);
        },
    };
}
