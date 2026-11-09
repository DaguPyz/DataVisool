/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {createElement, useState} from "react";
import {globalModal} from "@datavisool/ui";
import {FrontendEffectClientError} from "@/frontend-effect/FrontendEffectClientError.ts";
import type {
    ComponentSelectionPayload,
    PreviewConfirmationPayload,
} from "@/frontend-effect/FrontendEffectTypes.ts";
import {aiLayerDraftRuntime} from "@/designer/ai-driven/AiLayerDraftRuntime.ts";
import aiDrivenProgressTerminalStore, {
    type IAiDrivenInlineInteractionCompletion,
} from "@/designer/ai-driven/AiDrivenProgressTerminalStore.ts";

export interface PreviewConfirmationResult {
    confirmed: boolean;
    draftId: string;
}

export interface ComponentSelectionToolResult {
    confirmed: boolean;
    selectedComponentTypes: string[];
}

interface NormalizedSelectionRequest {
    message: string;
    candidates: Array<{
        componentType: string;
        displayName: string;
        description?: string;
        defaultSelected: boolean;
    }>;
    minSelected: number;
    maxSelected: number;
    initialSelected: string[];
}

/** 确认当前临时草稿；确认结果由任务完成流程写入正式画布。 */
export function runShowPreviewTool(payload: unknown, signal?: AbortSignal): Promise<PreviewConfirmationResult> {
    const request = normalizePreviewConfirmationPayload(payload);
    const activeDraft = aiLayerDraftRuntime.activeDraft;
    if (!activeDraft || activeDraft.draftId !== request.draftId) {
        throw new FrontendEffectClientError(
            "preview_not_found",
            "临时预览不存在或已发生变化，请重新生成预览",
            {fieldPath: "draftId", actualValue: activeDraft?.draftId ?? null, expectedValue: request.draftId},
        );
    }

    const inlineCompletion = aiDrivenProgressTerminalStore.requestInlineInteraction({
        kind: "preview",
        title: "页面预览确认",
        message: request.message || "请检查画布上的临时页面预览。确认后将写入正式画布。",
        draftId: request.draftId,
        layerCount: activeDraft.layerCount,
    }, signal);
    if (inlineCompletion) {
        const interactionId = aiDrivenProgressTerminalStore.pendingInlineInteraction?.id;
        const unbind = aiLayerDraftRuntime.bindPreviewConfirmation(request.draftId, (confirmed) => {
            if (interactionId && aiDrivenProgressTerminalStore.pendingInlineInteraction?.id === interactionId) {
                aiDrivenProgressTerminalStore.completeInlineInteraction({
                    action: "submit",
                    data: {confirmed, draftId: request.draftId},
                });
            }
        });
        return inlineCompletion.finally(unbind).then((completion) => resolveInlinePreview(
            completion,
            request,
            signal,
        ));
    }

    return runPreviewModal(request, signal);
}

