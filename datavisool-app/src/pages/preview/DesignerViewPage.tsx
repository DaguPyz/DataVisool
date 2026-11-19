/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import type {DesignerSessionFactory} from '@datavisool/sdk/plugin/contracts/designerRuntime';
import {URLUtil} from "@datavisool/sdk";
import DesignerView from "./DesignerView.tsx";

export default function DesignerViewPage({createSession}: {createSession: DesignerSessionFactory}) {
    const {id} = URLUtil.parseUrlParams();
    return <DesignerView key={id} id={id} createSession={createSession}/>
}
