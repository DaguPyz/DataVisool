/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {action, makeObservable, observable, runInAction} from 'mobx';
import {
    isKeyboardShortcutDefinition,
    resolveDefaultBinding,
    shortcutContextsOverlap,
    shortcutDefinitions,
} from './ShortcutRegistry.ts';
import {
    shortcutPersistence,
    type ShortcutPersistence,
    isShortcutBinding,
} from './ShortcutPersistence.ts';
import {
    getEventModifiers,
    getResolvedShortcutKeyToken,
    getShortcutBindingConflictKey,
    getShortcutBindingValueKey,
    getShortcutPlatform,
    isEditableShortcutTarget,
    resolveShortcutModifier,
    resolveShortcutModifiers,
    shortcutBindingToHotkeys,
} from './HotKeyPlatform.ts';
import type {
    ShortcutActionId,
    ShortcutBinding,
    ShortcutBindingOverride,
    ShortcutBindingUpdateResult,
    ShortcutConflict,
    ShortcutDefinition,
    ShortcutHandler,
    ShortcutLoadState,
    ShortcutPlatform,
    ShortcutPreferencesV1,
    ShortcutSaveState,
} from './ShortcutTypes.ts';

type ShortcutActivationEvent = KeyboardEvent | MouseEvent | PointerEvent;

export interface ShortcutStoreOptions {
    definitions?: readonly ShortcutDefinition[];
    persistence?: ShortcutPersistence;
    platform?: ShortcutPlatform;
    saveDelayMs?: number;
}

interface PendingSave {
    userId: string;
    preferences: ShortcutPreferencesV1;
}

const normalizeUserId = (userId: string | null | undefined) => userId?.trim() || 'anonymous';

const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

const cloneBinding = (binding: ShortcutBinding): ShortcutBinding => ({
    key: binding.key.kind === 'code'
        ? {kind: 'code', code: binding.key.code}
        : {kind: 'modifier', modifier: binding.key.modifier},
    modifiers: [...binding.modifiers],
    trigger: binding.trigger,
});

export class ShortcutStore {
    activeUserId = 'anonymous';
    loadState: ShortcutLoadState = 'idle';
    loadError: string | null = null;
    saveError: string | null = null;
    saveState: ShortcutSaveState = 'idle';
    capturingActionId: ShortcutActionId | null = null;
    overrides = new Map<ShortcutActionId, ShortcutBindingOverride>();
    pressedStateVersion = 0;

    private readonly definitions: readonly ShortcutDefinition[];
    private readonly definitionsById: Map<ShortcutActionId, ShortcutDefinition>;
    private readonly persistence: ShortcutPersistence;
    private readonly platform: ShortcutPlatform;
    private readonly saveDelayMs: number;
    private readonly handlers = new Map<ShortcutActionId, Set<ShortcutHandler>>();
    private readonly pressedCodes = new Set<string>();
    private generation = 0;
    private initializePromise: Promise<void> | null = null;
    private saveTimer: ReturnType<typeof setTimeout> | null = null;
    private pendingSave: PendingSave | null = null;
    private writeChain: Promise<void> = Promise.resolve();

    constructor(options: ShortcutStoreOptions = {}) {
        this.definitions = options.definitions ?? shortcutDefinitions;
        this.definitionsById = new Map(this.definitions.map((definition) => [definition.id, definition]));
        this.persistence = options.persistence ?? shortcutPersistence;
        this.platform = options.platform ?? getShortcutPlatform();
        this.saveDelayMs = options.saveDelayMs ?? 150;

        makeObservable(this, {
            activeUserId: observable,
            loadState: observable,
            loadError: observable,
            saveError: observable,
            saveState: observable,
            capturingActionId: observable,
            overrides: observable.shallow,
            pressedStateVersion: observable,
            beginCapture: action,
            endCapture: action,
            setBinding: action,
            resetBinding: action,
            resetAll: action,
            retrySave: action,
            handleKeyDown: action,
            handleKeyUp: action,
            clearPressed: action,
            reconcileModifierState: action,
        });
    }

