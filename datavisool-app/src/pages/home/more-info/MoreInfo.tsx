/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {BookOpen, Headset, Peoples, Right, VideocameraOne} from "@icon-park/react";
import styles from "@/pages/home/more-info/MoreInfo.module.less";
import {type ReactNode, useState} from "react";
import author from "@/pages/home/more-info/author.webp";
import ContactAuthorModal from "@/comps/common-component/contact-author/ContactAuthorModal.tsx";
import {globalMessage} from "@datavisool/ui";
import {tx} from "@/i18n/miniI18n.ts";
import {openExternalUrl} from "@/util/TauriCompatUtil.ts";

export default function MoreInfo() {
    const [wechatQrOpen, setWechatQrOpen] = useState<boolean>(false);
    const guideUrl = (import.meta.env.VITE_USER_GUIDE_URL || '/docs').trim();
    const guideIsExternal = /^https?:\/\//i.test(guideUrl);

    const openInSystemBrowser = (url: string) => {
        openExternalUrl(url).catch((e: unknown) => {
            console.error('openInSystemBrowser failed', e);
            globalMessage.error(tx('无法打开链接，请检查应用权限或系统浏览器设置'));
        });
    };

    const openWechatQr = () => setWechatQrOpen(true);

    const listConfig = [
        {
            content: '使用文档',
            icon: <BookOpen className={styles.icon}/>,
            href: guideUrl,
            description: '查阅 DataVisool Web 操作指南',
            tone: styles.blue
        },
        {
            content: '视频教程',
            icon: <VideocameraOne className={styles.icon}/>,
            onClick: () => openInSystemBrowser('https://www.bilibili.com/video/BV1z1421m7v2/?share_source=copy_web&vd_source=ece0559aa5b8c4f5c0d7307cb2b06aac'),
            description: '观看详细的操作演示视频',
            tone: styles.blue
        },
        {
            content: '联系支持',
            icon: <Headset className={styles.icon}/>,
            onClick: openWechatQr,
            description: '获取专业的技术支持服务',
            tone: styles.purple
        },
        {
            content: '社区交流',
            icon: <Peoples className={styles.icon}/>,
            onClick: openWechatQr,
            description: '加入社区与其他用户交流',
            tone: styles.orange
        }
    ]

    return (
        <div className={styles.moreInfoContainer}>
            <ContactAuthorModal open={wechatQrOpen} onClose={() => setWechatQrOpen(false)} qrImgSrc={author}/>
            <div className={styles.header}>
                <h1 className={styles.title}>帮助信息</h1>
                <p className={styles.subtitle}>
                    获取更多关于 <span>DataVisool Web</span> 的信息和支持
                </p>
            </div>

            <div className={styles.cardGrid}>
                {listConfig.map((item, index) => (
                    <Card key={index} className={`${styles.infoCard} ${item.tone}`} href={item.href}
                          external={!!item.href && guideIsExternal} onClick={item.onClick} index={index} item={item}/>
                ))}
            </div>
        </div>
    );
}

function Card({item, index, className, href, external, onClick}: {
    item: {content: string; icon: ReactNode; description: string};
    index: number;
    className: string;
    href?: string;
    external: boolean;
    onClick?: () => void;
}) {
    const content = <>
        <span className={styles.cardNumber}>{String(index + 1).padStart(2, '0')}</span>
        <div className={styles.cardContent}>
            <div className={styles.iconWrapper}>
                {item.icon}
            </div>
            <h3 className={styles.cardTitle}>{item.content}</h3>
            <p className={styles.cardDescription}>{item.description}</p>
            <span className={styles.actionButton}>
                立即访问
                <Right className={styles.arrowIcon}/>
            </span>
        </div>
    </>;

    if (href) return <a className={className} href={href} target={external ? '_blank' : undefined}
                       rel={external ? 'noopener noreferrer' : undefined}>{content}</a>;
    return <button type="button" className={className} onClick={onClick}>{content}</button>;
}
