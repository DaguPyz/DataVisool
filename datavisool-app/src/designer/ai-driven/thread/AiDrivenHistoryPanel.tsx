/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {Close, Edit, FolderClose, History, Plus, Refresh} from "@icon-park/react";
import {Button, Input} from "@datavisool/ui";
import {observer} from "mobx-react";
import {type KeyboardEvent, useEffect, useState} from "react";
import {tx} from "@/i18n/miniI18n.ts";
import type {AiDrivenHistoryStore} from "./AiDrivenHistoryStore.ts";
import type {AiDrivenThreadStore} from "./AiDrivenThreadStore.ts";
import AiDrivenTurnView from "./AiDrivenTurnView.tsx";
import "./AiDrivenHistoryPanel.less";
import type {IAiDrivenTurn} from "./AiDrivenThreadTypes.ts";
import type {IAiDrivenBudgetExtension} from "../types/AiDrivenTaskSubmitTypes.ts";

interface AiDrivenHistoryPanelProps {
    visible: boolean;
    threadStore: AiDrivenThreadStore;
    historyStore: AiDrivenHistoryStore;
    onClose: () => void;
    onNewConversation?: () => void;
    onThreadSelected?: (threadId: string) => void;
    onResumeTurn?: (turn: IAiDrivenTurn, budgetExtension?: IAiDrivenBudgetExtension) => void;
}

