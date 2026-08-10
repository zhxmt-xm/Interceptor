import { FixtureRenderer } from '../../fixtures/FixtureRenderer';
import { rulesFixture } from '../../fixtures/generated/rulesFixture';

export function Rules(): React.JSX.Element {
  return <FixtureRenderer node={rulesFixture} /> as React.JSX.Element;
}