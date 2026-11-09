/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React, {ReactNode} from 'react';
import {
    Button as DatavisoolButton,
    ColorPicker as DatavisoolColorPicker,
    Input as DatavisoolInput,
    NumberInput as DatavisoolNumberInput,
    Select as DatavisoolSelect,
    Slider as DatavisoolSlider,
    Switch as DatavisoolSwitch,
} from '@datavisool/ui';
import type {ButtonProps as DatavisoolButtonProps, ISelectOption} from '@datavisool/ui';

type SelectValue = string | number;

const mapSize = (size?: string): 'sm' | 'md' | 'lg' | undefined => {
    if (size === 'small')
        return 'sm';
    if (size === 'large')
        return 'lg';
    if (size === 'middle')
        return 'md';
    return size === 'sm' || size === 'md' || size === 'lg' ? size : undefined;
};

export function MapLibreButton({size, danger, type, ...props}: Omit<DatavisoolButtonProps, 'size'> & {
    size?: 'small' | 'middle' | 'large' | 'sm' | 'md' | 'lg' | 'icon';
    danger?: boolean;
}) {
    const buttonSize = size === 'icon' ? 'icon' : size === 'small' || size === 'sm' ? 'sm' : size === 'large' || size === 'lg' ? 'lg' : 'default';
    return (
        <DatavisoolButton
            {...props}
            type={type}
            variant={danger ? 'destructive' : props.variant}
            size={buttonSize}
        />
    );
}

export function MapLibreInput({value, onChange, size, ...props}: {
    value?: string;
    disabled?: boolean;
    placeholder?: string;
    style?: React.CSSProperties;
    size?: 'small' | 'middle' | 'large';
    onChange?: (event: {target: {value: string}}) => void;
}) {
    return (
        <DatavisoolInput
            {...props}
            value={value}
            inputSize={mapSize(size)}
            onChange={(next) => onChange?.({target: {value: next}})}
        />
    );
}

export function MapLibreNumberInput(props: {
    value?: number;
    defaultValue?: number;
    min?: number;
    max?: number;
    step?: number;
    precision?: number;
    controls?: boolean;
    prefix?: React.ReactNode;
    suffix?: React.ReactNode;
    disabled?: boolean;
    placeholder?: string;
    style?: React.CSSProperties;
    size?: 'small' | 'middle' | 'large';
    onChange?: (value: number | undefined) => void;
}) {
    const {size, controls, ...rest} = props;
    return <DatavisoolNumberInput {...rest} controls={controls ?? (size === 'small' ? false : undefined)}/>;
}

export function MapLibreSelect(props: {
    value?: SelectValue;
    options?: ISelectOption[];
    disabled?: boolean;
    placeholder?: string;
    className?: string;
    style?: React.CSSProperties;
    size?: 'small' | 'middle' | 'large';
    onChange?: (value: any) => void;
}) {
    const {size, ...rest} = props;
    return <DatavisoolSelect {...rest} selectSize={mapSize(size)}/>;
}

export function MapLibreSwitch({checked, value, onChange, size, style, ...props}: {
    checked?: boolean;
    value?: boolean;
    disabled?: boolean;
    style?: React.CSSProperties;
    size?: 'small' | 'middle' | 'large';
    onChange?: (value: boolean) => void;
}) {
    void style;
    return <DatavisoolSwitch {...props} value={checked ?? value} switchSize={mapSize(size)} onChange={onChange}/>;
}

export function MapLibreSlider(props: {
    value?: number;
    min?: number;
    max?: number;
    step?: number;
    disabled?: boolean;
    onChange?: (value: number) => void;
}) {
    return <DatavisoolSlider {...props}/>;
}

export function MapLibreColorPicker({onChange, size, ...props}: {
    value?: string;
    showText?: boolean;
    disabled?: boolean;
    modes?: Array<'single' | 'linear' | 'mirror' | 'radial'>;
    size?: 'small' | 'middle' | 'large';
    onChange?: (color: {toHexString: () => string}) => void;
}) {
    void size;
    return (
        <DatavisoolColorPicker
            {...props}
            modes={props.modes ?? ['single']}
            onChange={(color) => onChange?.({toHexString: () => color})}
        />
    );
}

export function MapLibreField({label, tip, children, inline}: {
    label: string;
    tip?: string;
    children: ReactNode;
    inline?: boolean;
}) {
    const labelText = (
        <span className={'mlgis-field-label-text'} title={tip ?? label}>{label}</span>
    );
    const labelNode = (
        <div className={inline ? 'mlgis-field-label-inline' : 'mlgis-field-label'}>
            {labelText}
        </div>
    );

    if (inline) {
        return (
            <div className={'mlgis-field mlgis-field-inline'}>
                {labelNode}
                <div className={'mlgis-field-body-inline'}>{children}</div>
            </div>
        );
    }

    return (
        <div className={'mlgis-field'}>
            <div className={'mlgis-field-head'}>{labelNode}</div>
            <div className={'mlgis-field-body'}>{children}</div>
        </div>
    );
}

export function MapLibreDrawer({open, title, extra, children, className = '', size = 560, onClose}: {
    open: boolean;
    title: ReactNode;
    extra?: ReactNode;
    children?: ReactNode;
    className?: string;
    size?: number;
    onClose: () => void;
}) {
    if (!open)
        return null;

    return (
        <div className={'mlgis-drawer-mask'} onMouseDown={onClose}>
            <aside
                className={`mlgis-config-drawer ${className}`.trim()}
                style={{width: size}}
                onMouseDown={(event) => event.stopPropagation()}
            >
                <div className={'mlgis-config-drawer-header'}>
                    <div className={'mlgis-config-drawer-title'}>{title}</div>
                    <div className={'mlgis-config-drawer-actions'}>
                        {extra}
                        <DatavisoolButton type={'text'} size={'icon'} aria-label={'关闭'} onClick={onClose}>×</DatavisoolButton>
                    </div>
                </div>
                <div className={'mlgis-config-drawer-body'}>
                    {children}
                </div>
            </aside>
        </div>
    );
}

export function MapLibreActionButton({title, danger, children, onClick}: {
    title: string;
    danger?: boolean;
    children: ReactNode;
    onClick: () => void;
}) {
    return (
        <button
            type={'button'}
            className={`mlgis-action${danger ? ' mlgis-danger' : ''}`}
            title={title}
            aria-label={title}
            onClick={onClick}
        >
            {children}
        </button>
    );
}
