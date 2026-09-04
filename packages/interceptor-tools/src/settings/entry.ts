import type { InterceptorToolDefinition, InterceptorToolKind } from '../interfaces';
import { buildInterceptorToolRegistry } from '../registry/entry';

/** Display-only Tool metadata safe to send to Settings. */
export interface InterceptorToolSettingsItem {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly kind: InterceptorToolKind;
}

/** One stable Settings group containing executable registry Tools. */
export interface InterceptorToolSettingsGroup {
  readonly id: string;
  readonly title: string;
  readonly tools: readonly InterceptorToolSettingsItem[];
}

interface SettingsGroupDefinition {
  readonly id: string;
  readonly title: string;
  readonly capabilityIds: readonly string[];
}

const SETTINGS_GROUP_DEFINITIONS: readonly SettingsGroupDefinition[] = [
  { id: 'capture', title: 'Capture', capabilityIds: ['capture'] },
  { id: 'rules', title: 'Rules', capabilityIds: ['rules'] },
  { id: 'composer', title: 'Composer', capabilityIds: ['composer'] },
  { id: 'breakpoints', title: 'Breakpoints', capabilityIds: ['breakpoints'] },
  { id: 'diagnostics', title: 'Diagnostics', capabilityIds: ['diagnostics'] },
];

/** Projects every executable Tool once into the Settings display groups. */
export function buildInterceptorToolSettingsGroups(
  registry: readonly InterceptorToolDefinition[] = buildInterceptorToolRegistry(),
): readonly InterceptorToolSettingsGroup[] {
  const groupedToolNames = new Set<string>();
  const groups = SETTINGS_GROUP_DEFINITIONS.map((group) => ({
    id: group.id,
    title: group.title,
    tools: registry
      .filter((tool) => group.capabilityIds.includes(tool.capabilityId))
      .map((tool) => {
        groupedToolNames.add(tool.name);
        return {
          name: tool.name,
          title: tool.title,
          description: tool.description,
          kind: tool.kind,
        };
      }),
  }));
  const ungroupedTools = registry.filter((tool) => !groupedToolNames.has(tool.name));
  if (ungroupedTools.length > 0) {
    throw new Error(
      `Tool Settings projection is missing: ${ungroupedTools.map((tool) => tool.name).join(', ')}`,
    );
  }
  return groups;
}