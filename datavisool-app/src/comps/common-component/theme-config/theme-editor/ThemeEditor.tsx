/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import {MouseEvent, useState} from 'react';
import './ThemeEditor.less';
import ThemeList from "@/comps/common-component/theme-config/theme-list/ThemeList";
import {cloneDeep} from "lodash";
import {IThemeItem} from "@datavisool/sdk/types";
import {globalMessage, Button, Card, ColorPicker, Input} from "@datavisool/ui";
import {Check, ColorFilter, Edit, PreviewOpen, Theme} from "@icon-park/react";
import {IdGenerate} from "@datavisool/sdk";

const defaultThemeConfig: IThemeItem = {
    id: '',
    name: '',
    colors: {
        main: '#4FB8FF',        // 主色调 - 科技蓝
        mainText: '#FFFFFF',    // 主要文字 - 纯白
        background: '#1E1E2F',  // 背景色 - 深空蓝黑
        subText: '#A0A0B2',     // 辅助文字 - 浅灰蓝
        supplementFirst: '#3CED92', // 辅助色1 - 活力绿
        supplementSecond: '#FF6E6E' // 辅助色2 - 警示红
    }
};

type ThemeColorKey = keyof typeof defaultThemeConfig.colors;

const colorFields: Array<{ key: ThemeColorKey; label: string; desc: string }> = [
    {key: 'main', label: '主体色', desc: 'Primary'},
    {key: 'mainText', label: '主文字', desc: 'Main text'},
    {key: 'subText', label: '副文字', desc: 'Sub text'},
    {key: 'background', label: '背景色', desc: 'Background'},
    {key: 'supplementFirst', label: '辅助色 1', desc: 'Accent 1'},
    {key: 'supplementSecond', label: '辅助色 2', desc: 'Accent 2'},
];

