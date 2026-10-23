import { DetailFixtureRenderer } from '../../fixtures/DetailFixtureRenderer';
import { captureFixture } from '../../fixtures/generated/captureFixture';
import { useDesignState } from '../../state/useDesignState';
import { AndroidCapturePreview } from '../AndroidPreview/AndroidCapturePreview';
import { BreakpointCreatedMessage } from './BreakpointCreatedMessage';
import { BreakpointQueueDesign } from './BreakpointQueueDesign';
import { BodyRuleEffectDesign } from './BodyRuleEffectDesign';
import { GrpcMessagePayload } from './GrpcMessagePayload';
import { HttpBreakpointDesign } from './HttpBreakpointDesign';
import { RequestContextMenu } from './RequestContextMenu';
import { WebSocketBreakpointDesign } from './WebSocketBreakpointDesign';
import { WebSocketMessagePayload } from './WebSocketMessagePayload';
import { TlsPassthroughNavigationDesign } from './TlsPassthroughNavigationDesign';

export function Capture(): React.JSX.Element {
  const { state } = useDesignState();
  return (
    <>
      <RequestContextMenu>
        {state.androidDesktopPreview ? <AndroidCapturePreview /> : <DetailFixtureRenderer node={captureFixture} />}
      </RequestContextMenu>
      <BreakpointCreatedMessage />
      <BreakpointQueueDesign />
      <BodyRuleEffectDesign />
      <HttpBreakpointDesign />
      <WebSocketMessagePayload />
      <GrpcMessagePayload />
      <WebSocketBreakpointDesign />
      <TlsPassthroughNavigationDesign />
    </>
  ) as React.JSX.Element;
}