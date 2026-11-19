/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {EditorCommandService} from '@datavisool/sdk/plugin/contracts/editorCommands';
import type {EditorCanvasService} from '@datavisool/sdk/plugin/contracts/editorCanvas';
import type {DesignerProjectSession} from '@datavisool/sdk/plugin/contracts/designerRuntime';

export function registerCanvasCommands(commands: EditorCommandService, project: DesignerProjectSession, canvas: EditorCanvasService) {
    return commands.register('canvas.create-loop', async signal => {
        const scene = project.editing?.readScene();
        if (!scene) return;
        if (signal.aborted || !scene.isActive()) return;
        await canvas.performAction('createLoopContainer');
    });
}
