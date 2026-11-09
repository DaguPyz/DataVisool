/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {defineConfig} from 'vite'
import viteBaseConfig from "./vite.base.config";

const buildConfig = defineConfig({
    build: {
        outDir: 'dist',
        assetsDir: 'assets',
        emptyOutDir: true,
    }
})


export default {...viteBaseConfig, ...buildConfig}
