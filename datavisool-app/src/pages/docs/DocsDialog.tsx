/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {useEffect, useRef, type ReactNode} from 'react';

export function DocsDialog({label, kind, onClose, children}: {
    label: string;
    kind: 'search' | 'menu' | 'image';
    onClose: () => void;
    children: ReactNode;
}) {
    const ref = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        const dialog = ref.current!;
        dialog.showModal();
        return () => dialog.close();
    }, []);

    return <dialog ref={ref} aria-label={label} className={`dv-docs-dialog dv-docs-dialog--${kind}`}
                   onCancel={onClose} onClick={event => {
                       if (event.target === event.currentTarget) onClose();
                   }}>
        <div className="dv-docs-dialog-body">{children}</div>
    </dialog>;
}
