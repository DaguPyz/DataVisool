/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import './Login.less';
import {useNavigate} from "react-router-dom";
import {memo, useRef, useState} from "react";
import FetchUtil from "../../util/FetchUtil.ts";
import AuthTools, {IUserInfo} from "@/util/AuthTools.ts";
import {Button, Input} from '@datavisool/ui';
import logo from '../../images/datavisool-logo.webp';
import ServiceTerms from "./ServiceTerms.tsx";
import {HybridCryptoUtil} from "../../util/HybridCryptoUtil.ts";
import LoginCircuitBackground from "./LoginCircuitBackground.tsx";
import {ArrowRight, DataScreen, FolderOpen, Lock, Send, Shield, User} from "@icon-park/react";

const loginHighlights = [
    {label: '设计画布', description: '组件编排与数据可视化', icon: DataScreen},
    {label: '素材资源', description: '集中管理与按需接入', icon: FolderOpen},
    {label: '发布管理', description: '项目预览与版本发布', icon: Send}
];

const Login = memo(() => {
    const navigate = useNavigate();
    const usernameRef = useRef("");
    const passwordRef = useRef("");
    const [logoSrc, setLogoSrc] = useState("/static/logo/logo.png")

    const [serviceTerms, setServiceTerms] = useState(false);

    const login = async () => {
        const pwd = await HybridCryptoUtil.encryptRequest(passwordRef.current);
        FetchUtil.post<IUserInfo>("/api/authenticate/login",
            {username: usernameRef.current, password: pwd},
        ).then(res => {
            if (res !== null) {
                AuthTools.setUserInfo(res, true);
                navigate('/home/console');
            }
        })
    }

    return (
        <div className={'datavisool-login'}>
            <LoginCircuitBackground/>
            <div className={'datavisool-login-shell'}>
                <section className={'login-overview'} aria-label={'DataVisool Web 数据可视化设计平台'}>
                    <div className={'login-brand'}>
                        <img src={logoSrc} onError={() => setLogoSrc(logo)} alt={''}/>
                        <div>
                            <div className={'login-brand-name'}>DataVisool Web</div>
                            <p>数据可视化设计平台</p>
                        </div>
                    </div>
                    <div className={'login-overview-content'}>
                        <h2>设计与资源，统一管理</h2>
                        <p>在控制台完成画布设计、素材管理与项目发布。</p>
                        <ul className={'login-highlights'}>
                            {loginHighlights.map(({label, description, icon: Icon}) => (
                                <li key={label}>
                                    <Icon theme="outline" size={20} strokeWidth={1.5} fill="currentColor"/>
                                    <div>
                                        <h3>{label}</h3>
                                        <p>{description}</p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div className={'login-overview-footer'}>DESIGN CONSOLE</div>
                </section>
                <section className={'datavisool-login-container'} aria-labelledby={'login-title'}>
                    <div className={'login-header'}>
                        <span className={'login-eyebrow'}>账号登录</span>
                        <h1 id={'login-title'}>登录控制台</h1>
                        <p>使用账号访问设计与资源工作区</p>
                    </div>
                    <div className={'login-body'}>
                        <div className={'login-item'}>
                            <label htmlFor={'login-username'}>用户名</label>
                            <Input id={'login-username'} name={'username'} autoComplete={'username'}
                                   prefix={<User theme="outline" size={18} strokeWidth={1.5} fill="currentColor"/>} inputSize={'md'}
                                   onChange={value => usernameRef.current = value}
                                   placeholder={'请输入用户名'}
                                   defaultValue={usernameRef.current}/>
                        </div>
                        <div className={'login-item'}>
                            <label htmlFor={'login-password'}>密码</label>
                            <Input id={'login-password'} name={'password'} autoComplete={'current-password'}
                                   prefix={<Lock theme="outline" size={18} strokeWidth={1.5} fill="currentColor"/>} inputSize={'md'}
                                   onChange={value => passwordRef.current = value}
                                   placeholder={'请输入密码'}
                                   defaultValue={passwordRef.current}
                                   type={'password'}/>
                        </div>
                        <div className={'login-item login-action'}>
                            <Button block type="primary" onClick={login}>
                                登录
                                <ArrowRight theme="outline" size={16} strokeWidth={1.5} fill="currentColor"/>
                            </Button>
                        </div>
                        <div className="service-terms">点击登录表示已阅读并同意<button type={'button'} onClick={() => setServiceTerms(true)}>《服务条款》</button></div>
                    </div>
                    <div className={'login-security'}>
                        <Shield theme="outline" size={16} strokeWidth={1.5} fill="currentColor"/>
                        <span>账号会话与数据请求受服务端鉴权保护</span>
                    </div>
                </section>
            </div>
            {serviceTerms && <ServiceTerms onClose={() => setServiceTerms(false)}/>}
        </div>
    );
})

export default Login;
