/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import "@/pages/home/project-list/ProjectItem.less";
import {CopyOne, DataServer, Delete, Edit, EditOne, FileText, MapDraw, MoreOne, PreviewOpen, Setting} from "@icon-park/react";
import {type MouseEvent, useEffect, useState} from "react";
import baseApi from "@/api/engineering/BaseApi.ts";
import {useNavigate} from "react-router-dom";
import {globalMessage} from "@datavisool/ui";
import {Dropdown, DropdownMenuItem} from "@datavisool/ui";
import {tx} from "@/i18n/miniI18n.ts";
import {PROJECT_NAME_MAX_LENGTH} from "@/pages/home/project-list/project-name.ts";

export interface ProjectItemProps {
    id: string;
    name: string;
    cover?: string;
    description?: string;
    updatedAt?: string;
    variant?: "analytics" | "mimo" | "map";
    doOperate: (id: string, type: string) => void;
}

export default function ProjectItem(props: ProjectItemProps) {
    const {cover, description, id, updatedAt, variant = "analytics", doOperate} = props;
    const [displayName, setDisplayName] = useState(props.name);
    const [renameValue, setRenameValue] = useState<string | null>(null);
    const [savingName, setSavingName] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        setDisplayName(props.name);
    }, [props.name]);

    const items: DropdownMenuItem[] = [
        {
            key: '1',
            label: '删除',
            icon: <Delete/>,
            danger: true,
            onClick: () => doOperate(id, "del")
        },
        {
            key: '2',
            label: '复制',
            icon: <CopyOne/>,
            onClick: () => doOperate(id, "clone")
        },
        {
            key: '3',
            label: '重命名',
            icon: <Edit/>,
            disabled: savingName,
            onClick: () => setRenameValue(displayName)
        },
        {
            key: '4',
            label: '编辑',
            icon: <EditOne/>,
            onClick: () => doOperate(id, "edit")
        },
        {
            key: '5',
            label: '预览',
            icon: <PreviewOpen/>,
            onClick: () => doOperate(id, "show")
        },
        {
            key: '6',
            label: '设置',
            icon: <Setting/>,
            onClick: () => navigate(`/home/projectSetting/${id}`, {state: {projectId: id, title: displayName}})
        }
    ];

    const updateName = async () => {
        if (renameValue === null) return;
        setRenameValue(null);
        if (!renameValue.trim()) {
            globalMessage.messageApi?.error(tx("请输入项目名称"));
            return;
        }
        if (renameValue === displayName) return;

        setSavingName(true);
        const saved = await baseApi.updateProject({id, name: renameValue}).catch(() => false);
        setSavingName(false);
        if (saved) {
            setDisplayName(renameValue);
            globalMessage.messageApi?.success(tx("保存成功"));
        } else {
            globalMessage.messageApi?.error(tx("保存失败"));
        }
    }

    const renderProjectIcon = () => {
        if (variant === "mimo") return <DataServer theme="outline" size={28}/>;
        if (variant === "map") return <MapDraw theme="outline" size={28}/>;
        return <FileText theme="outline" size={28}/>;
    }

    const getFallbackDescription = () => {
        if (variant === "mimo") return tx("MiMO 测试项目与性能评估");
        if (variant === "map") return tx("地理信息系统可视化项目");
        return `${displayName} ${tx("项目数据可视化看板系统")}`;
    }

    const renderFallbackDescription = () => {
        if (variant !== "analytics")
            return getFallbackDescription();
        return (
            <>
                <span data-datavisool-i18n-skip="true">{displayName}</span>
                <span> {tx("项目数据可视化看板系统")}</span>
            </>
        );
    }

    const handleDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
        if (renameValue !== null) {
            return;
        }

        const target = event.target;
        if (target instanceof Element && target.closest("button, input, textarea, select, [role='button'], [data-project-card-ignore-dblclick='true']")) {
            return;
        }

        doOperate(id, "edit");
    }

    return (
        <div className={`project-list-item project-item-${variant}`} onDoubleClick={handleDoubleClick}>
            <div className="project-item-cover" style={{backgroundImage: `url(${cover})`}}>
                <Dropdown menu={{items}} trigger={["click"]} placement="bottomRight">
                    <button className="project-cover-menu" type="button" data-project-card-ignore-dblclick="true" onClick={(event) => event.stopPropagation()}>
                        <MoreOne theme="outline" size={22}/>
                    </button>
                </Dropdown>
            </div>
            <div className="project-item-content">
                <div className="project-item-icon">{renderProjectIcon()}</div>
                <div className="project-item-main">
                    <div className="project-title-row">
                        <div className="project-name">
                            {renameValue !== null ?
                                <div className="project-rename-input">
                                    <input
                                        autoFocus={true}
                                        value={renameValue}
                                        maxLength={PROJECT_NAME_MAX_LENGTH}
                                        onFocus={event => event.currentTarget.select()}
                                        onBlur={updateName}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                                                event.preventDefault();
                                                updateName();
                                            }
                                        }}
                                        onChange={(e) => setRenameValue(e.target.value)}
                                    />
                                </div> :
                                <div className="project-name-content" title={displayName} data-datavisool-i18n-skip="true">{displayName}</div>
                            }
                        </div>
                        <div className="project-update-time">编辑于 {updatedAt || "暂无时间"}</div>
                    </div>
                    <div className="project-description" title={description || (variant === "analytics" ? undefined : getFallbackDescription())} data-datavisool-i18n-skip={description?.trim() ? "true" : undefined}>
                        {description || renderFallbackDescription()}
                    </div>
                </div>
            </div>
            {renameValue !== null && (
                <div className="project-item-rename-save"
                     onMouseDown={(event) => event.preventDefault()}
                     onClick={updateName}>
                    保存
                </div>
            )}
        </div>
    )
}
