/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {useEffect, useRef, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import 'nprogress/nprogress.css';
import '@/designer/style/DesignerGlobalStyle.less';
import DesignerLeft from "@/designer/left/DesignerLeft";
import DesignerRight from "@/designer/right/DesignerRight";
import DesignerFooter from "@/designer/footer/DesignerFooter";
import contextMenuStore from "@/designer/event/ContextMenuStore.ts";
import eventOperateStore from "@/designer/operate-provider/EventOperateStore";
import DesignerHeader from "@/designer/header/DesignerHeader";
import DesignerCanvas from "@/designer/canvas/DesignerCanvas";
import {observer} from "mobx-react";
import {Loading} from "@datavisool/ui";
import '@/global/ExportEditGlobalMember.ts';
import {doPaste} from "@/designer/operate-provider/hot-key/HotKeyImpl.ts";
import EditDesignerLoader from "@/designer/loader/EditDesignerLoader.ts";
import {stopAutoSave} from "@/designer/footer/auto-save/AutoSaveManager.ts";
import {DesignerMode} from "@datavisool/sdk/types";
import DesignerLoader from "@/designer/loader/DesignerLoader.ts";
import designerHeaderStore from "@/designer/header/DesignerHeaderStore.ts";
import AuthTools from "@/util/AuthTools.ts";
import shortcutStore from "@/designer/operate-provider/hot-key/ShortcutStore.ts";
import DesignerWorkspaceShell from "@/designer/workspace/DesignerWorkspaceShell.tsx";
import footerStore from "@/designer/footer/FooterStore.ts";


/*****************事件处理*****************/
const clickHandler = (event: MouseEvent) => {
    const {canvasMenuVisible, bpMenuVisible, updateBpMenuVisible, updateCanvasMenuVisible} = contextMenuStore;
    if (event.button === 0) {
        //这里添加异步处理的原因：必须要在操作菜单执行点击事件执行之后才能卸载dom元素，不然操作菜单的点击事件会失效。
        if (canvasMenuVisible || bpMenuVisible) {
            const tempTimer = setTimeout(() => {
                canvasMenuVisible && updateCanvasMenuVisible(false);
                bpMenuVisible && updateBpMenuVisible(false);
                clearTimeout(tempTimer);
            });
        }
    }
}

const contextMenuHandler = (event: MouseEvent) => {
    const {
        hideMenus,
        consumeSuppressedContextMenu,
        rightDragActive,
        requestCanvasMenu,
        requestBpMenu,
    } = contextMenuStore;
    if (rightDragActive || consumeSuppressedContextMenu()) {
        event.preventDefault();
        hideMenus();
        return;
    }
    if (designerHeaderStore.currentKey === 'blue-print') {//蓝图设计器
        const {bluePrintManager} = window.DATAVISOOL_ENV.currentManager;
        if (bluePrintManager) {
            const bpCanvas = document.querySelector(".blue-print-canvas")!;
            if (!bpCanvas || !bpCanvas?.contains(event.target as HTMLElement))
                return;
            event.preventDefault();
            requestBpMenu([event.clientX, event.clientY]);
        }
    } else {//主设计器
        //由于mac端下 setPointerCapture(e.pointerId); 会导致事件target指向发生变化，进而导致右键菜单失效，因此调整为只要选中了元素，且在主画布范围内均可显示右键菜单
        const eventContainer = document.querySelector('.datavisool-event-container');
        const layerListContainer = document.querySelector('.layer-items');
        if (eventContainer?.contains(event.target as HTMLElement) || layerListContainer?.contains(event.target as HTMLElement)) {
            event.preventDefault();
            requestCanvasMenu([event.clientX, event.clientY]);
        } else {
            hideMenus();
        }
    }
}

const pointerUpHandler = (event: PointerEvent) => {
    const {setPointerTarget} = contextMenuStore;
    setPointerTarget(event.target as HTMLElement);
}

const doWheelHandler = (e: WheelEvent) => {
    //设计器编辑页面禁用缩放
    if (e.ctrlKey)
        e.preventDefault();
}

// 由于浏览器的限制，control v粘贴只能在https场景下才能调用新的API获取剪切板数据，而历史的document.execCommand('paste');方式也失效，
// 因此改为通过监听paste事件的方式读取剪贴板数据并进行组件的粘贴动作。
const doPasteHandler = (e: ClipboardEvent) => {
    doPaste(e.clipboardData?.getData('text/plain') ?? '');
}

const Designer = observer((props: { id: string }) => {

    const loaderRef = useRef<DesignerLoader>(new EditDesignerLoader(DesignerMode.EDIT));
    const [failedLoad, setFailedLoad] = useState<{id: string; attempt: number} | null>(null);
    const [reloadAttempt, setReloadAttempt] = useState(0);
    const navigate = useNavigate();
    const loadFailed = failedLoad?.id === props.id && failedLoad.attempt === reloadAttempt;

    useEffect(() => {
        void shortcutStore.initialize(AuthTools.getUserId() ?? 'anonymous').catch((error) => {
            console.warn('初始化用户快捷键失败', error);
        });
    }, []);

    useEffect(() => {
        let disposed = false;
        const loader = loaderRef.current;
        loader?.cancelLoad();
        stopAutoSave();
        footerStore.resetSaveState();
        eventOperateStore.reset();
        contextMenuStore.reset();
        loader?.load(props.id).then(() => {
            if (disposed)
                return;
            if (loaderRef.current?.projectInfo?.name)
                document.title = loaderRef.current?.projectInfo?.name
            //绑定事件到dom元素
            document.addEventListener("click", clickHandler);
            document.addEventListener("contextmenu", contextMenuHandler);
            document.addEventListener("pointerup", pointerUpHandler);
            document.addEventListener("paste", doPasteHandler);
            document.addEventListener("wheel", doWheelHandler, {passive: false}); //标示为浏览器非被动事件，必须在事件处理完毕后再判断是否执行默认动作，此处只执行简单逻辑，无性能损耗
        }).catch((error) => {
            if (disposed)
                return;
            console.error('加载编辑器项目失败', error);
            if (!loader?.loaded)
                setFailedLoad({id: props.id, attempt: reloadAttempt});
        });
        window.DATAVISOOL_ENV.editorLoader = loader;
        return () => {
            disposed = true;
            loader?.cancelLoad();
            eventOperateStore.reset();
            contextMenuStore.reset();
            stopAutoSave();
            //卸载dom元素上的事件
            document.removeEventListener("click", clickHandler);
            document.removeEventListener("contextmenu", contextMenuHandler);
            document.removeEventListener("pointerup", pointerUpHandler);
            document.removeEventListener("wheel", doWheelHandler);
            document.removeEventListener("paste", doPasteHandler);
        }
    }, [props.id, reloadAttempt]);

    const {loaded} = loaderRef.current;
    if (!loaded && loadFailed)
        return (
            <main className="designer-load-error" role="alert">
                <div className="designer-load-error-content">
                    <h1>项目加载失败</h1>
                    <p>无法打开此项目，请重试或返回首页。</p>
                    <div className="designer-load-error-actions">
                        <button type="button" className="designer-load-error-primary"
                                onClick={() => {
                                    loaderRef.current = new EditDesignerLoader(DesignerMode.EDIT);
                                    setReloadAttempt((attempt) => attempt + 1);
                                }}>重试</button>
                        <button type="button" onClick={() => navigate('/home')}>返回首页</button>
                    </div>
                </div>
            </main>
        );
    if (!loaded)
        return <Loading/>;
    return (
        <div className={'datavisool-designer datavisool-designer-main-editor'} style={{height: '100%', overflow: 'hidden'}}>
            <DesignerWorkspaceShell header={<DesignerHeader/>}
                                    left={<DesignerLeft/>}
                                    canvas={<DesignerCanvas/>}
                                    right={<DesignerRight/>}
                                    footer={<DesignerFooter/>}/>
        </div>
    );
})

export default Designer;
