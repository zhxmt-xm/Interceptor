import { settingsFixture } from '../../fixtures/generated/settingsFixture';
import { SettingsFixtureRenderer } from './SettingsFixtureRenderer';

export function Settings(): React.JSX.Element {
  return <SettingsFixtureRenderer node={settingsFixture} /> as React.JSX.Element;
}