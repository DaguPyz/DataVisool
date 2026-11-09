/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
export type ExportSecretMode = 'plain' | 'passphrase-v1';

export interface ExportSecretPayload {
    secretMode: ExportSecretMode;
    secretPassphrase: string;
}

export interface ExportSecretFormValues {
    encryptPackage: boolean;
    secretPassphrase?: string;
    confirmSecretPassphrase?: string;
}

export interface ExportSecretValidationResult {
    secretPassphraseErrors: string[];
    confirmSecretPassphraseErrors: string[];
}

/**
 * 根据导出设置生成整包加密请求参数。
 */
export const buildExportSecretPayload = (encryptPackage: boolean, secretPassphrase: string = ''): ExportSecretPayload => ({
    secretMode: encryptPackage ? 'passphrase-v1' : 'plain',
    secretPassphrase,
});

/**
 * 校验导出加密表单。
 * 仅在勾选加密时要求口令和确认口令，并保证两次输入一致。
 */
export const validateExportSecretForm = (values: ExportSecretFormValues): ExportSecretValidationResult => {
    if (!values.encryptPackage) {
        return {
            secretPassphraseErrors: [],
            confirmSecretPassphraseErrors: [],
        };
    }

    const secretPassphrase = values.secretPassphrase ?? '';
    const confirmSecretPassphrase = values.confirmSecretPassphrase ?? '';
    const secretPassphraseErrors: string[] = [];
    const confirmSecretPassphraseErrors: string[] = [];

    if (!secretPassphrase)
        secretPassphraseErrors.push('请输入导出口令');
    if (!confirmSecretPassphrase)
        confirmSecretPassphraseErrors.push('请再次输入导出口令');
    if (secretPassphrase && confirmSecretPassphrase && secretPassphrase !== confirmSecretPassphrase)
        confirmSecretPassphraseErrors.push('两次输入的导出口令不一致');

    return {
        secretPassphraseErrors,
        confirmSecretPassphraseErrors,
    };
};

/**
 * 统一生成敏感数据导出提示文案，避免弹窗内容和实际导出模式不一致。
 */
export const buildExportRiskWarningMessage = (warnings: string[], secretMode: ExportSecretMode): string => {
    const title = `检测到导出内容中包含敏感数据：\n${warnings.map(item => `- ${item}`).join('\n')}`;
    const tail = secretMode === 'passphrase-v1'
        ? '继续导出将把这些敏感信息放入整体加密的项目包。'
        : '继续导出将把这些敏感信息一并打包。';

    return `${title}\n\n${tail}`;
};

export default {
    buildExportSecretPayload,
    validateExportSecretForm,
    buildExportRiskWarningMessage,
};
