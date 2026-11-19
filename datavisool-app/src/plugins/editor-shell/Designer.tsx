/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {Suspense, useEffect, useState} from 'react';
import type {EditorProjectActions, EditorProjectFeature} from '@datavisool/sdk/plugin/contracts/editorProject';
import {EditorProjectContext} from '@/shared/designer/EditorProjectContext.ts';
import {EditorShellContext} from '@/shared/designer/EditorShellContext.ts';
import {EditorCommandContext} from '@/shared/designer/EditorCommandContext.ts';
import type {EditorCommandService} from '@datavisool/sdk/plugin/contracts/editorCommands';
import {EditorWorkspaceContext} from '@/shared/designer/EditorWorkspaceContext.ts';
import type {EditorCanvasContribution, EditorDockPanel, EditorShellService, EditorToolbarItem, EditorViews} from '@datavisool/sdk/plugin/contracts/editorShell';
import type {OpenEditorOverlay} from './OpenEditorOverlay.ts';
import type {DesignerProjectSession, DesignerSessionFactory} from '@datavisool/sdk/plugin/contracts/designerRuntime';
import 'nprogress/nprogress.css';
import './styles/DesignerGlobalStyle.less';
import DesignerLeft from "./dock/DesignerLeft.tsx";
import {DesignerDockContext} from "./dock/DesignerDockContext.ts";
import type {DesignerDockState} from "./dock/DesignerDockState.ts";
import DesignerHeader from './header/DesignerHeader.tsx';
import {observer} from "mobx-react";
import {Loading} from "@datavisool/ui";
import DesignerWorkspaceShell from './DesignerWorkspaceShell.tsx';

const doWheelHandler = (e: WheelEvent) => {
    //设计器编辑页面禁用缩放
    if (e.ctrlKey)
        e.preventDefault();
}

interface DesignerProps {
    id: string;
    createSession: DesignerSessionFactory;
    projectFeature: EditorProjectFeature;
    returnHome(): Promise<void>;
    getCanvas(): EditorCanvasContribution | undefined;
    getDockPanels(): readonly EditorDockPanel[];
    getViews(): Partial<EditorViews>;
    getOverlays(): readonly OpenEditorOverlay[];
    getToolbarItems(): readonly EditorToolbarItem[];
    shell: EditorShellService;
    commands: EditorCommandService;
    dock: DesignerDockState;
}

const Designer = observer(({id, createSession, projectFeature, returnHome, getCanvas, getDockPanels, getViews, getOverlays, getToolbarItems, shell, commands, dock}: DesignerProps) => {
    const {createActions} = projectFeature;
    const [project, setProject] = useState<{session: DesignerProjectSession; actions: EditorProjectActions}>();
    const [loadFailed, setLoadFailed] = useState(false);
    const [reloadAttempt, setReloadAttempt] = useState(0);

    useEffect(() => {
        let disposed = false;
        const session = createSession();
        const actions = createActions(id, session);
        setProject({session, actions});
        void session.load(id).then(() => {
            if (disposed)
                return;
            if (session.name) document.title = session.name;
            if (session.loaded) actions.start();
            //绑定事件到dom元素
            document.addEventListener("wheel", doWheelHandler, {passive: false}); //标示为浏览器非被动事件，必须在事件处理完毕后再判断是否执行默认动作，此处只执行简单逻辑，无性能损耗
        }).catch((error) => {
            if (disposed)
                return;
            console.error('加载编辑器项目失败', error);
            if (!session.loaded) setLoadFailed(true);
        });
        return () => {
            disposed = true;
            const errors: unknown[] = [];
            const cleanups = [
                () => actions.close(),
                ...getOverlays().map(overlay => overlay.onClose),
                () => document.removeEventListener('wheel', doWheelHandler),
                () => session.close(),
            ];
            for (const cleanup of cleanups) {
                try { cleanup(); } catch (error) { errors.push(error); }
            }
            if (errors.length) console.error(new AggregateError(errors, '释放编辑器失败'));
        }
    }, [createSession, createActions, id, reloadAttempt, getOverlays, shell]);

    const loaded = project?.session.loaded;
    if (!loaded && loadFailed)
        return (
            <main className="designer-load-error" role="alert">
                <div className="designer-load-error-content">
                    <h1>项目加载失败</h1>
                    <p>无法打开此项目，请重试或返回首页。</p>
                    <div className="designer-load-error-actions">
                        <button type="button" className="designer-load-error-primary"
                                onClick={() => {
                                    setLoadFailed(false);
                                    setReloadAttempt((attempt) => attempt + 1);
                                }}>重试</button>
                        <button type="button" onClick={() => void returnHome()}>返回首页</button>
                    </div>
                </div>
            </main>
        );
    if (!project?.session.loaded)
        return <Loading/>;
    const canvas = getCanvas();
    const {inspector: Inspector, inspectorAction: InspectorAction, projectActions: ProjectActions,
        shortcuts: Shortcuts, layerSearch: LayerSearch,
        assistant, canvasDraft: CanvasDraft} = getViews();
    return (
        <DesignerDockContext.Provider value={dock}>
        <EditorShellContext.Provider value={shell}>
        <EditorCommandContext.Provider value={commands}>
        <EditorWorkspaceContext.Provider value={project.session.editing}>
        <EditorProjectContext.Provider value={project.actions}>
            <div className={'datavisool-designer datavisool-designer-main-editor'} style={{height: '100%', overflow: 'hidden'}}>
                <DesignerWorkspaceShell header={<DesignerHeader items={getToolbarItems()} actions={ProjectActions && <Suspense><ProjectActions/></Suspense>}/>}
                                        left={<DesignerLeft panels={getDockPanels()} assistant={assistant}/>}
                                        canvas={canvas && <Suspense fallback={<Loading/>}><canvas.Canvas project={project.session} overlay={CanvasDraft && <Suspense><CanvasDraft/></Suspense>}/></Suspense>}
                                        zoomControls={canvas && <Suspense><canvas.ZoomControls/></Suspense>}
                                        right={Inspector && <Suspense><Inspector/></Suspense>}
                                        footer={canvas?.Footer && <Suspense><canvas.Footer inspectorAction={InspectorAction && <Suspense><InspectorAction/></Suspense>}/></Suspense>}/>
                {getOverlays().map(({instanceId, View, onClose}) => <Suspense key={instanceId} fallback={<Loading/>}>
                    <View onClose={onClose} project={project.session}/>
                </Suspense>)}
                {Shortcuts && <Suspense><Shortcuts/></Suspense>}
                {LayerSearch && <Suspense><LayerSearch/></Suspense>}
            </div>
        </EditorProjectContext.Provider>
        </EditorWorkspaceContext.Provider>
        </EditorCommandContext.Provider>
        </EditorShellContext.Provider>
        </DesignerDockContext.Provider>
    );
})

export default Designer;
