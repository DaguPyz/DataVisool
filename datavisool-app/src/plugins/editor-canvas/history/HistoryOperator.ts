/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import HistoryQueue from "./HistoryQueue";
import type {IHistoryRecords} from './OperateType';
import type {SceneModelChange} from '@datavisool/sdk/plugin/contracts/designerBlueprint';

type HistoryEntry =
    | {readonly kind: 'legacy'; readonly record: IHistoryRecords; readonly sceneChange?: SceneModelChange}
    | {readonly kind: 'scene-model'; readonly change: SceneModelChange};

export default class HistoryOperator {
    private readonly queue = new HistoryQueue<HistoryEntry>(100);

    constructor(
        private readonly readSelectionIds: () => readonly string[],
        private readonly onChange: () => void = () => {},
        private readonly isActive: () => boolean = () => true,
    ) {}

    public put(record: IHistoryRecords, sceneChange?: SceneModelChange): void {
        if (!this.isActive()) return;
        const selectionIds = [...this.readSelectionIds()];
        this.queue.enqueue({kind: 'legacy', record: {
            ...record,
            actions: record.actions.map((item) => ({...item, selectionIds})),
        }, sceneChange});
        this.onChange();
    }

    /** The scene mutation is already applied; this registers its model-only undo/redo closures. */
    public recordChange(change: SceneModelChange): boolean {
        if (!this.isActive() || !change || !change.sceneIdentity
            || typeof change.rollback !== 'function'
            || typeof change.undo !== 'function' || typeof change.redo !== 'function') return false;
        this.queue.enqueue({kind: 'scene-model', change});
        this.onChange();
        return true;
    }

    public undo(applyLegacy: (record: IHistoryRecords) => void): boolean {
        if (!this.isActive()) return false;
        const entry = this.queue.peekBackoff();
        if (!entry) return false;
        if (entry.kind === 'scene-model') {
            if (!entry.change.undo()) return false;
        } else {
            if (entry.sceneChange && !entry.sceneChange.undo()) return false;
            try {
                applyLegacy(entry.record);
            } catch (error) {
                entry.sceneChange?.redo();
                throw error;
            }
        }
        const changed = this.queue.commitBackoff();
        if (changed) this.onChange();
        return changed;
    }

    public redo(applyLegacy: (record: IHistoryRecords) => void): boolean {
        if (!this.isActive()) return false;
        const entry = this.queue.peekForward();
        if (!entry) return false;
        if (entry.kind === 'scene-model') {
            if (!entry.change.redo()) return false;
        } else {
            if (entry.sceneChange && !entry.sceneChange.redo()) return false;
            try {
                applyLegacy(entry.record);
            } catch (error) {
                entry.sceneChange?.undo();
                throw error;
            }
        }
        const changed = this.queue.commitForward();
        if (changed) this.onChange();
        return changed;
    }

    public backoff(): IHistoryRecords | null {
        if (!this.isActive()) return null;
        const entry = this.queue.peekBackoff();
        if (!entry) return null;
        if (entry.kind === 'scene-model') {
            if (entry.change.undo() && this.queue.commitBackoff()) this.onChange();
            return null;
        }
        if (this.queue.commitBackoff()) this.onChange();
        return entry.record;
    }

    public forward(): IHistoryRecords | null {
        if (!this.isActive()) return null;
        const entry = this.queue.peekForward();
        if (!entry) return null;
        if (entry.kind === 'scene-model') {
            if (entry.change.redo() && this.queue.commitForward()) this.onChange();
            return null;
        }
        if (this.queue.commitForward()) this.onChange();
        return entry.record;
    }

    public reset(): void {
        this.queue.reset();
    }
}

