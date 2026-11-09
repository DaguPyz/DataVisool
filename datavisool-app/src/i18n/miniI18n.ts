/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {sourceTermEnUS, sourceTextEnUS} from "@/i18n/sourceMessages.ts";

export type LocaleCode = 'zh-CN' | 'en-US';

const DEFAULT_LOCALE: LocaleCode = 'zh-CN';
const STORAGE_KEY = 'datavisool-i18n-locale';

const localeCodes: LocaleCode[] = ['zh-CN', 'en-US'];

type LocaleChangeListener = (locale: LocaleCode) => void;

const listeners = new Set<LocaleChangeListener>();
let domTranslatorStarted = false;
let domObserver: MutationObserver | null = null;
const originalTextByNode = new WeakMap<Text, string>();
const translatedAttrSource = 'data-datavisool-i18n-source-';

const isLocaleCode = (locale: string | null | undefined): locale is LocaleCode => (
    localeCodes.includes(locale as LocaleCode)
);

const normalizeSystemLocale = (locale: string | null | undefined): LocaleCode | null => {
    if (!locale)
        return null;
    const normalized = locale.toLowerCase();
    if (normalized.startsWith('zh'))
        return 'zh-CN';
    if (normalized.startsWith('en'))
        return 'en-US';
    return null;
};

const readSystemLocale = (): LocaleCode => {
    if (typeof navigator === 'undefined')
        return DEFAULT_LOCALE;
    const systemLocales = Array.isArray(navigator.languages) && navigator.languages.length > 0
        ? navigator.languages
        : [navigator.language];
    for (const locale of systemLocales) {
        const matchedLocale = normalizeSystemLocale(locale);
        if (matchedLocale)
            return matchedLocale;
    }
    return DEFAULT_LOCALE;
};

const readInitialLocale = (): LocaleCode => {
    if (typeof window === 'undefined')
        return readSystemLocale();
    try {
        const storedLocale = window.localStorage.getItem(STORAGE_KEY);
        return isLocaleCode(storedLocale) ? storedLocale : readSystemLocale();
    } catch (e) {
        console.warn('[miniI18n] read locale failed', e);
        return readSystemLocale();
    }
};

let currentLocale: LocaleCode = readInitialLocale();

export const getLocale = (): LocaleCode => currentLocale;

const hasHan = (text: string): boolean => /[\u3400-\u9fff]/.test(text);

type SourceTerm = [string, string];

