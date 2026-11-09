/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {createRef} from 'react';
import {act, renderHook} from '@testing-library/react';
import {afterEach, describe, expect, it} from 'vitest';
import contextMenuStore from '@/designer/event/ContextMenuStore';
import {useBPPortalTheme} from '@/designer/blueprint/workspace/useBPPortalTheme';

const flushMutations = () => act(async () => { await Promise.resolve(); });

describe('blueprint body portal ownership', () => {
    afterEach(() => {
        document.body.replaceChildren();
        contextMenuStore.reset();
    });

    it('themes only owned selectors and hides their popup with the still-mounted panel', async () => {
        const root = document.createElement('div');
        const panel = document.createElement('section');
        const trigger = document.createElement('button');
        trigger.setAttribute('aria-controls', 'bp-select-options');
        panel.appendChild(trigger);
        root.appendChild(panel);
        document.body.appendChild(root);
        const rootRef = createRef<HTMLElement>();
        Object.assign(rootRef, {current: root});
        const {unmount} = renderHook(() => useBPPortalTheme(rootRef));

        const ownedPopup = document.createElement('div');
        ownedPopup.className = 'datavisool-select-panel';
        ownedPopup.innerHTML = '<div id="bp-select-options"></div>';
        const otherPopup = document.createElement('div');
        otherPopup.className = 'datavisool-select-panel';
        document.body.append(ownedPopup, otherPopup);
        await flushMutations();
        expect(ownedPopup).toHaveClass('bp-workspace-popup');
        expect(ownedPopup).toHaveAttribute('data-bp-ui');
        expect(otherPopup).not.toHaveClass('bp-workspace-popup');

        panel.setAttribute('aria-hidden', 'true');
        await flushMutations();
        expect(ownedPopup.hidden).toBe(true);
        panel.setAttribute('aria-hidden', 'false');
        await flushMutations();
        expect(ownedPopup.hidden).toBe(false);

        unmount();
        expect(ownedPopup).not.toHaveClass('bp-workspace-popup');
        expect(ownedPopup).not.toHaveAttribute('data-bp-ui');
        panel.setAttribute('aria-hidden', 'true');
        await flushMutations();
        expect(ownedPopup.hidden).toBe(false);
    });

    it('dismisses a stale context menu when a modal opens above the blueprint', async () => {
        const root = document.createElement('div');
        document.body.appendChild(root);
        const {unmount} = renderHook(() => useBPPortalTheme({current: root}));
        act(() => contextMenuStore.requestBpMenu([100, 100]));
        expect(contextMenuStore.bpMenuVisible).toBe(true);
        const modal = document.createElement('div');
        modal.className = 'datavisool-global-modal-card';
        document.body.appendChild(modal);
        await flushMutations();
        expect(contextMenuStore.bpMenuVisible).toBe(false);
        unmount();
    });
});
