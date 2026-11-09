/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {CSSProperties, ReactNode, useEffect, useRef, useState} from 'react'
import {debounce} from "lodash";
import './ScreenFit.less';
import {AdaptationType} from '@datavisool/sdk/types';

interface ScreenFitProps {
    children?: ReactNode
    width: number | string
    height: number | string,
    bodyOverflowHidden?: boolean
    delay?: number
    mode?: AdaptationType
    scaleChange?: (xScale: number, yScale: number) => void
}

const screenFitStyleMap: Record<string, CSSProperties> = {
    'scale': {overflow: 'hidden'},
    'full-screen': {overflow: 'hidden'},
    'full-x': {overflow: 'hidden scroll'},
    'full-y': {overflow: 'scroll hidden'}
}

export default function ScreenFit(props: ScreenFitProps) {
    const {width, height, bodyOverflowHidden = true, delay = 200, scaleChange} = props
    let bodyOverflow: string
    const elRef = useRef<HTMLDivElement>(null)
    const [size, setSize] = useState({width, height, originalHeight: 0, originalWidth: 0})

    let observer: MutationObserver;

    function updateSize() {
        if (size.width && size.height) {
            elRef.current!.style.width = `${size.width}px`
            elRef.current!.style.height = `${size.height}px`
        } else {
            elRef.current!.style.width = `${size.originalWidth}px`
            elRef.current!.style.height = ` ${size.originalHeight}px`
        }
    }

    function updateScale() {
        // 获取真实视口尺寸
        const currentWidth = document.body.clientWidth
        const currentHeight = document.body.clientHeight
        // 获取大屏最终的宽高
        const realWidth = size.width || size.originalWidth
        const realHeight = size.height || size.originalHeight
        // 计算缩放比例
        const widthScale = currentWidth / +realWidth
        const heightScale = currentHeight / +realHeight

        let scale, domWidth, domHeight, mx, my;
        switch (props.mode) {
            case 'full-screen':
                // 若要铺满全屏，则按照各自比例缩放
                elRef.current!.style.transform = `scale(${widthScale},${heightScale})`
                scaleChange && scaleChange(widthScale, heightScale)
                break;
            case 'full-x': {
                // 宽度铺满，高度按相同比例缩放（保持宽高比）
                elRef.current!.style.transform = `scale(${widthScale}, ${widthScale})`
                elRef.current!.style.transformOrigin = 'left top'
                elRef.current!.style.margin = '0'

                // 关键修复：计算缩放后的实际显示高度
                const scaledHeight = +realHeight * widthScale

                // 使用 padding-bottom 撑开父容器，消除 transform 导致的布局空白
                // padding-bottom 会被计入布局高度，解决滚动条问题
                const heightDiff = +realHeight - scaledHeight
                if (heightDiff > 0) {
                    // 需要减去差值，因为 transform 缩小后占用空间变小了
                    elRef.current!.style.paddingBottom = `0px`
                    elRef.current!.style.marginBottom = `-${heightDiff}px`
                } else {
                    elRef.current!.style.paddingBottom = `0px`
                    elRef.current!.style.marginBottom = `0px`
                }

                scaleChange && scaleChange(widthScale, widthScale)
                break;
            }
            case 'full-y': {
                // 高度铺满，宽度按相同比例缩放（保持宽高比）
                elRef.current!.style.transform = `scale(${heightScale}, ${heightScale})`
                elRef.current!.style.transformOrigin = 'left top'
                elRef.current!.style.margin = '0'

                // 同样的逻辑应用到宽度
                const scaledWidth = +realWidth * heightScale
                const widthDiff = +realWidth - scaledWidth
                if (widthDiff > 0) {
                    elRef.current!.style.paddingRight = `0px`
                    elRef.current!.style.marginRight = `-${widthDiff}px`
                } else {
                    elRef.current!.style.paddingRight = `0px`
                    elRef.current!.style.marginRight = `0px`
                }

                scaleChange && scaleChange(heightScale, heightScale)
                break;
            }
            default:
                // 按照宽高最小比例进行缩放
                scale = Math.min(widthScale, heightScale)
                elRef.current!.style.transform = `scale(${scale},${scale})`;
                domWidth = elRef.current!.clientWidth
                domHeight = elRef.current!.clientHeight
                mx = Math.max((currentWidth - domWidth * scale) / 2, 0)
                my = Math.max((currentHeight - domHeight * scale) / 2, 0)
                elRef.current!.style.margin = `${my}px ${mx}px`
                elRef.current!.style.marginBottom = `${my}px`
                scaleChange && scaleChange(scale, scale)
                break;
        }
    }

    const onResize = debounce(() => {
        if (!elRef.current) return;
        updateSize()
        updateScale()
    }, delay)

    function initState() {
        if (bodyOverflowHidden) {
            bodyOverflow = document.body.style.overflow
            document.body.style.overflow = 'hidden'
        }
        observer = new MutationObserver(() => onResize());
        observer.observe(elRef.current!, {
            attributes: true,
            attributeFilter: ['style'],
            attributeOldValue: true
        })
        setSize({
            ...size,
            originalWidth: window.screen.width,
            originalHeight: window.screen.height
        })
        updateSize();
        updateScale();
        window.addEventListener('resize', onResize);
    }

    useEffect(() => {
        initState()
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', onResize);
            if (bodyOverflowHidden)
                document.body.style.overflow = bodyOverflow;
        }
    }, [])

    const scrollStyle = screenFitStyleMap[props.mode || 'scale']

    return (
        <div style={{...scrollStyle}}
             className={'react-screen-box'}>
            <div className={'screen-wrapper'}
                 ref={elRef}>
                {props.children}
            </div>
        </div>
    )
}