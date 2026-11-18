/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

const {defineConfig} = require('vite');
const react = require('@vitejs/plugin-react');

module.exports = defineConfig(({command}) => {
    return {
        plugins: [
            react(),
        ],
        server: {
            port: 8848
        }
    }
});
