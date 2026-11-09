/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {Button} from "@datavisool/ui";
import {useMemo} from "react";
import "./Error.less";
import {Attention, Home, Return, UpdateRotation} from "@icon-park/react";

export interface ErrorPageProps {
    title?: string;
    description?: string;
    homePath?: string;
    errorCode?: string;
    homeText?: string;
    reloadText?: string;
    backText?: string;
    onHome?: () => void;
    onReload?: () => void;
    onBack?: () => void;
}

const buildErrorCode = () => {
    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `ERR-${stamp}-${suffix}`;
};

const defaultDescription = "我们已自动拦截这次异常，并隐藏了技术堆栈。你可以尝试重新加载页面，或返回首页继续操作。";

export default function Error(props: ErrorPageProps = {}) {
    const {
        title = "页面暂时无法正常显示",
        description = defaultDescription,
        homePath = "/home/console",
        errorCode,
        homeText = "返回首页",
        reloadText = "重新加载",
        backText = "返回上一页",
        onHome,
        onReload,
        onBack,
    } = props;

    const resolvedErrorCode = useMemo(() => errorCode ?? buildErrorCode(), [errorCode]);

    const handleHome = () => {
        if (onHome) {
            onHome();
            return;
        }
        window.location.assign(homePath);
    };

    const handleReload = () => {
        if (onReload) {
            onReload();
            return;
        }
        window.location.reload();
    };

    const handleBack = () => {
        if (onBack) {
            onBack();
            return;
        }
        if (window.history.length > 1) {
            window.history.back();
            return;
        }
        window.location.assign(homePath);
    };

    return (
        <div className="app-error-page">
            <div className="app-error-page-glow app-error-page-glow-left"/>
            <div className="app-error-page-glow app-error-page-glow-right"/>
            <div className="app-error-page-shell">
                <div className="app-error-page-visual">
                    <div className="app-error-page-orb">
                        <div className="app-error-page-orb-core">
                            <Attention className="app-error-page-icon" theme="filled" size={56}/>
                        </div>
                    </div>
                    <div className="app-error-page-visual-copy">
                        <div className="app-error-page-visual-title">应用已切换到安全状态</div>
                        <div className="app-error-page-visual-text">
                            页面仍然可恢复，我们只是先隐藏了异常细节，避免用户直接看到技术堆栈。
                        </div>
                    </div>
                </div>

                <div className="app-error-page-content">
                    <h1>{title}</h1>
                    <p>{description}</p>

                    <div className="app-error-page-code">
                        <span>错误编号</span>
                        <strong>{resolvedErrorCode}</strong>
                    </div>

                    <div className="app-error-page-actions">
                        <Button type="primary" icon={<UpdateRotation size={16}/>} onClick={handleReload}>
                            {reloadText}
                        </Button>
                        <Button icon={<Home size={16}/>} onClick={handleHome}>
                            {homeText}
                        </Button>
                        <Button icon={<Return size={16} style={{transform: "rotate(180deg)"}}/>} onClick={handleBack}>
                            {backText}
                        </Button>
                    </div>

                    <div className="app-error-page-footer">
                        如果问题持续存在，请联系管理员，并提供错误编号以便定位。
                    </div>
                </div>
            </div>
        </div>
    );
}
