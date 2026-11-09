/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {defineConfig} from 'vite'
import viteBaseConfig from "./vite.base.config";

// https://vitejs.dev/config/
const datavisoolServerDevTarget = process.env.DATAVISOOL_SERVER_DEV_TARGET || 'http://127.0.0.1:8080';

const devConfig = defineConfig({
    optimizeDeps: {
        // Pixi loads renderer chunks during Application.init(). Pre-bundle it at
        // startup so opening the lazy blueprint view does not trigger optimization.
        include: ['pixi.js'],
    },
    server: {
        proxy: {
            '^/(api|static)/.*': {
                target: datavisoolServerDevTarget,
                changeOrigin: true,
            },
        }
    },
    css: {
        preprocessorOptions: {
            //对css预处理器默认配置的覆盖
        },
        devSourcemap: true,
        postcss: {}
    },
})

export default {...viteBaseConfig, ...devConfig}