    getBinding(actionId: ShortcutActionId): ShortcutBindingOverride {
        const definition = this.definitionsById.get(actionId);
        if (!definition || !isKeyboardShortcutDefinition(definition))
            return null;
        if (this.overrides.has(actionId))
            return this.overrides.get(actionId) ?? null;
        if (definition.defaultPriority === 'yield-to-custom'
            && this.findConflictsAgainstOverrides(
                actionId,
                resolveDefaultBinding(definition, this.platform),
                this.overrides,
                {skipYieldingActionDefault: false, skipYieldingCandidateDefault: false},
            ).some((conflict) => this.overrides.has(conflict.actionId)))
            return null;
        return resolveDefaultBinding(definition, this.platform);
    }

    isCustomized(actionId: ShortcutActionId): boolean {
        return this.overrides.has(actionId);
    }

    beginCapture(actionId: ShortcutActionId): boolean {
        const definition = this.definitionsById.get(actionId);
        if (this.loadState !== 'ready' || !definition || !isKeyboardShortcutDefinition(definition))
            return false;
        this.capturingActionId = actionId;
        this.clearPressed();
        return true;
    }

    endCapture(): void {
        this.capturingActionId = null;
        this.clearPressed();
    }

    async initialize(userId?: string | null): Promise<void> {
        const normalizedUserId = normalizeUserId(userId);
        if (this.activeUserId === normalizedUserId) {
            if (this.loadState === 'ready')
                return;
            if (this.loadState === 'loading' && this.initializePromise)
                return this.initializePromise;
        }

        const pendingWrite = this.flushPendingSave();
        const generation = ++this.generation;
        runInAction(() => {
            this.activeUserId = normalizedUserId;
            this.overrides.clear();
            this.loadState = 'loading';
            this.loadError = null;
            this.saveError = null;
            this.saveState = 'idle';
            this.capturingActionId = null;
        });
        const initializePromise = pendingWrite.then(() => {
            if (generation !== this.generation)
                return null;
            return this.persistence.load(normalizedUserId);
        }).then((result) => {
            if (!result)
                return;
            if (generation !== this.generation)
                return;

            if (result.status === 'error') {
                runInAction(() => {
                    this.loadState = 'error';
                    this.loadError = errorMessage(result.error);
                });
                return;
            }

            if (result.status === 'fallback') {
                console.warn(result.reason);
                runInAction(() => {
                    this.loadState = 'error';
                    this.loadError = result.reason;
                });
                return;
            }

            result.warnings.forEach((warning) => console.warn(warning));
            const loadedOverrides = result.preferences
                ? this.resolveLoadedOverrides(result.preferences.overrides)
                : new Map<ShortcutActionId, ShortcutBindingOverride>();
            runInAction(() => this.applyResolvedOverrides(loadedOverrides));
            runInAction(() => {
                this.loadState = 'ready';
                this.loadError = null;
            });
        }).finally(() => {
            if (generation === this.generation)
                this.initializePromise = null;
        });

        this.initializePromise = initializePromise;
        return initializePromise;
    }

    findConflicts(actionId: ShortcutActionId, binding: ShortcutBindingOverride): ShortcutConflict[] {
        return this.findConflictsAgainstOverrides(actionId, binding, this.overrides);
    }

