import { useVirtualizer } from '@tanstack/react-virtual';
import { Copy, Download, Info } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type {
  CaptureExchangeDetail,
  GrpcMessageSide,
  GrpcMessageSummary,
} from '../../../../shared/desktop-api';
import { Count, cx, IconButton, Segmented } from '../../../components';
import { sizeLabel } from '../utils';
import { BodyView } from './BodyView';
import { useGrpcMessages } from './useGrpcMessages';
import styles from './GrpcMessages.module.css';

const ROW_HEIGHT = 38;

export function GrpcMessages({
  detail,
}: {
  detail: CaptureExchangeDetail;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [side, setSide] = useState<GrpcMessageSide>(
    detail.responseBody ? 'response' : 'request',
  );
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const { page, messages, loading, loadingMore, error, loadMore } =
    useGrpcMessages(detail.summary.id, side);
  const selected = messages.find((message) => message.index === selectedIndex) ?? null;
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  useEffect(() => {
    setSelectedIndex(null);
  }, [side, detail.summary.id]);

  useEffect(() => {
    virtualizer.measure();
  }, [selectedIndex, virtualizer]);

  const handleScroll = (): void => {
    const element = scrollRef.current;
    if (!element || !page?.hasMore || loadingMore) {
      return;
    }
    if (element.scrollHeight - element.scrollTop - element.clientHeight < ROW_HEIGHT * 6) {
      loadMore();
    }
  };

  const handleSelectMessage = useCallback((index: number): void => {
    setSelectedIndex((current) => (current === index ? null : index));
  }, []);

  const grpcStatus = readHeader(detail.responseTrailers, 'grpc-status')
    ?? readHeader(detail.responseHeaders, 'grpc-status');
  const grpcMessage = readHeader(detail.responseTrailers, 'grpc-message')
    ?? readHeader(detail.responseHeaders, 'grpc-message');

  return (
    <div className={styles.messages}>
      <div className={styles.toolbar}>
        <Segmented
          options={[
            { value: 'request', label: t('capture.request') },
            { value: 'response', label: t('capture.response') },
          ]}
          value={side}
          onChange={(value) => setSide(value === 'request' ? 'request' : 'response')}
        />
        <span className={styles.spacer} />
        <Count>{page?.contentType ?? 'application/grpc'}</Count>
        {grpcStatus ? (
          <span className={cx(styles.grpcStatus, grpcStatus !== '0' && styles.grpcError)}>
            <span className={styles.dot} />status {grpcStatus}
          </span>
        ) : null}
      </div>

      <div className={styles.messageList}>
        <div className={styles.messageScroll} ref={scrollRef} onScroll={handleScroll}>
          {loading ? <div className={styles.empty}>{t('capture.loadingGrpcMessages')}</div> : null}
          {!loading && error ? (
            <div className={styles.empty}>{t('capture.failedLoadMessages', { error })}</div>
          ) : null}
          {!loading && !error && page && !page.recognized ? (
            <div className={styles.empty}>
              {t(side === 'request' ? 'capture.requestBodyNotGrpc' : 'capture.responseBodyNotGrpc')}
            </div>
          ) : null}
          {!loading && !error && page?.recognized && messages.length === 0 ? (
            <div className={styles.empty}>
              {t(side === 'request' ? 'capture.noRequestGrpcMessages' : 'capture.noResponseGrpcMessages')}
            </div>
          ) : null}
          {messages.length > 0 ? (
            <div className={styles.viewport} style={{ height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const message = messages[virtualRow.index];
                if (!message) {
                  return null;
                }
                return (
                  <div
                    key={message.index}
                    ref={virtualizer.measureElement}
                    data-index={virtualRow.index}
                    className={styles.virtualItem}
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <MessageRow
                      message={message}
                      selected={message.index === selectedIndex}
                      encoding={page?.encoding}
                      onSelect={handleSelectMessage}
                    />
                    {message.index === selectedIndex && page?.bodyHash ? (
                      <MessagePayload
                        message={message}
                        side={side}
                        bodyHash={page.bodyHash}
                        contentType={page.contentType}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
          {loadingMore ? <div className={styles.loadingMore}>{t('capture.loadingMore')}</div> : null}
        </div>
      </div>

      {page?.malformedOffset !== undefined ? (
        <div className={styles.warning}>
          {t('capture.invalidGrpcEnvelope', { offset: page.malformedOffset })}
        </div>
      ) : null}

      {grpcStatus || grpcMessage ? (
        <div className={styles.trailers}>
          <span>{t('capture.responseTrailers')}</span>
          {grpcStatus ? <code>grpc-status: {grpcStatus}</code> : null}
          {grpcMessage ? <code>grpc-message: {grpcMessage}</code> : null}
        </div>
      ) : null}

      <div className={styles.note}>
        <Info size={13} strokeWidth={1.9} />
        {t('capture.noDescriptor')}
      </div>
    </div>
  );
}

const MessageRow = memo(function MessageRow({
  message,
  selected,
  encoding,
  onSelect,
}: {
  message: GrpcMessageSummary;
  selected: boolean;
  encoding: string | undefined;
  onSelect: (index: number) => void;
}): React.JSX.Element {
  const { i18n, t } = useTranslation();
  const state = message.truncated
    ? t('capture.truncated')
    : message.compressed
      ? t('capture.compressed', { encoding: encoding ?? 'unknown' })
      : t('capture.rawProtobuf');
  return (
    <button
      type="button"
      className={cx(styles.message, selected && styles.selected)}
      onClick={() => onSelect(message.index)}
    >
      <span className={styles.direction}>
        <Download size={12} strokeWidth={1.9} />
      </span>
      <span className={styles.index}>{t('capture.message', { index: message.index + 1 })}</span>
      <span
        className={cx(
          styles.metadata,
          message.compressed && styles.compressed,
          message.truncated && styles.truncated,
        )}
      >
        {state}
      </span>
      <span className={styles.size}>{sizeLabel(message.payloadLength, i18n.language)}</span>
      <span className={styles.offset}>@ 0x{message.payloadOffset.toString(16).padStart(4, '0')}</span>
    </button>
  );
});

function MessagePayload({
  message,
  side,
  bodyHash,
  contentType,
}: {
  message: GrpcMessageSummary;
  side: GrpcMessageSide;
  bodyHash: string;
  contentType: string | undefined;
}): React.JSX.Element {
  const { i18n, t } = useTranslation();
  const json = contentType?.split(';', 1)[0]?.trim().toLowerCase().endsWith('+json');
  return (
    <div className={styles.payload}>
      <div className={styles.payloadHead}>
        <b>
          {t(side === 'request' ? 'capture.requestMessage' : 'capture.responseMessage', { index: message.index + 1 })}
        </b>
        <Count>
          {json ? t('capture.rawJson') : t('capture.rawProtobufLabel')} · {sizeLabel(message.payloadLength, i18n.language)}
        </Count>
        <IconButton
          icon={Copy}
          label={t('capture.copyPayload')}
          size="sm"
          onClick={() => copyPayload(bodyHash, message, json)}
        />
      </div>
      <BodyView
        body={{
          bodyHash,
          mediaType: json ? 'application/json' : 'application/octet-stream',
          encodedSize: message.payloadLength,
          truncated: message.truncated,
          decodeStatus: 'ok',
        }}
        compact
        offset={message.payloadOffset}
        previewLimit={48}
      />
    </div>
  );
}

function copyPayload(
  bodyHash: string,
  message: GrpcMessageSummary,
  asText: boolean | undefined,
): void {
  void window.interceptor
    .readBody(bodyHash, message.payloadOffset, Math.min(message.payloadLength, 256 * 1024))
    .then((chunk) => {
      const value = asText
        ? new TextDecoder().decode(chunk.data)
        : Array.from(chunk.data, (byte) => byte.toString(16).padStart(2, '0')).join(' ');
      return navigator.clipboard.writeText(value);
    });
}

function readHeader(
  headers: CaptureExchangeDetail['responseHeaders'],
  name: string,
): string | undefined {
  return headers.find((header) => header.name.toLowerCase() === name)?.value;
}