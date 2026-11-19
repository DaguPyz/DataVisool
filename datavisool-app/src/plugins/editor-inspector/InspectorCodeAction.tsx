/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {CodeBrackets} from '@icon-park/react';
import {globalMessage} from '@datavisool/ui';
import {observer} from 'mobx-react';
import {useCallback, useEffect, useRef, useState} from 'react';
import {useEditorScene} from '@/shared/designer/EditorWorkspaceContext.ts';
import type {EditorCanvasService} from '@datavisool/sdk/plugin/contracts/editorCanvas';
import type {EditorInspectorDomain} from '@datavisool/sdk/plugin/contracts/editorInspector';
import type {InspectorStore} from './InspectorStore.ts';
import {tx} from '@/i18n/miniI18n.ts';
import ConfigCode from './config-code/ConfigCode.tsx';

const SceneCodeAction = observer(({canvas, prepareDomain, store, accepting}: {canvas: EditorCanvasService; prepareDomain(): Promise<EditorInspectorDomain>; store: InspectorStore; accepting: boolean}) => {
    const [domain, setDomain] = useState<EditorInspectorDomain>();
    const request = useRef(0);
    const {ids: targetIds} = canvas.readSelection();
    const canEdit = () => store.isAccepting;
    useEffect(() => {
        if (!accepting) request.current++;
    }, [accepting]);
    useEffect(() => () => { request.current++; }, []);
    const close = useCallback(() => { request.current++; setDomain(undefined); }, []);
    const open = () => {
        if (!canEdit()) return;
        if (targetIds.length === 1 && canvas.getLayerType(targetIds[0]) !== 'group') {
            const id = targetIds[0];
            const generation = ++request.current;
            void prepareDomain().then(next => {
                const current = canvas.readSelection().ids;
                if (generation === request.current && canEdit() && next.isActive() && current.length === 1 && current[0] === id)
                    setDomain(next);
            }).catch(error => {
                if (generation === request.current && (error as Error)?.name !== 'AbortError') console.error('准备组件代码配置失败', error);
            });
        } else {
            globalMessage.messageApi?.info(tx('请选择组件后进行操作'));
        }
    };

    return <>
        <button type="button" className="workspace-icon-button workspace-footer-button" disabled={!accepting}
                aria-label="以代码编辑组件配置" title="以代码编辑组件配置" onClick={open}>
            <CodeBrackets theme="outline" size={18}/>
        </button>
        {domain && <ConfigCode targetIds={targetIds} domain={domain} canEdit={canEdit} onClose={close}/>}
    </>;
});

const InspectorCodeAction = observer(({canvas, prepareDomain, store}: {canvas: EditorCanvasService; prepareDomain(): Promise<EditorInspectorDomain>; store: InspectorStore}) => {
    const scene = useEditorScene();
    const accepting = store.isAccepting;
    return scene ? <SceneCodeAction key={scene.version} canvas={canvas} prepareDomain={prepareDomain} store={store} accepting={accepting}/> : null;
});

export default InspectorCodeAction;
