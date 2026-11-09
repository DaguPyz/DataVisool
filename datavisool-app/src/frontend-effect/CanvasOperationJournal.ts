/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import CryptoJS from "crypto-js";
import {FrontendEffectClientError, serializeFrontendEffectError} from "@/frontend-effect/FrontendEffectClientError.ts";
import {aiDrivenDevError} from "@/designer/ai-driven/AiDrivenDevLogger.ts";

type CanvasOperationStatus = "applying" | "applied" | "failed";

interface CanvasOperationIdentity {
    operationId: string;
    operationFingerprint: string;
}

interface CanvasOperationRecord {
    operationId: string;
    operationFingerprint: string;
    status: CanvasOperationStatus;
    result?: unknown;
    error?: Record<string, unknown> & {code: string; message: string};
    updatedAt: number;
}

const memoryJournal = new Map<string, CanvasOperationRecord>();
const STORAGE_PREFIX = "datavisool:canvas-operation:";

export async function runIdempotentCanvasOperation<T>(
    payload: unknown,
    execute: () => Promise<T> | T,
    succeeded: (result: T) => boolean = (result) => !isRecord(result)
        || !Array.isArray(result.failed) || result.failed.length === 0,
): Promise<T> {
    const identity = operationIdentity(payload);
    if (!identity)
        return await execute();
    const existing = readRecord(identity.operationId);
    if (existing) {
        ensureFingerprint(existing, identity.operationFingerprint);
        if (existing.status === "applied" || (existing.status === "failed" && existing.result !== undefined))
            return existing.result as T;
        if (existing.status === "failed") {
            const {code, message, ...details} = existing.error ?? {code: "frontend_effect_failed", message: "画布动作执行失败"};
            throw new FrontendEffectClientError(
                code,
                message,
                details,
            );
        }
        throw new FrontendEffectClientError("operation_in_progress", "画布动作仍处于执行中，不能重复应用", {
            fieldPath: "operationId", actualValue: existing.status, expectedValue: "applied or failed receipt",
            operationId: identity.operationId,
        });
    }

    writeRecord({...identity, status: "applying", updatedAt: Date.now()});
    try {
        const result = await execute();
        writeRecord({
            ...identity,
            status: succeeded(result) ? "applied" : "failed",
            result,
            updatedAt: Date.now(),
        });
        return result;
    } catch (error) {
        const normalized = normalizeError(error);
        writeRecord({...identity, status: "failed", error: normalized, updatedAt: Date.now()});
        throw error;
    }
}

export function hasCanvasOperationIdentity(payload: unknown): boolean {
    return operationIdentity(payload) != null;
}

export function runGetCanvasOperationStatusTool(payload: unknown): Record<string, unknown> {
    if (!isRecord(payload))
        throw new FrontendEffectClientError("invalid_payload", "动作状态查询入参必须是对象", {
            fieldPath: "payload", actualValue: payload, expectedValue: "object",
        });
    const operationId = text(payload.operationId);
    if (!operationId)
        throw new FrontendEffectClientError("invalid_payload", "动作状态查询缺少 operationId", {
            fieldPath: "operationId", actualValue: payload.operationId, expectedValue: "non-empty string",
        });
    const record = readRecord(operationId);
    return record ? {...record} : {operationId, status: "notFound"};
}

export function canvasRevision(value: unknown): string {
    return `sha256:${CryptoJS.SHA256(stableStringify(value)).toString()}`;
}

function operationIdentity(payload: unknown): CanvasOperationIdentity | null {
    if (!isRecord(payload))
        return null;
    const operationId = text(payload.operationId);
    const operationFingerprint = text(payload.operationFingerprint);
    if (!operationId && !operationFingerprint)
        return null;
    if (!operationId || !operationFingerprint) {
        throw new FrontendEffectClientError(
            "invalid_operation_identity",
            "真实画布动作必须同时提供 operationId 和 operationFingerprint",
            {
                fieldPath: !operationId ? "operationId" : "operationFingerprint",
                actualValue: !operationId ? payload.operationId : payload.operationFingerprint,
                expectedValue: "non-empty string",
            },
        );
    }
    return {operationId, operationFingerprint};
}

