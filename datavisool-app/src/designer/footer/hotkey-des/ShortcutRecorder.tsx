/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {useEffect, useRef, useState} from 'react';
import {
    createCodeBindingFromEvent,
    createModifierBinding,
    getModifierFromCode,
    getShortcutBindingValidationError,
} from '@/designer/operate-provider/hot-key/ShortcutCapture.ts';
import {getShortcutDisplayParts} from '@/designer/operate-provider/hot-key/HotKeyPlatform.ts';
import type {
    ShortcutBinding,
    ShortcutBindingUpdateResult,
    ShortcutPlatform,
    ShortcutTrigger,
} from '@/designer/operate-provider/hot-key/ShortcutTypes.ts';

interface ShortcutRecorderProps {
    platform: ShortcutPlatform;
    trigger: ShortcutTrigger;
    onSubmit: (binding: ShortcutBinding) => ShortcutBindingUpdateResult;
    onCancel: () => void;
}

const formatUpdateError = (result: Exclude<ShortcutBindingUpdateResult, {ok: true}>): string => {
    if (result.reason === 'invalid')
        return result.message;
    return `与“${result.conflicts.map((item) => item.label).join('”、“')}”冲突`;
};

export const ShortcutRecorder = ({
    platform,
    trigger,
    onSubmit,
    onCancel,
}: ShortcutRecorderProps) => {
    const [message, setMessage] = useState('请按新的快捷键，Esc 取消');
    const [preview, setPreview] = useState<string[]>([]);
    const recorderRef = useRef<HTMLDivElement>(null);
    const pressedModifierCodesRef = useRef(new Set<string>());
    const multipleModifiersRef = useRef(false);
    const ordinaryKeyAttemptedRef = useRef(false);

    useEffect(() => {
        recorderRef.current?.focus();

        const submit = (binding: ShortcutBinding) => {
            const validationError = getShortcutBindingValidationError(binding, platform);
            if (validationError) {
                setMessage(validationError);
                return;
            }

            const result = onSubmit(binding);
            if (!result.ok)
                setMessage(formatUpdateError(result));
        };

        const blockEvent = (event: KeyboardEvent) => {
            event.preventDefault();
            event.stopImmediatePropagation();
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            blockEvent(event);
            if (event.repeat)
                return;
            if (event.code === 'Escape') {
                onCancel();
                return;
            }

            const modifier = getModifierFromCode(event.code, platform);
            if (modifier) {
                if (pressedModifierCodesRef.current.size === 0)
                    ordinaryKeyAttemptedRef.current = false;
                pressedModifierCodesRef.current.add(event.code);
                multipleModifiersRef.current ||= pressedModifierCodesRef.current.size > 1;
                const labels = Array.from(pressedModifierCodesRef.current)
                    .map((code) => createModifierBinding(code, platform, 'hold'))
                    .filter((binding): binding is ShortcutBinding => Boolean(binding))
                    .flatMap((binding) => getShortcutDisplayParts(binding, platform));
                setPreview(Array.from(new Set(labels)));
                setMessage(trigger === 'hold'
                    ? '松开修饰键完成，或继续按一个普通按键'
                    : '请继续按一个普通按键');
                return;
            }

            const binding = createCodeBindingFromEvent(event, platform, trigger);
            ordinaryKeyAttemptedRef.current = true;
            if (!binding) {
                setMessage('无法识别这个按键，请重新输入');
                return;
            }
            setPreview(getShortcutDisplayParts(binding, platform));
            submit(binding);
        };

        const handleKeyUp = (event: KeyboardEvent) => {
            const modifier = getModifierFromCode(event.code, platform);
            if (!modifier || !pressedModifierCodesRef.current.has(event.code))
                return;

            blockEvent(event);
            const wasOnlyPressedModifier = pressedModifierCodesRef.current.size === 1;
            pressedModifierCodesRef.current.delete(event.code);

            if (ordinaryKeyAttemptedRef.current) {
                if (pressedModifierCodesRef.current.size === 0) {
                    ordinaryKeyAttemptedRef.current = false;
                    multipleModifiersRef.current = false;
                    setPreview([]);
                }
                return;
            }
            if (multipleModifiersRef.current) {
                setMessage('单独按住的动作一次只能设置一个修饰键；组合键需包含普通按键');
                if (pressedModifierCodesRef.current.size === 0) {
                    multipleModifiersRef.current = false;
                    setPreview([]);
                }
                return;
            }
            if (trigger !== 'hold') {
                setMessage('该操作需要一个普通按键');
                setPreview([]);
                return;
            }
            if (!wasOnlyPressedModifier)
                return;

            const binding = createModifierBinding(event.code, platform, trigger);
            if (binding)
                submit(binding);
        };

        const cancelCapture = () => onCancel();
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden')
                cancelCapture();
        };

        window.addEventListener('keydown', handleKeyDown, true);
        window.addEventListener('keyup', handleKeyUp, true);
        window.addEventListener('blur', cancelCapture);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            window.removeEventListener('keydown', handleKeyDown, true);
            window.removeEventListener('keyup', handleKeyUp, true);
            window.removeEventListener('blur', cancelCapture);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [onCancel, onSubmit, platform, trigger]);

    return (
        <div
            ref={recorderRef}
            className="hotkey-recorder"
            tabIndex={0}
            role="group"
            aria-label="快捷键录入"
        >
            <span className="hotkey-recorder-preview">
                {preview.length > 0
                    ? preview.map((key) => <kbd key={key}>{key}</kbd>)
                    : <span className="hotkey-recorder-placeholder">等待按键</span>}
            </span>
            <span className="hotkey-recorder-message" aria-live="polite">{message}</span>
            <button type="button" className="hotkey-action-button" onClick={onCancel}>取消</button>
        </div>
    );
};
