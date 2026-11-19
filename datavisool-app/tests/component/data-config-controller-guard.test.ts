/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {describe, expect, it} from 'vitest'
import {isDataConfigControllerCurrent} from '@/comps/common-component/data-config/DataConfigControllerGuard.ts'

const createController = (id: string | null) => ({
    config: id ? {base: {id}} : null,
    getConfig() {
        return this.config;
    },
})

describe('DataConfig controller guard', () => {
    it('accepts an active scene facade without reading a manager singleton', () => {
        const rawController = createController('text-a');
        const sceneFacade = {...rawController, isCurrent: () => true};

        expect(isDataConfigControllerCurrent(sceneFacade as never, 'text-a', {})).toBe(true);
    });

    it('accepts a legacy raw controller only when the caller supplies the owning table', () => {
        const rawController = createController('text-a');

        expect(isDataConfigControllerCurrent(rawController as never, 'text-a', {
            'text-a': rawController as never,
        })).toBe(true);
    });

    it('rejects a legacy controller missing from the explicitly supplied table', () => {
        const rawController = createController('text-a');

        expect(isDataConfigControllerCurrent(rawController as never, 'text-a', {
            'other': createController('other') as never,
        })).toBe(false);
    });

    it('rejects stale facades even when the id still maps to another controller', () => {
        const staleController = createController('text-a');
        const staleFacade = {...staleController, isCurrent: () => false};
        const currentController = createController('text-a');

        expect(isDataConfigControllerCurrent(staleFacade as never, 'text-a', {
            'text-a': currentController as never,
        })).toBe(false);
    });

    it('rejects a legacy controller whose bound config id has changed', () => {
        const rawController = createController('text-a');

        expect(isDataConfigControllerCurrent(rawController as never, 'old-text', {
            'old-text': createController('old-text') as never,
        })).toBe(false);
    });
})
