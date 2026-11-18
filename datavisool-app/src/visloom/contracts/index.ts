/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

export {PluginStopCancelledError} from './Plugin.ts';
export type {Plugin, PluginContext, PluginStopParticipant, PluginStopScope} from './Plugin.ts';
export {createEventKey} from './EventKey.ts';
export type {EventKey, EventListener} from './EventKey.ts';

/** Augment this interface in the public contract of a plugin that provides a service. */
export interface PluginServices {}

export type ServiceType<Name extends string> = Name extends keyof PluginServices ? PluginServices[Name] : unknown;
