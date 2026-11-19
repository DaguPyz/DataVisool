/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {globalMessage, globalModal} from "@datavisool/ui";

export async function showProjectImportSuccess(notice: string, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return;
    if (notice) {
        const modal = globalModal.modalApi;
        if (!modal) {
            window.alert(notice);
            if (!signal?.aborted) location.reload();
            return;
        }
        await new Promise<void>(resolve => {
            let key: string | undefined;
            const close = () => { if (key !== undefined) modal.destroy(key); };
            key = modal.warning({
                title: '项目导入完成', content: notice, okText: '重新加载',
                closable: false, maskClosable: false, keyboard: false,
                onOk: () => { if (!signal?.aborted) location.reload(); },
                afterClose: () => {
                    signal?.removeEventListener('abort', close);
                    resolve();
                },
            });
            signal?.addEventListener('abort', close, {once: true});
        });
        return;
    }
    await globalMessage.messageApi?.success('项目数据导入成功, 将重新加载页面！', 1);
    if (!signal?.aborted) location.reload();
}
