/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {useMemo} from 'react';
import type {CSSProperties} from 'react';
import type {IThemeItem, ThemeColors} from '@datavisool/sdk/types';
import ThemePreviewCharts from './ThemePreviewCharts.tsx';
import './ThemePreview.less';

interface ThemePreviewProps {
    theme?: IThemeItem;
}

// 仅供示例渲染兜底，不补写或修改项目中的主题数据。
const defaultColors: Required<ThemeColors> = {
    main: '#00dfff',
    mainText: '#62edff',
    subText: '#4ca4b1',
    background: '#00dfff33',
    supplementFirst: '#38929f',
    supplementSecond: '#1790a2',
};

const colorLabels: Array<{key: keyof ThemeColors; label: string}> = [
    {key: 'main', label: '主体色'},
    {key: 'mainText', label: '主文字'},
    {key: 'subText', label: '副文字'},
    {key: 'background', label: '背景色'},
    {key: 'supplementFirst', label: '辅助色 1'},
    {key: 'supplementSecond', label: '辅助色 2'},
];

const metrics = [
    {value: '24,680', label: '访问量'},
    {value: '1,286', label: '新增用户'},
    {value: '98.6%', label: '完成率'},
];

const ThemePreview = ({theme}: ThemePreviewProps) => {
    const {main, mainText, subText, background, supplementFirst, supplementSecond} = theme?.colors ?? {};
    const colors = useMemo<Required<ThemeColors>>(() => ({
        main: main || defaultColors.main,
        mainText: mainText || defaultColors.mainText,
        subText: subText || defaultColors.subText,
        background: background || defaultColors.background,
        supplementFirst: supplementFirst || defaultColors.supplementFirst,
        supplementSecond: supplementSecond || defaultColors.supplementSecond,
    }), [main, mainText, subText, background, supplementFirst, supplementSecond]);

    const previewStyle = {
        '--preview-main': colors.main,
        '--preview-text': colors.mainText,
        '--preview-secondary': colors.subText,
        '--preview-background': colors.background,
    } as CSSProperties;

    return (
        <section className="datavisool-theme-preview" aria-label="主题效果预览">
            <div className="theme-preview-heading">
                <h3>效果预览</h3>
                <p title={theme?.name}>{theme?.name || '默认配色'}</p>
            </div>
            <div className="theme-preview-dashboard" style={previewStyle}>
                <h4 className="theme-preview-board-title">数据概览</h4>
                <div className="theme-preview-metrics">
                    {metrics.map(({value, label}) => (
                        <div className="theme-preview-metric" key={label}>
                            <strong>{value}</strong>
                            <span>{label}</span>
                        </div>
                    ))}
                </div>
                <ThemePreviewCharts colors={colors}/>
            </div>
            <div className="theme-preview-palette" aria-label="主题配色">
                {colorLabels.map(({key, label}) => (
                    <div className="theme-preview-color" key={key}>
                        <div className="theme-preview-swatch" style={{background: colors[key]}}/>
                        <span>{label}</span>
                        <code title={colors[key]}>{colors[key].toUpperCase()}</code>
                    </div>
                ))}
            </div>
            <p className="theme-preview-note">示例组件，仅展示配色效果。</p>
        </section>
    );
};

export default ThemePreview;
