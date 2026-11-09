/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {describe, expect, it, vi, beforeEach} from 'vitest'

vi.mock('@/util/AuthFetchUtil.ts', () => ({
    default: {
        get: vi.fn()
    }
}))

import {BaseApi} from '@/api/engineering/BaseApi.ts'
import AuthFetchUtil from '@/util/AuthFetchUtil.ts'

describe('BaseApi.getProjectMeta', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('loads project meta and parses pid/dataJson', async () => {
        vi.mocked(AuthFetchUtil.get).mockResolvedValue({
            id: 'child-1',
            name: '子项目',
            pid: 'root-1',
            dataJson: '{"layerManager":{"elemConfigs":{"screen":{"base":{"type":"ScreenReference"},"style":{"screenId":"ref-1"}}}}}'
        })

        const api = new BaseApi()
        const result = await api.getProjectMeta('child-1')

        expect(AuthFetchUtil.get).toHaveBeenCalledWith('/api/project/getProjectInfo/child-1')
        expect(result).toEqual({
            id: 'child-1',
            name: '子项目',
            pid: 'root-1',
            data: {
                layerManager: {
                    elemConfigs: {
                        screen: {
                            base: {type: 'ScreenReference'},
                            style: {screenId: 'ref-1'}
                        }
                    }
                }
            }
        })
    })

    it('returns null when project meta endpoint returns null', async () => {
        vi.mocked(AuthFetchUtil.get).mockResolvedValue(null)

        const api = new BaseApi()
        const result = await api.getProjectMeta('missing')

        expect(result).toBeNull()
    })
})