    setBinding(actionId: ShortcutActionId, binding: ShortcutBindingOverride): ShortcutBindingUpdateResult {
        if (this.loadState === 'loading' || this.loadState === 'error')
            return {ok: false, reason: 'invalid', message: '快捷键配置尚未就绪，请稍后重试'};
        const definition = this.definitionsById.get(actionId);
        if (!definition || !isKeyboardShortcutDefinition(definition))
            return {ok: false, reason: 'invalid', message: '动作不存在或不允许配置'};

        if (binding && !this.isSemanticallyValidBinding(binding))
            return {ok: false, reason: 'invalid', message: '快捷键结构无效'};
        if (binding && binding.trigger !== resolveDefaultBinding(definition, this.platform).trigger)
            return {ok: false, reason: 'invalid', message: '不能修改快捷键的触发方式'};

        const conflicts = this.findConflicts(actionId, binding);
        if (conflicts.length > 0)
            return {ok: false, reason: 'conflict', conflicts};

        const defaultBinding = resolveDefaultBinding(definition, this.platform);
        const restoresDefault = binding !== null
            && getShortcutBindingValueKey(binding) === getShortcutBindingValueKey(defaultBinding);
        if (binding === null) {
            if (this.overrides.has(actionId) && this.overrides.get(actionId) === null)
                return {ok: true};
            this.overrides.set(actionId, null);
        } else if (restoresDefault) {
            this.overrides.delete(actionId);
        } else {
            this.overrides.set(actionId, cloneBinding(binding));
        }

        this.scheduleSave();
        return {ok: true};
    }

    resetBinding(actionId: ShortcutActionId): ShortcutBindingUpdateResult {
        if (this.loadState === 'loading' || this.loadState === 'error')
            return {ok: false, reason: 'invalid', message: '快捷键配置尚未就绪，请稍后重试'};
        const definition = this.definitionsById.get(actionId);
        if (!definition || !isKeyboardShortcutDefinition(definition))
            return {ok: false, reason: 'invalid', message: '动作不存在或不允许配置'};
        const conflicts = this.findConflicts(actionId, resolveDefaultBinding(definition, this.platform));
        if (conflicts.length > 0)
            return {ok: false, reason: 'conflict', conflicts};

        const changed = this.overrides.delete(actionId);
        if (changed)
            this.scheduleSave();
        return {ok: true};
    }

    resetAll(): ShortcutBindingUpdateResult {
        if (this.loadState === 'loading' || this.loadState === 'error')
            return {ok: false, reason: 'invalid', message: '快捷键配置尚未就绪，请稍后重试'};
        this.overrides.clear();
        this.scheduleSave();
        return {ok: true};
    }

    registerHandler(actionId: ShortcutActionId, handler: ShortcutHandler): () => void {
        if (!this.definitionsById.has(actionId))
            throw new Error(`Unknown shortcut action: ${actionId}`);
        const handlers = this.handlers.get(actionId) ?? new Set<ShortcutHandler>();
        handlers.add(handler);
        this.handlers.set(actionId, handlers);

        let disposed = false;
        return () => {
            if (disposed)
                return;
            disposed = true;
            handlers.delete(handler);
            if (handlers.size === 0)
                this.handlers.delete(actionId);
        };
    }

    invokeHandlers(actionId: ShortcutActionId, event: KeyboardEvent): boolean {
        const handlers = this.handlers.get(actionId);
        if (!handlers || handlers.size === 0)
            return false;
        handlers.forEach((handler) => handler(event));
        return true;
    }

    isActive(actionId: ShortcutActionId, event?: ShortcutActivationEvent): boolean {
        if (this.capturingActionId)
            return false;
        const definition = this.definitionsById.get(actionId);
        if (!definition || !isKeyboardShortcutDefinition(definition))
            return false;
        const binding = this.getBinding(actionId);
        if (!binding)
            return false;

        const target = event?.target ?? (typeof document === 'undefined' ? null : document.activeElement);
        if (!definition.allowInInput && isEditableShortcutTarget(target))
            return false;

        if (binding.trigger === 'press')
            return event instanceof KeyboardEvent && this.matchesPress(binding, event);
        return this.matchesHold(binding, event);
    }

