/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import assert from 'node:assert/strict';
import test from 'node:test';
import {createCanvasShortcutInput} from '../src/plugins/editor-canvas/shortcutInput.ts';
import {createShortcutEffects} from '../src/plugins/editor-shortcuts/shortcutEffects.ts';

test('withdrawing a held input source updates the canvas and a stale disposer preserves a new registration', () => {
    const input = createCanvasShortcutInput();
    const changes = [];
    let stopCount = 0;
    let notify;
    const source = {
        isActive: () => true,
        isActiveWithExactModifiers: () => true,
        subscribePressedState(listener) { notify = listener; return () => { stopCount++; }; },
    };
    const unsubscribe = input.query.subscribePressedState(() => changes.push(input.query.isActive('held')));
    assert.equal(input.query.isActive('held'), false);
    const first = input.register(source);
    const staleNotify = notify;
    notify();
    assert.throws(() => input.register(source), /already registered/);
    first();
    const second = input.register(source);
    first();
    staleNotify();
    assert.equal(input.query.isActiveWithExactModifiers('held'), true);
    assert.equal(stopCount, 1);
    second();
    assert.deepEqual(changes, [true, true, false, true, false]);
    unsubscribe();
    input.dispose();
    assert.throws(() => input.register(source), /disposed/);
    assert.equal(stopCount, 2);
});

test('a failed input subscription does not block a later valid registration', () => {
    const input = createCanvasShortcutInput();
    assert.throws(() => input.register({subscribePressedState() { throw new Error('fixture'); }}), /fixture/);
    const stop = input.register({isActive: () => false, subscribePressedState: () => () => {}});
    stop();
    input.dispose();
});

test('stop pauses listeners before view unmount, cancellation resumes once, and late lazy effects stay inactive', () => {
    const effects = createShortcutEffects();
    let listeners = 0;
    const register = () => effects.register(() => { listeners++; return () => { listeners--; }; });
    const unmount = register();
    assert.equal(listeners, 1);
    effects.pause();
    assert.equal(listeners, 0);
    const lateUnmount = register();
    assert.equal(listeners, 0);
    effects.resume();
    effects.resume();
    assert.equal(listeners, 2);
    effects.pause();
    unmount();
    effects.resume();
    assert.equal(listeners, 1);
    effects.dispose();
    lateUnmount();
    register()();
    assert.equal(listeners, 0);
});

test('cleanup failure still removes other owned listeners', () => {
    const effects = createShortcutEffects();
    let active = true;
    effects.register(() => () => { throw new Error('fixture'); });
    effects.register(() => () => { active = false; });
    assert.throws(() => effects.pause(), AggregateError);
    assert.equal(active, false);
    effects.dispose();
});

test('stop waits for an already started action and rejects late actions until cancellation resumes input', async () => {
    const effects = createShortcutEffects();
    let complete;
    let calls = 0;
    const action = effects.run(() => new Promise(resolve => { complete = () => { calls++; resolve(); }; }));
    effects.pause();
    let prepared = false;
    const prepare = effects.waitForTasks().then(() => { prepared = true; });
    await effects.run(() => { calls++; });
    assert.equal(calls, 0);
    assert.equal(prepared, false);
    complete();
    await Promise.all([action, prepare]);
    assert.equal(calls, 1);
    effects.resume();
    await effects.run(() => { calls++; });
    assert.equal(calls, 2);
    effects.dispose();
});
