/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import type {AiDrivenShortcutCommandName} from "./types/AiDrivenTaskSubmitTypes.ts";

export type AiDrivenShortcutPanelPlacement = "top" | "bottom";

export interface AiDrivenShortcutCommand {
    command: AiDrivenShortcutCommandName;
    title: string;
    summary: string;
}

export interface AiDrivenShortcutSubmitContext {
    command: AiDrivenShortcutCommandName;
    rawText: string;
}

export interface AiDrivenShortcutSubmission {
    requirement: string;
    shortcut?: AiDrivenShortcutSubmitContext;
}

const AI_DRIVEN_SHORTCUT_COMMANDS: AiDrivenShortcutCommand[] = [
    {
        command: "style",
        title: "style",
        summary: "样式调整",
    },
    {
        command: "data",
        title: "data",
        summary: "数据优化",
    },
];

const getShortcutQuery = (content: string): string | null => {
    const normalizedContent = content.trimStart();
    if (!normalizedContent.startsWith("/"))
        return null;
    const query = normalizedContent.slice(1);
    if (query.includes(" "))
        return null;
    return query.toLowerCase();
};

export const getAiDrivenShortcutCommands = (content: string): AiDrivenShortcutCommand[] => {
    const shortcutQuery = getShortcutQuery(content);
    if (shortcutQuery === null)
        return [];
    return AI_DRIVEN_SHORTCUT_COMMANDS.filter((command) => command.command.startsWith(shortcutQuery));
};

export const resolveAiDrivenShortcutSubmission = (content: string): AiDrivenShortcutSubmission => {
    const rawText = content.trim();
    const normalizedContent = content.trimStart();
    if (!normalizedContent.startsWith("/"))
        return {requirement: content.trim()};

    const shortcutMatch = normalizedContent.match(/^\/([^\s]+)(?:\s+([\s\S]*))?$/);
    const commandName = shortcutMatch?.[1] ?? "";
    const command = AI_DRIVEN_SHORTCUT_COMMANDS.find((item) => item.command === commandName);
    if (!command)
        return {requirement: content.trim()};

    return {
        requirement: (shortcutMatch?.[2] ?? "").trim(),
        shortcut: {
            command: command.command,
            rawText,
        },
    };
};
