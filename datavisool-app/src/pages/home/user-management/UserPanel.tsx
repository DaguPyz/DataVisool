/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {useEffect, useMemo, useState} from "react";
import {Button, Dialog, Input} from "@datavisool/ui";
import {IUser} from "./UserManagementStore.ts";
import {getRoles, IRole, quickSearchRole} from "../../../api/RoleApi.ts";
import {globalMessage} from "@datavisool/ui";
import {Mail, People, PhoneTelephone, Shield, User} from "@icon-park/react";
import styles from "./UserManagement.module.less";
import {tx} from "@/i18n/miniI18n.ts";

export interface UserPanelProps {
    width?: number;
    title?: string;
    visible: boolean;
    onClose: () => void;
    onSubmitted: (data: IUser) => void;
    data?: IUser;
    saving?: boolean;
}

type UserFormState = {
    id?: string;
    username: string;
    name: string;
    phone: string;
    email: string;
    password: string;
    roles: string[];
};

const normalizeRoles = (roles?: Array<string | IRole>) => {
    if (!Array.isArray(roles)) return [];
    return roles.map((role) => typeof role === "string" ? role : role.id).filter(Boolean);
};

export default function UserPanel(props: UserPanelProps) {
    const {visible, onClose, data, onSubmitted, title, saving = false, width = "min(720px, calc(100vw - 48px))"} = props;
    const [form, setForm] = useState<UserFormState>({
        username: "",
        name: "",
        phone: "",
        email: "",
        password: "",
        roles: [],
    });
    const [roleOptions, setRoleOptions] = useState<IRole[]>([]);

    useEffect(() => {
        if (!visible) {
            setForm(prev => ({...prev, password: ""}));
            return;
        }

        const nextRoles = normalizeRoles(data?.roles as Array<string | IRole> | undefined);
        setForm({
            id: data?.id,
            username: data?.username ?? "",
            name: data?.name ?? "",
            phone: data?.phone ?? "",
            email: data?.email ?? "",
            password: "",
            roles: nextRoles,
        });

        Promise.all([
            quickSearchRole(""),
            nextRoles.length > 0 ? getRoles(nextRoles) : Promise.resolve([]),
        ]).then(([quickRoles, selectedRoles]) => {
            const map = new Map<string, IRole>();
            (quickRoles ?? []).forEach((role) => map.set(role.id, role));
            (selectedRoles ?? []).forEach((role) => map.set(role.id, role));
            setRoleOptions(Array.from(map.values()));
        });
    }, [data, visible]);

    const selectedRoleSet = useMemo(() => new Set(form.roles), [form.roles]);

    const updateField = (key: keyof UserFormState, value: string) => {
        setForm((prev) => ({...prev, [key]: value}));
    };

    const toggleRole = (roleId: string) => {
        setForm((prev) => ({
            ...prev,
            roles: prev.roles.includes(roleId)
                ? prev.roles.filter((id) => id !== roleId)
                : [...prev.roles, roleId],
        }));
    };

    const submit = () => {
        if (saving) return;
        if (!form.username.trim()) {
            globalMessage.messageApi?.warning(tx("请输入用户名"));
            return;
        }
        if (!form.name.trim()) {
            globalMessage.messageApi?.warning(tx("请输入姓名"));
            return;
        }
        if (!form.id && (form.password.trim().length === 0 || Array.from(form.password).length < 8
                || new TextEncoder().encode(form.password).length > 72)) {
            globalMessage.messageApi?.warning(tx("密码至少8个字符且不超过72字节"));
            return;
        }
        onSubmitted({
            ...data,
            ...form,
            username: form.username.trim(),
            name: form.name.trim(),
            phone: form.phone.trim(),
            email: form.email.trim(),
            password: form.id ? undefined : form.password,
        });
    };

    return (
        <Dialog
            open={visible}
            title={title}
            width={width}
            mask
            centered
            showClose
            onClose={onClose}
            className={styles.userDialog}
            bodyClassName={styles.userDialogBody}
        >
            <div className={styles.panelIntro}>
                <div className={styles.panelIcon}><People size={28}/></div>
                <div>
                    <div className={styles.panelTitle}>{data?.id ? tx("更新账户资料") : tx("创建系统账户")}</div>
                    <div className={styles.panelDesc}>{tx("用户保存后会立即应用到系统访问与授权范围。")}</div>
                </div>
            </div>

            <div className={styles.formGrid}>
                <label className={styles.formField}>
                    <span>{tx("用户名")}</span>
                    <Input
                        value={form.username}
                        onChange={(value) => updateField("username", value)}
                        placeholder={tx("用于登录的用户名")}
                        prefix={<User size={16}/>}
                        controlClassName={styles.formInput}
                    />
                </label>
                <label className={styles.formField}>
                    <span>{tx("姓名")}</span>
                    <Input
                        value={form.name}
                        onChange={(value) => updateField("name", value)}
                        placeholder={tx("用于显示的姓名")}
                        prefix={<User size={16}/>}
                        controlClassName={styles.formInput}
                    />
                </label>
                <label className={styles.formField}>
                    <span>{tx("电话")}</span>
                    <Input
                        value={form.phone}
                        onChange={(value) => updateField("phone", value)}
                        placeholder={tx("请输入电话")}
                        prefix={<PhoneTelephone size={16}/>}
                        controlClassName={styles.formInput}
                    />
                </label>
                <label className={styles.formField}>
                    <span>{tx("邮箱")}</span>
                    <Input
                        value={form.email}
                        onChange={(value) => updateField("email", value)}
                        placeholder={tx("请输入邮箱")}
                        prefix={<Mail size={16}/>}
                        controlClassName={styles.formInput}
                    />
                </label>
                {!data?.id && <label className={styles.formField}>
                    <span>{tx("初始密码")}</span>
                    <Input
                        type="password"
                        autoComplete="new-password"
                        value={form.password}
                        onChange={(value) => updateField("password", value)}
                        placeholder={tx("至少8个字符，最多72字节")}
                        controlClassName={styles.formInput}
                    />
                </label>}
            </div>

            <section className={styles.roleSection}>
                <div className={styles.roleHeader}>
                    <Shield size={18}/>
                    <span>{tx("角色授权")}</span>
                </div>
                <div className={styles.roleList}>
                    {roleOptions.length === 0 ? (
                        <div className={styles.roleEmpty}>{tx("暂无可选角色")}</div>
                    ) : roleOptions.map((role) => {
                        const selected = selectedRoleSet.has(role.id);
                        return (
                            <button
                                key={role.id}
                                type="button"
                                className={`${styles.roleChip} ${selected ? styles.roleChipSelected : ""}`}
                                onClick={() => toggleRole(role.id)}
                            >
                                <span>{role.description || role.name}</span>
                                <small>{role.name}</small>
                            </button>
                        );
                    })}
                </div>
            </section>

            <div className={styles.panelFooter}>
                <Button type="default" className={styles.panelCancelButton} disabled={saving} onClick={onClose}>
                    {tx("取消")}
                </Button>
                <Button type="primary" className={styles.panelSubmitButton} disabled={saving} onClick={submit}>
                    {tx("提交")}
                </Button>
            </div>
        </Dialog>
    );
}
