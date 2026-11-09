/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import { observer } from "mobx-react";
import { useEffect, useState } from "react";
import type { MouseEvent } from "react";
import { Button, Dropdown, Input, Pagination } from "@datavisool/ui";
import type { DropdownMenuItem } from "@datavisool/ui";
import { Brain, Check, CopyOne, Delete, Edit, More, Plus, Search } from "@icon-park/react";
import { globalMessage } from "@datavisool/ui";
import { globalModal } from "@datavisool/ui";
import aiModelManagementStore, { IAiModel } from "@/pages/home/ai-model-management/AiModelManagementStore.ts";
import AiModelEditPanel from "@/pages/home/ai-model-management/AiModelEditPanel.tsx";
import styles from "@/pages/home/ai-model-management/AiModelManagement.module.less";
import { getAiModelProviderLabel, getAiModelProviderTone, normalizeAiModelProviderId } from "@/util/ai-model-provider/AiModelProviderRegistry.ts";
import {getLocale, tx} from "@/i18n/miniI18n.ts";
import {useLocaleVersion} from "@/i18n/useLocaleVersion.ts";
import titleCube from "@/pages/home/ai-model-management/assets/ai-model-title-cube.webp";
import cardWave from "@/pages/home/ai-model-management/assets/ai-card-wave.webp";
import openAiIcon from "@/pages/home/ai-model-management/assets/providers/openai.svg";
import qwenIcon from "@/pages/home/ai-model-management/assets/providers/qwen.svg";
import kimiIcon from "@/pages/home/ai-model-management/assets/providers/kimi.svg";
import glmIcon from "@/pages/home/ai-model-management/assets/providers/glm.svg";
import miniMaxIcon from "@/pages/home/ai-model-management/assets/providers/minimax.svg";
import doubaoIcon from "@/pages/home/ai-model-management/assets/providers/doubao.svg";
import hunyuanIcon from "@/pages/home/ai-model-management/assets/providers/hunyuan.svg";
import geminiIcon from "@/pages/home/ai-model-management/assets/providers/gemini.svg";
import grokIcon from "@/pages/home/ai-model-management/assets/providers/grok.svg";
import deepSeekIcon from "@/pages/home/ai-model-management/assets/providers/deepseek.svg";
import mimoIcon from "@/pages/home/ai-model-management/assets/providers/mimo.svg";
import anthropicIcon from "@/pages/home/ai-model-management/assets/providers/anthropic.svg";
import ollamaIcon from "@/pages/home/ai-model-management/assets/providers/ollama.svg";

const formatTime = (value?: string | number[]) => {
    if (!value) return tx("暂无时间");
    const date = Array.isArray(value)
        ? (value.length >= 3 ? new Date(value[0], value[1] - 1, value[2], value[3] ?? 0, value[4] ?? 0, value[5] ?? 0) : new Date(NaN))
        : new Date(value.replace(" ", "T"));
    if (Number.isNaN(date.getTime())) return typeof value === "string" ? value : tx("暂无时间");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hour = String(date.getHours()).padStart(2, "0");
    const minute = String(date.getMinutes()).padStart(2, "0");
    return `${month}/${day} ${hour}:${minute}`;
};

const formatTemperature = (value?: number) => {
    if (typeof value !== "number" || Number.isNaN(value)) return "0.7";
    return value.toFixed(1);
};

const COPY_SUFFIX = "（复制）";
const COPY_NUMBERED_PREFIX = "（复制";
const COPY_SUFFIX_EN = " (copy)";
const COPY_NUMBERED_PREFIX_EN = " (copy ";

const getUnnamedModelName = () => tx("未命名模型");

const providerIconMap: Partial<Record<ReturnType<typeof normalizeAiModelProviderId>, string>> = {
    openai: openAiIcon,
    qwen: qwenIcon,
    kimi: kimiIcon,
    glm: glmIcon,
    minimax: miniMaxIcon,
    doubao: doubaoIcon,
    hunyuan: hunyuanIcon,
    gemini: geminiIcon,
    grok: grokIcon,
    deepseek: deepSeekIcon,
    mimo: mimoIcon,
    anthropic: anthropicIcon,
    ollama: ollamaIcon,
};

