/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

export type EditorProjectDialog = 'project' | 'canvas' | 'theme' | 'global-filter' | 'release' | 'cover' | 'repair' | 'restore';

export interface EditorCommandDefinition<Args extends unknown[], Result> {
    readonly args: Args;
    readonly result: Result;
}

/** Features extend this map with commands they register with the editor shell. */
export interface EditorCommandDefinitions {
    'template.save-selection': EditorCommandDefinition<[], boolean>;
    'blueprint.open': EditorCommandDefinition<[], void>;
    'blueprint.close': EditorCommandDefinition<[], void>;
    'blueprint.delete-selection': EditorCommandDefinition<[], void>;
    'shortcuts.help': EditorCommandDefinition<[options?: {toggle?: boolean}], void>;
    'project.dialog': EditorCommandDefinition<[dialog: EditorProjectDialog, options?: {toggle?: boolean}], void>;
    'canvas.create-loop': EditorCommandDefinition<[], void>;
    'assistant.open': EditorCommandDefinition<[], void>;
    'layers.search': EditorCommandDefinition<[], void>;
}

export type EditorCommandId = keyof EditorCommandDefinitions;
export type EditorCommandArgs<Key extends EditorCommandId> = EditorCommandDefinitions[Key]['args'];
export type EditorCommandResult<Key extends EditorCommandId> = EditorCommandDefinitions[Key]['result'];
export type EditorCommandHandler<Key extends EditorCommandId> =
    (signal: AbortSignal, ...args: EditorCommandArgs<Key>) => EditorCommandResult<Key> | Promise<EditorCommandResult<Key>>;

export interface EditorCommandService {
    register<Key extends EditorCommandId>(id: Key, handler: EditorCommandHandler<Key>): () => void;
    has(id: EditorCommandId): boolean;
    execute<Key extends EditorCommandId>(id: Key, ...args: EditorCommandArgs<Key>): Promise<EditorCommandResult<Key>>;
}

declare module '../../plugin.js' {
    interface PluginServices {
        editorCommands: EditorCommandService;
    }
}
