/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {EditorInspectorDomain} from '@datavisool/sdk/plugin/contracts/editorInspector';
import type {EditorSelectionChange} from '@datavisool/sdk/plugin/contracts/editorCanvas';
import type {InspectorStore} from './InspectorStore.ts';

function activate(domain: EditorInspectorDomain, id: string, source: 'canvas' | 'layer-list', store: InspectorStore) {
    if (!domain.isActive()) return;
    const target = domain.readTarget(id);
    if (!target) {
        store.clearTarget();
        return;
    }
    store.activateTarget(target, source);
    store.setStatuses(domain.readStatuses(id));
}

export function applySelectionChange({ids, interaction}: EditorSelectionChange, domain: EditorInspectorDomain, store: InspectorStore) {
    if (!domain.isActive()) return;
    if (!interaction) return;
    if (interaction.kind === 'clear-inspector') {
        store.clearTarget();
        return;
    }
    if (interaction.kind === 'inspect') {
        activate(domain, interaction.id, 'canvas', store);
        return;
    }

    const activeId = store.activeElem.id;
    if (ids.includes(interaction.id)) {
        if (interaction.id !== activeId) activate(domain, interaction.id, 'layer-list', store);
        return;
    }
    if (activeId && ids.includes(activeId)) return;
    if (ids.length === 1) {
        activate(domain, ids[0], 'layer-list', store);
        return;
    }
    store.clearTarget();
}

export function applyCanvasDoubleClick(id: string | null, domain: EditorInspectorDomain, store: InspectorStore) {
    if (!domain.isActive()) return;
    if (id === null) {
        store.clearTarget();
        return;
    }
    const target = domain.readTarget(id);
    if (!target) return;
    if (store.activeElem.id === id) {
        if (!store.panelOpen) store.setContentVisible(true);
        return;
    }
    store.activateTarget(target, 'canvas');
    store.setStatuses(domain.readStatuses(id));
}
