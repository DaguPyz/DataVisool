/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {createElement, useState} from "react";
import {globalModal, TextArea} from "@datavisool/ui";
import {FrontendEffectClientError} from "@/frontend-effect/FrontendEffectClientError.ts";
import type {UserInputDialogPayload, UserInputQuestionPayload} from "@/frontend-effect/FrontendEffectTypes.ts";
import aiDrivenProgressTerminalStore, {
    type IAiDrivenInlineInteractionCompletion,
} from "@/designer/ai-driven/AiDrivenProgressTerminalStore.ts";

/**
 * 执行用户补充输入工具。
 *
 * 该工具把用户弹窗交互包装成 Promise：提交时 resolve，取消/关闭时 reject。
 */
export function runUserInputTool(title: string, payload: unknown, signal?: AbortSignal): Promise<unknown> {
    const request = normalizeUserInputDialogPayload(payload);
    const inlineCompletion = aiDrivenProgressTerminalStore.requestInlineInteraction({
        kind: "userInput",
        title,
        questions: request.questions,
    }, signal);
    if (inlineCompletion) {
        return inlineCompletion.then((completion) => resolveInlineUserInput(
            completion,
            title,
            request,
            signal,
        ));
    }

    return runUserInputModal(title, request, signal);
}

/** 内联宿主不可用时沿用原弹窗，避免影响非 AI驱动入口。 */
function runUserInputModal(
    title: string,
    request: {questions: UserInputQuestionPayload[]},
    signal?: AbortSignal,
): Promise<unknown> {
    return new Promise((resolve, reject) => {
        if (!globalModal.modalApi) {
            reject(new FrontendEffectClientError("modal_unavailable", "全局弹窗尚未初始化", {
                fieldPath: "globalModal.modalApi", actualValue: null, expectedValue: "initialized modal API",
            }));
            return;
        }

        let settled = false;
        let answers: Record<string, string> = {};
        const finish = (value: unknown, isError = false) => {
            // Modal 的取消和关闭回调可能连续触发，必须幂等处理。
            if (settled)
                return;
            settled = true;
            if (isError)
                reject(value);
            else
                resolve(value);
        };

        const modalId = globalModal.modalApi.confirm({
            title,
            okText: "提交补充",
            cancelText: "取消",
            width: 520,
            maskClosable: false,
            content: createElement(StructuredQuestionsContent, {
                questions: request.questions,
                onChange: (value) => {
                    answers = value;
                },
            }),
            onOk: async () => {
                if (!request.questions.every((question) => Boolean(answers[question.id]?.trim())))
                    return false;
                finish({answers: Object.fromEntries(Object.entries(answers).map(([id, value]) => [id, {answers: [value]}]))});
                return true;
            },
            onCancel: () => finish(
                new FrontendEffectClientError("user_cancelled", "用户取消了输入"),
                true,
            ),
            afterClose: () => finish(
                new FrontendEffectClientError("user_cancelled", "用户取消了输入"),
                true,
            ),
        });
        signal?.addEventListener("abort", () => {
            globalModal.modalApi.destroy(modalId);
            finish(new FrontendEffectClientError("effect_cancelled", "任务已停止等待用户输入"), true);
        }, {once: true});
        if (signal?.aborted) {
            globalModal.modalApi.destroy(modalId);
            finish(new FrontendEffectClientError("effect_cancelled", "任务已停止等待用户输入"), true);
        }
    });
}

function resolveInlineUserInput(
    completion: IAiDrivenInlineInteractionCompletion,
    title: string,
    request: {questions: UserInputQuestionPayload[]},
    signal?: AbortSignal,
): unknown | Promise<unknown> {
    if (completion.action === "submit")
        return completion.data;
    if (completion.action === "unavailable")
        return runUserInputModal(title, request, signal);
    if (completion.action === "abort")
        throw new FrontendEffectClientError("effect_cancelled", "任务已停止等待用户输入");
    throw new FrontendEffectClientError("user_cancelled", "用户取消了输入");
}

/**
 * 渲染互斥选项，并为每题追加自定义输入。
 */