const ThemeEditor = () => {
    const {themeManager} = window.DATAVISOOL_ENV.currentManager;
    const [themeList, setThemeList] = useState<IThemeItem[]>(cloneDeep(themeManager?.themeConfig) || []);
    const [themeConfig, setThemeConfig] = useState<IThemeItem>(cloneDeep(defaultThemeConfig));
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [listRevision, setListRevision] = useState(0);

    const doSaveOrUpd = (e: MouseEvent<HTMLElement> | undefined) => {
        e?.preventDefault();
        const name = themeConfig.name.trim();
        if (!name) {
            globalMessage.messageApi?.warning('请输入主题名称');
            return;
        }
        if (themeList.some((item, index) => index !== editingIndex && item.name.trim() === name)) {
            globalMessage.messageApi?.warning('主题名称不能重复');
            return;
        }
        let nextThemes: IThemeItem[];
        if (editingIndex === null) {
            if (themeList.length >= 20) {
                globalMessage.messageApi?.warning('主题数量不能超过20');
                return;
            }
            let id: string;
            do { id = IdGenerate.generateId(); } while (themeList.some(item => item.id === id));
            nextThemes = [...themeList, {...cloneDeep(themeConfig), id, name}];
        } else {
            if (!themeList[editingIndex]) return;
            nextThemes = themeList.map((item, i) => i === editingIndex ? {...cloneDeep(themeConfig), name} : item);
        }
        setThemeList(nextThemes)
        setThemeConfig(cloneDeep(defaultThemeConfig));
        setEditingIndex(null);
        setListRevision(value => value + 1);
        //保存到数据库
        const {updateThemeConfig} = window.DATAVISOOL_ENV.currentManager.themeManager!;
        updateThemeConfig(nextThemes);
    }

    const onDel = (_id: string, index: number) => {
        const newData = themeList.filter((_, i) => i !== index);
        setThemeList(newData);
        if (editingIndex === index) {
            setEditingIndex(null);
            setThemeConfig(cloneDeep(defaultThemeConfig));
        } else if (editingIndex !== null && editingIndex > index) setEditingIndex(editingIndex - 1);
    }

    const onSelected = (data: IThemeItem, index: number) => {
        if (editingIndex === index) {
            setThemeConfig(cloneDeep(defaultThemeConfig));
            setEditingIndex(null);
        } else {
            setThemeConfig(data);
            setEditingIndex(index);
        }
    }

    const handleColorChange = (color: string, colorKey: keyof typeof themeConfig.colors) => {
        setThemeConfig(prev => ({
            ...prev,
            colors: {
                ...prev.colors,
                [colorKey]: color
            }
        }));
    }

    const handleNameChange = (name: string) => {
        setThemeConfig(prev => ({...prev, name}));
    }

    return (
        <div className={'datavisool-theme-editor'}>
            <div className={'editor-left'}>
                <Card
                    title={(
                        <span className="theme-editor-card-title">
                            <Edit theme="outline" size={20} strokeWidth={1.75} fill="currentColor"/>
                            <span>主题信息</span>
                        </span>
                    )}
                    className="theme-info-card"
                >
                    <label className="theme-name-field">
                        <span>主题名称</span>
                        <Input
                            value={themeConfig.name}
                            onChange={handleNameChange}
                            placeholder="请输入主题名称"
                            allowClear
                            controlClassName="theme-name-input"
                        />
                    </label>
                </Card>

                <Card
                    title={(
                        <span className="theme-editor-card-title">
                            <ColorFilter theme="outline" size={20} strokeWidth={1.75} fill="currentColor"/>
                            <span>颜色定义</span>
                        </span>
                    )}
                    className="color-definition-card"
                >
                    <div className="color-grid">
                        {colorFields.map((field) => (
                            <div className="color-item" key={field.key}>
                                <div className="color-label-row">
                                    <span className="color-label">{field.label}</span>
                                    <small>{field.desc}</small>
                                </div>
                                {/* 取色器以内部初始值显示颜色，按主题身份刷新显示。 */}
                                <ColorPicker
                                    key={`${themeConfig.id}:${themeConfig.name}:${field.key}`}
                                    value={themeConfig.colors[field.key]}
                                    defaultValue={themeConfig.colors[field.key]}
                                    onChange={(color) => handleColorChange(color, field.key)}
                                    modes={['single']}
                                    showText
                                    controlClassName="theme-color-picker"
                                />
                            </div>
                        ))}
                    </div>
                </Card>

                <p className="theme-description">
                    建议保持配色风格一致，并确保文字与背景有足够对比。
                </p>

                <div className={'theme-operate-btn'}>
                    <Button
                        type="primary"
                        onClick={doSaveOrUpd}
                        block
                        className="btn-save-theme"
                        icon={<Check theme="outline" size={16} strokeWidth={1.75} fill="currentColor"/>}
                    >
                        添加 / 更新
                    </Button>
                </div>
            </div>

            <div className={'editor-right'}>
                <Card
                    title={(
                        <span className="theme-editor-card-title">
                            <PreviewOpen theme="outline" size={20} strokeWidth={1.75} fill="currentColor"/>
                            <span>配色预览</span>
                        </span>
                    )}
                    className="theme-preview-card"
                >
                    <div
                        className="theme-preview-sample"
                        aria-label="当前主题效果"
                        style={{background: themeConfig.colors.background, color: themeConfig.colors.mainText}}
                    >
                        <strong title={themeConfig.name || '未命名主题'}>{themeConfig.name || '未命名主题'}</strong>
                        <p style={{color: themeConfig.colors.subText}}>副文字与背景配色效果</p>
                        <div className="theme-preview-accents" aria-label="主体色与辅助色">
                            {(['main', 'supplementFirst', 'supplementSecond'] as const).map((key) => (
                                <span key={key} style={{background: themeConfig.colors[key]}}/>
                            ))}
                        </div>
                    </div>
                    <div className="theme-preview-swatches" aria-label="当前主题配色">
                        {colorFields.map((field) => (
                            <div className="theme-preview-color" key={field.key} title={`${field.label}：${themeConfig.colors[field.key] || '未设置'}`}>
                                <span style={{background: themeConfig.colors[field.key]}}/>
                                <small>{field.label}</small>
                            </div>
                        ))}
                    </div>
                </Card>

                <Card
                    title={(
                        <span className="theme-editor-card-title">
                            <Theme theme="outline" size={20} strokeWidth={1.75} fill="currentColor"/>
                            <span>主题列表</span>
                        </span>
                    )}
                    extra={<span className="theme-count-badge">{themeList.length}/20</span>}
                    className="theme-list-card"
                >
                    <div className="theme-list-scroll">
                        <ThemeList key={listRevision} showOperator={true} onSelected={onSelected} onDel={onDel}/>
                        {themeList.length === 0 && (
                            <div className="theme-list-empty" role="status">
                                <span>暂无主题</span>
                                <small>设置名称和颜色后添加主题</small>
                            </div>
                        )}
                    </div>
                </Card>
            </div>
        </div>
    );
}

export default ThemeEditor;
