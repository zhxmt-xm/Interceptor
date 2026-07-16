import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowRight, Copy, Pause } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type {
  WebSocketFrameDirection,
  WebSocketFrameSummary,
} from '../../../../shared/desktop-api';
import { Count, cx, IconButton, Segmented, Switch } from '../../../components';
import { sizeLabel } from '../row-format';
import { BodyView } from './BodyView';
import { useWebSocketFrames } from './useWebSocketFrames';
import styles from './WebSocketMessages.module.css';

const ROW_HEIGHT = 38;
type DirectionFilter = 'All' | 'Sent' | 'Received';

interface WebSocketMessagesProps {
  exchangeId: string;
  startedAt: number;
}

export function WebSocketMessages({
  exchangeId,
  startedAt,
}: WebSocketMessagesProps): React.JSX.Element {
  const [filter, setFilter] = useState<DirectionFilter>('All');
  const [selectedSequence, setSelectedSequence] = useState<number | null>(null);
  const direction = filterDirection(filter);
  const {
    frames,
    loading,
    loadingMore,
    hasMore,
    breakpointsEnabled,
    error,
    loadMore,
    setBreakpointsEnabled,
  } =
    useWebSocketFrames(exchangeId, direction);
  const selected = frames.find((frame) => frame.seq === selectedSequence) ?? null;
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: frames.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  useEffect(() => {
    setSelectedSequence(null);
  }, [exchangeId, filter]);

  useEffect(() => {
    virtualizer.measure();
  }, [selectedSequence, virtualizer]);

  const handleScroll = (): void => {
    const element = scrollRef.current;
    if (!element || !hasMore || loadingMore) {
      return;
    }
    if (element.scrollHeight - element.scrollTop - element.clientHeight < ROW_HEIGHT * 6) {
      loadMore();
    }
  };

  return (
    <div className={styles.messages}>
      <div className={styles.toolbar}>
        <Segmented
          options={['All', 'Sent', 'Received']}
          value={filter}
          onChange={(value) => setFilter(value as DirectionFilter)}
        />
        <span className={styles.spacer} />
        <Count>Pause on message</Count>
        <Switch checked={breakpointsEnabled} onChange={setBreakpointsEnabled} />
      </div>

      <div className={styles.frameList}>
        <div className={styles.frameScroll} ref={scrollRef} onScroll={handleScroll}>
          {loading ? <div className={styles.empty}>Loading messages...</div> : null}
          {!loading && error ? (
            <div className={styles.empty}>Failed to load messages: {error}</div>
          ) : null}
          {!loading && !error && frames.length === 0 ? (
            <div className={styles.empty}>No WebSocket messages captured.</div>
          ) : null}
          {frames.length > 0 ? (
            <div className={styles.viewport} style={{ height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const frame = frames[virtualRow.index];
                if (!frame) {
                  return null;
                }
                return (
                  <div
                    key={frame.seq}
                    ref={virtualizer.measureElement}
                    data-index={virtualRow.index}
                    className={styles.virtualItem}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <FrameRow
                      frame={frame}
                      startedAt={startedAt}
                      selected={frame.seq === selectedSequence}
                      onSelect={() => setSelectedSequence(frame.seq)}
                    />
                    {frame.seq === selectedSequence ? (
                      <Payload frame={frame} />
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
          {loadingMore ? <div className={styles.loadingMore}>Loading more...</div> : null}
        </div>

      </div>

      <div className={styles.note}>
        <Pause size={13} strokeWidth={1.9} />
        {breakpointsEnabled
          ? 'Next message pauses in Breakpoints before forwarding.'
          : 'Enable to inspect, edit, continue, or drop messages before forwarding.'}
      </div>
    </div>
  );
}

function FrameRow({
  frame,
  startedAt,
  selected,
  onSelect,
}: {
  frame: WebSocketFrameSummary;
  startedAt: number;
  selected: boolean;
  onSelect(): void;
}): React.JSX.Element {
  const outgoing = frame.direction === 'client-to-server';
  return (
    <button
      type="button"
      className={cx(styles.frame, selected && styles.selected)}
      onClick={onSelect}
    >
      <span className={cx(styles.direction, outgoing ? styles.outgoing : styles.incoming)}>
        <ArrowRight size={12} strokeWidth={1.9} />
      </span>
      <span className={styles.kind}>{frame.opcode === 1 ? 'Text' : 'Binary'}</span>
      <FramePreview frame={frame} />
      <span className={styles.size}>{sizeLabel(frame.payloadSize)}</span>
      <span className={styles.time}>{relativeTime(startedAt, frame.timestamp)}</span>
    </button>
  );
}

function filterDirection(
  filter: DirectionFilter,
): WebSocketFrameDirection | undefined {
  if (filter === 'Sent') {
    return 'client-to-server';
  }
  if (filter === 'Received') {
    return 'server-to-client';
  }
  return undefined;
}

function directionLabel(frame: WebSocketFrameSummary): string {
  return frame.direction === 'client-to-server' ? 'Sent' : 'Received';
}

function FramePreview({ frame }: { frame: WebSocketFrameSummary }): React.JSX.Element {
  const [preview, setPreview] = useState(
    frame.opcode === 1 ? `Text message ${frame.seq}` : `Binary message ${frame.seq}`,
  );

  useEffect(() => {
    const hash = frame.payload?.bodyHash;
    if (!hash) {
      return;
    }
    const apply = (bytes: Uint8Array): void => {
      setPreview(
        frame.opcode === 1
          ? new TextDecoder().decode(bytes).replace(/\s+/g, ' ')
          : Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(' '),
      );
    };
    const api = window.interceptor;
    if (!api?.readBody) {
      return;
    }
    let active = true;
    void api
      .readBody(hash, 0, Math.min(frame.payload?.encodedSize ?? 160, 160))
      .then((chunk) => {
        if (active) {
          apply(chunk.data);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [frame.opcode, frame.payload?.bodyHash, frame.payload?.encodedSize, frame.seq]);

  return <span className={styles.preview}>{preview}</span>;
}

function relativeTime(startedAt: number, timestamp: number): string {
  const elapsed = Math.max(0, timestamp - startedAt);
  return elapsed < 1_000 ? `+${elapsed} ms` : `+${(elapsed / 1_000).toFixed(1)} s`;
}

function copyPayload(frame: WebSocketFrameSummary): void {
  if (!frame.payload?.bodyHash) {
    return;
  }
  void window.interceptor
    .readBody(frame.payload.bodyHash, 0, Math.min(frame.payload.encodedSize, 256 * 1024))
    .then((chunk) => {
      const text = frame.opcode === 1
        ? new TextDecoder().decode(chunk.data)
        : Array.from(chunk.data, (byte) => byte.toString(16).padStart(2, '0')).join(' ');
      return navigator.clipboard.writeText(text);
    });
}

function Payload({ frame }: { frame: WebSocketFrameSummary }): React.JSX.Element {
  return (
    <div className={styles.payload}>
      <div className={styles.payloadHead}>
        <b>{directionLabel(frame)} {frame.opcode === 1 ? 'text' : 'binary'}</b>
        <Count>{sizeLabel(frame.payloadSize)} · message {frame.seq}</Count>
        <IconButton
          icon={Copy}
          label="Copy payload"
          size="sm"
          onClick={() => copyPayload(frame)}
        />
      </div>
      {frame.payload ? (
        <BodyView body={frame.payload} compact />
      ) : (
        <div className={styles.empty}>Payload was not retained.</div>
      )}
    </div>
  );
}