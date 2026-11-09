/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {memo} from "react";
import {useNavigate} from "react-router-dom";
import {Cube, FileCodeOne, FontSize, Right, VideoOne} from "@icon-park/react";
import {tx} from "@/i18n/miniI18n.ts";
import {useLocaleVersion} from "@/i18n/useLocaleVersion.ts";
import styles from "@/pages/home/resource-management/ResourceManagement.module.less";

const resourceItems = [
    {
        key: "font",
        title: "字体",
        desc: "管理上传字体，保证项目中文字资产可用且可追踪。",
        route: "../font",
        icon: <FontSize size={24}/>,
        tone: "cyan",
    },
    {
        key: "dynamicScript",
        title: "动态脚本",
        desc: "维护可执行脚本、远程地址与项目运行时依赖。",
        route: "../dynamicScript",
        icon: <FileCodeOne size={24}/>,
        tone: "blue",
    },
    {
        key: "videoResource",
        title: "视频",
        desc: "集中上传、替换和复制视频资源链接。",
        route: "../videoResource",
        icon: <VideoOne size={24}/>,
        tone: "teal",
    },
    {
        key: "modelResource",
        title: "3D模型",
        desc: "管理模型文件与压缩包资源，支撑三维场景复用。",
        route: "../modelResource",
        icon: <Cube size={24}/>,
        tone: "purple",
    },
] as const;

const ResourceManagement = memo(() => {
    useLocaleVersion();
    const navigate = useNavigate();

    return (
        <div className={styles.page}>
            <header className={styles.pageHeader}>
                <h1>{tx("资源管理")}</h1>
                <p>{tx("统一管理字体、动态脚本、视频和3D模型资源，快速进入对应资源工作区。")}</p>
            </header>

            <section className={styles.resourceGrid} aria-label={tx("资源管理")}>
                {resourceItems.map((item) => (
                    <button
                        key={item.key}
                        type="button"
                        className={`${styles.resourceCard} ${styles[item.tone]}`}
                        onClick={() => navigate(item.route)}
                    >
                        <span className={styles.cardIcon} aria-hidden={true}>{item.icon}</span>
                        <span className={styles.cardTitle}>{tx(item.title)}</span>
                        <span className={styles.cardDesc}>{tx(item.desc)}</span>
                        <span className={styles.cardAction}>
                            {tx("进入管理")}
                            <Right size={14}/>
                        </span>
                    </button>
                ))}
            </section>
        </div>
    );
});

export default ResourceManagement;
