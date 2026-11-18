/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import * as React from 'react';
import {useDataVisoolUITranslate} from '../context/DataVisoolUIContext';
import {cn} from '@/lib/utils';
import {IconTrash} from './Icon';
import {buildStyle, DataVisoolStyleProps, splitControlStyleProps} from './style';

export const UPLOAD_LIST_IGNORE = Symbol('datavisool-upload-list-ignore');

export type UploadFileStatus = 'done' | 'uploading' | 'error' | 'removed';

export interface UploadFile {
    uid: string;
    name: string;
    status?: UploadFileStatus;
    size?: number;
    type?: string;
    originFileObj?: File;
}

export type UploadBeforeUploadResult = boolean | symbol | void | Promise<boolean | symbol | void>;

export interface UploadDraggerProps extends DataVisoolStyleProps {
    accept?: string;
    multiple?: boolean;
    maxCount?: number;
    fileList?: UploadFile[];
    disabled?: boolean;
    className?: string;
    children?: React.ReactNode;
    beforeUpload?: (file: File, fileList: File[]) => UploadBeforeUploadResult;
    onRemove?: (file: UploadFile) => boolean | void | Promise<boolean | void>;
}

function createUploadFile(file: File): UploadFile {
    return {
        uid: `${file.name}-${file.lastModified}-${file.size}`,
        name: file.name,
        size: file.size,
        type: file.type,
        status: 'done',
        originFileObj: file,
    };
}

function UploadRoot() {
    return null;
}

function Dragger(props: UploadDraggerProps) {
    const t = useDataVisoolUITranslate();
    const inputRef = React.useRef<HTMLInputElement>(null);
    const [styleProps, restProps] = splitControlStyleProps(props as unknown as Record<string, unknown>);
    const {
        accept,
        multiple,
        maxCount,
        fileList,
        disabled,
        className,
        children,
        beforeUpload,
        onRemove,
    } = restProps as UploadDraggerProps;
    const controlled = fileList !== undefined;
    const [innerFileList, setInnerFileList] = React.useState<UploadFile[]>([]);
    const [dragging, setDragging] = React.useState(false);
    const currentFileList = controlled ? fileList ?? [] : innerFileList;
    const availableCount = maxCount === undefined ? Infinity : Math.max(maxCount - currentFileList.length, 0);
    const interactive = !disabled && availableCount > 0;

    const appendFiles = (nextFiles: UploadFile[]) => {
        if (controlled || nextFiles.length === 0)
            return;
        setInnerFileList((prev) => maxCount === undefined ? [...prev, ...nextFiles] : [...prev, ...nextFiles].slice(0, maxCount));
    };

    const chooseFiles = async (files: File[]) => {
        if (!interactive)
            return;

        const selectedFiles = files.slice(0, availableCount);
        const nextFiles: UploadFile[] = [];

        for (const file of selectedFiles) {
            const result = beforeUpload ? await beforeUpload(file, selectedFiles) : undefined;
            if (result === UPLOAD_LIST_IGNORE)
                continue;
            nextFiles.push(createUploadFile(file));
        }

        appendFiles(nextFiles);
        if (inputRef.current)
            inputRef.current.value = '';
    };

    const removeFile = async (file: UploadFile) => {
        const result = await onRemove?.(file);
        if (result === false || controlled)
            return;
        setInnerFileList((prev) => prev.filter((item) => item.uid !== file.uid));
    };

    return (
        <div
            className={cn(
                'datavisool-upload-dragger',
                dragging && 'datavisool-upload-dragger-dragging',
                disabled && 'datavisool-upload-dragger-disabled',
                className,
            )}
            data-disabled={disabled ? 'true' : undefined}
            style={buildStyle(styleProps)}
            role="button"
            tabIndex={disabled ? -1 : 0}
            onClick={() => {
                if (interactive)
                    inputRef.current?.click();
            }}
            onKeyDown={(event) => {
                if ((event.key === 'Enter' || event.key === ' ') && interactive) {
                    event.preventDefault();
                    inputRef.current?.click();
                }
            }}
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
            onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                void chooseFiles(Array.from(event.dataTransfer.files));
            }}
        >
            <input
                ref={inputRef}
                className="datavisool-upload-input"
                type="file"
                accept={accept}
                multiple={multiple}
                disabled={!interactive}
                onChange={(event) => void chooseFiles(Array.from(event.target.files ?? []))}
            />
            <div className="datavisool-upload-drag-container">{children}</div>
            {currentFileList.length > 0 ? (
                <ul className="datavisool-upload-list">
                    {currentFileList.map((file) => (
                        <li key={file.uid} className="datavisool-upload-list-item">
                            <span className="datavisool-upload-list-name" title={file.name}>{file.name}</span>
                            <button
                                type="button"
                                className="datavisool-upload-list-remove"
                                disabled={disabled}
                                aria-label={t('移除 {name}', {name: file.name})}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    void removeFile(file);
                                }}
                            >
                                <IconTrash size={14}/>
                            </button>
                        </li>
                    ))}
                </ul>
            ) : null}
        </div>
    );
}

export const Upload = Object.assign(UploadRoot, {
    Dragger,
    LIST_IGNORE: UPLOAD_LIST_IGNORE,
});
