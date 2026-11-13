/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {Brain, Close, History, Send, Setting, Terminal} from "@icon-park/react";
import {Button, Input, Select} from "@datavisool/ui";
import {
    type ClipboardEvent as ReactClipboardEvent,
    type CSSProperties,
    type KeyboardEvent as ReactKeyboardEvent,
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";
import {observer} from "mobx-react";
import DraggableProvider from "@/framework/draggable/DraggableProvider.ts";
import {tx} from "@/i18n/miniI18n.ts";
import {useLocaleVersion} from "@/i18n/useLocaleVersion.ts";
import {
    getPastedImageFiles,
    isEditablePasteTarget,
} from "./AiDrivenUtil.ts";
import AiDrivenProgressTerminal from "./AiDrivenProgressTerminal.tsx";
import aiDrivenProgressTerminalStore from "./AiDrivenProgressTerminalStore.ts";
import AiDrivenBarStore from "./AiDrivenBarStore.ts";
import {
    type AiDrivenShortcutCommand,
    type AiDrivenShortcutPanelPlacement,
    getAiDrivenShortcutCommands,
} from "./AiDrivenShortcutCommands.ts";
import AiDrivenShortcutPanel from "./AiDrivenShortcutPanel.tsx";
import AiDrivenSettingsPanel from "./AiDrivenSettingsPanel.tsx";
import AiDrivenHistoryPanel from "./thread/AiDrivenHistoryPanel.tsx";
import {resumeInterruptedTask} from "./AiDrivenTaskResumeController.ts";
import "./AiDrivenBar.less";

const CLOSE_TRANSITION_MS = 320;
const SHORTCUT_PANEL_GAP = 10;
const SHORTCUT_PANEL_WIDTH_MIN = 260;
const SHORTCUT_PANEL_HEIGHT_ESTIMATE = 92;
const SHORTCUT_PANEL_SCREEN_GAP = 12;

interface AiDrivenBarProps {
    /** 控制 AI驱动面板是否打开。 */
    open: boolean;
    /** 关闭 AI驱动面板的回调。 */
    onClose: () => void;
}

const AiDrivenBar = observer((props: AiDrivenBarProps) => {
    useLocaleVersion();

    const {open, onClose} = props;
    const storeRef = useRef<AiDrivenBarStore | null>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const headerRef = useRef<HTMLDivElement>(null);
    const promptInputRef = useRef<HTMLDivElement>(null);
    const draggableProviderRef = useRef<DraggableProvider | null>(null);
    const [promptInputFocused, setPromptInputFocused] = useState(false);
    const [shortcutPanelDismissed, setShortcutPanelDismissed] = useState(false);
    const [shortcutPanelPlacement, setShortcutPanelPlacement] = useState<AiDrivenShortcutPanelPlacement>("top");
    const [shortcutPanelStyle, setShortcutPanelStyle] = useState<CSSProperties | null>(null);
    const [settingsVisible, setSettingsVisible] = useState(false);
    if (!storeRef.current)
        storeRef.current = new AiDrivenBarStore(open);
    const aiDrivenBarStore = storeRef.current;

    useEffect(() => {
        if (!open)
            return;

        void aiDrivenBarStore.loadModelConfigs();
        return aiDrivenBarStore.cancelModelConfigLoad;
    }, [aiDrivenBarStore, open]);

    useEffect(() => {
        if (!open)
            return;

        void aiDrivenBarStore.loadProviderModelProviders();
        return aiDrivenBarStore.cancelProviderModelLoad;
    }, [aiDrivenBarStore, open]);

    useEffect(() => {
        if (open) {
            aiDrivenBarStore.setMounted(true);
            aiDrivenBarStore.setDragging(false);
            if (typeof window === "undefined") {
                aiDrivenBarStore.setVisible(true);
                return;
            }
            const frame = window.requestAnimationFrame(() => {
                aiDrivenBarStore.setVisible(true);
            });
            return () => {
                window.cancelAnimationFrame(frame);
            };
        }

        aiDrivenBarStore.setVisible(false);
        aiDrivenBarStore.setDragging(false);
        if (!aiDrivenBarStore.mounted || typeof window === "undefined")
            return;

        const timer = window.setTimeout(() => {
            aiDrivenBarStore.resetAfterClose();
        }, CLOSE_TRANSITION_MS);

        return () => {
            window.clearTimeout(timer);
        };
    }, [aiDrivenBarStore, aiDrivenBarStore.mounted, open]);

    useEffect(() => {
        draggableProviderRef.current?.setEnabled(open);
    }, [open]);

    useEffect(() => {
        if (!open)
            setSettingsVisible(false);
    }, [open]);

    useEffect(() => {
        if (!aiDrivenBarStore.mounted)
            return;

        const panelElement = panelRef.current;
        const headerElement = headerRef.current;
        if (!panelElement || !headerElement)
            return;

        const draggableProvider = new DraggableProvider({
            enabled: open,
            edgeGap: 12,
            ignoreSelector:
                "button, input, textarea, select, option, a, [role='button']",
            defaultPosition: (target) => {
                const targetWidth =
                    target.offsetWidth || target.getBoundingClientRect().width;
                const targetHeight =
                    target.offsetHeight ||
                    target.getBoundingClientRect().height;
                if (typeof window === "undefined")
                    return {x: 12, y: 12};

                return {
                    x: (window.innerWidth - targetWidth) / 2,
                    y: window.innerHeight - targetHeight - 50,
                };
            },
            onDragStart: () => aiDrivenBarStore.setDragging(true),
            onDragEnd: () => aiDrivenBarStore.setDragging(false),
        });

        draggableProvider.attach({
            target: panelElement,
            handle: headerElement,
        });
        draggableProviderRef.current = draggableProvider;

        return () => {
            draggableProvider.destroy();
            if (draggableProviderRef.current === draggableProvider)
                draggableProviderRef.current = null;
        };
    }, [aiDrivenBarStore, aiDrivenBarStore.mounted, open]);

    const updateShortcutPanelPosition = useCallback(() => {
        if (typeof window === "undefined")
            return;

        const inputElement =
            promptInputRef.current?.querySelector<HTMLElement>(".datavisool-input-shell") ?? promptInputRef.current;
        if (!inputElement)
            return;

        const inputRect = inputElement.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const panelWidth = Math.min(
            Math.max(inputRect.width, SHORTCUT_PANEL_WIDTH_MIN),
            viewportWidth - SHORTCUT_PANEL_SCREEN_GAP * 2
        );
        const panelLeft = Math.min(
            Math.max(inputRect.left, SHORTCUT_PANEL_SCREEN_GAP),
            viewportWidth - panelWidth - SHORTCUT_PANEL_SCREEN_GAP
        );
        const spaceAbove = inputRect.top;
        const spaceBelow = window.innerHeight - inputRect.bottom;
        const nextPlacement: AiDrivenShortcutPanelPlacement =
            spaceBelow >= SHORTCUT_PANEL_HEIGHT_ESTIMATE || spaceBelow >= spaceAbove
                ? "bottom"
                : "top";
        const panelTop = nextPlacement === "bottom"
            ? inputRect.bottom + SHORTCUT_PANEL_GAP
            : inputRect.top - SHORTCUT_PANEL_GAP;

        setShortcutPanelPlacement(nextPlacement);
        setShortcutPanelStyle({
            left: panelLeft,
            top: panelTop,
            width: panelWidth,
        });
    }, []);

    useEffect(() => {
        if (!open || typeof window === "undefined")
            return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape")
                return;
            event.preventDefault();
            event.stopPropagation();
            onClose();
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [open, onClose]);

    const shortcutCommands = getAiDrivenShortcutCommands(aiDrivenBarStore.content);
    const shortcutPanelOpen = promptInputFocused && !shortcutPanelDismissed && shortcutCommands.length > 0;

    useEffect(() => {
        setShortcutPanelDismissed(false);
    }, [aiDrivenBarStore.content]);

    useEffect(() => {
        if (!shortcutPanelOpen || typeof window === "undefined") {
            setShortcutPanelStyle(null);
            return;
        }

        updateShortcutPanelPosition();
        const frame = window.requestAnimationFrame(updateShortcutPanelPosition);
        const handlePositionUpdate = () => updateShortcutPanelPosition();

        window.addEventListener("resize", handlePositionUpdate);
        window.addEventListener("scroll", handlePositionUpdate, true);
        return () => {
            window.cancelAnimationFrame(frame);
            window.removeEventListener("resize", handlePositionUpdate);
            window.removeEventListener("scroll", handlePositionUpdate, true);
        };
    }, [shortcutPanelOpen, updateShortcutPanelPosition]);

    useEffect(() => {
        aiDrivenBarStore.setComponentAlive(true);
        return () => {
            aiDrivenBarStore.destroy();
        };
    }, [aiDrivenBarStore]);

    // 粘贴图片后直接上传，图片回显只使用上传成功后返回的本地资源 URL。
    const handlePromptPaste = (event: ReactClipboardEvent<HTMLDivElement>) => {
        if (!isEditablePasteTarget(event.target))
            return;

        event.stopPropagation();
        const pastedImageFiles = getPastedImageFiles(event.clipboardData);
        if (pastedImageFiles.length === 0)
            return;

        event.preventDefault();
        void aiDrivenBarStore.uploadPastedImageFiles(pastedImageFiles);
    };

    const selectShortcutCommand = useCallback((command: AiDrivenShortcutCommand) => {
        const nextContent = `/${command.command} `;
        aiDrivenBarStore.setContent(nextContent);
        if (typeof window === "undefined")
            return;
        window.requestAnimationFrame(() => {
            const inputElement = promptInputRef.current?.querySelector<HTMLInputElement>(".datavisool-input-native");
            if (!inputElement)
                return;
            inputElement.focus();
            inputElement.setSelectionRange(nextContent.length, nextContent.length);
        });
    }, [aiDrivenBarStore]);

    const handlePromptFocus = () => {
        setPromptInputFocused(true);
        setShortcutPanelDismissed(false);
    };

    const handlePromptBlur = () => {
        setPromptInputFocused(false);
        setShortcutPanelDismissed(false);
    };

    const handlePromptKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
        if (shortcutPanelOpen && (event.key === "Enter" || event.key === "Tab")) {
            event.preventDefault();
            event.stopPropagation();
            selectShortcutCommand(shortcutCommands[0]);
            return;
        }

        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            if (shortcutPanelOpen) {
                setShortcutPanelDismissed(true);
                return;
            }
            onClose();
        }
    };

    if (!aiDrivenBarStore.mounted)
        return null;

    const stageClassName = `ai-driven-stage ${aiDrivenBarStore.visible ? "is-open" : "is-closing"}`;
    const frameClassName = `ai-driven-card-frame ${aiDrivenBarStore.visible ? "is-open" : "is-closing"}`;
    const headerClassName = `ai-driven-card-header ${
        aiDrivenBarStore.isDragging ? "is-dragging" : ""
    }`;
    const sendButtonStateClassName = aiDrivenBarStore.running ? "is-steering" : "is-idle";
    const sendButtonClassName = `ai-driven-send-button ${sendButtonStateClassName}`;
    const sendButtonText = aiDrivenBarStore.submitting
        ? (aiDrivenBarStore.running ? tx("正在追加") : tx("正在提交"))
        : (aiDrivenBarStore.running ? tx("追加要求") : tx("发送"));
    const progressConsoleOpen = aiDrivenProgressTerminalStore.visible;
    const aiDrivenProgressTitle = aiDrivenProgressTerminalStore.displayProgressTitle;
    const progressButtonClassName = `ai-driven-card-action ai-driven-card-progress ${
        progressConsoleOpen ? "is-open" : ""
    } ${aiDrivenBarStore.running ? `is-live is-${aiDrivenProgressTerminalStore.runState}` : ""}`;
    const historyButtonClassName = `ai-driven-card-action ai-driven-card-history ${
        aiDrivenBarStore.historyVisible ? "is-open" : ""
    }`;
    const settingsButtonClassName = `ai-driven-card-action ai-driven-card-settings ${
        settingsVisible ? "is-open" : ""
    }`;

    const toggleSettings = () => {
        if (!settingsVisible) {
            aiDrivenBarStore.setHistoryVisible(false);
            aiDrivenProgressTerminalStore.setVisible(false);
        }
        setSettingsVisible(!settingsVisible);
    };

    return (
        <div className={stageClassName}>
            <div ref={panelRef} className="ai-driven-input-layer">
                <AiDrivenHistoryPanel visible={aiDrivenBarStore.historyVisible}
                                      threadStore={aiDrivenBarStore.threadStore}
                                      historyStore={aiDrivenBarStore.historyStore}
                                      onClose={() => aiDrivenBarStore.setHistoryVisible(false)}
                                      onNewConversation={aiDrivenBarStore.startNewConversation}
                                      onResumeTurn={(turn, budgetExtension) => void resumeInterruptedTask(
                                          aiDrivenBarStore, aiDrivenBarStore.threadStore.projectId, turn, budgetExtension,
                                      )}
                                      onThreadSelected={aiDrivenBarStore.selectThreadFromHistory}/>
                <AiDrivenProgressTerminal/>
                <AiDrivenSettingsPanel visible={settingsVisible}
                                       running={aiDrivenBarStore.running}
                                       onClose={() => setSettingsVisible(false)}/>
                <div className={frameClassName}>
                    <div className="ai-driven-card">
                        <div ref={headerRef} className={headerClassName}>
                            <div className="ai-driven-card-title-group">
                                <div className="ai-driven-card-icon">
                                    <Brain theme="filled" size={18} strokeWidth={2}/>
                                </div>
                                <div className="ai-driven-card-copy">
                                    <div className="ai-driven-card-title">
                                        {tx("AI驱动")}
                                    </div>
                                    <div className="ai-driven-card-subtitle">
                                        {tx(
                                            "统一整合模型选择、提示输入与图片辅助，组织 AI驱动任务上下文"
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="ai-driven-card-actions">
                                <Button className={settingsButtonClassName}
                                        type="text"
                                        size="sm"
                                        icon={<Setting size={14} strokeWidth={3}/>}
                                        aria-label={tx("AI 运行设置")}
                                        aria-expanded={settingsVisible}
                                        title={tx("AI 运行设置")}
                                        onClick={toggleSettings}/>
                                <Button className={progressButtonClassName}
                                        type="text"
                                        size="sm"
                                        icon={<Terminal size={14} strokeWidth={3}/>}
                                        aria-label={aiDrivenProgressTitle}
                                        aria-expanded={progressConsoleOpen}
                                        title={aiDrivenProgressTitle}
                                        onClick={() => {
                                            setSettingsVisible(false);
                                            aiDrivenProgressTerminalStore.toggleVisible();
                                        }}>
                                    {aiDrivenBarStore.running && aiDrivenProgressTerminalStore.runState === "waiting" && (
                                        <span className="ai-driven-card-progress-label">
                                            {tx("需要操作")}
                                        </span>
                                    )}
                                </Button>
                                <Button className={historyButtonClassName}
                                        type="text"
                                        size="sm"
                                        icon={<History size={14} strokeWidth={3}/>}
                                        aria-label={tx("AI 历史记录")}
                                        aria-expanded={aiDrivenBarStore.historyVisible}
                                        title={tx("AI 历史记录")}
                                        onClick={() => {
                                            setSettingsVisible(false);
                                            aiDrivenBarStore.toggleHistoryVisible();
                                        }}/>
                                <Button className="ai-driven-card-action ai-driven-card-close"
                                        type="text"
                                        size="sm"
                                        icon={<Close size={14} strokeWidth={3}/>}
                                        aria-label={tx("关闭")}
                                        title={tx("关闭")}
                                        onClick={onClose}/>
                            </div>
                        </div>

                        <div className="ai-driven-input-shell">
                            <Select className="ai-driven-input-model ai-driven-input-model-connection"
                                    selectSize="lg"
                                    value={aiDrivenBarStore.modelConfigId || undefined}
                                    options={aiDrivenBarStore.modelConfigOptions}
                                    panelClassName="ai-driven-model-popup"
                                    placeholder={tx("请选择模型配置")}
                                    emptyText={aiDrivenBarStore.modelConfigLoading ? tx("加载中") : tx("暂无可用配置")}
                                    onChange={(value) => {
                                        aiDrivenBarStore.selectModelConfigId(
                                            Array.isArray(value)
                                                ? String(value[0] ?? "")
                                                : String(value)
                                        );
                                    }}/>
                            <Select className="ai-driven-input-model ai-driven-input-model-runtime"
                                    selectSize="lg"
                                    value={aiDrivenBarStore.runtimeModelId || undefined}
                                    options={aiDrivenBarStore.runtimeModelOptions}
                                    panelClassName="ai-driven-model-popup"
                                    placeholder={tx("请选择模型型号")}
                                    emptyText={aiDrivenBarStore.runtimeModelLoading ? tx("加载中") : tx("暂无可用模型")}
                                    onChange={(value) =>
                                        aiDrivenBarStore.setRuntimeModelId(
                                            Array.isArray(value)
                                                ? String(value[0] ?? "")
                                                : String(value)
                                        )
                                    }/>
                            <div ref={promptInputRef}
                                 className="ai-driven-input-content"
                                 onPaste={handlePromptPaste}>
                                <Input inputSize="lg"
                                       value={aiDrivenBarStore.content}
                                       placeholder={tx("请输入需求")}
                                       onChange={aiDrivenBarStore.setContent}
                                       onFocus={handlePromptFocus}
                                       onBlur={handlePromptBlur}
                                       onKeyDown={handlePromptKeyDown}/>
                            </div>
                            <Button className={sendButtonClassName}
                                    size="lg"
                                    type="primary"
                                    loading={aiDrivenBarStore.submitting}
                                    disabled={aiDrivenBarStore.stopping || aiDrivenBarStore.submitting || aiDrivenBarStore.content.trim().length === 0}
                                    icon={<Send theme="outline" size={14} fill="currentColor"/>}
                                    aria-label={sendButtonText}
                                    title={sendButtonText}
                                    onClick={aiDrivenBarStore.submitPrompt}>
                                {sendButtonText}
                            </Button>
                            {aiDrivenBarStore.running ? (
                                <Button className="ai-driven-stop-button"
                                        size="lg"
                                        loading={aiDrivenBarStore.stopping}
                                        disabled={aiDrivenBarStore.stopping}
                                        icon={aiDrivenBarStore.stopping
                                            ? undefined
                                            : <Close size={14} strokeWidth={3}/>}
                                        aria-label={aiDrivenBarStore.stopping ? tx("正在停止") : tx("停止")}
                                        title={aiDrivenBarStore.stopping ? tx("正在停止") : tx("停止")}
                                        onClick={aiDrivenBarStore.stopCurrentTask}/>
                            ) : null}
                        </div>

                        {aiDrivenBarStore.imageAttachments.length > 0 ? (
                            <div className="ai-driven-image-paste-area">
                                <div className="ai-driven-image-attachments">
                                    {aiDrivenBarStore.imageAttachments.map((attachment) => (
                                        <div key={attachment.id}
                                             className="ai-driven-image-thumb"
                                             title={attachment.originalName}>
                                            <img src={attachment.previewUrl}
                                                 alt={tx("预览图片")}
                                                 className="ai-driven-image-preview"/>
                                            <button className="ai-driven-image-remove"
                                                    type="button"
                                                    aria-label={tx("移除")}
                                                    title={tx("移除")}
                                                    onClick={() => aiDrivenBarStore.removeImageAttachment(attachment.id)}>
                                                <Close size={10} strokeWidth={3}/>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
            <AiDrivenShortcutPanel visible={shortcutPanelOpen}
                                   placement={shortcutPanelPlacement}
                                   panelStyle={shortcutPanelStyle}
                                   commands={shortcutCommands}
                                   onSelect={selectShortcutCommand}/>
        </div>
    );
});

export default AiDrivenBar;
