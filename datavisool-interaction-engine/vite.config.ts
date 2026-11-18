/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import {defineConfig} from 'vite';
import path from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    plugins: [
        dts({
            include: ['src'],
            exclude: ['src/demo', 'tests'],
            entryRoot: 'src',
        }),
    ],
    server: {
        host: '127.0.0.1',
        strictPort: false,
        cors: false,
    },
    preview: {
        host: '127.0.0.1',
    },
    build: {
        copyPublicDir: false,
        lib: {
            entry: path.resolve(__dirname, 'src/main.ts'),
            formats: ['es'],
            fileName: 'datavisool-interaction-engine',
        },
    },
});
