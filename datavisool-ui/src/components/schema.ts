/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import {CSSProperties, ReactNode} from 'react';
import {ControlValueType} from './types';

export interface BaseSchemaType {
    id?: string;
    key?: string;
    label?: string;
    tip?: ReactNode;
    value?: ControlValueType;
    rules?: string;
    reRender?: boolean;
    children?: Control[];
    parent?: Control;
}

export interface Control extends BaseSchemaType {
    type?: string;
    config?: Record<string, any>;
}

export class SchemaPathNode {
    constructor(key: string, index?: number) {
        this.key = key;
        this.index = index;
    }
    key = '';
    index?: number = 0;
}

export interface FieldChangeData {
    id?: string;
    data: ControlValueType;
    reRender?: boolean;
    schemaKeyPath: SchemaPathNode[];
    dataKeyPath: string[];
    dataFragment: object;
}

export interface DatavisoolGUIProps {
    schema: Control | Control[];
    translate?: (text: string) => string;
    onFieldChange?: (fieldChangeData: FieldChangeData) => void;
    className?: string;
    style?: CSSProperties;
    containerStyle?: CSSProperties;
    emptyText?: ReactNode;
}

export class DatavisoolGUIUtil {
    public static updateSchema(oldSchema: Control, path: SchemaPathNode[], value: ControlValueType) {
        const currentNode = path.shift();
        if (!currentNode)
            return;
        const {key, index} = currentNode;
        const target = oldSchema as Record<string, any>;
        if (key in target) {
            if (path.length === 0) {
                oldSchema.value = value;
            } else if (index !== undefined) {
                this.updateSchema(target[key][index], path, value);
            } else {
                this.updateSchema(target[key], path, value);
            }
        }
    }

    public static createObjectFromArray(keyPath: string[], value: ControlValueType): object {
        const result: Record<string, any> = {};
        let current = result;
        keyPath.forEach((key, index) => {
            current[key] = index === keyPath.length - 1 ? value : {};
            current = current[key];
        });
        return result;
    }

    public static schemaStructureAssignment(data: object, template: Control): Control {
        Object.entries(data).forEach(([key, entryValue]) => {
            if (typeof entryValue !== 'object' || entryValue === null) {
                if (template.key === key) {
                    template.value = entryValue as ControlValueType;
                } else {
                    template.children?.forEach((child) => DatavisoolGUIUtil.schemaStructureAssignment({[key]: entryValue}, child));
                }
            } else {
                const childTemplate = DatavisoolGUIUtil.findChildSchemaByKey(key, template);
                if (childTemplate)
                    DatavisoolGUIUtil.schemaStructureAssignment(entryValue, childTemplate);
            }
        });
        return template;
    }

    public static findChildSchemaByKey(key: string, template: Control): Control {
        if (template.key === key)
            return template;
        for (const child of template.children ?? []) {
            const result = this.findChildSchemaByKey(key, child);
            if (result.key)
                return result;
        }
        return {};
    }

    public static parseSchemaData(schema: Control): object {
        if (schema.children) {
            const data = schema.children.reduce((result, child) => ({...result, ...DatavisoolGUIUtil.parseSchemaData(child)}), {});
            return schema.key ? {[schema.key]: data} : data;
        }
        return schema.key ? {[schema.key]: schema.value ?? undefined} : {};
    }
}
