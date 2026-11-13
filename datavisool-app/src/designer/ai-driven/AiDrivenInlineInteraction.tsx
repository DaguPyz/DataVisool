/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {Check, Close} from "@icon-park/react";
import {Button, TextArea} from "@datavisool/ui";
import {useState} from "react";
import {tx} from "@/i18n/miniI18n.ts";
import type {
    IAiDrivenInlineInteraction,
    IAiDrivenInlineInteractionCompletion,
} from "./AiDrivenProgressTerminalStore.ts";

interface AiDrivenInlineInteractionProps {
    interaction: IAiDrivenInlineInteraction;
    onComplete: (completion: IAiDrivenInlineInteractionCompletion) => void;
}

const AiDrivenInlineInteraction = ({interaction, onComplete}: AiDrivenInlineInteractionProps) => {
    if (interaction.kind === "userInput")
        return <UserInputInteraction interaction={interaction} onComplete={onComplete}/>;
    if (interaction.kind === "preview")
        return <PreviewInteraction interaction={interaction} onComplete={onComplete}/>;
    return <ComponentSelectionInteraction interaction={interaction} onComplete={onComplete}/>;
};

const UserInputInteraction = ({interaction, onComplete}: AiDrivenInlineInteractionProps & {
    interaction: Extract<IAiDrivenInlineInteraction, {kind: "userInput"}>;
}) => {
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [otherIds, setOtherIds] = useState<Record<string, boolean>>({});
    const update = (id: string, value: string, other: boolean) => {
        setAnswers((current) => ({...current, [id]: value.slice(0, 2_000)}));
        setOtherIds((current) => ({...current, [id]: other}));
    };
    const complete = interaction.questions.every((question) => Boolean(answers[question.id]?.trim()));
    return (
        <section className="ai-driven-inline-interaction" aria-label={tx(interaction.title)}>
            <InteractionHeading title={interaction.title} message=""/>
            {interaction.questions.map((question) => (
                <fieldset key={question.id} className="ai-driven-inline-question">
                    <legend><strong>{question.header}</strong> · {question.question}</legend>
                    <div className="ai-driven-inline-candidates">
                        {question.options.map((option) => (
                            <label key={option.label} className="ai-driven-inline-candidate">
                                <input type="radio" name={`${interaction.id}-${question.id}`}
                                       checked={answers[question.id] === option.label && !otherIds[question.id]}
                                       onChange={() => update(question.id, option.label, false)}/>
                                <span><strong>{option.label}</strong><small>{option.description}</small></span>
                            </label>
                        ))}
                        <label className="ai-driven-inline-candidate">
                            <input type="radio" name={`${interaction.id}-${question.id}`}
                                   checked={Boolean(otherIds[question.id])}
                                   onChange={() => update(question.id, "", true)}/>
                            <span><strong>{tx("其他")}</strong></span>
                        </label>
                        {otherIds[question.id] && <TextArea rows={2} autoFocus value={answers[question.id] ?? ""}
                            placeholder={tx("请输入自定义答案")} onChange={(value) => update(question.id, value.trim(), true)}/>}
                    </div>
                </fieldset>
            ))}
            <InteractionActions onCancel={() => onComplete({action: "cancel"})}
                                onSubmit={() => onComplete({
                                    action: "submit",
                                    data: {answers: Object.fromEntries(Object.entries(answers).map(([id, value]) => [id, {answers: [value]}]))},
                                })}
                                submitDisabled={!complete}
                                submitText={tx("提交选择")}/>
        </section>
    );
};