const isTranslatableSourceTerm = ([zh, en]: SourceTerm): boolean => (
    zh.length > 1
    && zh.length <= 20
    && !/[，。！？；]/.test(zh)
    && !/[《》"“”]/.test(zh)
    && typeof en === 'string'
    && en.length > 0
);

const sortedSourceTerms: SourceTerm[] = [
    ...sourceTermEnUS,
    ...Object.entries(sourceTextEnUS).filter(isTranslatableSourceTerm),
].sort((left, right) => right[0].length - left[0].length);

const normalizeDisplayText = (text: string): string => (
    text
        .replace(/\s+/g, ' ')
        .replace(/([\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/g, '$1')
        .trim()
);

const replaceNormalizedSource = (source: string, normalized: string, translation: string): string => {
    if (source === normalized)
        return translation;
    const replaced = source.replace(normalized, translation);
    return replaced === source ? translation : replaced;
};

const translateByPattern = (source: string): string | null => {
    const downloadProgress = source.match(/^正在下载更新…\s*(\d+)%$/);
    if (downloadProgress)
        return `Downloading update... ${downloadProgress[1]}%`;

    const updatingTo = source.match(/^正在更新到\s+(.+)$/);
    if (updatingTo)
        return `Updating to ${updatingTo[1]}`;

    const newVersion = source.match(/^发现新版本：(.+)$/);
    if (newVersion)
        return `New version found: ${newVersion[1]}`;

    const chineseDateTime = source.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日\s+(\d{1,2})时(\d{1,2})分(\d{1,2})秒$/);
    if (chineseDateTime)
        return `${chineseDateTime[2]}/${chineseDateTime[3]}/${chineseDateTime[1]} ${chineseDateTime[4]}:${chineseDateTime[5]}:${chineseDateTime[6]}`;

    const chineseYear = source.match(/^(\d{4})\s*年$/);
    if (chineseYear)
        return chineseYear[1];

    const deletedOrphans = source.match(/^已删除\s+(\d+)\s+个孤儿节点$/);
    if (deletedOrphans)
        return `Deleted ${deletedOrphans[1]} orphan nodes`;

    const appendedOrphans = source.match(/^已将\s+(\d+)\s+个孤儿节点追加到画布前端$/);
    if (appendedOrphans)
        return `Moved ${appendedOrphans[1]} orphan nodes to the front of the canvas`;

    const canvasRepair = source.match(/^画布修复（(\d+)\s+个孤儿，(\d+)\s+个问题）$/);
    if (canvasRepair)
        return `Canvas repair (${canvasRepair[1]} orphans, ${canvasRepair[2]} issues)`;

    const copyName = source.match(/^(.+)-副本$/);
    if (copyName)
        return `${copyName[1]}-copy`;

    const pagination = source.match(/^第\s+(.+)\s+条，共\s+(\d+)\s+条$/);
    if (pagination)
        return `${pagination[1]} items, ${pagination[2]} total`;

    const selectedComponents = source.match(/^已选\s+(\d+)\s+个组件$/);
    if (selectedComponents)
        return `${selectedComponents[1]} components selected`;

    const generatedComponents = source.match(/^已生成\s+(\d+)\s+个组件$/);
    if (generatedComponents)
        return `${generatedComponents[1]} components generated`;

    const minutesAgo = source.match(/^(\d+)\s*分钟前$/);
    if (minutesAgo)
        return `${minutesAgo[1]} minutes ago`;

    const example = source.match(/^例如：(.+)$/);
    if (example)
        return `e.g. ${example[1]}`;

    const charLimit = source.match(/^(.+?)不能超过(\d+)个字符$/);
    if (charLimit) {
        const target = translateFragmentForSentence(charLimit[1]);
        if (target)
            return `${capitalizeFirst(target)} cannot exceed ${charLimit[2]} characters`;
    }

    const aiGeneratedComponents = source.match(/^AI 已完成组件生成（(.+)），共\s+(\d+)\s+个组件(?::|：)?(.*)$/);
    if (aiGeneratedComponents)
        return `AI completed component generation (${aiGeneratedComponents[1]}), ${aiGeneratedComponents[2]} components${aiGeneratedComponents[3] ? `: ${aiGeneratedComponents[3]}` : ''}`;

    const generatedByScene = source.match(/^已按\s+(.+)\s+场景完成逐组件生成$/);
    if (generatedByScene)
        return `Completed component generation for the ${generatedByScene[1]} scenario`;

    const previewImage = source.match(/^(.+)\s+预览图$/);
    if (previewImage) {
        const target = translateFragmentForSentence(previewImage[1]) ?? previewImage[1];
        return `${target} preview`;
    }

    const splitByComponentCount = source.match(/^已按组件数量拆分为\s+(\d+)\s+次请求，模型将逐个优化当前选中的组件(数据)?。$/);
    if (splitByComponentCount)
        return `Split into ${splitByComponentCount[1]} requests by component count. The model will optimize each selected component${splitByComponentCount[2] ? ' data' : ''}.`;

    const fileSizeLimit = source.match(/^文件大小不能超过(.+)$/);
    if (fileSizeLimit)
        return `File size cannot exceed ${fileSizeLimit[1]}`;

    const fileTooLarge = source.match(/^文件过大：(.+)，请控制在\s+(.+)\s+以内$/);
    if (fileTooLarge)
        return `File is too large: ${fileTooLarge[1]}. Keep it within ${fileTooLarge[2]}`;

    const requestingModel = source.match(/^正在请求模型(?:（(.+)）)?\.\.\.$/);
    if (requestingModel)
        return requestingModel[1] ? `Requesting model (${requestingModel[1]})...` : 'Requesting model...';

    const parseComponentResult = source.match(/^第\s+(\d+)\s+个组件的模型返回内容无法解析为(.+)$/);
    if (parseComponentResult) {
        const target = translateFragmentForSentence(parseComponentResult[2]);
        if (target)
            return `Model response for component ${parseComponentResult[1]} could not be parsed as ${lowerFirst(target)}`;
    }

    const parseResult = source.match(/^模型返回内容无法解析为(.+)$/);
    if (parseResult) {
        const target = translateFragmentForSentence(parseResult[1]);
        if (target)
            return `Model response could not be parsed as ${lowerFirst(target)}`;
    }

    const emptyPatch = source.match(/^模型返回了空的(.+)$/);
    if (emptyPatch) {
        const target = translateFragmentForSentence(emptyPatch[1]);
        if (target)
            return `Model returned an empty ${lowerFirst(target)}`;
    }

    const appliedAndSaved = source.match(/^已(?:按组件逐个)?应用到\s+(.+)，并已保存到历史记录$/);
    if (appliedAndSaved)
        return `Applied to ${appliedAndSaved[1]} and saved to history`;

    const appliedAndUpdatedData = source.match(/^已(?:按组件逐个)?应用到\s+(.+)，并已更新数据配置$/);
    if (appliedAndUpdatedData)
        return `Applied to ${appliedAndUpdatedData[1]} and updated data config`;

    const deleteTemplateConfirm = source.match(/^确定要删除模板 "(.+)" 吗？此操作不可恢复。$/);
    if (deleteTemplateConfirm)
        return `Delete template "${deleteTemplateConfirm[1]}"? This cannot be undone.`;

    const deletePureProjectConfirm = source.match(/^确定删除「(.+)」吗？删除后会一并移除它的子项目和运行时发布记录，且无法恢复。$/);
    if (deletePureProjectConfirm)
        return `Delete "${deletePureProjectConfirm[1]}"? This will also remove its sub-projects and runtime release records, and cannot be restored.`;

    const mapItemNotObject = source.match(/^(layers|sources)\[(\d+)] 不是对象，已忽略$/);
    if (mapItemNotObject)
        return `${mapItemNotObject[1]}[${mapItemNotObject[2]}] is not an object and was ignored`;

    const mapItemMissingId = source.match(/^(layers|sources)\[(\d+)] 缺少 id，已忽略$/);
    if (mapItemMissingId)
        return `${mapItemMissingId[1]}[${mapItemMissingId[2]}] is missing id and was ignored`;

    const mapItemMissingType = source.match(/^layer（(.+)）缺少 type，已忽略$/);
    if (mapItemMissingType)
        return `layer (${mapItemMissingType[1]}) is missing type and was ignored`;

    const sourceSpecMissing = source.match(/^source（(.+)）缺少必填字段，无法生成 source spec$/);
    if (sourceSpecMissing)
        return `source (${sourceSpecMissing[1]}) is missing required fields, so the source spec cannot be generated`;

    const typedSourceSpecMissing = source.match(/^(.+)（(.+)）缺少必填字段，无法生成 source spec$/);
    if (typedSourceSpecMissing)
        return `${typedSourceSpecMissing[1]} (${typedSourceSpecMissing[2]}) is missing required fields, so the source spec cannot be generated`;

    const layerSpecMissing = source.match(/^layer（(.+)）无法生成 layer spec（缺少 sourceRef 或 source 不存在）$/);
    if (layerSpecMissing)
        return `layer (${layerSpecMissing[1]}) cannot generate a layer spec because sourceRef is missing or the source does not exist`;

    const remoteComponentFailed = source.match(/^加载远程组件失败 \[(.+)]:$/);
    if (remoteComponentFailed)
        return `Failed to load remote component [${remoteComponentFailed[1]}]:`;

    const remoteComponentFailedCount = source.match(/^有\s+(\d+)\s+个远程组件加载失败：$/);
    if (remoteComponentFailedCount)
        return `${remoteComponentFailedCount[1]} remote components failed to load:`;

    const selectedFile = source.match(/^已选择文件[：:]\s*(.+)$/);
    if (selectedFile)
        return `Selected file: ${selectedFile[1]}`;

    const noMatchedResult = source.match(/^未找到匹配的(.+)$/);
    if (noMatchedResult) {
        const target = translateFragmentForSentence(noMatchedResult[1]);
        if (target)
            return `No matching ${lowerFirst(target)} found`;
    }

    const showResultsAfterKeyword = source.match(/^输入关键字后显示(.+)结果$/);
    if (showResultsAfterKeyword) {
        const target = translateFragmentForSentence(showResultsAfterKeyword[1]);
        if (target)
            return `Enter a keyword to show ${lowerFirst(target)} results`;
    }

    const providerNoKeyRequired = source.match(/^(.+)\s+不需要单独配置 API Key，系统会在保存时自动清空旧密钥。$/);
    if (providerNoKeyRequired)
        return `${providerNoKeyRequired[1]} does not require a separate API key. The system clears old keys automatically when saving.`;

    const exportSensitiveData = source.match(/^检测到导出内容中包含敏感数据：\s*(.+)$/);
    if (exportSensitiveData)
        return `Sensitive data detected in export: ${exportSensitiveData[1]}`;

    const globalVariableUndefined = source.match(/^全局变量(.+)未定义$/);
    if (globalVariableUndefined)
        return `Global variable ${globalVariableUndefined[1]} is not defined`;

    const circularReference = source.match(/^检测到循环引用：(.+)$/);
    if (circularReference)
        return `Circular reference detected: ${circularReference[1]}`;

    const nextLoop = source.match(/^检测到 next 链循环，图层 (.+) 在同一条链路中重复出现$/);
    if (nextLoop)
        return `next chain loop detected: layer ${nextLoop[1]} appears repeatedly in the same chain`;

    const renderLoop = source.match(/^检测到循环渲染链路，图层 (.+) 已出现在当前递归路径中$/);
    if (renderLoop)
        return `Render loop detected: layer ${renderLoop[1]} already appears in the current recursion path`;

    const duplicateReachableLayer = source.match(/^检测到重复可达图层引用，图层 (.+) 已被遍历过$/);
    if (duplicateReachableLayer)
        return `Duplicate reachable layer reference detected: layer ${duplicateReachableLayer[1]} has already been traversed`;

    const canvasBatchPid = source.match(/^\[CanvasContentUpdater]\s+图层\s+(.+)\s+的 pid="(.+)" 无法在当前批次中解析，已按根节点处理。$/);
    if (canvasBatchPid)
        return `[CanvasContentUpdater] Layer ${canvasBatchPid[1]}'s pid="${canvasBatchPid[2]}" could not be resolved in this batch and was treated as a root node.`;

    const canvasDuplicateRef = source.match(/^\[CanvasContentUpdater]\s+检测到重复的批次内引用键 "(.+)"，已自动重命名为 "(.+)"。$/);
    if (canvasDuplicateRef)
        return `[CanvasContentUpdater] Duplicate in-batch reference key "${canvasDuplicateRef[1]}" detected and automatically renamed to "${canvasDuplicateRef[2]}".`;

    const canvasPatchLayerMissing = source.match(/^\[CanvasContentUpdater]\s+patch 模式未找到图层 "(.+)"，已跳过该条 payload。$/);
    if (canvasPatchLayerMissing)
        return `[CanvasContentUpdater] Patch mode could not find layer "${canvasPatchLayerMissing[1]}", so this payload was skipped.`;

    const pleaseSelectFirst = source.match(/^请先选择(.+)$/);
    if (pleaseSelectFirst) {
        const target = translateFragmentForSentence(pleaseSelectFirst[1]);
        if (target)
            return `Select ${lowerFirst(target)} first`;
    }

    const pleaseEnterAgain = source.match(/^请再次输入(.+)$/);
    if (pleaseEnterAgain) {
        const target = translateFragmentForSentence(pleaseEnterAgain[1]);
        if (target)
            return `Please enter ${lowerFirst(target)} again`;
    }

    const pleaseEnter = source.match(/^请输入(.+)$/);
    if (pleaseEnter) {
        const target = translateFragmentForSentence(pleaseEnter[1]);
        if (target)
            return `Please enter ${lowerFirst(target)}`;
    }

    const pleaseSelect = source.match(/^请选择(.+)$/);
    if (pleaseSelect) {
        const target = translateFragmentForSentence(pleaseSelect[1]);
        if (target)
            return `Please select ${lowerFirst(target)}`;
    }

    const pleaseUpload = source.match(/^请上传(.+)$/);
    if (pleaseUpload) {
        const target = translateFragmentForSentence(pleaseUpload[1]);
        if (target)
            return `Please upload ${lowerFirst(target)}`;
    }

    const required = source.match(/^(.+?)不能为空$/);
    if (required) {
        const target = translateFragmentForSentence(required[1]);
        if (target)
            return `${capitalizeFirst(target)} is required`;
    }

    const refreshed = source.match(/^(.+?)已刷新$/);
    if (refreshed) {
        const target = translateFragmentForSentence(refreshed[1]);
        if (target)
            return `${capitalizeFirst(target)} refreshed`;
    }

    const copiedPrefix = source.match(/^已复制(.+)$/);
    if (copiedPrefix) {
        const target = translateFragmentForSentence(copiedPrefix[1]);
        if (target)
            return `${capitalizeFirst(target)} copied`;
    }

    const copiedSuffix = source.match(/^(.+?)已复制$/);
    if (copiedSuffix) {
        const target = translateFragmentForSentence(copiedSuffix[1]);
        if (target)
            return `${capitalizeFirst(target)} copied`;
    }

    const failure = source.match(/^(.+?)(失败|错误)(:?)$/);
    if (failure) {
        const target = translateFragmentForSentence(failure[1]);
        if (target)
            return `${capitalizeFirst(target)} ${failure[2] === '错误' ? 'error' : 'failed'}${failure[3]}`;
    }

    const success = source.match(/^(.+?)成功$/);
    if (success) {
        const target = translateFragmentForSentence(success[1]);
        if (target)
            return `${capitalizeFirst(target)} succeeded`;
    }

    return null;
};

const translateByTerms = (source: string): string => {
    let result = source;
    sortedSourceTerms.forEach(([zh, en]) => {
        result = result.split(zh).join(` ${en} `);
    });
    return result.replace(/\s+/g, ' ').trim();
};

const normalizePunctuation = (source: string): string => (
    source
        .replace(/：/g, ': ')
        .replace(/，/g, ', ')
        .replace(/。/g, '.')
        .replace(/？/g, '?')
        .replace(/！/g, '!')
        .replace(/（/g, ' (')
        .replace(/）/g, ')')
        .replace(/、/g, ' / ')
        .replace(/…/g, '...')
        .replace(/\s+/g, ' ')
        .trim()
);

const lowerFirst = (value: string): string => {
    if (!value)
        return value;
    if (/^[A-Z]{2,}/.test(value))
        return value;
    return `${value[0].toLowerCase()}${value.slice(1)}`;
};

const capitalizeFirst = (value: string): string => {
    if (!value)
        return value;
    return `${value[0].toUpperCase()}${value.slice(1)}`;
};

const translateFragmentForSentence = (source: string): string | null => {
    const normalized = normalizeDisplayText(source);
    const exact = sourceTextEnUS[normalized];
    if (exact)
        return exact;
    if (!hasHan(normalized))
        return normalized;

    const termTranslated = normalizePunctuation(translateByTerms(normalized));
    if (termTranslated !== normalized && !hasHan(termTranslated))
        return termTranslated;

    return null;
};

export const tx = (source: string): string => {
    if (currentLocale === DEFAULT_LOCALE || !source || !hasHan(source))
        return source;

    const normalized = normalizeDisplayText(source);
    const exact = sourceTextEnUS[source] ?? sourceTextEnUS[normalized];
    if (exact)
        return replaceNormalizedSource(source, normalized, exact);

    const patternResult = translateByPattern(normalized);
    if (patternResult)
        return replaceNormalizedSource(source, normalized, patternResult);

    if (normalized.length > 80)
        return source;

    const termTranslated = normalizePunctuation(translateByTerms(normalized));
    if (termTranslated !== normalized && !hasHan(termTranslated))
        return replaceNormalizedSource(source, normalized, termTranslated);

    return source;
};

export const t = (_key: string, fallback?: string): string => tx(fallback ?? _key);

const translateTextNode = (node: Text) => {
    const parent = node.parentElement;
    if (!parent || parent.closest('[data-datavisool-i18n-skip="true"], script, style, textarea, code, pre'))
        return;

    const currentText = node.nodeValue ?? '';
    const existingSource = originalTextByNode.get(node);
    if (hasHan(currentText) && currentText !== existingSource)
        originalTextByNode.set(node, currentText);

    const source = originalTextByNode.get(node);
    if (!source)
        return;
    const nextText = currentLocale === DEFAULT_LOCALE ? source : tx(source);
    if (node.nodeValue !== nextText)
        node.nodeValue = nextText;
};

const translateElementAttrs = (element: Element) => {
    if (element.closest('[data-datavisool-i18n-skip="true"], script, style, textarea, code, pre'))
        return;

    ['title', 'placeholder', 'aria-label'].forEach((attr) => {
        const current = element.getAttribute(attr);
        if (!current)
            return;
        const dataAttr = `${translatedAttrSource}${attr}`;
        let source = element.getAttribute(dataAttr);
        if (hasHan(current) && current !== source)
            element.setAttribute(dataAttr, current);
        source = element.getAttribute(dataAttr);
        if (!source)
            return;
        const nextAttr = currentLocale === DEFAULT_LOCALE ? source : tx(source);
        if (element.getAttribute(attr) !== nextAttr)
            element.setAttribute(attr, nextAttr);
    });
};

export const translateDom = (root: ParentNode = document) => {
    if (typeof document === 'undefined')
        return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let current = walker.nextNode();
    while (current) {
        translateTextNode(current as Text);
        current = walker.nextNode();
    }

    if (root instanceof Element)
        translateElementAttrs(root);
    root.querySelectorAll?.('[title], [placeholder], [aria-label]').forEach(translateElementAttrs);
    document.documentElement.lang = currentLocale === DEFAULT_LOCALE ? 'zh-CN' : 'en-US';
};

export const startDomTranslator = () => {
    if (typeof document === 'undefined' || domTranslatorStarted)
        return;

    domTranslatorStarted = true;
    window.setTimeout(() => translateDom(), 0);
    domObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === Node.TEXT_NODE)
                    translateTextNode(node as Text);
                if (node.nodeType === Node.ELEMENT_NODE)
                    translateDom(node as Element);
            });
            if (mutation.type === 'characterData' && mutation.target.nodeType === Node.TEXT_NODE)
                translateTextNode(mutation.target as Text);
            if (mutation.type === 'attributes' && mutation.target.nodeType === Node.ELEMENT_NODE)
                translateElementAttrs(mutation.target as Element);
        });
    });
    domObserver.observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['title', 'placeholder', 'aria-label'],
    });
};

