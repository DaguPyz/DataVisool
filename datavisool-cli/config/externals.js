/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
const externalGlobals = {
    react: 'React',
    'react-dom': 'ReactDOM',
    'react-dom/client': 'ReactDOM',
    '@datavisool/sdk': 'DataVisoolSDK',
    '@datavisool/sdk/core': 'DataVisoolSDK',
    '@datavisool/sdk/utils': 'DataVisoolSDK',
    '@datavisool/sdk/react': 'DataVisoolSDK',
    '@datavisool/sdk/host': 'DataVisoolSDK',
    '@datavisool/sdk/types': 'DataVisoolTypes',
    '@datavisool/ui': 'DataVisoolUI',
    '@datavisool/ui/feedback': 'DataVisoolUI',
    '@datavisool/ui/basic': 'DataVisoolUI',
    '@datavisool/ui/schema': 'DataVisoolUI',
    '@datavisool/ui/code-editor': 'DataVisoolUI',
};

module.exports = {externalGlobals, externalPackages: Object.keys(externalGlobals)};
