/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {useNavigate} from "react-router-dom";
import {Button} from "@datavisool/ui";

export default function NotFound() {
    const navigate = useNavigate();
    return (
        <div className="datavisool-result-page">
            <div className="datavisool-result-code">404</div>
            <div className="datavisool-result-subtitle">找不到页面</div>
            <Button type="primary" onClick={() => navigate('/home/console')}>返回首页</Button>
        </div>
    );
}
