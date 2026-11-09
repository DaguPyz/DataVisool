/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {describe, expect, it, vi} from 'vitest';
import {codeBinding, modifierBinding} from '@/designer/operate-provider/hot-key/ShortcutRegistry.ts';
import {ShortcutStore} from '@/designer/operate-provider/hot-key/ShortcutStore.ts';
import type {
    ShortcutPersistence,
    ShortcutPersistenceLoadResult,
} from '@/designer/operate-provider/hot-key/ShortcutPersistence.ts';
import {
    SHORTCUT_ACTION_IDS,
    type ShortcutPreferencesV1,
} from '@/designer/operate-provider/hot-key/ShortcutTypes.ts';

class MemoryShortcutPersistence implements ShortcutPersistence {
    readonly data = new Map<string, ShortcutPreferencesV1>();
    saveError: Error | null = null;

    async load(userId: string): Promise<ShortcutPersistenceLoadResult> {
        return {status: 'ok', preferences: this.data.get(userId) ?? null, warnings: []};
    }

    async save(userId: string, preferences: ShortcutPreferencesV1): Promise<void> {
        if (this.saveError)
            throw this.saveError;
        this.data.set(userId, preferences);
    }

    async remove(userId: string): Promise<void> {
        this.data.delete(userId);
    }
}

const preferences = (
    overrides: ShortcutPreferencesV1['overrides'],
): ShortcutPreferencesV1 => ({version: 1, updatedAt: 1, overrides});

