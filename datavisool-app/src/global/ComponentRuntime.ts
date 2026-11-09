/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React from "react";
import * as ReactDOM from "react-dom";
import * as ReactDOMClient from "react-dom/client";
import * as SDK from "@datavisool/sdk";
import * as DataVisoolTypes from "@datavisool/sdk/types";
import * as DataVisoolUI from "@datavisool/ui";
import * as BasicUI from "@datavisool/ui/basic";
import * as SchemaUI from "@datavisool/ui/schema";
import * as CodeEditorUI from "@datavisool/ui/code-editor";
import * as FeedbackUI from "@datavisool/ui/feedback";
import AbstractDesignerController from "@/framework/core/AbstractDesignerController";
import AbstractDesignerDefinition from "@/framework/core/AbstractDesignerDefinition";
import {AbstractDefinition} from "@datavisool/sdk/core";
import ComponentUtil from "@/util/ComponentUtil";
import BPExecutor from "@/designer/blueprint/core/BPExecutor";

/** The host supplies Web-specific data loading and blueprint execution. */
export const componentSdk = {...SDK, AbstractDesignerController, AbstractDesignerDefinition, AbstractDefinition, BPExecutor, ComponentUtil} satisfies Omit<typeof SDK, 'ComponentUtil'> & {ComponentUtil: typeof ComponentUtil};
export const componentUI = {...DataVisoolUI, ...BasicUI, ...SchemaUI, ...CodeEditorUI, ...FeedbackUI};

export function exportComponentRuntime(): void {
    window.React = React;
    window.ReactDOM = {...ReactDOM, ...ReactDOMClient};
    window.DataVisoolSDK = componentSdk;
    window.DataVisoolTypes = DataVisoolTypes;
    window.DataVisoolUI = componentUI;
}
