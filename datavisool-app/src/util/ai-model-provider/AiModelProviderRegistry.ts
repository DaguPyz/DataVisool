/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
export type AiModelProviderId =
    | "openai"
    | "qwen"
    | "kimi"
    | "glm"
    | "minimax"
    | "doubao"
    | "hunyuan"
    | "gemini"
    | "grok"
    | "deepseek"
    | "mimo"
    | "anthropic"
    | "ollama"
    | "compatible";

export type AiModelProviderFamily = "openai-compatible" | "anthropic" | "gemini" | "xai-responses";

export type AiModelModelInputMode = "input" | "select";

export interface AiModelProviderOption {
    label: string;
    value: AiModelProviderId;
}

export interface AiModelProviderMeta {
    id: AiModelProviderId;
    label: string;
    family: AiModelProviderFamily;
    tone: "openai" | "qwen" | "deepseek" | "mimo" | "anthropic" | "ollama" | "compatible";
    description: string;
    modelInputMode: AiModelModelInputMode;
    modelOptions: Array<{
        label: string;
        value: string;
    }>;
    defaultModelName: string;
    modelPlaceholder: string;
    defaultBaseUrl: string;
    baseUrlLabel: string;
    baseUrlPlaceholder: string;
    baseUrlRequired: boolean;
    apiKeyLabel: string;
    apiKeyPlaceholder: string;
    apiKeyRequired: boolean;
    apiKeyVisible: boolean;
    temperatureLabel: string;
    temperatureVisible?: boolean;
    temperatureMax?: number;
    temperatureHelp?: string;
    maxTokensLabel: string;
    maxTokensHelp?: string;
}

