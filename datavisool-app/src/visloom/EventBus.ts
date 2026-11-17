/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {EventKey, EventListener} from './contracts/EventKey.ts';

interface EventSubscription {
    readonly pluginId: string;
    readonly listener: EventListener<unknown>;
    state: 'pending' | 'active' | 'cancelled';
}

interface ListenerFailure {
    readonly pluginId: string;
    readonly error: unknown;
}

export class EventDispatchError extends Error {
    readonly eventId: string;
    readonly listenerErrors: readonly ListenerFailure[];

    constructor(eventId: string, listenerErrors: readonly ListenerFailure[]) {
        super(`Event '${eventId}' failed in ${listenerErrors.length} listener(s).`);
        this.name = 'EventDispatchError';
        this.eventId = eventId;
        this.listenerErrors = listenerErrors;
    }
}

export class EventBus {
    private readonly subscriptions = new Map<symbol, EventSubscription[]>();
    private readonly paused = new Set<string>();
    private readonly inFlight = new Map<string, Set<Promise<void>>>();

    on<T>(pluginId: string, key: EventKey<T>, listener: EventListener<T>, pending: boolean): () => void {
        const token = key.token;
        const subscription: EventSubscription = {
            pluginId,
            listener: payload => listener(payload as T),
            state: pending ? 'pending' : 'active',
        };
        const listeners = this.subscriptions.get(token) ?? [];
        listeners.push(subscription);
        this.subscriptions.set(token, listeners);

        return () => {
            if (subscription.state === 'cancelled') return;
            subscription.state = 'cancelled';
            const current = this.subscriptions.get(token)!;
            current.splice(current.indexOf(subscription), 1);
            if (!current.length) this.subscriptions.delete(token);
        };
    }

    activatePlugin(pluginId: string): void {
        for (const listeners of this.subscriptions.values()) {
            for (const subscription of listeners) {
                if (subscription.pluginId === pluginId) subscription.state = 'active';
            }
        }
    }

    async emit<T>(key: EventKey<T>, payload: T): Promise<void> {
        const listeners = this.subscriptions.get(key.token)?.filter(subscription => this.canDispatch(subscription)) ?? [];
        const errors: ListenerFailure[] = [];
        for (const subscription of listeners) {
            if (!this.canDispatch(subscription)) continue;
            try {
                await this.dispatch(subscription, payload);
            } catch (error) {
                errors.push({pluginId: subscription.pluginId, error});
            }
        }
        if (errors.length) throw new EventDispatchError(key.id, errors);
    }

    pause(pluginIds: readonly string[]): void {
        for (const id of pluginIds) this.paused.add(id);
    }

    resume(pluginIds: readonly string[]): void {
        for (const id of pluginIds) this.paused.delete(id);
    }

    /** Wait for paused listeners that were already running. Their errors belong to emit(). */
    async waitForIdle(pluginIds: readonly string[]): Promise<void> {
        const tasks = pluginIds.flatMap(id => [...(this.inFlight.get(id) ?? [])]);
        await Promise.allSettled(tasks);
    }

    removePlugin(pluginId: string): void {
        for (const [token, listeners] of this.subscriptions) {
            const remaining = listeners.filter(subscription => {
                if (subscription.pluginId !== pluginId) return true;
                subscription.state = 'cancelled';
                return false;
            });
            if (remaining.length) this.subscriptions.set(token, remaining);
            else this.subscriptions.delete(token);
        }
        this.paused.delete(pluginId);
    }

    private canDispatch(subscription: EventSubscription): boolean {
        return subscription.state === 'active' && !this.paused.has(subscription.pluginId);
    }

    private async dispatch(subscription: EventSubscription, payload: unknown): Promise<void> {
        const {pluginId} = subscription;
        const tasks = this.inFlight.get(pluginId) ?? new Set<Promise<void>>();
        // Track the callback before invoking it, even if it immediately calls back into the host.
        const task = Promise.resolve().then(() => {
            if (this.canDispatch(subscription)) return subscription.listener(payload);
        });
        tasks.add(task);
        this.inFlight.set(pluginId, tasks);
        try {
            await task;
        } finally {
            tasks.delete(task);
            if (!tasks.size) this.inFlight.delete(pluginId);
        }
    }
}
