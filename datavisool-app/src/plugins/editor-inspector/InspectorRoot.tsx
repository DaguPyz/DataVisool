/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {lazy, Suspense, useEffect, useState} from 'react';
import {observer} from 'mobx-react';
import type {EditorInspectorDomain} from '@datavisool/sdk/plugin/contracts/editorInspector';
import type {EditorSidePanel} from '@datavisool/sdk/plugin/contracts/editorShell';
import {useEditorScene} from '@/shared/designer/EditorWorkspaceContext.ts';
import type {InspectorStore} from './InspectorStore.ts';

const DesignerRight = lazy(() => import('./DesignerRight.tsx'));

export interface InspectorRootProps {
    readonly prepareDomain: () => Promise<EditorInspectorDomain>;
    readonly closePanel: EditorSidePanel['close'];
    readonly store: InspectorStore;
    readonly trackTask: <T>(task: Promise<T>) => Promise<T>;
}

const InspectorRoot = observer(({prepareDomain, closePanel, store, trackTask}: InspectorRootProps) => {
    const scene = useEditorScene();
    const [domain, setDomain] = useState<EditorInspectorDomain>();

    useEffect(() => {
        let active = true;
        if (!scene) {
            setDomain(undefined);
            return () => { active = false; };
        }
        if (!store.isAccepting) return () => { active = false; };
        if (domain?.sceneIdentity === scene.identity && domain.sceneVersion === scene.version && domain.isActive())
            return () => { active = false; };
        if (!store.panelOpen && !store.activeElem.id) return () => { active = false; };
        void prepareDomain().then(next => {
            if (active && next.isActive() && next.sceneIdentity === scene.identity && next.sceneVersion === scene.version)
                setDomain(next);
        }).catch(error => {
            if (active && (error as Error)?.name !== 'AbortError') console.error('准备属性面板数据失败', error);
        });
        return () => { active = false; };
    }, [prepareDomain, scene, store, store.lifecycleRevision, store.panelOpen, store.activeElem.id, domain]);

    if (!scene || !domain || domain.sceneIdentity !== scene.identity || domain.sceneVersion !== scene.version || !domain.isActive())
        return null;
    return <Suspense fallback={null}>
        <DesignerRight domain={domain} closePanel={closePanel} store={store} trackTask={trackTask}/>
    </Suspense>;
});

export default InspectorRoot;
