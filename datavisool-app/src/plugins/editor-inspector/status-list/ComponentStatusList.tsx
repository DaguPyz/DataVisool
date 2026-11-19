/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {Close} from '@icon-park/react';
import {Button, globalMessage} from '@datavisool/ui';
import {observer} from 'mobx-react';
import {useEffect, useRef} from 'react';
import type {EditorInspectorDomain} from '@datavisool/sdk/plugin/contracts/editorInspector';
import TextUtil from '@/util/TextUtil.ts';
import type {InspectorStore} from '../InspectorStore.ts';

const ComponentStatusList = observer(({domain, componentId, store}: {domain: EditorInspectorDomain; componentId: string; store: InspectorStore}) => {
    const editStatueNameRef = useRef('');

    const refresh = () => store.setStatuses(domain.readStatuses(componentId));

    useEffect(() => {
        refresh();
        return () => store.clearStatuses();
    }, [domain, componentId]);

    const changeStatusName = (id: string, name: string) => {
        if (domain.applyStatusChange(componentId, {kind: 'rename', id, name})) refresh();
    };

    return (
        <div className="datavisool-component-status-list">
            <div className="status-list-header">
                <div className="list-title">状态</div>
                <div className="list-operate"><Close onClick={() => store.setStatusListVisible(false)}/></div>
            </div>
            <div className="status-list-content">
                {store.statusItems.map(item => (
                    <div className={`status-item ${store.activatedStatus === item.id ? 'status-item-active' : ''}`} key={item.id}
                         onDoubleClick={() => store.setStatusEditId(item.id)}
                         onClick={event => {
                             if (event.ctrlKey) {
                                 if (domain.applyStatusChange(componentId, {kind: 'delete', id: item.id})) refresh();
                                 if (store.activatedStatus === item.id) store.setActivatedStatus(null);
                             } else if (event.altKey) {
                                 TextUtil.copyToClipboard(item.id).then(() => globalMessage.messageApi?.info('已复制状态ID到剪切板'));
                             } else if (domain.applyStatusChange(componentId, {kind: 'activate', id: item.id})) {
                                 store.setActivatedStatus(item.id);
                             }
                         }}>
                        {item.id === store.statusEditId ?
                            <input className="status-name-input" defaultValue={item.name}
                                   autoFocus={true} ref={element => element?.select()}
                                   onChange={event => editStatueNameRef.current = event.target.value}
                                   onKeyDown={event => {
                                       if (event.key === 'Enter') {
                                           event.preventDefault();
                                           changeStatusName(item.id, editStatueNameRef.current);
                                           store.setStatusEditId(null);
                                       }
                                   }}
                                   onBlur={event => {
                                       changeStatusName(item.id, event.target.value);
                                       store.setStatusEditId(null);
                                   }}/> : item.name}
                    </div>
                ))}
                <Button type="dashed" size="sm" style={{width: '100%'}} onClick={() => {
                    if (domain.applyStatusChange(componentId, {kind: 'add'})) refresh();
                }}>添加</Button>
            </div>
        </div>
    );
});

export default ComponentStatusList;
