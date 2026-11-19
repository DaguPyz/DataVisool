/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {createElement, useState} from 'react';
import type {ChangeEvent} from 'react';
import type {EditorSelectionTemplateSnapshot} from '@datavisool/sdk/plugin/contracts/editorCanvas';
import baseApi from '@/api/engineering/BaseApi.ts';
import {globalMessage, globalModal, Input, TextArea} from '@datavisool/ui';

interface SaveSelectionTemplateOptions {
    readonly signal: AbortSignal;
    readonly snapshot: EditorSelectionTemplateSnapshot;
    readonly isSceneActive: (sceneVersion: number) => boolean;
    readonly isAccepting: () => boolean;
    readonly isActive: () => boolean;
    readonly trackTask: <T>(task: Promise<T>) => Promise<T>;
    readonly registerDraft: (sceneVersion: number, cancel: () => void) => () => void;
    readonly emitCreated: () => Promise<void>;
}

/** Open the save form from an immutable snapshot captured by the canvas service. */
export async function saveSelectionTemplate({
    signal,
    snapshot,
    isSceneActive,
    isAccepting,
    isActive,
    trackTask,
    registerDraft,
    emitCreated,
}: SaveSelectionTemplateOptions): Promise<boolean> {
    if (signal.aborted || !isAccepting() || !isSceneActive(snapshot.sceneVersion)) return false;

    let formValues: {name: string; description: string; coverFile: File | null} = {
        name: '',
        description: '',
        coverFile: null,
    };
    let setNameError: ((error: string) => void) | null = null;
    const template = {layers: snapshot.layers, configs: snapshot.configs};

    return new Promise<boolean>(resolve => {
        let modalId: string | undefined;
        let settled = false;
        let submitted = false;
        let unregisterDraft: () => void = () => undefined;

        const finish = (result: boolean) => {
            if (settled) return;
            settled = true;
            signal.removeEventListener('abort', abort);
            unregisterDraft();
            resolve(result);
        };
        const isSnapshotCurrent = () => isSceneActive(snapshot.sceneVersion);
        const cancelDraft = () => {
            if (submitted || settled) return;
            if (modalId) globalModal.modalApi?.destroy(modalId);
            finish(false);
        };
        const abort = () => cancelDraft();

        unregisterDraft = registerDraft(snapshot.sceneVersion, cancelDraft);
        if (signal.aborted || !isAccepting()) {
            finish(false);
            return;
        }

        const modalApi = globalModal.modalApi;
        if (!modalApi) {
            finish(false);
            return;
        }

        modalId = modalApi.confirm({
            title: '存为模板',
            content: createElement(() => {
                const [values, setValues] = useState(formValues);
                const [error, setError] = useState('');
                setNameError = setError;
                const updateValues = (next: typeof formValues) => {
                    formValues = next;
                    setValues(next);
                    if (next.name.trim()) setError('');
                };

                return createElement('div', {
                    style: {display: 'grid', gap: '12px', marginTop: '16px'},
                }, [
                    createElement('label', {
                        key: 'name',
                        style: {display: 'grid', gap: '8px'},
                    }, [
                        createElement('span', {key: 'label'}, '模板名称'),
                        createElement(Input, {
                            key: 'input',
                            value: values.name,
                            placeholder: '请输入模板名称',
                            status: error ? 'error' : 'default',
                            onChange: (value: string) => updateValues({...values, name: value}),
                        }),
                        error ? createElement('span', {
                            key: 'error',
                            style: {color: '#ff8f8f', fontSize: 12},
                        }, error) : null,
                    ]),
                    createElement('label', {
                        key: 'description',
                        style: {display: 'grid', gap: '8px'},
                    }, [
                        createElement('span', {key: 'label'}, '模板描述'),
                        createElement(TextArea, {
                            key: 'textarea',
                            value: values.description,
                            placeholder: '请输入模板描述',
                            rows: 3,
                            onChange: (value: string) => updateValues({...values, description: value}),
                        }),
                    ]),
                    createElement('label', {
                        key: 'coverFile',
                        style: {display: 'grid', gap: '8px'},
                    }, [
                        createElement('span', {key: 'label'}, '封面图'),
                        createElement('input', {
                            key: 'input',
                            type: 'file',
                            accept: 'image/*',
                            onChange: (event: ChangeEvent<HTMLInputElement>) => {
                                updateValues({...values, coverFile: event.target.files?.[0] ?? null});
                            },
                        }),
                        values.coverFile ? createElement('span', {
                            key: 'fileName',
                            style: {color: 'rgba(255,255,255,0.65)', fontSize: 12},
                        }, values.coverFile.name) : null,
                    ]),
                ]);
            }),
            okText: '确定',
            cancelText: '取消',
            icon: null,
            onOk: async () => {
                if (!isAccepting()) return false;
                if (!isSnapshotCurrent()) {
                    cancelDraft();
                    return false;
                }
                if (!formValues.name.trim()) {
                    setNameError?.('请输入模板名称');
                    return Promise.reject(new Error('template name is required'));
                }

                submitted = true;
                try {
                    const formData = new FormData();
                    formData.append('name', formValues.name.trim());
                    formData.append('description', formValues.description || '');
                    if (formValues.coverFile) formData.append('coverFile', formValues.coverFile);
                    formData.append('templateJson', JSON.stringify(template));
                    await trackTask((async () => {
                        await baseApi.createTemplate(formData);
                        if (isActive()) await emitCreated().catch(error => console.error('通知模板库刷新失败', error));
                    })());
                    if (isActive()) globalMessage.messageApi?.success('操作成功');
                    finish(true);
                    return true;
                } catch (error) {
                    submitted = false;
                    console.error('保存模板失败:', error);
                    return false;
                }
            },
            onCancel: () => {
                if (!submitted) finish(false);
            },
            afterClose: () => {
                if (!submitted) finish(false);
            },
        });

        signal.addEventListener('abort', abort, {once: true});
        if (signal.aborted) abort();
    });
}