    /** Match a shortcut including the exact modifier set; used by temporary canvas tools only. */
    isActiveWithExactModifiers(actionId: ShortcutActionId, event?: ShortcutActivationEvent): boolean {
        if (!this.isActive(actionId, event))
            return false;
        const binding = this.getBinding(actionId);
        if (!binding)
            return false;
        const expected = new Set(resolveShortcutModifiers(binding.modifiers, this.platform));
        const keyToken = getResolvedShortcutKeyToken(binding.key, this.platform);
        if (keyToken.startsWith('modifier:'))
            expected.add(keyToken.slice('modifier:'.length) as ReturnType<typeof resolveShortcutModifiers>[number]);
        const actual = event ? getEventModifiers(event) : new Set<ReturnType<typeof resolveShortcutModifiers>[number]>();
        for (const code of this.pressedCodes) {
            const modifier = modifierFromCode(code);
            if (modifier)
                actual.add(modifier);
        }
        return expected.size === actual.size && Array.from(expected).every((modifier) => actual.has(modifier));
    }

    handleKeyDown = (event: KeyboardEvent): void => {
        if (event.isComposing || isEditableShortcutTarget(event.target))
            return;
        const size = this.pressedCodes.size;
        this.pressedCodes.add(event.code);
        if (this.pressedCodes.size !== size)
            this.pressedStateVersion += 1;
    };

    handleKeyUp = (event: KeyboardEvent): void => {
        if (/^Meta(Left|Right)?$/i.test(event.code)) {
            this.clearPressed();
            return;
        }
        if (this.pressedCodes.delete(event.code))
            this.pressedStateVersion += 1;
    };

    clearPressed = (): void => {
        if (this.pressedCodes.size === 0)
            return;
        this.pressedCodes.clear();
        this.pressedStateVersion += 1;
    };

    reconcileModifierState = (event: PointerEvent): void => {
        const modifiers = getEventModifiers(event);
        let changed = false;

        for (const code of this.pressedCodes) {
            const modifier = modifierFromCode(code);

            if (modifier && !modifiers.has(modifier)) {
                this.pressedCodes.delete(code);
                changed = true;
            }
        }

        if (changed)
            this.pressedStateVersion += 1;
    };

    startPressedStateTracking(
        targetWindow: Window = window,
        targetDocument: Document = document,
    ): () => void {
        const onVisibilityChange = () => {
            if (targetDocument.visibilityState === 'hidden')
                this.clearPressed();
        };
        targetWindow.addEventListener('keydown', this.handleKeyDown, true);
        targetWindow.addEventListener('keyup', this.handleKeyUp, true);
        targetWindow.addEventListener('blur', this.clearPressed);
        targetWindow.addEventListener('pointerdown', this.reconcileModifierState, true);
        targetDocument.addEventListener('visibilitychange', onVisibilityChange);

        return () => {
            targetWindow.removeEventListener('keydown', this.handleKeyDown, true);
            targetWindow.removeEventListener('keyup', this.handleKeyUp, true);
            targetWindow.removeEventListener('blur', this.clearPressed);
            targetWindow.removeEventListener('pointerdown', this.reconcileModifierState, true);
            targetDocument.removeEventListener('visibilitychange', onVisibilityChange);
            this.clearPressed();
        };
    }

    async flushPendingSave(): Promise<void> {
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
            this.saveTimer = null;
        }
        const pendingSave = this.pendingSave;
        this.pendingSave = null;
        if (!pendingSave)
            return this.writeChain;

