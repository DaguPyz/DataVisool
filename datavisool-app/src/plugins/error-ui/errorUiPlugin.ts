/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {ErrorUiService} from '@datavisool/sdk/plugin/contracts/errorUi';
import type {Plugin} from '@datavisool/sdk/plugin';
import AppErrorBoundary from './AppErrorBoundary.tsx';
import ErrorPage from './ErrorPage.tsx';

const errorUi: ErrorUiService = Object.freeze({ErrorBoundary: AppErrorBoundary, ErrorPage});

export function createErrorUiPlugin(): Plugin {
    return {
        id: 'error-ui',
        requires: [],
        provides: ['errorUi'],
        activate(context) {
            context.provide('errorUi', errorUi);
        },
    };
}
