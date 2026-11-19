/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
    BaseInfo, ThemeConfig, DataConfig, AnimationConfig, FilterConfig,
    registerHostConfigPanel, registerHostConfigPanels,
} from '@datavisool/sdk/host';
import {createDesignerRuntimePlugin} from '../src/plugins/designer-runtime/designerRuntimePlugin.ts';
import {Visloom} from '../src/visloom/index.ts';

const props = {controller: {}};
const missingBaseInfo = () => assert.throws(() => BaseInfo(props), /requires the editor host/);

test('single panel registrations restore the previous live owner and ignore repeated stale disposal', t => {
    const original = () => null;
    const replacement = () => null;
    const first = registerHostConfigPanel('BaseInfo', original);
    const second = registerHostConfigPanel('BaseInfo', replacement);
    t.after(() => { second(); first(); });
    assert.equal(BaseInfo(props).type, replacement);
    second();
    assert.equal(BaseInfo(props).type, original);
    const third = registerHostConfigPanel('BaseInfo', replacement);
    t.after(third);
    second();
    assert.equal(BaseInfo(props).type, replacement);
    third();
    first();
    missingBaseInfo();
});

test('equal component functions still have separate registration lifetimes and can be withdrawn out of order', t => {
    const panel = () => null;
    const top = () => null;
    const first = registerHostConfigPanel('BaseInfo', panel);
    const second = registerHostConfigPanel('BaseInfo', panel);
    const third = registerHostConfigPanel('BaseInfo', top);
    t.after(() => { third(); second(); first(); });
    first();
    assert.equal(BaseInfo(props).type, top);
    third();
    assert.equal(BaseInfo(props).type, panel);
    first();
    assert.equal(BaseInfo(props).type, panel);
    second();
    missingBaseInfo();
});

test('partial panel batches preserve other keys and withdraw only their own entries', t => {
    const theme = () => null;
    const base = () => null;
    const removeTheme = registerHostConfigPanels({ThemeConfig: theme});
    const removeBase = registerHostConfigPanels({BaseInfo: base});
    t.after(() => { removeBase(); removeTheme(); });
    assert.equal(ThemeConfig(props).type, theme);
    assert.equal(BaseInfo(props).type, base);
    removeBase();
    missingBaseInfo();
    assert.equal(ThemeConfig(props).type, theme);
});

test('the original five-panel batch remains supported', t => {
    const panels = {
        BaseInfo: () => null,
        ThemeConfig: () => null,
        DataConfig: () => null,
        AnimationConfig: () => null,
        FilterConfig: () => null,
    };
    const remove = registerHostConfigPanels(panels);
    t.after(remove);
    for (const [key, render] of Object.entries({BaseInfo, ThemeConfig, DataConfig, AnimationConfig, FilterConfig})) {
        assert.equal(render(props).type, panels[key]);
    }
    remove();
    missingBaseInfo();
});

test('runtime stop withdraws registered panels and a captured capability rejects late registrations', async t => {
    const application = new Visloom();
    await application.start([createDesignerRuntimePlugin()]);
    t.after(() => application.stop());
    const runtime = application.get('designerRuntime');
    const panel = () => null;
    const unregister = runtime.registerHostConfigPanels({BaseInfo: panel});
    assert.equal(BaseInfo(props).type, panel);
    await application.stop();
    missingBaseInfo();
    assert.throws(() => runtime.registerHostConfigPanels({BaseInfo: panel}), {name: 'AbortError'});
    unregister();
});
