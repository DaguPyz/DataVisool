/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    plugins: [
        react(),
        dts({
            include: ['src'],
            exclude: ['src/demo'],
            entryRoot: 'src',
        }),
    ],
    build: {
        copyPublicDir: false,
        lib: {
            entry: {
                'datavisool-ui': path.resolve(__dirname, 'src/main.ts'),
                ...Object.fromEntries(['feedback', 'basic', 'schema', 'code-editor'].map(name => [name, path.resolve(__dirname, `src/${name}.ts`)])),
            },
            formats: ['es'],
            fileName: (_format, name) => `${name}.js`,
        },
        rollupOptions: {
            maxParallelFileOps: 1,
            external: ['react', 'react-dom', 'react/jsx-runtime'],
            output: {
                preserveModules: true,
                preserveModulesRoot: 'src',
                globals: {
                    react: 'React',
                    'react-dom': 'ReactDOM',
                    'react/jsx-runtime': 'jsxRuntime',
                },
            },
        },
    },
});