const providerIconStyle = {
    filter: "brightness(0) invert(1) drop-shadow(0 0 18px rgba(71, 100, 255, 0.28))",
};

const buildCopyName = (sourceName: string | undefined, existingNames: Set<string>) => {
    const isEnUS = getLocale() === "en-US";
    const copySuffix = isEnUS ? COPY_SUFFIX_EN : COPY_SUFFIX;
    const copyNumberedPrefix = isEnUS ? COPY_NUMBERED_PREFIX_EN : COPY_NUMBERED_PREFIX;
    const copyNumberedSuffix = isEnUS ? ")" : "）";
    const baseName = sourceName?.trim() || getUnnamedModelName();
    const normalizedBaseName = baseName.endsWith(copySuffix)
        ? baseName.slice(0, -copySuffix.length).trim() || getUnnamedModelName()
        : baseName;

    let nextName = `${normalizedBaseName}${copySuffix}`;
    let copyIndex = 2;
    while (existingNames.has(nextName)) {
        nextName = `${normalizedBaseName}${copyNumberedPrefix}${copyIndex}${copyNumberedSuffix}`;
        copyIndex += 1;
    }
    return nextName;
};

const AiModelManagement = observer(() => {
    useLocaleVersion();
    const { pageData, setCurrentItem, setModalVisible } = aiModelManagementStore;
    const { records, current, size, total } = pageData;
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    useEffect(() => {
        aiModelManagementStore.init();
        return () => aiModelManagementStore.destroy();
    }, []);

    useEffect(() => {
        setSelectedIds((prev) => {
            const availableIds = new Set(records.map((item) => item.id).filter((id): id is string => Boolean(id)));
            const retainedIds = prev.filter((id) => availableIds.has(id));
            if (retainedIds.length > 0) return retainedIds;
            const firstId = records[0]?.id;
            return firstId ? [firstId] : [];
        });
    }, [records]);

    const doSearch = (value?: string) => {
        aiModelManagementStore.searchValue = value?.trim() ?? "";
        aiModelManagementStore.pageData.current = 1;
        aiModelManagementStore.getList();
    };

    const toggleSelection = (id: string) => {
        setSelectedIds((prev) => (
            prev.includes(id)
                ? prev.filter((item) => item !== id)
                : [...prev, id]
        ));
    };

    const handleDelete = (id: string) => {
        globalModal.modalApi?.confirm({
            title: tx("删除确认"),
            content: tx("确定删除这个 AI 模型吗？删除后无法恢复，请谨慎操作。"),
            okText: tx("确定"),
            cancelText: tx("取消"),
            onOk: async () => (await aiModelManagementStore.deleteModels([id])) || false,
        });
    };

    const handleBatchDelete = () => {
        if (selectedIds.length === 0) {
            globalMessage.messageApi?.warning(tx("请选择要删除的项目"));
            return;
        }

        globalModal.modalApi?.confirm({
            title: tx("删除确认"),
            content: tx("确定删除选中的 AI 模型吗？删除后无法恢复，请谨慎操作。"),
            okText: tx("确定"),
            cancelText: tx("取消"),
            onOk: async () => {
                if (!await aiModelManagementStore.deleteModels(selectedIds)) return false;
                setSelectedIds([]);
            },
        });
    };

    const copyText = (event: MouseEvent, value?: string) => {
        event.stopPropagation();
        const text = value?.trim();
        if (!text) return;
        if (!navigator.clipboard) return;
        navigator.clipboard.writeText(text).then(() => {
            globalMessage.messageApi?.success(tx("复制成功"));
        });
    };

    const handleCopy = (item: IAiModel) => {
        const existingNames = new Set(records
            .map((record) => record.name?.trim())
            .filter((name): name is string => Boolean(name)));
        const copyDraft: Partial<IAiModel> = {
            ...item,
            id: undefined,
            key: undefined,
            name: buildCopyName(item.name, existingNames),
            apiKey: "",
            hasApiKey: false,
            clearApiKey: 0,
            isDefault: 0,
        };

        setCurrentItem(copyDraft);
        setModalVisible(true);
    };

    return (
        <div className={styles.aiModelPage}>
            <header className={styles.pageHeader}>
                <div className={styles.headerTitleArea}>
                    <Brain className={styles.titleIcon} size={58}/>
                    <div className={styles.titleText}>
                        <h1>{tx("AI模型管理")}</h1>
                        <p>{tx("管理自己的 AI 接入配置，灵活配置厂商、地址与密钥")}</p>
                    </div>
                </div>

                <div className={styles.headerTools}>
                    <Input
                        className={styles.searchInputField}
                        controlClassName={styles.searchInput}
                        placeholder={tx("搜索名称 / 提供商 / 接入地址")}
                        prefix={<Search size={18} fill="#A7B4D6" />}
                        onPressEnter={(event) => doSearch(event.currentTarget.value)}
                    />
                    <Button
                        className={styles.createButton}
                        type="primary"
                        icon={<Plus size={18} />}
                        onClick={() => setModalVisible(true)}
                    >
                        {tx("新建模型")}
                    </Button>
                    <Button
                        className={styles.batchDeleteButton}
                        type="default"
                        icon={<Delete size={18} />}
                        onClick={handleBatchDelete}
                    >
                        {tx("删除")}
                    </Button>
                </div>
            </header>

            <main className={styles.pageBody}>
                {records.length === 0 ? (
                    <div className={styles.emptyWrap}>
                        <div className={styles.emptyContent}>
                            <div className={styles.emptyIcon}>
                                <Brain size={34} />
                            </div>
                            <div className={styles.emptyTitle}>{tx("还没有 AI 模型配置")}</div>
                            <div className={styles.emptyDescription}>
                                {tx("创建一个配置后，可在这里统一维护接入地址、密钥和默认策略。")}
                            </div>
                            <Button
                                className={styles.createButton}
                                type="primary"
                                icon={<Plus size={16} />}
                                onClick={() => setModalVisible(true)}
                            >
                                {tx("新建模型")}
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className={styles.modelGrid}>
                        {records.map((item) => {
                            const id = item.id!;
                            const isSelected = selectedIds.includes(id);
                            const providerId = normalizeAiModelProviderId(item.provider);
                            const providerLabel = tx(item.providerLabel || getAiModelProviderLabel(item.provider));
                            const providerTone = getAiModelProviderTone(providerId);
                            const providerIcon = providerIconMap[providerId] ?? titleCube;
                            const hasApiKey = Boolean(item.hasApiKey || item.apiKey?.trim());
                            const description = item.description?.trim();
                            const actionMenuItems: DropdownMenuItem[] = [
                                {
                                    key: "copy",
                                    label: tx("复制模型"),
                                    icon: <CopyOne />,
                                    onClick: ({ domEvent }) => {
                                        domEvent.stopPropagation();
                                        handleCopy(item);
                                    },
                                },
                                {
                                    key: "delete",
                                    label: tx("删除"),
                                    icon: <Delete />,
                                    danger: true,
                                    onClick: ({ domEvent }) => {
                                        domEvent.stopPropagation();
                                        handleDelete(id);
                                    },
                                },
                            ];

                            return (
                                <article
                                    key={id}
                                    className={`${styles.modelCard} ${isSelected ? styles.modelCardSelected : ""}`}
                                >
                                    <img className={styles.cardWave} src={cardWave} alt="" />
                                    <div className={styles.cardHeader}>
                                        <img className={styles.providerIcon} src={providerIcon} alt="" style={providerIconStyle} />
                                        <div className={styles.titleBlock}>
                                            <div className={styles.cardTitle} title={item.name}>
                                                {item.name || getUnnamedModelName()}
                                            </div>
                                            <div className={styles.cardSubtitle} title={item.baseUrl || providerLabel}>
                                                {item.baseUrl || providerLabel}
                                            </div>
                                        </div>
                                        <div className={styles.cardControls}>
                                            <button
                                                type="button"
                                                className={`${styles.selectionControl} ${isSelected ? styles.selectionControlSelected : ""}`}
                                                aria-label={isSelected ? tx("取消选择") : tx("选择模型")}
                                                aria-pressed={isSelected}
                                                onClick={() => toggleSelection(id)}
                                            >
                                                {isSelected && <Check size={14} />}
                                            </button>
                                            <Dropdown menu={{ items: actionMenuItems }} trigger={["click"]} placement="bottomRight">
                                                <button
                                                    type="button"
                                                    className={styles.moreButton}
                                                    aria-label={tx("更多操作")}
                                                >
                                                    <More size={20} />
                                                </button>
                                            </Dropdown>
                                        </div>
                                    </div>

                                    <div className={styles.tagRow}>
                                        {item.isDefault === 1 && (
                                            <span className={`${styles.modelTag} ${styles.defaultTag}`}>{tx("默认模型")}</span>
                                        )}
                                        <span className={`${styles.modelTag} ${item.enabled !== 0 ? styles.enabledTag : styles.disabledTag}`}>
                                            {item.enabled !== 0 ? tx("已启用") : tx("已停用")}
                                        </span>
                                        <span className={styles.providerTag} data-tone={providerTone}>
                                            {providerLabel}
                                        </span>
                                    </div>

                                    <div className={styles.connectionLine}>
                                        <span>{tx("接入地址")}</span>
                                        <strong title={item.baseUrl || ""}>{item.baseUrl || tx("未设置")}</strong>
                                        {item.baseUrl && (
                                            <button
                                                className={styles.metaIconButton}
                                                type="button"
                                                aria-label={tx("复制地址")}
                                                onClick={(event) => copyText(event, item.baseUrl)}
                                            >
                                                <CopyOne size={17} />
                                            </button>
                                        )}
                                    </div>

                                    <div className={styles.summaryRow}>
                                        <div className={styles.summaryItem}>
                                            <span>API Key</span>
                                            <strong data-ready={hasApiKey}>{hasApiKey ? tx("已配置") : tx("未设置")}</strong>
                                        </div>
                                        <div className={styles.summaryItem}>
                                            <span>{tx("温度")}</span>
                                            <strong>{formatTemperature(item.temperature)}</strong>
                                        </div>
                                        <div className={styles.summaryItem}>
                                            <span>Token</span>
                                            <strong>{item.maxTokens ?? tx("按型号默认")}</strong>
                                        </div>
                                    </div>

                                    <p className={`${styles.description} ${description ? "" : styles.descriptionEmpty}`}>
                                        {description || tx("未添加说明")}
                                    </p>

                                    <div className={styles.cardFooter}>
                                        <span className={styles.footerTime}>{tx("更新于")} {formatTime(item.updateTime || item.createTime)}</span>
                                        <button
                                            type="button"
                                            className={styles.editAction}
                                            onClick={() => {
                                                setCurrentItem(item);
                                                setModalVisible(true);
                                            }}
                                        >
                                            <Edit size={16} />
                                            {tx("编辑")}
                                        </button>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                )}

                <div className={styles.paginationContainer}>
                    <Pagination
                        current={current}
                        pageSize={size}
                        total={total}
                        onChange={(page) => aiModelManagementStore.changeCurrentPage(page)}
                        showSizeChanger={false}
                        showTotal={(totalCount, range) => `第 ${range[0]}-${range[1]} 条，共 ${totalCount} 条`}
                        controlClassName={styles.pagination}
                    />
                </div>
            </main>

            <AiModelEditPanel />
        </div>
    );
});

export default AiModelManagement;
