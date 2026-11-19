/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {lazy, Suspense, useEffect, useState} from 'react';
import type {DesignerProjectSession, DesignerSessionFactory} from '@datavisool/sdk/plugin/contracts/designerRuntime';
import './DesignerView.less';
import {observer} from "mobx-react";
import ScaleAction from "@/framework/core/ScaleAction.ts";
import {Loading} from "@datavisool/ui";


const ScreenFit = lazy(() => import('@/framework/screen-fit/ScreenFit.tsx'));

const DesignerView = observer(({id, createSession}: {id: string; createSession: DesignerSessionFactory}) => {

    const [project, setProject] = useState<DesignerProjectSession>();

    useEffect(() => {
        const session = createSession();
        let disposed = false;
        setProject(session);
        void session.load(id).then(() => {
            if (!disposed && session.name) document.title = session.name;
        }).catch(error => {
            if (!disposed) console.error('加载预览项目失败', error);
        });
        return () => {
            disposed = true;
            session.close();
        };
    }, [createSession, id]);

    if (!project?.loaded) return <Loading/>;

    const {width, height, adaptationType, filterStyle, content} = project.renderCanvas();
    const canvasDom = <div className="datavisool-project-view" data-datavisool-i18n-skip="true" style={{width, height, ...filterStyle}}>
        {content}
    </div>;

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
