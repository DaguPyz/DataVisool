/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {action, makeObservable, observable} from "mobx";
import AbstractManager from "./core/AbstractManager.ts";
import {IGlobalVariable, IGlobalVariableManager} from "@datavisool/sdk/types";
import GlobalVariable from "../left/global-variable/GlobalVariable.ts";
import {globalMessage} from "@datavisool/ui";
import {IdGenerate as idGenerate} from "@datavisool/sdk";
import DataUtil from "../../util/DataUtil.ts";
import {cloneDeep} from "lodash";

class GlobalVariableManager extends AbstractManager<IGlobalVariableManager> {

    constructor() {
        super();
        makeObservable(this, {
            editPanelVisible: observable,
            editGlobalVariable: observable.ref,
            globalVariableInstance: observable,
            setEditPanelVisible: action,
            setEditGlobalVariable: action,
            activeGlobalVariable: action,
            createOrUpdateGlobalVariable: action,
            copyGlobalVariable: action,
            deleteGlobalVariable: action,
            init: action,
        })
    }

    editPanelVisible = false;

    globalVariableInstance: Record<string, GlobalVariable> = {};

    /**
     * 当前被编辑的全局变量
     */
    editGlobalVariable: IGlobalVariable | null = {
        triggerSource: {
            sourceType: 'static'
        }
    };

    setEditPanelVisible = (visible: boolean) => {
        this.editPanelVisible = visible;
        if (!visible)
            this.setEditGlobalVariable({
                triggerSource: {
                    sourceType: 'static'
                }
            });
    };

    /**
     * 创建或更新全局变量（仅在编辑全局变量时使用）
     */
    createOrUpdateGlobalVariable = (): boolean => {
        if (!this.editGlobalVariable || !this.editGlobalVariable.key?.trim()) {
            globalMessage.messageApi?.error("请填写变量名");
            return false;
        }
        this.editGlobalVariable = {...this.editGlobalVariable, key: this.editGlobalVariable.key!.trim()};
        const {id, key, value, reRender = false, triggerSource} = this.editGlobalVariable;
        if (id) {
            //更新
            if (Object.values(this.globalVariableInstance).some((item) => {
                const gv = item.getGlobalVariable();
                return gv.key === key && id !== gv.id
            })) {
                globalMessage.messageApi?.error("全局变量名重复");
                return false;
            }
            this.globalVariableInstance[id].update(this.editGlobalVariable);
        } else {
            //创建
            if (Object.values(this.globalVariableInstance).some((item) => item.getGlobalVariable().key === key)) {
                globalMessage.messageApi?.error("全局变量名重复");
                return false;
            }
            const newId = idGenerate.generateId();
            const gvValue = triggerSource?.sourceType === 'static' ? (value !== undefined ? value : DataUtil.getStaticData(triggerSource?.staticData)) : value;
            this.globalVariableInstance[newId] = new GlobalVariable(newId, key!, gvValue, reRender, [], triggerSource);
        }
        if (this.editPanelVisible) {
            this.setEditPanelVisible(false);
            this.setEditGlobalVariable(null);
            globalMessage.messageApi?.success("保存成功");
        }
        return true;
    }

    activeGlobalVariable = (id: string) => {
        this.editGlobalVariable = this.globalVariableInstance[id].getGlobalVariable();
    }

    copyGlobalVariable = (id: string) => {
        const gv = this.globalVariableInstance[id].getGlobalVariable();
        gv.key = gv.key! + "-副本";
        if (Object.values(this.globalVariableInstance).some((item) => item.getGlobalVariable().key === gv.key)) {
            globalMessage.messageApi?.error("全局变量名重复");
            return;
        }
        gv.id = idGenerate.generateId();
        this.globalVariableInstance[gv.id!] = new GlobalVariable(gv.id!, gv.key!, cloneDeep(gv.value), !!gv.reRender, [], cloneDeep(gv.triggerSource));
    }

    setEditGlobalVariable = (gv: IGlobalVariable | null) => this.editGlobalVariable = gv;


    deleteGlobalVariable = (id: string) => {
        delete this.globalVariableInstance[id];
        //删除变量是，同时计算蓝图中那些被使用到的变量节点也要一并删除
        const {delNode} = window.DATAVISOOL_ENV.currentManager.bluePrintManager;
        delNode([id]);
    }


    public init = (data: IGlobalVariableManager): void => {
        if (!data || !data.globalVariables)
            return;
        Object.values(data.globalVariables).forEach((item) => {
            const {id, key, value, bindTarget, reRender = false, triggerSource} = item;
            this.globalVariableInstance[id!] = new GlobalVariable(id!, key!, value, reRender, bindTarget, triggerSource);
        })
    }

    public getData = (): IGlobalVariableManager => {
        const globalVariables = Object.values(this.globalVariableInstance).reduce((pre: Record<string, IGlobalVariable> = {}, cur) => {
            const gv = cur.getGlobalVariable();
            pre[gv.id!] = gv;
            return pre;
        }, {});
        return {globalVariables};
    }

    public destroy = (): void => {
        Object.values(this.globalVariableInstance).forEach((item) => item.stop());
        this.globalVariableInstance = {};
        this.editGlobalVariable = null;
        this.editPanelVisible = false;
    }
}

export default GlobalVariableManager;
