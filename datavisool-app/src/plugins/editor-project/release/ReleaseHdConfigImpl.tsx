/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import {observer} from "mobx-react";
import {useEffect, useRef, useState, type ReactNode} from 'react';
import type {EditorReleaseType} from '@datavisool/sdk/plugin/contracts/editorProject';
import {useEditorProject} from '@/shared/designer/EditorProjectContext.ts';
import './ReleaseHdConfigImpl.less';
import {Button, Dialog, Input, NumberInput, Select, Switch} from "@datavisool/ui";
import {Check, Info, LinkOne, Lock, Send, Time} from "@icon-park/react";
import {Base64Util} from "@datavisool/sdk";
import {globalMessage} from "@datavisool/ui";
import {isTauriRuntime, openDesktopWebview} from "@/util/TauriCompatUtil.ts";
import {withDesktopWebviewUserAgent} from "@/util/WebviewUserAgentUtil.ts";

const releaseTypeOptions = [
    {
        label: '增量发布',
        value: 'INCREMENT',
        description: '创建新的发布链接'
    },
    {
        label: '覆盖发布',
        value: 'OVERWRITE',
        description: '覆盖已有发布内容'
    }
];

const ReleaseField = (props: { label: string; children: ReactNode; className?: string }) => {
    const {label, children, className = ''} = props;

    return (
        <div className={`release-config-field ${className}`}>
            <div className="release-config-label">{label}</div>
            {children}
        </div>
    );
};

const ReleaseHdConfigImpl = observer(({onClose, canEdit}: {onClose(): void; canEdit(): boolean}) => {
    const {publish} = useEditorProject();
    const requestRef = useRef<AbortController>();
    const [publishing, setPublishing] = useState(false);
    const [releaseType, setReleaseType] = useState<EditorReleaseType>('OVERWRITE');
    const [encryptEnabled, setEncryptEnabled] = useState(false);
    const [password, setPassword] = useState('');
    const [expirationDays, setExpirationDays] = useState<number | undefined>();
    const [releaseId, setReleaseId] = useState<string | null>(null);

    useEffect(() => () => requestRef.current?.abort(), []);

    const close = () => {
        requestRef.current?.abort();
        onClose();
    };

    const releaseProject = async () => {
        if (!canEdit() || requestRef.current) return;
        const request = new AbortController();
        requestRef.current = request;
        setPublishing(true);
        try {
            const id = await publish({releaseType, encrypt: encryptEnabled, password, expirationDays}, request.signal);
            if (id && !request.signal.aborted) {
                setReleaseId(id);
                globalMessage.messageApi?.success('发布成功');
            }
        } catch (error) {
            if (!request.signal.aborted)
                globalMessage.messageApi?.error(error instanceof Error ? error.message : '发布失败');
        } finally {
            requestRef.current = undefined;
            if (!request.signal.aborted) setPublishing(false);
        }
    };

    const openRelease = () => {
        if (!canEdit() || !releaseId) return;
        const code = Base64Util.toBase64(releaseId);
        const isTauri = isTauriRuntime();
        if (isTauri) {
            void openDesktopWebview(`release-${releaseId}`, withDesktopWebviewUserAgent({
                url: `/release/${code}`,
                title: 'DataVisool Release',
                decorations: false,
                fullscreen: true
            }));
        } else {
            window.open(`/release/${code}`, '_blank');
        }
    }

    const updateEncrypt = (checked: boolean) => {
        setEncryptEnabled(checked);
        if (!checked) setPassword('');
    };

    return (
        <Dialog
            className="datavisool-header-release-config-dialog"
            bodyClassName="datavisool-header-release-config-body"
            width="min(560px, calc(100vw - 32px))"
            open={true}
            onClose={close}
            mask
            centered
            hideHeader
            showClose
        >
            <div className="datavisool-header-release-config">
                <div className="release-config-header">
                    <div className="release-config-title-row">
                        <h2>项目发布</h2>
                        <div className={`release-config-state ${releaseId ? 'ready' : ''}`}>
                            {releaseId ? <Check theme="outline" size={14} fill="currentColor"/> : <Send theme="outline" size={14} fill="currentColor"/>}
                            <span>{releaseId ? '已发布' : '待发布'}</span>
                        </div>
                    </div>
                    <p>设置发布方式、访问权限和有效期。</p>
                </div>

                <div className="release-config-panel">
                    <ReleaseField label="发布类型">
                        <Select
                            value={releaseType}
                            onChange={(value) => setReleaseType(value as EditorReleaseType)}
                            options={releaseTypeOptions}
                            block
                            controlClassName="release-config-select"
                            panelClassName="release-config-select-panel"
                        />
                    </ReleaseField>

                    <div className={`release-config-encrypt-card ${encryptEnabled ? 'enabled' : ''}`}>
                        <div className="release-config-encrypt-copy">
                            <span className="release-config-card-icon">
                                <Lock theme="outline" size={18} fill="currentColor"/>
                            </span>
                            <div>
                                <strong>访问加密</strong>
                                <p>开启后，访问发布页前需要输入密码。</p>
                            </div>
                        </div>
                        <Switch
                            value={encryptEnabled}
                            onChange={updateEncrypt}
                            controlClassName="release-config-switch"
                        />
                    </div>

                    {encryptEnabled ? (
                        <ReleaseField label="访问密码" className="release-config-password-field">
                            <Input
                                type="password"
                                value={password}
                                onChange={setPassword}
                                placeholder="请输入访问密码"
                                prefix={<Lock theme="outline" size={16} fill="currentColor"/>}
                                controlClassName="release-config-input"
                            />
                        </ReleaseField>
                    ) : null}

                    <ReleaseField label="有效期">
                        <NumberInput
                            min={1}
                            value={expirationDays}
                            onChange={setExpirationDays}
                            placeholder="未设置则永久有效"
                            prefix={<Time theme="outline" size={16} fill="currentColor"/>}
                            suffix="天"
                            controlClassName="release-config-number"
                        />
                    </ReleaseField>

                    <div className="release-config-desc">
                        <Info theme="outline" size={16} fill="currentColor"/>
                        <span>增量发布会创建新的发布链接；覆盖发布会更新现有项目的发布内容。</span>
                    </div>
                </div>

                <div className="release-config-footer">
                    <Button type="default" onClick={close} className="btn-cancel">
                        关闭
                    </Button>
                    {releaseId != null ? (
                        <Button
                            type="primary"
                            onClick={openRelease}
                            icon={<LinkOne theme="outline" size={16} fill="currentColor"/>}
                            className="btn-action"
                        >
                            查看发布
                        </Button>
                    ) : (
                        <Button
                            type="primary"
                            icon={<Send theme="outline" size={16} fill="currentColor"/>}
                            onClick={releaseProject}
                            loading={publishing}
                            className="btn-action"
                        >
                            发布项目
                        </Button>
                    )}
                </div>
            </div>
        </Dialog>
    );
})

export default ReleaseHdConfigImpl;
