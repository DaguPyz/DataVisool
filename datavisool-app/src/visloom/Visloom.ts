/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {EventBus} from './EventBus.ts';
import {createPluginList, type PluginListEntry} from './PluginList.ts';
import {ProviderRegistry, type PendingProvider} from './ProviderRegistry.ts';
import {
    PluginStopCancelledError,
    type Plugin,
    type PluginContext,
    type PluginStopParticipant,
    type PluginStopScope,
} from './contracts/Plugin.ts';
import type {ServiceKey} from './contracts/ServiceKey.ts';

type Cleanup = () => void | Promise<void>;
type StopHook = keyof PluginStopParticipant;
type LifecyclePhase = 'activate' | StopHook | 'deactivate' | 'dispose';

interface StopRegistration {
    readonly pluginId: string;
    readonly participant: PluginStopParticipant;
    withdrawnIn?: PluginStopScope;
}

interface ActivePlugin {
    readonly plan: PluginListEntry;
    readonly pending: Map<symbol, PendingProvider>;
    readonly cleanups: Set<Cleanup>;
    readonly stopParticipants: StopRegistration[];
    state: 'activating' | 'active' | 'stopping' | 'disposing' | 'inactive';
}

export class PluginLifecycleError extends Error {
    readonly pluginId: string;
    readonly phase: LifecyclePhase;
    readonly cause: unknown;

    constructor(pluginId: string, phase: LifecyclePhase, cause: unknown) {
        const detail = cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : '';
        super(`Plugin '${pluginId}' failed during ${phase}${detail ? `: ${detail}` : '.'}`);
        this.name = 'PluginLifecycleError';
        this.pluginId = pluginId;
        this.phase = phase;
        this.cause = cause;
    }
}

export class Visloom {
    private readonly providers = new ProviderRegistry();
    private readonly events = new EventBus();
    private readonly active = new Map<string, ActivePlugin>();
    private running = false;
    private starting = false;
    private stopping?: {pluginId: string | undefined; result: Promise<void>};

    /** Start a plugin list after checking all declarations and dependencies. */
    async start(plugins: readonly Plugin[]): Promise<void> {
        if (this.starting || this.stopping) throw new Error('Visloom is already changing plugin state.');
        if (this.running) throw new Error('Visloom is already running.');

        this.starting = true;
        try {
            const ordered = createPluginList(plugins);
            for (const plan of ordered) {
                const entry: ActivePlugin = {
                    plan,
                    pending: new Map(),
                    cleanups: new Set(),
                    stopParticipants: [],
                    state: 'activating',
                };
                try {
                    await plan.activate(this.createContext(entry));
                    const missing = [...plan.provides.values()].filter(key => !entry.pending.has(key.token));
                    if (missing.length) {
                        throw new Error(`Declared services were not provided: ${missing.map(key => key.id).join(', ')}.`);
                    }
                    this.providers.commit(plan.id, entry.pending);
                    entry.pending.clear();
                    entry.state = 'active';
                    this.events.activatePlugin(plan.id);
                    this.active.set(plan.id, entry);
                } catch (cause) {
                    const failure = new PluginLifecycleError(plan.id, 'activate', cause);
                    const errors = await this.rollback([entry, ...[...this.active.values()].reverse()]);
                    if (errors.length) {
                        throw new AggregateError([failure, ...errors], 'Visloom startup and rollback failed.');
                    }
                    throw failure;
                }
            }
            this.running = true;
        } finally {
            this.starting = false;
        }
    }

    /** Read an activated capability from the application entry point. */
    get<T>(key: ServiceKey<T>): T {
        if (!this.running) throw new Error('Visloom is not running.');
        return this.providers.get(key);
    }

    /** Stop one plugin after checking that all its dependents have stopped. */
    stopPlugin(pluginId: string): Promise<void> {
        if (typeof pluginId !== 'string' || !pluginId.trim()) {
            return Promise.reject(new Error('Plugin ID cannot be empty.'));
        }
        return this.requestStop(pluginId);
    }

