/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {useEffect} from 'react';
import {observer} from 'mobx-react';
import hotkeys from 'hotkeys-js';
import contextMenuStore from '@/designer/event/ContextMenuStore.ts';
import {
    getShortcutDefinition,
    isKeyboardShortcutDefinition,
} from './ShortcutRegistry.ts';
import shortcutStore from './ShortcutStore.ts';
import {isCanvasToolShortcutTarget} from './CanvasToolContext.ts';
import {
    getShortcutBindingValueKey,
    getShortcutPlatform,
    getResolvedShortcutKeyToken,
    isEditableShortcutTarget,
    shortcutBindingToHotkeys,
} from './HotKeyPlatform.ts';
import type {
    ShortcutActionId,
    ShortcutContext,
    ShortcutHandlerMap,
    ShortcutHandlerRegistration,
} from './ShortcutTypes.ts';

interface HotKeyProps {
    handlerMapping: ShortcutHandlerMap;
}

const resolveEffectiveTarget = (event: KeyboardEvent): HTMLElement | null => {
    const active = document.activeElement as HTMLElement | null;
    if (active?.tagName && !['body', 'html'].includes(active.tagName.toLowerCase()))
        return active;

    const pointerTarget = contextMenuStore.pointerTarget as HTMLElement | null;
    if (pointerTarget?.tagName && pointerTarget.isConnected && !['body', 'html'].includes(pointerTarget.tagName.toLowerCase()))
        return pointerTarget;

    const path = event.composedPath?.();
    for (const target of path ?? []) {
        const element = target as HTMLElement;
        if (element?.tagName && !['body', 'html'].includes(element.tagName.toLowerCase()))
            return element;
    }

    const eventTarget = event.target as HTMLElement | null;
    return eventTarget?.tagName ? eventTarget : active || pointerTarget || null;
};

const matchesContexts = (
    contexts: readonly ShortcutContext[],
    target: HTMLElement | null,
): boolean => {
    if (contexts.includes('designer'))
        return true;
    if (!target)
        return false;

    return contexts.some((context) => {
        if (context === 'layer-list')
            return Boolean(target.closest('.layer-items'));
        if (context === 'blueprint')
            return Boolean(target.closest('.blue-print-canvas'));
        if (context === 'canvas.tool')
            return !contextMenuStore.canvasMenuVisible
                && !contextMenuStore.bpMenuVisible
                && isCanvasToolShortcutTarget(target);
        if (context === 'canvas' || context === 'canvas.selection' || context === 'canvas.drag')
            return Boolean(target.closest('.datavisool-ruler-content'));
        return false;
    });
};

interface ShortcutActionBindingProps {
    actionId: ShortcutActionId;
    registration: ShortcutHandlerRegistration;
}

const ShortcutActionBinding = observer(({actionId, registration}: ShortcutActionBindingProps) => {
    const definition = getShortcutDefinition(actionId);
    const binding = shortcutStore.getBinding(actionId);
    const bindingValueKey = binding ? getShortcutBindingValueKey(binding) : 'disabled';

    useEffect(() => {
        const handlers = Array.isArray(registration.handler) ? registration.handler : [registration.handler];
        const disposers = handlers.map((handler) => shortcutStore.registerHandler(actionId, handler));
        return () => disposers.forEach((dispose) => dispose());
    }, [actionId, registration.handler]);

    useEffect(() => {
        if (!binding || !isKeyboardShortcutDefinition(definition))
            return undefined;

        const callback = (event: KeyboardEvent): boolean => {
            if (event.isComposing || (event.repeat && !definition.repeat))
                return true;

            const effectiveTarget = resolveEffectiveTarget(event);
            if (!definition.allowInInput && isEditableShortcutTarget(effectiveTarget))
                return true;
            if (!matchesContexts(registration.contexts, effectiveTarget))
                return true;
            const isActive = binding.trigger === 'hold'
                ? shortcutStore.isActiveWithExactModifiers(actionId, event)
                : shortcutStore.isActive(actionId, event);
            if (!isActive)
                return true;
            if (!shortcutStore.invokeHandlers(actionId, event))
                return true;
            return false;
        };

        if (binding.trigger === 'hold') {
            const onKeyDown = (event: KeyboardEvent) => {
                const bindingKeyToken = getResolvedShortcutKeyToken(binding.key, getShortcutPlatform());
                const eventKeyToken = getResolvedShortcutKeyToken({kind: 'code', code: event.code}, getShortcutPlatform());
                if (bindingKeyToken !== eventKeyToken)
                    return;
                if (event.repeat && !definition.repeat) {
                    const effectiveTarget = resolveEffectiveTarget(event);
                    if (!isEditableShortcutTarget(effectiveTarget)
                        && matchesContexts(registration.contexts, effectiveTarget)
                        && shortcutStore.isActiveWithExactModifiers(actionId, event))
                        event.preventDefault();
                    return;
                }
                if (callback(event) === false)
                    event.preventDefault();
            };
            document.addEventListener('keydown', onKeyDown, true);
            return () => document.removeEventListener('keydown', onKeyDown, true);
        }

        const shortcut = shortcutBindingToHotkeys(binding, getShortcutPlatform());
        if (!shortcut)
            return undefined;

        hotkeys(shortcut, callback);
        return () => hotkeys.unbind(shortcut, callback);
    }, [actionId, binding, bindingValueKey, definition, registration.contexts]);

    return null;
});

const HotKey = observer(({handlerMapping}: HotKeyProps) => {
    useEffect(() => {
        const previousFilter = hotkeys.filter;
        const permissiveFilter = () => true;
        hotkeys.filter = permissiveFilter;
        const stopTracking = shortcutStore.startPressedStateTracking();
        return () => {
            stopTracking();
            if (hotkeys.filter === permissiveFilter)
                hotkeys.filter = previousFilter;
        };
    }, []);

    const entries = Object.entries(handlerMapping) as Array<[ShortcutActionId, ShortcutHandlerRegistration]>;
    return <>{entries.map(([actionId, registration]) => (
        <ShortcutActionBinding
            key={actionId}
            actionId={actionId}
            registration={registration}
        />
    ))}</>;
});

export default HotKey;
