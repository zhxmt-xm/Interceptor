import { FixtureRenderer } from '../../fixtures/FixtureRenderer';
import { captureFixture } from '../../fixtures/generated/captureFixture';
import { BreakpointCreatedMessage } from './BreakpointCreatedMessage';
import { GrpcMessagePayload } from './GrpcMessagePayload';
import { HttpBreakpointDesign } from './HttpBreakpointDesign';
import { RequestContextMenu } from './RequestContextMenu';
import { WebSocketBreakpointDesign } from './WebSocketBreakpointDesign';
import { WebSocketMessagePayload } from './WebSocketMessagePayload';

export function Capture(): React.JSX.Element {
  return (
    <>
      <RequestContextMenu>
        <FixtureRenderer node={captureFixture} />
      </RequestContextMenu>
      <BreakpointCreatedMessage />
      <HttpBreakpointDesign />
      <WebSocketMessagePayload />
      <GrpcMessagePayload />
      <WebSocketBreakpointDesign />
    </>
  ) as React.JSX.Element;
}