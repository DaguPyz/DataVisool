/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

const {defineConfig} = require('vite');
const react = require('@vitejs/plugin-react');
const path = require('path');
const {externalPackages, externalGlobals} = require('./externals');

module.exports = defineConfig(({command}) => {
    return {
        plugins: [
            react({jsxRuntime: 'classic'}),
        ],
        define: {
            'process.env.NODE_ENV': JSON.stringify(command === 'serve' ? 'development' : 'production')
        },
        build: {
            outDir: path.resolve(process.cwd(), 'dist'),
            assetsInlineLimit: 0,
            cssCodeSplit: true,
            rollupOptions: {
                input: path.resolve(process.cwd(), 'src/main.ts'),
                external: externalPackages,
                output: {
                    format: 'iife',
                    name: '__DATAVISOOL_REMOTE_COMPONENT_TEMP__',
                    entryFileNames: '[name].js',
                    chunkFileNames: 'chunks/[name]-[hash].js',
                    assetFileNames: 'assets/[name]-[hash][extname]',
                    inlineDynamicImports: true,
                    minifyInternalExports: false,
                    globals: externalGlobals
                }
            }
        }
    }
});
