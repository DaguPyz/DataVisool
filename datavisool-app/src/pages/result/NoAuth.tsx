/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {Button} from "@datavisool/ui";
import {useNavigate} from "react-router-dom";

export default function NoAuth() {
    const navigate = useNavigate();
    return (
        <div className="datavisool-result-page">
            <div className="datavisool-result-code">403</div>
            <div className="datavisool-result-subtitle">没有权限访问此页面，请联系管理员申请权限。</div>
            <Button type="primary" onClick={() => navigate('/home/console')}>返回首页</Button>
        </div>
    );
}
