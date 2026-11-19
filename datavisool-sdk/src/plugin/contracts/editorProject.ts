/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {DesignerProjectSession, DesignerWorkspaceIdentity} from './designerRuntime.js';

export type EditorReleaseType = 'OVERWRITE' | 'INCREMENT';
export type EditorProjectSaveState = 'idle' | 'saving' | 'saved' | 'failed';

export interface EditorProjectSaveStatusSnapshot {
    readonly saving: boolean;
    readonly saveState: EditorProjectSaveState;
    readonly latestSaveTime: string;
}

export interface EditorProjectSaveStatus {
    read(): EditorProjectSaveStatusSnapshot;
    subscribe(listener: () => void): () => void;
}

export interface EditorReleaseOptions {
    readonly releaseType: EditorReleaseType;
    readonly encrypt: boolean;
    readonly password: string;
    readonly expirationDays?: number;
}

export interface EditorProjectActions {
    readonly rootProjectId: string;
    readonly saveStatus: EditorProjectSaveStatus;
    readWorkspace(): DesignerWorkspaceIdentity | undefined;
    switchWorkspace(id: string): Promise<void>;
    onWorkspaceDeleted(id: string): Promise<void>;
    renameWorkspace(id: string, name: string): void;
    restoreSnapshot(content: string): Promise<boolean>;
    cancelSnapshotRestore(): void;
    start(): void;
    save(): Promise<boolean>;
    saveThrottled(): void;
    openPreview(): Promise<void>;
    publish(options: EditorReleaseOptions, signal: AbortSignal): Promise<string | undefined>;
    importProject(): void;
    exportProject(): void;
    close(): void;
}

export type EditorProjectActionsFactory = (id: string, project: DesignerProjectSession) => EditorProjectActions;

export interface EditorProjectFeature {
    readonly createActions: EditorProjectActionsFactory;
}

export interface EditorProjectService {
    prepare(): Promise<EditorProjectFeature>;
}

declare module '../../plugin.js' {
    interface PluginServices {
        editorProject: EditorProjectService;
    }
}
