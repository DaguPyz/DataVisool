/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {Button, CodeEditor, Dialog, globalMessage} from "@datavisool/ui";
import {useEffect, useMemo, useState} from "react";
import {ObjectUtil} from "@datavisool/sdk";
import {SafeEvalUtil} from "@/util/SafeEvalUtil.ts";
import './ConfigCode.less';
import type {EditorInspectorDomain} from '@datavisool/sdk/plugin/contracts/editorInspector';

export default function ConfigCode({targetIds, domain, canEdit, onClose}: {targetIds: readonly string[]; domain: EditorInspectorDomain; canEdit(): boolean; onClose(): void}) {
    const componentId = targetIds.length === 1 ? targetIds[0] : undefined;
    const layer = componentId ? domain.readTarget(componentId)?.layer : undefined;
    const controller = useMemo(() => componentId ? domain.createControllerFacade(componentId) : undefined, [componentId, domain]);
    const controllerConfig = controller?.getConfig();
    const hasCurrentTarget = Boolean(
        componentId
        && layer
        && layer.type !== "group"
        && controller
        && controller.isCurrent()
        && controllerConfig
    );
    const canSave = hasCurrentTarget && canEdit();
    const initialCode = useMemo(() => {
        if (!controllerConfig)
            return "";
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const {base, ...config} = controllerConfig;
        return "const config = " + ObjectUtil.objToCodeStr(config);
    }, [controllerConfig]);
    const [code, setCode] = useState(initialCode);

    useEffect(() => {
        if (hasCurrentTarget) {
            return;
        }
        globalMessage.messageApi?.warning("请选择组件后进行操作");
        onClose();
    }, [hasCurrentTarget, onClose]);

    useEffect(() => {
        if (hasCurrentTarget)
            setCode(initialCode);
    }, [hasCurrentTarget, componentId, initialCode]);

    if (!hasCurrentTarget || !controllerConfig)
        return null;
    const activeController = controller as NonNullable<typeof controller>;

    const onCancel = onClose;

    const onChange = (value?: string) => { if (canEdit()) setCode(value ?? ""); };

    const doSave = () => {
        if (!canEdit()) return;
        if (!domain.isActive() || !activeController.isCurrent()) {
            onClose();
            return;
        }
        try {
            const executableCode = code.trim().replace(/^const config =/, '').trim();
            const config = SafeEvalUtil.run(executableCode, {
                returnNullOnError: false,
                allowTypes: ['object'],
            });
            if (!config || Array.isArray(config))
                throw new Error('组件配置必须是对象');
            activeController.update(config)
            globalMessage.messageApi?.success('配置已更新');
        } catch (e) {
            globalMessage.messageApi?.error('代码错误,请检查');
            console.error(e)
        }
    }

    return (
        <Dialog title={'代码编辑'} open={true} width="min(640px, calc(100vw - 32px))"
                height="min(800px, calc(100dvh - 96px))" className="datavisool-config-code-dialog"
                onClose={onCancel} mask={false} initialPosition={{x: Math.max(16, window.innerWidth - 660), y: 72}} showClose>
            <CodeEditor onChange={onChange} language={'javascript'} value={code} quickSuggestions={true} height="100%" fullScreen={true}/>
            <div className="config-code-actions">
                <Button onClick={doSave} disabled={!canSave} type="primary" className="config-code-save">保存</Button>
                <Button onClick={onCancel} type="default">取消</Button>
            </div>
        </Dialog>
    )
}
