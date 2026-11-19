/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

/** Structured diagnostic data that can help the Agent correct a frontend tool call. */
export type FrontendEffectErrorDetails = Record<string, unknown>;

/** Frontend effect error with a stable code and serializable diagnostic details. */
export class FrontendEffectClientError extends Error {
    public readonly code: string;
    public readonly details: FrontendEffectErrorDetails;

    constructor(code: string, message: string, details: FrontendEffectErrorDetails = {}) {
        super(message);
        this.name = "FrontendEffectClientError";
        this.code = code;
        this.details = details;
        for (const [key, value] of Object.entries(details)) {
            if (["code", "message", "name", "stack", "details"].includes(key))
                continue;
            Object.defineProperty(this, key, {value, enumerable: true, configurable: true});
        }
    }
}

/** Convert an error to an Agent-safe object, retaining structured fields and masking credentials. */
export function serializeFrontendEffectError(
    error: unknown,
    fallbackCode = "frontend_effect_failed",
    ancestors = new WeakSet<object>(),
): FrontendEffectErrorDetails {
    const record = isRecord(error) ? error : undefined;
    const details = isRecord(record?.details) ? record.details : collectDiagnosticFields(record);
    const output: FrontendEffectErrorDetails = {
        code: error instanceof FrontendEffectClientError
            ? error.code
            : typeof record?.code === "string" ? record.code : fallbackCode,
        message: redactDiagnosticText(error instanceof Error
            ? error.message
            : typeof record?.message === "string" ? record.message : String(error ?? "前端动作失败")),
    };
    const trackError = typeof error === "object" && error !== null;
    if (trackError && ancestors.has(error))
        return {...output, cause: "[Circular]"};
    if (trackError)
        ancestors.add(error);
    const sanitizedDetails = sanitizeFrontendEffectDetails(details, ancestors);
    if (trackError)
        ancestors.delete(error);
    if (error instanceof Error) {
        sanitizedDetails.name ??= error.name;
        sanitizedDetails.exceptionType ??= error.constructor?.name || "Error";
    }
    return {...output, ...sanitizedDetails};
}

export function sanitizeFrontendEffectDetails(
    details: FrontendEffectErrorDetails,
    ancestors = new WeakSet<object>(),
): FrontendEffectErrorDetails {
    const fieldPath = typeof details.fieldPath === "string" ? details.fieldPath : "";
    const output: FrontendEffectErrorDetails = {};
    for (const [key, value] of Object.entries(details)) {
        if (value === undefined || key === "code" || key === "message" || key === "details")
            continue;
        output[key] = sanitizeDiagnosticValue(value, fieldPath, key, ancestors);
    }
    if (output.expectedValue !== undefined && output.expected === undefined)
        output.expected = output.expectedValue;
    if (Object.prototype.hasOwnProperty.call(details, "actualValue")) {
        if (details.actualValue === undefined) {
            output.actualValue = null;
            output.actualType ??= "missing";
        } else if (output.actualType === undefined) {
            output.actualType = diagnosticValueType(details.actualValue);
        }
    }
    return output;
}

/** Mask sensitive values in structured details before the result crosses into Agent history. */
export function sanitizeDiagnosticValue(value: unknown, fieldPath = "", propertyName = "", ancestors = new WeakSet<object>()): unknown {
    if (isSensitivePath(fieldPath) && isValueProperty(propertyName))
        return "[REDACTED]";
    if (value instanceof Error)
        return serializeFrontendEffectError(value, "frontend_effect_failed", ancestors);
    if (value !== null && typeof value === "object") {
        if (ancestors.has(value))
            return "[Circular]";
        ancestors.add(value);
    }
    if (Array.isArray(value)) {
        const sanitized = value.map((item) => sanitizeDiagnosticValue(item, fieldPath, "", ancestors));
        ancestors.delete(value);
        return sanitized;
    }
    if (isRecord(value)) {
        const recordPath = typeof value.fieldPath === "string" ? value.fieldPath : fieldPath;
        const sanitized = Object.fromEntries(Object.entries(value).map(([key, child]) => {
            const childPath = isValueProperty(key) ? recordPath : recordPath ? `${recordPath}.${key}` : key;
            return [key, isSensitiveKey(key) ? "[REDACTED]" : sanitizeDiagnosticValue(child, childPath, key, ancestors)];
        }));
        ancestors.delete(value);
        return sanitized;
    }
    if (typeof value === "string")
        return redactDiagnosticText(value);
    if (value !== null && typeof value === "object")
        ancestors.delete(value);
    return value === undefined ? null : value;
}

function collectDiagnosticFields(record: Record<string, unknown> | undefined): FrontendEffectErrorDetails {
    if (!record)
        return {};
    const known = [
        "componentId", "componentType", "fieldPath", "actualValue", "expectedValue", "allowedValues",
        "changedPaths", "currentRevision", "expectedRevision", "missingRegionIds", "violations", "partial", "actualCount",
        "applied", "partiallyApplied", "deletedComponentIds", "actualStateUnknown", "rollbackFailedComponentIds",
        "cause", "recovery", "retryHint", "retryable", "operationError", "verificationError", "cleanupStateUnknown",
        "actualState", "allowedTools", "interactionState",
        "actualType", "expected", "expectedType", "allowedFields", "allowedKeys", "source", "sourceType",
        "documentPath", "missingFields", "presentFields", "unknownFields", "duplicateComponentIds", "duplicateRegionIds",
        "componentIndex", "regionId", "regionBounds", "canvasBounds", "actualBounds", "currentValue",
    ];
    return Object.fromEntries(known.filter((key) => Object.prototype.hasOwnProperty.call(record, key)).map((key) => [key, record[key]]));
}

function isValueProperty(propertyName: string): boolean {
    return ["actualValue", "expectedValue", "currentValue", "previousValue", "value"].includes(propertyName);
}

function isSensitivePath(path: string): boolean {
    return path.split(/[.[\]]+/).some(isSensitiveKey);
}

function isSensitiveKey(key: string): boolean {
    const normalized = key.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    return normalized.includes("password") || normalized.includes("passphrase")
        || normalized.startsWith("token") || normalized.endsWith("token") || normalized.includes("authtoken")
        || normalized.includes("secret")
        || normalized.includes("authorization") || normalized.includes("cookie")
        || normalized.includes("credential") || normalized.includes("apikey")
        || normalized.includes("privatekey") || normalized === "accesskey" || normalized.includes("accesskeysecret");
}

function diagnosticValueType(value: unknown): string {
    if (value === null)
        return "null";
    if (Array.isArray(value))
        return "array";
    if (typeof value === "object")
        return "object";
    return typeof value;
}

function redactDiagnosticText(value: string): string {
    return value
        .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[REDACTED]")
        .replace(/([?&](?:access_?token|refresh_?token|token|api_?key|access_?key|password|secret|authorization|credential)=)[^&#\s]*/gi, "$1[REDACTED]")
        .replace(/(https?:\/\/)[^/@\s:]+:[^/@\s]+@/gi, "$1[REDACTED]@");
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
