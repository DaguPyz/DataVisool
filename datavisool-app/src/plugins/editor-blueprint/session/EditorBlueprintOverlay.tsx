/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {Suspense, useEffect, useState} from 'react';
import type {EditorCanvasService} from '@datavisool/sdk/plugin/contracts/editorCanvas';
import type {DesignerBlueprintNodeRegistry} from '@datavisool/sdk/plugin/contracts/editorBlueprint';
import type {EditorOverlayProps} from '@datavisool/sdk/plugin/contracts/editorShell';
import {EditorBlueprintSession} from './EditorBlueprintSession.ts';
import {EditorBlueprintSessionProvider} from './EditorBlueprintSessionContext.tsx';

interface Props extends EditorOverlayProps {
    readonly canvas: EditorCanvasService;
    readonly registry: DesignerBlueprintNodeRegistry;
    readonly onSession: (next: EditorBlueprintSession | undefined, previous?: EditorBlueprintSession) => void;
}

export function EditorBlueprintOverlay({onClose, project, canvas, registry, onSession}: Props) {
    const scene = project.editing?.readScene();
    const [session, setSession] = useState<EditorBlueprintSession>();

    useEffect(() => {
        if (!scene?.isActive()) { setSession(undefined); return; }
        const owned = new EditorBlueprintSession({scene, project, canvas, registry});
        setSession(owned);
        onSession(owned);
        return () => {
            onSession(undefined, owned);
            owned.dispose();
        };
    }, [scene, project, canvas, registry, onSession]);

    useEffect(() => {
        if (!session) return;
        const dismissContextMenu = () => {
            if (session.contextMenu.bpMenuVisible)
                session.contextMenu.updateBpMenuVisible(false);
        };
        document.addEventListener('click', dismissContextMenu);
        return () => document.removeEventListener('click', dismissContextMenu);
    }, [session]);

    useEffect(() => {
        if (!session) return;
        const handleContextMenu = (event: MouseEvent) => {
            if (!session.isActive()) return;
            const canvasElement = document.querySelector('.blue-print-canvas');
            if (!canvasElement?.contains(event.target as Node)) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            const menu = session.contextMenu;
            if (menu.rightDragActive || menu.consumeSuppressedContextMenu()) {
                menu.hideMenus();
                return;
            }
            menu.requestBpMenu([event.clientX, event.clientY]);
        };
        // Capture before editor-shell's generic context-menu handler so this
        // workspace can keep menu state and DOM ownership inside the plugin.
        document.addEventListener('contextmenu', handleContextMenu, true);
        return () => document.removeEventListener('contextmenu', handleContextMenu, true);
    }, [session]);

    if (!scene) return <div role="alert">蓝图编辑器需要一个有效的编辑场景。</div>;
    if (!session || session.scene !== scene || !session.isActive()) return null;
    return <EditorBlueprintSessionProvider value={session}>
        <Suspense fallback={null}><BlueprintDialog onClose={onClose}/></Suspense>
    </EditorBlueprintSessionProvider>;
}

import BlueprintDialog from '../BluePrintDialog.tsx';
