/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {type ReactNode, useRef, useState} from "react";
import {observer} from "mobx-react";
import {Api, Cube, Down, Help, Light, LinkOne, Play, Plus, Text} from "@icon-park/react";
import {Button, CodeEditor, Dialog, Input, Select} from "@datavisool/ui";
import apiManagementStore from "@/pages/home/api-management/ApiManagementStore.ts";
import {globalMessage} from "@datavisool/ui";
import FetchUtil from "@/util/FetchUtil.ts";
import DataUtil from "@/util/DataUtil.ts";
import styles from "@/pages/home/api-management/ApiManagement.module.less";
import {tx} from "@/i18n/miniI18n.ts";

const methodOptions = [
    {label: "GET", value: "GET"},
    {label: "POST", value: "POST"},
];

const FieldRow = ({
    label,
    help,
    children,
}: {
    label: string;
    help?: boolean;
    children: ReactNode;
}) => (
    <div className={styles.apiModalRow}>
        <div className={styles.apiModalLabel}>
            <span>{label}</span>
            {help ? <Help size={18} className={styles.apiModalHelpIcon} /> : null}
        </div>
        <div className={styles.apiModalControlSlot}>{children}</div>
    </div>
);

const ApiEditPanel = observer(() => {
    const testResultRef = useRef("");
    const [count, setCount] = useState(0);

    const {currentItem, modalVisible, setCurrentItem, saveItem, setModalVisible} = apiManagementStore;
    const nameValue = currentItem?.name ?? "";
    const isEdit = Boolean(currentItem?.id);

    const close = () => {
        testResultRef.current = "";
        setModalVisible(false);
    };

    const updateItem = (data: Partial<typeof currentItem>) => {
        setCurrentItem({...currentItem, ...data});
    };

    const test = async () => {
        const {url, params, headers, method = "GET"} = currentItem;
        if (!url) {
            globalMessage.messageApi?.warning(tx("请输入URL"));
            return;
        }
        const paramsObj = await DataUtil.resolveParams(params);
        const headersObj = await DataUtil.resolveHeaders(headers);
        const response = await FetchUtil.doRequestNativeResult(url, method, headersObj, paramsObj);
        if (response !== null) {
            testResultRef.current = JSON.stringify(response, null, 2);
            setCount(count + 1);
        }
    };

    const submit = () => {
        saveItem();
    };

    return (
        <Dialog
            open={modalVisible}
            onClose={close}
            mask
            maskClosable={false}
            centered
            hideHeader
            width="60vw"
            height="80vh"
            className={styles.apiEditDialog}
            bodyClassName={styles.apiEditDialogBody}
        >
            <header className={styles.apiModalHeader}>
                <span className={styles.apiModalHeaderIcon} aria-hidden="true">
                    <Api size={28} />
                </span>
                <div className={styles.apiModalTitleBlock}>
                    <h2>{isEdit ? "编辑 API" : "新建 API"}</h2>
                    <p>创建一个新的 API 接口，快速连接服务与应用</p>
                </div>
            </header>

            <div className={styles.apiModalContent}>
                <div className={styles.apiModalForm}>
                    <FieldRow label="名称">
                        <Input
                            value={nameValue}
                            onChange={(value) => updateItem({name: value})}
                            prefix={<Text size={22} />}
                            suffix={<span className={styles.apiInputCount}>{`${nameValue.length}/100`}</span>}
                            maxLength={100}
                            placeholder="请输入 API 名称"
                            controlClassName={styles.apiModalInput}
                        />
                    </FieldRow>

                    <FieldRow label="URL">
                        <Input
                            value={currentItem?.url ?? ""}
                            onChange={(value) => updateItem({url: value})}
                            prefix={<LinkOne size={24} />}
                            suffix={<span className={styles.apiUrlExample}>例如：https://api.example.com/v1/chat</span>}
                            placeholder="请输入完整的请求 URL"
                            controlClassName={styles.apiModalInput}
                        />
                    </FieldRow>

                    <FieldRow label="类型">
                        <Select
                            value={currentItem?.method ?? ""}
                            onChange={(value) => updateItem({method: String(value)})}
                            options={methodOptions}
                            placeholder="选择 API 类型"
                            prefix={<Cube size={24} />}
                            suffixIcon={<Down size={18} />}
                            block
                            controlClassName={styles.apiModalSelect}
                            panelClassName={styles.apiModalSelectPanel}
                        />
                    </FieldRow>

                    <FieldRow label="请求头" help>
                        <CodeEditor
                            key={`headers-${modalVisible}`}
                            value={currentItem?.headers ?? "{}"}
                            onChange={(value) => updateItem({headers: value})}
                            language="json"
                            fullScreen
                            height={102}
                            controlClassName={styles.apiModalCodeEditor}
                        />
                    </FieldRow>

                    <FieldRow label="请求参数" help>
                        <CodeEditor
                            key={`params-${modalVisible}`}
                            value={currentItem?.params ?? "{}"}
                            onChange={(value) => updateItem({params: value})}
                            language="json"
                            fullScreen
                            height={102}
                            controlClassName={styles.apiModalCodeEditor}
                        />
                    </FieldRow>

                    <FieldRow label="测试结果" help>
                        <CodeEditor
                            key={`result-${count}-${modalVisible}`}
                            value={testResultRef.current}
                            language="json"
                            readonly
                            fullScreen
                            height={160}
                            controlClassName={`${styles.apiModalCodeEditor} ${styles.apiModalResultEditor}`}
                        />
                    </FieldRow>
                </div>
            </div>

            <footer className={styles.apiModalFooter}>
                <div className={styles.apiModalTipIcon} aria-hidden="true">
                    <Light size={24} />
                </div>
                <div className={styles.apiModalTipCopy}>
                    <strong>温馨提示</strong>
                    <span>您可以先点击「测试」按钮，验证接口是否正确，再保存创建。</span>
                </div>
                <div className={styles.apiModalActions}>
                    <Button className={styles.apiCancelButton} type="default" onClick={close}>
                        取消
                    </Button>
                    <Button className={styles.apiTestButton} type="default" icon={<Play size={23} />} onClick={test}>
                        测试
                    </Button>
                    <Button className={styles.apiCreateButton} type="primary" icon={<Plus size={24} />} onClick={submit}>
                        {isEdit ? "保存" : "创建"}
                    </Button>
                </div>
            </footer>
        </Dialog>
    );
});

export default ApiEditPanel;
