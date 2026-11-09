import {afterEach, describe, expect, it, vi} from 'vitest';

const componentPath = '../../src/comps/builtin/3d-model/ThreeModelComponent';
const controllerPath = '../../src/comps/builtin/3d-model/ThreeModelController';
const container = document.createElement('div');
const config = {base: {id: '3d'}, style: {source: {url: 'model.glb'}}};

async function loadController(
    render: ReturnType<typeof vi.fn>,
    componentFactory: () => unknown | Promise<unknown>,
) {
    vi.resetModules();
    vi.doMock('@/util/ComponentUtil.ts', () => ({
        default: {createAndRender: render, release: vi.fn()},
    }));
    vi.doMock(componentPath, componentFactory);
    return import(controllerPath);
}

afterEach(() => {
    vi.doUnmock('@/util/ComponentUtil.ts');
    vi.doUnmock(componentPath);
    vi.resetModules();
    vi.clearAllMocks();
});

describe('ThreeModelController lazy component load', () => {
    it('loads the renderer only when create is called and preserves the controller instance', async () => {
        const component = () => null;
        const instance = {updateConfig: vi.fn(), changeVisible: vi.fn(), setEventHandler: vi.fn()};
        const render = vi.fn().mockResolvedValue(instance);
        const {ThreeModelController} = await loadController(render, () => ({ThreeModelComponent: component}));
        const controller = new ThreeModelController();

        await controller.create(container, config as any, null as any);

        expect(render).toHaveBeenCalledWith(container, component, config);
        controller.update({style: {display: {mode: 'wireframe'}}} as any);
        expect(instance.updateConfig).toHaveBeenCalledOnce();
        controller.setVisible(false);
        expect(instance.changeVisible).toHaveBeenCalledWith(false);
    });

    it('uses the latest config when update runs while the component chunk loads', async () => {
        let startFactory!: () => void;
        let resolveFactory!: () => void;
        const factoryStarted = new Promise<void>(resolve => { startFactory = resolve; });
        const gate = new Promise<void>(resolve => { resolveFactory = resolve; });
        const component = () => null;
        const render = vi.fn().mockResolvedValue(null);
        const {ThreeModelController} = await loadController(render, async () => {
            startFactory();
            await gate;
            return {ThreeModelComponent: component};
        });
        const controller = new ThreeModelController();
        const creating = controller.create(container, config as any, null as any);

        await factoryStarted;
        controller.update({style: {display: {mode: 'wireframe'}}} as any);
        const latestConfig = controller.getConfig();
        resolveFactory();
        await creating;

        expect(render).toHaveBeenCalledWith(container, component, latestConfig);
        expect(latestConfig?.style.display.mode).toBe('wireframe');
    });

    it('applies config updates that arrive while the forwarded ref is pending', async () => {
        let resolveRender!: (instance: any) => void;
        let startRender!: () => void;
        const renderStarted = new Promise<void>(resolve => { startRender = resolve; });
        const renderPending = new Promise<any>(resolve => { resolveRender = resolve; });
        const component = () => null;
        const instance = {updateConfig: vi.fn(), changeVisible: vi.fn(), setEventHandler: vi.fn()};
        const render = vi.fn(() => {
            startRender();
            return renderPending;
        });
        const {ThreeModelController} = await loadController(render, () => ({ThreeModelComponent: component}));
        const controller = new ThreeModelController();
        const creating = controller.create(container, config as any, null as any);

        await renderStarted;
        controller.update({style: {display: {mode: 'wireframe'}}} as any);
        const latestConfig = controller.getConfig();
        resolveRender(instance);
        await creating;

        expect(instance.updateConfig).toHaveBeenCalledOnce();
        expect(instance.updateConfig).toHaveBeenCalledWith(latestConfig);
        expect(latestConfig?.style.display.mode).toBe('wireframe');
    });

    it('does not render after the controller is destroyed while the component chunk loads', async () => {
        let startFactory!: () => void;
        let resolveFactory!: () => void;
        const factoryStarted = new Promise<void>(resolve => { startFactory = resolve; });
        const gate = new Promise<void>(resolve => { resolveFactory = resolve; });
        const component = () => null;
        const render = vi.fn().mockResolvedValue(null);
        const {ThreeModelController} = await loadController(render, async () => {
            startFactory();
            await gate;
            return {ThreeModelComponent: component};
        });
        const controller = new ThreeModelController();
        const creating = controller.create(container, config as any, null as any);

        await factoryStarted;
        controller.destroy();
        resolveFactory();
        await creating;

        expect(render).not.toHaveBeenCalled();
        expect(controller.getConfig()).toBeNull();
    });

    it('does not start importing the component when destroyed during the base create step', async () => {
        const importComponent = vi.fn(() => ({ThreeModelComponent: () => null}));
        const render = vi.fn();
        const {ThreeModelController} = await loadController(render, importComponent);
        const controller = new ThreeModelController();
        const creating = controller.create(container, config as any, null as any);

        // super.create stores the container synchronously and the derived method resumes after this turn.
        controller.destroy();
        await creating;

        expect(importComponent).not.toHaveBeenCalled();
        expect(render).not.toHaveBeenCalled();
    });

    it('applies only the latest visibility requested before the forwarded ref resolves', async () => {
        let resolveRender!: (instance: any) => void;
        let startRender!: () => void;
        const renderStarted = new Promise<void>(resolve => { startRender = resolve; });
        const renderPending = new Promise<any>(resolve => { resolveRender = resolve; });
        const instance = {updateConfig: vi.fn(), changeVisible: vi.fn(), setEventHandler: vi.fn()};
        const render = vi.fn(() => {
            startRender();
            return renderPending;
        });
        const {ThreeModelController} = await loadController(render, () => ({ThreeModelComponent: () => null}));
        const controller = new ThreeModelController();
        const creating = controller.create(container, config as any, null as any);

        await renderStarted;
        controller.setVisible(false);
        controller.setVisible(true);
        resolveRender(instance);
        await creating;

        expect(instance.changeVisible).toHaveBeenCalledOnce();
        expect(instance.changeVisible).toHaveBeenCalledWith(true);
    });

    it('does not carry pending visibility across destroy and recreate', async () => {
        let resolveFirstRender!: (instance: any) => void;
        let startFirstRender!: () => void;
        const firstRenderStarted = new Promise<void>(resolve => { startFirstRender = resolve; });
        const firstRenderPending = new Promise<any>(resolve => { resolveFirstRender = resolve; });
        const oldInstance = {updateConfig: vi.fn(), changeVisible: vi.fn(), setEventHandler: vi.fn()};
        const newInstance = {updateConfig: vi.fn(), changeVisible: vi.fn(), setEventHandler: vi.fn()};
        const render = vi.fn()
            .mockImplementationOnce(() => {
                startFirstRender();
                return firstRenderPending;
            })
            .mockResolvedValueOnce(newInstance);
        const {ThreeModelController} = await loadController(render, () => ({ThreeModelComponent: () => null}));
        const controller = new ThreeModelController();
        const firstCreate = controller.create(container, config as any, null as any);

        await firstRenderStarted;
        controller.setVisible(false);
        controller.destroy();
        resolveFirstRender(oldInstance);
        await firstCreate;
        await controller.create(container, config as any, null as any);

        expect(oldInstance.changeVisible).not.toHaveBeenCalled();
        expect(newInstance.changeVisible).not.toHaveBeenCalled();
    });

    it('swallows an import failure if the controller was destroyed while import was pending', async () => {
        let startFactory!: () => void;
        let rejectFactory!: (error: Error) => void;
        const factoryStarted = new Promise<void>(resolve => { startFactory = resolve; });
        const gate = new Promise<unknown>((_resolve, reject) => { rejectFactory = reject; });
        const render = vi.fn();
        const {ThreeModelController} = await loadController(render, async () => {
            startFactory();
            await gate;
            return {ThreeModelComponent: () => null};
        });
        const controller = new ThreeModelController();
        const creating = controller.create(container, config as any, null as any);

        await factoryStarted;
        controller.destroy();
        rejectFactory(new Error('late chunk failure'));

        await expect(creating).resolves.toBeUndefined();
        expect(render).not.toHaveBeenCalled();
        expect(controller.getConfig()).toBeNull();
    });

    it('propagates a failed component chunk load without starting a render', async () => {
        const render = vi.fn();
        const {ThreeModelController} = await loadController(render, async () => {
            throw new Error('3D component chunk unavailable');
        });
        const controller = new ThreeModelController();

        let loadError: unknown;
        try {
            await controller.create(container, config as any, null as any);
        } catch (error) {
            loadError = error;
        }
        expect(loadError).toBeTruthy();
        expect(render).not.toHaveBeenCalled();
    });
});
