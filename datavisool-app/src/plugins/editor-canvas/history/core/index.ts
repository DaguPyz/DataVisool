/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {OperateType} from '@/plugins/editor-canvas/history/OperateType.ts';
import AbstractRollback from './AbstractRollback.ts';
import type {EventOperateStore} from '@/plugins/editor-canvas/state/EventOperateStore.ts';
import {AddRollbackImpl} from './AddRollbackImpl.ts';
import {DelRollbackImpl} from './DelRollbackImpl.ts';
import {DragRollbackImpl} from './DragRollbackImpl.ts';
import {HideRollbackImpl} from './HideRollbackImpl.ts';
import {LockRollbackImpl} from './LockRollbackImpl.ts';
import {OrderRollBackImpl} from './OrderRollbackImpl.ts';
import {ResizeRollbackImpl} from './ResizeRollbackImpl.ts';
import {RotateRollbackImpl} from './RotateRollbackImpl.ts';
import {StyleRollbackImpl} from './StyleRollbackImpl.ts';
import {TransformRollbackImpl} from './TransformRollbackImpl.ts';
import {UpdLayerGroupRollbackImpl} from './UpdLayerGroupRollbackImpl.ts';

/** Every activation gets rollback handlers bound to its own selection and interaction state. */
export function createUndoRedoMap(eventOperateStore: EventOperateStore): Map<OperateType, AbstractRollback> {
    return new Map<OperateType, AbstractRollback>([
        [OperateType.DRAG, new DragRollbackImpl(eventOperateStore)],
        [OperateType.RESIZE, new ResizeRollbackImpl(eventOperateStore)],
        [OperateType.ADD, new AddRollbackImpl(eventOperateStore)],
        [OperateType.DEL, new DelRollbackImpl(eventOperateStore)],
        [OperateType.UPD_STYLE, new StyleRollbackImpl(eventOperateStore)],
        [OperateType.HIDE, new HideRollbackImpl(eventOperateStore)],
        [OperateType.LOCK, new LockRollbackImpl(eventOperateStore)],
        [OperateType.ORDER, new OrderRollBackImpl(eventOperateStore)],
        [OperateType.UPDATE_LAYER, new UpdLayerGroupRollbackImpl(eventOperateStore)],
        [OperateType.ROTATE, new RotateRollbackImpl(eventOperateStore)],
        [OperateType.TRANSFORM, new TransformRollbackImpl(eventOperateStore)],
    ]);
}
