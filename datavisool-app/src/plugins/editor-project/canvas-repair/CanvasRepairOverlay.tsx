/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {useEffect, useRef, useState} from 'react';
import {observer} from 'mobx-react';
import type {EditorCanvasRepairService, EditorCanvasService} from '@datavisool/sdk/plugin/contracts/editorCanvas';
import type {DesignerEditingScene} from '@datavisool/sdk/plugin/contracts/designerRuntime';
import type {EditorOverlayProps} from '@datavisool/sdk/plugin/contracts/editorShell';
import {tx} from '@/i18n/miniI18n.ts';
import {useEditorScene} from '@/shared/designer/EditorWorkspaceContext.ts';
import CanvasRepairModal from './CanvasRepairModal.tsx';

type RepairPreparation =
    | {readonly scene: DesignerEditingScene; readonly identity: object; readonly version: number; readonly state: 'loading'}
    | {readonly scene: DesignerEditingScene; readonly identity: object; readonly version: number; readonly state: 'ready'; readonly service: EditorCanvasRepairService}
    | {readonly scene: DesignerEditingScene; readonly identity: object; readonly version: number; readonly state: 'failed'; readonly error: unknown};

export function createCanvasRepairOverlay(editorCanvas: EditorCanvasService, canEdit: () => boolean) {
    return observer(({onClose}: EditorOverlayProps) => {
        const scene = useEditorScene();
        const sceneRef = useRef(scene);
        sceneRef.current = scene;
        const [attempt, setAttempt] = useState(0);
        const [preparation, setPreparation] = useState<RepairPreparation>();

        useEffect(() => {
            if (!scene) {
                setPreparation(undefined);
                return;
            }
            if (!canEdit()) {
                setPreparation({scene, identity: scene.identity, version: scene.version, state: 'failed', error: 'paused'});
                return;
            }

            const expectedScene = scene;
            const identity = scene.identity;
            const version = scene.version;
            let current = true;
            setPreparation({scene: expectedScene, identity, version, state: 'loading'});

            void Promise.resolve().then(() => current ? editorCanvas.prepareRepair() : undefined).then(service => {
                if (!service) return;
                if (!current || sceneRef.current !== expectedScene
                    || sceneRef.current?.identity !== identity || sceneRef.current?.version !== version) return;
                if (!canEdit()) {
                    setPreparation({scene: expectedScene, identity, version, state: 'failed', error: 'paused'});
                    return;
                }
                setPreparation({scene: expectedScene, identity, version, state: 'ready', service});
            }).catch(error => {
                if (!current || sceneRef.current !== expectedScene
                    || sceneRef.current?.identity !== identity || sceneRef.current?.version !== version) return;
                setPreparation({scene: expectedScene, identity, version, state: 'failed', error: canEdit() ? error : 'paused'});
            });

            return () => { current = false; };
        }, [attempt, canEdit, editorCanvas, scene]);

        if (!scene) return null;
        const state = preparation?.scene === scene
            && preparation.identity === scene.identity
            && preparation.version === scene.version
            ? preparation
            : undefined;

        if (state?.state === 'ready')
            return <CanvasRepairModal canvasRepair={state.service}
                sceneVersion={state.version} onClose={onClose} canEdit={canEdit}/>;

        const isPaused = !canEdit() || (state?.state === 'failed' && state.error === 'paused');
        const message = isPaused
            ? tx('当前画布已暂停，恢复后可以重试。')
            : state?.state === 'failed'
                ? tx('画布修复暂时无法准备，请重试。')
                : tx('正在准备画布修复…');

        return <div role={state?.state === 'failed' ? 'alert' : 'status'} aria-live="polite">
            <span>{message}</span>
            {state?.state === 'failed' && <button type="button" onClick={() => setAttempt(value => value + 1)}>{tx('重试')}</button>}
            <button type="button" onClick={onClose}>{tx('关闭')}</button>
        </div>;
    });
}
