/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {observable} from 'mobx';
import type {
    EditorCommandArgs, EditorCommandHandler, EditorCommandId, EditorCommandResult, EditorCommandService,
} from '@datavisool/sdk/plugin/contracts/editorCommands';

interface CommandRegistration {
    invoke(signal: AbortSignal, args: unknown[]): unknown;
    readonly pending: Set<AbortController>;
}

export function createCommandRegistry() {
    const commands = observable.map<EditorCommandId, CommandRegistration>(undefined, {deep: false});
    let disposed = false;
    const revoke = (id: EditorCommandId, registration: CommandRegistration) => {
        if (commands.get(id) !== registration) return;
        commands.delete(id);
        for (const request of registration.pending) request.abort();
    };
    const service: EditorCommandService = {
        register<Key extends EditorCommandId>(id: Key, handler: EditorCommandHandler<Key>) {
            if (disposed) throw new Error('The editor command registry has been disposed.');
            if (commands.has(id)) throw new Error(`Editor command '${id}' is already registered.`);
            const registration: CommandRegistration = {
                invoke: (signal, args) => handler(signal, ...args as EditorCommandArgs<Key>),
                pending: new Set(),
            };
            commands.set(id, registration);
            return () => revoke(id, registration);
        },
        has(id) { return commands.has(id); },
        async execute<Key extends EditorCommandId>(id: Key, ...args: EditorCommandArgs<Key>): Promise<EditorCommandResult<Key>> {
            const registration = commands.get(id);
            if (!registration || disposed) throw new Error(`Editor command '${id}' is unavailable.`);
            const request = new AbortController();
            registration.pending.add(request);
            try {
                const result = await registration.invoke(request.signal, args);
                if (request.signal.aborted) throw new DOMException('The editor command was cancelled.', 'AbortError');
                return result as EditorCommandResult<Key>;
            } finally {
                registration.pending.delete(request);
            }
        },
    };
    return {
        service,
        dispose() {
            disposed = true;
            for (const [id, registration] of commands) revoke(id, registration);
        },
    };
}
