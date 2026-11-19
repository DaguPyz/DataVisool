/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import ManagerStore from './designer/manager/ManagerStore.ts';
import DesignerDefinitionRegistry from './designer/loader/DesignerDefinitionRegistry.ts';
import {registerLegacyRemoteBaseUrl} from './legacy-global/RemoteComponentRegistrationBridge.ts';

export interface RuntimeManagedManager {
    destroy(): void;
    readonly layerManager?: {readonly controllers?: Record<string, unknown>};
    readonly globalVariableManager?: {pauseRuntimeEffects?(): void; resumeRuntimeEffects?(): void};
}

/** Per-plugin-activation owner for manager navigation and runtime registries. */
export default class DesignerRuntimeContext {
    readonly managerStore = new ManagerStore();
    readonly registry = new DesignerDefinitionRegistry();
    private readonly managers = new Set<RuntimeManagedManager>();
    private readonly remoteBaseUrls = new Map<object, Map<string, () => void>>();
    effectsPaused = false;

    registerManager(manager: RuntimeManagedManager): void {
        this.managers.add(manager);
    }

    unregisterManager(manager: RuntimeManagedManager): void {
        this.managers.delete(manager);
    }

    registerRemoteBaseUrl(owner: object, key: string, value: string): void {
        if (typeof window === 'undefined' || !key || !value) return;
        let registrations = this.remoteBaseUrls.get(owner);
        if (!registrations) {
            registrations = new Map();
            this.remoteBaseUrls.set(owner, registrations);
        }
        const previous = registrations.get(key);
        registrations.set(key, registerLegacyRemoteBaseUrl(owner, key, value));
        previous?.();
    }

    releaseRemoteBaseUrls(owner: object): void {
        const registrations = this.remoteBaseUrls.get(owner);
        this.remoteBaseUrls.delete(owner);
        const errors: unknown[] = [];
        registrations?.forEach(unregister => {
            try { unregister(); } catch (error) { errors.push(error); }
        });
        if (errors.length) throw new AggregateError(errors, 'Failed to release remote component base URL mappings.');
    }

    private clearRemoteBaseUrls(): void {
        const errors: unknown[] = [];
        [...this.remoteBaseUrls.keys()].forEach(owner => {
            try { this.releaseRemoteBaseUrls(owner); } catch (error) { errors.push(error); }
        });
        if (errors.length) throw new AggregateError(errors, 'Failed to clear runtime remote component mappings.');
    }

    pauseEffects(): void {
        if (this.effectsPaused) return;
        this.effectsPaused = true;
        const errors: unknown[] = [];
        this.managers.forEach(manager => {
            try { manager.globalVariableManager?.pauseRuntimeEffects?.(); } catch (error) { errors.push(error); }
            new Set(Object.values(manager.layerManager?.controllers ?? {})).forEach(controller => {
                try { (controller as {pauseRuntimeEffects?: () => void} | undefined)?.pauseRuntimeEffects?.(); }
                catch (error) { errors.push(error); }
            });
        });
        if (errors.length) throw new AggregateError(errors, 'Failed to pause designer runtime effects.');
    }

    resumeEffects(): void {
        if (!this.effectsPaused) return;
        this.effectsPaused = false;
        const errors: unknown[] = [];
        this.managers.forEach(manager => {
            try { manager.globalVariableManager?.resumeRuntimeEffects?.(); } catch (error) { errors.push(error); }
            new Set(Object.values(manager.layerManager?.controllers ?? {})).forEach(controller => {
                try { (controller as {resumeRuntimeEffects?: () => void} | undefined)?.resumeRuntimeEffects?.(); }
                catch (error) { errors.push(error); }
            });
        });
        if (errors.length) throw new AggregateError(errors, 'Failed to resume designer runtime effects.');
    }

    dispose(): void {
        this.effectsPaused = true;
        const errors: unknown[] = [];
        [...this.managers].reverse().forEach(manager => {
            try { manager.destroy(); } catch (error) { errors.push(error); }
        });
        this.managers.clear();
        this.managerStore.clear();
        try { this.clearRemoteBaseUrls(); } catch (error) { errors.push(error); }
        this.registry.clear();
        if (errors.length) throw new AggregateError(errors, 'Failed to dispose designer runtime activation.');
    }
}
