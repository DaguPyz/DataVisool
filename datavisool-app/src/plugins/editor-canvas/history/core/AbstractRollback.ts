/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {IHistoryRecord} from "@/plugins/editor-canvas/history/OperateType";
import type {EventOperateStore} from '@/plugins/editor-canvas/state/EventOperateStore.ts';
import type {DesignerEditingScene} from '@datavisool/sdk/plugin/contracts/designerRuntime';

/**
 * 撤销回滚抽象接口定义
 */
export default abstract class AbstractRollback {
    protected constructor(protected readonly eventOperateStore: EventOperateStore) {}

    /** Capture the active scene before synchronous model work so deferred UI work cannot cross scenes. */
    protected captureScene(): DesignerEditingScene | undefined {
        return this.eventOperateStore.captureScene();
    }

    protected afterScene(scene: DesignerEditingScene, callback: () => void): void {
        Promise.resolve().then(() => {
            if (this.eventOperateStore.isSceneCurrent(scene)) callback();
        });
    }

    /**
     * 撤销
     */
    public abstract undo(record: IHistoryRecord): void;

    /**
     * 重做
     */
    public abstract redo(record: IHistoryRecord): void;
}
