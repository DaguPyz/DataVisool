/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import eventOperateStore from "@/designer/operate-provider/EventOperateStore.ts";
import {Button, CodeEditor, Dialog, globalMessage} from "@datavisool/ui";
import footerStore from "@/designer/footer/FooterStore.ts";
import {useEffect, useMemo, useState} from "react";
import {ObjectUtil} from "@datavisool/sdk";
import {SafeEvalUtil} from "@/util/SafeEvalUtil.ts";
import './ConfigCode.less';

export default function ConfigCode() {
    const {targetIds} = eventOperateStore;
    const {layerConfigs, controllers} = window.DATAVISOOL_ENV.currentManager.layerManager;
    const componentId = targetIds.length === 1 ? targetIds[0] : undefined;
    const layer = componentId ? layerConfigs[componentId] : undefined;
    const controller = componentId ? controllers[componentId] : undefined;
    const controllerConfig = controller?.getConfig();
    const canEdit = Boolean(
        componentId
        && layer
        && layer.type !== "group"
        && controller
        && controllerConfig
    );
    const initialCode = useMemo(() => {
        if (!controllerConfig)
            return "";
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const {base, ...config} = controllerConfig;
        return "const config = " + ObjectUtil.objToCodeStr(config);
    }, [controllerConfig]);
    const [code, setCode] = useState(initialCode);

    useEffect(() => {
        if (canEdit) {
            return;
        }
        globalMessage.messageApi?.warning("请选择组件后进行操作");
        footerStore.setConfigCodeVisible(false);
    }, [canEdit]);

    useEffect(() => {
        if (canEdit)
            setCode(initialCode);
    }, [canEdit, componentId, initialCode]);

    if (!canEdit || !controllerConfig)
        return null;
    const activeController = controller as NonNullable<typeof controller>;

    const onCancel = () => footerStore.setConfigCodeVisible(false);

    const onChange = (value?: string) => setCode(value ?? "");

    const doSave = () => {
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
                <Button onClick={doSave} type="primary" className="config-code-save">保存</Button>
                <Button onClick={onCancel} type="default">取消</Button>
            </div>
        </Dialog>
    )
}
