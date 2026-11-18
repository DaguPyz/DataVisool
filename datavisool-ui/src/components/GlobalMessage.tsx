/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import * as React from 'react';
import {useDataVisoolUITranslate} from '../context/DataVisoolUIContext';
import {cn} from '@/lib/utils';
import {IconAlertCircle, IconCheckCircle, IconInfo, IconLoader, IconX, IconXCircle} from './Icon';
import {buildStyle, DataVisoolStyleProps} from './style';

export type GlobalMessageType = 'open' | 'loading' | 'success' | 'info' | 'warning' | 'error';
export type GlobalMessagePlacement = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' | 'top' | 'bottom';

export interface GlobalMessageConfig {
    key?: string;
    type?: GlobalMessageType;
    content?: React.ReactNode;
    message?: React.ReactNode;
    description?: React.ReactNode;
    duration?: number;
    closable?: boolean;
    icon?: React.ReactNode;
    action?: React.ReactNode;
    onClose?: () => void;
}

interface GlobalMessageItem extends Omit<GlobalMessageConfig, 'key' | 'message'> {
    id: string;
    type: GlobalMessageType;
    content?: React.ReactNode;
    createdAt: number;
}

type GlobalMessageListener = (items: GlobalMessageItem[]) => void;

class GMessage {
    private items: GlobalMessageItem[] = [];
    private listeners = new Set<GlobalMessageListener>();
    private timers = new Map<string, ReturnType<typeof setTimeout>>();

    public messageApi = {
        open: (config: GlobalMessageConfig) => this.open(config),
        destroy: (key?: string) => this.destroy(key),
        success: (content: React.ReactNode, duration?: number) => {
            this.success(content, undefined, duration);
            return Promise.resolve();
        },
        error: (content: React.ReactNode, duration?: number) => {
            this.error(content, undefined, duration);
            return Promise.resolve();
        },
        info: (content: React.ReactNode, duration?: number) => {
            this.info(content, undefined, duration);
            return Promise.resolve();
        },
        warning: (content: React.ReactNode, duration?: number) => {
            this.warning(content, undefined, duration);
            return Promise.resolve();
        },
    };

    public subscribe(listener: GlobalMessageListener) {
        this.listeners.add(listener);
        listener([...this.items]);
        return () => {
            this.listeners.delete(listener);
        };
    }

    private emit() {
        this.listeners.forEach((listener) => listener([...this.items]));
    }

    private clearTimer(id: string) {
        const timer = this.timers.get(id);
        if (timer)
            window.clearTimeout(timer);
        this.timers.delete(id);
    }

    private resolveDuration(type: GlobalMessageType, duration?: number) {
        if (duration !== undefined)
            return duration;
        return type === 'loading' ? 0 : 3500;
    }

    public open(options: GlobalMessageConfig) {
        const id = options.key ?? `${Date.now()}-${Math.random()}`;
        const type = options.type ?? 'open';
        const content = options.content ?? options.message;
        const nextItem: GlobalMessageItem = {
            ...options,
            id,
            type,
            content,
            createdAt: Date.now(),
        };

        this.clearTimer(id);
        this.items = this.items.filter((item) => item.id !== id).concat(nextItem);
        this.emit();

        const duration = this.resolveDuration(type, options.duration);
        if (duration > 0) {
            const timer = setTimeout(() => this.destroy(id), duration);
            this.timers.set(id, timer);
        }

        return id;
    }

    public openLoading(options: {key: string; content: string}) {
        return this.open({key: options.key, type: 'loading', content: options.content, duration: 0, closable: false});
    }

    public destroy(key?: string) {
        if (!key) {
            this.items.forEach((item) => item.onClose?.());
            this.timers.forEach((timer) => window.clearTimeout(timer));
            this.timers.clear();
            this.items = [];
            this.emit();
            return;
        }

        const removed = this.items.find((item) => item.id === key);
        this.clearTimer(key);
        this.items = this.items.filter((item) => item.id !== key);
        removed?.onClose?.();
        this.emit();
    }

    public success(content: React.ReactNode, key?: string, duration?: number) { return this.open({type: 'success', content, key, duration}); }
    public error(content: React.ReactNode, key?: string, duration?: number) { return this.open({type: 'error', content, key, duration}); }
    public info(content: React.ReactNode, key?: string, duration?: number) { return this.open({type: 'info', content, key, duration}); }
    public warning(content: React.ReactNode, key?: string, duration?: number) { return this.open({type: 'warning', content, key, duration}); }
}

export const globalMessage = new GMessage();

function messageIcon(item: GlobalMessageItem) {
    if (item.icon)
        return item.icon;
    if (item.type === 'success') return <IconCheckCircle size={18}/>;
    if (item.type === 'error') return <IconXCircle size={18}/>;
    if (item.type === 'warning') return <IconAlertCircle size={18}/>;
    if (item.type === 'loading') return <IconLoader className="datavisool-global-message-spinner" size={18}/>;
    return <IconInfo size={18}/>;
}

function messageRole(type: GlobalMessageType) {
    return type === 'error' || type === 'warning' ? 'alert' : 'status';
}

export interface GlobalMessageProps extends DataVisoolStyleProps {
    className?: string;
    itemClassName?: string;
    itemStyle?: React.CSSProperties;
    placement?: GlobalMessagePlacement;
    maxCount?: number;
    closable?: boolean;
    showProgress?: boolean;
}

export function GlobalMessage(props: GlobalMessageProps) {
    const t = useDataVisoolUITranslate();
    const {
        className,
        itemClassName,
        itemStyle,
        placement = 'bottomRight',
        maxCount = 6,
        closable = true,
        showProgress = true,
        ...styleProps
    } = props;
    const [items, setItems] = React.useState<GlobalMessageItem[]>([]);
    const visibleItems = maxCount > 0 ? items.slice(-maxCount) : items;

    React.useEffect(() => globalMessage.subscribe(setItems), []);

    return (
        <div
            className={cn('datavisool-global-message', `datavisool-global-message-${placement}`, className)}
            style={buildStyle(styleProps)}
            aria-live="polite"
        >
            {visibleItems.map((item) => {
                const duration = item.duration ?? (item.type === 'loading' ? 0 : 3500);
                const itemClosable = item.closable ?? closable;
                const progressStyle = {'--datavisool-message-duration': `${duration}ms`} as React.CSSProperties;

                return (
                    <div
                        key={item.id}
                        className={cn('datavisool-global-message-item', `datavisool-global-message-${item.type}`, itemClassName)}
                        style={{...progressStyle, ...itemStyle}}
                        role={messageRole(item.type)}
                        data-type={item.type}
                    >
                        <span className="datavisool-global-message-accent" aria-hidden="true"/>
                        <span className="datavisool-global-message-icon" aria-hidden="true">{messageIcon(item)}</span>
                        <span className="datavisool-global-message-body">
                            {item.content ? <span className="datavisool-global-message-content">{item.content}</span> : null}
                            {item.description ? <span className="datavisool-global-message-description">{item.description}</span> : null}
                        </span>
                        {item.action ? <span className="datavisool-global-message-action">{item.action}</span> : null}
                        {itemClosable ? (
                            <button
                                type="button"
                                className="datavisool-global-message-close"
                                aria-label={t('关闭消息')}
                                title={t('关闭')}
                                onClick={() => globalMessage.destroy(item.id)}
                            >
                                <IconX size={14}/>
                            </button>
                        ) : null}
                        {showProgress && duration > 0 ? <span className="datavisool-global-message-progress" aria-hidden="true"/> : null}
                    </div>
                );
            })}
        </div>
    );
}