const PreviewInteraction = ({interaction, onComplete}: AiDrivenInlineInteractionProps & {
    interaction: Extract<IAiDrivenInlineInteraction, {kind: "preview"}>;
}) => (
    <section className="ai-driven-inline-interaction" aria-label={tx(interaction.title)}>
        <InteractionHeading title={interaction.title} message={interaction.message}/>
        <div className="ai-driven-inline-preview-summary">
            <span>{tx("临时预览")}</span>
            <strong>{interaction.layerCount} {tx("个图层")}</strong>
        </div>
        <InteractionActions onCancel={() => onComplete({
                                action: "submit",
                                data: {confirmed: false, draftId: interaction.draftId},
                            })}
                            onSubmit={() => onComplete({
                                action: "submit",
                                data: {confirmed: true, draftId: interaction.draftId},
                            })}
                            cancelText={tx("返回调整")}
                            submitText={tx("确认使用")}/>
    </section>
);

const ComponentSelectionInteraction = ({interaction, onComplete}: AiDrivenInlineInteractionProps & {
    interaction: Extract<IAiDrivenInlineInteraction, {kind: "componentSelection"}>;
}) => {
    const [selected, setSelected] = useState(interaction.initialSelected);
    const toggle = (componentType: string) => {
        const checked = selected.includes(componentType);
        if (checked && selected.length <= interaction.minSelected)
            return;
        if (!checked && selected.length >= interaction.maxSelected)
            return;
        setSelected(checked
            ? selected.filter((value) => value !== componentType)
            : [...selected, componentType]);
    };
    const selectionValid = selected.length >= interaction.minSelected && selected.length <= interaction.maxSelected;

    return (
        <section className="ai-driven-inline-interaction" aria-label={tx(interaction.title)}>
            <InteractionHeading title={interaction.title} message={interaction.message}/>
            <div className="ai-driven-inline-selection-meta">
                {tx("请选择")} {interaction.minSelected}–{interaction.maxSelected} {tx("个组件")}
                <span>{tx("已选")} {selected.length}</span>
            </div>
            <div className="ai-driven-inline-candidates">
                {interaction.candidates.map((candidate) => {
                    const checked = selected.includes(candidate.componentType);
                    const disabled = checked
                        ? selected.length <= interaction.minSelected
                        : selected.length >= interaction.maxSelected;
                    return (
                        <label key={candidate.componentType}
                               className={`ai-driven-inline-candidate ${checked ? "is-selected" : ""}`}>
                            <input type="checkbox"
                                   checked={checked}
                                   disabled={disabled}
                                   onChange={() => toggle(candidate.componentType)}/>
                            <span>
                                <strong>{candidate.displayName}</strong>
                                {candidate.description && <small>{candidate.description}</small>}
                            </span>
                        </label>
                    );
                })}
            </div>
            <InteractionActions onCancel={() => onComplete({
                                    action: "submit",
                                    data: {confirmed: false, selectedComponentTypes: []},
                                })}
                                onSubmit={() => onComplete({
                                    action: "submit",
                                    data: {confirmed: true, selectedComponentTypes: selected},
                                })}
                                submitDisabled={!selectionValid}
                                submitText={tx("确认选择")}/>
        </section>
    );
};

const InteractionHeading = ({title, message}: {title: string; message: string}) => (
    <header className="ai-driven-inline-interaction-heading">
        <span className="ai-driven-inline-interaction-indicator" aria-hidden="true"/>
        <div>
            <strong>{tx(title)}</strong>
            {message && <p>{message}</p>}
        </div>
    </header>
);

const InteractionActions = ({
    onCancel,
    onSubmit,
    cancelText = tx("取消"),
    submitText,
    submitDisabled = false,
}: {
    onCancel: () => void;
    onSubmit: () => void;
    cancelText?: string;
    submitText: string;
    submitDisabled?: boolean;
}) => (
    <div className="ai-driven-inline-actions">
        <Button type="text"
                size="sm"
                icon={<Close size={13}/>} 
                onClick={onCancel}>
            {cancelText}
        </Button>
        <Button type="primary"
                size="sm"
                disabled={submitDisabled}
                icon={<Check size={13}/>} 
                onClick={onSubmit}>
            {submitText}
        </Button>
    </div>
);

export default AiDrivenInlineInteraction;