function runPreviewModal(
    request: PreviewConfirmationPayload,
    signal?: AbortSignal,
): Promise<PreviewConfirmationResult> {
    const activeDraft = aiLayerDraftRuntime.activeDraft;
    if (!activeDraft || activeDraft.draftId !== request.draftId) {
        throw new FrontendEffectClientError(
            "preview_not_found",
            "临时预览不存在或已发生变化，请重新生成预览",
        );
    }
    let unbind = () => {};
    return new Promise<PreviewConfirmationResult>((resolve, reject) => {
        if (!globalModal.modalApi) {
            reject(new FrontendEffectClientError("modal_unavailable", "全局弹窗尚未初始化", {
                fieldPath: "globalModal.modalApi", actualValue: null, expectedValue: "initialized modal API",
            }));
            return;
        }
        let settled = false;
        const finish = (result: PreviewConfirmationResult | FrontendEffectClientError, isError = false) => {
            if (settled)
                return;
            settled = true;
            if (isError)
                reject(result);
            else
                resolve(result as PreviewConfirmationResult);
        };
        const modalId = globalModal.modalApi.confirm({
            title: "页面预览确认",
            okText: "确认预览",
            cancelText: "返回调整",
            width: 520,
            maskClosable: false,
            content: createElement("div", {style: {display: "grid", gap: 10, marginTop: 12}}, [
                createElement(
                    "div",
                    {key: "message", style: {lineHeight: "22px"}},
                    request.message || "请检查画布上的临时页面预览。确认后将写入正式画布。",
                ),
                createElement(
                    "div",
                    {key: "summary", style: {color: "rgba(255,255,255,0.6)"}},
                    `临时草稿包含 ${activeDraft.layerCount} 个图层`,
                ),
            ]),
            onOk: async () => {
                if (aiLayerDraftRuntime.activeDraft?.draftId !== request.draftId) {
                    finish(
                        new FrontendEffectClientError(
                            "preview_changed",
                            "确认前临时预览已发生变化，请重新生成预览",
                            {fieldPath: "draftId", actualValue: aiLayerDraftRuntime.activeDraft?.draftId ?? null, expectedValue: request.draftId},
                        ),
                        true,
                    );
                    return true;
                }
                finish({confirmed: true, draftId: request.draftId});
                return true;
            },
            onCancel: () => finish({confirmed: false, draftId: request.draftId}),
            afterClose: () => finish({confirmed: false, draftId: request.draftId}),
        });
        unbind = aiLayerDraftRuntime.bindPreviewConfirmation(request.draftId, (confirmed) => {
            finish({confirmed, draftId: request.draftId});
            globalModal.modalApi?.destroy(modalId);
        });
        bindAbort(signal, modalId, () => finish(
            new FrontendEffectClientError("effect_cancelled", "任务已停止等待页面预览确认"),
            true,
        ));
    }).finally(() => unbind());
}

/** 从服务端给定的有限候选中选择组件，不接受任意文本组件类型。 */
export function runRequestComponentSelectionTool(payload: unknown, signal?: AbortSignal): Promise<ComponentSelectionToolResult> {
    const request = normalizeComponentSelectionPayload(payload);
    const inlineCompletion = aiDrivenProgressTerminalStore.requestInlineInteraction({
        kind: "componentSelection",
        title: "选择页面组件",
        ...request,
    }, signal);
    if (inlineCompletion) {
        return inlineCompletion.then((completion) => resolveInlineComponentSelection(
            completion,
            request,
            signal,
        ));
    }

    return runComponentSelectionModal(request, signal);
}

function runComponentSelectionModal(
    request: NormalizedSelectionRequest,
    signal?: AbortSignal,
): Promise<ComponentSelectionToolResult> {
    let selectedComponentTypes = request.initialSelected;

    return new Promise((resolve, reject) => {
        if (!globalModal.modalApi) {
            reject(new FrontendEffectClientError("modal_unavailable", "全局弹窗尚未初始化", {
                fieldPath: "globalModal.modalApi", actualValue: null, expectedValue: "initialized modal API",
            }));
            return;
        }
        let settled = false;
        const finish = (result: ComponentSelectionToolResult | FrontendEffectClientError, isError = false) => {
            if (settled)
                return;
            settled = true;
            if (isError)
                reject(result);
            else
                resolve(result as ComponentSelectionToolResult);
        };
        const modalId = globalModal.modalApi.confirm({
            title: "选择页面组件",
            okText: "确认选择",
            cancelText: "取消",
            width: 560,
            maskClosable: false,
            content: createElement(ComponentSelectionContent, {
                request,
                onChange: (selection: string[]) => {
                    selectedComponentTypes = selection;
                },
            }),
            onOk: async () => {
                finish({confirmed: true, selectedComponentTypes});
                return true;
            },
            onCancel: () => finish({confirmed: false, selectedComponentTypes: []}),
            afterClose: () => finish({confirmed: false, selectedComponentTypes: []}),
        });
        bindAbort(signal, modalId, () => finish(
            new FrontendEffectClientError("effect_cancelled", "任务已停止等待组件选择"),
            true,
        ));
    });
}

