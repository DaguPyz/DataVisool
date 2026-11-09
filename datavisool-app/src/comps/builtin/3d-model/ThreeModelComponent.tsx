/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React, { ForwardedRef, Suspense, useImperativeHandle, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, Html, useProgress, Sky, ContactShadows } from '@react-three/drei';
import { ThreeModelLoader } from './ThreeModelLoader';
import { ErrorBoundary } from 'react-error-boundary';
import type { FallbackProps } from 'react-error-boundary';
import { ComponentBaseProps } from '@datavisool/sdk/types';
import * as THREE from 'three';

// 相机更新组件
const CameraUpdater = ({ position, fov, target }: { position?: [number, number, number], fov: number, target?: [number, number, number] }) => {
    const camera = useThree((state) => state.camera);
    const controls = useThree((state) => state.controls);

    React.useEffect(() => {
        if (position) {
            camera.position.set(...position);
        }
        if (fov) {
            // @ts-ignore
            camera.fov = fov;
        }
        if (target) {
            if (controls) {
                // @ts-ignore
                controls.target.set(...target);
                // @ts-ignore
                controls.update();
            } else {
                camera.lookAt(...target);
            }
        }
        camera.updateProjectionMatrix();
    }, [camera, controls, position, fov, target]);

    return null;
};

const AutoFitCamera = ({ object }: { object: THREE.Object3D | null }) => {
    const camera = useThree((state) => state.camera);
    const controls = useThree((state) => state.controls);
    const size = useThree((state) => state.size);

    React.useEffect(() => {
        if (!object) return;
        const box = new THREE.Box3().setFromObject(object);
        if (!isFinite(box.min.x) || !isFinite(box.max.x)) return;
        const center = box.getCenter(new THREE.Vector3());
        const boxSize = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(boxSize.x, boxSize.y, boxSize.z);
        if (!isFinite(maxDim) || maxDim <= 0) return;

        const fov = (camera as any).fov ?? 45;
        const aspect = size.width / size.height;
        const fitHeightDistance = maxDim / (2 * Math.tan(THREE.MathUtils.degToRad(fov / 2)));
        const fitWidthDistance = fitHeightDistance / aspect;
        const distance = 1.2 * Math.max(fitHeightDistance, fitWidthDistance);

        const delta = new THREE.Vector3().copy(camera.position as any).sub(center);
        const dir = delta.lengthSq() > 0 ? delta.normalize() : new THREE.Vector3(0, 0, 1);
        camera.position.copy(center.clone().add(dir.multiplyScalar(distance)));

        if ('near' in camera && 'far' in camera) {
            (camera as any).near = Math.max(distance / 100, 0.01);
            (camera as any).far = distance * 100;
        }
        camera.lookAt(center);
        camera.updateProjectionMatrix();

        if (controls && 'target' in controls) {
            (controls as any).target.copy(center);
            (controls as any).update?.();
        }
    }, [object, camera, controls, size.width, size.height]);

    return null;
};

// 加载指示器
function Loader() {
    const { progress } = useProgress();
    return <Html center>{progress.toFixed(0)} % loaded</Html>;
}

// 错误回退组件
function ErrorFallback({ error }: FallbackProps) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return (
        <div style={{
            color: 'red',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100%',
            flexDirection: 'column',
            padding: 10,
            textAlign: 'center'
        }}>
            <p>模型加载失败</p>
            <p style={{ fontSize: 12 }}>{errorMessage}</p>
        </div>
    );
}

export interface ThreeModelComponentProps extends ComponentBaseProps {
    style?: any;
}

export interface ThreeModelComponentRef {
    updateConfig: (newConfig: ThreeModelComponentProps) => void;
    // eslint-disable-next-line @typescript-eslint/ban-types
    setEventHandler: (eventMap: Record<string, Function>) => void;
    changeVisible: (visible: boolean) => void;
}