const AiDrivenHistoryPanel = observer(({
    visible,
    threadStore,
    historyStore,
    onClose,
    onNewConversation,
    onThreadSelected,
    onResumeTurn,
}: AiDrivenHistoryPanelProps) => {
    const [renaming, setRenaming] = useState(false);
    const [titleDraft, setTitleDraft] = useState("");
    const selectedThread = threadStore.selectedThread;

    useEffect(() => {
        setRenaming(false);
        setTitleDraft(selectedThread?.title ?? "");
    }, [selectedThread?.threadId, selectedThread?.title]);

    useEffect(() => {
        if (!visible)
            return;
        if (threadStore.projectId && threadStore.selectedThreadId) {
            void historyStore.openThread(threadStore.projectId, threadStore.selectedThreadId);
        } else {
            historyStore.clear();
        }
    }, [historyStore, threadStore.projectId, threadStore.selectedThreadId, visible]);

    if (!visible)
        return null;

    const selectThread = (threadId: string) => {
        threadStore.selectThread(threadId);
        onThreadSelected?.(threadId);
    };
    const startNewConversation = () => {
        threadStore.startNewConversation();
        historyStore.clear();
        onNewConversation?.();
    };
    const saveTitle = async () => {
        if (!selectedThread)
            return;
        const updated = await threadStore.renameThread(selectedThread.threadId, titleDraft);
        if (updated)
            setRenaming(false);
    };
    const handleTitleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") {
            event.preventDefault();
            void saveTitle();
        } else if (event.key === "Escape") {
            setRenaming(false);
            setTitleDraft(selectedThread?.title ?? "");
        }
    };

    return (
        <aside className="ai-driven-history-panel" aria-label={tx("AI 历史记录")}>
            <header className="ai-driven-history-header">
                <div>
                    <History size={18}/>
                    <strong>{tx("AI 历史记录")}</strong>
                </div>
                <Button className="ai-driven-history-icon-button"
                        type="text"
                        size="sm"
                        icon={<Close size={15}/>} 
                        aria-label={tx("关闭历史记录")}
                        title={tx("关闭历史记录")}
                        onClick={onClose}/>
            </header>

            <div className="ai-driven-history-layout">
                <nav className="ai-driven-history-thread-pane" aria-label={tx("对话列表")}>
                    <Button className="ai-driven-history-new-button"
                            type="primary"
                            size="sm"
                            icon={<Plus size={14}/>} 
                            onClick={startNewConversation}>
                        {tx("新对话")}
                    </Button>
                    <div className="ai-driven-history-filter" role="group" aria-label={tx("对话筛选")}>
                        <button type="button"
                                aria-pressed={!threadStore.archivedFilter}
                                onClick={() => threadStore.setArchivedFilter(false)}>
                            {tx("进行中")}
                        </button>
                        <button type="button"
                                aria-pressed={threadStore.archivedFilter}
                                onClick={() => threadStore.setArchivedFilter(true)}>
                            {tx("已归档")}
                        </button>
                    </div>
                    <div className="ai-driven-history-thread-list">
                        {threadStore.threads.map((thread) => (
                            <button key={thread.threadId}
                                    type="button"
                                    className="ai-driven-history-thread-item"
                                    aria-current={thread.threadId === threadStore.selectedThreadId ? "page" : undefined}
                                    onClick={() => selectThread(thread.threadId)}>
                                <strong>{thread.title || tx("未命名对话")}</strong>
                                <span>{thread.preview || tx("暂无摘要")}</span>
                                <time>{formatThreadTime(thread.lastActivityAt)}</time>
                            </button>
                        ))}
                        {threadStore.loading && <div className="ai-driven-history-loading">{tx("正在加载对话…")}</div>}
                        {!threadStore.loading && threadStore.threads.length === 0 && (
                            <div className="ai-driven-history-empty-inline">
                                {threadStore.archivedFilter ? tx("暂无已归档对话") : tx("暂无历史对话")}
                            </div>
                        )}
                        {threadStore.hasMore && !threadStore.loadingMore && (
                            <Button type="text" size="sm" onClick={() => void threadStore.loadThreads(false)}>
                                {tx("加载更多对话")}
                            </Button>
                        )}
                        {threadStore.loadingMore && <div className="ai-driven-history-loading">{tx("正在加载…")}</div>}
                        {threadStore.errorMessage && (
                            <div className="ai-driven-history-error" role="alert">{threadStore.errorMessage}</div>
                        )}
                    </div>
                </nav>

                <main className="ai-driven-history-content-pane">
                    {!selectedThread ? (
                        <div className="ai-driven-history-empty-state">
                            <Plus size={24}/>
                            <strong>{tx("开始一个新对话")}</strong>
                            <span>{tx("发送第一条需求后，对话会自动保存到当前项目。")}</span>
                        </div>
                    ) : (
                        <>
                            <div className="ai-driven-history-thread-header">
                                <div className="ai-driven-history-thread-title">
                                    {renaming ? (
                                        <>
                                            <label className="ai-driven-history-visually-hidden"
                                                   htmlFor="ai-driven-history-title-input">
                                                {tx("对话标题")}
                                            </label>
                                            <Input id="ai-driven-history-title-input"
                                                   value={titleDraft}
                                                   inputSize="sm"
                                                   onChange={setTitleDraft}
                                                   onKeyDown={handleTitleKeyDown}/>
                                        </>
                                    ) : <h2>{selectedThread.title || tx("未命名对话")}</h2>}
                                    <span>{selectedThread.status === "archived" ? tx("只读") : tx("可继续")}</span>
                                </div>
                                <div className="ai-driven-history-thread-actions">
                                    {renaming ? (
                                        <>
                                            <Button size="sm"
                                                    type="primary"
                                                    disabled={!titleDraft.trim() || threadStore.mutating}
                                                    loading={threadStore.mutating}
                                                    onClick={() => void saveTitle()}>
                                                {tx("保存")}
                                            </Button>
                                            <Button size="sm" type="text" onClick={() => setRenaming(false)}>
                                                {tx("取消")}
                                            </Button>
                                        </>
                                    ) : (
                                        <Button className="ai-driven-history-icon-button"
                                                type="text"
                                                size="sm"
                                                icon={<Edit size={14}/>} 
                                                aria-label={tx("重命名对话")}
                                                title={tx("重命名对话")}
                                                onClick={() => setRenaming(true)}/>
                                    )}
                                    <Button className="ai-driven-history-icon-button"
                                            type="text"
                                            size="sm"
                                            loading={threadStore.mutating}
                                            icon={selectedThread.status === "archived"
                                                ? <Refresh size={14}/>
                                                : <FolderClose size={14}/>} 
                                            aria-label={selectedThread.status === "archived" ? tx("恢复对话") : tx("归档对话")}
                                            title={selectedThread.status === "archived" ? tx("恢复对话") : tx("归档对话")}
                                            onClick={() => void threadStore.setThreadArchived(
                                                selectedThread.threadId,
                                                selectedThread.status !== "archived",
                                            )}/>
                                </div>
                            </div>
                            {selectedThread.status === "archived" && (
                                <div className="ai-driven-history-readonly" role="status">
                                    {tx("此对话已归档。恢复后才能继续发送需求。")}
                                </div>
                            )}
                            <div className="ai-driven-history-turn-list">
                                {historyStore.turns.map((turn) => (
                                    <AiDrivenTurnView key={turn.turnId}
                                                      turn={turn}
                                                      items={historyStore.itemsByTurn[turn.turnId] ?? []}
                                                      expanded={historyStore.expandedTurnIds.has(turn.turnId)}
                                                      loadingItems={historyStore.loadingItemTurnIds.has(turn.turnId)}
                                                      itemsLoaded={historyStore.loadedTurnIds.has(turn.turnId)}
                                                      hasMoreItems={historyStore.nextItemCursorByTurn[turn.turnId] !== null
                                                          && historyStore.nextItemCursorByTurn[turn.turnId] !== undefined}
                                                      errorMessage={historyStore.itemErrorsByTurn[turn.turnId]}
                                                      onToggle={() => historyStore.toggleTurn(turn.turnId)}
                                                      onLoadMoreItems={() => void historyStore.loadItems(turn.turnId, false)}
                                                      onResume={onResumeTurn && selectedThread?.status !== "archived"
                                                          ? (budgetExtension) => onResumeTurn(turn, budgetExtension)
                                                          : undefined}/>
                                ))}
                                {historyStore.loadingTurns && <div className="ai-driven-history-loading">{tx("正在加载对话内容…")}</div>}
                                {!historyStore.loadingTurns && historyStore.turns.length === 0 && (
                                    <div className="ai-driven-history-empty-state is-compact">
                                        <strong>{tx("此对话还没有内容")}</strong>
                                    </div>
                                )}
                                {historyStore.turnErrorMessage && (
                                    <div className="ai-driven-history-error" role="alert">{historyStore.turnErrorMessage}</div>
                                )}
                                {historyStore.hasMoreTurns && !historyStore.loadingMoreTurns && (
                                    <Button type="text" size="sm" onClick={() => void historyStore.loadTurns(false)}>
                                        {tx("加载更多轮次")}
                                    </Button>
                                )}
                            </div>
                        </>
                    )}
                </main>
            </div>
        </aside>
    );
});

const formatThreadTime = (timestamp: number) => {
    if (!Number.isFinite(timestamp))
        return "";
    return new Date(timestamp).toLocaleDateString(undefined, {month: "2-digit", day: "2-digit"});
};

export default AiDrivenHistoryPanel;
