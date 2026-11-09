/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {type RefObject, useEffect} from 'react';
import contextMenuStore from '@/designer/event/ContextMenuStore';

/** Keep body portals associated with this workspace themed and hidden with their owner. */
export function useBPPortalTheme(rootRef: RefObject<HTMLElement>) {
    useEffect(() => {
        const root = rootRef.current;
        if (!root) return;
        const ownedPopups = new Map<HTMLElement, HTMLElement>();
        const tag = (popup: HTMLElement, owner: HTMLElement) => {
            if (ownedPopups.has(popup)) return;
            popup.classList.add('bp-workspace-popup');
            popup.dataset.bpUi = '';
            ownedPopups.set(popup, owner);
        };
        const sync = () => {
            // Select and Dropdown publish the portal id on their trigger.
            root.querySelectorAll<HTMLElement>('[aria-controls]').forEach(trigger => {
                for (const id of trigger.getAttribute('aria-controls')!.split(/\s+/)) {
                    const controlled = document.getElementById(id);
                    const popup = controlled?.closest<HTMLElement>('.datavisool-select-panel, .datavisool-dropdown-popup');
                    if (popup && !root.contains(popup)) tag(popup, trigger);
                }
            });
            ownedPopups.forEach((owner, popup) => {
                if (!popup.isConnected) {
                    ownedPopups.delete(popup);
                    return;
                }
                popup.hidden = !owner.isConnected || Boolean(owner.closest('[hidden], [aria-hidden="true"]'));
            });
            // Context menus are body portals above ordinary dialogs; dismiss them
            // as soon as a modal opens so they cannot cover its input or buttons.
            if (document.querySelector('.datavisool-global-modal-card, .datavisool-code-editor-dialog'))
                contextMenuStore.hideMenus();
        };
        const bodyObserver = new MutationObserver(sync);
        bodyObserver.observe(document.body, {childList: true, subtree: true});
        const ownerObserver = new MutationObserver(sync);
        ownerObserver.observe(root, {attributes: true, subtree: true, attributeFilter: ['aria-controls', 'aria-hidden', 'hidden']});
        sync();
        return () => {
            bodyObserver.disconnect();
            ownerObserver.disconnect();
            ownedPopups.forEach((_owner, popup) => {
                popup.classList.remove('bp-workspace-popup');
                delete popup.dataset.bpUi;
                popup.hidden = false;
            });
        };
    }, [rootRef]);
}
