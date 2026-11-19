/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {ComponentType, ReactNode} from 'react';
import type {DesignerProjectSession} from './designerRuntime.js';
import type {EditorCanvasService} from './editorCanvas.js';
import type {EditorProjectFeature} from './editorProject.js';
import type {ShortcutActionId} from './editorShortcuts.js';

export interface EditorCanvasProps {
    readonly project: DesignerProjectSession;
    readonly overlay?: ReactNode;
}

export interface EditorCanvasContribution {
    readonly Canvas: ComponentType<EditorCanvasProps>;
    readonly ZoomControls: ComponentType;
    readonly Footer?: ComponentType<{inspectorAction?: ReactNode}>;
    readonly history: Pick<EditorCanvasService, 'undo' | 'redo'>;
}

export interface EditorDockPanelProps {
    onClose(): void;
}

export interface EditorDockPanel {
    readonly id: string;
    readonly label: string;
    readonly icon: ReactNode;
    readonly order: number;
    readonly Panel: ComponentType<EditorDockPanelProps>;
}

/** Read-only UI visibility registration; the shell coordinates narrow-screen panel exclusion. */
export interface EditorSidePanel {
    readonly id: string;
    readonly side: 'left' | 'right';
    readState(): {readonly open: boolean; readonly order: number};
    close(restoreFocus: boolean): void;
}

export interface EditorAssistantPanel {
    readonly icon: ReactNode;
    readonly label: string;
    readonly title: string;
    readonly Panel: ComponentType<{open: boolean; onClose(): void}>;
}

export interface EditorProjectContribution {
    prepare(): Promise<EditorProjectFeature>;
}

export interface EditorOverlayProps {
    onClose(): void;
    /** The project session hosting this overlay. */
    readonly project: DesignerProjectSession;
}

export interface EditorOverlayContribution {
    readonly id: string;
    /** Overlays in the same group replace one another. */
    readonly group?: string;
    readonly View: ComponentType<EditorOverlayProps>;
}

export interface EditorToolbarItem {
    readonly id: string;
    readonly group: string;
    readonly order: number;
    readonly groupClassName?: string;
    readonly dividerClassName?: string;
    readonly View: ComponentType;
}

export interface EditorViews {
    readonly inspector: ComponentType;
    readonly inspectorAction: ComponentType;
    readonly projectActions: ComponentType;
    readonly shortcuts: ComponentType;
    readonly layerSearch: ComponentType;
    readonly assistant: EditorAssistantPanel;
    readonly canvasDraft: ComponentType;
}

export interface EditorShellService {
    registerProject(contribution: EditorProjectContribution): () => void;
    registerCanvas(contribution: EditorCanvasContribution): () => void;
    registerDockPanel(panel: EditorDockPanel): () => void;
    registerView<K extends keyof EditorViews>(slot: K, view: EditorViews[K]): () => void;
    registerOverlay(overlay: EditorOverlayContribution): () => void;
    openOverlay(id: string): boolean;
    closeOverlay(id: string): void;
    isOverlayOpen(id: string): boolean;
    registerToolbarItem(item: EditorToolbarItem): () => void;
    openDockPanel(id: string, options?: {toggle?: boolean}): boolean;
    hasDockPanel(id: string): boolean;
    isDockPanelOpen(id: string): boolean;
    registerSidePanel(panel: EditorSidePanel): () => void;
    nextPanelOpenOrder(): number;
    registerShortcutHints(read: (id: ShortcutActionId) => readonly string[] | undefined): () => void;
    readShortcutHint(id: ShortcutActionId): readonly string[] | undefined;
    setAssistantVisible(visible: boolean): void;
}

declare module '../../plugin.js' {
    interface PluginServices {
        editorShell: EditorShellService;
    }
}
