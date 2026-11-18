/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import * as React from 'react';
import {useDataVisoolUITranslate} from '../context/DataVisoolUIContext';
import {cn} from '@/lib/utils';
import {BaseButton} from './Button';
import {IconAlertCircle, IconCheckCircle, IconInfo, IconLoader, IconX, IconXCircle} from './Icon';
import {buildStyle, DataVisoolStyleProps} from './style';

export type GlobalModalType = 'confirm' | 'info' | 'success' | 'error' | 'warning';
export type GlobalModalTone = 'info' | 'success' | 'warning' | 'danger';
export type GlobalModalPlacement = 'center' | 'top';

export interface GlobalModalConfig {
    key?: string;
    type?: GlobalModalType;
    title?: React.ReactNode;
    content?: React.ReactNode;
    description?: React.ReactNode;
    tone?: GlobalModalTone;
    icon?: React.ReactNode;
    okText?: React.ReactNode;
    cancelText?: React.ReactNode;
    okType?: 'default' | 'primary' | 'danger';
    width?: number | string;
    closable?: boolean;
    maskClosable?: boolean;
    keyboard?: boolean;
    showCancel?: boolean;
    footer?: React.ReactNode;
    onOk?: () => void | boolean | Promise<void | boolean>;
    onCancel?: () => void | boolean | Promise<void | boolean>;
    afterClose?: () => void;
}

interface GlobalModalItem extends Omit<GlobalModalConfig, 'key'> {
    id: string;
    type: GlobalModalType;
    createdAt: number;
}

type GlobalModalListener = (items: GlobalModalItem[]) => void;

class GModal {
    private items: GlobalModalItem[] = [];
    private listeners = new Set<GlobalModalListener>();

    public modalApi = {
        confirm: (config: GlobalModalConfig) => this.open({...config, type: 'confirm'}),
        info: (config: GlobalModalConfig) => this.open({...config, type: 'info', showCancel: false}),
        success: (config: GlobalModalConfig) => this.open({...config, type: 'success', showCancel: false}),
        error: (config: GlobalModalConfig) => this.open({...config, type: 'error', showCancel: false, okType: config.okType ?? 'danger'}),
        warning: (config: GlobalModalConfig) => this.open({...config, type: 'warning'}),
        destroy: (key?: string) => this.destroy(key),
    };

    public subscribe(listener: GlobalModalListener) {
        this.listeners.add(listener);
        listener([...this.items]);
        return () => {
            this.listeners.delete(listener);
        };
    }

    private emit() {
        this.listeners.forEach((listener) => listener([...this.items]));
    }

    public open(config: GlobalModalConfig) {
        const id = config.key ?? `${Date.now()}-${Math.random()}`;
        const type = config.type ?? 'confirm';
        const item: GlobalModalItem = {
            ...config,
            id,
            type,
            createdAt: Date.now(),
        };

        this.items = this.items.filter((current) => current.id !== id).concat(item);
        this.emit();
        return id;
    }

    public destroy(key?: string) {
        if (!key) {
            const removed = this.items;
            this.items = [];
            this.emit();
            removed.forEach((item) => item.afterClose?.());
            return;
        }

        const removed = this.items.find((item) => item.id === key);
        this.items = this.items.filter((item) => item.id !== key);
        this.emit();
        removed?.afterClose?.();
    }
}

export const globalModal = new GModal();

function modalTone(item: GlobalModalItem): GlobalModalTone {
    if (item.tone)
        return item.tone;
    if (item.type === 'success')
        return 'success';
    if (item.type === 'error')
        return 'danger';
    if (item.type === 'warning' || item.type === 'confirm')
        return 'warning';
    return 'info';
}

function modalIcon(item: GlobalModalItem) {
    if (item.icon)
        return item.icon;
    const tone = modalTone(item);
    if (tone === 'success') return <IconCheckCircle size={22}/>;
    if (item.type === 'error') return <IconXCircle size={22}/>;
    if (tone === 'warning' || tone === 'danger') return <IconAlertCircle size={22}/>;
    return <IconInfo size={22}/>;
}

function okVariant(okType?: GlobalModalConfig['okType']) {
    if (okType === 'danger')
        return 'destructive' as const;
    if (okType === 'default')
        return 'outline' as const;
    return 'default' as const;
}

export interface GlobalModalProps extends DataVisoolStyleProps {
    className?: string;
    modalClassName?: string;
    modalStyle?: React.CSSProperties;
    placement?: GlobalModalPlacement;
}

interface ModalCardProps {
    item: GlobalModalItem;
    isTopmost: boolean;
    modalClassName?: string;
    modalStyle?: React.CSSProperties;
}

