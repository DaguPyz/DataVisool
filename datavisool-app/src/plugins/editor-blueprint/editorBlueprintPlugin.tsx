/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {lazy} from 'react';
import {ConnectionPointTwo} from '@icon-park/react';
import type {Plugin} from '@datavisool/sdk/plugin';
import type {} from '@datavisool/sdk/plugin/contracts/designerRuntime';
import type {} from '@datavisool/sdk/plugin/contracts/editorCanvas';
import type {} from '@datavisool/sdk/plugin/contracts/editorCommands';
import type {} from '@datavisool/sdk/plugin/contracts/editorShell';
import {designerWorkspaceChangedKey} from '@datavisool/sdk/plugin/contracts/designerRuntime';
import {designerBlueprintChangedKey} from '@datavisool/sdk/plugin/contracts/designerBlueprint';
import type {EditorBlueprintSession} from './session/EditorBlueprintSession.ts';

export function createEditorBlueprintPlugin(): Plugin {
    return {
        id: 'editor-blueprint',
        requires: ['designerRuntime', 'editorCanvas', 'editorShell', 'editorCommands'],
        provides: [],
        activate(context) {
            let active = true;
            let accepting = true;
            let activeSession: EditorBlueprintSession | undefined;
            const setActiveSession = (next: EditorBlueprintSession | undefined, previous?: EditorBlueprintSession) => {
                if (next && !active) { next.dispose(); return; }
                if (next) { activeSession = next; if (!accepting) next.pause(); }
                else if (activeSession === previous) activeSession = undefined;
            };
            context.onStop({
                pause() { accepting = false; activeSession?.pause(); },
                cancel() { if (active) { accepting = true; activeSession?.resume(); } },
            });
            const closeBlueprint = () => {
                const session = activeSession;
                activeSession = undefined;
                session?.dispose();
                context.editorShell.closeOverlay('blueprint');
            };
            const overlay = context.editorShell.registerOverlay({
                id: 'blueprint',
                group: 'workspace',
                View: lazy(async () => {
                    const [{EditorBlueprintOverlay}, {BlueprintNodeRegistryProvider}] = await Promise.all([
                        import('./session/EditorBlueprintOverlay.tsx'),
                        import('./node/BlueprintNodeRegistryContext.tsx'),
                    ]);
                    const registry = await context.designerRuntime.prepareBlueprintNodes();
                    return {
                        default: (props: {onClose(): void; project: import('@datavisool/sdk/plugin/contracts/designerRuntime').DesignerProjectSession}) => (
                            <BlueprintNodeRegistryProvider registry={registry}>
                                <EditorBlueprintOverlay {...props} canvas={context.editorCanvas} registry={registry} onSession={setActiveSession}/>
                            </BlueprintNodeRegistryProvider>
                        ),
                    };
                }),
            });
            context.onDispose(overlay);
            const BlueprintToolbarButton = () => <button type="button" className="workspace-icon-button"
                aria-label="打开蓝图编辑器" title="蓝图"
                onClick={() => { void context.editorCommands.execute('blueprint.open').catch(error => console.error('打开蓝图编辑器失败', error)); }}>
                <ConnectionPointTwo theme="outline" size={19}/>
            </button>;
            context.onDispose(context.editorShell.registerToolbarItem({
                id: 'blueprint',
                group: 'scene',
                order: 31,
                groupClassName: 'workspace-toolbar-secondary',
                dividerClassName: 'workspace-toolbar-secondary',
                View: BlueprintToolbarButton,
            }));
            context.onDispose(context.editorCommands.register('blueprint.open', signal => {
                if (!active || !accepting || signal.aborted || !context.editorShell.openOverlay('blueprint')) return;
                context.editorCanvas.select([], 'system');
            }));
            context.onDispose(context.editorCommands.register('blueprint.close', signal => {
                if (active && accepting && !signal.aborted) closeBlueprint();
            }));
            context.onDispose(context.editorCommands.register('blueprint.delete-selection', async signal => {
                if (!active || !accepting || signal.aborted || !context.editorShell.isOverlayOpen('blueprint')) return;
                const session = activeSession;
                if (!session || !session.isActive()) return;
                session.deleteSelection();
            }));
            context.onDispose(context.on(designerWorkspaceChangedKey, () => {
                closeBlueprint();
            }));
            context.onDispose(context.on(designerBlueprintChangedKey, event => {
                activeSession?.refreshFromScene(event);
            }));
            context.onDispose(closeBlueprint);
            context.onDispose(() => { active = false; accepting = false; });
        },
    };
}
