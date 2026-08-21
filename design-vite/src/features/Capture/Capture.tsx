import { DetailFixtureRenderer } from '../../fixtures/DetailFixtureRenderer';
import { captureFixture } from '../../fixtures/generated/captureFixture';
import { BreakpointCreatedMessage } from './BreakpointCreatedMessage';
import { BodyRuleEffectDesign } from './BodyRuleEffectDesign';
import { GrpcMessagePayload } from './GrpcMessagePayload';
import { HttpBreakpointDesign } from './HttpBreakpointDesign';
import { RequestContextMenu } from './RequestContextMenu';
import { WebSocketBreakpointDesign } from './WebSocketBreakpointDesign';
import { WebSocketMessagePayload } from './WebSocketMessagePayload';
import { TlsPassthroughNavigationDesign } from './TlsPassthroughNavigationDesign';

export function Capture(): React.JSX.Element {
  return (
    <>
      <RequestContextMenu>
        <DetailFixtureRenderer node={captureFixture} />
      </RequestContextMenu>
      <BreakpointCreatedMessage />
      <BodyRuleEffectDesign />
      <HttpBreakpointDesign />
      <WebSocketMessagePayload />
      <GrpcMessagePayload />
      <WebSocketBreakpointDesign />
      <TlsPassthroughNavigationDesign />
    </>
  ) as React.JSX.Element;
}