function ModalCard({item, isTopmost, modalClassName, modalStyle}: ModalCardProps) {
    const t = useDataVisoolUITranslate();
    const titleId = React.useId();
    const descriptionId = React.useId();
    const [pending, setPending] = React.useState<'ok' | 'cancel' | null>(null);
    const closeButtonRef = React.useRef<HTMLButtonElement>(null);
    const showCancel = item.showCancel ?? (item.type === 'confirm' || item.type === 'warning');
    const closable = item.closable ?? true;
    const maskClosable = item.maskClosable ?? true;
    const keyboard = item.keyboard ?? true;
    const widthStyle = item.width ? {width: item.width} : undefined;
    const tone = modalTone(item);

    React.useEffect(() => {
        closeButtonRef.current?.focus();
    }, []);

    React.useEffect(() => {
        if (!keyboard || !isTopmost)
            return undefined;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape')
                handleCancel();
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    });

    const runAction = async (action: 'ok' | 'cancel') => {
        const handler = action === 'ok' ? item.onOk : item.onCancel;
        setPending(action);
        try {
            const result = await handler?.();
            if (result !== false)
                globalModal.destroy(item.id);
        } catch (error) {
            // Match Antd Modal semantics: rejected handlers keep the modal open.
            console.error(error);
        } finally {
            setPending(null);
        }
    };

    const handleCancel = () => {
        if (pending)
            return;
        void runAction('cancel');
    };

    const handleOk = () => {
        if (pending)
            return;
        void runAction('ok');
    };

    return (
        <div className="datavisool-global-modal-layer">
            <div className="datavisool-global-modal-mask" onClick={maskClosable ? handleCancel : undefined}/>
            <section
                className={cn('datavisool-global-modal-card', `datavisool-global-modal-${item.type}`, `datavisool-global-modal-tone-${tone}`, modalClassName)}
                style={{...widthStyle, ...modalStyle}}
                role="dialog"
                aria-modal="true"
                aria-labelledby={item.title ? titleId : undefined}
                aria-describedby={(item.description || item.content) ? descriptionId : undefined}
                data-type={item.type}
            >
                <span className="datavisool-global-modal-accent" aria-hidden="true"/>
                <header className="datavisool-global-modal-header">
                    <span className="datavisool-global-modal-icon" aria-hidden="true">{modalIcon(item)}</span>
                    <div className="datavisool-global-modal-heading">
                        {item.title ? <h2 id={titleId}>{item.title}</h2> : null}
                        {item.description ? <p>{item.description}</p> : null}
                    </div>
                    {closable ? (
                        <button
                            ref={closeButtonRef}
                            type="button"
                            className="datavisool-global-modal-close"
                            aria-label={t('关闭弹窗')}
                            title={t('关闭')}
                            disabled={Boolean(pending)}
                            onClick={handleCancel}
                        >
                            <IconX size={16}/>
                        </button>
                    ) : null}
                </header>
                {item.content ? (
                    <div id={descriptionId} className="datavisool-global-modal-body">
                        {item.content}
                    </div>
                ) : null}
                <footer className="datavisool-global-modal-footer">
                    {item.footer ?? (
                        <>
                            {showCancel ? (
                                <BaseButton type="button" variant="outline" disabled={Boolean(pending)} onClick={handleCancel}>
                                    {pending === 'cancel' ? <IconLoader className="datavisool-global-modal-spinner" size={14}/> : null}
                                    {item.cancelText ?? t('取消')}
                                </BaseButton>
                            ) : null}
                            <BaseButton type="button" variant={okVariant(item.okType)} disabled={Boolean(pending)} onClick={handleOk}>
                                {pending === 'ok' ? <IconLoader className="datavisool-global-modal-spinner" size={14}/> : null}
                                {item.okText ?? t('确定')}
                            </BaseButton>
                        </>
                    )}
                </footer>
            </section>
        </div>
    );
}

export function GlobalModal(props: GlobalModalProps) {
    const {className, modalClassName, modalStyle, placement = 'center', ...styleProps} = props;
    const [items, setItems] = React.useState<GlobalModalItem[]>([]);

    React.useEffect(() => globalModal.subscribe(setItems), []);

    if (items.length === 0)
        return null;

    return (
        <div className={cn('datavisool-global-modal', `datavisool-global-modal-placement-${placement}`, className)} style={buildStyle(styleProps)}>
            {items.map((item, index) => (
                <ModalCard
                    key={item.id}
                    item={item}
                    isTopmost={index === items.length - 1}
                    modalClassName={modalClassName}
                    modalStyle={modalStyle}
                />
            ))}
        </div>
    );
}
