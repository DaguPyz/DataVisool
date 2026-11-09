/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {Check, Close, Cube, DataServer, Down, Info, LinkOne, Lock, PreviewClose, Star, Thermometer} from "@icon-park/react";
import {observer} from "mobx-react";
import {type ReactNode, useEffect, useRef, useState} from "react";
import aiModelManagementStore from "@/pages/home/ai-model-management/AiModelManagementStore.ts";
import styles from "@/pages/home/ai-model-management/AiModelManagement.module.less";
import "@/pages/home/ai-model-management/AiModelEditPanel.compact.less";
import aiModalCube from "@/pages/home/ai-model-management/assets/ai-modal-cube.webp";
import {Button, Dialog, Input, NumberInput, Select, Slider, Switch, TextArea} from "@datavisool/ui";
import {
    getLocale,
    tx,
} from "@/i18n/miniI18n.ts";
import {useLocaleVersion} from "@/i18n/useLocaleVersion.ts";
import {
    getAiModelProviderDefaultBaseUrl,
    getAiModelProviderMeta,
    getAiModelProviderOptions,
    isAiModelProviderSelectable,
    isAiModelProviderApiKeyVisible,
    isAiModelProviderBaseUrlRequired,
    normalizeAiModelProviderId,
    type AiModelProviderId,
} from "@/util/ai-model-provider/AiModelProviderRegistry.ts";

type AiModelFormValues = {
    name: string;
    provider: AiModelProviderId;
    baseUrl?: string;
    apiKey?: string;
    clearApiKey?: boolean;
    description?: string;
    temperature?: number;
    maxTokens?: number;
    enabled: boolean;
    isDefault: boolean;
};

type AiModelFormErrors = Partial<Record<keyof AiModelFormValues, string>>;

const DEFAULT_PROVIDER: AiModelProviderId = "deepseek";

const DEFAULT_VALUES: AiModelFormValues = {
    name: "",
    provider: DEFAULT_PROVIDER,
    baseUrl: getAiModelProviderDefaultBaseUrl(DEFAULT_PROVIDER),
    apiKey: "",
    clearApiKey: false,
    description: "",
    temperature: 0.7,
    maxTokens: undefined,
    enabled: true,
    isDefault: false,
};

// 旧数据中的已下线 provider 打开编辑时回落到当前可选的默认 provider。
const normalizeSelectableProviderId = (value?: string | null): AiModelProviderId => {
    const provider = normalizeAiModelProviderId(value);
    return isAiModelProviderSelectable(provider) ? provider : DEFAULT_PROVIDER;
};

const FieldLabel = ({children, optional, info}: {children: ReactNode; optional?: boolean; info?: boolean}) => (
    <span className={styles.modalLabel} data-ai-model-label>
        <span className={styles.labelDot} />
        <span>{children}</span>
        <span className={styles.labelDotTrailing} />
        {optional ? <span className={styles.labelOptional}>{tx("（可选）")}</span> : null}
        {info ? <Info size={16} className={styles.labelInfo} /> : null}
    </span>
);

const Field = ({
    label,
    error,
    extra,
    full,
    className,
    children,
}: {
    label: ReactNode;
    error?: string;
    extra?: ReactNode;
    full?: boolean;
    className?: string;
    children: ReactNode;
}) => (
    <div className={`${styles.modalField} ${full ? styles.modalFieldFull : ""} ${error ? styles.modalFieldInvalid : ""} ${className ?? ""}`} data-ai-model-field>
        <div className={styles.modalFieldLabel} data-ai-model-field-label>{label}</div>
        <div className={styles.modalFieldControl}>{children}</div>
        {error ? <div className={styles.modalFieldError} data-ai-model-field-message>{error}</div> : null}
        {extra && !error ? <div className={styles.modalFieldExtra} data-ai-model-field-message>{extra}</div> : null}
    </div>
);

const isFieldTouched = (value: unknown) => {
    return typeof value === "string" ? value.trim().length > 0 : Boolean(value);
};

