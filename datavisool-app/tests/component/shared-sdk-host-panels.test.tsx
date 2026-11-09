/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {render, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import {AnimationConfig, BaseInfo, DataConfig, FilterConfig, ThemeConfig} from '@datavisool/sdk/host';

vi.mock('@/comps/common-component/base-info/BaseInfo', () => ({default: () => <div>web base panel</div>}));
vi.mock('@/comps/common-component/animation-config/AnimationConfig', () => ({default: () => <div>web animation panel</div>}));
vi.mock('@/comps/common-component/theme-config/ThemeConfig', () => ({default: () => <div>web theme panel</div>}));
vi.mock('@/comps/common-component/data-config/DataConfig', () => ({default: () => <div>web data panel</div>}));
vi.mock('@/comps/common-component/filter-config/FilterConfig', () => ({default: () => <div>web filter panel</div>}));

// The editor entry registers the Web implementations for SDK component bundles.
import '@/global/ExportEditGlobalMember';

describe('shared SDK editor host panels', () => {
    it('renders the Web implementation through each shared SDK panel', () => {
        const controller = {} as any;
        render(<><BaseInfo controller={controller}/><AnimationConfig controller={controller}/><ThemeConfig controller={controller}/><DataConfig controller={controller}/><FilterConfig controller={controller}/></>);
        expect(screen.getByText('web base panel')).toBeInTheDocument();
        expect(screen.getByText('web animation panel')).toBeInTheDocument();
        expect(screen.getByText('web theme panel')).toBeInTheDocument();
        expect(screen.getByText('web data panel')).toBeInTheDocument();
        expect(screen.getByText('web filter panel')).toBeInTheDocument();
    });
});
