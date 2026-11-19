/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {globalMessage} from "@datavisool/ui";
import AuthFetchUtil from "@/util/AuthFetchUtil.ts";
import {globalModal} from "@datavisool/ui";
import {createElement, useState} from "react";
import {CheckBox, Input} from "@datavisool/ui";
import ProjectUtil from "@/util/ProjectUtil.ts";
import ProjectDataCodecUtil from "@/util/ProjectDataCodecUtil.ts";
import {showProjectImportSuccess} from "./ProjectImportResult.ts";
import ExportRiskUtil from "@/util/ExportRiskUtil.ts";
import ExportSecretUtil, {ExportSecretMode} from "@/util/ExportSecretUtil.ts";
import {EncryptResult, HybridCryptoUtil} from "@/util/HybridCryptoUtil.ts";

import type {DesignerProjectSnapshot} from '@datavisool/sdk/plugin/contracts/designerRuntime';
import type {QueueProjectWrite} from './projectActions.ts';
import baseApi from '@/api/engineering/BaseApi.ts';

type ConfirmConfig = Parameters<typeof globalModal.modalApi.confirm>[0];

function confirmTransfer<T>(
    signal: AbortSignal,
    cancelled: T,
    createConfig: (finish: (result: T) => void) => ConfirmConfig,
): Promise<T> {
    if (signal.aborted) return Promise.resolve(cancelled);
    const modalApi = globalModal.modalApi;
    return new Promise<T>(resolve => {
        let key: string | undefined;
        const abort = () => {
            if (key !== undefined) modalApi.destroy(key);
            finish(cancelled);
        };
        const finish = (result: T) => {
            signal.removeEventListener('abort', abort);
            resolve(result);
        };
        key = modalApi.confirm({
            ...createConfig(finish),
            afterClose: () => finish(cancelled),
        });
        signal.addEventListener('abort', abort, {once: true});
    });
}

export async function exportProject(
    snapshot: DesignerProjectSnapshot,
    remoteComponentPaths: Readonly<Record<string, string>>,
    signal: AbortSignal,
) {
    const messageApi = globalMessage.messageApi;
    const progress = messageApi?.open({
        type: 'loading',
        content: '正在导出项目数据，需要一些时间，请耐心等候...',
        duration: 0,
    });
    try {
        const dependency = await ProjectUtil.calculateProjectGraphDependency(snapshot.id, snapshot.data, {
            entryProjectName: snapshot.name,
            remoteComponentPaths,
            loadProjectMeta: id => baseApi.getProjectMeta(id, {signal}),
        });
        if (signal.aborted) return;
        const projects = dependency.projects.map(item => ({
            ...item,
            projectJson: ProjectDataCodecUtil.compressIfBeneficial(item.projectJson),
        }));
        const packageEncryptionRequired = dependency.commonApiIds.length > 0 || dependency.databaseIds.length > 0;
        const exportOptions = await confirmExportSecretOptions(packageEncryptionRequired, signal);
        if (!exportOptions || signal.aborted) return;

        const riskWarnings = [
            ...(await collectCommonApiExportRiskWarnings(dependency.commonApiIds, signal)),
            ...(await collectDatabaseExportRiskWarnings(dependency.databaseIds, signal)),
        ];
        if (signal.aborted || !(await confirmExportRiskWarnings(riskWarnings, exportOptions.secretMode, signal))) return;
        if (signal.aborted) return;

        const blob = await AuthFetchUtil.post<Blob | null>('/api/export/exportProject', {
            ...dependency,
            projects,
            projectJson: projects.find(item => item.isEntry)?.projectJson,
            ...exportOptions,
        }, {signal});
        if (signal.aborted || !blob) return;
        const url = URL.createObjectURL(blob);
        try {
            const link = document.createElement('a');
            link.href = url;
            link.download = `${dependency.name}.zip`;
            link.click();
        } finally {
            URL.revokeObjectURL(url);
        }
        messageApi?.success('项目数据导出成功');
    } finally {
        if (progress !== undefined) messageApi?.destroy(progress);
    }
}

