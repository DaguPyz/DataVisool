/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {
    EditorProjectSaveState,
    EditorProjectSaveStatusSnapshot,
    EditorProjectSaveStatus,
} from '@datavisool/sdk/plugin/contracts/editorProject';

export interface EditorProjectSaveStatusStore extends EditorProjectSaveStatus {
    setSaving(saving: boolean): void;
    setLatestSaveTime(time: string): void;
    setSaveState(state: EditorProjectSaveState): void;
    reset(): void;
}

export function createProjectSaveStatusStore(): EditorProjectSaveStatusStore {
    let snapshot: EditorProjectSaveStatusSnapshot = Object.freeze({
        saving: false,
        saveState: 'idle',
        latestSaveTime: '',
    });
    const listeners = new Set<() => void>();

    const update = (next: EditorProjectSaveStatusSnapshot) => {
        if (snapshot.saving === next.saving && snapshot.saveState === next.saveState
            && snapshot.latestSaveTime === next.latestSaveTime) return;
        snapshot = Object.freeze(next);
        listeners.forEach(listener => listener());
    };

    return {
        read: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        setSaving(saving) {
            update({...snapshot, saving});
        },
        setLatestSaveTime(latestSaveTime) {
            update({...snapshot, latestSaveTime});
        },
        setSaveState(saveState: EditorProjectSaveState) {
            update({...snapshot, saveState});
        },
        reset() {
            update({saving: false, saveState: 'idle', latestSaveTime: ''});
        },
    };
}
