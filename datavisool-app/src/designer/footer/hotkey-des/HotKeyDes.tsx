/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {useCallback, useEffect, useState} from 'react';
import {observer} from 'mobx-react';
import {Dialog} from '@datavisool/ui';
import './HotKeyDes.less';
import {ShortcutRecorder} from './ShortcutRecorder.tsx';
import shortcutStore from '@/designer/operate-provider/hot-key/ShortcutStore.ts';
import {
    isKeyboardShortcutDefinition,
    resolveDefaultBinding,
    shortcutDefinitions,
} from '@/designer/operate-provider/hot-key/ShortcutRegistry.ts';
import {
    getShortcutDisplayParts,
    getShortcutPlatform,
} from '@/designer/operate-provider/hot-key/HotKeyPlatform.ts';
import type {
    ShortcutActionId,
    ShortcutBinding,
    ShortcutBindingUpdateResult,
} from '@/designer/operate-provider/hot-key/ShortcutTypes.ts';

export interface HotKeyDesProps {
    onClose: () => void;
}

const renderShortcut = (parts: readonly string[]) => (
    <span className="hotkey-shortcut">
        {parts.map((key, index) => (
            <span className="hotkey-key-fragment" key={`${key}-${index}`}>
                <kbd>{key}</kbd>
                {index < parts.length - 1 && <span className="hotkey-plus">+</span>}
            </span>
        ))}
    </span>
);

const formatUpdateError = (result: Exclude<ShortcutBindingUpdateResult, {ok: true}>): string => {
    if (result.reason === 'invalid')
        return result.message;
    return `与“${result.conflicts.map((item) => item.label).join('”、“')}”冲突`;
};

