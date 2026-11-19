/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {Popover} from "antd";
import {useEffect, useId, useState} from "react";
import {tx} from "@/i18n/miniI18n.ts";
import type {IAiDrivenTokenTotals, IAiDrivenTokenUsage} from "./types/AiDrivenTaskSubmitTypes.ts";
import "./AiDrivenTokenUsage.less";

const formatCount = (value?: number) => value === undefined ? "—" : value.toLocaleString("en-US");

/** 顶部只展示本轮和会话总量，明细同时支持悬停、点击和键盘访问。 */
const AiDrivenTokenUsage = ({usage}: {usage: IAiDrivenTokenUsage}) => {
    const [open, setOpen] = useState(false);
    const detailsId = useId();
    useEffect(() => {
        if (!open)
            return;
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.stopPropagation();
                setOpen(false);
            }
        };
        document.addEventListener("keydown", closeOnEscape, true);
        return () => document.removeEventListener("keydown", closeOnEscape, true);
    }, [open]);

    return (
        <Popover open={open}
                 onOpenChange={setOpen}
                 trigger={["hover", "click", "focus"]}
                 placement="bottomRight"
                 arrow={false}
                 destroyOnHidden
                 classNames={{root: "ai-driven-token-popover"}}
                 content={<TokenDetails id={detailsId} usage={usage}/>}>
            <button type="button"
                    className="ai-driven-run-token-usage"
                    onClick={() => setOpen(true)}
                    aria-label={tx("查看 Token 消耗明细")}
                    aria-haspopup="dialog"
                    aria-expanded={open}
                    aria-controls={detailsId}>
                <span className="is-total">
                    <em>{tx("本轮")}</em>
                    <b>{formatCount(usage.totalTokens)}</b>
                </span>
                <span className="ai-driven-run-token-divider" aria-hidden="true"/>
                <span>
                    <em>{tx("会话累计")}</em>
                    <b>{formatCount(usage.threadUsage?.totalTokens)}</b>
                </span>
            </button>
        </Popover>
    );
};

const TokenDetails = ({id, usage}: {id: string; usage: IAiDrivenTokenUsage}) => {
    const rows: Array<[string, keyof IAiDrivenTokenTotals]> = [
        ["输入", "inputTokens"], ["输出", "outputTokens"], ["总计", "totalTokens"],
    ];
    for (const [label, key] of [["缓存命中", "cachedInputTokens"], ["缓存新建", "cacheCreationInputTokens"]] as const) {
        if (usage[key] !== undefined || usage.threadUsage?.[key] !== undefined)
            rows.push([label, key]);
    }
    const metrics: Array<[string, string]> = [];
    if (usage.compactionCount !== undefined && usage.compactionCount > 0)
        metrics.push(["压缩次数", formatCount(usage.compactionCount)]);
    for (const [label, key] of [
        ["剩余 Token", "remainingTotalTokens"], ["剩余模型调用", "remainingModelCalls"],
        ["剩余工具调用", "remainingToolCalls"], ["剩余写入调用", "remainingWriteCalls"],
        ["剩余前端交互", "remainingFrontendInteractions"],
    ] as const) {
        const value = usage[key];
        if (value !== undefined && value !== null)
            metrics.push([label, formatCount(value)]);
    }
    if (usage.remainingDurationMs !== undefined && usage.remainingDurationMs !== null) {
        const seconds = Math.max(0, Math.floor(usage.remainingDurationMs / 1000));
        metrics.push(["剩余时长", `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`]);
    }
    return (
        <section id={id} role="dialog" aria-label={tx("Token 消耗明细")} className="ai-driven-token-details">
            <strong className="ai-driven-token-details-title">{tx("Token 消耗明细")}</strong>
            <table>
                <thead>
                <tr><th scope="col">{tx("消耗项")}</th><th scope="col">{tx("本轮")}</th><th scope="col">{tx("会话累计")}</th></tr>
                </thead>
                <tbody>
                {rows.map(([label, key]) => (
                    <tr key={key} className={key === "totalTokens" ? "is-total" : undefined}>
                        <th scope="row">{tx(label)}</th>
                        <td>{formatCount(usage[key])}</td>
                        <td>{formatCount(usage.threadUsage?.[key])}</td>
                    </tr>
                ))}
                </tbody>
            </table>
            {metrics.length > 0 && <dl className="ai-driven-token-context">
                {metrics.map(([label, value]) => (
                    <div key={label}><dt>{tx(label)}</dt><dd>{value}</dd></div>
                ))}
            </dl>}
            <p>{tx("会话累计包含本轮消耗，缓存是输入的子项。")}</p>
        </section>
    );
};

export default AiDrivenTokenUsage;
