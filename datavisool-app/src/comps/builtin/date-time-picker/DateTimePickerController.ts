/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import DateTimePickerComponent, {DateTimePickerComponentProps, DateTimePickerComponentRef} from "./DateTimePickerComponent.tsx";
import type {UpdateOptions} from "@datavisool/sdk/types";
import AbstractDesignerController from "../../../framework/core/AbstractDesignerController";
import ComponentUtil from "@/util/ComponentUtil.ts";
import {ObjectUtil} from "@datavisool/sdk";
import BPExecutor from "../../../designer/blueprint/core/BPExecutor";
import {IThemeItem} from "@datavisool/sdk/types";

export class DateTimePickerController extends AbstractDesignerController<DateTimePickerComponentRef, DateTimePickerComponentProps> {

    async create(container: HTMLElement, config: DateTimePickerComponentProps, bpExecutor: BPExecutor, index?: number): Promise<void> {
        await super.create(container, config, bpExecutor, index);
        this.instance = await ComponentUtil.createAndRender<DateTimePickerComponentRef>(container, DateTimePickerComponent, config);
    }

    destroy(): void {
        this.instance = null;
        this.config = null;
        super.destroy();
    }

    changeData(data: any) {
        if (this.config?.data?.value !== undefined)
            this.config.data.value = data;
        this.instance?.setValue(data);
    }

    getConfig(): DateTimePickerComponentProps | null {
        return this.config;
    }

    update(config: DateTimePickerComponentProps, upOp?: UpdateOptions | undefined): void {
        this.config = ObjectUtil.merge(this.config, config);
        upOp = upOp || {reRender: true};
        if (upOp.reRender)
            this.instance?.updateConfig(this.config!);
    }

    registerEvent() {
        if (this.instance) {
            const nodeId = this.config?.base?.id ?? "";
            const executor = this.bpExecutor;
            this.instance.setEventHandler({
                open: () => executor?.triggerComponentEvent(nodeId!, "open", this.config, this.index),
                close: () => executor?.triggerComponentEvent(nodeId!, "close", this.config, this.index),
                change: (value: string | [string, string]) => executor?.triggerComponentEvent(nodeId!, "change", value, this.index),
                ok: (value: string) => executor?.triggerComponentEvent(nodeId!, "ok", value, this.index),
                valueChange: (value: string | [string, string]) => executor?.triggerComponentEvent(nodeId!, "valueChange", value, this.index),
                confirm: (value: string | [string, string]) => executor?.triggerComponentEvent(nodeId!, "confirm", value, this.index),
            });
        }
    }

    updateTheme(newTheme: IThemeItem) {
        if (!newTheme || !this.config?.style) return;

        const styleConfig = this.config.style;
        const {colors: {main, supplementFirst, supplementSecond, background, mainText,}} = newTheme;

        /** =====================
         * token 区域
         * ===================== */
        if (styleConfig?.token) {
            const token = styleConfig.token;

            token.colorTextHeading = mainText ?? '#FFFFFF';
            token.colorPrimary = main ?? '#4FB8FF';
            token.colorSplit = supplementFirst ?? '#3A3A4E';
            token.colorText = mainText ?? '#FFFFFF';
            token.colorBorder = supplementFirst ?? '#3A3A4E';
            token.colorBgContainerDisabled = background ?? '#2C2C3E';
            token.colorTextPlaceholder = supplementSecond ?? '#A0A0B2';
            token.colorIcon = supplementSecond ?? '#A0A0B2';
            token.colorIconHover = mainText ?? '#FFFFFF';
            token.colorBgElevated = background ?? '#2C2C3E';
        }

        /** =====================
         * components 区域
         * ===================== */
        if (styleConfig?.components) {
            const comp = styleConfig.components;
            comp.colorBgContainer = background ?? '#2C2C3E';
            comp.colorBorder = supplementFirst ?? '#3A3A4E';
            comp.colorText = mainText ?? '#FFFFFF';
            comp.colorPrimary = main ?? '#4FB8FF';
            comp.colorTextHeading = mainText ?? '#FFFFFF';
            comp.colorSplit = supplementFirst ?? '#3A3A4E';
            comp.hoverBorderColor = main ?? '#4FB8FF';
            comp.activeBorderColor = supplementFirst ?? '#3CED92';
            comp.hoverBg = supplementSecond ?? '#323247';
            comp.activeBg = supplementFirst ?? '#282839';
            comp.activeShadow = `0 0 0 2px rgba(79, 184, 255, 0.2)`;
            comp.cellActiveWithRangeBg = main ?? '#4FB8FF';
            comp.cellHoverBg = supplementSecond ?? '#323247';
            comp.cellHoverWithRangeBg = supplementFirst ?? '#3CED92';
        }

        // 统一触发更新
        this.update({style: styleConfig}, {reRender: true});
    }

}