function resolveInlinePreview(
    completion: IAiDrivenInlineInteractionCompletion,
    request: PreviewConfirmationPayload,
    signal?: AbortSignal,
): PreviewConfirmationResult | Promise<PreviewConfirmationResult> {
    if (completion.action === "unavailable")
        return runPreviewModal(request, signal);
    if (completion.action === "abort")
        throw new FrontendEffectClientError("effect_cancelled", "任务已停止等待页面预览确认");
    const result = completion.data as PreviewConfirmationResult | undefined;
    if (!result)
        return {confirmed: false, draftId: request.draftId};
    if (result.confirmed && aiLayerDraftRuntime.activeDraft?.draftId !== request.draftId) {
        throw new FrontendEffectClientError(
            "preview_changed",
            "确认前临时预览已发生变化，请重新生成预览",
            {fieldPath: "draftId", actualValue: aiLayerDraftRuntime.activeDraft?.draftId ?? null, expectedValue: request.draftId},
        );
    }
    return result;
}

function resolveInlineComponentSelection(
    completion: IAiDrivenInlineInteractionCompletion,
    request: NormalizedSelectionRequest,
    signal?: AbortSignal,
): ComponentSelectionToolResult | Promise<ComponentSelectionToolResult> {
    if (completion.action === "unavailable")
        return runComponentSelectionModal(request, signal);
    if (completion.action === "abort")
        throw new FrontendEffectClientError("effect_cancelled", "任务已停止等待组件选择");
    return completion.data as ComponentSelectionToolResult
        ?? {confirmed: false, selectedComponentTypes: []};
}

function ComponentSelectionContent(props: {
    request: NormalizedSelectionRequest;
    onChange: (selection: string[]) => void;
}): ReturnType<typeof createElement> {
    const {request, onChange} = props;
    const [selected, setSelected] = useState<string[]>(request.initialSelected);
    const toggle = (componentType: string) => {
        const isSelected = selected.includes(componentType);
        if (isSelected && selected.length <= request.minSelected)
            return;
        if (!isSelected && selected.length >= request.maxSelected)
            return;
        const next = isSelected
            ? selected.filter((value) => value !== componentType)
            : [...selected, componentType];
        setSelected(next);
        onChange(next);
    };

    return createElement("div", {style: {display: "grid", gap: 12, marginTop: 12}}, [
        createElement("div", {key: "message", style: {lineHeight: "22px"}}, request.message),
        createElement(
            "div",
            {key: "range", style: {color: "rgba(255,255,255,0.6)"}},
            `请选择 ${request.minSelected}–${request.maxSelected} 个组件（已选 ${selected.length} 个）`,
        ),
        createElement(
            "div",
            {key: "candidates", style: {display: "grid", gap: 8, maxHeight: 360, overflowY: "auto"}},
            request.candidates.map((candidate) => {
                const checked = selected.includes(candidate.componentType);
                const disabled = checked
                    ? selected.length <= request.minSelected
                    : selected.length >= request.maxSelected;
                return createElement("label", {
                    key: candidate.componentType,
                    style: {
                        display: "grid",
                        gridTemplateColumns: "20px 1fr",
                        gap: 8,
                        padding: "10px 12px",
                        border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: 6,
                        cursor: disabled ? "not-allowed" : "pointer",
                        opacity: disabled && !checked ? 0.55 : 1,
                    },
                }, [
                    createElement("input", {
                        key: "input",
                        type: "checkbox",
                        checked,
                        disabled,
                        onChange: () => toggle(candidate.componentType),
                    }),
                    createElement("span", {key: "content"}, [
                        createElement("span", {key: "name", style: {display: "block"}}, candidate.displayName),
                        candidate.description
                            ? createElement(
                                "span",
                                {key: "description", style: {display: "block", color: "rgba(255,255,255,0.55)", marginTop: 4}},
                                candidate.description,
                            )
                            : null,
                    ]),
                ]);
            }),
        ),
    ]);
}

function normalizePreviewConfirmationPayload(payload: unknown): PreviewConfirmationPayload {
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
        throw new FrontendEffectClientError("invalid_payload", "页面预览确认入参必须是对象", {
            fieldPath: "payload", actualValue: payload, expectedValue: "object",
        });
    const input = payload as Partial<PreviewConfirmationPayload>;
    const draftId = requiredText(input.draftId, "draftId");
    const message = typeof input.message === "string" ? input.message.trim() || undefined : undefined;
    return {draftId, message};
}

