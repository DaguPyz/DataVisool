/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import {createRoot} from 'react-dom/client';
import {Button, CardPanel, ColorPicker, Empty, Input, Pagination, Select, Switch} from '../main';
import './main.css';

function Demo() {
    return (
        <main className="datavisool-demo-page">
            <section className="datavisool-demo-panel">
                <div className="datavisool-demo-heading">
                    <h1>DataVisool UI</h1>
                    <p>新的组件库模块已就绪，基础控件按 DataVisool 规范重建。</p>
                </div>
                <div className="datavisool-demo-actions">
                    <Button>默认按钮</Button>
                    <Button variant="outline">次级按钮</Button>
                </div>
                <CardPanel label="基础控件" tip="按 DataVisool 设计规范沉淀">
                    <div className="datavisool-demo-control-grid">
                        <Input label="项目名称" placeholder="请输入名称"/>
                        <Select label="状态" placeholder="请选择" borderRadius={14} options={[{label: '启用', value: 'on'}, {label: '停用', value: 'off'}]}/>
                        <ColorPicker label="主题色" showText/>
                        <Switch label="启用状态" defaultValue/>
                    </div>
                </CardPanel>
                <CardPanel label="分页控件" tip="列表和表格分页场景">
                    <Pagination total={248} defaultCurrent={3} showTotal showSizeChanger showQuickJumper/>
                </CardPanel>
                <CardPanel label="空状态" tip="列表、资源面板和搜索结果为空时使用">
                    <Empty
                        variant="panel"
                        title="暂无资源"
                        description="创建或导入资源后会显示在这里。"
                        action={<Button size="sm">新建资源</Button>}
                    />
                </CardPanel>
            </section>
        </main>
    );
}

createRoot(document.getElementById('root')!).render(<Demo/>);
