/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {action, makeObservable, observable} from "mobx";
import AbstractManager from "./core/AbstractManager.ts";
import {IGlobalVariable, IGlobalVariableManager} from "@datavisool/sdk/types";
import GlobalVariable from "../left/global-variable/GlobalVariable.ts";
import type {DesignerVariableWriteResult} from '@datavisool/sdk/plugin/contracts/designerRuntime';
import {IdGenerate as idGenerate} from "@datavisool/sdk";
import DataUtil from "@/util/DataUtil.ts";
import {cloneDeep} from "lodash";

class GlobalVariableManager extends AbstractManager<IGlobalVariableManager> {

    constructor() {
        super();
        makeObservable(this, {
            globalVariableInstance: observable,
            saveGlobalVariable: action,
            copyGlobalVariable: action,
            deleteGlobalVariable: action,
            init: action,
        });
    }

    globalVariableInstance: Record<string, GlobalVariable> = {};

    saveGlobalVariable = (data: IGlobalVariable): DesignerVariableWriteResult => {
        const key = data.key?.trim();
        if (!key) return 'missing-name';
        const {id, value, reRender, triggerSource} = cloneDeep(data);
        if (Object.values(this.globalVariableInstance).some(variable => variable.id !== id && variable.key === key))
            return 'duplicate-name';

        if (id) {
            const variable = this.globalVariableInstance[id];
            if (!variable) return 'missing-variable';
            variable.update({id, key, value, reRender, triggerSource});
        } else {
            const newId = idGenerate.generateId();
            const initialValue = triggerSource?.sourceType === 'static' && value === undefined
                ? DataUtil.getStaticData(triggerSource.staticData) : value;
            this.globalVariableInstance[newId] = new GlobalVariable(newId, key, initialValue, Boolean(reRender), [], triggerSource);
        }
        return 'saved';
    };

    copyGlobalVariable = (id: string): DesignerVariableWriteResult => {
        const variable = this.globalVariableInstance[id];
        if (!variable) return 'missing-variable';
        return this.saveGlobalVariable({
            key: variable.key + '-副本',
            value: variable.value,
            reRender: variable.reRender,
            triggerSource: variable.triggerSource,
        });
    };

    deleteGlobalVariable = (id: string): boolean => {
        const variable = this.globalVariableInstance[id];
        if (!variable) return false;
        variable.stop();
        delete this.globalVariableInstance[id];
        return true;
    };

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

    public pauseRuntimeEffects = (): void => {
        Object.values(this.globalVariableInstance).forEach(variable => variable.pauseRuntimeEffects());
    }

    public resumeRuntimeEffects = (): void => {
        Object.values(this.globalVariableInstance).forEach(variable => variable.resumeRuntimeEffects());
    }

    public destroy = (): void => {
        Object.values(this.globalVariableInstance).forEach((item) => item.stop());
        this.globalVariableInstance = {};
    }
}

export default GlobalVariableManager;
