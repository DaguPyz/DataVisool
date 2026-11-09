/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import type {WebDatabaseConfig as IDatabase} from "@/types/WebDataSourceTypes.ts";
import {type Control, FieldChangeData, globalMessage, ISelectOption, DatavisoolGUI} from "@datavisool/ui";
import {useEffect, useRef, useState} from "react";
import AuthFetchUtil from "@/util/AuthFetchUtil.ts";
import {IDataSource} from "@/pages/home/database/DataBaseStore.ts";
import {Base64Util} from "@datavisool/sdk";
import {ObjectUtil} from "@datavisool/sdk";
import DataUtil from "@/util/DataUtil.ts";

export interface DatabaseDataConfigProps {
    data: IDatabase;
    doTestBefore?: (config: IDatabase) => IDatabase;
    doTestAfter?: (data: any) => void;
    /**
     * @param config 配置数据
     * @param testData 测试数据
     */
    onSave: (config: IDatabase, testData?: any) => void;
}

function isReadonlySqlStatement(sql: string) {
    const lower = sql.trimStart().toLowerCase();
    return lower.startsWith('select') || lower.startsWith('with');
}

export function DatabaseDataConfig(props: DatabaseDataConfigProps) {
    const {data, onSave, doTestBefore, doTestAfter} = props;
    const dataRef = useRef(data);
    const dataSourceAllowSqlScriptRef = useRef<Record<string, boolean>>({});
    const [dataSourceList, setDataSourceList] = useState<ISelectOption[]>([]);
    const [testRes, setTestRes] = useState<string | null>(null);
    const [count, setCount] = useState(0);

    useEffect(() => {
        AuthFetchUtil.get(`/api/commonDatabase/list`).then(res => {
            if (res !== null) {
                const allowSqlScriptMap: Record<string, boolean> = {};
                const options = (res as Array<IDataSource>).map(item => {
                    if (item.id)
                        allowSqlScriptMap[item.id] = !!item.allowSqlScript;
                    return {label: item.name, value: item.id}
                })
                dataSourceAllowSqlScriptRef.current = allowSqlScriptMap;
                setDataSourceList(options as ISelectOption[]);
            }
        })
    }, []);

    const validate = () => {
        if (!dataRef.current) {
            globalMessage.messageApi?.error('请选择数据库');
            return false;
        }
        const {targetDb, sql} = dataRef.current;
        if (!targetDb) {
            globalMessage.messageApi?.error('请选择数据库');
            return false;
        }
        if (!sql || sql === '') {
            globalMessage.messageApi?.error('请输入SQL语句');
            return false;
        }
        const allowSqlScript = !!dataSourceAllowSqlScriptRef.current[String(targetDb)];
        if (!allowSqlScript && !isReadonlySqlStatement(sql)) {
            globalMessage.messageApi?.error('当前数据库数据源未开启脚本执行，仅允许 SELECT/WITH 查询语句');
            return false;
        }
        return true;
    }

    const doTest = () => {
        if (!validate())
            return;
        let testConfig = dataRef.current;
        if (doTestBefore)
            testConfig = doTestBefore(dataRef.current);
        const {targetDb, sql, filter} = testConfig;
        AuthFetchUtil.post(`/api/db/executor/execute`, {
            id: targetDb,
            statement: Base64Util.toBase64(sql!)
        }).then(async res => {
            if (res !== null) {
                res = await DataUtil.applyFilterAsync(res, filter);
                if (res != null) {
                    setTestRes(JSON.stringify(res, null, 2));
                    doTestAfter && doTestAfter(res);
                }
            } else {
                setTestRes(JSON.stringify({"msg": '请求错误'}, null, 2));
                doTestAfter && doTestAfter(null);
                globalMessage.messageApi?.warning('测试未通过: 请求错误');
            }
        })
    }

    const doSave = () => {
        if (!validate())
            return;
        onSave(dataRef.current, JSON.parse(testRes ?? '{}'));
    }

    const onFieldChange = (fieldChangeData: FieldChangeData) => {
        const {reRender, id, dataFragment} = fieldChangeData;
        if (id === 'doTest')
            doTest();
        else if (id === 'doSave')
            doSave();
        else
            dataRef.current = ObjectUtil.merge(dataRef.current, dataFragment);
        if (reRender)
            setCount(count + 1);
    }

    const schema: Control = {
        type: 'grid',
        config: {gridGap: '10px'},
        children: [
            {
                key: 'targetDb',
                label: '数据库',
                type: 'select',
                value: dataRef.current?.targetDb,
                reRender: true,
                config: {
                    options: dataSourceList
                }
            },
            {
                type: 'grid',
                label: '自动更新',
                config: {
                    columns: 2,
                    responsive: false,
                    columnGap: '12px',
                    controlStyle: {
                        gridTemplateColumns: '64px minmax(0, 1fr)',
                        justifyContent: 'start',
                    },
                },
                children: [
                    {
                        key: 'autoFlush',
                        type: 'switch',
                        value: !!dataRef.current?.autoFlush,
                    },
                    {
                        key: 'frequency',
                        type: 'number-input',
                        config: {
                            min: 5,
                            controlStyle: {
                                width: '100%',
                                maxWidth: 152,
                                minWidth: 0,
                            },
                        },
                        value: dataRef.current?.frequency || 5,
                    },
                ]
            },
            {
                type: 'card-panel',
                label: 'SQL语句',
                config: {
                    contentStyle: {padding: 0}
                },
                children: [
                    {
                        key: 'sql',
                        type: 'code-editor',
                        config: {
                            height: 160,
                            language: 'sql',
                            fullScreen: true
                        },
                        value: dataRef.current?.sql,
                    }
                ]
            },
            {
                type: 'card-panel',
                label: '过滤器',
                config: {
                    contentStyle: {padding: 0}
                },
                children: [
                    {
                        key: 'filter',
                        type: 'code-editor',
                        config: {
                            height: 200,
                            language: 'javascript',
                            fullScreen: true
                        },
                        value: dataRef.current?.filter || "function filter(data){\n\n\n\treturn data\n}",
                    }
                ]
            },
            {
                id: 'databaseTestRes',
                type: 'card-panel',
                label: '响应结果',
                config: {
                    contentStyle: {padding: 0}
                },
                children: [
                    {
                        id: 'databaseTestRes',
                        type: 'code-editor',
                        config: {
                            height: 200,
                            language: 'json'
                        },
                        reRender: true,
                        value: testRes,
                    }
                ]
            },
            {
                type: 'grid',
                config: {columns: 2},
                children: [
                    {
                        id: 'doTest',
                        type: 'button',
                        config: {
                            children: '测试SQL',
                            type: 'default',
                            background: '#474747',
                        }
                    },
                    {
                        id: 'doSave',
                        type: 'button',
                        config: {
                            children: '保存',
                        }
                    }
                ]
            },

        ]
    }

    return (
        <DatavisoolGUI schema={schema} onFieldChange={onFieldChange}/>
    );
}
