/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

export default class ColorUtil {

    public static colorConversion(color: string) {
        if (color.length >= 4 && color.length <= 9 && color[0] === '#') {
            const rgba = ColorUtil.hexToRgba(color, 1);
            return {hex: color, rgba: rgba};
        } else if (color.includes('rgb')) {
            const hex = ColorUtil.rgbaToHex(color);
            return {hex: hex, rgba: color};
        } else {
            console.warn('color is not valid', color);
            return {hex: '#000000', rgba: 'rgba(0,0,0,1)'};
        }
    }

    public static hexToRgba(hex: string, alpha: number) {
        // 去掉颜色值中的 # 符号
        hex = hex.replace('#', '');
        // 计算 RGB 值
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        // 返回 RGBA 值
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    public static rgbaToHex(rgba: string) {
        const parts = rgba.substring(rgba.indexOf('(')).split(',');
        const r = parseInt(parts[0].substring(1).trim());
        const g = parseInt(parts[1].trim());
        const b = parseInt(parts[2].trim());
        const a = parseFloat(parts[3] ? parts[3].substring(0, parts[3].length - 1).trim() : '1');

        const rr = r.toString(16).length === 1 ? "0" + r.toString(16) : r.toString(16);
        const gg = g.toString(16).length === 1 ? "0" + g.toString(16) : g.toString(16);
        const bb = b.toString(16).length === 1 ? "0" + b.toString(16) : b.toString(16);

        const aa = Math.round(a * 255).toString(16).length === 1 ? "0" + Math.round(a * 255).toString(16) : Math.round(a * 255).toString(16);
        return "#" + rr + gg + bb + aa;
    }

    /**
     * 解析线性渐变颜色值数据
     * 注：本解析函数仅适用于
     * linear-gradient(90deg, #b66666 0%, #10a9ea 36%, #ea1010 78%, #000 100%)
     * linear-gradient(90deg, rgba(182,102,102,1) 0%, rgba(16,169,234,1) 36%, rgba(234,16,16,1) 78%, rgba(0,0,0,1) 100%)
     * 这特定的两种场景，对于其他形式的线性渐变，本函数不保证完全解析
     * @param gradient
     */
    public static parseLinerGradient(gradient: string) {
        if (!gradient || gradient.indexOf('linear-gradient') === -1)
            return null;
        // 提取角度
        const angle = gradient.match(/-?\d+deg/);
        const angleValue = angle ? parseInt(angle[0]) : 0;

        //截取颜色值列表
        const colorStr = gradient.substring(gradient.indexOf('(') + 1, gradient.lastIndexOf(')'));
        //替换角度值 "90deg,#016eb7 0%,#00000000 85%"
        const gradientWithoutAngle = colorStr.replace(/\d+deg,\s*/, '');
        const colorItems = gradientWithoutAngle.split(',');
        const posArr: number[] = [];
        const colorArr: string[] = [];
        colorItems.forEach((item) => {
            const radialItem = item.trim().split(/\s+/g);
            const color = radialItem[0];
            const pos = parseFloat(radialItem[1]);
            posArr.push(pos);
            colorArr.push(color);
        });
        return {mode: 'linear', angle: angleValue, rawValue: gradient, posArr, colorArr};
    }

    /**
     * 解析径向渐变颜色值数据
     * 注：本解析函数仅适用于
     * radial-gradient(#ffffffc9 4%, #000 100%)
     * radial-gradient(rgba(255,255,255,0.79) 4%, rgba(0,0,0,0.79) 100%)
     * 这特定的两种场景，对于其他形式的径向渐变，本函数不保证完全解析
     * @param gradient
     */
    public static parseRadialGradient(gradient: string) {
        if (!gradient || gradient.indexOf('radial-gradient') === -1)
            return null;
        gradient = gradient.substring(gradient.indexOf('(') + 1, gradient.lastIndexOf(')'));
        const colorItems = gradient.split(',');
        const posArr: number[] = [];
        const colorArr: string[] = [];
        colorItems.forEach((item) => {
            const radialItem = item.trim().split(/\s+/g);
            const pos = parseFloat(radialItem[1]);
            const color = radialItem[0];
            posArr.push(pos);
            colorArr.push(color);
        });
        return {mode: 'radial', rawValue: gradient, posArr, colorArr};
    }

}
