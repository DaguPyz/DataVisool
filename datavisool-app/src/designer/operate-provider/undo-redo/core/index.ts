/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {OperateType} from "@/designer/operate-provider/undo-redo/OperateType";
import AbstractRollback from "./AbstractRollback";
import dragRollbackImpl from "./DragRollbackImpl";
import resizeRollbackImpl from "./ResizeRollbackImpl";
import addRollbackImpl from "./AddRollbackImpl";
import delRollbackImpl from "./DelRollbackImpl";
import styleRollbackImpl from "./StyleRollbackImpl";
import hideRollbackImpl from "./HideRollbackImpl";
import lockRollbackImpl from "./LockRollbackImpl";
import orderRollBackImpl from "./OrderRollbackImpl";
import updLayerGroupRollbackImpl from "./UpdLayerGroupRollbackImpl";
import rotateRollbackImpl from "./RotateRollbackImpl.ts";
import transformRollbackImpl from "./TransformRollbackImpl.ts";
import bpAddNodeRollbackImpl from "./BPAddNodeRollbackImpl";
import bpDelNodeRollbackImpl from "./BPDelNodeRollbackImpl";
import bpAddLineRollbackImpl from "./BPAddLineRollbackImpl";
import bpDelLineRollbackImpl from "./BPDelLineRollbackImpl";
import bpMoveNodeRollbackImpl from "./BPMoveNodeRollbackImpl";
import bpAddPageRollbackImpl from "./BPAddPageRollbackImpl";
import bpDelPageRollbackImpl from "./BPDelPageRollbackImpl";

const undoRedoMap = new Map<OperateType, AbstractRollback>();
undoRedoMap.set(OperateType.DRAG, dragRollbackImpl);
undoRedoMap.set(OperateType.RESIZE, resizeRollbackImpl);
undoRedoMap.set(OperateType.ADD, addRollbackImpl);
undoRedoMap.set(OperateType.DEL, delRollbackImpl);
undoRedoMap.set(OperateType.UPD_STYLE, styleRollbackImpl);
undoRedoMap.set(OperateType.HIDE, hideRollbackImpl);
undoRedoMap.set(OperateType.LOCK, lockRollbackImpl);
undoRedoMap.set(OperateType.ORDER, orderRollBackImpl);
undoRedoMap.set(OperateType.UPDATE_LAYER, updLayerGroupRollbackImpl);
undoRedoMap.set(OperateType.ROTATE, rotateRollbackImpl);
undoRedoMap.set(OperateType.TRANSFORM, transformRollbackImpl);
undoRedoMap.set(OperateType.BP_ADD_NODE, bpAddNodeRollbackImpl);
undoRedoMap.set(OperateType.BP_DEL_NODE, bpDelNodeRollbackImpl);
undoRedoMap.set(OperateType.BP_ADD_LINE, bpAddLineRollbackImpl);
undoRedoMap.set(OperateType.BP_DEL_LINE, bpDelLineRollbackImpl);
undoRedoMap.set(OperateType.BP_MOVE_NODE, bpMoveNodeRollbackImpl);
undoRedoMap.set(OperateType.BP_ADD_PAGE, bpAddPageRollbackImpl);
undoRedoMap.set(OperateType.BP_DEL_PAGE, bpDelPageRollbackImpl);

export default undoRedoMap;
