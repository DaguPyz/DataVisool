/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {createElement} from "react";
import {globalModal} from "@datavisool/ui";

/**
 * 执行默认链路测试工具。
 *
 * 弹框说明前端确实收到了工具调用；返回 payload 便于 Rust 校验响应链路。
 */
export function runFrontendEffectLinkTestTool(payload: unknown): unknown {
    globalModal.modalApi?.info({
        title: "前端工具链路测试",
        okText: "确定",
        content: createElement(
            "div",
            {style: {lineHeight: "22px", color: "rgba(255,255,255,0.72)"}},
            "前端已收到 Rust 发起的工具调用，并将回传测试结果。",
        ),
    });

    return payload;
}
