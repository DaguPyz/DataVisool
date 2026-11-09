/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {ReactNode, useCallback, useEffect, useMemo, useRef, useState} from "react";
import {Button, Dialog, globalMessage} from "@datavisool/ui";
import packageJson from "@/../package.json";
import AuthTools, {RoleType} from "@/util/AuthTools.ts";
import AuthFetchUtil from "@/util/AuthFetchUtil.ts";
import ContactAuthorModal from "@/comps/common-component/contact-author/ContactAuthorModal.tsx";
import defaultSupportQrCode from "@/pages/home/more-info/author.webp";
import styles from "@/pages/home/web-update/WebUpdateNotice.module.less";
import {WebUpdateContext} from "@/pages/home/web-update/WebUpdateContext.ts";
import {tx} from "@/i18n/miniI18n.ts";

interface WebUpdateCheckResult {
    needUpgrade: boolean;
    latestVersion?: string;
    supportQrCodeUrl?: string;
    available?: boolean;
}

const CURRENT_VERSION = packageJson.version;

export default function WebUpdateNotice({children}: {children?: ReactNode}) {
    const [update, setUpdate] = useState<WebUpdateCheckResult | null>(null);
    const [contactOpen, setContactOpen] = useState(false);
    const [skipping, setSkipping] = useState(false);
    const [checking, setChecking] = useState(false);
    const requestRef = useRef<AbortController | null>(null);
    const canCheckForUpdates = AuthTools.getUserInfo()?.roles?.includes(RoleType.SYSTEM_ADMIN) ?? false;
    const latestVersion = update?.latestVersion?.trim() || "—";

    const checkForUpdate = useCallback(async (manual: boolean) => {
        if (!canCheckForUpdates || (requestRef.current && !requestRef.current.signal.aborted)) {
            return;
        }

        const abortController = new AbortController();
        requestRef.current = abortController;
        setChecking(true);
        try {
            const query = new URLSearchParams({currentVersion: CURRENT_VERSION});
            if (manual) {
                query.set("includeSkipped", "true");
            }
            const result = await AuthFetchUtil.get<WebUpdateCheckResult>(
                `/api/webUpdate/check?${query.toString()}`,
                {signal: abortController.signal, suppressErrorMessage: true},
            );
            if (abortController.signal.aborted) {
                return;
            }
            if (result?.available === false) {
                if (manual) globalMessage.warning(tx("暂未提供更新服务"));
            } else if (result?.latestVersion && typeof result.needUpgrade === "boolean") {
                if (result.needUpgrade) {
                    setUpdate(result);
                } else if (manual) {
                    setUpdate(null);
                    globalMessage.success(tx("已是最新版本"));
                }
            } else if (manual) {
                globalMessage.error(tx("检查更新失败"));
            }
        } catch {
            if (manual && !abortController.signal.aborted) {
                globalMessage.error(tx("检查更新失败"));
            }
        } finally {
            if (requestRef.current === abortController) {
                requestRef.current = null;
                if (!abortController.signal.aborted) {
                    setChecking(false);
                }
            }
        }
    }, [canCheckForUpdates]);

    const checkForUpdates = useCallback(() => checkForUpdate(true), [checkForUpdate]);
    const contextValue = useMemo(() => ({checking, canCheckForUpdates, checkForUpdates}),
        [checking, canCheckForUpdates, checkForUpdates]);

    useEffect(() => {
        void checkForUpdate(false);
        return () => {
            requestRef.current?.abort();
            requestRef.current = null;
        };
    }, [checkForUpdate]);

    const skipVersion = async () => {
        if (!update?.latestVersion) {
            return;
        }
        setSkipping(true);
        try {
            const saved = await AuthFetchUtil.post<boolean>("/api/webUpdate/skip", {
                latestVersion: update.latestVersion,
            });
            if (saved) {
                setUpdate(null);
            }
        } finally {
            setSkipping(false);
        }
    };

    return (
        <WebUpdateContext.Provider value={contextValue}>
            {children}
            <Dialog
                open={Boolean(update)}
                title={null}
                hideHeader={true}
                width={440}
                centered={true}
                mask={true}
                maskClosable={false}
                showClose={false}
                zIndex={2000}
                className={styles.dialog}
            >
                <section className={styles.notice}>
                    <div className={styles.heading}>
                        <div className={styles.updateMark} aria-hidden={true}>↑</div>
                        <div className={styles.headingText}>
                            <span>VERSION UPDATE</span>
                            <h2>发现新版本</h2>
                        </div>
                        <span className={styles.releaseBadge}>NEW</span>
                    </div>
                    <p className={styles.message}>DataVisool 已经发布最新版本，请联系售后人员进行升级。</p>
                    <div className={styles.versionInfo}>
                        <div>
                            <span>当前版本</span>
                            <strong>{CURRENT_VERSION}</strong>
                        </div>
                        <i aria-hidden={true}>→</i>
                        <div className={styles.latestVersion}>
                            <span>最新版本</span>
                            <strong>{latestVersion}</strong>
                        </div>
                    </div>
                    <div className={styles.actions}>
                        <Button className={styles.skipButton} type="text" loading={skipping} onClick={() => void skipVersion()}>跳过该版本</Button>
                        <Button className={styles.contactButton} type="primary" onClick={() => setContactOpen(true)}>联系售后人员</Button>
                    </div>
                </section>
            </Dialog>
            <ContactAuthorModal
                open={contactOpen}
                onClose={() => setContactOpen(false)}
                qrImgSrc={update?.supportQrCodeUrl || defaultSupportQrCode}
                title="联系售后人员"
                hint="微信扫码联系售后进行升级"
                zIndex={2100}
            />
        </WebUpdateContext.Provider>
    );
}