        const write = async () => {
            if (this.activeUserId === pendingSave.userId)
                runInAction(() => this.saveState = 'saving');
            try {
                if (Object.keys(pendingSave.preferences.overrides).length === 0)
                    await this.persistence.remove(pendingSave.userId);
                else
                    await this.persistence.save(pendingSave.userId, pendingSave.preferences);
                if (this.activeUserId === pendingSave.userId && !this.pendingSave && !this.saveTimer) {
                    runInAction(() => {
                        this.saveError = null;
                        this.saveState = 'saved';
                    });
                }
            } catch (error) {
                const message = errorMessage(error);
                runInAction(() => {
                    const isCurrentUser = this.activeUserId === pendingSave.userId;
                    if (isCurrentUser && (this.pendingSave || this.saveTimer))
                        return;
                    this.saveError = isCurrentUser
                        ? message
                        : `用户 ${pendingSave.userId}：${message}`;
                    if (isCurrentUser)
                        this.saveState = 'error';
                });
            }
        };
        this.writeChain = this.writeChain.then(write, write);
        return this.writeChain;
    }

    retrySave(): Promise<void> {
        if (this.loadState !== 'ready')
            return Promise.resolve();
        this.pendingSave = this.createPendingSave();
        this.saveState = 'pending';
        return this.flushPendingSave();
    }

    private resolveLoadedOverrides(
        overrides: ShortcutPreferencesV1['overrides'],
    ): Map<ShortcutActionId, ShortcutBindingOverride> {
        const resolved = new Map<ShortcutActionId, ShortcutBindingOverride>();
        for (const [rawActionId, binding] of Object.entries(overrides)) {
            const actionId = rawActionId as ShortcutActionId;
            const definition = this.definitionsById.get(actionId);
            if (!definition || !isKeyboardShortcutDefinition(definition)) {
                console.warn(`已忽略不存在的快捷键动作：${rawActionId}`);
                continue;
            }
            const expectedTrigger = resolveDefaultBinding(definition, this.platform).trigger;
            if (binding !== null
                && (!this.isSemanticallyValidBinding(binding) || binding.trigger !== expectedTrigger)) {
                console.warn(`已忽略无效快捷键覆盖项：${rawActionId}`);
                continue;
            }
            resolved.set(actionId, binding === null ? null : cloneBinding(binding));
        }

        let removedConflicts = true;
        while (removedConflicts) {
            removedConflicts = false;
            const conflictingOverrideIds = new Set<ShortcutActionId>();
            for (const definition of this.definitions) {
                if (!isKeyboardShortcutDefinition(definition))
                    continue;
                this.findConflictsAgainstOverrides(
                    definition.id,
                    this.getBindingAgainstOverrides(definition.id, resolved),
                    resolved,
                    {skipYieldingActionDefault: true, skipYieldingCandidateDefault: true},
                ).forEach((conflict) => {
                    if (resolved.has(definition.id))
                        conflictingOverrideIds.add(definition.id);
                    if (resolved.has(conflict.actionId))
                        conflictingOverrideIds.add(conflict.actionId);
                });
            }
            conflictingOverrideIds.forEach((actionId) => {
                console.warn(`已忽略冲突的快捷键覆盖项：${actionId}`);
                resolved.delete(actionId);
                removedConflicts = true;
            });
        }
        return resolved;
    }

    private applyResolvedOverrides(loadedOverrides: Map<ShortcutActionId, ShortcutBindingOverride>): void {
        this.overrides.clear();
        loadedOverrides.forEach((binding, actionId) => this.overrides.set(actionId, binding));
    }

    private getBindingAgainstOverrides(
        actionId: ShortcutActionId,
        overrides: ReadonlyMap<ShortcutActionId, ShortcutBindingOverride>,
    ): ShortcutBindingOverride {
        const definition = this.definitionsById.get(actionId);
        if (!definition || !isKeyboardShortcutDefinition(definition))
            return null;
        if (overrides.has(actionId))
            return overrides.get(actionId) ?? null;
        return resolveDefaultBinding(definition, this.platform);
    }

    private findConflictsAgainstOverrides(
        actionId: ShortcutActionId,
        binding: ShortcutBindingOverride,
        overrides: ReadonlyMap<ShortcutActionId, ShortcutBindingOverride>,
        options: {skipYieldingActionDefault: boolean; skipYieldingCandidateDefault: boolean} = {
            skipYieldingActionDefault: false,
            skipYieldingCandidateDefault: true,
        },
    ): ShortcutConflict[] {
        if (!binding)
            return [];
        const definition = this.definitionsById.get(actionId);
        if (!definition || !isKeyboardShortcutDefinition(definition))
            return [];
        if (options.skipYieldingActionDefault
            && definition.defaultPriority === 'yield-to-custom'
            && !overrides.has(actionId))
            return [];

        const bindingKey = getShortcutBindingConflictKey(binding, this.platform);
        return this.definitions.flatMap((candidate) => {
            if (candidate.id === actionId || !isKeyboardShortcutDefinition(candidate))
                return [];
            const candidateYields = options.skipYieldingCandidateDefault
                && candidate.defaultPriority === 'yield-to-custom'
                && !overrides.has(candidate.id);
            if (candidateYields)
                return [];
            const candidateBinding = this.getBindingAgainstOverrides(candidate.id, overrides);
            if (!candidateBinding
                || bindingKey !== getShortcutBindingConflictKey(candidateBinding, this.platform)
                || !shortcutContextsOverlap(definition.contexts, candidate.contexts))
                return [];
            return [{actionId: candidate.id, label: candidate.label}];
        });
    }

    private isSemanticallyValidBinding(binding: ShortcutBinding): boolean {
        if (!isShortcutBinding(binding))
            return false;
        if (binding.key.kind === 'modifier' && binding.trigger !== 'hold')
            return false;
        if (binding.trigger === 'press' && shortcutBindingToHotkeys(binding, this.platform) === null)
            return false;

        const keyToken = getResolvedShortcutKeyToken(binding.key, this.platform);
        if (!keyToken.startsWith('modifier:'))
            return true;
        const keyModifier = keyToken.slice('modifier:'.length);
        return !resolveShortcutModifiers(binding.modifiers, this.platform).includes(keyModifier as 'control' | 'meta' | 'alt' | 'shift');
    }

    private matchesPress(binding: ShortcutBinding, event: KeyboardEvent): boolean {
        if (binding.key.kind !== 'code' || event.code !== binding.key.code)
            return false;
        const expected = resolveShortcutModifiers(binding.modifiers, this.platform);
        const actual = getEventModifiers(event);
        return expected.length === actual.size && expected.every((modifier) => actual.has(modifier));
    }

    private matchesHold(binding: ShortcutBinding, event?: ShortcutActivationEvent): boolean {
        const requiredModifiers = resolveShortcutModifiers(binding.modifiers, this.platform);
        if (!requiredModifiers.every((modifier) => this.isModifierPressed(modifier, event)))
            return false;

        if (binding.key.kind === 'modifier') {
            const modifier = resolveShortcutModifier(binding.key.modifier, this.platform);
            return this.isModifierPressed(modifier, event);
        }

        if (event instanceof KeyboardEvent && event.code === binding.key.code)
            return true;
        return this.pressedCodes.has(binding.key.code);
    }

    private isModifierPressed(
        modifier: 'control' | 'meta' | 'alt' | 'shift',
        event?: ShortcutActivationEvent,
    ): boolean {
        if (event && getEventModifiers(event).has(modifier))
            return true;
        return Array.from(this.pressedCodes).some((code) => modifierFromCode(code) === modifier);
    }

    private scheduleSave(): void {
        this.pendingSave = this.createPendingSave();
        this.saveState = 'pending';
        this.saveError = null;
        if (this.saveTimer)
            clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => void this.flushPendingSave(), this.saveDelayMs);
    }

    private createPendingSave(): PendingSave {
        const overrides: ShortcutPreferencesV1['overrides'] = {};
        this.overrides.forEach((binding, actionId) => {
            overrides[actionId] = binding === null ? null : cloneBinding(binding);
        });
        return {
            userId: this.activeUserId,
            preferences: {version: 1, updatedAt: Date.now(), overrides},
        };
    }
}

function modifierFromCode(code: string): 'control' | 'meta' | 'alt' | 'shift' | null {
    if (/^Control(Left|Right)?$/i.test(code))
        return 'control';
    if (/^Meta(Left|Right)?$/i.test(code))
        return 'meta';
    if (/^Alt(Left|Right)?$/i.test(code))
        return 'alt';
    if (/^Shift(Left|Right)?$/i.test(code))
        return 'shift';
    return null;
}

const shortcutStore = new ShortcutStore();

export default shortcutStore;
