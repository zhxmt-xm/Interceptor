import { DetailFixtureRenderer } from '../../fixtures/DetailFixtureRenderer';
import { composerFixture } from '../../fixtures/generated/composerFixture';

export function Composer(): React.JSX.Element {
  return <DetailFixtureRenderer node={composerFixture} />;
}