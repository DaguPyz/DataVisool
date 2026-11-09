/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React, {useMemo, useEffect, useRef} from 'react';
import {useLoader, useFrame} from '@react-three/fiber';
import {Center} from '@react-three/drei';
// @ts-ignore
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader';
// @ts-ignore
import {FBXLoader} from 'three/examples/jsm/loaders/FBXLoader';
// @ts-ignore
import {OBJLoader} from 'three/examples/jsm/loaders/OBJLoader';
// @ts-ignore
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils';
import * as THREE from 'three';

interface LoaderProps {
    url: string;
    format: 'glb' | 'gltf' | 'fbx' | 'obj';
    displayMode?: 'standard' | 'wireframe' | 'clay';
    scale?: number;
    autoCenter?: boolean;
    animationEnabled?: boolean;
    animationSpeed?: number;
    onSceneReady?: (scene: THREE.Object3D) => void;
}

export const ThreeModelLoader: React.FC<LoaderProps> = ({
    url, 
    format, 
    displayMode = 'standard', 
    scale = 1, 
    autoCenter = false,
    animationEnabled = true,
    animationSpeed = 1,
    onSceneReady
}) => {
    
    // 根据格式选择加载器
    const loader = useMemo(() => {
        switch (format) {
            case 'glb':
            case 'gltf':
                return GLTFLoader;
            case 'fbx':
                return FBXLoader;
            case 'obj':
                return OBJLoader;
            default:
                return GLTFLoader;
        }
    }, [format]);

    // 加载模型
    // @ts-ignore - useLoader 类型推断在动态 loader 时比较困难
    const object = useLoader(loader, url);
    
    // 处理模型数据
    const scene = useMemo(() => {
        let root;
        if (format === 'glb' || format === 'gltf') {
            root = (object as any).scene;
        } else {
            root = object;
        }
        
        // 使用 SkeletonUtils.clone 克隆模型，以正确处理骨骼动画 (SkinnedMesh)
        // 普通的 clone(true) 会导致 Mesh 和 Skeleton 引用断裂，出现"手还在原来的位置"这种割裂现象
        const cloned = SkeletonUtils.clone(root);

        // 应用材质/显示模式
        cloned.traverse((child: any) => {
            if (child.isMesh) {
                // 启用阴影
                child.castShadow = true;
                child.receiveShadow = true;

                if (displayMode === 'wireframe') {
                     // 简单处理：替换材质或设置 wireframe
                     if (child.material) {
                         const materials = Array.isArray(child.material) ? child.material : [child.material];
                         // 必须克隆材质，否则会污染原始 Loader 缓存的材质，导致切换回 standard 模式时无法恢复
                         const clonedMaterials = materials.map((m: any) => {
                             const clonedMat = m.clone();
                             clonedMat.wireframe = true;
                             return clonedMat;
                         });
                         child.material = Array.isArray(child.material) ? clonedMaterials : clonedMaterials[0];
                     }
                } else if (displayMode === 'clay') {
                    // 纯色/白模
                    child.material = new THREE.MeshStandardMaterial({ color: '#cccccc' });
                } else {
                    // 恢复正常
                    // 由于每次都是从 root 重新 clone 的，且上面 wireframe 模式克隆了材质，
                    // 所以只要不修改原始材质引用，这里不需要做任何操作，自然就是原始状态。
                }
            }
        });

        return cloned;
    }, [object, format, displayMode]);

    useEffect(() => {
        if (!scene) return;
        onSceneReady?.(scene);
    }, [scene, onSceneReady]);

    // 动画处理
    const mixerRef = useRef<THREE.AnimationMixer | null>(null);
    
    // 获取动画剪辑
    const animations = useMemo(() => {
        return (object as any).animations || [];
    }, [object]);

    // 初始化 Mixer 和播放动画
    useEffect(() => {
        if (!scene || !animationEnabled || !animations.length) return;

        const mixer = new THREE.AnimationMixer(scene);
        mixerRef.current = mixer;

        // 播放所有动画
        animations.forEach((clip: THREE.AnimationClip) => {
            mixer.clipAction(clip).play();
        });

        return () => {
            mixer.stopAllAction();
            mixerRef.current = null;
        };
    }, [scene, animations, animationEnabled]);

    // 每帧更新动画
    useFrame((_, delta) => {
        if (mixerRef.current && animationEnabled) {
            mixerRef.current.update(delta * animationSpeed);
        }
    });

    const content = <primitive object={scene} scale={[scale, scale, scale]} />;
    
    if (autoCenter) {
        return <Center>{content}</Center>;
    }
    
    return content;
};
