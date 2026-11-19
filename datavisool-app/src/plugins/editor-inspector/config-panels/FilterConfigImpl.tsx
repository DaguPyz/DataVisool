/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {useContext, useEffect, useRef, useState} from 'react';
import type {FilterConfigProps} from '@datavisool/sdk/host';
import {ObjectUtil} from '@datavisool/sdk';
import type {IFilterConfigType} from '@datavisool/sdk/types';
import FilterControls from '@/comps/common-component/filter-config/FilterControls.tsx';
import filterConfigVisual from '@/comps/common-component/filter-config/assets/filter-config-visual.webp';
import {InspectorDomainContext} from '../InspectorDomainContext.ts';
import './FilterConfig.less';

const defaultConfig: Required<IFilterConfigType> = {enable: false, blur: 0, brightness: 1, contrast: 1, opacity: 1, saturate: 1, hueRotate: 0};
const normalize = (value?: IFilterConfigType): Required<IFilterConfigType> => ({...defaultConfig, ...(value ?? {})});

export default function FilterConfigImpl(props: FilterConfigProps) {
    const context = useContext(InspectorDomainContext);
    const facade = props.controller as (typeof props.controller & {isCurrent?: () => boolean}) | undefined;
    const initial = normalize(facade?.getConfig()?.filter);
    const [config, setConfig] = useState(initial);
    const currentRef = useRef(initial);
    useEffect(() => {
        const next = normalize(facade?.getConfig()?.filter);
        currentRef.current = next;
        setConfig(next);
    }, [facade, context?.domain, context?.target.id]);
    if (!context || !facade?.isCurrent?.() || !context.domain.isActive()) return null;
    const onChange = (next: IFilterConfigType) => {
        if (!context.canEdit() || !facade.isCurrent?.()) return;
        const normalized = ObjectUtil.merge({...currentRef.current}, next) as Required<IFilterConfigType>;
        currentRef.current = normalized;
        setConfig(normalized);
        context.domain.applyFilter(context.target.id, normalized);
    };
    return <div className="filter-config"><FilterControls variant="component" config={config} previewImage={filterConfigVisual} onChange={onChange}/></div>;
}
