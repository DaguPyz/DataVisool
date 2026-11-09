/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {useEffect, useRef, useState} from "react";
import type {ComponentProps, ReactNode} from "react";
import {Button, Dialog, Input, NumberInput, Select, Switch, TextArea} from "@datavisool/ui";
import {
    Attention,
    CheckOne,
    ConnectionPoint,
    DatabaseSetting,
    Globe,
    Link,
    Lock,
    PreviewClose,
    PreviewOpen,
    Puzzle,
    Shield,
    TagOne,
    User,
} from "@icon-park/react";
import {IDataSource} from "@/pages/home/database/DataBaseStore.ts";
import "@/pages/home/database/DataBasePanel.less";
import panelTipArt from "@/pages/home/database/assets/database-panel-tip-art.webp";

type DatavisoolInputProps = ComponentProps<typeof Input>;
type DataBaseFormValues = Omit<IDataSource, "port"> & {
    port?: string | number;
    allowSqlScript?: boolean;
};
type DataBaseFormErrors = Partial<Record<keyof DataBaseFormValues, string>>;

const DEFAULT_FORM_VALUES: DataBaseFormValues = {
    id: undefined,
    type: undefined,
    name: "",
    ip: "",
    port: undefined,
    username: "",
    password: "",
    databaseName: "",
    url: "",
    des: "",
    allowSqlScript: false,
};

const databaseTypeOptions = [
    {label: 'MySQL', value: 'MySQL'},
    {label: 'PostgresSQL', value: 'PostgresSQL'},
    {label: 'Oracle', value: 'Oracle'},
    {label: 'SQLServer', value: 'SQLServer'},
];

const isEmptyValue = (value: unknown) => value === undefined || value === null || value === "";

const normalizePortValue = (value?: string | number) => {
    if (value === undefined || value === "")
        return undefined;
    const port = Number(value);
    return Number.isFinite(port) ? port : undefined;
};

const buildInitialValues = (data?: IDataSource): DataBaseFormValues => ({
    ...DEFAULT_FORM_VALUES,
    ...data,
    port: data?.port ?? DEFAULT_FORM_VALUES.port,
    allowSqlScript: data?.allowSqlScript ?? false,
});

const PasswordInput = (props: DatavisoolInputProps) => {
    const [passwordVisible, setPasswordVisible] = useState(false);

    return (
        <Input
            {...props}
            type={passwordVisible ? "text" : "password"}
            suffix={(
                <button
                    className="datasource-password-toggle"
                    type="button"
                    tabIndex={-1}
                    aria-label={passwordVisible ? "隐藏密码" : "显示密码"}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setPasswordVisible((visible) => !visible)}
                >
                    {passwordVisible
                        ? <PreviewOpen size={23} fill="#8791AD"/>
                        : <PreviewClose size={23} fill="#8791AD"/>
                    }
                </button>
            )}
        />
    );
};

const Field = ({
                   label,
                   error,
                   className,
                   children,
               }: {
    label: ReactNode;
    error?: string;
    className?: string;
    children: ReactNode;
}) => (
    <div className={`datasource-form-field ${error ? "datasource-form-field-invalid" : ""} ${className ?? ""}`}>
        <div className="datasource-form-label">{label}</div>
        <div className="datasource-form-control">{children}</div>
        {error ? <div className="datasource-form-error">{error}</div> : null}
    </div>
);

export interface UserPanelProps {
    title?: string;
    visible: boolean;
    onClose: () => void;
    onSubmitted: (data: IDataSource) => void;
    data?: IDataSource;
}

