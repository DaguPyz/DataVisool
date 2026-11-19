/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, expect, it, vi} from 'vitest';
import {DesignerMode} from '@datavisool/sdk/types';
import DesignerRuntimeContext from '@/plugins/designer-runtime/internal/DesignerRuntimeContext';
vi.mock('@/plugins/designer-runtime/internal/builtin/loop-container/LoopContainer.tsx', () => ({default: () => null}));
vi.mock('@/plugins/designer-runtime/internal/designer/manager/DesignerManager.ts', () => ({default: class {
    scene: any; variableOwner: any; id: any; name: any;
    layerManager = {controllers: {}, layerConfigs: {}};
    canvasManager = {canvasConfig: {}};
    runtimeContext: any;
    constructor(scene: any) {this.scene = scene;}
    attachRuntimeContext(runtimeContext: any) {
        if (this.runtimeContext === runtimeContext) return;
        this.runtimeContext?.unregisterManager(this);
        this.runtimeContext = runtimeContext;
        runtimeContext?.registerManager(this);
    }
    isRuntimeEffectActive() { return true; }
    getRuntimeGeneration() { return 1; }
    init() {}
    destroy() { this.runtimeContext?.unregisterManager(this); }
}}));
const originalEnv = window.DATAVISOOL_ENV;
afterEach(() => {window.DATAVISOOL_ENV = originalEnv; vi.restoreAllMocks();});
it('inherits the owning page scope through nested loops', async () => {
    const {default: Controller} = await import('@/plugins/designer-runtime/internal/builtin/loop-container/LoopContainerController');
    const ComponentUtil = (await import('@/util/ComponentUtil')).default;
    vi.spyOn(ComponentUtil, 'createAndRender').mockResolvedValue({setEventHandler: vi.fn()} as any);
    window.DATAVISOOL_ENV = {mode: DesignerMode.PREVIEW} as any;
    const runtimeContext = new DesignerRuntimeContext();
    const page = {globalVariableManager: {}, runtimeContext};
    const parent = new Controller(); parent.designerManager = page as any;
    const child = new Controller();
    const config = {base: {id: 'loop', type: 'LoopContainer'}, managerData: {}} as any;
    const executor = {triggerComponentEvent: vi.fn()} as any;
    try {
        await parent.create(document.createElement('div'), config, executor);
        expect(parent.manager.variableOwner).toBe(page);
        child.designerManager = parent.manager;
        await child.create(document.createElement('div'), config, executor);
        expect(child.manager.variableOwner).toBe(page);
    } finally {
        parent.destroy();
        child.destroy();
        runtimeContext.dispose();
    }
});
