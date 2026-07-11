# Tool Controls

This directory defines the icon-control convention for the desktop UI. Use these components instead of styling Ant Design `Button` or `Segmented` directly in feature code. Component dimensions come from Ant Design `size` and ConfigProvider tokens; CSS Modules only add the Copilot-style surface and hover elevation.

## Size Scale

| Size | Box | Icon | Use |
| --- | ---: | ---: | --- |
| `compact` | 30 px | 16 px | Inspector headers and dense local tools |
| `regular` | 34 px | 18 px | Default toolbar actions |
| `prominent` | 40 px | 21 px | Rare primary modes that need deliberate emphasis |

## Rules

- Use `ToolIconButton` for one command.
- Use `ToolSegmentedControl` for a mutually exclusive mode.
- `compact / regular / prominent` map to Ant Design `small / middle / large`.
- Icon sizes come from `Button.onlyIconSizeSM / onlyIconSize / onlyIconSizeLG` tokens.
- Always provide `label`; it supplies both the tooltip and accessible name.
- Controls are borderless at rest. Hover uses the shared elevated surface and shadow.
- Use `active` only for persistent command state. Mode selection belongs in `ToolSegmentedControl`.
- Keep unavailable M0 commands `disabled`; do not make placeholders look interactive.
- Do not introduce one-off icon sizes or hover shadows in feature CSS Modules.

## Examples

```tsx
<ToolIconButton
  label="Filter"
  icon={<FilterOutlined />}
  controlSize="compact"
/>

<ToolSegmentedControl
  label="Color theme"
  value={themeMode}
  onChange={setThemeMode}
  options={[
    { value: 'light', label: 'Light theme', icon: <SunOutlined /> },
    { value: 'dark', label: 'Dark theme', icon: <MoonOutlined /> },
  ]}
/>
```