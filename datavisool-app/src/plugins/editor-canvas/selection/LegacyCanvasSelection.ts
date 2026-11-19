/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {EditorCanvasService} from '@datavisool/sdk/plugin/contracts/editorCanvas';
import type {IHistoryRecords} from '../history/OperateType.ts';

/** Synchronous compatibility commands bound to one editor-canvas activation. */
export type LegacyCanvasCommands = Pick<EditorCanvasService,
    'select' | 'getLayerType' | 'focus' | 'insertLayer' | 'insertTemplate' | 'insertTemplateAtomically' | 'renameLayer'> & {
    applyHistory(record: IHistoryRecords, direction: 'undo' | 'redo'): void;
};
