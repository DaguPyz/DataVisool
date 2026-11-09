/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {fireEvent, render, screen} from '@testing-library/react'
import {vi} from 'vitest'
import {Button, CheckBox, DatavisoolGUI, DataVisoolUIProvider, GroupButton, Input, Progress, Radio, Switch, Tag, TextArea, type Control} from '@datavisool/ui'

const schema: Control = {
    key: 'style',
    children: [{
        key: 'name',
        type: 'input',
        label: '名称',
        value: 'Demo',
        config: {placeholder: '请输入名称'},
    }],
}

describe('npm UI integration', () => {
    test('preserves schema field paths when editing a property', () => {
        const onFieldChange = vi.fn()
        render(<DatavisoolGUI schema={schema} onFieldChange={onFieldChange}/>);

        fireEvent.change(screen.getByRole('textbox'), {target: {value: 'Updated'}})

        expect(onFieldChange).toHaveBeenCalledWith(expect.objectContaining({
            data: 'Updated',
            dataKeyPath: ['style', 'name'],
            dataFragment: {style: {name: 'Updated'}},
        }))
    })

    test('updates schema translations on locale changes with the same translator', () => {
        let locale = 'zh-CN'
        const messages: Record<string, string> = {'名称': 'Name', '请输入名称': 'Enter a name'}
        const translate = (text: string) => locale === 'en-US' ? messages[text] ?? text : text
        const view = () => (
            <DataVisoolUIProvider locale={locale} translate={translate}>
                <DatavisoolGUI schema={schema}/>
            </DataVisoolUIProvider>
        )
        const {rerender} = render(view())
        expect(screen.getByText('名称')).toBeInTheDocument()

        locale = 'en-US'
        rerender(view())
        expect(screen.getByText('Name')).toBeInTheDocument()
        expect(screen.getByPlaceholderText('Enter a name')).toHaveValue('Demo')

        locale = 'zh-CN'
        rerender(view())
        expect(screen.getByText('名称')).toBeInTheDocument()
        expect(screen.getByPlaceholderText('请输入名称')).toHaveValue('Demo')
    })

    test('preserves button click and change callbacks and applies component styles', () => {
        const onChange = vi.fn()
        const onClick = vi.fn()
        render(<Button onChange={onChange} onClick={onClick} width={180} data-testid="button">Save</Button>)

        const button = screen.getByRole('button', {name: 'Save'})
        expect(button).toHaveStyle({width: '180px'})
        fireEvent.click(button)
        expect(onChange).toHaveBeenCalledOnce()
        expect(onClick).toHaveBeenCalledOnce()
    })

    test('keeps input clear behavior and reports string values', () => {
        const onChange = vi.fn()
        const onClear = vi.fn()
        render(<Input defaultValue="ready" allowClear onChange={onChange} onClear={onClear} />)

        fireEvent.change(screen.getByRole('textbox'), {target: {value: 'edited'}})
        expect(onChange).toHaveBeenLastCalledWith('edited')
        fireEvent.click(screen.getByRole('button', {name: '清空输入'}))
        expect(onChange).toHaveBeenLastCalledWith('')
        expect(onClear).toHaveBeenCalledOnce()
    })

    test('preserves checkbox and switch boolean changes and read-only behavior', () => {
        const checkboxChange = vi.fn()
        const switchChange = vi.fn()
        const {container} = render(<>
            <CheckBox text="Accept" defaultValue={false} onChange={checkboxChange} />
            <CheckBox text="Locked" defaultValue={false} readOnly onChange={checkboxChange} />
            <Switch text="Enabled" defaultValue={false} onChange={switchChange} />
        </>)

        fireEvent.click(screen.getByRole('checkbox', {name: 'Accept'}))
        fireEvent.click(screen.getByRole('checkbox', {name: 'Locked'}))
        fireEvent.click(container.querySelector('[role="switch"]')!)
        expect(checkboxChange).toHaveBeenCalledTimes(1)
        expect(checkboxChange).toHaveBeenLastCalledWith(true)
        expect(switchChange).toHaveBeenCalledOnce()
        expect(switchChange).toHaveBeenCalledWith(true)
    })

    test('reports radio and grouped-button selection values', () => {
        const radioChange = vi.fn()
        const groupChange = vi.fn()
        render(<>
            <Radio options={[{label: 'One', value: 'one'}, {label: 'Two', value: 'two'}]} defaultValue="one" onChange={radioChange} />
            <GroupButton items={[{content: 'A', value: 'a'}, {content: 'B', value: 'b'}]} defaultValue="a" onChange={groupChange} />
        </>)

        fireEvent.click(screen.getByRole('radio', {name: 'Two'}))
        fireEvent.click(screen.getByRole('radio', {name: 'B'}))
        expect(radioChange).toHaveBeenCalledWith('two')
        expect(groupChange).toHaveBeenCalledWith('b')
    })

    test('reports textarea text and clamps progress styles to valid percentages', () => {
        const onChange = vi.fn()
        render(<>
            <TextArea defaultValue="start" onChange={onChange} />
            <Progress percent={130} data-testid="progress" />
            <Tag color="#123456">Custom</Tag>
        </>)

        fireEvent.change(screen.getByRole('textbox'), {target: {value: 'updated'}})
        expect(onChange).toHaveBeenCalledWith('updated')
        expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
        expect(screen.getByText('Custom')).toHaveStyle({borderColor: 'rgb(18, 52, 86)'})
    })
})
