/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {useEffect, useRef} from 'react';
import {init} from 'echarts';
import type {EChartsType, EChartsOption} from 'echarts';
import type {ThemeColors} from '@datavisool/sdk/types';

interface ThemePreviewChartsProps {
    colors: Required<ThemeColors>;
}

const sources = [
    {name: '直接访问', value: 42},
    {name: '搜索引擎', value: 28},
    {name: '社交媒体', value: 18},
    {name: '其他', value: 12},
];
const sourceColorKeys = ['main', 'supplementSecond', 'supplementFirst', 'mainText'] as const;

const ThemePreviewCharts = ({colors}: ThemePreviewChartsProps) => {
    const trendElement = useRef<HTMLDivElement>(null);
    const sourceElement = useRef<HTMLDivElement>(null);
    const chartInstances = useRef<EChartsType[]>([]);
    const sourceColors = sourceColorKeys.map(key => colors[key]);

    useEffect(() => {
        if (!trendElement.current || !sourceElement.current)
            return;

        // 独立图表实例，不注册设计器组件、数据源或真实图层。
        const charts = [init(trendElement.current), init(sourceElement.current)];
        chartInstances.current = charts;
        let resizeFrame: number | undefined;
        let disposed = false;
        const observer = new ResizeObserver(() => {
            if (disposed)
                return;
            if (resizeFrame !== undefined)
                cancelAnimationFrame(resizeFrame);
            resizeFrame = requestAnimationFrame(() => {
                resizeFrame = undefined;
                if (!disposed)
                    charts.forEach(chart => chart.resize());
            });
        });
        observer.observe(trendElement.current);
        observer.observe(sourceElement.current);

        return () => {
            disposed = true;
            observer.disconnect();
            if (resizeFrame !== undefined)
                cancelAnimationFrame(resizeFrame);
            charts.forEach(chart => chart.dispose());
            chartInstances.current = [];
        };
    }, []);

    useEffect(() => {
        const [trend, source] = chartInstances.current;
        if (!trend || !source)
            return;

        const trendOption: EChartsOption = {
            animation: false,
            grid: {left: 40, right: 8, top: 16, bottom: 28},
            xAxis: {
                type: 'category',
                boundaryGap: false,
                data: ['01', '04', '07', '10', '14', '18', '21', '24', '28'],
                axisLabel: {color: colors.mainText, fontSize: 10, interval: 1},
                axisLine: {lineStyle: {color: colors.supplementFirst}},
                axisTick: {show: false},
            },
            yAxis: {
                type: 'value',
                min: 0,
                max: 8000,
                interval: 2000,
                axisLabel: {color: colors.mainText, fontSize: 10},
                splitLine: {lineStyle: {color: colors.subText, opacity: 0.18}},
            },
            series: [{
                type: 'line',
                data: [400, 2100, 2800, 2300, 4100, 3700, 4800, 6000, 7600],
                smooth: true,
                symbol: 'circle',
                symbolSize: 5,
                lineStyle: {color: colors.main, width: 2},
                itemStyle: {color: colors.main, borderColor: colors.mainText, borderWidth: 1},
                areaStyle: {color: colors.main, opacity: 0.12},
                silent: true,
            }],
        };

        const sourceOption: EChartsOption = {
            animation: false,
            title: [
                {text: '总计', left: 'center', top: '38%', textStyle: {color: colors.mainText, fontSize: 11, fontWeight: 400}},
                {text: '24,680', left: 'center', top: '51%', textStyle: {color: colors.mainText, fontSize: 16, fontWeight: 600}},
            ],
            series: [{
                type: 'pie',
                radius: ['65%', '88%'],
                center: ['50%', '50%'],
                label: {show: false},
                labelLine: {show: false},
                itemStyle: {borderColor: colors.background, borderWidth: 1},
                data: sources.map((source, index) => ({...source, itemStyle: {color: colors[sourceColorKeys[index]]}})),
                silent: true,
            }],
        };
        trend.setOption(trendOption, {notMerge: true});
        source.setOption(sourceOption, {notMerge: true});
    }, [colors]);

    return (
        <div className="theme-preview-charts">
            <div className="theme-preview-trend">
                <h4>访问趋势</h4>
                <div ref={trendElement} className="theme-preview-line-chart" role="img" aria-label="示例访问趋势折线图"/>
            </div>
            <div className="theme-preview-sources">
                <h4>来源分布</h4>
                <div className="theme-preview-source-content">
                    <div ref={sourceElement} className="theme-preview-pie-chart" role="img" aria-label="示例来源分布环形图"/>
                    <ul className="theme-preview-legend">
                        {sources.map((source, index) => (
                            <li key={source.name}>
                                <i style={{backgroundColor: sourceColors[index]}}/>
                                <span>{source.name}</span>
                                <span>{source.value}%</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default ThemePreviewCharts;
