/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import * as React from 'react';
import {cn} from '@/lib/utils';
import {ControlValueType} from './types';
import {Control, DatavisoolGUIProps, SchemaPathNode, DatavisoolGUIUtil} from './schema';
import {UIMap} from './UIMap';
import {DataVisoolUIContext} from '../context/DataVisoolUIContext';

type TranslatableConfig = Record<string, any> | undefined;

export {DatavisoolGUIUtil, SchemaPathNode} from './schema';
export type {FieldChangeData, DatavisoolGUIProps} from './schema';

/**
 * Schema driven UI renderer.
 *
 * The control tree traversal intentionally follows the legacy renderer
 * implementation so schemaKeyPath, dataKeyPath, rules, and parent lookup stay
 * compatible with existing component configuration schemas.
 */
export class DatavisoolGUI extends React.Component<DatavisoolGUIProps> {
    public static contextType = DataVisoolUIContext;
    declare context: React.ContextType<typeof DataVisoolUIContext>;

    private getTranslate = () => this.props.translate ?? this.context.translate;

    private translateNode = <T, >(node: T): T => {
        if (typeof node === 'string')
            return ((this.getTranslate()?.(node) ?? node) as T);
        return node;
    };

    private translateConfig = (config?: TranslatableConfig): TranslatableConfig => {
        if (!config)
            return config;

        const nextConfig = {...config};
        if (typeof nextConfig.placeholder === 'string')
            nextConfig.placeholder = this.translateNode(nextConfig.placeholder);
        if (typeof nextConfig.children === 'string')
            nextConfig.children = this.translateNode(nextConfig.children);
        if (Array.isArray(nextConfig.options)) {
            nextConfig.options = nextConfig.options.map((option: any) => {
                if (!option || typeof option !== 'object')
                    return option;
                return {
                    ...option,
                    label: this.translateNode(option.label),
                    title: this.translateNode(option.title),
                };
            });
        }
        return nextConfig;
    };

    private createDataPath(control: Control, dataKeyPath: string[]) {
        if (!control.key)
            return dataKeyPath;

        if (control.key.includes('.'))
            dataKeyPath.push(...control.key.split('.'));
        else
            dataKeyPath.push(control.key);

        return dataKeyPath;
    }

    private onControlChange = (data: ControlValueType, schemaKeyPath: SchemaPathNode[], dataKeyPath: string[], reRender?: boolean, id?: string) => {
        this.props.onFieldChange?.({
            id,
            data,
            reRender,
            schemaKeyPath: [...schemaKeyPath],
            dataKeyPath,
            dataFragment: DatavisoolGUIUtil.createObjectFromArray(dataKeyPath, data),
        });
    };

    /**
     * Legacy rule parser:
     * - `{key}` resolves from siblings first, then ascends through parents.
     * - unresolved expressions are evaluated as-is to preserve direct JS rule
     *   support such as `"true" === "true"` or `${enabledRef.current}`.
     * TODO(legacy-compat): 迁移现有配置规则后，移除旧规则解析及直接执行表达式的兼容。
     */
    private analyzeRules = (rules: string, control: Control): boolean => {
        const regex = /{([^}]+)}/g;
        const variable: string[] = [];
        let match: RegExpExecArray | null;

        while ((match = regex.exec(rules)) !== null)
            variable.push(match[1]);

        const analyze = (currentControl: Control, currentVariable: string[], currentRules: string): string => {
            if (currentVariable.length === 0)
                return currentRules;

            const {parent} = currentControl;
            if (parent && 'children' in parent) {
                const {children} = parent;
                for (let index = 0; index < (children?.length ?? 0); index++) {
                    if (currentVariable.length === 0)
                        break;
                    const child = children![index];
                    const matchIndex = currentVariable.indexOf(child.key!);
                    if (child.key && matchIndex !== -1) {
                        currentRules = currentRules.replaceAll(`{${child.key}}`, `'${child.value}'`);
                        currentVariable.splice(matchIndex, 1);
                    }
                }
            }

            if (currentVariable.length > 0 && parent) {
                const matchIndex = currentVariable.indexOf(parent.key!);
                if (parent.key && parent.value && matchIndex !== -1) {
                    currentRules = currentRules.replace(`{${parent.key}}`, `'${parent.value}'`);
                    currentVariable.splice(matchIndex, 1);
                }
                if (currentVariable.length > 0)
                    return analyze(parent, currentVariable, currentRules);
            }

            return currentRules;
        };

