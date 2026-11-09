/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import componentDocsPlugin from './scripts/component-docs-plugin'
import userGuidePlugin from './scripts/user-guide.mjs'

export default defineConfig({
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    plugins: [componentDocsPlugin(), userGuidePlugin(), react()],
})
