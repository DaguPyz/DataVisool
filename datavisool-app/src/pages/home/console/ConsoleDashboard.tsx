/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {CountUp} from "countup.js";
import {ReactNode, useCallback, useEffect, useMemo, useRef, useState} from "react";
import {
    Api,
    ArrowRight,
    Box,
    Brain,
    DataServer,
    DatabaseSetting,
    Remind,
    Cube,
    FileCodeOne,
    FolderClose,
    FontSize,
    History,
    Plus,
    Send,
    VideoOne
} from "@icon-park/react";
import {Button, globalMessage} from "@datavisool/ui";
import {useNavigate} from "react-router-dom";
import styles from "@/pages/home/console/ConsoleDashboard.module.less";
import AuthFetchUtil from "@/util/AuthFetchUtil.ts";
import baseApi from "@/api/engineering/BaseApi.ts";
import NewProjectDialog, {INewProjectInfo} from "@/pages/home/project-list/NewProjectDialog.tsx";
import {tx} from "@/i18n/miniI18n.ts";
import {useLocaleVersion} from "@/i18n/useLocaleVersion.ts";

type KpiVariant = "primary" | "teal" | "purple" | "orange";
type ResourceGroupKey = "creative" | "service";
type ActivityType = "project" | "font" | "video" | "model" | "script" | "ai-model" | "remote-component" | "database" | "api" | "release";

type DashboardRecord = {
    id?: string | number;
    name?: string;
    componentName?: string;
    createTime?: unknown;
    updateTime?: unknown;
};

type ProjectRecord = DashboardRecord;
type ResourceRecord = DashboardRecord;
type ReleaseRecord = DashboardRecord & {
    state?: boolean | number;
    encrypt?: boolean;
    expirationDate?: number | null;
    description?: string;
    des?: string;
};

type DashboardPage<T extends DashboardRecord> = {
    total?: number;
    records?: T[];
};

type DashboardCollection<T extends DashboardRecord> = {
    total: number;
    records: T[];
};

type DashboardData = {
    projects: DashboardCollection<ProjectRecord>;
    fonts: DashboardCollection<ResourceRecord>;
    videos: DashboardCollection<ResourceRecord>;
    models: DashboardCollection<ResourceRecord>;
    scripts: DashboardCollection<ResourceRecord>;
    aiModels: DashboardCollection<ResourceRecord>;
    remoteComponents: DashboardCollection<ResourceRecord>;
    databases: DashboardCollection<ResourceRecord>;
    apis: DashboardCollection<ResourceRecord>;
    releases: DashboardCollection<ReleaseRecord>;
};

type TrendPoint = {
    label: string;
    value: number;
};

type KpiItem = {
    key: string;
    label: string;
    value: number;
    description: string;
    trendSummary: string;
    icon: ReactNode;
    variant: KpiVariant;
    trend: TrendPoint[];
};

type ResourceBreakdownItem = {
    key: string;
    label: string;
    value: number;
    percent: number;
    group: ResourceGroupKey;
    route: string;
};

type ResourceGroup = {
    key: ResourceGroupKey;
    label: string;
    items: ResourceBreakdownItem[];
};