    /** Prepare all active plugins before any contribution is withdrawn. */
    stop(): Promise<void> {
        return this.requestStop();
    }

    private createContext(entry: ActivePlugin): PluginContext {
        const {plan} = entry;
        const assertUsable = () => {
            if (entry.state === 'inactive') throw new Error(`Plugin '${plan.id}' context is no longer active.`);
        };
        const assertCanRegister = () => {
            assertUsable();
            if (entry.state === 'stopping' || entry.state === 'disposing') {
                throw new Error(`Plugin '${plan.id}' is stopping.`);
            }
        };

        const context: PluginContext = {
            provide: (key, service) => {
                assertUsable();
                if (entry.state !== 'activating') {
                    throw new Error(`Plugin '${plan.id}' can only register services during activate().`);
                }
                const declaredKey = plan.provides.get(key.token);
                if (!declaredKey) {
                    throw new Error(`Plugin '${plan.id}' cannot provide undeclared service '${key.id}'.`);
                }
                if (entry.pending.has(key.token)) {
                    throw new Error(`Plugin '${plan.id}' already provided service '${key.id}'.`);
                }
                entry.pending.set(key.token, {key: declaredKey, service});
            },
            get: <T>(key: ServiceKey<T>): T => {
                assertUsable();
                if (!plan.requires.has(key.token) && !plan.provides.has(key.token)) {
                    throw new Error(`Plugin '${plan.id}' cannot read undeclared service '${key.id}'.`);
                }
                const pending = entry.pending.get(key.token);
                return pending ? pending.service as T : this.providers.get(key);
            },
            on: (key, listener) => {
                assertCanRegister();
                return this.events.on(plan.id, key, listener, entry.state === 'activating');
            },
            emit: async (key, payload) => {
                assertUsable();
                await this.events.emit(key, payload);
            },
            onDispose: cleanup => {
                assertUsable();
                if (entry.state === 'disposing') throw new Error(`Plugin '${plan.id}' is already cleaning up.`);
                const registration = () => cleanup();
                entry.cleanups.add(registration);
                return () => { entry.cleanups.delete(registration); };
            },
            onStop: participant => {
                assertUsable();
                if (entry.state !== 'activating') {
                    throw new Error(`Plugin '${plan.id}' can only register stop participants during activate().`);
                }
                entry.stopParticipants.push({
                    pluginId: plan.id,
                    participant: {
                        pause: participant.pause?.bind(participant),
                        prepare: participant.prepare?.bind(participant),
                        cancel: participant.cancel?.bind(participant),
                        withdraw: participant.withdraw?.bind(participant),
                    },
                });
            },
        };
        return Object.freeze(context);
    }

    private requestStop(pluginId?: string): Promise<void> {
        if (this.starting) return Promise.reject(new Error('Visloom is starting.'));
        if (this.stopping) {
            return this.stopping.pluginId === pluginId
                ? this.stopping.result
                : Promise.reject(new Error('Visloom is already stopping plugins.'));
        }

        const result = Promise.resolve().then(() => this.performStop(pluginId)).finally(() => {
            this.stopping = undefined;
        });
        this.stopping = {pluginId, result};
        return result;
    }

    private getStopEntries(pluginId: string | undefined): ActivePlugin[] {
        if (pluginId === undefined) return [...this.active.values()].reverse();
        const entry = this.active.get(pluginId);
        if (!entry) throw new Error(`Plugin '${pluginId}' is not active.`);

        const dependents = [...this.active.values()]
            .filter(candidate => [...candidate.plan.requires.keys()].some(token => entry.plan.provides.has(token)))
            .map(candidate => candidate.plan.id);
        if (dependents.length) {
            throw new Error(`Plugin '${pluginId}' is required by plugins: ${dependents.join(', ')}.`);
        }
        return [entry];
    }

