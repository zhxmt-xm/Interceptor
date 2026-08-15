import { rulesFixture } from '../../fixtures/generated/rulesFixture';
import { RulesFixtureRenderer } from './RulesFixtureRenderer';

export function Rules(): React.JSX.Element {
  return <RulesFixtureRenderer node={rulesFixture} /> as React.JSX.Element;
}