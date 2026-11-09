/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {memo} from "react";
import styles from "./TemplateMarket.module.less";

const TemplateMarket = memo(() => {
    const highlights = [
        {
            title: '官方模板',
            description: '沉淀适用于大屏、展厅、运维监控和行业场景的精选模板资源。'
        },
        {
            title: '团队复用',
            description: '支持将成熟项目沉淀为模板，提高团队内部的复用效率和交付一致性。'
        },
        {
            title: '场景精选',
            description: '按行业和用途整理模板入口，后续会逐步扩充更多高质量案例。'
        }
    ];

    const roadmap = [
        '模板浏览与分类筛选',
        '模板预览与一键创建',
        '团队模板沉淀与共享'
    ];

    return (
        <div className={styles.templateMarket}>
            <div className={styles.hero}>
                <div className={styles.badge}>敬请期待</div>
                <h1 className={styles.title}>模板市场</h1>
                <p className={styles.subtitle}>
                    这里将承载官方模板、行业案例和团队复用资产。当前页面仍在建设中，视觉已先与新的首页壳层保持一致。
                </p>
            </div>

            <div className={styles.panel}>
                <div className={styles.section}>
                    <div className={styles.sectionTitle}>规划能力</div>
                    <div className={styles.cardGrid}>
                        {highlights.map((item) => (
                            <div key={item.title} className={styles.featureCard}>
                                <div className={styles.featureTitle}>{item.title}</div>
                                <div className={styles.featureDescription}>{item.description}</div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className={styles.section}>
                    <div className={styles.sectionTitle}>建设进度</div>
                    <div className={styles.roadmap}>
                        {roadmap.map((item, index) => (
                            <div key={item} className={styles.roadmapItem}>
                                <div className={styles.roadmapIndex}>{index + 1}</div>
                                <div className={styles.roadmapText}>{item}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
})

export default TemplateMarket
