/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {getLoadedComponentCatalogEntries, runGetComponentCatalogTool} from "./GetComponentCatalogTool.ts";
import {FrontendEffectClientError} from "../FrontendEffectClientError.ts";
import AuthFetchUtil from "@/util/AuthFetchUtil.ts";

const requestDocument = async (operation: string, payload: unknown) => {
    const request = asRecord(payload) || {};
    const catalog = getLoadedComponentCatalogEntries().map(item => ({
        componentType: item.componentType, source: item.documentInfo?.source ?? "builtin",
        componentId: item.documentInfo?.componentId, componentVersion: item.documentInfo?.componentVersion,
        sha256: item.documentInfo?.sha256,
        corpusVersion: item.documentInfo?.corpusVersion,
    }));
    const result = await AuthFetchUtil.postOrThrow<Record<string, any>>(`/api/component-documents/${operation}`, {...request, catalog});
    if (result.status === "error") {
        const {code, message, ...details} = result;
        throw new FrontendEffectClientError(code, message, details);
    }
    return result;
};

export const runResolveComponentSpecsTool = (payload: unknown) => {
    const request = asRecord(payload);
    if (!Array.isArray(request?.componentTypes) || request.componentTypes.some((type: unknown) => typeof type !== "string"))
        throw new FrontendEffectClientError("agent.component_specs.component_types_required", "componentTypes 必须是组件类型字符串数组", {
            fieldPath: "componentTypes", actualValue: request?.componentTypes,
            expectedValue: "string[]，数组中的每项都是非空组件类型",
        });
    const componentTypes = [...new Set<string>(request.componentTypes.map(text).filter(Boolean))];
    if (!componentTypes.length || componentTypes.length > 10)
        throw new FrontendEffectClientError(`agent.component_specs.${componentTypes.length ? "component_types_limit_exceeded" : "component_types_required"}`,
            "componentTypes 单次必须包含 1–10 个不同的组件类型", {
                fieldPath: "componentTypes", actualValue: componentTypes,
                expectedValue: {minimum: 1, maximum: 10, unique: true},
            });
    if (request.intent !== "create" && request.intent !== "patch")
        throw new FrontendEffectClientError("agent.component_specs.intent_invalid", "intent 必须为 create 或 patch", {
            fieldPath: "intent", actualValue: request.intent, allowedValues: ["create", "patch"],
        });
    return requestDocument("resolve_component_specs", {...request, componentTypes});
};
export const runGetComponentDocumentTool = (payload: unknown) => requestDocument("get_component_document", payload);
export const runSearchComponentDocumentsTool = (payload: unknown) => requestDocument("search_component_documents", payload);

export const runSearchAvailableComponentsTool = async (payload: unknown) => {
    const request = asRecord(payload), query = text(request?.query).toLowerCase();
    const limit = Math.min(20, Math.max(1, Number(request?.limit) || 10));
    const catalog = runGetComponentCatalogTool();
    const filtered = catalog.components.filter(item =>
        [item.componentType, item.componentName, item.description]
            .some(field => text(field).toLowerCase().includes(query)));
    return {status: "ok", catalogVersion: catalog.catalogVersion, totalMatches: filtered.length, components: filtered.slice(0, limit)};
};
const asRecord = (value: unknown): Record<string, any> | null =>
    value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : null;
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
