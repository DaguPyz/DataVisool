/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {expect, it} from 'vitest';
import {parseFontFamilyNames} from '@/util/FontFamilyUtil';

it('parses quoted names, commas and CSS escapes without collecting generic families', () => {
    expect(parseFontFamilyNames('"Wide, Display", Open Sans, sans-serif')).toEqual(['Wide, Display', 'Open Sans']);
    expect(parseFontFamilyNames('"Escaped \\" Font", "\\41 rial", monospace')).toEqual(['Escaped " Font', 'Arial']);
    expect(parseFontFamilyNames('"serif", serif, var(--font), system-ui')).toEqual(['serif']);
    expect(parseFontFamilyNames('"unterminated')).toEqual([]);
});
