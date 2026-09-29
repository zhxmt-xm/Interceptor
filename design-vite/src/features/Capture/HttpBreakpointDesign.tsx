import { useLayoutEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import { ActionFooter } from '../../components/ActionFooter/ActionFooter';
import { CollapsibleSection } from '../../components/CollapsibleSection/CollapsibleSection';
import { HeaderFieldsEditor, type HeaderField } from '../../components/HeaderFieldsEditor/HeaderFieldsEditor';
import { PauseBanner } from '../../components/PauseBanner/PauseBanner';
import {
  PayloadEditor,
  type ReplacementMode,
} from '../../components/PayloadEditor/PayloadEditor';
import { useDesignState } from '../../state/useDesignState';
import { BreakpointQueueMenu } from './BreakpointQueueMenu';
import { bodyRemainderFixture } from './utils';
import styles from './HttpBreakpointDesign.module.css';

interface BreakpointHosts {
  readonly actions: HTMLElement;
  readonly content: HTMLElement;
  readonly context: HTMLElement;
}

const HTTP_REPLACEMENT_OPTIONS = [
  { value: 'off', label: 'Off' },
  { value: 'text', label: 'Text' },
  { value: 'file', label: 'File' },
] as const;

const REQUEST_HEADERS: readonly HeaderField[] = [
  { id: 'content-type', name: 'content-type', value: 'application/json' },
  { id: 'authorization', name: 'authorization', value: 'Bearer eyJhbGci…' },
  { id: 'x-cart-id', name: 'x-cart-id', value: 'c_9f83a1', ruleEffect: 'set' },
];

const RESPONSE_HEADERS: readonly HeaderField[] = [
  { id: 'content-type', name: 'content-type', value: 'application/json' },
  { id: 'cache-control', name: 'cache-control', value: 'no-store', ruleEffect: 'append' },
];

function legacyEditableSections(contentHost: HTMLElement): HTMLElement[] {
  return Array.from(contentHost.children)
    .filter((child): child is HTMLElement => child instanceof HTMLElement)
    .filter((section) => section.querySelector(
      '[aria-label="Response status"], [aria-label="Header name"], [aria-label="Copy original body"], [aria-label="Replacement body"], [aria-label="Replacement response body"]',
    ));
}

export function HttpBreakpointDesign(): React.JSX.Element | null {
  const { state, updateState } = useDesignState();
  const [hosts, setHosts] = useState<BreakpointHosts | null>(null);
  const [statusOpen, setStatusOpen] = useState(true);
  const response = state.breakpointState === 'response';
  const queueHead = state.breakpointState === 'queue'
    && state.breakpointQueueSelection === 'http-head';
  const visible = state.breakpointState === 'request' || response || queueHead;
  const remainderFixture = useMemo(() => response ? undefined
    : bodyRemainderFixture(state.bodyRemainderSample, state.bodyRemainderNotice),
  [response, state.bodyRemainderSample, state.bodyRemainderNotice]);
  const replacementMode: ReplacementMode = state.breakpointBody === 'replace'
    ? 'text'
    : state.breakpointBody === 'file'
      ? 'file'
      : 'off';

  useLayoutEffect(() => {
    const context = document.querySelector<HTMLElement>('[data-breakpoint-context-host]');
    const content = document.querySelector<HTMLElement>('[data-breakpoint-content-host]');
    const actions = document.querySelector<HTMLElement>('[data-breakpoint-actions-host]');
    if (context && content && actions) setHosts({ context, content, actions });
  }, []);

  useLayoutEffect(() => {
    if (!hosts || !visible) return;
    const previousContextStyle = hosts.context.getAttribute('style');
    const previousActionsStyle = hosts.actions.getAttribute('style');
    const legacyElements = [
      ...Array.from(hosts.context.children),
      ...legacyEditableSections(hosts.content),
      ...Array.from(hosts.actions.children),
    ].filter((element): element is HTMLElement =>
      element instanceof HTMLElement && element.dataset.breakpointComponent === undefined);
    const previousDisplays = legacyElements.map((element) => element.style.display);
    legacyElements.forEach((element) => { element.style.display = 'none'; });
    Object.assign(hosts.context.style, {
      display: 'block', minHeight: '0', padding: '0', border: '0', background: 'transparent',
    });
    Object.assign(hosts.actions.style, {
      display: 'block', minHeight: '0', padding: '0', border: '0', background: 'transparent',
    });
    return () => {
      legacyElements.forEach((element, index) => { element.style.display = previousDisplays[index] ?? ''; });
      if (previousContextStyle === null) hosts.context.removeAttribute('style');
      else hosts.context.setAttribute('style', previousContextStyle);
      if (previousActionsStyle === null) hosts.actions.removeAttribute('style');
      else hosts.actions.setAttribute('style', previousActionsStyle);
    };
  }, [hosts, visible]);

  if (!hosts || !visible) return null;
  const close = (): void => updateState({ breakpointState: '' });
  return (
    <>
      {createPortal(
        <PauseBanner
          actions={queueHead ? <BreakpointQueueMenu /> : undefined}
          phase={response ? 'Response paused' : 'Request paused'}
          received={response}
          rule={response ? 'Token API' : 'Checkout API'}
        />,
        hosts.context,
      )}
      {createPortal(
        <div
          className={styles.httpBreakpointContent}
          data-breakpoint-component="content"
          key={response ? 'response' : 'request'}
        >
          {response ? (
            <CollapsibleSection
              open={statusOpen}
              title="Response status"
              onOpenChange={setStatusOpen}
            >
              <div className={styles.responseStatus}>
                <label htmlFor="design-breakpoint-response-status">Status</label>
                <input
                  id="design-breakpoint-response-status"
                  aria-label="Response status"
                  defaultValue="200"
                />
                <span>OK</span>
              </div>
            </CollapsibleSection>
          ) : null}
          <HeaderFieldsEditor
            key={remainderFixture?.mediaType ?? 'application/json'}
            effectPlacement="below"
            initialFields={response ? RESPONSE_HEADERS : REQUEST_HEADERS.map((field) => field.name === 'content-type'
              ? { ...field, value: remainderFixture?.mediaType ?? field.value } : field)}
            title={response ? 'Response headers' : 'Request headers'}
          />
          <PayloadEditor
            contentKind="body"
            key={remainderFixture ? `${state.bodyRemainderSample}-${state.bodyRemainderNotice}` : 'current'}
            file={{
              mediaType: remainderFixture?.mediaType ?? (response ? 'application/json' : 'text/plain'),
              previewMetadata: remainderFixture?.metadata,
              name: remainderFixture?.fileName ?? (response ? 'token-response.json' : 'checkout-body.txt'),
              meta: remainderFixture ? `${remainderFixture.size} · ${remainderFixture.mediaType}`
                : response ? '2.4 KiB · application/json' : '51 B · text/plain',
              preview: remainderFixture?.source ?? (response
                ? '{\n  "access_token": "eyJhbGci…",\n  "expires_in": 3600\n}'
                : '{\n  "cartId": "c_9f83a1",\n  "coupon": "WELCOME20"\n}'),
              ready: state.breakpointFile === 'valid',
            }}
            loading={state.breakpointBody === 'loading' ? {
              title: response ? 'Receiving response body…' : 'Receiving request body…',
              detail: response ? '416 B received so far' : '18 B received so far',
            } : undefined}
            originalFormat={remainderFixture?.mediaType ?? 'application/json'}
            originalMeta={remainderFixture ? `${remainderFixture.size} · ${remainderFixture.mediaType === 'image/png' ? 'png' : 'json'}`
              : response ? '842 B · json' : '63 B · json'}
            originalPayload={remainderFixture?.source ?? (response
              ? '{\n  "access_token": "eyJhbGci…",\n  "expires_in": 3600\n}'
              : '{\n  "cartId": "c_9f83a1",\n  "coupon": "WELCOME20"\n}')}
            originalTitle="Original body"
            originalViewOptions={['Pretty', 'Tree', 'Raw', 'Hex']}
            replacementMode={replacementMode}
            replacementOptions={HTTP_REPLACEMENT_OPTIONS}
            replacementPayload=""
            replacementTitle="Replacement body"
            previewMetadata={remainderFixture?.metadata}
            onChooseFile={() => updateState({ breakpointBody: 'file', breakpointFile: 'valid' })}
            onRemoveFile={() => updateState({ breakpointBody: 'file', breakpointFile: 'none' })}
            onReplacementModeChange={(mode) => updateState({
              breakpointBody: mode === 'text' ? 'replace' : mode === 'file' ? 'file' : 'ready',
            })}
          />
        </div>,
        hosts.content,
      )}
      {createPortal(
        <ActionFooter
          forwardLabel="Forward edited"
          onContinue={close}
          onDrop={close}
          onForward={close}
        />,
        hosts.actions,
      )}
    </>
  );
}