const PROVIDER_META_MAP: Record<AiModelProviderId, AiModelProviderMeta> = {
    openai: {
        id: "openai",
        label: "OpenAI",
        family: "openai-compatible",
        tone: "openai",
        description: "适用于 OpenAI 官方接口，也适合大多数 OpenAI 兼容网关。gpt-4o-mini / gpt-4.1-mini 支持图片输入。",
        modelInputMode: "select",
        modelOptions: [
            {label: "gpt-4o-mini（推荐）", value: "gpt-4o-mini"},
            {label: "gpt-4.1-mini（推荐）", value: "gpt-4.1-mini"},
            {label: "gpt-4o", value: "gpt-4o"},
        ],
        defaultModelName: "gpt-4o-mini",
        modelPlaceholder: "请选择或输入 OpenAI 模型标识",
        defaultBaseUrl: "https://api.openai.com/v1",
        baseUrlLabel: "接入地址",
        baseUrlPlaceholder: "例如：https://api.openai.com/v1",
        baseUrlRequired: false,
        apiKeyLabel: "API Key",
        apiKeyPlaceholder: "请输入 OpenAI API Key",
        apiKeyRequired: true,
        apiKeyVisible: true,
        temperatureLabel: "Temperature",
        temperatureHelp: "OpenAI 接口普遍支持温度参数。",
        maxTokensLabel: "最大 Token",
        maxTokensHelp: "留空时 GPT-5 系列采用官方建议的 25000 输出预算；其他型号使用厂商默认值。",
    },
    qwen: {
        id: "qwen",
        label: "千问 Qwen",
        family: "openai-compatible",
        tone: "qwen",
        description: "适用于 Qwen、Moonshot、SiliconFlow、自建代理等 OpenAI 兼容接口。",
        modelInputMode: "select",
        modelOptions: [
            {label: "qwen3.7-plus（推荐）", value: "qwen3.7-plus"},
            {label: "qwen3.8-max（旗舰）", value: "qwen3.8-max"},
            {label: "qwen3.7-flash（低成本）", value: "qwen3.7-flash"},
        ],
        defaultModelName: "qwen3.7-plus",
        modelPlaceholder: "请选择千问模型标识",
        defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        baseUrlLabel: "接入地址",
        baseUrlPlaceholder: "例如：https://dashscope.aliyuncs.com/compatible-mode/v1",
        baseUrlRequired: false,
        apiKeyLabel: "API Key",
        apiKeyPlaceholder: "请输入兼容接口 API Key",
        apiKeyRequired: true,
        apiKeyVisible: true,
        temperatureLabel: "Temperature",
        temperatureHelp: "兼容接口通常沿用 OpenAI 参数语义。",
        maxTokensLabel: "最大 Token",
        maxTokensHelp: "留空时使用千问对应型号的官方 API 默认值。",
    },
    kimi: {
        id: "kimi",
        label: "Kimi",
        family: "openai-compatible",
        tone: "qwen",
        description: "适用于 Kimi 官方 OpenAI 兼容接口。Kimi K3 支持 100 万 Token 上下文、图片输入和工具调用。",
        modelInputMode: "select",
        modelOptions: [
            {label: "kimi-k3（推荐）", value: "kimi-k3"},
            {label: "kimi-k2.7-code（编程）", value: "kimi-k2.7-code"},
            {label: "kimi-k2.7-code-highspeed（高速编程）", value: "kimi-k2.7-code-highspeed"},
            {label: "kimi-k2.6（通用）", value: "kimi-k2.6"},
        ],
        defaultModelName: "kimi-k3",
        modelPlaceholder: "请选择 Kimi 模型标识",
        defaultBaseUrl: "https://api.moonshot.cn/v1",
        baseUrlLabel: "接入地址",
        baseUrlPlaceholder: "例如：https://api.moonshot.cn/v1",
        baseUrlRequired: false,
        apiKeyLabel: "Kimi API Key",
        apiKeyPlaceholder: "请输入 Kimi API Key",
        apiKeyRequired: true,
        apiKeyVisible: true,
        temperatureLabel: "Temperature",
        temperatureHelp: "Kimi 使用服务端默认温度；K3 和 K2.7 不支持自定义温度。",
        maxTokensLabel: "Max Completion Tokens",
        maxTokensHelp: "留空时 Kimi K3 默认 131072；其他型号使用 Kimi API 默认值。",
    },
    glm: {
        id: "glm",
        label: "智谱 GLM",
        family: "openai-compatible",
        tone: "qwen",
        description: "适用于智谱 GLM 官方 OpenAI 兼容接口。GLM-5.2 支持 100 万 Token 上下文和工具调用。",
        modelInputMode: "select",
        modelOptions: [
            {label: "glm-5.2（推荐）", value: "glm-5.2"},
            {label: "glm-5v-turbo（视觉编程）", value: "glm-5v-turbo"},
            {label: "glm-5（Agent）", value: "glm-5"},
            {label: "glm-4.7（通用）", value: "glm-4.7"},
        ],
        defaultModelName: "glm-5.2",
        modelPlaceholder: "请选择智谱 GLM 模型标识",
        defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
        baseUrlLabel: "接入地址",
        baseUrlPlaceholder: "例如：https://open.bigmodel.cn/api/paas/v4",
        baseUrlRequired: false,
        apiKeyLabel: "智谱 API Key",
        apiKeyPlaceholder: "请输入智谱 API Key",
        apiKeyRequired: true,
        apiKeyVisible: true,
        temperatureLabel: "Temperature",
        temperatureMax: 1,
        temperatureHelp: "智谱温度范围为 0 到 1；建议只调整 Temperature 或 Top P 其中之一。",
        maxTokensLabel: "Max Tokens",
        maxTokensHelp: "留空时 GLM-5.2、GLM-5V-Turbo、GLM-5 和 GLM-4.7 默认 65536。",
    },
    minimax: {
        id: "minimax",
        label: "MiniMax",
        family: "openai-compatible",
        tone: "compatible",
        description: "适用于 MiniMax OpenAI 兼容接口。MiniMax-M3 支持 100 万 Token 上下文、图片输入和工具调用。",
        modelInputMode: "select",
        modelOptions: [
            {label: "MiniMax-M3（推荐）", value: "MiniMax-M3"},
            {label: "MiniMax-M2.7", value: "MiniMax-M2.7"},
            {label: "MiniMax-M2.5", value: "MiniMax-M2.5"},
        ],
        defaultModelName: "MiniMax-M3",
        modelPlaceholder: "请选择 MiniMax 模型标识",
        defaultBaseUrl: "https://api.minimaxi.com/v1",
        baseUrlLabel: "接入地址",
        baseUrlPlaceholder: "例如：https://api.minimaxi.com/v1",
        baseUrlRequired: false,
        apiKeyLabel: "MiniMax API Key",
        apiKeyPlaceholder: "请输入 MiniMax API Key",
        apiKeyRequired: true,
        apiKeyVisible: true,
        temperatureLabel: "Temperature",
        temperatureMax: 2,
        temperatureHelp: "MiniMax 温度范围为 0 到 2，默认值为 1。",
        maxTokensLabel: "Max Completion Tokens",
        maxTokensHelp: "留空时使用 MiniMax 服务端默认值。",
    },
    doubao: {
        id: "doubao",
        label: "豆包（火山方舟）",
        family: "openai-compatible",
        tone: "compatible",
        description: "适用于火山方舟在线推理接口。Doubao Seed 2.0 Lite 支持多模态理解和工具调用。",
        modelInputMode: "select",
        modelOptions: [
            {label: "Doubao Seed 2.0 Lite（推荐）", value: "doubao-seed-2-0-lite-260215"},
            {label: "Doubao Seed 2.0 Pro", value: "doubao-seed-2-0-pro-260215"},
            {label: "Doubao Seed 2.0 Code", value: "doubao-seed-2-0-code-preview-260215"},
        ],
        defaultModelName: "doubao-seed-2-0-lite-260215",
        modelPlaceholder: "请选择豆包模型标识",
        defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
        baseUrlLabel: "接入地址",
        baseUrlPlaceholder: "例如：https://ark.cn-beijing.volces.com/api/v3",
        baseUrlRequired: false,
        apiKeyLabel: "方舟 API Key",
        apiKeyPlaceholder: "请输入火山方舟 API Key",
        apiKeyRequired: true,
        apiKeyVisible: true,
        temperatureLabel: "Temperature",
        temperatureHelp: "不同豆包型号支持的参数范围可能不同。",
        maxTokensLabel: "Max Tokens",
        maxTokensHelp: "留空时使用火山方舟服务端默认值。",
    },
    hunyuan: {
        id: "hunyuan",
        label: "腾讯混元",
        family: "openai-compatible",
        tone: "compatible",
        description: "适用于腾讯混元 OpenAI 兼容接口。hunyuan-turbos-latest 支持工具调用，hunyuan-vision 支持图片理解。",
        modelInputMode: "select",
        modelOptions: [
            {label: "hunyuan-turbos-latest（推荐）", value: "hunyuan-turbos-latest"},
            {label: "hunyuan-vision（图片理解）", value: "hunyuan-vision"},
        ],
        defaultModelName: "hunyuan-turbos-latest",
        modelPlaceholder: "请选择腾讯混元模型标识",
        defaultBaseUrl: "https://api.hunyuan.cloud.tencent.com/v1",
        baseUrlLabel: "接入地址",
        baseUrlPlaceholder: "例如：https://api.hunyuan.cloud.tencent.com/v1",
        baseUrlRequired: false,
        apiKeyLabel: "混元 API Key",
        apiKeyPlaceholder: "请输入腾讯混元 API Key",
        apiKeyRequired: true,
        apiKeyVisible: true,
        temperatureLabel: "Temperature",
        temperatureHelp: "不同混元型号支持的参数范围可能不同。",
        maxTokensLabel: "Max Tokens",
        maxTokensHelp: "留空时使用腾讯混元服务端默认值。",
    },
    gemini: {
        id: "gemini",
        label: "Google Gemini",
        family: "gemini",
        tone: "compatible",
        description: "适用于 Gemini Interactions API。Gemini 3.6 Flash 支持图片理解和工具调用。",
        modelInputMode: "select",
        modelOptions: [
            {label: "Gemini 3.6 Flash（推荐）", value: "gemini-3.6-flash"},
            {label: "Gemini 3.5 Flash-Lite（高速）", value: "gemini-3.5-flash-lite"},
        ],
        defaultModelName: "gemini-3.6-flash",
        modelPlaceholder: "请选择 Gemini 模型标识",
        defaultBaseUrl: "https://generativelanguage.googleapis.com",
        baseUrlLabel: "接入地址",
        baseUrlPlaceholder: "例如：https://generativelanguage.googleapis.com",
        baseUrlRequired: false,
        apiKeyLabel: "Gemini API Key",
        apiKeyPlaceholder: "请输入 Gemini API Key",
        apiKeyRequired: true,
        apiKeyVisible: true,
        temperatureLabel: "Temperature",
        temperatureVisible: false,
        temperatureHelp: "Gemini 3.6 Flash 和 3.5 Flash-Lite 不支持此参数。",
        maxTokensLabel: "Max Output Tokens",
        maxTokensHelp: "留空时使用 Gemini 服务端默认值。",
    },
    grok: {
        id: "grok",
        label: "xAI Grok",
        family: "xai-responses",
        tone: "compatible",
        description: "适用于 xAI Responses API。Grok 4.6 支持图片理解、工具调用和推理。",
        modelInputMode: "select",
        modelOptions: [
            {label: "Grok 4.6（推荐）", value: "grok-4.6"},
        ],
        defaultModelName: "grok-4.6",
        modelPlaceholder: "请选择 Grok 模型标识",
        defaultBaseUrl: "https://api.x.ai/v1",
        baseUrlLabel: "接入地址",
        baseUrlPlaceholder: "例如：https://api.x.ai/v1",
        baseUrlRequired: false,
        apiKeyLabel: "xAI API Key",
        apiKeyPlaceholder: "请输入 xAI API Key",
        apiKeyRequired: true,
        apiKeyVisible: true,
        temperatureLabel: "Temperature",
        temperatureHelp: "Grok Responses API 支持 Temperature 参数。",
        maxTokensLabel: "Max Output Tokens",
        maxTokensHelp: "留空时使用 xAI 服务端默认值。",
    },
    deepseek: {
        id: "deepseek",
        label: "DeepSeek",
        family: "openai-compatible",
        tone: "deepseek",
        description: "适用于 DeepSeek 官方接口。deepseek-chat / deepseek-reasoner 为纯文本模型，不支持图片输入。",
        modelInputMode: "select",
        modelOptions: [
            {label: "deepseek-chat", value: "deepseek-chat"},
            {label: "deepseek-reasoner", value: "deepseek-reasoner"},
        ],
        defaultModelName: "deepseek-chat",
        modelPlaceholder: "请选择 DeepSeek 模型标识",
        defaultBaseUrl: "https://api.deepseek.com",
        baseUrlLabel: "接入地址",
        baseUrlPlaceholder: "例如：https://api.deepseek.com",
        baseUrlRequired: false,
        apiKeyLabel: "API Key",
        apiKeyPlaceholder: "请输入 DeepSeek API Key",
        apiKeyRequired: true,
        apiKeyVisible: true,
        temperatureLabel: "Temperature",
        temperatureHelp: "DeepSeek 接口支持常规温度设置。",
        maxTokensLabel: "最大 Token",
        maxTokensHelp: "留空时 DeepSeek-V4 思考模式默认 65536，包含思考与回答。",
    },
    mimo: {
        id: "mimo",
        label: "小米 MiMo",
        family: "openai-compatible",
        tone: "mimo",
        description: "适用于小米 MiMo API Provider 的 OpenAI 兼容接口。mimo-v2.6-flash 和 mimo-v2.6-pro 支持多模态理解。",
        modelInputMode: "select",
        modelOptions: [
            {label: "mimo-v2.6-flash（推荐）", value: "mimo-v2.6-flash"},
            {label: "mimo-v2.6-pro（Agent/长任务）", value: "mimo-v2.6-pro"},
        ],
        defaultModelName: "mimo-v2.6-flash",
        modelPlaceholder: "请选择小米 MiMo 模型标识",
        defaultBaseUrl: "https://api.xiaomimimo.com/v1",
        baseUrlLabel: "接入地址",
        baseUrlPlaceholder: "例如：https://api.xiaomimimo.com/v1",
        baseUrlRequired: false,
        apiKeyLabel: "MIMO API Key",
        apiKeyPlaceholder: "请输入小米 MiMo API Key",
        apiKeyRequired: true,
        apiKeyVisible: true,
        temperatureLabel: "Temperature",
        temperatureHelp: "官方范围为 0 到 1.5；思考模式下固定为 1.0。",
        maxTokensLabel: "Max Completion Tokens",
        maxTokensHelp: "留空时 MiMo-V2.6 默认 131072；包含思考与回答。",
    },
    anthropic: {
        id: "anthropic",
        label: "Anthropic",
        family: "anthropic",
        tone: "anthropic",
        description: "适用于 Anthropic Claude Messages API。所有 Claude 模型均支持图片输入。",
        modelInputMode: "input",
        modelOptions: [],
        defaultModelName: "claude-sonnet-4-20250514",
        modelPlaceholder: "例如：claude-sonnet-4-20250514",
        defaultBaseUrl: "https://api.anthropic.com",
        baseUrlLabel: "接入地址",
        baseUrlPlaceholder: "例如：https://api.anthropic.com",
        baseUrlRequired: false,
        apiKeyLabel: "Anthropic API Key",
        apiKeyPlaceholder: "请输入 Anthropic API Key",
        apiKeyRequired: true,
        apiKeyVisible: true,
        temperatureLabel: "Temperature",
        temperatureHelp: "Anthropic Messages API 支持 temperature。",
        maxTokensLabel: "Max Tokens",
        maxTokensHelp: "留空时按目录中 Claude 型号的官方输出上限设置；未收录型号需填写。",
    },
    ollama: {
        id: "ollama",
        label: "Ollama",
        family: "openai-compatible",
        tone: "ollama",
        description: "适用于本地 Ollama 或提供 OpenAI 兼容层的本地模型服务。llama3.1 为纯文本模型，llama3.2-vision / llava 支持图片输入。",
        modelInputMode: "input",
        modelOptions: [],
        defaultModelName: "llama3.1",
        modelPlaceholder: "例如：llama3.1、qwen2.5、deepseek-r1",
        defaultBaseUrl: "http://localhost:11434/v1",
        baseUrlLabel: "本地地址",
        baseUrlPlaceholder: "例如：http://localhost:11434/v1",
        baseUrlRequired: false,
        apiKeyLabel: "API Key",
        apiKeyPlaceholder: "Ollama 通常无需 API Key",
        apiKeyRequired: false,
        apiKeyVisible: false,
        temperatureLabel: "Temperature",
        temperatureHelp: "本地模型通常也支持温度设置。",
        maxTokensLabel: "最大 Token",
        maxTokensHelp: "留空时使用本地模型服务的默认值。",
    },
    compatible: {
        id: "compatible",
        label: "OpenAI 兼容",
        family: "openai-compatible",
        tone: "compatible",
        description: "适用于 Qwen、Moonshot、SiliconFlow、自建代理等 OpenAI 兼容接口。图片支持取决于模型，需通过模型名中的 vision/vl 等关键词判定。",
        modelInputMode: "input",
        modelOptions: [],
        defaultModelName: "",
        modelPlaceholder: "例如：qwen-plus、moonshot-v1-128k、gpt-4o-mini",
        defaultBaseUrl: "",
        baseUrlLabel: "兼容地址",
        baseUrlPlaceholder: "例如：https://your-endpoint/v1",
        baseUrlRequired: true,
        apiKeyLabel: "API Key",
        apiKeyPlaceholder: "请输入兼容接口 API Key",
        apiKeyRequired: true,
        apiKeyVisible: true,
        temperatureLabel: "Temperature",
        temperatureHelp: "兼容接口通常沿用 OpenAI 参数语义。",
        maxTokensLabel: "最大 Token",
        maxTokensHelp: "留空时使用兼容接口对应型号的默认值。",
    },
};

