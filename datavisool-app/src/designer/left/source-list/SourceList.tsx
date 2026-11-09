/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import './SourceList.less';
import {lazy, Suspense, useState} from "react";
import {Loading} from "@datavisool/ui";
import {Pic, VideoOne} from '@icon-park/react';
import DesignerPanelHeader from '../panel-header/DesignerPanelHeader';

const ImageSource = lazy(() => import('./image-source/ImageSource'));
const VideoSource = lazy(() => import('./video-source/VideoSource'));

export default function SourceList() {

    const [activeCategory, setActiveCategory] = useState('image');

    return (
        <div className={'source-library'}>
            <DesignerPanelHeader title="资源库"/>
            <div className={'source-library-body'}>
                <div className={'source-categorize'}>
                    <button type="button"
                        className={`categorize-item ${activeCategory === 'image' ? 'categorize-item-active' : ''}`}
                        onClick={() => setActiveCategory('image')}
                    >
                        <Pic theme="filled" size={16}/>
                        <span>图片</span>
                    </button>
                    <button type="button"
                        className={`categorize-item ${activeCategory === 'video' ? 'categorize-item-active' : ''}`}
                        onClick={() => setActiveCategory('video')}
                    >
                        <VideoOne theme="filled" size={16}/>
                        <span>视频</span>
                    </button>
                </div>
                <div className={'source-library-content'}>
                    <Suspense fallback={<Loading/>}>
                        {activeCategory === 'image' && <ImageSource/>}
                        {activeCategory === 'video' && <VideoSource/>}
                    </Suspense>
                </div>
            </div>
        </div>
    );
}