function StructuredQuestionsContent(props: {
    questions: UserInputQuestionPayload[];
    onChange: (answers: Record<string, string>) => void;
}) {
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [otherIds, setOtherIds] = useState<Record<string, boolean>>({});
    const update = (id: string, value: string, other: boolean) => {
        const next = {...answers, [id]: value.slice(0, 2_000)};
        setAnswers(next);
        setOtherIds((current) => ({...current, [id]: other}));
        props.onChange(next);
    };
    return createElement("div", {style: {display: "grid", gap: 16, marginTop: 12}}, props.questions.map((question) =>
        createElement("fieldset", {key: question.id, style: {border: 0, padding: 0, margin: 0, display: "grid", gap: 8}}, [
            createElement("legend", {key: "legend", style: {fontWeight: 600}}, `${question.header} · ${question.question}`),
            ...question.options.map((option) => createElement("label", {key: option.label, style: {display: "grid", gridTemplateColumns: "18px 1fr", gap: 8}}, [
                createElement("input", {
                    key: "input", type: "radio", name: question.id, checked: answers[question.id] === option.label && !otherIds[question.id],
                    onChange: () => update(question.id, option.label, false),
                }),
                createElement("span", {key: "copy"}, [
                    createElement("strong", {key: "label"}, option.label),
                    createElement("small", {key: "description", style: {display: "block", opacity: 0.68}}, option.description),
                ]),
            ])),
            createElement("label", {key: "other", style: {display: "grid", gridTemplateColumns: "18px 1fr", gap: 8}}, [
                createElement("input", {
                    key: "input", type: "radio", name: question.id, checked: Boolean(otherIds[question.id]),
                    onChange: () => update(question.id, "", true),
                }),
                createElement("span", {key: "label"}, "其他"),
            ]),
            otherIds[question.id] ? createElement(TextArea, {
                key: "otherText", rows: 2, autoFocus: true, value: answers[question.id] ?? "", placeholder: "请输入自定义答案",
                onChange: (value: string) => update(question.id, value.trim(), true),
            }) : null,
        ]),
    ));
}

/**
 * 归一化用户输入弹窗载荷。
 *
 * 只接受工具定义声明的结构化问题，避免错误入参进入交互等待。
 */
function normalizeUserInputDialogPayload(payload: unknown): {questions: UserInputQuestionPayload[]} {
    const data = (payload && typeof payload === "object" ? payload : {}) as UserInputDialogPayload;
    if (!Array.isArray(data.questions) || data.questions.length < 1 || data.questions.length > 3)
        throw new FrontendEffectClientError("invalid_payload", "questions 数量必须在 1–3", {
            fieldPath: "questions", actualValue: data.questions,
            ...(Array.isArray(data.questions) ? {actualCount: data.questions.length} : {}),
            expectedValue: {type: "array", minItems: 1, maxItems: 3},
        });
    const ids = new Set<string>();
    const questions = data.questions.map((question, index) => {
        if (!question || !nonBlank(question.id) || !nonBlank(question.header)
            || !nonBlank(question.question) || !Array.isArray(question.options)
            || question.options.length < 2 || question.options.length > 3) {
            throw new FrontendEffectClientError("invalid_payload", `questions[${index}] 必须包含非空 id/header/question 和2–3个 {label,description} 选项`, {
                fieldPath: `questions[${index}]`, actualValue: question,
                expectedValue: {id: "non-empty string", header: "non-empty string", question: "non-empty string", options: {minimum: 2, maximum: 3}},
            });
        }
        if (ids.has(question.id))
            throw new FrontendEffectClientError("invalid_payload", `questions[${index}].id 不能重复`, {
                fieldPath: `questions[${index}].id`, actualValue: question.id, expectedValue: "questions 中唯一的 id",
            });
        ids.add(question.id);
        const labels = new Set<string>();
        question.options.forEach((option, optionIndex) => {
            if (!option || !nonBlank(option.label) || !nonBlank(option.description))
                throw new FrontendEffectClientError("invalid_payload", `questions[${index}].options[${optionIndex}] 必须包含非空 label、description`, {
                    fieldPath: `questions[${index}].options[${optionIndex}]`, actualValue: option,
                    expectedValue: {label: "non-empty string", description: "non-empty string"},
                });
            if (labels.has(option.label))
                throw new FrontendEffectClientError("invalid_payload", `questions[${index}].options.label 不能重复`, {
                    fieldPath: `questions[${index}].options[${optionIndex}].label`, actualValue: option.label,
                    expectedValue: "该问题选项中唯一的 label",
                });
            labels.add(option.label);
        });
        return question;
    });
    return {questions};
}

function nonBlank(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}
