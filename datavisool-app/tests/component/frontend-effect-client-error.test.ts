/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {describe, expect, test} from "vitest";
import {
    FrontendEffectClientError,
    sanitizeFrontendEffectDetails,
    serializeFrontendEffectError,
} from "@/frontend-effect/FrontendEffectClientError.ts";

describe("FrontendEffectClientError", () => {
    test("serializes the stable code and structured diagnostics while masking sensitive paths", () => {
        const error = new FrontendEffectClientError(
            "component_revision_conflict",
            "组件读取后字段已变化：config.data.password",
            {
                componentId: "text-1",
                fieldPath: "config.data.password",
                actualValue: "server-password",
                expectedValue: "agent-password",
                changedPaths: [{
                    fieldPath: "config.data.password",
                    expectedValue: "agent-password",
                    currentValue: "server-password",
                }],
            },
        );

        expect(serializeFrontendEffectError(error)).toEqual({
            code: "component_revision_conflict",
            message: "组件读取后字段已变化：config.data.password",
            name: "FrontendEffectClientError",
            exceptionType: "FrontendEffectClientError",
            componentId: "text-1",
            fieldPath: "config.data.password",
            actualValue: "[REDACTED]",
            actualType: "string",
            expectedValue: "[REDACTED]",
            expected: "[REDACTED]",
            changedPaths: [{
                fieldPath: "config.data.password",
                expectedValue: "[REDACTED]",
                currentValue: "[REDACTED]",
            }],
        });
    });

    test("does not allow diagnostic fields to overwrite error identity", () => {
        const error = new FrontendEffectClientError("stable_code", "stable message", {
            code: "forged_code",
            message: "forged message",
            name: "forged name",
            componentId: "text-1",
        });

        expect(serializeFrontendEffectError(error)).toMatchObject({
            code: "stable_code",
            message: "stable message",
            componentId: "text-1",
        });
        expect(error.name).toBe("FrontendEffectClientError");
    });

    test("does not truncate diagnostics or redact ordinary business keys", () => {
        const changedPaths = Array.from({length: 120}, (_, index) => ({
            fieldPath: `style.field${index}`,
            expectedValue: index,
            currentValue: index + 1,
        }));
        const details = sanitizeFrontendEffectDetails({
            actualValue: {key: "business-key", value: "kept"},
            expectedValue: {key: "same-business-key"},
            changedPaths,
        });

        expect(details.actualType).toBe("object");
        expect(details.expected).toEqual({key: "same-business-key"});
        expect(details.actualValue).toEqual({key: "business-key", value: "kept"});
        expect(details.changedPaths).toHaveLength(120);
    });

    test("marks undefined actual values as missing and null values as null", () => {
        expect(sanitizeFrontendEffectDetails({actualValue: undefined})).toMatchObject({
            actualValue: null,
            actualType: "missing",
        });
        expect(sanitizeFrontendEffectDetails({actualValue: null})).toMatchObject({
            actualValue: null,
            actualType: "null",
        });
    });

    test("preserves the message from plain serialized error objects", () => {
        expect(serializeFrontendEffectError({code: "plain_error", message: "real failure detail", actualValue: 5}))
            .toMatchObject({code: "plain_error", message: "real failure detail", actualValue: 5, actualType: "number"});
    });

    test("retains recovery and nested execution diagnostics from plain Error instances", () => {
        const error = Object.assign(new Error("deletion cleanup failed"), {
            code: "delete_cleanup_failed",
            cause: Object.assign(new Error("global variable could not be unbound"), {
                code: "unbind_failed",
                fieldPath: "globalVariableBinding",
            }),
            recovery: "Refresh the component snapshot before retrying.",
            retryHint: "Retry only after the cleanup issue is resolved.",
            retryable: false,
            operationError: {code: "delete_cleanup_failed", message: "cleanup failed"},
            verificationError: {code: "state_read_failed", fieldPath: "layerConfigs"},
            cleanupStateUnknown: true,
            actualState: [{componentId: "text-1", state: "deleted"}],
            allowedTools: ["get_component_snapshots", "delete_canvas_components"],
        });

        expect(serializeFrontendEffectError(error)).toMatchObject({
            code: "delete_cleanup_failed",
            message: "deletion cleanup failed",
            cause: {
                code: "unbind_failed",
                message: "global variable could not be unbound",
                fieldPath: "globalVariableBinding",
                name: "Error",
                exceptionType: "Error",
            },
            recovery: "Refresh the component snapshot before retrying.",
            retryHint: "Retry only after the cleanup issue is resolved.",
            retryable: false,
            operationError: {code: "delete_cleanup_failed", message: "cleanup failed"},
            verificationError: {code: "state_read_failed", fieldPath: "layerConfigs"},
            cleanupStateUnknown: true,
            actualState: [{componentId: "text-1", state: "deleted"}],
            allowedTools: ["get_component_snapshots", "delete_canvas_components"],
        });
    });
});
