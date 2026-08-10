import { FixtureRenderer } from '../../fixtures/FixtureRenderer';
import { diagnosticsFixture } from '../../fixtures/generated/diagnosticsFixture';

export function Diagnostics(): React.JSX.Element {
  return <FixtureRenderer node={diagnosticsFixture} /> as React.JSX.Element;
}