export default function DataBasePanel(props: UserPanelProps) {
    const {visible, onClose, data, onSubmitted, title} = props;
    const [formValues, setFormValues] = useState<DataBaseFormValues>(DEFAULT_FORM_VALUES);
    const [formErrors, setFormErrors] = useState<DataBaseFormErrors>({});
    const initializedRecordRef = useRef<string | null>(null);
    const descriptionValue = formValues.des ?? "";
    const allowSqlScript = formValues.allowSqlScript ?? false;

    const fieldIcon = (icon: ReactNode) => (
        <span className="datasource-field-icon">
            {icon}
        </span>
    );

    const optionalLabel = (label: string) => (
        <span className="datasource-label-with-tip">
            {label}
            <span>（可选）</span>
        </span>
    );

    const updateField = <K extends keyof DataBaseFormValues>(field: K, value: DataBaseFormValues[K]) => {
        setFormValues((prev) => ({...prev, [field]: value}));
        setFormErrors((prev) => {
            if (!prev[field])
                return prev;
            const nextErrors = {...prev};
            delete nextErrors[field];
            return nextErrors;
        });
    };

    const updateType = (value: string | number | Array<string | number>) => {
        const nextValue = Array.isArray(value) ? value[0] : value;
        const option = databaseTypeOptions.find((item) => String(item.value) === String(nextValue));
        updateField("type", option?.value ?? "");
    };

    const validateValues = (values: DataBaseFormValues) => {
        const nextErrors: DataBaseFormErrors = {};

        if (isEmptyValue(values.type))
            nextErrors.type = "请选择数据库类型";
        if (isEmptyValue(values.name))
            nextErrors.name = "请输入数据库显示名称";
        if (isEmptyValue(values.ip))
            nextErrors.ip = "请输入IP/域名";
        if (isEmptyValue(values.port))
            nextErrors.port = "请输入端口";
        if (isEmptyValue(values.username))
            nextErrors.username = "请输入用户名";
        if (isEmptyValue(values.password))
            nextErrors.password = "请输入密码";
        if (isEmptyValue(values.databaseName))
            nextErrors.databaseName = "请输入数据库名称";

        return nextErrors;
    };

    const submit = () => {
        const nextErrors = validateValues(formValues);
        setFormErrors(nextErrors);
        if (Object.keys(nextErrors).length > 0)
            return;

        onSubmitted({
            ...formValues,
            port: formValues.port === undefined ? undefined : String(formValues.port),
            allowSqlScript: Boolean(formValues.allowSqlScript),
        } as IDataSource);
    };

    const _onClose = () => {
        initializedRecordRef.current = null;
        setFormValues(DEFAULT_FORM_VALUES);
        setFormErrors({});
        onClose();
    }

    useEffect(() => {
        if (!visible) {
            initializedRecordRef.current = null;
            return;
        }

        const recordKey = data?.id ?? "__create__";
        if (initializedRecordRef.current === recordKey)
            return;

        initializedRecordRef.current = recordKey;
        setFormValues(buildInitialValues(data));
        setFormErrors({});
    }, [data, data?.id, visible]);

    return (
        <Dialog className="datasource-panel"
                bodyClassName="datasource-panel-body"
                width="60vw"
                height="80vh"
                onClose={_onClose}
                open={visible}
                mask
                centered
                hideHeader
        >
            <div className="datasource-panel-header">
                <div className="datasource-panel-title">
                    <span className="datasource-panel-title-icon" aria-hidden="true">
                        <DatabaseSetting size={26} fill="currentColor"/>
                    </span>
                    <div>
                        <h2>{title || "创建数据库连接"}</h2>
                        <p>配置数据库连接信息以便系统访问和管理</p>
                    </div>
                </div>
                <div className="datasource-panel-actions">
                    <Button type="default" onClick={_onClose} className="cancel-btn">
                        取消
                    </Button>
                    <Button type="primary" onClick={submit} className="submit-btn"
                            icon={<CheckOne size={20} fill="#FFFFFF"/>}>
                        提交
                    </Button>
                </div>
            </div>

            <div className="datasource-panel-content">
                <div className="datasource-form">
                    <div className="datasource-form-grid">
                        <Field
                            label="类型"
                            error={formErrors.type}
                        >
                            <Select
                                value={formValues.type ?? ""}
                                onChange={updateType}
                                allowClear
                                placeholder="请选择数据库类型"
                                block
                                controlClassName="datasource-select"
                                panelClassName="datasource-select-panel"
                                prefix={fieldIcon(<Puzzle size={25} fill="currentColor"/>)}
                                options={databaseTypeOptions}
                            />
                        </Field>

                        <Field
                            label="名称"
                            error={formErrors.name}
                        >
                            <Input
                                value={formValues.name ?? ""}
                                onChange={(value) => updateField("name", value)}
                                placeholder="请输入数据库显示名称"
                                controlClassName="datasource-input"
                                prefix={fieldIcon(<TagOne size={25} fill="currentColor"/>)}
                            />
                        </Field>

                        <Field
                            label="IP/域名"
                            error={formErrors.ip}
                        >
                            <Input
                                value={formValues.ip ?? ""}
                                onChange={(value) => updateField("ip", value)}
                                placeholder="请输入 IP / 域名"
                                controlClassName="datasource-input"
                                prefix={fieldIcon(<Globe size={25} fill="currentColor"/>)}
                            />
                        </Field>

                        <Field
                            label="端口"
                            error={formErrors.port}
                        >
                            <NumberInput
                                value={normalizePortValue(formValues.port)}
                                onChange={(value) => updateField("port", value)}
                                placeholder="请输入端口"
                                controlClassName="datasource-input datasource-number-input"
                                prefix={fieldIcon(<ConnectionPoint size={25} fill="currentColor"/>)}
                                controls={false}
                                min={0}
                                precision={0}
                            />
                        </Field>

                        <Field
                            label="用户名"
                            error={formErrors.username}
                        >
                            <Input
                                value={formValues.username ?? ""}
                                onChange={(value) => updateField("username", value)}
                                placeholder="请输入用户名"
                                controlClassName="datasource-input"
                                prefix={fieldIcon(<User size={25} fill="currentColor"/>)}
                            />
                        </Field>

                        <Field
                            label="密码"
                            error={formErrors.password}
                        >
                            <PasswordInput
                                value={formValues.password ?? ""}
                                onChange={(value) => updateField("password", value)}
                                placeholder="请输入密码"
                                controlClassName="datasource-input"
                                prefix={fieldIcon(<Lock size={25} fill="currentColor"/>)}
                            />
                        </Field>

                        <Field
                            label="数据库名"
                            error={formErrors.databaseName}
                        >
                            <Input
                                value={formValues.databaseName ?? ""}
                                onChange={(value) => updateField("databaseName", value)}
                                placeholder="请输入数据库名称"
                                controlClassName="datasource-input"
                                prefix={fieldIcon(<DatabaseSetting size={25} fill="currentColor"/>)}
                            />
                        </Field>

                        <Field label={optionalLabel("URL")}>
                            <Input
                                value={formValues.url ?? ""}
                                onChange={(value) => updateField("url", value)}
                                placeholder="请输入 URL（填写 IP、端口、数据库名称后可不填）"
                                controlClassName="datasource-input"
                                prefix={fieldIcon(<Link size={25} fill="currentColor"/>)}
                            />
                        </Field>
                    </div>

                    <div className="datasource-script-block">
                        <div className="datasource-script-card">
                            {fieldIcon(<Shield size={26} fill="currentColor"/>)}
                            <div className="datasource-script-copy">
                                <div>
                                    允许执行存储过程、函数和 SQL 脚本
                                    <span>（可选）</span>
                                </div>
                                <p>开启后，连接将允许执行存储过程、函数和 SQL 脚本操作</p>
                            </div>
                            <Switch
                                value={allowSqlScript}
                                onChange={(value) => updateField("allowSqlScript", value)}
                                className="datasource-script-switch-field"
                                controlClassName="datasource-script-switch"
                            />
                        </div>
                        {allowSqlScript ? (
                            <div className="datasource-script-risk">
                                <span className="datasource-script-risk-icon">
                                    <Attention theme="filled" size={18} fill="#FFB84D"/>
                                </span>
                                <div>
                                    <strong>高风险操作</strong>
                                    <p>开启后，该数据源允许执行存储过程、函数以及非查询
                                        SQL。脚本可能修改、删除或锁定数据库数据，请只对可信数据库开启。</p>
                                </div>
                            </div>
                        ) : null}
                    </div>

                    <Field label={optionalLabel("描述信息")} className="datasource-description-item">
                        <TextArea
                            value={formValues.des ?? ""}
                            onChange={(value) => updateField("des", value)}
                            placeholder="请输入描述信息..."
                            rows={5}
                            maxLength={500}
                            controlClassName="datasource-textarea"
                        />
                    </Field>
                    <div className="datasource-description-count">
                        {descriptionValue.length} / 500
                    </div>

                    <div className="datasource-tip-card">
                        <div className="datasource-tip-copy">
                            <div className="datasource-tip-title">
                                <span className="datasource-tip-spark">✦</span>
                                <span>温馨提示</span>
                            </div>
                            <p>请确保提供的信息准确无误，以保证数据库连接的正常使用和数据安全。</p>
                        </div>
                        <img src={panelTipArt} alt=""/>
                    </div>
                </div>
            </div>
        </Dialog>
    )
}
