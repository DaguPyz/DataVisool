/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import React from 'react';
import {Accordion} from './Accordion';
import {Avatar} from './Avatar';
import {Button} from './Button';
import {Card} from './Card';
import {CardPanel} from './CardPanel';
import {CheckBox} from './CheckBox';
import {CodeEditor} from './CodeEditor';
import {ColorMode} from './ColorMode';
import {ColorPicker} from './ColorPicker';
import {ColorsPicker} from './ColorsPicker';
import {ControlGroup} from './ControlGroup';
import {Dialog} from './Dialog';
import {Dropdown} from './Dropdown';
import {Empty} from './Empty';
import {Grid} from './Grid';
import {GroupButton} from './GroupButton';
import {ImageUpload} from './ImageUpload';
import {Input} from './Input';
import {Menu} from './Menu';
import {NumberInput} from './NumberInput';
import {Pagination} from './Pagination';
import {Radio} from './Radio';
import {RangeSlider} from './RangeSlider';
import {Select} from './Select';
import {Slider} from './Slider';
import {Space} from './Space';
import {Spin} from './Spin';
import {SubAccordion} from './SubAccordion';
import {Switch} from './Switch';
import {Tabs} from './Tabs';
import {Tag} from './Tag';
import {TextArea} from './TextArea';
import {TextOnly} from './TextOnly';

const componentMap: Record<string, React.ComponentType<any>> = {
    accordion: Accordion,
    avatar: Avatar,
    'sub-accordion': SubAccordion,
    button: Button,
    card: Card,
    checkbox: CheckBox,
    'code-editor': CodeEditor,
    'color-mode': ColorMode,
    'color-picker': ColorPicker,
    'colors-picker': ColorsPicker,
    'control-group': ControlGroup,
    dialog: Dialog,
    dropdown: Dropdown,
    empty: Empty,
    grid: Grid,
    'group-button': GroupButton,
    'image-upload': ImageUpload,
    input: Input,
    menu: Menu,
    'number-input': NumberInput,
    pagination: Pagination,
    radio: Radio,
    select: Select,
    slider: Slider,
    space: Space,
    spin: Spin,
    'range-slider': RangeSlider,
    switch: Switch,
    tabs: Tabs,
    tag: Tag,
    'text-area': TextArea,
    'text-only': TextOnly,
    'card-panel': CardPanel,
};

export const UIMap = {
    get: (key: string) => componentMap[key],
    set: (key: string, component: React.ComponentType<any>) => {
        componentMap[key] = component;
    },
};