        try {
            // Preserve legacy support for JavaScript expressions in rules.
            // eslint-disable-next-line no-eval
            return Boolean(eval(analyze(control, variable, rules)));
        } catch {
            return false;
        }
    };

    private buildControlProps(control: Control, schemaKeyPath: SchemaPathNode[], dataKeyPath: string[]) {
        const {config, value, id, reRender, label, tip} = control;
        const controlValue = reRender ? {value} : {defaultValue: value};

        return {
            ...this.translateConfig(config),
            ...controlValue,
            ...(control.type === 'control-group' ? {translate: this.getTranslate()} : {}),
            label: this.translateNode(label),
            tip: this.translateNode(tip),
            onChange: (data: ControlValueType) => this.onControlChange(data, schemaKeyPath, dataKeyPath, reRender, id),
        };
    }

    private buildConfigUI = (control: Control, schemaKeyPath: SchemaPathNode[], dataKeyPath: string[], childIndex: number): React.ReactNode[] => {
        const nodes: React.ReactNode[] = [];
        if (!control)
            return nodes;

        if ('children' in control && control.children) {
            const tempNodes: React.ReactNode[] = [];
            const childLevel = new SchemaPathNode('children');
            const {type, rules} = control;

            if (rules && !this.analyzeRules(rules, control))
                return nodes;

            schemaKeyPath.push(childLevel);
            this.createDataPath(control, dataKeyPath);

            control.children.forEach((child: Control, index: number) => {
                childLevel.index = index;
                child.parent = control;
                tempNodes.push(this.buildConfigUI(child, JSON.parse(JSON.stringify(schemaKeyPath)), [...dataKeyPath], index));
            });

            if (!type) {
                nodes.push([...tempNodes]);
                return nodes;
            }

            const Component = UIMap.get(type);
            if (!Component) {
                nodes.push([...tempNodes]);
                return nodes;
            }

            schemaKeyPath.pop();
            schemaKeyPath.push(new SchemaPathNode('value'));
            nodes.push(
                <Component key={childIndex} {...this.buildControlProps(control, schemaKeyPath, dataKeyPath)}>
                    {tempNodes}
                </Component>,
            );
            return nodes;
        }

        const {type, rules} = control;
        if (!type)
            return nodes;
        if (rules && !this.analyzeRules(rules, control))
            return nodes;

        const Component = UIMap.get(type);
        if (!Component)
            return nodes;

        schemaKeyPath.push(new SchemaPathNode('value'));
        this.createDataPath(control, dataKeyPath);

        nodes.push(<Component key={childIndex} {...this.buildControlProps(control, schemaKeyPath, dataKeyPath)}/>);
        return nodes;
    };

    private init = (): React.ReactNode[] => {
        const nodes: React.ReactNode[] = [];
        const schemaList = Array.isArray(this.props.schema) ? this.props.schema : [this.props.schema];

        schemaList.forEach((control: Control, index: number) => {
            nodes.push(this.buildConfigUI(control, [], [], index));
        });

        return nodes;
    };

    public render() {
        const nodes = this.init();
        const contextValue = this.props.translate
            ? {...this.context, translate: this.props.translate}
            : this.context;

        return (
            <DataVisoolUIContext.Provider value={contextValue}>
                <div className={cn('datavisool-gui', this.props.className)} style={this.props.containerStyle ?? this.props.style}>
                    {nodes.length > 0 ? nodes : (
                        this.props.emptyText ? <div className="datavisool-gui-empty">{this.props.emptyText}</div> : null
                    )}
                </div>
            </DataVisoolUIContext.Provider>
        );
    }
}
