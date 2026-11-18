/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {Plugin} from '@datavisool/plugin-api';
import type {} from './contracts/report.js';

export default function createReportPlugin(): Plugin {
    return {
        id: 'example/report-plugin',
        requires: [],
        provides: ['reports'],
        activate(ctx) {
            ctx.provide('reports', {
                formatTitle: title => `Report: ${title.trim()}`,
            });
        },
    };
}
