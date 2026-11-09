/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {useState, type ReactNode} from 'react';
import {Close, More} from '@icon-park/react';
import {Dropdown, type DropdownMenuItem} from '@datavisool/ui';
import designerLeftStore from '../DesignerLeftStore';
import {tx} from '@/i18n/miniI18n';
import './DesignerPanelHeader.less';

interface DesignerPanelHeaderProps {
    title: string;
    actions?: ReactNode;
    menuItems?: DropdownMenuItem[];
}

export default function DesignerPanelHeader({title, actions, menuItems}: DesignerPanelHeaderProps) {
    const [menuOpen, setMenuOpen] = useState(false);
    const handleClose = () => {
        designerLeftStore.setMenu('');
    };
    const closeLabel = `${tx('关闭')} ${tx(title)}`;

    return (
        <div className="designer-panel-header" data-escape-boundary={menuOpen ? '' : undefined}>
            <h2 className="designer-panel-header-title" title={tx(title)}>{tx(title)}</h2>
            <div className="designer-panel-header-actions">
                {actions}
                {!!menuItems?.length && (
                    <Dropdown items={menuItems} trigger={['click']} placement="bottomRight"
                              open={menuOpen} onOpenChange={setMenuOpen}>
                        <button type="button" className="designer-panel-header-button"
                                title={tx('更多操作')} aria-label={tx('更多操作')}>
                            <More theme="outline" size={16} aria-hidden="true"/>
                        </button>
                    </Dropdown>
                )}
                <button type="button" className="designer-panel-header-button"
                        title={closeLabel} aria-label={closeLabel} onClick={handleClose}>
                    <Close theme="outline" size={16} strokeWidth={1.5} aria-hidden="true"/>
                </button>
            </div>
        </div>
    );
}
