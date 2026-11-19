/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {HotKeyDes} from './help/HotKeyDes.tsx';

function ShortcutHelp({onClose}: {onClose(): void}) {
    return <HotKeyDes onClose={onClose}/>;
}

export default ShortcutHelp;