    private async performStop(pluginId: string | undefined): Promise<void> {
        const entries = this.getStopEntries(pluginId);
        const scope = pluginId === undefined ? 'application' : 'plugin';
        const registrations = entries.flatMap(entry => [...entry.stopParticipants].reverse());
        const attempted = new Set<StopRegistration>();
        const ids = this.pauseEntries(entries);

        try {
            await runPreparations(registrations, 'pause', scope, attempted);
            await this.events.waitForIdle(ids);
            await runPreparations(registrations, 'prepare', scope, attempted);
            for (const registration of registrations) {
                if (registration.withdrawnIn === scope) continue;
                await runStopHook(registration, 'withdraw', scope);
                registration.withdrawnIn = scope;
            }
        } catch (error) {
            const errors: unknown[] = [];
            for (const registration of [...attempted].reverse()) {
                await collect(errors, () => runStopHook(registration, 'cancel', scope));
            }
            for (const entry of entries) entry.state = 'active';
            this.events.resume(ids);
            if (errors.length) {
                throw new AggregateError([error, ...errors], 'Visloom failed to stop and restore plugin preparations.');
            }
            throw error;
        }

        const errors: unknown[] = [];
        for (const entry of entries) await this.dispose(entry, errors);
        if (scope === 'application') this.running = false;
        if (errors.length) throw new AggregateError(errors, 'Visloom encountered plugin cleanup errors.');
    }

    private pauseEntries(entries: readonly ActivePlugin[]): string[] {
        const ids = entries.map(entry => entry.plan.id);
        for (const entry of entries) entry.state = 'stopping';
        this.events.pause(ids);
        return ids;
    }

    private async rollback(entries: readonly ActivePlugin[]): Promise<unknown[]> {
        const ids = this.pauseEntries(entries);
        const errors: unknown[] = [];
        // Startup may already have dispatched notifications to an earlier plugin in this batch.
        for (const entry of entries) {
            for (const registration of [...entry.stopParticipants].reverse()) {
                await collect(errors, () => runStopHook(registration, 'pause', 'application'));
            }
        }
        await this.events.waitForIdle(ids);
        for (const entry of entries) {
            for (const registration of [...entry.stopParticipants].reverse()) {
                await collect(errors, () => runStopHook(registration, 'withdraw', 'application'));
            }
            await this.dispose(entry, errors);
        }
        return errors;
    }

    private async dispose(entry: ActivePlugin, errors: unknown[]): Promise<void> {
        const {id, deactivate} = entry.plan;
        entry.state = 'disposing';
        try {
            if (deactivate) await runCleanup(id, 'deactivate', deactivate, errors);
            for (const cleanup of [...entry.cleanups].reverse()) {
                if (entry.cleanups.delete(cleanup)) await runCleanup(id, 'dispose', cleanup, errors);
            }
        } finally {
            entry.state = 'inactive';
            entry.pending.clear();
            entry.stopParticipants.length = 0;
            this.providers.removePlugin(id);
            this.events.removePlugin(id);
            this.active.delete(id);
        }
    }
}

async function runPreparations(
    registrations: readonly StopRegistration[],
    phase: 'pause' | 'prepare',
    scope: PluginStopScope,
    attempted: Set<StopRegistration>,
): Promise<void> {
    for (const registration of registrations) {
        if (!registration.participant[phase]) continue;
        attempted.add(registration);
        await runStopHook(registration, phase, scope);
    }
}

async function runStopHook(
    registration: StopRegistration,
    phase: StopHook,
    scope: PluginStopScope,
): Promise<void> {
    const hook = registration.participant[phase];
    if (!hook) return;
    try {
        await hook(scope);
    } catch (cause) {
        if (phase === 'prepare' && cause instanceof PluginStopCancelledError) throw cause;
        throw new PluginLifecycleError(registration.pluginId, phase, cause);
    }
}

async function collect(errors: unknown[], run: Cleanup): Promise<void> {
    try {
        await run();
    } catch (error) {
        errors.push(error);
    }
}

async function runCleanup(
    pluginId: string,
    phase: 'deactivate' | 'dispose',
    cleanup: Cleanup,
    errors: unknown[],
): Promise<void> {
    try {
        await cleanup();
    } catch (cause) {
        errors.push(new PluginLifecycleError(pluginId, phase, cause));
    }
}
