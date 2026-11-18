/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {HomeLayoutProps} from '@/contracts/homeLayout.ts';
import './HomeLayout.less';

export default function HomeLayout({navigation, content}: HomeLayoutProps) {
    return (
        <div className="datavisool-home">
            <div className="home-left">
                <div className="home-side-card">
                    <div className="datavisool-home-body-left">{navigation}</div>
                </div>
            </div>
            <div className="home-right">
                <div className="home-main-card">
                    <div className="home-content">
                        <div className="home-route">{content}</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
