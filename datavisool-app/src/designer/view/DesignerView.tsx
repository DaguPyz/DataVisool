/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {lazy, Suspense, useEffect, useRef} from 'react';
import './DesignerView.less';
import {observer} from "mobx-react";
import ScaleAction from "@/framework/core/ScaleAction.ts";
import canvasRender from "@/designer/left/layer-list/CanvasRender.ts";
import '@/global/ExportViewGlobalMember.ts';
import {Loading} from "@datavisool/ui";
import ViewDesignerLoader from "@/designer/loader/ViewDesignerLoader.ts";
import {DesignerMode} from "@datavisool/sdk/types";


const ScreenFit = lazy(() => import('@/framework/screen-fit/ScreenFit.tsx'));

export interface DesignerViewProps {
    id: string;
}

const DesignerView = observer((props: DesignerViewProps) => {

    const loaderRef = useRef(new ViewDesignerLoader(DesignerMode.PREVIEW));

    useEffect(() => {
        loaderRef.current?.load(props.id).then(() => {
            if (loaderRef.current?.projectInfo?.name)
                document.title = loaderRef.current?.projectInfo.name
        })
    }, [props.id]);

    if (!loaderRef.current?.loaded)
        return <Loading/>;

    const {canvasConfig: {width, height, adaptationType}} = loaderRef.current.designerManager.canvasManager;
    const globalFilter = loaderRef.current.designerManager.globalFilterManger.getFilterStyle();
    const canvasDom = <div className="datavisool-project-view" data-datavisool-i18n-skip="true" style={{width, height, ...globalFilter}}>
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

export default DesignerView;