type ActivityItem = {
    type: ActivityType;
    name: string;
    description: string;
    time: string;
    timestamp: number;
    id?: string | number;
    route: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const KPI_TREND_DAYS = 14;

function createEmptyCollection<T extends DashboardRecord>(): DashboardCollection<T> {
    return {total: 0, records: []};
}

function createEmptyDashboardData(): DashboardData {
    return {
        projects: createEmptyCollection<ProjectRecord>(),
        fonts: createEmptyCollection<ResourceRecord>(),
        videos: createEmptyCollection<ResourceRecord>(),
        models: createEmptyCollection<ResourceRecord>(),
        scripts: createEmptyCollection<ResourceRecord>(),
        aiModels: createEmptyCollection<ResourceRecord>(),
        remoteComponents: createEmptyCollection<ResourceRecord>(),
        databases: createEmptyCollection<ResourceRecord>(),
        apis: createEmptyCollection<ResourceRecord>(),
        releases: createEmptyCollection<ReleaseRecord>()
    };
}

function toCollection<T extends DashboardRecord>(page?: DashboardPage<T> | null): DashboardCollection<T> {
    const records = page?.records ?? [];
    const total = typeof page?.total === "number" && Number.isFinite(page.total)
        ? Math.max(0, Math.floor(page.total))
        : records.length;
    return {total, records};
}

function parseDashboardDate(value: unknown): Date | null {
    if (Array.isArray(value) && value.length >= 3) {
        const [year, month, day, hour = 0, minute = 0, second = 0, nanosecond = 0] = value.map(Number);
        if (![year, month, day, hour, minute, second, nanosecond].every(Number.isFinite)) return null;
        const date = new Date(year, month - 1, day, hour, minute, second, Math.floor(nanosecond / 1_000_000));
        return Number.isNaN(date.getTime()) ? null : date;
    }
    if (typeof value !== "string" && typeof value !== "number") return null;
    const date = new Date(typeof value === "string" ? value.replace(" ", "T") : value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function parseTimestamp(value: unknown): number | null {
    return parseDashboardDate(value)?.getTime() ?? null;
}

function getRecordTimestamp(record: DashboardRecord): number | null {
    return parseTimestamp(record.updateTime) ?? parseTimestamp(record.createTime);
}

function getStartOfDay(value: Date): number {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

function getDailyBuckets(records: DashboardRecord[], days = KPI_TREND_DAYS, now = Date.now()): TrendPoint[] {
    const start = getStartOfDay(new Date(now)) - (days - 1) * DAY_MS;
    const buckets = Array.from({length: days}, (_, index) => {
        const date = new Date(start + index * DAY_MS);
        return {label: `${date.getMonth() + 1}/${date.getDate()}`, value: 0};
    });

    records.forEach((record) => {
        const timestamp = getRecordTimestamp(record);
        if (timestamp === null || timestamp > now) return;
        const day = getStartOfDay(new Date(timestamp));
        const index = Math.floor((day - start) / DAY_MS);
        if (index >= 0 && index < buckets.length) buckets[index].value += 1;
    });
    return buckets;
}

function countRecentChanges(records: DashboardRecord[], now = Date.now()): number {
    const start = getStartOfDay(new Date(now)) - (KPI_TREND_DAYS - 1) * DAY_MS;
    return records.reduce((count, record) => {
        const timestamp = getRecordTimestamp(record);
        return timestamp !== null && timestamp >= start && timestamp <= now ? count + 1 : count;
    }, 0);
}

function formatDateTime(value: unknown): string {
    const timestamp = parseTimestamp(value);
    if (timestamp === null) return "-";
    const date = new Date(timestamp);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = `${date.getHours()}`.padStart(2, "0");
    const minutes = `${date.getMinutes()}`.padStart(2, "0");
    return `${date.getFullYear()}/${month}/${day} ${hours}:${minutes}`;
}

function getDisplayName(record: DashboardRecord, fallback: string): string {
    return record.name?.trim() || record.componentName?.trim() || fallback;
}

function getReleaseDescription(record: ReleaseRecord): string {
    return record.description?.trim() || record.des?.trim() || tx("未填写项目描述");
}

function formatExpiration(value?: number | null): string {
    return value && value > 0 ? `${value} ${tx("天")}` : tx("永久");
}

function isReleaseActive(state?: boolean | number): boolean {
    return state === true || state === 1;
}

function AnimatedNumber(props: {value: number; duration?: number}) {
    const {value, duration = 0.8} = props;
    const elementRef = useRef<HTMLSpanElement | null>(null);
    const animationRef = useRef<CountUp | null>(null);

    useEffect(() => {
        if (!elementRef.current) return;
        animationRef.current?.reset();
        const animation = new CountUp(elementRef.current, value, {duration, separator: ","});
        animationRef.current = animation;
        if (!animation.error) animation.start();
        return () => {
            animationRef.current = null;
        };
    }, [duration, value]);

    return <span ref={elementRef}/>;
}

function TrendBarChart(props: {points: TrendPoint[]; label: string; variant: KpiVariant}) {
    const {points, label, variant} = props;
    const width = 140;
    const height = 40;
    const paddingX = 3;
    const paddingTop = 3;
    const paddingBottom = 4;
    const barGap = points.length > 10 ? 2 : 4;
    const max = Math.max(...points.map((point) => point.value), 1);
    const usableWidth = width - paddingX * 2 - Math.max(0, points.length - 1) * barGap;
    const usableHeight = height - paddingTop - paddingBottom;
    const barWidth = Math.max(2, usableWidth / Math.max(points.length, 1));
    const baselineY = height - paddingBottom;
    const bars = points.map((point, index) => {
        const barHeight = point.value > 0
            ? Math.max(3, point.value / max * usableHeight)
            : 2;
        return {
        ...point,
        x: paddingX + index * (barWidth + barGap),
        y: baselineY - barHeight,
        height: barHeight,
        isLatest: index === points.length - 1
        };
    });

    return (
        <div className={styles.kpiTrendChart} data-variant={variant} role="img" aria-label={`${label} · ${tx("最近 2 周")}`}>
            <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true" preserveAspectRatio="none">
                <line className={styles.kpiTrendBaseline} x1={paddingX} x2={width - paddingX} y1={baselineY} y2={baselineY}/>
                {bars.map((point) => (
                    <rect
                        className={styles.kpiTrendBar}
                        data-empty={point.value === 0}
                        data-latest={point.isLatest}
                        key={point.label}
                        height={point.height}
                        rx={Math.min(barWidth / 2, 1.6)}
                        width={barWidth}
                        x={point.x}
                        y={point.y}
                    />
                ))}
            </svg>
        </div>
    );
}

function getTrendSummary(points: TrendPoint[]): string {
    const changeCount = points.reduce((total, point) => total + point.value, 0);
    return changeCount > 0
        ? `${tx("近 2 周")} · ${changeCount} ${tx("项更新")}`
        : tx("近 2 周无变动");
}

export default function ConsoleDashboard() {
    const localeVersion = useLocaleVersion();
    const navigate = useNavigate();
    const [dashboardData, setDashboardData] = useState<DashboardData>(createEmptyDashboardData);
    const [projectDialogVisible, setProjectDialogVisible] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [hasLoadError, setHasLoadError] = useState(false);
    const creatingProjectRef = useRef(false);

    const loadDashboardData = useCallback(async () => {
        setIsLoading(true);
        setHasLoadError(false);
        try {
            const [
                projectsRes,
                fontsRes,
                videosRes,
                modelsRes,
                scriptsRes,
                aiModelsRes,
                remoteComponentsRes,
                databasesRes,
                apisRes,
                releasesRes
            ] = await Promise.allSettled([
                AuthFetchUtil.post<DashboardPage<ProjectRecord> | null>("/api/project/pageList", {current: 1, size: 50}),
                AuthFetchUtil.post<DashboardPage<ResourceRecord> | null>("/api/font/pageList", {current: 1, size: 50}),
                AuthFetchUtil.post<DashboardPage<ResourceRecord> | null>("/api/video/page", {current: 1, size: 50}),
                AuthFetchUtil.post<DashboardPage<ResourceRecord> | null>("/api/model/page", {current: 1, size: 50}),
                AuthFetchUtil.post<DashboardPage<ResourceRecord> | null>("/api/dynamicScript/pageList", {current: 1, size: 50}),
                AuthFetchUtil.post<DashboardPage<ResourceRecord> | null>("/api/aiModel/pageList", {current: 1, size: 50}),
                AuthFetchUtil.post<DashboardPage<ResourceRecord> | null>("/api/remote/component/pageList", {current: 1, size: 50}),
                AuthFetchUtil.post<DashboardPage<ResourceRecord> | null>("/api/commonDatabase/pageList", {current: 1, size: 50}),
                AuthFetchUtil.post<DashboardPage<ResourceRecord> | null>("/api/commonApi/pageList", {current: 1, size: 50}),
                AuthFetchUtil.post<DashboardPage<ReleaseRecord> | null>("/api/release/pageList", {current: 1, size: 50})
            ]);
            const getCollection = <T extends DashboardRecord>(result: PromiseSettledResult<DashboardPage<T> | null>): DashboardCollection<T> => (
                result.status === "fulfilled" ? toCollection(result.value) : createEmptyCollection<T>()
            );
            const hasFailedRequest = [
                projectsRes,
                fontsRes,
                videosRes,
                modelsRes,
                scriptsRes,
                aiModelsRes,
                remoteComponentsRes,
                databasesRes,
                apisRes,
                releasesRes
            ]
                .some((result) => result.status === "rejected" || result.value === null);

            setDashboardData({
                projects: getCollection(projectsRes),
                fonts: getCollection(fontsRes),
                videos: getCollection(videosRes),
                models: getCollection(modelsRes),
                scripts: getCollection(scriptsRes),
                aiModels: getCollection(aiModelsRes),
                remoteComponents: getCollection(remoteComponentsRes),
                databases: getCollection(databasesRes),
                apis: getCollection(apisRes),
                releases: getCollection(releasesRes)
            });
            setHasLoadError(hasFailedRequest);
        } catch (error) {
            console.error("Failed to fetch dashboard data", error);
            setHasLoadError(true);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadDashboardData();
    }, [loadDashboardData]);

    const allRecords = useMemo(() => [
        ...dashboardData.projects.records,
        ...dashboardData.fonts.records,
        ...dashboardData.videos.records,
        ...dashboardData.models.records,
        ...dashboardData.scripts.records,
        ...dashboardData.aiModels.records,
        ...dashboardData.remoteComponents.records,
        ...dashboardData.databases.records,
        ...dashboardData.apis.records,
        ...dashboardData.releases.records
    ], [dashboardData]);

    const resourceRecords = useMemo(() => [
        ...dashboardData.fonts.records,
        ...dashboardData.videos.records,
        ...dashboardData.models.records,
        ...dashboardData.scripts.records,
        ...dashboardData.aiModels.records,
        ...dashboardData.remoteComponents.records,
        ...dashboardData.databases.records,
        ...dashboardData.apis.records
    ], [dashboardData]);

    const counts = useMemo(() => ({
        projects: dashboardData.projects.total,
        fonts: dashboardData.fonts.total,
        videos: dashboardData.videos.total,
        models: dashboardData.models.total,
        scripts: dashboardData.scripts.total,
        aiModels: dashboardData.aiModels.total,
        remoteComponents: dashboardData.remoteComponents.total,
        databases: dashboardData.databases.total,
        apis: dashboardData.apis.total,
        releases: dashboardData.releases.total
    }), [dashboardData]);

    const resourceTotal = counts.fonts + counts.videos + counts.models + counts.scripts
        + counts.aiModels + counts.remoteComponents + counts.databases + counts.apis;
    const biweeklyUpdateCount = useMemo(() => countRecentChanges(allRecords), [allRecords]);

    const kpis = useMemo<KpiItem[]>(() => {
        void localeVersion;
        const projectTrend = getDailyBuckets(dashboardData.projects.records);
        const resourceTrend = getDailyBuckets(resourceRecords);
        const releaseTrend = getDailyBuckets(dashboardData.releases.records);
        const updateTrend = getDailyBuckets(allRecords);

        return [
        {
            key: "projects",
            label: tx("项目总数"),
            value: counts.projects,
            description: tx("当前环境下可用项目总数"),
            trendSummary: getTrendSummary(projectTrend),
            icon: <FolderClose theme="outline" size={20} fill="currentColor"/>,
            variant: "primary",
            trend: projectTrend
        },
        {
            key: "resources",
            label: tx("资源总量"),
            value: resourceTotal,
            description: tx("字体、视频、3D 模型、动态脚本及服务资源总数"),
            trendSummary: getTrendSummary(resourceTrend),
            icon: <Box theme="outline" size={20} fill="currentColor"/>,
            variant: "teal",
            trend: resourceTrend
        },
        {
            key: "releases",
            label: tx("已发布版本"),
            value: counts.releases,
            description: tx("发布管理中已发布的版本记录"),
            trendSummary: getTrendSummary(releaseTrend),
            icon: <Send theme="outline" size={20} fill="currentColor"/>,
            variant: "purple",
            trend: releaseTrend
        },
        {
            key: "biweekly-updates",
            label: tx("近 2 周更新"),
            value: biweeklyUpdateCount,
            description: tx("最近 2 周内项目与资源的变更次数"),
            trendSummary: getTrendSummary(updateTrend),
            icon: <History theme="outline" size={20} fill="currentColor"/>,
            variant: "orange",
            trend: updateTrend
        }
        ];
    }, [allRecords, biweeklyUpdateCount, counts, dashboardData, localeVersion, resourceRecords, resourceTotal]);

    const resourceBreakdown = useMemo<ResourceBreakdownItem[]>(() => {
        void localeVersion;
        const items = [
            {key: "fonts", label: tx("字体"), value: counts.fonts, group: "creative" as const, route: "/home/font"},
            {key: "videos", label: tx("视频"), value: counts.videos, group: "creative" as const, route: "/home/videoResource"},
            {key: "models", label: tx("3D 模型"), value: counts.models, group: "creative" as const, route: "/home/modelResource"},
            {key: "scripts", label: tx("动态脚本"), value: counts.scripts, group: "creative" as const, route: "/home/dynamicScript"},
            {key: "ai-models", label: tx("AI模型"), value: counts.aiModels, group: "service" as const, route: "/home/aiModel"},
            {key: "remote-components", label: tx("服务器组件"), value: counts.remoteComponents, group: "service" as const, route: "/home/remoteComponent"},
            {key: "databases", label: tx("数据库"), value: counts.databases, group: "service" as const, route: "/home/database"},
            {key: "apis", label: tx("API"), value: counts.apis, group: "service" as const, route: "/home/api"}
        ];
        return items.map((item) => ({
            ...item,
            percent: resourceTotal > 0 ? Math.round(item.value / resourceTotal * 1000) / 10 : 0
        }));
    }, [counts, localeVersion, resourceTotal]);

    const resourceGroups = useMemo<ResourceGroup[]>(() => {
        void localeVersion;
        return [
            {
                key: "creative",
                label: tx("创作资源"),
                items: resourceBreakdown.filter((item) => item.group === "creative")
            },
            {
                key: "service",
                label: tx("服务资源"),
                items: resourceBreakdown.filter((item) => item.group === "service")
            }
        ];
    }, [localeVersion, resourceBreakdown]);

    const recentActivities = useMemo<ActivityItem[]>(() => {
        void localeVersion;
        const createActivity = (
            record: DashboardRecord,
            type: ActivityType,
            description: string,
            route: string,
            fallback: string
        ): ActivityItem | null => {
            const timestamp = getRecordTimestamp(record);
            if (timestamp === null) return null;
            return {
                type,
                name: getDisplayName(record, fallback),
                description,
                time: formatDateTime(timestamp),
                timestamp,
                id: record.id,
                route
            };
        };

        const activities = [
            ...dashboardData.projects.records.map((record) => createActivity(record, "project", tx("更新了项目配置"), "/home/server", tx("未命名项目"))),
            ...dashboardData.fonts.records.map((record) => createActivity(record, "font", tx("更新了字体资源"), "/home/font", tx("未命名字体"))),
            ...dashboardData.videos.records.map((record) => createActivity(record, "video", tx("更新了视频资源"), "/home/videoResource", tx("未命名视频"))),
            ...dashboardData.models.records.map((record) => createActivity(record, "model", tx("更新了 3D 模型资源"), "/home/modelResource", tx("未命名模型"))),
            ...dashboardData.scripts.records.map((record) => createActivity(record, "script", tx("更新了动态脚本"), "/home/dynamicScript", tx("未命名脚本"))),
            ...dashboardData.aiModels.records.map((record) => createActivity(record, "ai-model", tx("更新了 AI 模型"), "/home/aiModel", tx("未命名 AI 模型"))),
            ...dashboardData.remoteComponents.records.map((record) => createActivity(record, "remote-component", tx("更新了服务器组件"), "/home/remoteComponent", tx("未命名服务器组件"))),
            ...dashboardData.databases.records.map((record) => createActivity(record, "database", tx("更新了数据库配置"), "/home/database", tx("未命名数据库"))),
            ...dashboardData.apis.records.map((record) => createActivity(record, "api", tx("更新了 API 配置"), "/home/api", tx("未命名 API"))),
            ...dashboardData.releases.records.map((record) => createActivity(record, "release", tx("更新了发布记录"), "/home/releaseManagement", tx("未命名发布")))
        ];
        return activities
            .filter((activity): activity is ActivityItem => activity !== null)
            .sort((left, right) => right.timestamp - left.timestamp)
            .slice(0, 5);
    }, [dashboardData, localeVersion]);

    const recentReleases = useMemo(() => dashboardData.releases.records
        .map((record, index) => ({record, index, timestamp: getRecordTimestamp(record)}))
        .filter((item) => item.timestamp !== null)
        .sort((left, right) => (right.timestamp as number) - (left.timestamp as number))
        .slice(0, 5), [dashboardData.releases.records]);

    const renderActivityIcon = (type: ActivityType) => {
        if (type === "project") return <FolderClose theme="outline" size={18} fill="currentColor"/>;
        if (type === "font") return <FontSize theme="outline" size={18} fill="currentColor"/>;
        if (type === "video") return <VideoOne theme="outline" size={18} fill="currentColor"/>;
        if (type === "model") return <Cube theme="outline" size={18} fill="currentColor"/>;
        if (type === "script") return <FileCodeOne theme="outline" size={18} fill="currentColor"/>;
        if (type === "ai-model") return <Brain theme="outline" size={18} fill="currentColor"/>;
        if (type === "remote-component") return <DataServer theme="outline" size={18} fill="currentColor"/>;
        if (type === "database") return <DatabaseSetting theme="outline" size={18} fill="currentColor"/>;
        if (type === "api") return <Api theme="outline" size={18} fill="currentColor"/>;
        return <Send theme="outline" size={18} fill="currentColor"/>;
    };

    const handleCreateProject = useCallback(async (data: INewProjectInfo) => {
        if (creatingProjectRef.current) return;
        creatingProjectRef.current = true;
        try {
            const id = await baseApi.createProject({
                name: data.name,
                des: data.des,
                dataJson: JSON.stringify({canvasManager: {width: data.width, height: data.height}})
            });
            if (!id || !String(id).trim()) {
                globalMessage.messageApi?.error(tx("创建失败"));
                return;
            }
            setProjectDialogVisible(false);
            await loadDashboardData();
            navigate(`/designer?id=${id}`);
        } catch (error) {
            console.error("ConsoleDashboard.createProject failed", error);
            globalMessage.messageApi?.error(tx("创建失败"));
        } finally {
            creatingProjectRef.current = false;
        }
    }, [loadDashboardData, navigate]);

    return (
        <div className={styles.dashboard} aria-busy={isLoading}>
            <header className={styles.dashboardHeader}>
                <div className={styles.headerCopy}>
                    <h1 className={styles.headerTitle}>{tx("控制台")}</h1>
                    <p className={styles.headerDescription}>{tx("查看项目、资源和发布状态")}</p>
                </div>
                <div className={styles.headerActions}>
                    <button
                        className={styles.notificationButton}
                        type="button"
                        disabled
                        aria-label={tx("通知功能暂未开放")}
                        title={tx("通知功能暂未开放")}
                    >
                        <Remind theme="outline" size={20} fill="currentColor"/>
                    </button>
                    <Button
                        className={styles.newProjectButton}
                        type="primary"
                        icon={<Plus theme="outline" size={18} fill="currentColor"/>}
                        onClick={() => setProjectDialogVisible(true)}
                    >
                        {tx("新建项目")}
                    </Button>
                </div>
            </header>

            {hasLoadError && (
                <div className={styles.dashboardNotice} role="alert">
                    <span>{tx("部分数据加载失败，请稍后重试")}</span>
                    <button type="button" onClick={() => void loadDashboardData()}>{tx("重新加载")}</button>
                </div>
            )}

            <section className={styles.kpiGrid} aria-label={tx("核心指标")}>
                {kpis.map((item) => (
                    <article className={styles.kpiCard} data-variant={item.variant} key={item.key}>
                        <header className={styles.kpiCardHeader}>
                            <div className={styles.kpiIcon}>{item.icon}</div>
                            <h2 className={styles.kpiLabel}>{item.label}</h2>
                            <span className={styles.kpiPeriod}>{tx("近 2 周")}</span>
                        </header>
                        <p className={styles.kpiDescription}>{item.description}</p>
                        <div className={styles.kpiFooter}>
                            <div className={styles.kpiMetric}>
                                <strong className={styles.kpiValue}><AnimatedNumber value={item.value}/></strong>
                                <span className={styles.kpiTrendSummary}>{item.trendSummary}</span>
                            </div>
                            <TrendBarChart points={item.trend} label={item.label} variant={item.variant}/>
                        </div>
                    </article>
                ))}
            </section>

            <section className={styles.dashboardContentGrid}>
                <article className={styles.resourceOverviewCard}>
                    <div className={styles.sectionHeader}>
                        <div>
                            <h2 className={styles.sectionTitle}>{tx("资源概览")}</h2>
                            <p className={styles.sectionDescription}>{tx("各类资源数量分布情况")}</p>
                        </div>
                        <div className={styles.resourceOverviewTotal} aria-label={`${tx("资源总量")} ${resourceTotal} ${tx("项")}`}>
                            <strong><AnimatedNumber value={resourceTotal}/></strong>
                            <span>{tx("项")}</span>
                        </div>
                    </div>
                    <div className={styles.resourceOverviewBody}>
                        {resourceGroups.map((group) => (
                            <section className={styles.resourceGroup} data-group={group.key} key={group.key}>
                                <header className={styles.resourceGroupHeader}>
                                    <h3>{group.label}</h3>
                                    <span>{group.items.reduce((total, item) => total + item.value, 0)} {tx("项")}</span>
                                </header>
                                <div className={styles.resourceMatrix}>
                                    {group.items.map((item) => (
                                        <button
                                            aria-label={`${tx("查看")} ${item.label}`}
                                            className={styles.resourceMatrixItem}
                                            key={item.key}
                                            type="button"
                                            onClick={() => navigate(item.route)}
                                        >
                                            <span className={styles.resourceMatrixTopline}>
                                                <span className={styles.resourceMatrixLabel}>{item.label}</span>
                                                <span className={styles.resourceMatrixMeta}>
                                                    <strong>{item.value}</strong>
                                                    <span>{item.percent}%</span>
                                                </span>
                                            </span>
                                            <span className={styles.resourceProgressTrack} aria-hidden="true">
                                                <span className={styles.resourceProgressFill} style={{width: `${item.percent}%`}}/>
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </section>
                        ))}
                    </div>
                </article>

                <article className={styles.recentUpdatesCard}>
                    <div className={styles.sectionHeader}>
                        <div>
                            <h2 className={styles.sectionTitle}>{tx("最近更新")}</h2>
                            <p className={styles.sectionDescription}>{tx("项目与资源的最新变更")}</p>
                        </div>
                        <button className={styles.sectionLink} type="button" onClick={() => navigate("/home/server")}>
                            {tx("查看全部")}
                            <ArrowRight theme="outline" size={14} fill="currentColor"/>
                        </button>
                    </div>
                    <div className={styles.updatesList}>
                            {isLoading ? (
                                <div className={styles.loadingState} role="status">{tx("正在加载数据")}</div>
                            ) : recentActivities.length === 0 ? (
                            <div className={styles.emptyState}>{tx("暂无最近更新")}</div>
                        ) : recentActivities.map((item, index) => (
                            <button
                                className={styles.updateItem}
                                data-type={item.type}
                                key={`${item.type}-${item.id ?? item.name}-${index}`}
                                type="button"
                                onClick={() => navigate(item.route)}
                            >
                                <span className={styles.updateItemIcon}>{renderActivityIcon(item.type)}</span>
                                <span className={styles.updateItemMain}>
                                    <strong className={styles.updateItemTitle} data-datavisool-i18n-skip="true">{item.name}</strong>
                                    <span className={styles.updateItemDescription}>{item.description}</span>
                                </span>
                                <time className={styles.updateItemTime}>{item.time}</time>
                            </button>
                        ))}
                    </div>
                </article>
            </section>

            <section className={styles.recentReleasesCard}>
                <div className={styles.sectionHeader}>
                    <div>
                        <h2 className={styles.sectionTitle}>{tx("最近发布")}</h2>
                        <p className={styles.sectionDescription}>{tx("最近更新的发布记录")}</p>
                    </div>
                    <button className={styles.sectionLink} type="button" onClick={() => navigate("/home/releaseManagement")}>
                        {tx("查看全部")}
                        <ArrowRight theme="outline" size={14} fill="currentColor"/>
                    </button>
                </div>
                <div className={styles.releaseTableWrap}>
                    <table className={styles.releaseTable}>
                        <thead>
                            <tr>
                                <th>{tx("项目名称")}</th>
                                <th>{tx("发布内容")}</th>
                                <th>{tx("发布时间")}</th>
                                <th>{tx("有效期")}</th>
                                <th>{tx("状态")}</th>
                                <th>{tx("操作")}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td className={styles.loadingState} colSpan={6} role="status">{tx("正在加载数据")}</td>
                                </tr>
                            ) : recentReleases.length === 0 ? (
                                <tr>
                                    <td className={styles.emptyState} colSpan={6}>{tx("暂无发布记录")}</td>
                                </tr>
                            ) : recentReleases.map(({record, index, timestamp}) => (
                                <tr key={`${record.id ?? record.name ?? "release"}-${index}`}>
                                    <td className={styles.releaseProjectName} data-datavisool-i18n-skip={record.name?.trim() || record.componentName?.trim() ? "true" : undefined}>{getDisplayName(record, tx("未命名发布"))}</td>
                                    <td className={styles.releaseDescription} title={getReleaseDescription(record)} data-datavisool-i18n-skip={record.description?.trim() || record.des?.trim() ? "true" : undefined}>{getReleaseDescription(record)}</td>
                                    <td>{formatDateTime(timestamp)}</td>
                                    <td>{formatExpiration(record.expirationDate)}</td>
                                    <td>
                                        <span className={styles.releaseStatus} data-state={record.state === undefined || record.state === null ? "unknown" : isReleaseActive(record.state) ? "published" : "disabled"}>
                                            {record.state === undefined || record.state === null ? "—" : isReleaseActive(record.state) ? tx("已发布") : tx("已停用")}
                                        </span>
                                    </td>
                                    <td>
                                        <button className={styles.releaseAction} type="button" onClick={() => navigate("/home/releaseManagement")}>
                                            {tx("查看")}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            <NewProjectDialog
                visible={projectDialogVisible}
                onOk={handleCreateProject}
                onCancel={() => setProjectDialogVisible(false)}
            />
        </div>
    );
}
