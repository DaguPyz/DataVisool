/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import '@datavisool/ui/style.css';
import './index.less';
import './theme/default.less';
import {readInitialLocale} from '@/i18n/localePreference.ts';
import {showStartupError, startApplication} from './bootstrap/startApplication.ts';

void startApplication().catch(error => showStartupError(error, readInitialLocale()));
