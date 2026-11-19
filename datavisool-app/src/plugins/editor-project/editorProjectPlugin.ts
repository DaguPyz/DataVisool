/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {createElement, lazy, Suspense, type ComponentType} from 'react';
import type {Plugin} from '@datavisool/sdk/plugin';
import type {EditorProjectFeature} from '@datavisool/sdk/plugin/contracts/editorProject';
import type {EditorCanvasService} from '@datavisool/sdk/plugin/contracts/editorCanvas';
import type {EditorOverlayContribution, EditorOverlayProps} from '@datavisool/sdk/plugin/contracts/editorShell';
import type {} from '@datavisool/sdk/plugin/contracts/editorCanvas';
import type {} from '@datavisool/sdk/plugin/contracts/editorCommands';
import type {} from '@datavisool/sdk/plugin/contracts/editorShell';
import {createProjectSaveStatusStore} from './projectSaveStatus.ts';
import {ProjectManager} from './project/ProjectManager.ts';

const overlayIds = [
    'project.project', 'project.canvas', 'project.theme', 'project.global-filter', 'project.release',
    'project.cover', 'project.repair', 'project.restore',
] as const;

const withSuspense = (View:ComponentType<EditorOverlayProps>):ComponentType<EditorOverlayProps> => props =>
    createElement(Suspense, {fallback:null}, createElement(View, props));