const confirmExportSecretOptions = async (packageEncryptionRequired: boolean, signal: AbortSignal) => {
    const modalApi = globalModal.modalApi;
    if (!modalApi)
        return packageEncryptionRequired ? null : ExportSecretUtil.buildExportSecretPayload(false);

    return confirmTransfer<ReturnType<typeof ExportSecretUtil.buildExportSecretPayload> | null>(signal, null, finish => {
        let formValues = {encryptPackage: true, secretPassphrase: '', confirmSecretPassphrase: ''};
        let setFormErrors: ((errors: { secretPassphraseErrors: string[], confirmSecretPassphraseErrors: string[] }) => void) | null = null;

        return {
            title: '导出选项',
            okText: '下一步',
            cancelText: '取消',
            icon: null,
            content: createElement(() => {
                const [values, setValues] = useState(formValues);
                const [errors, setErrors] = useState({secretPassphraseErrors: [] as string[], confirmSecretPassphraseErrors: [] as string[]});
                setFormErrors = setErrors;
                const updateValues = (next: typeof formValues) => {
                    formValues = next;
                    setValues(next);
                };

                return createElement('div', {
                    style: {display: 'grid', gap: '12px', marginTop: '16px'}
                }, [
                    createElement(CheckBox, {
                        key: 'encryptPackage',
                        value: values.encryptPackage,
                        disabled: packageEncryptionRequired,
                        helperText: packageEncryptionRequired ? '当前项目包含公共 API 或数据库，必须启用整包加密' : undefined,
                        onChange: (value: boolean) => updateValues({...values, encryptPackage: value}),
                    }, '整包加密'),
                    values.encryptPackage ? createElement('div', {
                        key: 'secretFieldsContainer',
                        style: {display: 'grid', gap: '12px'}
                    }, [
                        createElement('label', {
                            key: 'secretPassphrase',
                            style: {display: 'grid', gap: '8px'}
                        }, [
                            createElement('span', {key: 'label'}, '导出口令'),
                            createElement(Input, {
                            key: 'input',
                            type: 'password',
                            value: values.secretPassphrase,
                            placeholder: '请输入导出口令',
                            autoComplete: 'new-password',
                            status: errors.secretPassphraseErrors.length > 0 ? 'error' : 'default',
                            onChange: (value: string) => updateValues({...values, secretPassphrase: value}),
                        }),
                            errors.secretPassphraseErrors.length > 0 ? createElement('span', {
                                key: 'error',
                                style: {color: '#ff8f8f', fontSize: 12}
                            }, errors.secretPassphraseErrors.join('、')) : null,
                        ]),
                        createElement('label', {
                            key: 'confirmSecretPassphrase',
                            style: {display: 'grid', gap: '8px'}
                        }, [
                            createElement('span', {key: 'label'}, '确认口令'),
                            createElement(Input, {
                            key: 'input',
                            type: 'password',
                            value: values.confirmSecretPassphrase,
                            placeholder: '请再次输入导出口令',
                            autoComplete: 'new-password',
                            status: errors.confirmSecretPassphraseErrors.length > 0 ? 'error' : 'default',
                            onChange: (value: string) => updateValues({...values, confirmSecretPassphrase: value}),
                        }),
                            errors.confirmSecretPassphraseErrors.length > 0 ? createElement('span', {
                                key: 'error',
                                style: {color: '#ff8f8f', fontSize: 12}
                            }, errors.confirmSecretPassphraseErrors.join('、')) : null,
                        ])
                    ]) : null,
                    createElement('div', {
                        key: 'hint',
                        style: {color: 'rgba(255,255,255,0.65)', lineHeight: '22px'}
                    }, '启用后将按桌面端兼容格式加密整个项目包')
                ]);
            }),
            onOk: async () => {
                const encryptPackage = packageEncryptionRequired || formValues.encryptPackage;
                const validationResult = ExportSecretUtil.validateExportSecretForm({...formValues, encryptPackage});
                setFormErrors?.(validationResult);
                if (validationResult.secretPassphraseErrors.length > 0 || validationResult.confirmSecretPassphraseErrors.length > 0)
                    return Promise.reject(new Error('export secret form validation failed'));

                finish(ExportSecretUtil.buildExportSecretPayload(encryptPackage, formValues.secretPassphrase ?? ''));
                return true;
            },
        };
    });
}

const collectCommonApiExportRiskWarnings = async (commonApiIds: string[], signal: AbortSignal) => {
    if (commonApiIds.length === 0)
        return [] as string[];

    const definitions = await Promise.all(commonApiIds.map(async (id) => {
        try {
            const response = await AuthFetchUtil.get<any>(`/api/commonApi/getCommonApi/${id}`, {signal});
            if (!response)
                return null;
            return {
                id,
                name: response.name,
                headers: response.headers,
            };
        } catch {
            return null;
        }
    }));

    return ExportRiskUtil.buildCommonApiHeaderRiskWarnings(definitions.filter(item => item != null));
}

