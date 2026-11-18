/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import * as React from 'react';
import {useDataVisoolUITranslate} from '../context/DataVisoolUIContext';
import {cn} from '@/lib/utils';
import {UIContainer, UIContainerProps} from './UIContainer';
import {globalMessage} from './GlobalMessage';
import {IconImagePlus, IconTrash} from './Icon';
import {buildStyle, splitControlStyleProps} from './style';

export interface UploadDataType {
    url?: string;
    hash?: string;
}

export interface IImageData {
    id?: string;
    hash?: string;
    name?: string;
    blob?: Blob;
    url: string;
}

export interface UploadProps extends UIContainerProps {
    value?: string;
    defaultValue?: string;
    accept?: string;
    size?: number;
    disabled?: boolean;
    readOnly?: boolean;
    clearable?: boolean;
    previewAlt?: string;
    actionText?: string;
    description?: string;
    emptyText?: string;
    aspectRatio?: string | number;
    uploadHandle?: (file: File) => Promise<IImageData | boolean>;
    onChange?: (data: UploadDataType) => void;
    onError?: (message: string) => void;
}

export function ImageUpload(props: UploadProps) {
    const t = useDataVisoolUITranslate();
    const inputRef = React.useRef<HTMLInputElement>(null);
    const objectUrlRef = React.useRef<string>();
    const [styleProps, restProps] = splitControlStyleProps(props as unknown as Record<string, unknown>);
    const {
        value,
        defaultValue,
        accept = 'image/*',
        size,
        disabled,
        readOnly,
        clearable = true,
        previewAlt = t('上传图片预览'),
        actionText = t('选择图片'),
        description,
        emptyText = t('拖拽图片到此处，或点击选择'),
        aspectRatio,
        uploadHandle,
        onChange,
        onError,
        ...uiProp
    } = restProps as UploadProps;
    const controlled = value !== undefined;
    const [innerUrl, setInnerUrl] = React.useState(defaultValue ?? '');
    const [dragging, setDragging] = React.useState(false);
    const [loading, setLoading] = React.useState(false);
    const url = controlled ? value ?? '' : innerUrl;
    const interactive = !disabled && !readOnly && !loading;
    const uploadStyle = {
        '--datavisool-image-upload-aspect-ratio': aspectRatio === undefined ? undefined : String(aspectRatio),
        ...buildStyle(styleProps, styleProps.controlStyle),
    } as React.CSSProperties;

    React.useEffect(() => {
        return () => revokeObjectUrl();
    }, []);

    const updateUrl = (nextUrl: string, hash?: string) => {
        if (!controlled)
            setInnerUrl(nextUrl);
        onChange?.({url: nextUrl, hash});
    };

    const reportError = (message: string) => {
        globalMessage.warning(message);
        onError?.(message);
    };

    const revokeObjectUrl = () => {
        if (!objectUrlRef.current)
            return;
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = undefined;
    };

    const createLocalUrl = (file: File) => {
        revokeObjectUrl();
        const nextUrl = URL.createObjectURL(file);
        objectUrlRef.current = nextUrl;
        return nextUrl;
    };

    const handleFile = async (file?: File) => {
        if (!file)
            return;

        if (!file.type.startsWith('image/')) {
            reportError(t('请选择图片文件'));
            return;
        }

        if (size && file.size > size * 1024 * 1024) {
            reportError(t('文件大小不能超过 {size} MB', {size}));
            return;
        }

        setLoading(true);
        try {
            const localUrl = createLocalUrl(file);
            const result = uploadHandle ? await uploadHandle(file) : {url: localUrl};
            if (!result) {
                reportError(t('上传失败'));
                return;
            }

            if (result === true) {
                updateUrl(localUrl);
                return;
            }

            const next = result as IImageData;
            if (next.url && next.url !== localUrl)
                revokeObjectUrl();
            updateUrl(next.url || localUrl, next.hash);
        } catch {
            reportError(t('上传失败'));
        } finally {
            setLoading(false);
            if (inputRef.current)
                inputRef.current.value = '';
        }
    };

    const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        void handleFile(event.target.files?.[0]);
    };

    const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setDragging(false);
        if (!interactive)
            return;
        void handleFile(event.dataTransfer.files?.[0]);
    };

    const clearImage = () => {
        revokeObjectUrl();
        updateUrl('', '');
    };

    return (
        <UIContainer {...uiProp}>
            <div
                className={cn(
                    'datavisool-control datavisool-image-upload',
                    url && 'datavisool-image-upload-has-preview',
                    dragging && 'datavisool-image-upload-dragging',
                    loading && 'datavisool-image-upload-loading',
                    disabled && 'datavisool-image-upload-disabled',
                    readOnly && 'datavisool-image-upload-readonly',
                    styleProps.controlClassName,
                )}
                data-disabled={disabled ? 'true' : undefined}
                data-readonly={readOnly ? 'true' : undefined}
                data-loading={loading ? 'true' : undefined}
                style={uploadStyle}
                onDragEnter={(event) => {
                    event.preventDefault();
                    if (interactive)
                        setDragging(true);
                }}
                onDragOver={(event) => {
                    event.preventDefault();
                    if (interactive)
                        event.dataTransfer.dropEffect = 'copy';
                }}
                onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node))
                        setDragging(false);
                }}
                onDrop={handleDrop}
            >
                {url ? (
                    <div className="datavisool-image-upload-preview">
                        <img src={url} alt={previewAlt} className="datavisool-image-upload-image"/>
                        {clearable && !readOnly ? (
                            <button
                                type="button"
                                className="datavisool-image-upload-clear"
                                disabled={disabled || loading}
                                aria-label={t('清除图片')}
                                title={t('清除图片')}
                                onClick={clearImage}
                            >
                            <IconTrash size={16}/>
                            </button>
                        ) : null}
                        {loading ? <span className="datavisool-image-upload-status">{t('处理中...')}</span> : null}
                    </div>
                ) : (
                    <label className="datavisool-image-upload-empty">
                        <span className="datavisool-image-upload-icon" aria-hidden="true">
                            <IconImagePlus size={24}/>
                        </span>
                        <span className="datavisool-image-upload-title">{loading ? t('处理中...') : actionText}</span>
                        <span className="datavisool-image-upload-desc">{description ?? buildDescription(emptyText, accept, size)}</span>
                        <input
                            ref={inputRef}
                            className="datavisool-image-upload-input"
                            type="file"
                            accept={accept}
                            disabled={!interactive}
                            aria-label={actionText}
                            onChange={handleInputChange}
                        />
                    </label>
                )}
            </div>
        </UIContainer>
    );
}

function buildDescription(emptyText: string, accept?: string, size?: number) {
    const meta = [accept, size ? `≤ ${size} MB` : undefined].filter(Boolean).join(' · ');
    return meta ? `${emptyText}（${meta}）` : emptyText;
}
