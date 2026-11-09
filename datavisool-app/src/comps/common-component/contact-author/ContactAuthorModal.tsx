/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {Dialog} from "@datavisool/ui";
import {Close} from "@icon-park/react";
import {useCallback, useEffect, useId, useRef} from "react";
import CircuitBackground from "@/comps/common-component/circuit-background/CircuitBackground";
import {tx} from "@/i18n/miniI18n.ts";
import {useLocaleVersion} from "@/i18n/useLocaleVersion.ts";
import styles from "./ContactAuthorModal.module.less";

type Props = {
    open: boolean;
    onClose: () => void;
    qrImgSrc: string;
    title?: string;
    hint?: string;
    zIndex?: number;
};

export default function ContactAuthorModal({ open, onClose, qrImgSrc, title, hint, zIndex }: Props) {
    useLocaleVersion();
    const titleId = useId();
    const hintId = useId();
    const dialogRef = useRef<HTMLElement | null>(null);
    const returnFocusRef = useRef<HTMLElement | null>(null);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    const attachPanel = useCallback((panel: HTMLDivElement | null) => {
        if (!panel) {
            dialogRef.current = null;
            return;
        }
        const dialog = panel.closest<HTMLElement>('[role="dialog"]');
        if (!dialog) return;
        if (!returnFocusRef.current && document.activeElement instanceof HTMLElement)
            returnFocusRef.current = document.activeElement;
        dialog.setAttribute('aria-labelledby', titleId);
        dialog.setAttribute('aria-describedby', hintId);
        dialogRef.current = dialog;
        panel.querySelector<HTMLButtonElement>('[data-contact-close]')?.focus();
    }, [titleId, hintId]);

    useEffect(() => {
        if (!open) return;
        if (!returnFocusRef.current && document.activeElement instanceof HTMLElement)
            returnFocusRef.current = document.activeElement;

        const onKeyDown = (event: KeyboardEvent) => {
            const dialog = dialogRef.current;
            if (!dialog) return;
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                onCloseRef.current();
                return;
            }
            if (event.key !== 'Tab') return;
            const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
                'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
            )).filter(element => element.getClientRects().length > 0);
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (!first || !last) return;
            if (!dialog.contains(document.activeElement) || (event.shiftKey && document.activeElement === first)) {
                event.preventDefault();
                (event.shiftKey ? last : first).focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', onKeyDown, true);
        return () => {
            document.removeEventListener('keydown', onKeyDown, true);
            const opener = returnFocusRef.current;
            returnFocusRef.current = null;
            if (opener?.isConnected) opener.focus();
        };
    }, [open]);

    return (
        <Dialog
            open={open}
            title={null}
            hideHeader
            showClose={false}
            centered={true}
            width="min(520px, calc(100vw - 32px))"
            onClose={onClose}
            mask
            className={styles.wechatModal}
            zIndex={zIndex}
        >
            <div ref={attachPanel} className={styles.wechatPanel}>
                <CircuitBackground className={styles.wechatBgCanvas} />
                <div className={styles.wechatPanelHeader}>
                    <div id={titleId} className={styles.wechatPanelTitle}>{title ?? '微信扫码添加'}</div>
                    <div id={hintId} className={styles.wechatPanelHint}>{hint ?? '技术支持 / 交流反馈'}</div>
                </div>
                <button type="button" data-contact-close className={styles.wechatClose}
                        aria-label={tx('关闭')} onClick={onClose}>
                    <Close size={18} aria-hidden="true"/>
                </button>
                <div className={styles.wechatQrWrap}>
                    <div className={styles.wechatQr}>
                        <img draggable={false} src={qrImgSrc} alt="联系作者" className={styles.wechatQrImg} />
                    </div>
                </div>
            </div>
        </Dialog>
    );
}
