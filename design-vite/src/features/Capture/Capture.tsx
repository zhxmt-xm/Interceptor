import { FixtureRenderer } from '../../fixtures/FixtureRenderer';
import { captureFixture } from '../../fixtures/generated/captureFixture';

export function Capture(): React.JSX.Element {
  return <FixtureRenderer node={captureFixture} /> as React.JSX.Element;
}