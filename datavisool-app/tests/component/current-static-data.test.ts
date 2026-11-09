/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {expect, test} from 'vitest';
import DataUtil from '@/util/DataUtil.ts';

test('runtime reads wrapped static data and does not interpret old unwrapped values', async () => {
    expect(DataUtil.getStaticData({value: [1, 2]})).toEqual([1, 2]);
    expect(await DataUtil.getStaticDataAsync({value: false})).toBe(false);
    expect(DataUtil.getStaticData([1, 2] as any)).toBeNull();
    expect(await DataUtil.getStaticDataAsync({name: 'old'} as any)).toBeNull();
});