export function normalizeComponentSelectionPayload(payload: unknown): NormalizedSelectionRequest {
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
        throw new FrontendEffectClientError("invalid_payload", "组件选择入参必须是对象", {
            fieldPath: "payload", actualValue: payload, expectedValue: "object",
        });
    const input = payload as Partial<ComponentSelectionPayload>;
    const message = requiredText(input.message, "message");
    if (!Array.isArray(input.candidates) || input.candidates.length < 1 || input.candidates.length > 30)
        throw new FrontendEffectClientError("invalid_payload", "组件候选数量必须在 1–30 之间", {
            fieldPath: "candidates", actualValue: input.candidates,
            ...(Array.isArray(input.candidates) ? {actualCount: input.candidates.length} : {}),
            expectedValue: {type: "array", minItems: 1, maxItems: 30},
        });
    const seen = new Set<string>();
    const candidates = input.candidates.map((candidate, index) => {
        if (!candidate || typeof candidate !== "object" || Array.isArray(candidate))
            throw new FrontendEffectClientError("invalid_payload", `第 ${index + 1} 个组件候选无效`, {
                fieldPath: `candidates[${index}]`, actualValue: candidate,
                expectedValue: "object with componentType and displayName",
            });
        const componentType = requiredText(candidate.componentType, `candidates[${index}].componentType`);
        if (seen.has(componentType))
            throw new FrontendEffectClientError("invalid_payload", `候选组件类型重复：${componentType}`, {
                fieldPath: `candidates[${index}].componentType`, actualValue: componentType,
                expectedValue: "组件类型在 candidates 中唯一",
            });
        seen.add(componentType);
        return {
            componentType,
            displayName: requiredText(candidate.displayName, `candidates[${index}].displayName`),
            description: typeof candidate.description === "string" ? candidate.description.trim() || undefined : undefined,
            defaultSelected: candidate.defaultSelected === true,
        };
    });
    const minSelected = integerInRange(input.minSelected ?? 1, 0, candidates.length, "minSelected");
    const maxSelected = integerInRange(input.maxSelected ?? candidates.length, 1, candidates.length, "maxSelected");
    if (minSelected > maxSelected)
        throw new FrontendEffectClientError("invalid_payload", "minSelected 不能大于 maxSelected", {
            fieldPath: "minSelected", actualValue: minSelected, expectedValue: {maximum: maxSelected},
        });
    const initialSelected = candidates
        .filter((candidate) => candidate.defaultSelected)
        .map((candidate) => candidate.componentType);
    if (initialSelected.length > maxSelected)
        throw new FrontendEffectClientError("invalid_payload", "默认选择数量超过 maxSelected", {
            fieldPath: "candidates[].defaultSelected", actualValue: initialSelected.length,
            expectedValue: {maximum: maxSelected},
        });
    for (const candidate of candidates) {
        if (initialSelected.length >= minSelected)
            break;
        if (!initialSelected.includes(candidate.componentType))
            initialSelected.push(candidate.componentType);
    }
    return {message, candidates, minSelected, maxSelected, initialSelected};
}

function bindAbort(signal: AbortSignal | undefined, modalId: string, onAbort: () => void): void {
    const abort = () => {
        onAbort();
        globalModal.modalApi?.destroy(modalId);
    };
    signal?.addEventListener("abort", abort, {once: true});
    if (signal?.aborted)
        abort();
}

function requiredText(value: unknown, field: string): string {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!normalized)
        throw new FrontendEffectClientError("invalid_payload", `${field} 不能为空`, {
            fieldPath: field, actualValue: value, expectedValue: "non-empty string",
        });
    return normalized;
}

function integerInRange(value: unknown, min: number, max: number, field: string): number {
    if (!Number.isInteger(value) || (value as number) < min || (value as number) > max)
        throw new FrontendEffectClientError("invalid_payload", `${field} 必须是 ${min}–${max} 的整数`, {
            fieldPath: field, actualValue: value, expectedValue: {type: "integer", minimum: min, maximum: max},
        });
    return value as number;
}
