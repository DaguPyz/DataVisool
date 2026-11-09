/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {Button, Dialog, Grid, Input, NumberInput, Switch, globalMessage} from "@datavisool/ui";
import {observer} from "mobx-react";
import releaseStore from "@/pages/home/release-management/ReleaseStore.ts";
import {useState} from "react";
import {tx} from "@/i18n/miniI18n.ts";

const ReleaseEditPanel = observer(() => {

    const _close = () => {
        releaseStore.setModalVisible(false)
    };

    const {currentItem} = releaseStore;
    const [encrypt, setEncrypt] = useState(currentItem?.encrypt);

    const doUpdate = () => {
        if (currentItem?.encrypt && !currentItem?.password) {
            globalMessage.messageApi?.error(tx('请输入密码！'));
            return;
        }
        releaseStore.updateItem();
    }


    return <Dialog title="编辑项目发布" open={true} onClose={_close} width={450}
                   mask maskClosable={false} centered showClose>
        <div className={'release-edit-panel'} style={{padding: '10px 20px'}}>
            <Grid gridGap={'20px'}>
                <Input label={'名称'} value={currentItem?.name} onChange={(val) => currentItem!.name = val}/>
                <NumberInput label={'有效期'} value={currentItem?.expirationDate} placeholder={'填写数字。单位：天'}
                             onChange={(val) => currentItem!.expirationDate = val}/>
                <Switch label={'加密'} value={currentItem?.encrypt} onChange={(val) => {
                    currentItem!.encrypt = val;
                    if (!val) {
                        currentItem!.password = undefined;
                    }
                    setEncrypt(val);
                }}/>
                {encrypt && <Input label={'密码'} type={"password"} value={currentItem?.password as string}
                                   onChange={(val) => currentItem!.password = val}/>}
            </Grid>
            <div style={{display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20}}>
                <Button type="primary" onClick={doUpdate}>更新</Button>
                <Button type="default" onClick={_close}>取消</Button>
            </div>
        </div>
    </Dialog>
})

export default ReleaseEditPanel
