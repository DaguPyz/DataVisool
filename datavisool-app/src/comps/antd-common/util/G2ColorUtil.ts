/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {parseInt} from "lodash";

/**
 * G2Plot系列图表库颜色转换工具
 */
export default class G2ColorUtil {

    private static splitTopLevelComma(value: string) {
        const parts: string[] = [];
        let depth = 0;
        let start = 0;
        for (let i = 0; i < value.length; i += 1) {
            const char = value[i];
            if (char === '(') {
                depth += 1;
            } else if (char === ')') {
                depth = Math.max(0, depth - 1);
            } else if (char === ',' && depth === 0) {
                parts.push(value.substring(start, i).trim());
                start = i + 1;
            }
        }
        parts.push(value.substring(start).trim());
        return parts.filter(Boolean);
    }

    private static normalizeColor(color: string) {
        return color.trim().replace(/\s*,\s*/g, ',');
    }

    private static parseCssGradientStop(stop: string, index: number, total: number) {
        const trimmed = stop.trim();
        const fallbackPos = total <= 1 ? 0 : index / (total - 1);
        const match = trimmed.match(/^(.+?)\s+(-?\d+(?:\.\d+)?)%$/);
        if (!match) {
            return {
                color: this.normalizeColor(trimmed),
                pos: fallbackPos
            }
        }
        return {
            color: this.normalizeColor(match[1]),
            pos: Number(match[2]) / 100
        }
    }

    private static parseG2GradientStops(gradient: string) {
        const colorPairs: { pos: number; color: string }[] = [];
        const matches = Array.from(gradient.matchAll(/(?:^|\s)(-?\d+(?:\.\d+)?):/g));
        matches.forEach((match, index) => {
            const nextMatch = matches[index + 1];
            const start = (match.index || 0) + match[0].length;
            const end = nextMatch?.index ?? gradient.length;
            colorPairs.push({
                pos: Number(match[1]),
                color: gradient.substring(start, end).trim()
            });
        });
        return colorPairs;
    }

    private static isRadialGradientPrefix(value: string) {
        const normalizedValue = value.trim().toLowerCase();
        return normalizedValue === 'circle'
            || normalizedValue === 'ellipse'
            || normalizedValue.startsWith('circle ')
            || normalizedValue.startsWith('ellipse ')
            || normalizedValue.startsWith('at ')
            || normalizedValue.includes(' at ');
    }

    /**
     * 将css颜色转g2plot颜色，例：
     * linear-gradient(270deg, #ffffff 0%, #7ec2f3 50%, #1890ff 100%) => l(270) 0:#ffffff 0.5:#7ec2f3 1:#1890ff
     * radial-gradient(#ffffff 0%, #1890ff 100%) => r(0.5,0.5,1) 0:#ffffff 1:#1890ff
     * @param color
     */
    public static parseCssToG2Color(color: string) {
        if (color.startsWith('linear-gradient')) {
            //线性渐变
            return this.parseLinearGradientCssToG2(color);
        }
        if (color.startsWith('radial-gradient')) {
            //径向渐变
            return this.parseRadialGradientCssToG2(color);
        }
        return color;
    }

    /**
     * 将g2plot颜色转换为css颜色，例：
     * l(270) 0:#ffffff 0.5:#7ec2f3 1:#1890ff => linear-gradient(270deg, #ffffff 0%, #7ec2f3 50%, #1890ff 100%)
     * r(0.5,0.5,1) 0:#ffffff 1:#1890ff => radial-gradient(#ffffff 0%, #1890ff 100%)
     * @param color
     */
    public static parseG2ToCssColor(color: string) {
        if (color.startsWith('l(')) {
            return this.parseLinearGradientG2ToCss(color);
        }
        if (color.startsWith('r(')) {
            return this.parseRadialGradientG2ToCss(color);
        }
        return color;
    }

    /**
     * 将css渐变转换为antd渐变，例：linear-gradient(270deg, #ffffff 0%, #7ec2f3 50%, #1890ff 100%) => l(270) 0:#ffffff 0.5:#7ec2f3 1:#1890ff
     * @param gradient
     */
    public static parseLinearGradientCssToG2(gradient: string) {
        if (!gradient)
            return null;
        gradient = gradient.substring(gradient.indexOf('(') + 1, gradient.lastIndexOf(')'));
        //提取角度
        const angleMatch = gradient.match(/(\d+)deg/);
        const angle = angleMatch ? parseInt(angleMatch[1]) : 0;
        //替换掉角度值
        gradient = gradient.replace(/(\d+)deg,?/, '');

        const colorPairsStr = this.splitTopLevelComma(gradient.trim());
        const colorPairs = colorPairsStr.map((colorPair, index) => this.parseCssGradientStop(colorPair, index, colorPairsStr.length));
        return `l(${angle}) ${colorPairs?.map((colorPair) => `${colorPair.pos}:${colorPair.color}`).join(' ')}`
    }

    /**
     * 将g2线性渐变转换为css线性渐变，例：l(270) 0:#ffffff 0.5:#7ec2f3 1:#1890ff => linear-gradient(270deg, #ffffff 0%, #7ec2f3 50%, #1890ff 100%)
     * @param gradient
     */
    public static parseLinearGradientG2ToCss(gradient: string) {
        if (!gradient)
            return null;
        //提取角度
        const angleMatch = gradient.match(/l\((\d+)\)/);
        const angleValue = angleMatch ? parseInt(angleMatch[1]) : 0;
        const parsedColors = this.parseG2GradientStops(gradient.replace(/l\((\d+)\)/, '').trim());
        return `linear-gradient(${angleValue}deg,${parsedColors?.map((color) => `${color.color} ${color.pos * 100}%`).join(',')})`;
    }

    /**
     * 将g2径向渐变转换为css径向渐变，例：r(0.5, 0.5, 0.1) 0:#ffffff 1:#1890ff => radial-gradient(#ffffff 0%, #1890ff 100%)
     * @param gradient
     */
    public static parseRadialGradientG2ToCss(gradient: string) {
        if (!gradient)
            return null;
        gradient = gradient.substring(gradient.indexOf(')') + 1, gradient.length);
        const parsedColors = this.parseG2GradientStops(gradient.trim());
        return `radial-gradient(${parsedColors?.map((item) => `${item.color} ${item.pos * 100}%`)})`;
    }

    /**
     * 将css径向渐变转换为antd径向渐变 radial-gradient(#ffffff 0%, #1890ff 100%) => r(0.5, 0.5, 0.1) 0:#ffffff 1:#1890ff
     * @param gradient
     */
    public static parseRadialGradientCssToG2(gradient: string) {
        if (!gradient)
            return null;
        gradient = gradient.substring(gradient.indexOf('(') + 1, gradient.lastIndexOf(')'));
        const colorItemsStr = this.splitTopLevelComma(gradient)
            .filter((item, index) => index !== 0 || !this.isRadialGradientPrefix(item));
        const colorItems = colorItemsStr.map((item, index) => this.parseCssGradientStop(item, index, colorItemsStr.length));
        return `r(0.5,0.5,1) ${colorItems?.map((colorItem) => `${colorItem.pos}:${colorItem.color}`).join(' ')}`;
    }
}
