/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {Avatar, Button, Card, Input, Menu, Select, Tag} from "@datavisool/ui";
import {KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState} from "react";
import {
    Check,
    Close,
    Edit,
    Help,
    Iphone,
    Mail,
    Message,
    Picture,
    Right,
    Setting as SettingIcon,
    Shield,
    User
} from "@icon-park/react";
import styles from "@/pages/home/setting/Setting.module.less";
import packageJson from "@/../package.json";
import AuthTools, {IUserInfo} from "@/util/AuthTools.ts";
import {globalMessage} from "@datavisool/ui";
import AuthFetchUtil from "@/util/AuthFetchUtil.ts";
import {openExternalUrl} from "@/util/TauriCompatUtil.ts";
import defaultBrand from "@/images/datavisool-brand.png";
import defaultLogo from "@/images/datavisool-logo.webp";
import {getLocale, LocaleCode, setLocale, tx} from "@/i18n/miniI18n.ts";
import {useLocaleVersion} from "@/i18n/useLocaleVersion.ts";
import {HybridCryptoUtil} from "@/util/HybridCryptoUtil.ts";
import settingsGearArt from "@/pages/home/setting/assets/settings-gear-art.webp";
import settingsHexBadge from "@/pages/home/setting/assets/settings-hex-badge.webp";
import accountWaveBg from "@/pages/home/setting/assets/account-wave-bg.webp";
import generalGlobeArt from "@/pages/home/setting/assets/general-globe-art.webp";
import aboutVersionBanner from "@/pages/home/setting/assets/about-version-banner.webp";

type AccountUserInfo = Partial<IUserInfo> & {
    phone?: string;
    email?: string;
    password?: string;
};

type AccountFieldKey = 'name' | 'phone' | 'email' | 'password';
type SettingSectionKey = 'account' | 'general' | 'brand' | 'about';

