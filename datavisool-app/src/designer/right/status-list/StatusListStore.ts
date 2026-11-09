/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {action, makeObservable, observable} from "mobx";
import rightStore from "@/designer/right/RightStore.ts";
import {IdGenerate} from "@datavisool/sdk";

class StatusListStore {
    constructor() {
        makeObservable(this, {
            visible: observable,
            list: observable,
            activatedStatus: observable,
            editId: observable,
            setVisible: action,
            setList: action,
            addStatus: action,
            delStatus: action,
            setActivatedStatus: action,
            setEditId: action,
            changeStatusName: action,
            init: action,
            destroy: action
        })
    }

    visible = false;

    editId: null | string = null;

    activatedStatus: string | null = null;

    list: Array<{ id: string, name: string }> = [];

    setEditId = (id: string | null) => this.editId = id;

    setVisible = (v: boolean) => this.visible = v;

    setActivatedStatus = (id: string) => {
        if (id === this.activatedStatus)
            return;
        this.activatedStatus = id;
        const {controllers} = window.DATAVISOOL_ENV.currentManager?.layerManager ?? {};
        if (!controllers)
            return;
        const {activeElem, remountConfigDetailsPanel} = rightStore;
        const controller = controllers[activeElem.id!];
        if (!controller || !controller.config.status[id])
            return;
        const currentStatusConfig = controller.config.status[id].config;
        controller.update(currentStatusConfig);
        remountConfigDetailsPanel();
    }

    /**
     * 添加新的状态
     */
    addStatus = () => {
        //生成唯一id
        const id = IdGenerate.generateId();
        const status = {id, name: `状态${this.list.length + 1}`};

        //找到当前激活的controller
        const {activeElem} = rightStore;
        const {controllers} = window.DATAVISOOL_ENV.currentManager?.layerManager ?? {};
        if (!controllers)
            return;
        const controller = controllers[activeElem.id!];
        if (!controller)
            return;
        if (!controller.config.status)
            controller.getConfig().status = {};
        controller.getConfig().status[id] = {name: status.name, config: {}};
        this.list.push(status);
    }

    /**
     * 删除状态
     */
    delStatus = (id: string) => {
        if (!id)
            return;
        const {controllers} = window.DATAVISOOL_ENV.currentManager?.layerManager ?? {};
        if (!controllers)
            return;
        const {activeElem} = rightStore;
        const controller = controllers[activeElem.id!];
        if (!controller)
            return;
        if (controller.config.status[id])
            delete controller.config.status[id];
        this.list = this.list.filter(item => item.id !== id);
    }

    /**
     * 修改状态名称
     * @param id
     * @param name
     */
    changeStatusName = (id: string, name: string) => {
        const {controllers} = window.DATAVISOOL_ENV.currentManager?.layerManager ?? {};
        if (!id || !controllers)
            return;
        const controller = controllers[rightStore.activeElem.id!];
        if (!controller)
            return;
        if (!controller.config.status[id])
            return;
        controller.config.status[id]['name'] = name;
        this.list = this.list.map(item => item.id === id ? {id, name} : item);
    }

    /**
     * 读取组件controller中的状态
     * @param componentId 组件id
     */
    setList = (componentId: string) => {
        const {controllers} = window.DATAVISOOL_ENV.currentManager?.layerManager ?? {};
        if (!componentId || !controllers)
            return;
        const controller = controllers[componentId];
        if (!controller)
            return;
        const {status} = controller.getConfig();
        if (!status || Object.keys(status).length === 0)
            return;
        this.list = Object.keys(status).map(key => {
            const st = status[key];
            return {
                id: key,
                name: st.name,
            }
        })
    }

    /**
     * 初始化
     */
    init = () => {
        const {controllers} = window.DATAVISOOL_ENV.currentManager?.layerManager ?? {};
        const componentId = rightStore.activeElem.id;
        if (!componentId || !controllers)
            return;
        const controller = controllers[componentId];
        if (!controller)
            return;
        const {status = {}} = controller.getConfig();
        this.list = Object.keys(status).map(key => {
            const st = status[key];
            return {
                id: key,
                name: st.name,
            }
        })
    }

    /**
     * 销毁
     */
    destroy = () => {
        this.list = [];
        this.activatedStatus = null;
    }
}

const statusListStore = new StatusListStore();
export default statusListStore;