const PROVIDER_ALIAS_MAP: Record<string, AiModelProviderId> = {
    openai: "openai",
    qwen: "qwen",
    dashscope: "qwen",
    kimi: "kimi",
    moonshot: "kimi",
    glm: "glm",
    zhipu: "glm",
    bigmodel: "glm",
    minimax: "minimax",
    "mini-max": "minimax",
    doubao: "doubao",
    volcengine: "doubao",
    ark: "doubao",
    hunyuan: "hunyuan",
    tencent: "hunyuan",
    "tencent-hunyuan": "hunyuan",
    gemini: "gemini",
    google: "gemini",
    "google-gemini": "gemini",
    grok: "grok",
    xai: "grok",
    "x-ai": "grok",
    "openai-compatible": "compatible",
    compatible: "compatible",
    custom: "compatible",
    deepseek: "deepseek",
    mimo: "mimo",
    xiaomi: "mimo",
    "xiaomi-mimo": "mimo",
    anthropic: "anthropic",
    claude: "anthropic",
    ollama: "ollama",
};

// 首页 AI 模型管理只允许新建和编辑当前产品支持的提供商，历史 provider 元数据仍保留用于旧数据展示。
const SELECTABLE_PROVIDER_IDS: AiModelProviderId[] = ["openai", "qwen", "kimi", "glm", "minimax", "doubao", "hunyuan", "gemini", "grok", "deepseek", "mimo", "anthropic"];

