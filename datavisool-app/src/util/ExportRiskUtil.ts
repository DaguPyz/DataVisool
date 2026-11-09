/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
export interface CommonApiRiskInput {
    id?: string;
    name?: string;
    headers?: unknown;
}

export interface DatabaseRiskInput {
    id?: string;
    name?: string;
    password?: unknown;
}

export default class ExportRiskUtil {
    private static readonly SENSITIVE_HEADER_KEYWORDS = [
        'authorization',
        'token',
        'api-key',
        'apikey',
        'secret',
        'cookie',
        'session',
        'signature',
        'access-key',
        'accesskey',
        'private-key',
        'privatekey',
        'jwt'
    ];

    public static collectSensitiveHeaderKeys(headers: unknown): string[] {
        const headerMap = ExportRiskUtil.toHeaderMap(headers);
        if (!headerMap)
            return [];

        return Object.entries(headerMap)
            .filter(([key, value]) => ExportRiskUtil.isSensitiveHeaderKey(key) && `${value ?? ''}`.trim() !== '')
            .map(([key]) => key)
            .sort((left, right) => left.localeCompare(right));
    }

    public static buildCommonApiHeaderRiskWarnings(commonApis: CommonApiRiskInput[]): string[] {
        return commonApis.flatMap((item) => {
            const keys = ExportRiskUtil.collectSensitiveHeaderKeys(item.headers);
            if (keys.length === 0)
                return [];
            const label = (item.name || item.id || '未命名公共API').trim() || '未命名公共API';
            return [`公共 API「${label}」包含敏感请求头：${keys.join('、')}`];
        });
    }

    public static buildDatabasePasswordRiskWarnings(databases: DatabaseRiskInput[]): string[] {
        return databases.flatMap((item) => {
            const password = `${item.password ?? ''}`.trim();
            if (!password)
                return [];
            const label = (item.name || item.id || '未命名数据库').trim() || '未命名数据库';
            return [`数据库「${label}」包含连接密码`];
        });
    }

    private static isSensitiveHeaderKey(key: string): boolean {
        const normalized = key.trim().toLowerCase();
        if (!normalized)
            return false;
        return ExportRiskUtil.SENSITIVE_HEADER_KEYWORDS.some((keyword) => normalized.includes(keyword));
    }

    private static toHeaderMap(headers: unknown): Record<string, unknown> | null {
        if (!headers)
            return null;
        if (typeof headers === 'string') {
            const trimmed = headers.trim();
            if (!trimmed)
                return null;
            try {
                const parsed = JSON.parse(trimmed);
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
                    return parsed as Record<string, unknown>;
            } catch {
                return null;
            }
            return null;
        }
        if (typeof headers === 'object' && !Array.isArray(headers))
            return headers as Record<string, unknown>;
        return null;
    }
}
