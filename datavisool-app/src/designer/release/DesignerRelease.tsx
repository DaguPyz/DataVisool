/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {lazy, Suspense, useEffect, useRef} from 'react';
import './DesignerRelease.less';
import {observer} from "mobx-react";
import ScaleAction from "@/framework/core/ScaleAction.ts";
import canvasRender from "@/designer/left/layer-list/CanvasRender.ts";
import '@/global/ExportViewGlobalMember.ts';
import {Button, globalMessage, globalModal, Input, Loading} from "@datavisool/ui";
import ReleaseDesignerLoader from "@/designer/loader/ReleaseDesignerLoader.ts";
import {DesignerMode} from "@datavisool/sdk/types";
import FetchUtil from "@/util/FetchUtil.ts";

const ScreenFit = lazy(() => import('@/framework/screen-fit/ScreenFit.tsx'));

const DesignerRelease = observer((props: { id: string }) => {

    const pwdRef = useRef<string | null>(null);
    const modalRef = useRef<string>();
    const loaderRef = useRef(new ReleaseDesignerLoader(DesignerMode.RELEASE));

    useEffect(() => {
        FetchUtil.get<any>(`/api/release/getReleaseInfo/${props.id}`).then(res => {
            if (res !== null) {
                if (res.encrypt) {
                    modalRef.current = globalModal.modalApi?.confirm({
                        title: '密码校验',
                        closable: false,
                        maskClosable: false,
                        keyboard: false,
                        content: <div style={{padding: '10px 0px'}}>
                            <Input placeholder={'请修输入密码'} type="password"
                                   onChange={(value) => pwdRef.current = value}/></div>,
                        footer: [
                            <div style={{textAlign: 'right'}} key={'confirm'}>
                                <Button type="primary" onClick={() => {
                                    if (!pwdRef.current) {
                                        globalMessage.messageApi?.warning('请输入密码');
                                    } else {
                                        loaderRef.current.pwd = pwdRef.current;
                                        loaderRef.current.load(props.id).then(() => {
                                            if (loaderRef.current?.projectInfo?.name)
                                                document.title = loaderRef.current.projectInfo.name
                                        });
                                    }
                                }}>确认</Button>
                            </div>
                        ]
                    });
                } else {
                    loaderRef.current.load(props.id);
                }
            }
        })
    }, [props.id]);

    if (!loaderRef.current.loaded)
        return <Loading/>;

    if (modalRef.current) {
        const tempTimer = setTimeout(() => {
            globalModal.modalApi?.destroy(modalRef.current);
            clearTimeout(tempTimer)
        }, 0);
    }
    const {canvasConfig: {width, height, adaptationType}} = loaderRef.current.designerManager.canvasManager;
    const globalFilter = loaderRef.current.designerManager.globalFilterManger.getFilterStyle();
    const canvasDom = <div className="datavisool-project-release" data-datavisool-i18n-skip="true" style={{width, height, ...globalFilter}}>
        {canvasRender.buildCanvasComponents(loaderRef.current.designerManager)}</div>;
    return (
        <Suspense fallback={<Loading/>}>
            {adaptationType && adaptationType === 'none' ? canvasDom :
                <ScreenFit width={width!} height={height!} mode={adaptationType}
                           scaleChange={(xScale, yScale) => {
                               ScaleAction.doScale(xScale, yScale)
                           }}>
                    {canvasDom}
                </ScreenFit>}
        </Suspense>
    );
});

export default DesignerRelease;
