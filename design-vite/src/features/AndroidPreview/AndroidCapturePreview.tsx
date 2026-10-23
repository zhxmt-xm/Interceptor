import { useCallback, useMemo } from 'react';

import { ActionButton } from '../../components/ActionButton/ActionButton';
import { IconButton } from '../../components/IconButton/IconButton';
import { DetailFixtureRenderer } from '../../fixtures/DetailFixtureRenderer';
import { FixtureIcon } from '../../fixtures/FixtureIcon';
import { fixtureClassNames, type FixtureElementRenderer } from '../../fixtures/FixtureRenderer';
import { captureFixture } from '../../fixtures/generated/captureFixture';
import { useDesignState } from '../../state/useDesignState';
import { androidCaptureFixture, androidOnlySourceSelected, androidSourceAvailable, fixtureHasClass } from './utils';
import styles from './AndroidCapturePreview.module.css';

export function AndroidCapturePreview(): React.JSX.Element {
  const { state, updateState } = useDesignState();
  const available = androidSourceAvailable(state);
  const empty = androidOnlySourceSelected(state);
  const fixture = useMemo(() => androidCaptureFixture(captureFixture, available), [available]);
  const renderElement = useCallback<FixtureElementRenderer>((node, children) => {
    if (Object.hasOwn(node.attributes, 'data-design-android-toolbar')) {
      return (
        <div className={fixtureClassNames(node.attributes.class ?? '')} data-design-android-toolbar="">
          {children}
          <span className={styles.androidCaptureDeviceTrigger} data-design-android-device-trigger="">
            <IconButton label="Android devices" icon={<FixtureIcon iconId="i-usb" svgProps={{ size: 15 }} />}
              pressed={state.androidDialog !== 'closed'} onClick={() => updateState({ androidDialog: 'devices' })} />
            {state.androidDeviceStatus === 'ready' && state.androidConnection === 'connected'
              && state.androidVpn === 'running' && <span className={styles.androidCaptureDeviceIndicator} />}
          </span>
        </div>
      );
    }
    if (empty && Object.hasOwn(node.attributes, 'data-design-android-list-count')) {
      return <span className={fixtureClassNames('cnt')} data-design-android-result-count=""><b>0</b> of 241</span>;
    }
    if (empty && fixtureHasClass(node, 'list-scroll')) {
      return (
        <div className={fixtureClassNames('list-scroll')}>
          <section className={styles.androidCaptureEmpty} data-design-android-empty="">
            <FixtureIcon iconId="i-android" svgProps={{ size: 32 }} />
            <h2>No traffic from Pixel 8 yet</h2>
            <p>{state.androidVpn === 'running' ? 'Open an app on the phone. Its captured requests will appear here.'
              : 'Start the VPN on the phone before capturing this source.'}</p>
            <ActionButton label="Clear application filter" onClick={() => updateState({ androidSelectedApps: [] })} />
          </section>
        </div>
      );
    }
    return undefined;
  }, [empty, state.androidDialog, state.androidDeviceStatus, state.androidConnection, state.androidVpn, updateState]);
  return <DetailFixtureRenderer node={fixture} renderElement={renderElement} />;
}
