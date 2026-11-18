/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {ErrorUiService} from '@/contracts/errorUi.ts';
import type {Plugin} from '@/visloom/index.ts';
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