export const ThreeModelComponent = React.forwardRef((props: ThreeModelComponentProps, ref: ForwardedRef<ThreeModelComponentRef>) => {
    const [config, setConfig] = useState<ThreeModelComponentProps>({ ...props });
    const [visible, setVisible] = useState(true);
    const [loadedObject, setLoadedObject] = useState<THREE.Object3D | null>(null);
    // eslint-disable-next-line @typescript-eslint/ban-types
    const eventHandlerMap = useRef<Record<string, Function>>({});

    useImperativeHandle(ref, () => ({
        updateConfig: (newConfig) => setConfig({ ...newConfig }),
        setEventHandler: (eventMap) => eventHandlerMap.current = eventMap,
        changeVisible: (visible) => setVisible(visible),
    }));

    const { style } = config;
    const {
        source = {},
        scene = {},
        camera = {},
        lights = {},
        display = {},
        animation = {}
    } = style || {};

    // 默认值处理
    const modelUrl = source.url;
    const modelFormat = source.format || 'glb';
    const displayMode = display.mode || 'standard';
    const modelScale = display.scale || 1;
    const autoCenter = display.autoCenter || false;
    const modelTarget = camera.target;
    const hasCustomCameraPosition = Array.isArray(camera.position) && camera.position.length === 3;
    const hasCustomCameraTarget = Array.isArray(modelTarget) && modelTarget.length === 3;

    React.useEffect(() => {
        setLoadedObject(null);
    }, [modelUrl]);
    
    // 动画配置
    // const animationEnabled = animation.enabled !== false; // 默认开启? 或者默认关闭，看需求。这里先假设如果不传则不开启，或者默认开启。这里先跟 undefined 比较吧。
    // 为了保险起见，如果 animation.enabled 为 undefined，我们默认为 true 还是 false? 用户说"如果模型本身有动画...也能保留"，暗示默认行为。
    // 但是 StyleConfig 里默认可能是 undefined。让我们设为默认为 true 吧，如果用户显式关掉才关。
    // 不过通常我们会默认为 false 除非用户开启。
    // 让我们看 StyleConfig，新加的字段初始是 undefined。
    // 让我们设为默认 false 吧，免得意外动起来。或者默认 true？
    // 用户原话：“我希望他在我的组件里渲染的时候也能保留他的动画”。
    // 这听起来像是“如果有动画就播”。
    // 所以我将默认值设为 true。
    const animEnabled = animation.enabled ?? true;
    const animSpeed = animation.speed ?? 1;

    // 背景设置
    const bgColor = scene.background?.value || '#f0f0f0';
    const bgType = scene.background?.type || 'color';

    // const containerRef = useRef<HTMLDivElement>(null);

    const onClick = () => {
        if ('click' in eventHandlerMap.current) {
            eventHandlerMap.current['click']();
        }
    }

    if (!visible)
        return null;

    return (
        <div style={{ width: '100%', height: '100%', overflow: 'hidden' }} onClick={onClick}>
            {!modelUrl ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#999' }}>
                    请配置模型URL
                </div>
            ) : (
                <ErrorBoundary FallbackComponent={ErrorFallback}>
                    <Canvas
                        resize={{ offsetSize: true }}
                        shadows
                        gl={{ preserveDrawingBuffer: true, pixelRatio: window.devicePixelRatio } as any}
                        camera={{
                            fov: camera.fov || 45,
                            position: camera.position || [0, 0, 10]
                        }}
                        style={{ width: '100%', height: '100%' }}
                    >
                        {/* 背景 */}
                        {bgType === 'color' && <color attach="background" args={[bgColor]} />}
                        {bgType === 'sky' && <Sky />}

                        {/* 灯光 */}
                        <ambientLight
                            intensity={lights.ambient?.intensity ?? 0.5}
                            color={lights.ambient?.color || '#ffffff'}
                        />
                        <directionalLight
                            position={lights.directional?.position || [5, 5, 5]}
                            intensity={lights.directional?.intensity ?? 1}
                            color={lights.directional?.color || '#ffffff'}
                            castShadow
                        />

                        {/* 环境贴图 */}
                        <Environment
                            preset={scene.environment?.preset || 'city'}
                            background={bgType === 'environment'} // 如果背景类型是环境，则将环境贴图设为背景
                            blur={scene.environment?.blur || 0}
                        />

                        {/* 地面接触阴影，增加真实感 */}
                        <ContactShadows position={[0, -0.01, 0]} opacity={0.5} scale={10} blur={2} far={4} />

                        {/* 相机更新 */}
                        <CameraUpdater position={hasCustomCameraPosition ? (camera.position as [number, number, number]) : undefined} fov={camera.fov || 45} target={hasCustomCameraTarget ? (modelTarget as [number, number, number]) : undefined} />
                        {(!hasCustomCameraPosition || !hasCustomCameraTarget) && <AutoFitCamera object={loadedObject} />}

                        {/* 模型加载 */}
                        <Suspense fallback={<Loader />}>
                            <ThreeModelLoader
                                url={modelUrl}
                                format={modelFormat}
                                displayMode={displayMode}
                                scale={modelScale}
                                autoCenter={autoCenter}
                                animationEnabled={animEnabled}
                                animationSpeed={animSpeed}
                                onSceneReady={setLoadedObject}
                            />
                        </Suspense>

                        {/* 控制器 */}
                        {camera.controls?.enable !== false && (
                            <OrbitControls
                                target={modelTarget || [0, 0, 0]}
                                enabled={camera.controls?.interactive}
                                autoRotate={camera.controls?.autoRotate}
                                autoRotateSpeed={camera.controls?.autoRotateSpeed || 1}
                                enableDamping={camera.controls?.enableDamping !== false}
                                makeDefault
                            />
                        )}
                    </Canvas>
                </ErrorBoundary>
            )}
        </div>
    );
});
