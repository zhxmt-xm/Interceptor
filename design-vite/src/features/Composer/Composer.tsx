import { FixtureRenderer } from '../../fixtures/FixtureRenderer';
import { composerFixture } from '../../fixtures/generated/composerFixture';

export function Composer(): React.JSX.Element {
  return <FixtureRenderer node={composerFixture} /> as React.JSX.Element;
}