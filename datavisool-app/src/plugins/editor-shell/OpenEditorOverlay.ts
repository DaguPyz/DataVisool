/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {EditorOverlayContribution, EditorOverlayProps} from '@datavisool/sdk/plugin/contracts/editorShell';

export interface OpenEditorOverlay extends EditorOverlayContribution, Pick<EditorOverlayProps, 'onClose'> {
    readonly instanceId: number;
}