function ensureFingerprint(record: CanvasOperationRecord, expected: string): void {
    if (record.operationFingerprint !== expected) {
        throw new FrontendEffectClientError(
            "operation_fingerprint_conflict",
            "相同 operationId 不能用于不同动作参数",
            {fieldPath: "operationFingerprint", actualValue: record.operationFingerprint, expectedValue: expected},
        );
    }
}

function readRecord(operationId: string): CanvasOperationRecord | null {
    const memory = memoryJournal.get(operationId);
    if (memory)
        return memory;
    let raw: string | null;
    try {
        raw = operationStorage().getItem(storageKey(operationId));
    } catch (error) {
        throw storageError("operation_receipt_read_failed", error);
    }
    if (!raw)
        return null;
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        throw storageError("operation_receipt_corrupted", error);
    }
    if (!isCanvasOperationRecord(parsed, operationId))
        throw new FrontendEffectClientError("operation_receipt_corrupted", "前端动作回执格式无效，已阻止重复写入", {
            fieldPath: `localStorage.${storageKey(operationId)}`,
            actualValue: isRecord(parsed)
                ? {keys: Object.keys(parsed), operationId: parsed.operationId, status: parsed.status}
                : parsed,
            expectedValue: {operationId, operationFingerprint: "non-empty string", status: ["applying", "applied", "failed"], updatedAt: "finite number"},
        });
    memoryJournal.set(operationId, parsed);
    return parsed;
}

function writeRecord(record: CanvasOperationRecord): void {
    memoryJournal.set(record.operationId, record);
    try {
        operationStorage().setItem(storageKey(record.operationId), JSON.stringify(record));
    } catch (error) {
        if (record.status === "applying") {
            memoryJournal.delete(record.operationId);
            throw new FrontendEffectClientError(
                "operation_receipt_persistence_failed",
                error instanceof Error ? error.message : "前端动作回执持久化失败",
            );
        }
        aiDrivenDevError("Canvas operation receipt persistence failed:", error);
    }
}

function operationStorage(): Pick<Storage, "getItem" | "setItem"> {
    let storage: Storage;
    try {
        storage = window.localStorage;
    } catch (error) {
        throw storageError("operation_receipt_persistence_unavailable", error);
    }
    if (typeof storage?.getItem !== "function" || typeof storage?.setItem !== "function") {
        throw new FrontendEffectClientError(
            "operation_receipt_persistence_unavailable",
            "当前环境无法持久化画布动作回执",
        );
    }
    return storage;
}

function isCanvasOperationRecord(value: unknown, operationId: string): value is CanvasOperationRecord {
    return isRecord(value)
        && value.operationId === operationId
        && typeof value.operationFingerprint === "string"
        && value.operationFingerprint.length > 0
        && (value.status === "applying" || value.status === "applied" || value.status === "failed")
        && typeof value.updatedAt === "number"
        && Number.isFinite(value.updatedAt);
}

function storageError(code: string, error: unknown): FrontendEffectClientError {
    return new FrontendEffectClientError(
        code,
        error instanceof Error ? error.message : "前端动作回执持久化失败",
    );
}

function stableStringify(value: unknown): string {
    if (Array.isArray(value))
        return `[${value.map(stableStringify).join(",")}]`;
    if (isRecord(value)) {
        return `{${Object.keys(value)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
            .join(",")}}`;
    }
    return JSON.stringify(value) ?? "null";
}

function normalizeError(error: unknown): Record<string, unknown> & {code: string; message: string} {
    return serializeFrontendEffectError(error) as Record<string, unknown> & {code: string; message: string};
}

function storageKey(operationId: string): string {
    return `${STORAGE_PREFIX}${encodeURIComponent(operationId)}`;
}

function text(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, any> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