export const HotKeyDes = observer(({onClose}: HotKeyDesProps) => {
    const platform = getShortcutPlatform();
    const platformName = platform === 'mac' ? 'macOS' : 'Windows';
    const [editingActionId, setEditingActionId] = useState<ShortcutActionId | null>(null);
    const [query, setQuery] = useState('');
    const [notice, setNotice] = useState<string | null>(null);
    const [confirmResetAll, setConfirmResetAll] = useState(false);
    const definitions = shortcutDefinitions.filter((definition) => definition.visible !== false);
    const editingDefinition = editingActionId
        ? definitions.find((definition) => definition.id === editingActionId)
        : null;

    const finishCapture = useCallback(() => {
        shortcutStore.endCapture();
        setEditingActionId(null);
    }, []);

    useEffect(() => () => shortcutStore.endCapture(), []);

    const close = () => {
        finishCapture();
        onClose();
    };

    const reportResult = (result: ShortcutBindingUpdateResult, successMessage: string): boolean => {
        if (result.ok) {
            setNotice(successMessage);
            return true;
        }
        setNotice(formatUpdateError(result));
        return false;
    };

    const startCapture = (actionId: ShortcutActionId) => {
        setNotice(null);
        finishCapture();
        if (!shortcutStore.beginCapture(actionId)) {
            setNotice('快捷键配置尚未就绪，请稍后重试');
            return;
        }
        setEditingActionId(actionId);
    };

    const submitCapture = useCallback((binding: ShortcutBinding): ShortcutBindingUpdateResult => {
        if (!editingActionId)
            return {ok: false, reason: 'invalid', message: '当前没有正在修改的快捷键'};
        const result = shortcutStore.setBinding(editingActionId, binding);
        if (result.ok) {
            setNotice('快捷键已更新');
            finishCapture();
        }
        return result;
    }, [editingActionId, finishCapture]);

    const disableBinding = (actionId: ShortcutActionId) => {
        finishCapture();
        reportResult(shortcutStore.setBinding(actionId, null), '快捷键已禁用');
    };

    const resetBinding = (actionId: ShortcutActionId) => {
        finishCapture();
        reportResult(shortcutStore.resetBinding(actionId), '已恢复默认快捷键');
    };

    const resetAllBindings = () => {
        finishCapture();
        if (reportResult(shortcutStore.resetAll(), '全部快捷键已恢复默认'))
            setConfirmResetAll(false);
    };

    const normalizedQuery = query.trim().toLocaleLowerCase();
    const filteredDefinitions = normalizedQuery
        ? definitions.filter((definition) => {
            const binding = isKeyboardShortcutDefinition(definition)
                ? shortcutStore.getBinding(definition.id)
                : null;
            const display = definition.kind === 'guide'
                ? definition.display[platform]
                : binding ? getShortcutDisplayParts(binding, platform) : ['已禁用'];
            return `${definition.label} ${display.join(' ')}`.toLocaleLowerCase().includes(normalizedQuery);
        })
        : definitions;

    const editingReady = shortcutStore.loadState === 'ready';
    const saveText = {
        idle: '配置已就绪',
        pending: '等待保存',
        saving: '正在保存',
        saved: '已保存',
        error: '保存失败',
    }[shortcutStore.saveState];

    return (
        <Dialog
            title={<div className="hotkey-title">
                <span className="hotkey-title-main">快捷键设置</span>
                <span className="hotkey-title-sub">修改仅保存在当前用户的本机配置中</span>
            </div>}
            open
            width={980}
            onClose={close}
            centered
            mask
            showClose
            className="hotkey-modal"
        >
            <div className="datavisool-hotkey-des">
                <div className="hotkey-overview">
                    <p className="hotkey-description">
                        当前展示 <span className="hotkey-platform">{platformName}</span> 生效配置，修改后立即生效并自动保存。
                    </p>
                    <span className="hotkey-count">{definitions.length} 项操作</span>
                </div>

                <div className="hotkey-toolbar">
                    <label className="hotkey-search">
                        <span>搜索</span>
                        <input
                            type="search"
                            aria-label="搜索快捷键"
                            spellCheck={false}
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="输入功能或按键"
                        />
                    </label>
                    <div className={`hotkey-save-state hotkey-save-state--${shortcutStore.saveState}`}
                         data-loading={shortcutStore.loadState === 'loading' || shortcutStore.saveState === 'saving' || undefined}
                         role="status" aria-live="polite">
                        <span>{shortcutStore.loadState === 'loading' ? '正在读取配置' : saveText}</span>
                        {shortcutStore.saveState === 'error' && (
                            <button type="button" onClick={() => void shortcutStore.retrySave()}>重试</button>
                        )}
                    </div>
                    <div className="hotkey-reset-all">
                        {confirmResetAll ? (
                            <>
                                <button type="button" className="hotkey-action-button hotkey-action-button--danger"
                                        onClick={resetAllBindings}>确认恢复全部</button>
                                <button type="button" className="hotkey-action-button"
                                        onClick={() => setConfirmResetAll(false)}>取消</button>
                            </>
                        ) : (
                            <button type="button" className="hotkey-action-button"
                                    disabled={!editingReady}
                                    onClick={() => setConfirmResetAll(true)}>全部恢复默认</button>
                        )}
                    </div>
                </div>

                {(notice || shortcutStore.loadError || shortcutStore.saveError) && (
                    <div className={`hotkey-notice ${shortcutStore.loadError || shortcutStore.saveError ? 'hotkey-notice--error' : ''}`}
                         role="status">
                        {shortcutStore.loadError
                            ?? (shortcutStore.saveError
                                ? `本次修改已生效，但保存失败：${shortcutStore.saveError}`
                                : notice)}
                    </div>
                )}

                <div className="hotkey-table-scroll" role="region" aria-label="快捷键列表" tabIndex={0}>
                    <table className="hotkey-des-table" aria-label="设计器快捷键">
                        <thead>
                        <tr>
                            <th className="table-header" scope="col">编号</th>
                            <th className="table-header" scope="col">功能</th>
                            <th className="table-header" scope="col">当前快捷键</th>
                            <th className="table-header" scope="col">状态</th>
                            <th className="table-header" scope="col">操作</th>
                        </tr>
                        </thead>
                        <tbody>
                        {filteredDefinitions.map((definition, index) => {
                            const binding = isKeyboardShortcutDefinition(definition)
                                ? shortcutStore.getBinding(definition.id)
                                : null;
                            const display = definition.kind === 'guide'
                                ? definition.display[platform]
                                : binding ? getShortcutDisplayParts(binding, platform) : ['已禁用'];
                            const customized = isKeyboardShortcutDefinition(definition)
                                && shortcutStore.isCustomized(definition.id);
                            const status = definition.kind === 'guide'
                                ? '系统操作'
                                : binding === null ? '已禁用' : customized ? '已修改' : '默认';
                            const statusTone = definition.kind === 'guide'
                                ? 'readonly'
                                : binding === null ? 'disabled' : customized ? 'custom' : 'default';
                            const isEditing = editingActionId === definition.id;
                            const trigger = isKeyboardShortcutDefinition(definition)
                                ? (binding ?? resolveDefaultBinding(definition, platform)).trigger
                                : null;

                            return (
                                <tr key={definition.id} className={`table-row table-row--${statusTone} ${isEditing ? 'table-row--editing' : ''}`}>
                                    <td className="table-cell hotkey-index">{String(index + 1).padStart(2, '0')}</td>
                                    <td className="table-cell hotkey-name">{definition.label}</td>
                                    <td className="table-cell hotkey-command">
                                        {isEditing && trigger ? (
                                            <ShortcutRecorder
                                                platform={platform}
                                                trigger={trigger}
                                                onSubmit={submitCapture}
                                                onCancel={finishCapture}
                                            />
                                        ) : renderShortcut(display)}
                                    </td>
                                    <td className="table-cell">
                                        <span className={`hotkey-status hotkey-status--${statusTone}`}>{status}</span>
                                    </td>
                                    <td className="table-cell">
                                        <div className="hotkey-actions">
                                            {isKeyboardShortcutDefinition(definition) ? (
                                                <>
                                                    <button type="button" className="hotkey-action-button hotkey-action-button--edit"
                                                            disabled={!editingReady || isEditing}
                                                            onClick={() => startCapture(definition.id)}>修改</button>
                                                    {binding && (
                                                        <button type="button" className="hotkey-action-button"
                                                                disabled={!editingReady || isEditing}
                                                                onClick={() => disableBinding(definition.id)}>禁用</button>
                                                    )}
                                                    {customized && (
                                                        <button type="button" className="hotkey-action-button"
                                                                disabled={!editingReady || isEditing}
                                                                onClick={() => resetBinding(definition.id)}>恢复默认</button>
                                                    )}
                                                </>
                                            ) : <span className="hotkey-readonly">不可修改</span>}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                        {filteredDefinitions.length === 0 && (
                            <tr>
                                <td className="table-cell hotkey-empty" colSpan={5}>没有匹配的快捷键</td>
                            </tr>
                        )}
                        </tbody>
                    </table>
                </div>

                {editingDefinition && (
                    <div className="hotkey-capture-tip">
                        正在修改“{editingDefinition.label}”，录入期间其他设计器快捷键不会执行。
                    </div>
                )}
            </div>
        </Dialog>
    );
});
