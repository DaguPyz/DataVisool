/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {useCallback, useEffect, useRef, useState} from "react";
import {Button, Dialog} from "@datavisool/ui";
import packageJson from "@/../package.json";
import ContactAuthorModal from "@/comps/common-component/contact-author/ContactAuthorModal.tsx";
import defaultSupportQrCode from "@/images/support-qr-code.webp";
import FetchUtil from "@/util/FetchUtil.ts";
import type {BeginWorkbenchRequest, WorkbenchRequest} from "./useWorkbenchRequests.ts";
import styles from "./WebUpdateNotice.module.less";

interface WebUpdateCheckResult {
    needUpgrade: boolean;
    latestVersion?: string;
    supportQrCodeUrl?: string;
    available?: boolean;
}

const CURRENT_VERSION = packageJson.version;

interface WebUpdateNoticeProps {
    readonly token?: string;
    readonly beginRequest: BeginWorkbenchRequest;
    readonly onSessionExpiry: (token: string) => void;
}

export default function WebUpdateNotice({token, beginRequest, onSessionExpiry}: WebUpdateNoticeProps) {
    const [update, setUpdate] = useState<WebUpdateCheckResult | null>(null);
    const [contactOpen, setContactOpen] = useState(false);
    const [skipping, setSkipping] = useState(false);
    const skipRequest = useRef<WorkbenchRequest>();
    const latestVersion = update?.latestVersion?.trim() || "—";

    const requestOptions = useCallback((request: WorkbenchRequest, currentToken: string) => ({
        headers: {Authorization: `Bearer ${currentToken}`},
        signal: request.signal,
        onSessionExpiry: () => {
            if (!request.signal.aborted) onSessionExpiry(currentToken);
        },
    }), [onSessionExpiry]);

    useEffect(() => {
        setUpdate(null);
        setContactOpen(false);
        setSkipping(false);
        if (!token) return;
        const request = beginRequest();
        if (!request) return;

        const query = new URLSearchParams({currentVersion: CURRENT_VERSION});
        void FetchUtil.get<WebUpdateCheckResult | null>(`/api/webUpdate/check?${query}`, {
            ...requestOptions(request, token), suppressErrorMessage: true,
        }).then(result => {
            if (!request.signal.aborted && result?.needUpgrade === true && result.latestVersion && result.available !== false) {
                setUpdate(result);
            }
        }).catch(() => { /* Automatic checks are silent when the update service is unavailable. */ }).finally(request.finish);

        return () => {
            request.abort();
            const skippingRequest = skipRequest.current;
            skipRequest.current = undefined;
            skippingRequest?.abort();
        };
    }, [token, beginRequest, requestOptions]);

    const skipVersion = async () => {
        if (!token || !update?.latestVersion || skipRequest.current) return;
        const request = beginRequest();
        if (!request) return;
        skipRequest.current = request;
        setSkipping(true);
        try {
            const saved = await FetchUtil.post<boolean>("/api/webUpdate/skip", {
                latestVersion: update.latestVersion,
            }, requestOptions(request, token));
            if (!request.signal.aborted && saved) {
                setUpdate(null);
            }
        } finally {
            request.finish();
            if (skipRequest.current === request) {
                skipRequest.current = undefined;
                setSkipping(false);
            }
        }
    };

    return (
        <>
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
        </>
    );
}
