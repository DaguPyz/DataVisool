/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

export function buildErrorCode(): string {
    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `ERR-${stamp}-${suffix}`;
}