const resolveDisplayProviderId = (value?: string | null): AiModelProviderId | null => {
    const normalized = value?.trim().toLowerCase();
    if (!normalized) {
        return null;
    }

    return PROVIDER_ALIAS_MAP[normalized] ?? (normalized in PROVIDER_META_MAP ? normalized as AiModelProviderId : null);
};

export const normalizeAiModelProviderId = (value?: string | null): AiModelProviderId => {
    const normalized = value?.trim().toLowerCase();
    if (!normalized) {
        return "deepseek";
    }

    return PROVIDER_ALIAS_MAP[normalized] ?? (normalized in PROVIDER_META_MAP ? normalized as AiModelProviderId : "compatible");
};

// 判断 provider 是否允许在首页 AI 模型管理中作为新建/编辑选项出现。
export const isAiModelProviderSelectable = (value?: string | null): boolean => {
    const providerId = resolveDisplayProviderId(value);
    return Boolean(providerId && SELECTABLE_PROVIDER_IDS.includes(providerId));
};

export const getAiModelProviderMeta = (value?: string | null): AiModelProviderMeta => {
    const providerId = normalizeAiModelProviderId(value);
    return PROVIDER_META_MAP[providerId] ?? PROVIDER_META_MAP.compatible;
};

export const getAiModelProviderOptions = (): AiModelProviderOption[] => {
    return SELECTABLE_PROVIDER_IDS.map((providerId) => {
        const item = PROVIDER_META_MAP[providerId];
        return {
            label: item.label,
            value: item.id,
        };
    });
};

export const getAiModelProviderLabel = (value?: string | null) => {
    const providerId = resolveDisplayProviderId(value);
    if (providerId) {
        return PROVIDER_META_MAP[providerId].label;
    }

    const fallback = value?.trim();
    return fallback || "自定义";
};

export const getAiModelProviderTone = (value?: string | null) => {
    const providerId = resolveDisplayProviderId(value);
    return providerId ? PROVIDER_META_MAP[providerId].tone : "compatible";
};

export const getAiModelProviderFamily = (value?: string | null) => {
    const providerId = resolveDisplayProviderId(value);
    return providerId ? PROVIDER_META_MAP[providerId].family : "openai-compatible";
};

export const isAiModelProviderApiKeyVisible = (value?: string | null) => {
    return getAiModelProviderMeta(value).apiKeyVisible;
};

export const isAiModelProviderBaseUrlRequired = (value?: string | null) => {
    return getAiModelProviderMeta(value).baseUrlRequired;
};

export const getAiModelProviderDefaultModelName = (value?: string | null) => {
    return getAiModelProviderMeta(value).defaultModelName;
};

export const getAiModelProviderDefaultBaseUrl = (value?: string | null) => {
    return getAiModelProviderMeta(value).defaultBaseUrl;
};
