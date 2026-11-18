/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

export {PluginStopCancelledError} from './plugin/Plugin.js';
export type {Plugin, PluginContext, PluginContextApi, PluginStopParticipant, PluginStopScope} from './plugin/Plugin.js';
export {createEventKey} from './plugin/EventKey.js';
export type {EventKey, EventListener} from './plugin/EventKey.js';

/** Augment this interface in the public contract of a plugin that provides a service. */
export interface PluginServices {}

export type ServiceType<Name extends string> = Name extends keyof PluginServices ? PluginServices[Name] : unknown;
