/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import './CoverConfig.less';
import {useRef, useState} from "react";
import {Button, Dialog, globalMessage, Upload as DatavisoolUpload, type UploadFile} from "@datavisool/ui";
import {DeleteOne, UploadLaptop} from "@icon-park/react";
import baseApi from "@/api/engineering/BaseApi.ts";

const {Dragger} = DatavisoolUpload;

type CoverUploadFile = UploadFile & {
    url?: string;
};

export interface CoverConfigProps {
    onClose: () => void;
}

export const CoverConfig = (prop: CoverConfigProps) => {
    const {onClose} = prop;
    const urlRef = useRef<string | null>(null);
    const imageFileRef = useRef<File | null>(null);
    const [fileList, setFileList] = useState<CoverUploadFile[]>([]);
    const [saving, setSaving] = useState(false);
    const currentFile = fileList[0];

    const doSave = () => {
        if (!imageFileRef.current) {
            globalMessage.messageApi?.warning('请先上传封面');
            return;
        }
        if (saving) return;
        setSaving(true);
        baseApi.uploadCover(imageFileRef.current!).then((data) => {
            setSaving(false);
            if (data) {
                globalMessage.messageApi?.info('封面生成成功！');
                _onClose();
            } else globalMessage.messageApi?.error('封面生成失败！');
        }).catch(() => {
            setSaving(false);
            globalMessage.messageApi?.error('封面生成失败！');
        });
    }

    const _onClose = () => {
        if (urlRef.current) {
            URL.revokeObjectURL(urlRef.current!);
            imageFileRef.current = null;
        }
        onClose();
    }

    const clearSelectedFile = () => {
        if (urlRef.current) {
            URL.revokeObjectURL(urlRef.current);
            urlRef.current = null;
        }
        imageFileRef.current = null;
        setFileList([]);
    }

    const beforeUpload = (file: File, selectedFiles: File[]) => {
        if (file !== selectedFiles[0]) return DatavisoolUpload.LIST_IGNORE;
        clearSelectedFile();
        imageFileRef.current = file;
        const url = URL.createObjectURL(file);
        urlRef.current = url;
        setFileList([{
            uid: `${file.name}-${file.lastModified}-${file.size}`,
            name: file.name,
            status: 'done',
            size: file.size,
            type: file.type,
            originFileObj: file,
            url
        }]);
        //阻止默认上传
        return false;
    }

    return (
        <Dialog
            title={<div className={'cover-config-title'}>
                <span className={'cover-config-title-main'}>{'封面设置'}</span>
                <span className={'cover-config-title-sub'}>{'用于项目列表展示，建议使用横版图片'}</span>
            </div>}
            className={'cover-config-modal'}
            open={true}
            width={620}
            onClose={_onClose}
            mask
            maskClosable={!saving}
            centered
            showClose={!saving}
        >
            <div className={'cover-config-content'}>
                <div className={'cover-upload-section'}>
                    <Dragger
                        beforeUpload={beforeUpload}
                        fileList={fileList}
                        accept={'image/*'}
                        className={`cover-upload${currentFile?.url ? ' has-file' : ''}`}
                    >
                        <div className={`cover-drop-zone${currentFile?.url ? ' has-file' : ''}`}>
                            {currentFile?.url ? <>
                                <img className={'cover-preview-image'} src={currentFile.url} alt={'封面预览'}/>
                                <span className={'cover-preview-badge'}>
                                    <UploadLaptop size={16} strokeWidth={1.75} aria-hidden="true"/>
                                    {'点击更换'}
                                </span>
                            </> : <div className={'cover-empty-layout'}>
                                <span className={'cover-upload-icon'} aria-hidden="true">
                                    <UploadLaptop size={24} strokeWidth={1.75}/>
                                </span>
                                <span className={'cover-upload-title'}>{'拖拽图片到此处'}</span>
                                <span className={'cover-upload-btn'}>{'选择图片'}</span>
                                <span className="upload-meta">{'支持 JPG / PNG / WebP'}</span>
                            </div>}
                        </div>
                    </Dragger>
                    <div className={'cover-file-bar'} aria-live="polite">
                        <div className={'cover-file-info'}>
                            <span className={'cover-file-name'} title={currentFile?.name || undefined}>
                                {currentFile?.name || '未选择图片'}
                            </span>
                            <span className={'cover-file-meta'}>
                                {currentFile ? '待保存为项目封面' : '建议使用 16:9 图片'}
                            </span>
                        </div>
                        {currentFile && <div className={'cover-file-actions'}>
                            <Button
                                type={'text'}
                                className={'cover-text-btn danger'}
                                icon={<DeleteOne size={16} strokeWidth={1.75} aria-hidden="true"/>}
                                onClick={clearSelectedFile}
                            >
                                {'移除'}
                            </Button>
                        </div>}
                    </div>
                </div>
                <div className={'cover-action-section'}>
                    <Button type="default" onClick={_onClose} className="cover-cancel-btn" disabled={saving}>{'取消'}</Button>
                    <Button
                        type="primary"
                        onClick={doSave}
                        className="cover-save-btn"
                        loading={saving}
                        disabled={!currentFile}
                    >
                        {'保存封面'}
                    </Button>
                </div>
            </div>
        </Dialog>
    );
}
