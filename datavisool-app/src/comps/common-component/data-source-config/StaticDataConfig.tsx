/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {useRef, useState } from "react";
import { Control, FieldChangeData, globalMessage, DatavisoolGUI} from "@datavisool/ui";
import { IStaticData } from "@datavisool/sdk/types";
import DataUtil from "@/util/DataUtil.ts";
import { SafeEvalUtil } from "@/util/SafeEvalUtil.ts";
import { resolveInitialStaticData } from "./StaticDataConfigUtil.ts";

export interface StaticDataConfigProps {
  draftValue?: any;
  defaultValue?: any;
  data: IStaticData;
  onSave: (data: any, testResult?: any) => void;
  saveUnchanged?: boolean;
}

export function StaticDataConfig(props: StaticDataConfigProps) {
  const { data, draftValue, defaultValue, onSave, saveUnchanged = false } = props;
  const dataRef = useRef<IStaticData>(
    resolveInitialStaticData(data, { draftValue, defaultValue })
  );
  const testResRef = useRef<string>("");
  const changedRef = useRef(false);
  const [, setCount] = useState(0);

  const resolvePreviewData = () => {
    return DataUtil.getStaticDataAsync(dataRef.current);
  };

  const flashStaticData = async () => {
    if (changedRef.current || saveUnchanged) {
      const finalData = await resolvePreviewData();
      if (finalData == null)
        globalMessage.messageApi?.error("格式错误，请检查");
      else onSave(dataRef.current, finalData);
    } else {
      globalMessage.messageApi?.info("数据无变化");
    }
  };

  const schema: Control = {
    type: "grid",
    config: { gridGap: "10px" },
    children: [
      {
        type: "code-editor",
        config: {
          height: 250,
          fullScreen: true,
        },
        value: JSON.stringify(dataRef.current.value, null, 2) || "",
      },
      {
        type: "card-panel",
        label: "过滤器",
        config: {
          contentStyle: { padding: 0 },
        },
        children: [
          {
            id: "filter",
            key: "filter",
            type: "code-editor",
            config: {
              height: 150,
              language: "javascript",
              fullScreen: true,
            },
            value:
              dataRef.current?.filter ||
              "function filter(data){\n\treturn data\n}",
          },
        ],
      },
      {
        type: "card-panel",
        label: "响应结果",
        config: {
          contentStyle: { padding: 0 },
        },
        children: [
          {
            id: "testRes",
            type: "code-editor",
            config: {
              readonly: true,
              height: 130,
            },
            reRender: true,
            value: testResRef.current || "",
          },
        ],
      },
      {
        type: "grid",
        config: { columns: 2 },
        children: [
          {
            id: "doTest",
            type: "button",
            config: {
              children: "测试",
              type: "default",
              background: "#474747",
            },
          },
          {
            id: "doStaticSave",
            type: "button",
            config: {
              children: "保存",
            },
          },
        ],
      },
    ],
  };

  const onFieldChange = (fieldChangeData: FieldChangeData) => {
    const { id, data } = fieldChangeData;
    switch (id) {
      case "doTest":
        doTest();
        break;
      case "doStaticSave":
        flashStaticData();
        break;
      case "filter":
        dataRef.current.filter = data as string;
        changedRef.current = true;
        break;
      case "testRes":
        break;
      default:
        dataRef.current.value = SafeEvalUtil.run(data as string);
        changedRef.current = true;
    }
  };

  const doTest = async () => {
    const result = await resolvePreviewData();
    if (result != null) {
      testResRef.current = JSON.stringify(result, null, 2);
      setCount((value) => value + 1);
    } else {
      globalMessage.messageApi?.error("格式错误，请检查");
    }
  };

  return <DatavisoolGUI schema={schema} onFieldChange={onFieldChange} />;
}
