/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {fireEvent, render, screen} from '@testing-library/react';
import {afterAll, beforeAll, expect, it, vi} from 'vitest';

const {client, connect} = vi.hoisted(() => {
    const client = {subscribe: vi.fn(), end: vi.fn(), on: vi.fn()};
    return {client, connect: vi.fn(() => client)};
});
vi.mock('mqtt', () => ({default: {connect}}));

import {MQTTConfig} from '@/comps/common-component/data-source-config/MQTTConfig';

const originalRect = Object.getOwnPropertyDescriptor(Range.prototype, 'getBoundingClientRect');
const originalRects = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');
beforeAll(() => {
    if (!originalRect) Object.defineProperty(Range.prototype, 'getBoundingClientRect', {configurable: true, value: () => new DOMRect()});
    if (!originalRects) Object.defineProperty(Range.prototype, 'getClientRects', {configurable: true, value: () => []});
});
afterAll(() => {
    if (!originalRect) delete (Range.prototype as Partial<Range>).getBoundingClientRect;
    if (!originalRects) delete (Range.prototype as Partial<Range>).getClientRects;
});

it('trims topic boundaries when testing the MQTT configuration', () => {
    render(<MQTTConfig data={{host: 'ws://localhost', port: 1883, topics: '  test/data , floor 1/temp , x\\s/y  '} as never} onSave={vi.fn()}/>);
    fireEvent.click(screen.getByRole('button', {name: '测试'}));
    expect(client.subscribe).toHaveBeenCalledWith(['test/data', 'floor 1/temp', 'x\\s/y'], {qos: 0}, expect.any(Function));
});