/** Project editing flows and their UI state belong to this plugin instance. */
export function createEditorProjectPlugin(): Plugin {
    return {
        id: 'editor-project',
        requires: ['designerRuntime', 'editorCanvas', 'editorShell', 'editorCommands'],
        provides: ['editorProject'],
        activate(context) {
            const {editorShell, editorCanvas, editorCommands} = context;
            let active = true;
            let acceptingWrites = true;
            let preparation: Promise<EditorProjectFeature> | undefined;
            let pendingWrites = Promise.resolve();
            const pendingTasks = new Set<Promise<unknown>>();
            const projectManager = new ProjectManager();
            const pauseCleanups = new Set<() => void>();
            const trackTask = <T,>(task: Promise<T>): Promise<T> => {
                pendingTasks.add(task);
                const remove = () => pendingTasks.delete(task);
                void task.then(remove, remove);
                return task;
            };
            const saveStatus = createProjectSaveStatusStore();
            const canEdit = () => active && acceptingWrites;
            const enqueue = <T>(write: () => Promise<T>) => {
                if (!acceptingWrites) return Promise.resolve(undefined);
                const result = pendingWrites.then(write);
                pendingWrites = result.then(() => {}, () => {});
                return result;
            };

            context.onStop({
                pause() {
                    acceptingWrites = false;
                    for (const cleanup of [...pauseCleanups]) {
                        try { cleanup(); }
                        catch (error) { console.error('清理项目工作区操作失败', error); }
                    }
                },
                async prepare() {
                    await pendingWrites;
                    await Promise.allSettled([...pendingTasks]);
                },
                cancel() { acceptingWrites = true; },
            });
            context.onDispose(() => {
                active = false;
                acceptingWrites = false;
                for (const cleanup of [...pauseCleanups]) {
                    try { cleanup(); }
                    catch (error) { console.error('清理项目工作区操作失败', error); }
                }
                pauseCleanups.clear();
            });
            context.onDispose(() => projectManager.destroy());

            const ProjectHeaderActionsView = lazy(async () => {
                const {default: View} = await import('./ProjectHeaderActions.tsx');
                return {default: () => createElement(View, {canEdit})};
            });
            const ProjectToolbarSettingsView = lazy(() => import('./ProjectToolbarSettings.tsx'));
            context.onDispose(editorShell.registerView('projectActions', () =>
                createElement(Suspense, {fallback:null}, createElement(ProjectHeaderActionsView))));
            context.onDispose(editorShell.registerToolbarItem({
                id: 'project-settings',
                group: 'settings',
                order: 40,
                groupClassName: 'workspace-toolbar-settings',
                dividerClassName: 'workspace-toolbar-settings',
                View: () => createElement(Suspense, {fallback:null}, createElement(ProjectToolbarSettingsView)),
            }));

            const ProjectSettingsOverlay = lazy(async () => {
                const {default: View} = await import('./project/ProjectHdItemImpl.tsx');
                return {default: (props: EditorOverlayProps) => createElement(View, {...props, projectManager, canEdit})};
            });
            const CanvasSettingsOverlay = lazy(async () => {
                const {default: View} = await import('./canvas/CanvasHdConfigImpl.tsx');
                return {default: (props: EditorOverlayProps) => createElement(View, {...props, canEdit})};
            });
            const ThemeSettingsOverlay = lazy(async () => {
                const {default: View} = await import('./theme/ThemeHdItemImpl.tsx');
                return {default: (props: EditorOverlayProps) => createElement(View, {...props, canEdit})};
            });
            const GlobalFilterOverlay = lazy(async () => {
                const {default: View} = await import('./global-filter/GlobalFilterConfigImpl.tsx');
                return {default: (props: EditorOverlayProps) => createElement(View, {...props, canEdit})};
            });
            const ReleaseOverlay = lazy(async () => {
                const {default: View} = await import('./release/ReleaseHdConfigImpl.tsx');
                return {default: (props: EditorOverlayProps) => createElement(View, {...props, canEdit})};
            });
            const CoverOverlay = lazy(async () => {
                const {CoverConfig} = await import('./cover/CoverConfig.tsx');
                return {default: (props: EditorOverlayProps) => createElement(CoverConfig, {
                    ...props, canEdit, isActive: () => active, trackTask,
                })};
            });
            const RestoreOverlay = lazy(async () => {
                const {default: View} = await import('./auto-save/RestoreLocalStorage.tsx');
                return {default: (props: EditorOverlayProps) => createElement(View, {...props, canEdit})};
            });
            const RepairOverlay = lazy(async () => {
                const {createCanvasRepairOverlay} = await import('./canvas-repair/CanvasRepairOverlay.tsx');
                return {default: createCanvasRepairOverlay(editorCanvas as EditorCanvasService, canEdit)};
            });

            const overlays: EditorOverlayContribution[] = [
                {id:'project.project', group:'workspace', View:ProjectSettingsOverlay},
                {id:'project.canvas', group:'workspace', View:CanvasSettingsOverlay},
                {id:'project.theme', group:'workspace', View:ThemeSettingsOverlay},
                {id:'project.global-filter', group:'workspace', View:GlobalFilterOverlay},
                {id:'project.release', group:'workspace', View:ReleaseOverlay},
                {id:'project.cover', View:CoverOverlay},
                {id:'project.repair', View:RepairOverlay},
                {id:'project.restore', View:RestoreOverlay},
            ];
            overlays.forEach(({id, group, View}) => context.onDispose(editorShell.registerOverlay({
                id,
                group,
                View: withSuspense(View),
            })));

            context.onDispose(editorCommands.register('project.dialog', (signal, dialog, options) => {
                if (signal.aborted || !acceptingWrites) return;
                const id = `project.${dialog}`;
                if (options?.toggle && editorShell.isOverlayOpen(id)) {
                    editorShell.closeOverlay(id);
                } else {
                    editorShell.openOverlay(id);
                }
            }));
            context.onDispose(() => overlayIds.forEach(id => editorShell.closeOverlay(id)));

            const service = {
                prepare() {
                    if (!acceptingWrites) return Promise.reject(new Error('The editor project plugin is stopping.'));
                    preparation ??= import('./projectActions.ts').then(({createProjectActions}) => {
                        if (!acceptingWrites) throw new Error('The editor project plugin is stopping.');
                        return {
                            createActions: (id, project) => createProjectActions(id, project, enqueue, saveStatus, {
                                isActive: () => acceptingWrites,
                                open: overlayId => editorShell.openOverlay(overlayId),
                                close: overlayId => editorShell.closeOverlay(overlayId),
                                registerPauseCleanup(cleanup) {
                                    pauseCleanups.add(cleanup);
                                    return () => { pauseCleanups.delete(cleanup); };
                                },
                            }, trackTask),
                        };
                    });
                    return preparation;
                },
            };
            context.provide('editorProject', service);
            context.onDispose(editorShell.registerProject(service));
        },
    };
}
