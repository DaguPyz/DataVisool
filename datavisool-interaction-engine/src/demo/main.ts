/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import {renderDragDemoPage} from './DragDemoPage';

const root = document.getElementById('root');

if (!root) {
    throw new Error('Missing #root element.');
}

renderDragDemoPage(root);