const collectDatabaseExportRiskWarnings = async (databaseIds: string[], signal: AbortSignal) => {
    if (databaseIds.length === 0)
        return [] as string[];

    const clientKey = HybridCryptoUtil.getClientPublicKey();
    const definitions = await Promise.all(databaseIds.map(async (id) => {
        try {
            const response = await AuthFetchUtil.post<EncryptResult>('/api/commonDatabase/get', {id, key: clientKey}, {signal});
            if (!response)
                return null;
            const decrypted = HybridCryptoUtil.decryptResponse(response);
            const data = JSON.parse(decrypted as string);
            return {
                id,
                name: data.name,
                password: data.password,
            };
        } catch {
            return null;
        }
    }));

    return ExportRiskUtil.buildDatabasePasswordRiskWarnings(definitions.filter(item => item != null));
}

const confirmExportRiskWarnings = (warnings: string[], secretMode: ExportSecretMode, signal: AbortSignal) => {
    if (!warnings.length || !globalModal.modalApi) return Promise.resolve(true);
    return confirmTransfer(signal, false, finish => ({
        title: '导出风险提示',
        content: createElement('div', {style: {whiteSpace: 'pre-wrap'}}, ExportSecretUtil.buildExportRiskWarningMessage(warnings, secretMode)),
        okText: '继续导出',
        cancelText: '取消',
        onOk: () => finish(true),
    }));
};

const requestImportSecretPassphrase = async (signal: AbortSignal) => {
    const modalApi = globalModal.modalApi;
    if (!modalApi)
        return '';

    return confirmTransfer<string | null>(signal, null, finish => {
        let secretPassphrase = '';
        return {
            title: '导入项目',
            okText: '开始导入',
            cancelText: '取消',
            icon: null,
            content: createElement(() => {
                return createElement('div', {style: {marginTop: '16px'}}, [
                    createElement('label', {
                        key: 'secretPassphrase',
                        style: {display: 'grid', gap: '8px', marginBottom: '12px'}
                    }, [
                        createElement('span', {key: 'label'}, '导入口令（选填）'),
                        createElement(Input, {
                            key: 'input',
                            type: 'password',
                            placeholder: '若项目包已加密或包含加密数据源，请输入导入口令',
                            autoComplete: 'new-password',
                            onChange: (value: string) => {
                                secretPassphrase = value;
                            },
                        })
                    ]),
                    createElement('div', {
                        key: 'hint',
                        style: {color: 'rgba(255,255,255,0.65)', lineHeight: '22px'}
                    }, '明文包可直接留空；若项目包已加密或包含加密数据源，则需要填写正确的导入口令。')
                ]);
            }),
            onOk: async () => {
                finish(secretPassphrase.trim());
                return true;
            },
        };
    });
}

function selectProjectPackage(signal: AbortSignal): Promise<File | undefined> {
    if (signal.aborted) return Promise.resolve(undefined);
    return new Promise<File | undefined>((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.zip';
        const cleanup = () => {
            input.onchange = null;
            input.oncancel = null;
            signal.removeEventListener('abort', cancel);
        };
        const finish = (file?: File) => {
            cleanup();
            resolve(file);
        };
        const cancel = () => finish();
        input.onchange = () => finish(input.files?.[0]);
        input.oncancel = cancel;
        signal.addEventListener('abort', cancel, {once: true});
        try {
            input.click();
        } catch (error) {
            cleanup();
            reject(error);
        }
    });
}

export async function importProject(projectId: string, signal: AbortSignal, enqueue: QueueProjectWrite, onImported: () => void) {
    const file = await selectProjectPackage(signal);
    if (!file || signal.aborted) return;
    const secretPassphrase = await requestImportSecretPassphrase(signal);
    if (secretPassphrase === null || signal.aborted) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('projectId', projectId);
    formData.append('secretPassphrase', secretPassphrase);
    let importNotice = '';
    const imported = await enqueue(async () => {
        if (signal.aborted) return;
        const applied = await AuthFetchUtil.post<boolean>('/api/import/importProject', formData, {
            headers: {'Content-Type': 'multipart/form-data'},
            loadingText: '正在导入项目数据...',
            onSuccess: response => {
                if (response.msg !== '操作成功') importNotice = response.msg || '';
            },
        });
        if (applied) onImported();
        return applied;
    });
    if (imported && !signal.aborted) await showProjectImportSuccess(importNotice, signal);
}
