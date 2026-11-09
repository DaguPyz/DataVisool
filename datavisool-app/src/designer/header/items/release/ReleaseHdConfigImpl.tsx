/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import {observer} from "mobx-react";
import {ReactNode, useRef, useState} from 'react';
import './ReleaseHdConfigImpl.less';
import {Button, Dialog, Input, NumberInput, Select, Switch} from "@datavisool/ui";
import {Check, Info, LinkOne, Lock, Send, Time} from "@icon-park/react";
import AuthFetchUtil from "@/util/AuthFetchUtil.ts";
import {Base64Util} from "@datavisool/sdk";
import designerHeaderStore from "@/designer/header/DesignerHeaderStore.ts";
import ProjectUtil from "@/util/ProjectUtil.ts";
import {IProject} from "@datavisool/sdk/types";
import {globalMessage} from "@datavisool/ui";
import {EncryptResult, HybridCryptoUtil} from "@/util/HybridCryptoUtil.ts";
import ProjectDataCodecUtil from "@/util/ProjectDataCodecUtil.ts";
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

export interface IReleaseHdConfig {
    releaseType: string;
    projectId: string;
    encrypt: boolean;
    password: string | null | EncryptResult;
    dependencies: Array<any>,
    expirationDate: string | null
}

const ReleaseField = (props: { label: string; children: ReactNode; className?: string }) => {
    const {label, children, className = ''} = props;

    return (
        <div className={`release-config-field ${className}`}>
            <div className="release-config-label">{label}</div>
            {children}
        </div>
    );
};

const ReleaseHdConfigImpl = observer(() => {
    const configRef = useRef<IReleaseHdConfig>({
        releaseType: 'OVERWRITE',
        projectId: window.DATAVISOOL_ENV.projectId,
        encrypt: false,
        password: null,
        dependencies: [],
        expirationDate: null
    });
    const [releaseType, setReleaseType] = useState('OVERWRITE');
    const [encryptEnabled, setEncryptEnabled] = useState(false);
    const [password, setPassword] = useState('');
    const [expirationDays, setExpirationDays] = useState<number | undefined>();
    const [releaseId, setReleaseId] = useState<string | null>(null);

    const onClose = () => {
        designerHeaderStore.setCurrentKey('')
    }

    const releaseProject = async () => {
        if (configRef.current.encrypt && !configRef.current.password) {
            globalMessage.messageApi?.error('开启加密时必须填写密码');
            return;
        }
        const dependencies: Array<any> = [];
        const mainManger = window.DATAVISOOL_ENV.mainManger;
        const project: IProject = {id: mainManger.id!, name: mainManger.name!, data: mainManger.getData()}
        setReleaseId(null);
        try {
            await ProjectUtil.cyclicBuildReleaseDependencies(project, dependencies);
            // 字段级压缩：每个依赖的 projectJson
            dependencies.forEach((dep: any) => {
                if (dep?.projectJson) {
                    dep.projectJson = ProjectDataCodecUtil.compressIfBeneficial(dep.projectJson);
                }
            });
            const encryptedPassword = configRef.current.encrypt
                ? await HybridCryptoUtil.encryptRequest(configRef.current.password! as string) as EncryptResult
                : null;
            const res = await AuthFetchUtil.post<string>("/api/release/release", {
                ...configRef.current, dependencies, password: encryptedPassword,
            });
            if (res !== null) {
                setReleaseId(res);
                globalMessage.messageApi?.success('发布成功');
            }
        } catch (error) {
            globalMessage.messageApi?.error(error instanceof Error ? error.message : '发布失败');
        }
    }

    const openRelease = () => {
        if (!releaseId) return;
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

    const updateReleaseType = (value: string) => {
        configRef.current.releaseType = value;
        setReleaseType(value);
    }

    const updateEncrypt = (checked: boolean) => {
        configRef.current.encrypt = checked;
        setEncryptEnabled(checked);
        if (!checked) {
            configRef.current.password = null;
            setPassword('');
        }
    }

    const updatePassword = (value: string) => {
        configRef.current.password = value;
        setPassword(value);
    }

    const updateExpirationDate = (value: number | undefined) => {
        configRef.current.expirationDate = value as any;
        setExpirationDays(value);
    }

    return (
        <Dialog
            className="datavisool-header-release-config-dialog"
            bodyClassName="datavisool-header-release-config-body"
            width="min(560px, calc(100vw - 32px))"
            open={true}
            onClose={onClose}
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
                            onChange={(value) => updateReleaseType(value as string)}
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
                                onChange={updatePassword}
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
                            onChange={updateExpirationDate}
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
                    <Button type="default" onClick={onClose} className="btn-cancel">
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
