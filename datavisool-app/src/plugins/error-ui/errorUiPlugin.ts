/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import AppErrorBoundary from '@/components/app-error/AppErrorBoundary.tsx';
import ErrorPage from '@/pages/result/Error.tsx';
import type {Plugin} from '@/visloom/index.ts';
import {errorUiKey, type ErrorUiService} from './contract.ts';

const errorUi: ErrorUiService = Object.freeze({ErrorBoundary: AppErrorBoundary, ErrorPage});

export function createErrorUiPlugin(): Plugin {
    return {
        id: 'error-ui',
        requires: [],
        provides: [errorUiKey],
        activate(context) {
            context.provide(errorUiKey, errorUi);
        },
    };
}
