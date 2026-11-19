/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {lazy} from 'react';
import type {ComponentType} from 'react';
import {observable, reaction, runInAction} from 'mobx';
import {observer} from 'mobx-react';
import {Loading} from '@datavisool/ui';
import type {Plugin} from '@datavisool/sdk/plugin';
import type {EditorCanvasContribution, EditorDockPanel, EditorOverlayContribution, EditorProjectContribution, EditorShellService, EditorToolbarItem, EditorViews, EditorSidePanel} from '@datavisool/sdk/plugin/contracts/editorShell';
import type {ShortcutActionId} from '@datavisool/sdk/plugin/contracts/editorShortcuts';
import {DesignerMode} from '@datavisool/sdk/types';
import {createCommandRegistry} from './commandRegistry.ts';
import {DesignerDockState} from './dock/DesignerDockState.ts';
import type {OpenEditorOverlay} from './OpenEditorOverlay.ts';

const once = (cleanup: () => void) => {
    let withdrawn = false;
    return () => {
        if (withdrawn) return;
        withdrawn = true;
        cleanup();
    };
};

/** 注册主编辑器页面并装配编辑功能。 */
export function createEditorShellPlugin(): Plugin {
    return {
        id: 'editor-shell',
        requires: ['designerRuntime', 'router'],
        provides: ['editorShell', 'editorCommands'],
        activate(context) {
            const {designerRuntime, router} = context;
            let active = true;
            let accepting = true;
            let panelOrder = 0;
            const nextPanelOpenOrder = () => ++panelOrder;
            const designerLeftStore = new DesignerDockState(nextPanelOpenOrder);
            const assertAccepting = () => {
                if (!active || !accepting) throw new Error('The editor shell is stopping.');
            };
            context.onStop({
                pause() { accepting = false; designerLeftStore.pause(); },
                cancel() { if (active) { accepting = true; designerLeftStore.resume(); } },
            });
            const projectEditor = observable.box<ComponentType<{id: string}> | undefined>(undefined, {deep: false});
            const canvas = observable.box<EditorCanvasContribution | undefined>(undefined, {deep: false});
            const panels = observable.map<string, EditorDockPanel>(undefined, {deep: false});
            const sidePanels = observable.map<string, EditorSidePanel>(undefined, {deep: false});
            const enforceSidePanels = () => {
                if (!active || window.innerWidth > 959) return;
                const open = [{
                    side: 'left',
                    open: designerLeftStore.panelOpen,
                    order: designerLeftStore.panelOpenOrder,
                    close: designerLeftStore.closePanel,
                }, ...[...sidePanels.values()].map(panel => ({...panel.readState(), side: panel.side, close: panel.close}))]
                    .filter(panel => panel.open).sort((a, b) => b.order - a.order);
                const newest = open[0];
                if (newest) for (const panel of open.slice(1)) {
                    if (panel.side !== newest.side) panel.close(false);
                }
            };
            context.onDispose(reaction(
                () => [designerLeftStore.panelOpen, designerLeftStore.panelOpenOrder,
                    ...[...sidePanels.values()].map(panel => panel.readState())],
                enforceSidePanels,
            ));
            window.addEventListener('resize', enforceSidePanels);
            context.onDispose(() => window.removeEventListener('resize', enforceSidePanels));
            const views = observable.box<Partial<EditorViews>>({}, {deep: false});
            const overlays = observable.map<string, EditorOverlayContribution>(undefined, {deep: false});
            const openOverlays = observable.map<string, OpenEditorOverlay>(undefined, {deep: false});
            let nextOverlayInstance = 0;
            const toolbar = observable.map<string, EditorToolbarItem>(undefined, {deep: false});
            const shortcutHints = observable.box<((id: ShortcutActionId) => readonly string[] | undefined) | undefined>(undefined, {deep: false});
            const commands = createCommandRegistry();
            context.provide('editorCommands', commands.service);
            context.onDispose(commands.dispose);
            context.onDispose(() => {
                active = false;
                accepting = false;
                designerLeftStore.dispose();
                runInAction(() => {
                    projectEditor.set(undefined);
                    canvas.set(undefined);
                    panels.clear();
                    sidePanels.clear();
                    views.set({});
                    overlays.clear();
                    openOverlays.clear();
                    toolbar.clear();
                    shortcutHints.set(undefined);
                });
            });
            const shell: EditorShellService = {
                registerProject(contribution: EditorProjectContribution) {
                    assertAccepting();
                    if (projectEditor.get()) throw new Error('An editor project is already registered.');
                    const Editor = lazy(async () => {
                        const [{default: Designer}, createSession, projectFeature] = await Promise.all([
                            import('./Designer.tsx'),
                            designerRuntime.prepare(DesignerMode.EDIT),
                            contribution.prepare(),
                        ]);
                        if (!active || projectEditor.get() !== Editor) throw new Error('The editor project was withdrawn.');
                        return {
                            default: ({id}: {id: string}) =>
                                <Designer key={id} id={id} createSession={createSession} projectFeature={projectFeature} getCanvas={getCanvas}
                                          getDockPanels={getDockPanels} getViews={getViews} getOverlays={getOverlays}
                                          getToolbarItems={getToolbarItems}
                                          shell={shell} commands={commands.service} dock={designerLeftStore}
                                          returnHome={() => router.navigate('/home')}/>,
                        };
                    });
                    projectEditor.set(Editor);
                    return once(() => {
                        if (projectEditor.get() === Editor) projectEditor.set(undefined);
                    });
                },
                registerCanvas(contribution) {
                    assertAccepting();
                    if (canvas.get()) throw new Error('An editor canvas is already registered.');
                    canvas.set(contribution);
                    return once(() => {
                        if (canvas.get() === contribution) canvas.set(undefined);
                    });
                },
                registerDockPanel(panel) {
                    assertAccepting();
                    if (panels.has(panel.id)) throw new Error(`Editor panel '${panel.id}' is already registered.`);
                    panels.set(panel.id, panel);
                    return once(() => {
                        if (panels.get(panel.id) !== panel) return;
                        runInAction(() => {
                            if (designerLeftStore.activeModule === panel.id) designerLeftStore.closePanel(false);
                            panels.delete(panel.id);
                        });
                    });
                },
                registerView(slot, view) {
                    assertAccepting();
                    if (views.get()[slot]) throw new Error(`Editor slot '${slot}' is already registered.`);
                    views.set({...views.get(), [slot]: view});
                    return once(() => {
                        const current = views.get();
                        if (current[slot] !== view) return;
                        if (slot === 'assistant') designerLeftStore.setAiDrivenVisible(false);
                        const {[slot]: _removed, ...remaining} = current;
                        views.set(remaining);
                    });
                },
                registerOverlay(overlay) {
                    assertAccepting();
                    if (overlays.has(overlay.id)) throw new Error(`Editor overlay '${overlay.id}' is already registered.`);
                    overlays.set(overlay.id, overlay);
                    return once(() => {
                        if (overlays.get(overlay.id) !== overlay) return;
                        runInAction(() => {
                            openOverlays.delete(overlay.id);
                            overlays.delete(overlay.id);
                        });
                    });
                },
                openOverlay(id) {
                    if (!active || !accepting) return false;
                    const overlay = overlays.get(id);
                    if (!overlay) return false;
                    if (openOverlays.has(id)) return true;
                    runInAction(() => {
                        const group = overlay.group ?? overlay.id;
                        for (const [currentId, current] of openOverlays) {
                            if ((current.group ?? currentId) === group) openOverlays.delete(currentId);
                        }
                        const opened: OpenEditorOverlay = {
                            ...overlay,
                            instanceId: nextOverlayInstance++,
                            onClose() {
                                runInAction(() => {
                                    if (openOverlays.get(id) === opened) openOverlays.delete(id);
                                });
                            },
                        };
                        openOverlays.set(id, opened);
                    });
                    return true;
                },
                closeOverlay(id) { runInAction(() => openOverlays.delete(id)); },
                isOverlayOpen(id) { return openOverlays.has(id); },
                registerToolbarItem(item) {
                    assertAccepting();
                    if (toolbar.has(item.id)) throw new Error(`Editor toolbar item '${item.id}' is already registered.`);
                    toolbar.set(item.id, item);
                    return once(() => {
                        if (toolbar.get(item.id) === item) toolbar.delete(item.id);
                    });
                },
                openDockPanel(id, {toggle = false} = {}) {
                    if (!active || !accepting || !panels.has(id)) return false;
                    if (toggle) designerLeftStore.togglePanel(id);
                    else designerLeftStore.setActiveModule(id);
                    return true;
                },
                hasDockPanel(id) { return panels.has(id); },
                isDockPanelOpen(id) {
                    return active && panels.has(id) && designerLeftStore.panelOpen && designerLeftStore.activeModule === id;
                },
                registerSidePanel(panel) {
                    assertAccepting();
                    if (sidePanels.has(panel.id)) throw new Error(`Editor side panel '${panel.id}' is already registered.`);
                    runInAction(() => sidePanels.set(panel.id, panel));
                    enforceSidePanels();
                    return once(() => {
                        if (sidePanels.get(panel.id) === panel) runInAction(() => sidePanels.delete(panel.id));
                    });
                },
                nextPanelOpenOrder,
                registerShortcutHints(read) {
                    assertAccepting();
                    if (shortcutHints.get()) throw new Error('Editor shortcut hints are already registered.');
                    shortcutHints.set(read);
                    return once(() => {
                        if (shortcutHints.get() === read) shortcutHints.set(undefined);
                    });
                },
                readShortcutHint(id) {
                    const parts = shortcutHints.get()?.(id);
                    return parts && Object.freeze([...parts]);
                },
                setAssistantVisible(visible) {
                    if (active && (!visible || accepting)) designerLeftStore.setAiDrivenVisible(visible);
                },
            };
            context.provide('editorShell', shell);
            const getCanvas = () => canvas.get();
            const getDockPanels = () => [...panels.values()].sort((a, b) => a.order - b.order);
            const getViews = () => views.get();
            const getOverlays = () => [...openOverlays.values()];
            const getToolbarItems = () => [...toolbar.values()].sort((a, b) => a.order - b.order);
            const ProjectRoute = observer(({id}: {id: string}) => {
                const Editor = projectEditor.get();
                return Editor ? <Editor id={id}/> : <Loading/>;
            });
            const routes = router.registerRoutes([{
                id: 'app:designer',
                path: '/designer',
                render: ({location}) => <ProjectRoute id={new URLSearchParams(location.search).get('id') ?? ''}/>,
            }]);
            context.onStop(routes);
            context.onDispose(routes.dispose);
        },
    };
}
