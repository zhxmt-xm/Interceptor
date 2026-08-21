import { Info } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { BodyViewerDesign } from '../../components/BodyViewerDesign/BodyViewerDesign';
import { CollapsibleSection } from '../../components/CollapsibleSection/CollapsibleSection';
import { SegmentedControl } from '../../components/SegmentedControl/SegmentedControl';
import type { BodyRuleEffectState } from '../../state/types';
import { useDesignState } from '../../state/useDesignState';
import styles from './BodyRuleEffectDesign.module.css';

type BodyVersion = 'original' | 'final';
type ConcreteBodyRuleEffect = Exclude<BodyRuleEffectState, ''>;

interface BodySample {
  readonly hex: string;
  readonly meta: string;
  readonly source: string;
}

const ORIGINAL_REQUEST: BodySample = {
  hex: '00000000  7b 22 73 74 61 67 65 22 3a 22 6f 72 69 67 69 6e  {"stage":"origin\n00000010  61 6c 22 7d                                      al"}',
  meta: 'application/json · 20 B',
  source: '{\n  "stage": "original"\n}',
};

const FINAL_BY_EFFECT: Readonly<Record<ConcreteBodyRuleEffect, BodySample>> = {
  'request-text': {
    hex: '00000000  7b 22 73 74 61 67 65 22 3a 22 72 75 6c 65 2d 74  {"stage":"rule-t\n00000010  65 78 74 22 7d                                   ext"}',
    meta: 'application/json · 21 B',
    source: '{\n  "stage": "rule-text"\n}',
  },
  'request-file': {
    hex: '00000000  7b 22 73 74 61 67 65 22 3a 22 62 72 65 61 6b 70  {"stage":"breakp\n00000010  6f 69 6e 74 2d 66 69 6c 65 22 7d                 oint-file"}',
    meta: 'application/json · 2.4 KB',
    source: '{\n  "stage": "breakpoint-file"\n}',
  },
  'response-text': {
    hex: '00000000  7b 22 73 74 61 67 65 22 3a 22 72 65 73 70 6f 6e  {"stage":"respon\n00000010  73 65 2d 74 65 78 74 22 7d                       se-text"}',
    meta: 'application/json · 25 B',
    source: '{\n  "stage": "response-text"\n}',
  },
  'response-file': {
    hex: '00000000  7b 22 73 74 61 67 65 22 3a 22 72 65 73 70 6f 6e  {"stage":"respon\n00000010  73 65 2d 66 69 6c 65 22 7d                       se-file"}',
    meta: 'application/json · 2.4 KB',
    source: '{\n  "stage": "response-file"\n}',
  },
};

export function BodyRuleEffectDesign(): React.JSX.Element | null {
  const { state } = useDesignState();
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(true);
  const [version, setVersion] = useState<BodyVersion>('final');
  const [viewerMode, setViewerMode] = useState('Pretty');
  const effect = state.bodyRuleEffect;
  const response = effect.startsWith('response-');

  useEffect(() => {
    setOpen(true);
    setVersion('final');
    setViewerMode('Pretty');
  }, [effect]);

  useEffect(() => {
    if (!effect) {
      setHost(null);
      return;
    }
    let nextHost: HTMLElement | undefined;
    let previousStyle: string | null = null;
    let legacyChildren: HTMLElement[] = [];
    let previousDisplays: string[] = [];
    const timer = window.setTimeout(() => {
      const phase = response ? 'response' : 'request';
      const visibleTab = Array.from(document.querySelectorAll<HTMLElement>(
        `.insp .tp[data-tab="${phase}"]`,
      )).find((candidate) => candidate.getClientRects().length > 0);
      nextHost = Array.from(visibleTab?.children ?? [])
        .filter((candidate): candidate is HTMLElement => candidate instanceof HTMLElement)
        .find((candidate) => candidate.querySelector('.bodyview.grow'));
      if (!nextHost) return;
      previousStyle = nextHost.getAttribute('style');
      legacyChildren = Array.from(nextHost.children)
        .filter((child): child is HTMLElement => child instanceof HTMLElement);
      previousDisplays = legacyChildren.map((child) => child.style.display);
      legacyChildren.forEach((child) => { child.style.display = 'none'; });
      Object.assign(nextHost.style, {
        display: 'flex',
        flexDirection: 'column',
        minHeight: '0',
      });
      setHost(nextHost);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      if (!nextHost) return;
      legacyChildren.forEach((child, index) => {
        child.style.display = previousDisplays[index] ?? '';
      });
      if (previousStyle === null) nextHost.removeAttribute('style');
      else nextHost.setAttribute('style', previousStyle);
      setHost(null);
    };
  }, [effect, response, state.tab]);

  if (!effect || !host) return null;
  const source = effect.endsWith('-file') ? 'File' : 'Text';
  const finalBody = FINAL_BY_EFFECT[effect];
  const body = version === 'original' ? ORIGINAL_REQUEST : finalBody;
  return createPortal(
    <div className={styles.bodyRuleEffectDesign} data-body-rule-effect-component>
      <CollapsibleSection
        grow
        labelExtra={(
          <span className={styles.bodyRuleEffectEvidence}>
            <button
              className={styles.bodyRuleEffectMarker}
              data-parity="capture-body-effect-marker"
              type="button"
              onClick={(event) => event.stopPropagation()}
            >
              Rule replaced
            </button>
            <span
              className={styles.bodyRuleEffectSource}
              data-parity="capture-body-effect-source"
            >
              {source}
            </span>
          </span>
        )}
        open={open}
        title={response ? 'Body' : 'Request Payload'}
        onOpenChange={setOpen}
      >
        <div
          className={styles.bodyRuleEffectVersionBar}
          data-parity="capture-body-effect-version-bar"
        >
          <span>Body version</span>
          <SegmentedControl
            ariaLabel="Body version"
            value={version}
            options={[
              { value: 'original', label: 'Original', disabled: response },
              { value: 'final', label: 'Final' },
            ]}
            onChange={setVersion}
          />
        </div>
        {response ? (
          <div
            className={styles.bodyRuleEffectUnavailable}
            data-parity="capture-body-effect-unavailable"
          >
            <Info aria-hidden="true" />
            <span>Original response body is unavailable for a headers-stage replacement.</span>
          </div>
        ) : null}
        <BodyViewerDesign
          ariaLabel={`${version} body view`}
          hex={body.hex}
          language="json"
          meta={body.meta}
          modes={['Pretty', 'Tree', 'Raw', 'Hex']}
          source={body.source}
          value={viewerMode}
          onFullscreen={() => undefined}
          onModeChange={setViewerMode}
        />
      </CollapsibleSection>
    </div>,
    host,
  );
}