export const subscribeLocaleChange = (listener: LocaleChangeListener): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

export const setLocale = (locale: string): LocaleCode => {
    if (!isLocaleCode(locale)) {
        console.warn(`[miniI18n] unsupported locale: ${locale}. Available locales: ${localeCodes.join(', ')}`);
        return currentLocale;
    }
    if (locale === currentLocale)
        return currentLocale;

    currentLocale = locale;
    if (typeof window !== 'undefined') {
        try {
            window.localStorage.setItem(STORAGE_KEY, locale);
            window.dispatchEvent(new CustomEvent('datavisool-i18n-locale-change', {detail: {locale}}));
        } catch (e) {
            console.warn('[miniI18n] persist locale failed', e);
        }
    }
    listeners.forEach((listener) => listener(locale));
    if (typeof document !== 'undefined')
        window.setTimeout(() => translateDom(), 0);
    return currentLocale;
};

declare global {
    interface Window {
        lcI18n?: {
            availableLocales: LocaleCode[];
            getLocale: typeof getLocale;
            setLocale: typeof setLocale;
            t: typeof t;
            tx: typeof tx;
            translateDom: typeof translateDom;
        };
    }
}

if (typeof window !== 'undefined') {
    window.lcI18n = {
        availableLocales: [...localeCodes],
        getLocale,
        setLocale,
        t,
        tx,
        translateDom,
    };
}
