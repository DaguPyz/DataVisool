/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

export interface ReportService {
    /** Format a report title for display. */
    formatTitle(title: string): string;
}

declare module '@datavisool/plugin-api' {
    interface PluginServices {
        reports: ReportService;
    }
}