export default function Setting() {
    useLocaleVersion();
    const [activeKey, setActiveKey] = useState<SettingSectionKey>('account');
    const [userInfo, setUserInfo] = useState<AccountUserInfo | null>(AuthTools.getUserInfo());
    const [savingAccountField, setSavingAccountField] = useState<AccountFieldKey | null>(null);
    const accountSaveInFlight = useRef(false);
    const [mainLogo, setMainLogo] = useState<string>('/static/logo/main-logo.png');
    const [logo, setLogo] = useState<string>('/static/logo/logo.png');
    const locale = getLocale();

    const languageOptions = useMemo<Array<{ label: string; value: LocaleCode }>>(() => ([
        {label: tx('简体中文'), value: 'zh-CN'},
        {label: 'English', value: 'en-US'}
    ]), [locale]);

    const changeLocale = useCallback((nextLocale: LocaleCode) => {
        if (nextLocale === getLocale()) return;
        setLocale(nextLocale);
        globalMessage.success(tx('语言设置已更新'));
    }, []);

    const handleLocaleChange = useCallback((nextValue: string | number | Array<string | number>) => {
        if (Array.isArray(nextValue)) return;
        changeLocale(nextValue as LocaleCode);
    }, [changeLocale]);

    const syncAuthUserInfo = useCallback((nextUser: AccountUserInfo) => {
        const currentAuthInfo = AuthTools.getUserInfo();
        if (!currentAuthInfo) return;
        AuthTools.setUserInfo({
            ...currentAuthInfo,
            id: nextUser.id || currentAuthInfo.id,
            name: nextUser.name ?? currentAuthInfo.name,
            username: nextUser.username || currentAuthInfo.username,
            avatar: nextUser.avatar ?? currentAuthInfo.avatar,
            phone: nextUser.phone,
            email: nextUser.email,
        } as IUserInfo, true);
        window.dispatchEvent(new CustomEvent('datavisool-user-info-updated'));
    }, []);

    const loadAccountUserInfo = useCallback(async () => {
        const userId = AuthTools.getUserId();
        const authUserInfo = AuthTools.getUserInfo();
        if (!userId) {
            setUserInfo(authUserInfo);
            return;
        }
        try {
            const res = await AuthFetchUtil.get<AccountUserInfo>(`/api/user/getUser/${userId}`);
            if (res !== null) {
                setUserInfo({...authUserInfo, ...res});
            }
        } catch (e) {
            console.error('load account user info failed', e);
            setUserInfo(authUserInfo);
            globalMessage.error(tx('获取用户信息失败'));
        }
    }, []);

    const updateAccountField = useCallback(async (fieldKey: AccountFieldKey, value: string) => {
        if (accountSaveInFlight.current) return false;
        const nextValue = fieldKey === 'password' ? value : value.trim();
        if (fieldKey === 'name' && !nextValue) {
            globalMessage.warning(tx('请输入显示名称'));
            return false;
        }
        if (fieldKey === 'password' && !nextValue.trim()) {
            globalMessage.warning(tx('请输入密码'));
            return false;
        }
        if (fieldKey === 'password' && (Array.from(nextValue).length < 8 || new TextEncoder().encode(nextValue).length > 72)) {
            globalMessage.warning(tx('密码至少8个字符且不超过72字节'));
            return false;
        }
        if (fieldKey === 'email' && nextValue && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextValue)) {
            globalMessage.warning(tx('请输入正确的邮箱地址'));
            return false;
        }

        const nextUserInfo: AccountUserInfo = {
            ...userInfo,
            [fieldKey]: nextValue,
        };
        accountSaveInFlight.current = true;
        setSavingAccountField(fieldKey);
        try {
            const encoded = await HybridCryptoUtil.encryptRequest(JSON.stringify({id: userInfo?.id, [fieldKey]: nextValue}));
            const res = await AuthFetchUtil.post<boolean>("/api/user/update", encoded);
            if (res !== true) {
                if (res !== null) globalMessage.error(tx('保存失败'));
                return false;
            }
            const updatedUserInfo: AccountUserInfo = {...nextUserInfo};
            delete updatedUserInfo.password;
            setUserInfo(updatedUserInfo);
            syncAuthUserInfo(updatedUserInfo);
            globalMessage.success(tx('修改成功'));
            return true;
        } catch (e) {
            console.error('update account user info failed', e);
            globalMessage.error(tx('保存失败'));
            return false;
        } finally {
            accountSaveInFlight.current = false;
            setSavingAccountField(null);
        }
    }, [syncAuthUserInfo, userInfo]);

    const uploadMainLogo = useCallback((file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        AuthFetchUtil.post<boolean>('/api/config/updateMainLogo', formData, {headers: {'Content-Type': 'multipart/form-data'}}).then(res => {
            if (res === true) {
                setMainLogo(`/static/logo/main-logo.png?${Date.now()}`);
                window.dispatchEvent(new CustomEvent('datavisool-main-logo-updated'));
                globalMessage.success(tx('已保存'));
            } else if (res !== null) globalMessage.error(tx('保存失败'));
        }).catch(() => globalMessage.error(tx('保存失败')));
    }, []);

    const uploadLogoIcon = useCallback((file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        AuthFetchUtil.post<boolean>('/api/config/updateLogo', formData, {headers: {'Content-Type': 'multipart/form-data'}}).then(res => {
            if (res === true) {
                setLogo(`/static/logo/logo.png?${Date.now()}`);
                window.dispatchEvent(new CustomEvent('datavisool-logo-updated'));
                globalMessage.success(tx('已保存'));
            } else if (res !== null) globalMessage.error(tx('保存失败'));
        }).catch(() => globalMessage.error(tx('保存失败')));
    }, []);

    const chooseBrandImage = useCallback((onFile: (file: File) => void) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/png,image/jpeg,image/gif,image/bmp';
        input.onchange = () => {
            const file = input.files?.[0];
            if (file) onFile(file);
        };
        input.click();
    }, []);

    const menuItems = useMemo(() => ([
        {key: 'account', icon: <User size={20}/>, label: tx('账号')},
        {key: 'general', icon: <SettingIcon size={20}/>, label: tx('通用')},
        {key: 'brand', icon: <Picture size={20}/>, label: tx('品牌')},
        {key: 'about', icon: <Help size={20}/>, label: tx('关于')}
    ]), [locale]);

    useEffect(() => {
        void loadAccountUserInfo();
    }, [loadAccountUserInfo]);

    const section = useMemo(() => {
        if (activeKey === 'account') {
            const displayName = userInfo?.name || userInfo?.username || '-';
            const userId = userInfo?.id || '-';
            const accountRows: Array<{
                key: AccountFieldKey;
                label: string;
                value: string;
                placeholder: string;
                icon: JSX.Element;
                type?: string;
            }> = [
                {
                    key: 'name',
                    label: tx('显示名称'),
                    value: userInfo?.name || '',
                    placeholder: tx('请输入显示名称'),
                    icon: <User size={22}/>
                },
                {
                    key: 'phone',
                    label: tx('电话'),
                    value: userInfo?.phone || '',
                    placeholder: tx('请输入电话号码'),
                    icon: <Iphone size={22}/>
                },
                {
                    key: 'email',
                    label: tx('邮箱'),
                    value: userInfo?.email || '',
                    placeholder: tx('请输入邮箱地址'),
                    icon: <Mail size={22}/>
                }
            ];

            return {
                title: tx('账号'),
                subtitle: tx('当前登录账号信息'),
                content: (
                    <div className={styles.accountWrap}>
                        <div className={styles.accountCard}>
                            <div
                                className={styles.accountTop}
                                style={{backgroundImage: `url(${accountWaveBg})`}}
                            >
                                <div className={styles.accountLeft}>
                                    <Avatar
                                        size={72}
                                        className={styles.accountAvatar}
                                        src={userInfo?.avatar}
                                        alt="avatar"
                                    >
                                        {(displayName || 'U').slice(0, 1).toUpperCase()}
                                    </Avatar>
                                    <div className={styles.accountMeta}>
                                        <div className={styles.accountNameRow}>
                                            <span className={styles.accountName}>{displayName}</span>
                                            <Tag className={styles.accountIdTag} bordered={false}>ID {userId}</Tag>
                                        </div>
                                        <div className={styles.accountSub}>
                                            <span className={styles.accountStatusDot} aria-hidden={true}/>
                                            <span className={styles.accountStatusText}>{tx('已登录')}</span>
                                            <span>{tx('用户名')}：<span data-datavisool-i18n-skip="true">{userInfo?.username || '-'}</span></span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className={styles.accountSections}>
                                <section className={styles.accountSection}>
                                    <div className={styles.accountSectionTitle}>{tx('基本信息')}</div>
                                    <div className={styles.accountFieldGrid}>
                                        {accountRows.map((row) => (
                                            <AccountEditableField
                                                key={row.key}
                                                label={row.label}
                                                value={row.value}
                                                placeholder={row.placeholder}
                                                type={row.type}
                                                icon={row.icon}
                                                loading={savingAccountField === row.key}
                                                onSave={(value) => updateAccountField(row.key, value)}
                                            />
                                        ))}
                                    </div>
                                </section>
                                <section className={styles.accountSection}>
                                    <div className={styles.accountSectionTitle}>{tx('安全设置')}</div>
                                    <div className={styles.accountFieldGrid}>
                                        <AccountEditableField
                                            label={tx('密码')}
                                            value="******"
                                            displayValue="******"
                                            editValue=""
                                            placeholder={tx('请输入新密码')}
                                            type="password"
                                            icon={<Shield size={22}/>}
                                            wide
                                            loading={savingAccountField === 'password'}
                                            onSave={(value) => updateAccountField('password', value)}
                                        />
                                    </div>
                                </section>
                            </div>
                        </div>
                    </div>
                )
            };
        }

        if (activeKey === 'about') {
            // TODO: 后续实现完整的开源软件声明列表。
            const aboutLinks = [
                {
                    key: 'issue',
                    label: '报告问题',
                    desc: '提交您遇到的问题，帮助我们改进',
                    icon: <Message size={20}/>,
                    onClick: () => {
                        openExternalUrl('https://github.com/DaguPyz/DataVisool/issues').catch((e: unknown) => {
                            console.error('open issue page failed', e);
                            globalMessage.error(tx('无法打开链接，请检查应用权限或系统浏览器设置'));
                        });
                    }
                }
            ];

            return {
                title: '关于',
                subtitle: '版本信息、文档与声明',
                content: (
                    <div className={styles.aboutWrap}>
                        <div className={styles.aboutTopCard}>
                            <img className={styles.aboutVersionBanner} src={aboutVersionBanner} alt=""
                                 draggable={false}/>
                            <div className={styles.aboutTopRow}>
                                <div className={styles.aboutTopLeft}>
                                    <div className={styles.aboutTopMeta}>
                                        <div className={styles.aboutVersionRow}>
                                            <span className={styles.aboutTopVersion}>版本：{packageJson.version}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className={styles.aboutListCard}>
                            {aboutLinks.map((item) => (
                                <button
                                    key={item.key}
                                    className={styles.aboutRow}
                                    type="button"
                                    onClick={item.onClick}
                                >
                                    <span className={styles.aboutRowMain}>
                                        <span className={styles.aboutRowIconWrap} aria-hidden={true}>{item.icon}</span>
                                        <span className={styles.aboutRowText}>
                                            <span className={styles.aboutRowLabel}>{item.label}</span>
                                            <span className={styles.aboutRowDesc}>{item.desc}</span>
                                        </span>
                                    </span>
                                    <span className={styles.aboutRowIcon} aria-hidden={true}>
                                        <Right size={12}/>
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                )
            };
        }

        if (activeKey === 'brand') {
            return {
                title: tx('品牌'),
                subtitle: tx('设置系统主界面与登录页展示的品牌图片。'),
                content: (
                    <div className={styles.generalWrap}>
                        <div className={`${styles.generalBlock} ${styles.brandBlock}`}>
                            <div className={styles.brandHeader}>
                                <div className={styles.generalIcon} aria-hidden={true}>
                                    <SettingIcon size={34}/>
                                </div>
                                <div className={styles.generalMeta}>
                                    <div className={styles.generalTitle}>{tx('品牌设置')}</div>
                                    <div
                                        className={styles.generalDesc}>{tx('支持 PNG、JPEG、GIF 或 BMP 图片。')}</div>
                                </div>
                            </div>
                            <div className={styles.brandGrid}>
                                <button
                                    type="button"
                                    className={`${styles.brandUploadCard} ${styles.mainLogoCard}`}
                                    onClick={() => chooseBrandImage(uploadMainLogo)}
                                >
                                    <span className={styles.brandUploadTitle}>{tx('品牌主图')}</span>
                                    <span className={styles.brandUploadDesc}>{tx('建议尺寸 320x120px')}</span>
                                    <span className={styles.brandImageBox}>
                                        <img src={mainLogo} onError={() => setMainLogo(defaultBrand)}
                                             alt={tx('品牌主图')}/>
                                    </span>
                                    <span className={styles.brandUploadAction}>{tx('点击上传')}</span>
                                </button>
                                <button
                                    type="button"
                                    className={`${styles.brandUploadCard} ${styles.logoCard}`}
                                    onClick={() => chooseBrandImage(uploadLogoIcon)}
                                >
                                    <span className={styles.brandUploadTitle}>{tx('品牌LOGO')}</span>
                                    <span className={styles.brandUploadDesc}>{tx('建议尺寸 80x80px')}</span>
                                    <span className={styles.brandImageBox}>
                                        <img src={logo} onError={() => setLogo(defaultLogo)} alt={tx('品牌LOGO')}/>
                                    </span>
                                    <span className={styles.brandUploadAction}>{tx('点击上传')}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )
            };
        }

        return {
            title: tx('通用'),
            subtitle: tx('外观、性能、缓存与基础偏好'),
            content: (
                <div className={styles.generalWrap}>
                    <div className={`${styles.generalBlock} ${styles.languageBlock}`}>
                        <img className={styles.languageArtwork} src={generalGlobeArt} alt="" draggable={false}/>
                        <div className={styles.languageRow}>
                            <div className={styles.generalIcon} aria-hidden={true}>
                                <span>A文</span>
                            </div>
                            <div className={styles.generalMeta}>
                                <div className={styles.generalTitle}>{tx('界面语言')}</div>
                                <div className={styles.generalDesc}>{tx('切换应用界面的显示语言。')}</div>
                            </div>
                            <div className={styles.languageControl}>
                                <Select
                                    value={locale}
                                    options={languageOptions}
                                    className={styles.languageSelect}
                                    onChange={handleLocaleChange}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )
        };
    }, [
        activeKey,
        chooseBrandImage,
        handleLocaleChange,
        languageOptions,
        mainLogo,
        logo,
        updateAccountField,
        locale,
        uploadLogoIcon,
        uploadMainLogo,
        userInfo
    ]);

    return (
        <div className={styles.page}>
            <div className={styles.hero}>
                <img className={styles.heroBadge} src={settingsHexBadge} alt="" draggable={false}/>
                <div className={styles.heroText}>
                    <div className={styles.heroTitle}>设置</div>
                    <div className={styles.heroSubtitle}>个性化你的本地体验与偏好配置</div>
                </div>
            </div>

            <div className={styles.main}>
                <Card className={styles.navCard} bordered={false}>
                    <Menu
                        mode="inline"
                        items={menuItems}
                        selectedKeys={[activeKey]}
                        onClick={(info) => setActiveKey(info.key as SettingSectionKey)}
                    />
                    <div className={styles.navArtwork} aria-hidden={true}>
                        <img src={settingsGearArt} alt="" draggable={false}/>
                    </div>
                </Card>

                <Card className={styles.contentCard} bordered={false}>
                    <div className={styles.sectionHead}>
                        <div className={styles.sectionTitle}>{section.title}</div>
                        <div className={styles.sectionSubtitle}>{section.subtitle}</div>
                    </div>
                    <div className={styles.sectionBody}>
                        {section.content}
                    </div>
                </Card>
            </div>
        </div>
    )
}

interface AccountEditableFieldProps {
    label: string;
    value: string;
    displayValue?: string;
    editValue?: string;
    placeholder?: string;
    type?: string;
    icon: JSX.Element;
    wide?: boolean;
    loading?: boolean;
    onSave: (value: string) => Promise<boolean>;
}

function AccountEditableField(props: AccountEditableFieldProps) {
    const {label, value, displayValue, editValue, placeholder, type, icon, wide, loading, onSave} = props;
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(editValue ?? value);
    const shownValue = displayValue ?? value;

    const beginEdit = () => {
        setDraft(editValue ?? value);
        setEditing(true);
    };

    const cancelEdit = () => {
        setDraft(editValue ?? value);
        setEditing(false);
    };

    const save = async () => {
        if (loading) return;
        const saved = await onSave(draft);
        if (saved) {
            setEditing(false);
        }
    };

    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Escape' && !loading) {
            cancelEdit();
        }
    };

    return (
        <div className={`${styles.accountFieldCard} ${wide ? styles.accountFieldCardWide : ''}`}
             data-editing={editing ? 'true' : undefined}>
            <div className={styles.accountFieldHeader}>
                <span className={styles.accountFieldIcon} aria-hidden={true}>{icon}</span>
                <span className={styles.accountFieldLabel}>{label}</span>
                {!editing ? (
                    <button
                        className={styles.accountFieldEditButton}
                        type="button"
                        onClick={beginEdit}
                        aria-label={`${tx('编辑')}${label}`}
                    >
                        <Edit size={18}/>
                    </button>
                ) : null}
            </div>
            {!editing ? (
                <div className={`${styles.accountFieldValue} ${shownValue ? '' : styles.accountFieldPlaceholder}`}>
                    {shownValue || '-'}
                </div>
            ) : (
                <div className={styles.accountFieldEditor}>
                    <Input
                        value={draft}
                        onChange={setDraft}
                        placeholder={placeholder}
                        type={type}
                        autoFocus
                        onPressEnter={() => void save()}
                        onKeyDown={onKeyDown}
                        controlClassName={styles.accountFieldInput}
                    />
                    <div className={styles.accountFieldActions}>
                        <Button
                            type="primary"
                            className={styles.accountSaveButton}
                            loading={loading}
                            icon={<Check size={14}/>}
                            onClick={() => void save()}
                        >
                            {tx('保存')}
                        </Button>
                        <Button
                            type="default"
                            className={styles.accountCancelButton}
                            disabled={loading}
                            icon={<Close size={14}/>}
                            onClick={cancelEdit}
                        >
                            {tx('取消')}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
