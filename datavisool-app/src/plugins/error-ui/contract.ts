/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {ComponentType} from 'react';
import type {AppErrorBoundaryProps} from '@/components/app-error/AppErrorBoundary.tsx';
import type {ErrorPageProps} from '@/pages/result/Error.tsx';
import {createServiceKey} from '@/visloom/index.ts';

export interface ErrorUiService {
    readonly ErrorBoundary: ComponentType<AppErrorBoundaryProps>;
    readonly ErrorPage: ComponentType<ErrorPageProps>;
}

export const errorUiKey = createServiceKey<ErrorUiService>('app/error-ui');
