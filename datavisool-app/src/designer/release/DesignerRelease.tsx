/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {lazy, Suspense, useEffect, useState} from 'react';
import type {DesignerProjectSession, DesignerSessionFactory} from '@datavisool/sdk/plugin/contracts/designerRuntime';
import './DesignerRelease.less';
import {observer} from "mobx-react";
import ScaleAction from "@/framework/core/ScaleAction.ts";
import {Button, globalMessage, globalModal, Input, Loading} from "@datavisool/ui";
import FetchUtil from "@/util/FetchUtil.ts";

const ScreenFit = lazy(() => import('@/framework/screen-fit/ScreenFit.tsx'));

const DesignerRelease = observer(({id, createSession}: {id: string; createSession: DesignerSessionFactory}) => {
    const [project, setProject] = useState<DesignerProjectSession>();

    useEffect(() => {
        const controller = new AbortController();
        const session = createSession();
        let password = '';
        let modalId: string | undefined;
        setProject(session);

        const closeModal = () => {
            if (modalId) globalModal.modalApi?.destroy(modalId);
            modalId = undefined;
        };
        const load = async (confirmedPassword?: string) => {
            try {
                await session.load(id, confirmedPassword);
                if (controller.signal.aborted || !session.loaded) return;
                if (confirmedPassword && session.name) document.title = session.name;
                closeModal();
            } catch (error) {
                if (!controller.signal.aborted) console.error('加载发布项目失败', error);
            }
        };

        void FetchUtil.get<{encrypt: boolean} | null>(`/api/release/getReleaseInfo/${id}`, {signal: controller.signal}).then(info => {
            if (controller.signal.aborted || !info) return;
            if (!info.encrypt) {
                void load();
                return;
            }
            modalId = globalModal.modalApi?.confirm({
                title: '密码校验',
                closable: false,
                maskClosable: false,
                keyboard: false,
                content: <div style={{padding: '10px 0px'}}>
                    <Input placeholder="请修输入密码" type="password" onChange={value => { password = value; }}/>
                </div>,
                footer: [
                    <div style={{textAlign: 'right'}} key="confirm">
                        <Button type="primary" onClick={() => {
                            if (password) void load(password);
                            else globalMessage.messageApi?.warning('请输入密码');
                        }}>确认</Button>
                    </div>
                ],
            });
        }).catch(error => {
            if (!controller.signal.aborted) console.error('获取发布项目信息失败', error);
        });

        return () => {
            controller.abort();
            closeModal();
            session.close();
        };
    }, [createSession, id]);

    if (!project?.loaded) return <Loading/>;

    const {width, height, adaptationType, filterStyle, content} = project.renderCanvas();
    const canvasDom = <div className="datavisool-project-release" data-datavisool-i18n-skip="true" style={{width, height, ...filterStyle}}>
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

export default DesignerRelease;
