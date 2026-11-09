/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {memo} from "react";
import {Button, Dialog} from "@datavisool/ui";

interface DelDialogProps {
    onOk: () => void;
    onCancel: () => void;
    visible: boolean;
}

const DelProjectDialog = memo((props: DelDialogProps) => {

    const {onOk, onCancel, visible} = props;

    return (
        <Dialog title={'删除确认'} open={visible} onClose={onCancel} width={350} mask centered showClose>
            <div style={{color: '#aeaeae', padding: 10}}>确定要删除该项目吗？</div>
            <div style={{display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16}}>
                <Button type="primary" onClick={onOk}>确认</Button>
                <Button type="default" onClick={onCancel}>取消</Button>
            </div>
        </Dialog>
    )
})

export default DelProjectDialog
