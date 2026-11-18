/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {EventKey, EventListener} from './EventKey.ts';
import type {PluginServices, ServiceType} from './index.ts';

type Action = () => void | Promise<void>;

export type PluginStopScope = 'plugin' | 'application';

export class PluginStopCancelledError extends Error {
    constructor() {
        super('Plugin stop was cancelled.');
        this.name = 'PluginStopCancelledError';
    }
}

export interface PluginStopParticipant {
    /** Pause new user operations and signal cancellation to work that needs it. */
    pause?(scope: PluginStopScope): void | Promise<void>;
    /** Finish pending work and save changes. Throw PluginStopCancelledError to veto the stop. */
    prepare?(scope: PluginStopScope): void | Promise<void>;
    /** Undo temporary changes made by pause or prepare, including a partial failure. */
    cancel?(scope: PluginStopScope): void | Promise<void>;
    /**
     * Remove installed contributions and wait for their consumers to detach.
     * Also used during startup rollback, so it must tolerate partial initialization,
     * absence of preparation and retries, including a change of stop scope.
     */
    withdraw?(scope: PluginStopScope): void | Promise<void>;
}

export interface PluginContextApi {
    /** Stage a capability declared in provides. Available during activate. */
    provide<Name extends string>(name: Name, service: ServiceType<Name>): void;
    /** Read a declared dependency or a capability already provided by this plugin. */
    get<Name extends string>(name: Name): ServiceType<Name>;
    /** Subscribe to an event and return an idempotent cancellation function. */
    on<T>(key: EventKey<T>, listener: EventListener<T>): () => void;
    /** Await all listeners in subscription order and report their failures together. */
    emit<T>(key: EventKey<T>, payload: T): Promise<void>;
    /**
     * Register cleanup for shutdown and startup rollback, including for a resource
     * acquired during stop preparation. The return value removes the registration.
     */
    onDispose(cleanup: Action): () => void;
    /** Register the plugin's preparation and contribution withdrawal during activate. */
    onStop(participant: PluginStopParticipant): void;
}

/** Service properties are available to plugins that declare them in requires or provides. */
export type PluginContext = PluginContextApi & Readonly<PluginServices>;

export interface Plugin {
    readonly id: string;
    readonly requires: readonly string[];
    readonly provides: readonly string[];
    activate(context: PluginContext): void | Promise<void>;
    /** Called on stop and after a failed activate. Registered disposals run afterwards. */
    deactivate?(): void | Promise<void>;
}
