/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React from "react";
import {Button, Dialog} from "@datavisool/ui";

interface CloneDialogProps {
    onOk: () => void;
    onCancel: () => void;
    visible: boolean;
}

const CloneProjectDialog = (props: CloneDialogProps) => {

    const {onOk, onCancel, visible} = props;


    const onClick = (event: React.MouseEvent): void => {
        event.preventDefault();
        onOk();
    }

    return (
        <Dialog title={'克隆项目'} open={visible} onClose={onCancel} width={350} mask centered showClose>
            <div style={{color: '#a7a7a7', padding: 10}}>确认克隆项目吗？</div>
            <div style={{display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16}}>
                <Button type="primary" onClick={onClick}>确认</Button>
                <Button type="default" onClick={onCancel}>取消</Button>
            </div>
        </Dialog>
    )
}

export default CloneProjectDialog;