describe('ShortcutStore', () => {
    it('初始化完成前同步提供默认值，并按用户恢复覆盖项', async () => {
        const persistence = new MemoryShortcutPersistence();
        persistence.data.set('user-a', preferences({
            [SHORTCUT_ACTION_IDS.COPY]: codeBinding('KeyQ', ['primary']),
        }));
        persistence.data.set('user-b', preferences({
            [SHORTCUT_ACTION_IDS.DELETE]: null,
        }));
        const store = new ShortcutStore({persistence, platform: 'windows'});

        expect(store.getBinding(SHORTCUT_ACTION_IDS.COPY)).toEqual(codeBinding('KeyC', ['primary']));
        await store.initialize('user-a');
        expect(store.getBinding(SHORTCUT_ACTION_IDS.COPY)).toEqual(codeBinding('KeyQ', ['primary']));

        const userBLoad = store.initialize('user-b');
        expect(store.getBinding(SHORTCUT_ACTION_IDS.COPY)).toEqual(codeBinding('KeyC', ['primary']));
        await userBLoad;
        expect(store.getBinding(SHORTCUT_ACTION_IDS.DELETE)).toBeNull();
    });

    it('generation阻止较早用户的异步结果覆盖当前用户', async () => {
        const resolvers = new Map<string, (result: ShortcutPersistenceLoadResult) => void>();
        const persistence: ShortcutPersistence = {
            load: (userId) => new Promise((resolve) => resolvers.set(userId, resolve)),
            save: async () => undefined,
            remove: async () => undefined,
        };
        const store = new ShortcutStore({persistence, platform: 'windows'});

        const userALoad = store.initialize('user-a');
        const userBLoad = store.initialize('user-b');
        await vi.waitFor(() => expect(resolvers.has('user-b')).toBe(true));
        resolvers.get('user-b')!({
            status: 'ok',
            preferences: preferences({[SHORTCUT_ACTION_IDS.COPY]: codeBinding('KeyB', ['primary'])}),
            warnings: [],
        });
        await Promise.all([userALoad, userBLoad]);

        expect(store.activeUserId).toBe('user-b');
        expect(store.getBinding(SHORTCUT_ACTION_IDS.COPY)).toEqual(codeBinding('KeyB', ['primary']));
    });

    it('检测重叠上下文冲突，同时允许互斥选择/拖拽阶段复用Shift', () => {
        const store = new ShortcutStore({persistence: new MemoryShortcutPersistence(), platform: 'windows'});
        const conflict = store.setBinding(SHORTCUT_ACTION_IDS.BOX_SELECTION_START, modifierBinding('shift'));
        expect(conflict.ok).toBe(false);
        if (!conflict.ok)
            expect(conflict.reason).toBe('conflict');

        expect(store.findConflicts(SHORTCUT_ACTION_IDS.AXIS_LOCK, modifierBinding('shift'))).toEqual([]);
        expect(store.setBinding(SHORTCUT_ACTION_IDS.SELECTION_TOGGLE, null)).toEqual({ok: true});
        expect(store.setBinding(SHORTCUT_ACTION_IDS.BOX_SELECTION_START, modifierBinding('shift'))).toEqual({ok: true});
    });

    it('恢复默认值时不会覆盖其他动作已占用的组合', () => {
        const store = new ShortcutStore({persistence: new MemoryShortcutPersistence(), platform: 'windows'});
        expect(store.setBinding(SHORTCUT_ACTION_IDS.LOCK, codeBinding('KeyQ', ['primary']))).toEqual({ok: true});
        expect(store.setBinding(SHORTCUT_ACTION_IDS.DELETE, codeBinding('KeyL', ['primary']))).toEqual({ok: true});

        const result = store.resetBinding(SHORTCUT_ACTION_IDS.LOCK);
        expect(result.ok).toBe(false);
        expect(store.getBinding(SHORTCUT_ACTION_IDS.LOCK)).toEqual(codeBinding('KeyQ', ['primary']));
    });

    it('按最终覆盖集合校验加载数据，不受对象字段顺序影响', async () => {
        const persistence = new MemoryShortcutPersistence();
        persistence.data.set('user-a', preferences({
            [SHORTCUT_ACTION_IDS.COPY]: codeBinding('KeyD', ['primary']),
            [SHORTCUT_ACTION_IDS.CLONE]: codeBinding('KeyQ', ['primary']),
        }));
        const store = new ShortcutStore({persistence, platform: 'windows'});

        await store.initialize('user-a');

        expect(store.getBinding(SHORTCUT_ACTION_IDS.COPY)).toEqual(codeBinding('KeyD', ['primary']));
        expect(store.getBinding(SHORTCUT_ACTION_IDS.CLONE)).toEqual(codeBinding('KeyQ', ['primary']));
    });

    it('忽略改变动作触发方式的持久化覆盖项', async () => {
        const persistence = new MemoryShortcutPersistence();
        persistence.data.set('user-a', preferences({
            [SHORTCUT_ACTION_IDS.COPY]: codeBinding('KeyQ', ['primary'], 'hold'),
        }));
        const store = new ShortcutStore({persistence, platform: 'windows'});

        await store.initialize('user-a');

        expect(store.getBinding(SHORTCUT_ACTION_IDS.COPY)).toEqual(codeBinding('KeyC', ['primary']));
    });

    it('加载完成前拒绝配置写入，避免覆盖尚未读取的用户偏好', async () => {
        let resolveLoad!: (result: ShortcutPersistenceLoadResult) => void;
        const saved = vi.fn(async () => undefined);
        const persistence: ShortcutPersistence = {
            load: () => new Promise((resolve) => resolveLoad = resolve),
            save: saved,
            remove: async () => undefined,
        };
        const store = new ShortcutStore({persistence, platform: 'windows', saveDelayMs: 1});
        const loading = store.initialize('user-a');
        expect(store.setBinding(SHORTCUT_ACTION_IDS.LOCK, codeBinding('KeyQ', ['primary']))).toMatchObject({
            ok: false,
            reason: 'invalid',
        });
        expect(store.resetBinding(SHORTCUT_ACTION_IDS.LOCK)).toMatchObject({ok: false});
        expect(store.resetAll()).toMatchObject({ok: false});
        await vi.waitFor(() => expect(resolveLoad).toBeTypeOf('function'));
        resolveLoad({
            status: 'ok',
            preferences: preferences({
                [SHORTCUT_ACTION_IDS.COPY]: codeBinding('KeyB', ['primary']),
                [SHORTCUT_ACTION_IDS.DELETE]: null,
            }),
            warnings: [],
        });
        await loading;
        await store.flushPendingSave();

        expect(store.getBinding(SHORTCUT_ACTION_IDS.LOCK)).toEqual(codeBinding('KeyL', ['primary']));
        expect(store.getBinding(SHORTCUT_ACTION_IDS.COPY)).toEqual(codeBinding('KeyB', ['primary']));
        expect(store.getBinding(SHORTCUT_ACTION_IDS.DELETE)).toBeNull();
        expect(saved).not.toHaveBeenCalled();
    });

    it('读取失败后拒绝配置写入，避免用局部默认状态覆盖旧偏好', async () => {
        const save = vi.fn(async () => undefined);
        const persistence: ShortcutPersistence = {
            load: async () => ({status: 'error', error: new Error('read failed')}),
            save,
            remove: async () => undefined,
        };
        const store = new ShortcutStore({persistence, platform: 'windows', saveDelayMs: 1});

        await store.initialize('user-a');

        expect(store.loadState).toBe('error');
        expect(store.setBinding(SHORTCUT_ACTION_IDS.COPY, codeBinding('KeyQ', ['primary']))).toMatchObject({
            ok: false,
            reason: 'invalid',
        });
        expect(store.resetBinding(SHORTCUT_ACTION_IDS.COPY)).toMatchObject({ok: false});
        expect(store.resetAll()).toMatchObject({ok: false});
        await store.flushPendingSave();
        expect(save).not.toHaveBeenCalled();
    });

    it('用户切换读取会等待上一用户的待写入完成', async () => {
        let releaseSave!: () => void;
        const data = new Map<string, ShortcutPreferencesV1>();
        const persistence: ShortcutPersistence = {
            load: async (userId) => ({status: 'ok', preferences: data.get(userId) ?? null, warnings: []}),
            save: async (userId, value) => {
                await new Promise<void>((resolve) => releaseSave = resolve);
                data.set(userId, value);
            },
            remove: async () => undefined,
        };
        const store = new ShortcutStore({persistence, platform: 'windows', saveDelayMs: 1000});
        await store.initialize('user-a');
        store.setBinding(SHORTCUT_ACTION_IDS.COPY, codeBinding('KeyQ', ['primary']));

        const userBLoad = store.initialize('user-b');
        const userAReload = store.initialize('user-a');
        await vi.waitFor(() => expect(releaseSave).toBeTypeOf('function'));
        releaseSave();
        await Promise.all([userBLoad, userAReload]);

        expect(store.getBinding(SHORTCUT_ACTION_IDS.COPY)).toEqual(codeBinding('KeyQ', ['primary']));
    });

    it('用户切换期间上一用户保存失败仍会记录错误', async () => {
        let rejectSave!: (error: Error) => void;
        const persistence: ShortcutPersistence = {
            load: async () => ({status: 'ok', preferences: null, warnings: []}),
            save: async () => new Promise<void>((_resolve, reject) => rejectSave = reject),
            remove: async () => undefined,
        };
        const store = new ShortcutStore({persistence, platform: 'windows', saveDelayMs: 1000});
        await store.initialize('user-a');
        store.setBinding(SHORTCUT_ACTION_IDS.COPY, codeBinding('KeyQ', ['primary']));

        const userBLoad = store.initialize('user-b');
        await vi.waitFor(() => expect(rejectSave).toBeTypeOf('function'));
        rejectSave(new Error('disk full'));
        await userBLoad;

        expect(store.activeUserId).toBe('user-b');
        expect(store.saveError).toBe('用户 user-a：disk full');
    });

    it('press精确匹配修饰键，hold允许组合使用', () => {
        const store = new ShortcutStore({persistence: new MemoryShortcutPersistence(), platform: 'windows'});
        const selectAll = new KeyboardEvent('keydown', {code: 'KeyA', ctrlKey: true});
        const selectAllWithShift = new KeyboardEvent('keydown', {code: 'KeyA', ctrlKey: true, shiftKey: true});
        const deepAndToggle = new MouseEvent('pointerdown', {ctrlKey: true, shiftKey: true});

        expect(store.isActive(SHORTCUT_ACTION_IDS.SELECT_ALL, selectAll)).toBe(true);
        expect(store.isActive(SHORTCUT_ACTION_IDS.SELECT_ALL, selectAllWithShift)).toBe(false);
        expect(store.isActive(SHORTCUT_ACTION_IDS.SELECTION_DEEP, deepAndToggle)).toBe(true);
        expect(store.isActive(SHORTCUT_ACTION_IDS.SELECTION_TOGGLE, deepAndToggle)).toBe(true);
    });

    it('跟踪普通按键并在窗口失焦或输入控件中清理', () => {
        const store = new ShortcutStore({persistence: new MemoryShortcutPersistence(), platform: 'windows'});
        const stopTracking = store.startPressedStateTracking(window, document);

        window.dispatchEvent(new KeyboardEvent('keydown', {code: 'KeyX'}));
        expect(store.isActive(SHORTCUT_ACTION_IDS.BOX_SELECTION_START, new MouseEvent('pointerdown'))).toBe(true);
        window.dispatchEvent(new Event('blur'));
        expect(store.isActive(SHORTCUT_ACTION_IDS.BOX_SELECTION_START, new MouseEvent('pointerdown'))).toBe(false);

        const input = document.createElement('input');
        document.body.appendChild(input);
        input.focus();
        input.dispatchEvent(new KeyboardEvent('keydown', {code: 'KeyX', bubbles: true}));
        expect(store.isActive(SHORTCUT_ACTION_IDS.BOX_SELECTION_START)).toBe(false);
        input.remove();
        stopTracking();
    });

    it('拒绝无法绑定的press键并屏蔽所有可编辑contenteditable形式', () => {
        const store = new ShortcutStore({persistence: new MemoryShortcutPersistence(), platform: 'windows'});
        expect(store.setBinding(SHORTCUT_ACTION_IDS.COPY, codeBinding('F25', ['primary']))).toMatchObject({
            ok: false,
            reason: 'invalid',
        });
        expect(store.setBinding(SHORTCUT_ACTION_IDS.COPY, codeBinding('F20', ['primary']))).toMatchObject({
            ok: false,
            reason: 'invalid',
        });
        expect(store.setBinding(SHORTCUT_ACTION_IDS.COPY, codeBinding('F1', ['primary']))).toEqual({ok: true});

        const editable = document.createElement('div');
        editable.setAttribute('contenteditable', 'plaintext-only');
        document.body.append(editable);
        expect(store.isActive(
            SHORTCUT_ACTION_IDS.SELECTION_DEEP,
            new MouseEvent('pointerdown', {ctrlKey: true}),
        )).toBe(true);
        const event = new MouseEvent('pointerdown', {ctrlKey: true});
        Object.defineProperty(event, 'target', {value: editable});
        expect(store.isActive(SHORTCUT_ACTION_IDS.SELECTION_DEEP, event)).toBe(false);
        editable.remove();
    });

    it('保存覆盖、null禁用和恢复默认，写入失败不回滚内存', async () => {
        const persistence = new MemoryShortcutPersistence();
        const store = new ShortcutStore({persistence, platform: 'windows', saveDelayMs: 1});
        await store.initialize('user-a');

        expect(store.setBinding(SHORTCUT_ACTION_IDS.COPY, codeBinding('KeyQ', ['primary']))).toEqual({ok: true});
        await store.flushPendingSave();
        expect(persistence.data.get('user-a')?.overrides[SHORTCUT_ACTION_IDS.COPY]).toEqual(codeBinding('KeyQ', ['primary']));

        expect(store.setBinding(SHORTCUT_ACTION_IDS.DELETE, null)).toEqual({ok: true});
        await store.flushPendingSave();
        expect(persistence.data.get('user-a')?.overrides[SHORTCUT_ACTION_IDS.DELETE]).toBeNull();

        store.resetBinding(SHORTCUT_ACTION_IDS.DELETE);
        expect(store.getBinding(SHORTCUT_ACTION_IDS.DELETE)).toEqual(codeBinding('Delete'));
        store.resetAll();
        await store.flushPendingSave();
        expect(persistence.data.has('user-a')).toBe(false);

        persistence.saveError = new Error('disk full');
        store.setBinding(SHORTCUT_ACTION_IDS.COPY, codeBinding('KeyQ', ['primary']));
        await store.flushPendingSave();
        expect(store.getBinding(SHORTCUT_ACTION_IDS.COPY)).toEqual(codeBinding('KeyQ', ['primary']));
        expect(store.saveError).toBe('disk full');
    });

    it('registerHandler返回精确注销函数', () => {
        const store = new ShortcutStore({persistence: new MemoryShortcutPersistence(), platform: 'windows'});
        const handler = vi.fn();
        const dispose = store.registerHandler(SHORTCUT_ACTION_IDS.COPY, handler);
        const event = new KeyboardEvent('keydown', {code: 'KeyC', ctrlKey: true});

        expect(store.invokeHandlers(SHORTCUT_ACTION_IDS.COPY, event)).toBe(true);
        expect(handler).toHaveBeenCalledTimes(1);
        dispose();
        expect(store.invokeHandlers(SHORTCUT_ACTION_IDS.COPY, event)).toBe(false);
    });

    it('录入期间暂停动作并在结束后清理按键状态', async () => {
        const store = new ShortcutStore({
            persistence: new MemoryShortcutPersistence(),
            platform: 'mac',
        });
        await store.initialize('user-a');
        store.handleKeyDown(new KeyboardEvent('keydown', {code: 'AltLeft', altKey: true}));

        expect(store.beginCapture(SHORTCUT_ACTION_IDS.BOX_SELECTION_CONTAIN)).toBe(true);
        expect(store.isActive(
            SHORTCUT_ACTION_IDS.BOX_SELECTION_CONTAIN,
            new KeyboardEvent('keydown', {code: 'AltLeft', altKey: true}),
        )).toBe(false);

        store.endCapture();
        expect(store.capturingActionId).toBeNull();
        expect(store.isActive(SHORTCUT_ACTION_IDS.BOX_SELECTION_CONTAIN)).toBe(false);
    });

    it('保存失败后可以按当前内存配置重试', async () => {
        const persistence = new MemoryShortcutPersistence();
        const store = new ShortcutStore({persistence, platform: 'windows', saveDelayMs: 1});
        await store.initialize('user-a');
        persistence.saveError = new Error('disk full');
        store.setBinding(SHORTCUT_ACTION_IDS.COPY, codeBinding('KeyQ', ['primary']));
        await store.flushPendingSave();
        expect(store.saveState).toBe('error');

        persistence.saveError = null;
        await store.retrySave();
        expect(store.saveState).toBe('saved');
        expect(persistence.data.get('user-a')?.overrides[SHORTCUT_ACTION_IDS.COPY])
            .toEqual(codeBinding('KeyQ', ['primary']));
    });
});
