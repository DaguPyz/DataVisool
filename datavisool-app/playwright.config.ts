/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {defineConfig, devices} from '@playwright/test';

export default defineConfig({
    testDir: './tests/e2e',
    forbidOnly: !!process.env.CI,
    use: {
        headless: true,
        baseURL: 'http://127.0.0.1:4179',
        trace: 'retain-on-failure',
    },
    projects: [{
        name: 'chromium',
        use: {
            ...devices['Desktop Chrome'],
            channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || 'chromium',
        },
    }],
    webServer: {
        command: 'pnpm exec vite --config vite.dev.config.ts --host 127.0.0.1 --port 4179 --strictPort',
        url: 'http://127.0.0.1:4179/login',
        reuseExistingServer: false,
        timeout: 120_000,
    },
});
