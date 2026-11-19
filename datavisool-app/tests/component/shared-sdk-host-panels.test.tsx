/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it} from 'vitest';
import {AnimationConfig, BaseInfo, DataConfig, FilterConfig, ThemeConfig, registerHostConfigPanels} from '@datavisool/sdk/host';

let unregister: (() => void) | undefined;
afterEach(() => {
    unregister?.();
    unregister = undefined;
});

describe('shared SDK editor host panels', () => {
    it('routes SDK consumers through the registered host implementations and removes them on disposal', () => {
        const controller = {} as any;
        unregister = registerHostConfigPanels({
            BaseInfo: () => <div>web base panel</div>,
            AnimationConfig: () => <div>web animation panel</div>,
            ThemeConfig: () => <div>web theme panel</div>,
            DataConfig: () => <div>web data panel</div>,
            FilterConfig: () => <div>web filter panel</div>,
        });
        render(<><BaseInfo controller={controller}/><AnimationConfig controller={controller}/><ThemeConfig controller={controller}/><DataConfig controller={controller}/><FilterConfig controller={controller}/></>);
        expect(screen.getByText('web base panel')).toBeInTheDocument();
        expect(screen.getByText('web animation panel')).toBeInTheDocument();
        expect(screen.getByText('web theme panel')).toBeInTheDocument();
        expect(screen.getByText('web data panel')).toBeInTheDocument();
        expect(screen.getByText('web filter panel')).toBeInTheDocument();
        unregister();
        unregister = undefined;
        expect(() => AnimationConfig({controller})).toThrow('requires the editor host');
    });
});
