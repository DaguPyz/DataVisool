/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import MenuList from './MenuList.tsx';
import ConfigContent from './ConfigContent.tsx';
import {observer} from 'mobx-react';
import './DesignerRight.less';
import {subscribeLocaleChange} from '@/i18n/miniI18n.ts';
import {useEffect, useRef} from 'react';
import type {KeyboardEvent} from 'react';
import type {EditorInspectorDomain} from '@datavisool/sdk/plugin/contracts/editorInspector';
import type {EditorSidePanel} from '@datavisool/sdk/plugin/contracts/editorShell';
import type {InspectorStore} from './InspectorStore.ts';

const DesignerRight = observer(({domain, closePanel, store, trackTask}: {
    domain: EditorInspectorDomain;
    closePanel: EditorSidePanel['close'];
    store: InspectorStore;
    trackTask<T>(task: Promise<T>): Promise<T>;
}) => {
    const {activeElem, panelOpen, focusActiveMenuTrigger, consumeMenuFocusRestore} = store;
    const wasPanelOpenRef = useRef(panelOpen);
    const focusRestoreRef = useRef<{kind: 'animation'; id: number} | {kind: 'timeout'; id: number} | undefined>();

    useEffect(() => subscribeLocaleChange(() => {
        const activeId = store.activeElem.id;
        const target = activeId && domain.readTarget(activeId);
        if (target) store.refreshTarget(target);
    }), [domain, store]);

    const cancelPendingFocusRestore = () => {
        const pending = focusRestoreRef.current;
        if (pending?.kind === 'animation') window.cancelAnimationFrame(pending.id);
        else if (pending) window.clearTimeout(pending.id);
        focusRestoreRef.current = undefined;
    };

    useEffect(() => store.registerPauseCleanup(cancelPendingFocusRestore), [store]);

    useEffect(() => {
        if (!store.isAccepting) {
            cancelPendingFocusRestore();
            return;
        }
        if (wasPanelOpenRef.current && !panelOpen && consumeMenuFocusRestore()) {
            const focus = () => {
                focusRestoreRef.current = undefined;
                if (!store.panelOpen) focusActiveMenuTrigger();
            };
            if (typeof window.requestAnimationFrame === 'function')
                focusRestoreRef.current = {kind: 'animation', id: window.requestAnimationFrame(focus)};
            else focusRestoreRef.current = {kind: 'timeout', id: window.setTimeout(focus, 0)};
        }
        wasPanelOpenRef.current = panelOpen;
        return cancelPendingFocusRestore;
    }, [consumeMenuFocusRestore, focusActiveMenuTrigger, panelOpen, store, store.isAccepting]);

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (!store.isAccepting) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        if (event.key !== 'Escape' || !panelOpen) return;
        const target = event.target as HTMLElement;
        if (target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="listbox"], [role="option"], [aria-haspopup="listbox"], .datavisool-select-panel, .datavisool-searchable-select-panel, .datavisool-dropdown-popup, [data-escape-boundary]')) return;
        event.preventDefault();
        event.stopPropagation();
        closePanel(true);
    };

    return (
        <div className="designer-right" data-viewport-ui="" onKeyDown={handleKeyDown}>
            {activeElem.id && <>
                {panelOpen && <ConfigContent key={`${domain.sceneVersion}:${store.configRevision}`} domain={domain} store={store} trackTask={trackTask}/>}
                <MenuList store={store}/>
            </>}
        </div>
    );
});

export default DesignerRight;
