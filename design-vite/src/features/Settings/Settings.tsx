import { FixtureRenderer } from '../../fixtures/FixtureRenderer';
import { settingsFixture } from '../../fixtures/generated/settingsFixture';

export function Settings(): React.JSX.Element {
  return <FixtureRenderer node={settingsFixture} /> as React.JSX.Element;
}