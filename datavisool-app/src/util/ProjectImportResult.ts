/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {globalMessage, globalModal} from "@datavisool/ui";

export function showProjectImportSuccess(notice: string): void {
    if (notice) {
        if (globalModal.modalApi) {
            globalModal.modalApi.warning({
                title: "项目导入完成", content: notice, okText: "重新加载",
                closable: false, maskClosable: false, keyboard: false,
                onOk: () => location.reload(),
            });
        } else {
            window.alert(notice);
            location.reload();
        }
        return;
    }
    globalMessage.messageApi?.success("项目数据导入成功, 将重新加载页面！", 1).then(() => location.reload());
}
