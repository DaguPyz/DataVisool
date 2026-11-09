/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {Close} from "@icon-park/react";
import {Button} from "@datavisool/ui";
import {observer} from "mobx-react";
import {useEffect, useRef} from "react";
import statusListStore from "./StatusListStore.ts";
import StatusListStore from "./StatusListStore.ts";
import TextUtil from "@/util/TextUtil.ts";
import {globalMessage} from "@datavisool/ui";

const ComponentStatusList = observer(() => {
    const {editId, setEditId, changeStatusName} = statusListStore;
    const editStatueNameRef = useRef("");

    useEffect(() => {
        statusListStore.init();

        return () => statusListStore.destroy();
    }, []);

    return (
        <div className="datavisool-component-status-list">
            <div className="status-list-header">
                <div className="list-title">状态</div>
                <div className="list-operate"><Close onClick={() => StatusListStore.setVisible(false)}/></div>
            </div>
            <div className="status-list-content">
                {statusListStore.list?.map((item) => {
                    return <div className={`status-item ${statusListStore.activatedStatus === item.id ? 'status-item-active' : ''}`} key={item.id}
                                onDoubleClick={() => setEditId(item.id)}
                                onClick={(e) => {
                                    if (e.ctrlKey)
                                        statusListStore.delStatus(item.id);
                                    else if (e.altKey)
                                        TextUtil.copyToClipboard(item.id).then(() => {
                                            globalMessage.messageApi?.info("已复制状态ID到剪切板");
                                        });
                                    else
                                        statusListStore.setActivatedStatus(item.id);
                                }}>{item.id === editId ?
                        <input className="status-name-input" defaultValue={item.name}
                               autoFocus={true} ref={(el) => el?.select()}
                               onChange={(e) => editStatueNameRef.current = e.target.value}
                               onKeyDown={(e) => {
                                   if (e.key === 'Enter') {
                                       e.preventDefault();
                                       changeStatusName(item.id, editStatueNameRef.current);
                                       setEditId(null);
                                   }
                               }}
                               onBlur={(e) => {
                                   changeStatusName(item.id, e.target.value)
                                   setEditId(null);
                               }}/> : item.name}
                    </div>
                })}
                <Button type="dashed" size="sm" style={{width: '100%'}} onClick={statusListStore.addStatus}>添加</Button>
            </div>
        </div>
    )
})

export default ComponentStatusList
