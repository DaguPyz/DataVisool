/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import type {CSSProperties, ReactNode} from "react";

export interface RenderFaultPanelProps {
    className?: string;
    style?: CSSProperties;
    message?: ReactNode;
    detail?: ReactNode;
}

const defaultRootStyle: CSSProperties = {
    position: "relative",
    width: "100%",
    height: "100%",
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    boxSizing: "border-box",
    borderRadius: 8,
    border: "1px solid rgba(255, 196, 44, 0.26)",
    backgroundColor: "#090a0c",
    backgroundImage: [
        "linear-gradient(180deg, rgba(10, 11, 14, 0.52) 0%, rgba(10, 11, 14, 0.18) 28%, rgba(7, 8, 10, 0.82) 100%)",
        "repeating-linear-gradient(135deg, rgba(255, 202, 43, 0.42) 0 18px, rgba(255, 202, 43, 0.22) 18px 28px, rgba(10, 11, 14, 0.00) 28px 44px, rgba(10, 11, 14, 0.48) 44px 58px)",
    ].join(", "),
    backgroundBlendMode: "normal",
    boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 12px 24px rgba(0, 0, 0, 0.18)",
    color: "#ffe27a",
    userSelect: "none",
};

const badgeStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    maxWidth: "100%",
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid rgba(255, 202, 43, 0.28)",
    background: "rgba(6, 7, 9, 0.82)",
    boxShadow: "0 8px 18px rgba(0, 0, 0, 0.24)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
};

const labelStyle: CSSProperties = {
    color: "#ffd65e",
    fontSize: 11,
    lineHeight: 1,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    fontWeight: 700,
    whiteSpace: "nowrap",
};

const messageStyle: CSSProperties = {
    color: "#fff7c8",
    fontSize: 12,
    lineHeight: 1.5,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
};

const detailStyle: CSSProperties = {
    marginTop: 8,
    color: "rgba(255, 240, 197, 0.72)",
    fontSize: 11,
    lineHeight: 1.4,
    textAlign: "center",
};

export default function RenderFaultPanel(props: RenderFaultPanelProps) {
    const {
        className,
        style,
        message = "组件渲染异常",
        detail = "请检查配置后重试",
    } = props;

    return (
        <div className={className} style={{...defaultRootStyle, ...style}}>
            <div
                aria-hidden
                style={{
                    position: "absolute",
                    inset: 0,
                    backgroundImage:
                        "linear-gradient(180deg, rgba(0, 0, 0, 0.18) 0%, rgba(0, 0, 0, 0.24) 100%)",
                    pointerEvents: "none",
                }}
            />
            <div
                aria-hidden
                style={{
                    position: "absolute",
                    inset: "-12% -18%",
                    background:
                        "radial-gradient(circle at 22% 18%, rgba(255, 214, 94, 0.18), transparent 28%), radial-gradient(circle at 72% 78%, rgba(255, 202, 43, 0.08), transparent 34%)",
                    filter: "blur(4px)",
                    pointerEvents: "none",
                }}
            />
            <div style={{position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center"}}>
                <div style={badgeStyle}>
                    <span style={labelStyle}>FAULT</span>
                    <span style={messageStyle}>{message}</span>
                </div>
                <div style={detailStyle}>
                    {detail}
                </div>
            </div>
        </div>
    );
}