const AiModelEditPanel = observer(() => {
    useLocaleVersion();
    const { currentItem, modalVisible, setModalVisible } = aiModelManagementStore;
    const [formValues, setFormValues] = useState<AiModelFormValues>(DEFAULT_VALUES);
    const [formErrors, setFormErrors] = useState<AiModelFormErrors>({});
    const [saving, setSaving] = useState(false);
    const savingRef = useRef(false);
    const clearApiKey = formValues.clearApiKey ?? false;
    const providerValue = normalizeSelectableProviderId(formValues.provider ?? DEFAULT_PROVIDER);
    const nameValue = formValues.name ?? "";
    const descriptionValue = formValues.description ?? "";
    const temperatureValue = formValues.temperature ?? 0.7;
    const providerMeta = getAiModelProviderMeta(providerValue);
    const providerRef = useRef<AiModelProviderId>(DEFAULT_PROVIDER);
    const hasSavedApiKey = currentItem?.hasApiKey === true;
    const isEnUS = getLocale() === "en-US";
    const modalTitle = isEnUS
        ? (currentItem?.id ? tx("编辑AI模型") : tx("新建AI模型"))
        : (currentItem?.id ? "编辑 AI 模型" : "新建 AI 模型");

    const buildRequiredMessage = (label: string) => (
        isEnUS ? `Please enter ${label}` : `请输入${label}`
    );

    const buildApiKeyPlaceholder = () => {
        if (clearApiKey) {
            return tx("保存后将清空已保存的 API Key");
        }
        if (hasSavedApiKey) {
            return isEnUS
                ? `Enter a new ${tx(providerMeta.apiKeyLabel)} to replace the saved one`
                : `如需更换请输入新的 ${tx(providerMeta.apiKeyLabel)}`;
        }
        return buildRequiredMessage(tx(providerMeta.apiKeyLabel));
    };

    useEffect(() => {
        if (!modalVisible) {
            setFormValues(DEFAULT_VALUES);
            setFormErrors({});
            return;
        }

        const normalizedProvider = normalizeSelectableProviderId(currentItem?.provider ?? DEFAULT_PROVIDER);
        const initialProviderMeta = getAiModelProviderMeta(normalizedProvider);
        providerRef.current = normalizedProvider;

        setFormValues({
            ...DEFAULT_VALUES,
            provider: normalizedProvider,
            name: currentItem?.name ?? "",
            baseUrl: currentItem?.baseUrl?.trim() || initialProviderMeta.defaultBaseUrl,
            apiKey: "",
            clearApiKey: false,
            description: currentItem?.description ?? "",
            temperature: initialProviderMeta.temperatureVisible === false
                ? undefined
                : (typeof currentItem?.temperature === "number" ? currentItem.temperature : 0.7),
            maxTokens: typeof currentItem?.maxTokens === "number" ? currentItem.maxTokens : undefined,
            enabled: currentItem?.enabled !== 0,
            isDefault: currentItem?.isDefault === 1,
        });
        setFormErrors({});
    }, [currentItem, modalVisible]);

    const close = () => {
        if (savingRef.current) return;
        setModalVisible(false);
        setFormValues(DEFAULT_VALUES);
        setFormErrors({});
    };

    const syncProviderDefaults = (nextProviderValue: string, nextValues: AiModelFormValues): Partial<AiModelFormValues> => {
        const nextProvider = normalizeSelectableProviderId(nextProviderValue);
        const previousProvider = providerRef.current;
        const previousMeta = getAiModelProviderMeta(previousProvider);
        const nextMeta = getAiModelProviderMeta(nextProvider);
        const nextBaseUrl = typeof nextValues.baseUrl === "string" ? nextValues.baseUrl.trim() : "";
        const patch: Partial<AiModelFormValues> = {
            provider: nextProvider,
        };

        if (!isFieldTouched(nextBaseUrl) || nextBaseUrl === previousMeta.defaultBaseUrl) {
            patch.baseUrl = nextMeta.defaultBaseUrl;
        }
        if (!nextMeta.apiKeyVisible) {
            patch.apiKey = "";
            patch.clearApiKey = false;
        }
        if (nextMeta.temperatureVisible === false) {
            patch.temperature = undefined;
        }
        if (typeof nextMeta.temperatureMax === "number" && typeof nextValues.temperature === "number" && nextValues.temperature > nextMeta.temperatureMax) {
            patch.temperature = nextMeta.temperatureMax;
        }

        providerRef.current = nextProvider;
        return patch;
    };

    const updateField = <K extends keyof AiModelFormValues>(field: K, value: AiModelFormValues[K]) => {
        setFormValues((prev) => {
            let nextValues: AiModelFormValues = {...prev, [field]: value};

            if (field === "isDefault" && value === true) {
                nextValues = {...nextValues, enabled: true};
            }
            if (field === "enabled" && value === false) {
                nextValues = {...nextValues, isDefault: false};
            }
            if (field === "provider") {
                const patch = syncProviderDefaults(String(value), nextValues);
                nextValues = {...nextValues, ...patch};
            }

            return nextValues;
        });
        setFormErrors((prev) => {
            if (!prev[field])
                return prev;
            const rest = {...prev};
            delete rest[field];
            return rest;
        });
    };

    const validateValues = (values: AiModelFormValues) => {
        const nextErrors: AiModelFormErrors = {};
        const normalizedProvider = normalizeSelectableProviderId(values.provider);
        const normalizedProviderMeta = getAiModelProviderMeta(normalizedProvider);

        if (!values.name?.trim()) {
            nextErrors.name = tx("请输入模型名称");
        } else if (values.name.length > 100) {
            nextErrors.name = tx("模型名称不能超过100个字符");
        }

        if (!values.provider) {
            nextErrors.provider = tx("请选择提供商");
        }

        if (isAiModelProviderBaseUrlRequired(normalizedProvider) && !values.baseUrl?.trim()) {
            nextErrors.baseUrl = buildRequiredMessage(tx(normalizedProviderMeta.baseUrlLabel));
        } else if ((values.baseUrl?.length ?? 0) > 300) {
            nextErrors.baseUrl = tx("接入地址不能超过300个字符");
        } else if (values.baseUrl?.trim()) {
            try {
                const url = new URL(values.baseUrl.trim());
                if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) throw new Error("Invalid URL");
            } catch {
                nextErrors.baseUrl = tx("请输入有效的 HTTP 或 HTTPS 接入地址");
            }
        }

        if (normalizedProviderMeta.apiKeyVisible) {
            const apiKeyRequired = normalizedProviderMeta.apiKeyRequired
                && !values.clearApiKey && (!currentItem?.id || !hasSavedApiKey);
            if (apiKeyRequired && !values.apiKey?.trim()) {
                nextErrors.apiKey = buildRequiredMessage(tx(normalizedProviderMeta.apiKeyLabel));
            } else if ((values.apiKey?.length ?? 0) > 300) {
                nextErrors.apiKey = tx("API Key不能超过300个字符");
            }
        }

        if (normalizedProviderMeta.temperatureVisible !== false && (typeof values.temperature !== "number" || Number.isNaN(values.temperature))) {
            nextErrors.temperature = buildRequiredMessage(tx(normalizedProviderMeta.temperatureLabel));
        }

        if (typeof values.maxTokens === "number" && (values.maxTokens < 1 || values.maxTokens > 200000)) {
            nextErrors.maxTokens = tx("最大 Token 数需在 1 到 200000 之间");
        }

        if ((values.description?.length ?? 0) > 300) {
            nextErrors.description = tx("描述不能超过300个字符");
        }

        return nextErrors;
    };

    const handleSave = async () => {
        if (savingRef.current) return;
        const values = formValues;
        const nextErrors = validateValues(values);
        setFormErrors(nextErrors);

        if (Object.keys(nextErrors).length > 0) {
            return;
        }

        const normalizedProvider = normalizeSelectableProviderId(values.provider);
        const normalizedProviderMeta = getAiModelProviderMeta(normalizedProvider);
        const trimmedApiKey = values.apiKey?.trim() || "";
        const keepExistingApiKey = Boolean(
            normalizedProviderMeta.apiKeyVisible
            && currentItem?.id
            && hasSavedApiKey
            && !values.clearApiKey
            && !trimmedApiKey,
        );
        const normalizedBaseUrl = values.baseUrl?.trim() || normalizedProviderMeta.defaultBaseUrl;

        const nextItem = {
            id: currentItem?.id,
            name: values.name.trim(),
            provider: normalizedProvider,
            providerLabel: normalizedProviderMeta.label,
            providerFamily: normalizedProviderMeta.family,
            baseUrl: normalizedBaseUrl,
            apiKey: normalizedProviderMeta.apiKeyVisible
                ? (keepExistingApiKey ? undefined : trimmedApiKey)
                : undefined,
            hasApiKey: normalizedProviderMeta.apiKeyVisible
                ? (keepExistingApiKey ? true : !!trimmedApiKey)
                : false,
            clearApiKey: normalizedProviderMeta.apiKeyVisible
                ? (values.clearApiKey ? 1 : 0)
                : 1,
            description: values.description?.trim() || "",
            temperature: normalizedProviderMeta.temperatureVisible === false
                ? undefined
                : (typeof values.temperature === "number" ? values.temperature : 0.7),
            maxTokens: typeof values.maxTokens === "number" ? values.maxTokens : undefined,
            enabled: values.isDefault ? 1 : (values.enabled ? 1 : 0),
            isDefault: values.isDefault ? 1 : 0,
        };
        savingRef.current = true;
        setSaving(true);
        try {
            await aiModelManagementStore.saveModel(nextItem);
        } finally {
            savingRef.current = false;
            setSaving(false);
        }
    };

    return (
        <Dialog
            open={modalVisible}
            onClose={close}
            mask
            maskClosable={false}
            width="60vw"
            centered
            className={`${styles.aiModelDialog} ai-model-dialog-compact`}
            bodyClassName={`${styles.aiModelDialogBody} ai-model-dialog-compact-body`}
            hideHeader
        >
            <button className={styles.modalCloseButton} data-ai-model-close type="button" onClick={close} disabled={saving}>
                <Close size={22} />
            </button>
            <div className={styles.modalHeader} data-ai-model-header>
                <img className={styles.modalHeaderIcon} data-ai-model-header-icon src={aiModalCube} alt="" />
                <div>
                    <div className={styles.modalTitle} data-ai-model-title>{modalTitle}</div>
                    <div className={styles.modalSubtitle} data-ai-model-subtitle>{tx(providerMeta.description)}</div>
                </div>
            </div>
            <div className="ai-model-dialog-scroll-content" data-ai-model-scroll-content>
                <div className={styles.editForm} data-ai-model-edit-form>
                    <div className={styles.modalSection} data-ai-model-section>
                    <div className={styles.baseFields} data-ai-model-base-fields>
                        <div className={styles.baseFieldRow} data-ai-model-base-row>
                            <Field label={<FieldLabel>{tx("模型名称")}</FieldLabel>} error={formErrors.name}>
                                <Input
                                    value={formValues.name}
                                    onChange={(value) => updateField("name", value)}
                                    prefix={<Cube size={18} />}
                                    suffix={<span className={styles.inputCount} data-ai-model-input-count>{`${String(nameValue).length} / 100`}</span>}
                                    placeholder={tx("例如：默认对话模型")}
                                    maxLength={100}
                                />
                            </Field>
                            <Field label={<FieldLabel>{tx("提供商")}</FieldLabel>} error={formErrors.provider}>
                                <Select
                                    value={formValues.provider}
                                    onChange={(value) => updateField("provider", normalizeSelectableProviderId(String(value)))}
                                    className={styles.modalSelect}
                                    suffixIcon={<Down size={18} />}
                                    options={getAiModelProviderOptions().map((option) => ({
                                        ...option,
                                        label: tx(option.label),
                                    }))}
                                    placeholder={tx("请选择提供商")}
                                    block
                                />
                            </Field>
                        </div>

                        <Field
                            full
                            label={<FieldLabel optional={!isAiModelProviderBaseUrlRequired(providerValue)}>{tx(providerMeta.baseUrlLabel)}</FieldLabel>}
                            error={formErrors.baseUrl}
                        >
                            <Input
                                value={formValues.baseUrl}
                                onChange={(value) => updateField("baseUrl", value)}
                                suffix={<LinkOne size={18} />}
                                placeholder={tx(providerMeta.baseUrlPlaceholder)}
                                maxLength={300}
                            />
                        </Field>

                        {isAiModelProviderApiKeyVisible(providerValue) ? (
                            <Field
                                full
                                className={styles.apiKeyRow}
                                label={<FieldLabel>{tx(providerMeta.apiKeyLabel)}</FieldLabel>}
                                error={formErrors.apiKey}
                                extra={hasSavedApiKey && !clearApiKey
                                    ? tx("已保存 API Key，留空则保持原值，不会明文回显。")
                                    : undefined
                                }
                            >
                                <Input
                                    value={formValues.apiKey}
                                    onChange={(value) => updateField("apiKey", value)}
                                    type="password"
                                    prefix={<Lock size={18} />}
                                    suffix={<PreviewClose size={18} />}
                                    placeholder={buildApiKeyPlaceholder()}
                                    maxLength={300}
                                    autoComplete="off"
                                    disabled={clearApiKey}
                                />
                            </Field>
                        ) : (
                            <div className={styles.apiKeyRow}>
                                <div className={styles.inlineNotice} data-ai-model-notice>
                                    {`${tx(providerMeta.label)} ${tx("不需要单独配置 API Key，系统会在保存时自动清空旧密钥。")}`}
                                </div>
                            </div>
                        )}

                        {currentItem?.id && hasSavedApiKey && isAiModelProviderApiKeyVisible(providerValue) ? (
                            <Field
                                full
                                className={styles.apiKeyRow}
                                label={<FieldLabel optional>{tx("API Key 操作")}</FieldLabel>}
                            >
                                <Switch
                                    value={clearApiKey}
                                    onChange={(value) => updateField("clearApiKey", value)}
                                    text={clearApiKey ? tx("清空已保存 Key") : tx("保留已保存 Key")}
                                />
                            </Field>
                        ) : null}
                    </div>
                </div>

                    <div className={styles.modalSection} data-ai-model-section>
                    <div className={styles.formGrid} data-ai-model-grid>
                        {providerMeta.temperatureVisible !== false ? (
                            <Field label={<FieldLabel info>{tx(providerMeta.temperatureLabel)}</FieldLabel>} error={formErrors.temperature}>
                                <div className={styles.temperatureBox} data-ai-model-temperature-box>
                                    <Thermometer size={20} />
                                    <span className={styles.temperatureValue} data-ai-model-temperature-value>{Number(temperatureValue).toFixed(1)}</span>
                                    <Slider
                                        value={formValues.temperature}
                                        onChange={(value) => updateField("temperature", value)}
                                        min={0}
                                        max={providerMeta.temperatureMax ?? 2}
                                        step={0.1}
                                    />
                                </div>
                                <div className={styles.fieldHelp} data-ai-model-field-help>{tx(providerMeta.temperatureHelp ?? "")}</div>
                            </Field>
                        ) : null}
                        <Field
                            label={<FieldLabel optional info>{tx(providerMeta.maxTokensLabel)}</FieldLabel>}
                            error={formErrors.maxTokens}
                            extra={tx(providerMeta.maxTokensHelp ?? "")}
                        >
                            <NumberInput
                                value={formValues.maxTokens}
                                onChange={(value) => updateField("maxTokens", value)}
                                suffix={<DataServer size={18} />}
                                min={1}
                                max={200000}
                                precision={0}
                                controls={false}
                                placeholder={tx("留空时按型号使用默认值")}
                            />
                        </Field>
                    </div>
                </div>

                    <div className={`${styles.modalSection} ${styles.descriptionSection}`} data-ai-model-section data-ai-model-description-section>
                    <Field full label={<FieldLabel optional info>{tx("描述")}</FieldLabel>} error={formErrors.description}>
                        <TextArea
                            value={formValues.description}
                            onChange={(value) => updateField("description", value)}
                            placeholder={tx("补充说明模型用途、适用场景或限流说明")}
                            rows={3}
                            maxLength={300}
                        />
                    </Field>
                    <div className={styles.textareaCount} data-ai-model-textarea-count>{`${String(descriptionValue).length} / 300`}</div>
                </div>

                    <div className={`${styles.statusRow} ${styles.switchGrid}`} data-ai-model-status>
                    <SwitchCard
                        title={tx("启用状态")}
                        icon={<Check size={24} />}
                        checked={formValues.enabled}
                        onChange={(value) => updateField("enabled", value)}
                    />
                    <SwitchCard
                        title={tx("默认模型")}
                        icon={<Star size={24} />}
                        checked={formValues.isDefault}
                        onChange={(value) => updateField("isDefault", value)}
                    />
                </div>

                    <div className={styles.modalActions} data-ai-model-actions>
                    <Button className={styles.modalCancelButton} data-ai-model-action="cancel" type="default" onClick={close} disabled={saving}>
                        {tx("取消")}
                    </Button>
                    <Button className={styles.modalCreateButton} data-ai-model-action="submit" type="primary" onClick={handleSave} loading={saving} disabled={saving}>
                        {currentItem?.id ? tx("保存") : tx("创建")}
                    </Button>
                    </div>
                </div>
            </div>
        </Dialog>
    );
});

const SwitchCard = ({
    checked,
    onChange,
    title,
    icon,
}: {
    checked?: boolean;
    onChange?: (value: boolean) => void;
    title: ReactNode;
    icon: ReactNode;
}) => (
    <div className={`${styles.statusCard} ${checked ? styles.statusCardActive : ""}`} data-ai-model-status-card>
        <div className={styles.statusCardTitle}>
            <FieldLabel optional info>{title}</FieldLabel>
        </div>
        <div className={styles.statusCardBody} data-ai-model-status-card-body>
            <Switch value={checked} onChange={onChange} />
            <div className={styles.statusCardIcon} data-ai-model-status-card-icon>{icon}</div>
        </div>
    </div>
);

export default AiModelEditPanel;
