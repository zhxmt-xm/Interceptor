import { useEffect, useRef, useState } from 'react';

import { findLeaf } from '@interceptor/core-protocol';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { Splitter } from '../../../components/Splitter/Splitter';
import { CollectionPanel } from '../CollectionPanel/CollectionPanel';
import {
  COLLECTION_WIDTH,
  DOCUMENT_TABS_HEIGHT,
  MIN_COLLECTION_WIDTH,
  MIN_RESPONSE_HEIGHT,
  RESPONSE_HEIGHT,
  SPLITTER_TRACK,
  URL_BAR_HEIGHT,
} from '../constants';
import { useComposerStore } from '../data/composerStore';
import { useCollection } from '../data/useCollection';
import { DocumentTabs } from '../DocumentTabs/DocumentTabs';
import { RequestPane } from '../RequestPane/RequestPane';
import { RequestUrlBar } from '../RequestUrlBar/RequestUrlBar';
import { ResponsePane } from '../ResponsePane/ResponsePane';
import { maxCollectionWidth, maxResponseHeight } from '../utils';

import styles from './ComposerMain.module.css';
import { NoOpenRequest } from './NoOpenRequest';

/**
 * Composer 工作区：Collection 分栏 / 竖直 splitter / 工作区，
 * 工作区纵向是文档标签条 · URL 行 · 请求编辑区 · 水平 splitter · 响应区。
 *
 * 设计稿的 216px / 368px 只是初始值：两处 splitter 可拖拽，上限由对侧最小尺寸推导，
 * 窗口缩放时同样重新 clamp。
 */
export function ComposerMain(): React.JSX.Element {
  useCollection();

  const collectionOpen = useComposerStore((state) => state.collectionOpen);
  const activeRequestId = useComposerStore((state) => state.activeRequestId);
  const nodes = useComposerStore((state) => state.nodes);
  const setHistoryOpen = useComposerStore((state) => state.setHistoryOpen);

  const mainRef = useRef<HTMLDivElement>(null);
  const workRef = useRef<HTMLDivElement>(null);
  const [collectionWidth, setCollectionWidth] = useState(COLLECTION_WIDTH);
  const [responseHeight, setResponseHeight] = useState(RESPONSE_HEIGHT);

  const request = activeRequestId ? findLeaf(nodes, activeRequestId) : null;

  useEffect(() => {
    const main = mainRef.current;
    const work = workRef.current;
    if (!main || !work) {
      return;
    }
    const observer = new ResizeObserver(() => {
      setCollectionWidth((width) =>
        Math.min(width, maxCollectionWidth(main.clientWidth)),
      );
      setResponseHeight((height) =>
        Math.min(height, maxResponseHeight(work.clientHeight)),
      );
    });
    observer.observe(main);
    observer.observe(work);
    return () => observer.disconnect();
  }, []);

  const startCollectionDrag = (event: React.PointerEvent): void => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = collectionWidth;
    const total = mainRef.current?.clientWidth ?? 0;
    const onMove = (move: PointerEvent): void => {
      const next = startWidth + (move.clientX - startX);
      setCollectionWidth(
        Math.min(Math.max(next, MIN_COLLECTION_WIDTH), maxCollectionWidth(total)),
      );
    };
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const startResponseDrag = (event: React.PointerEvent): void => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = responseHeight;
    const total = workRef.current?.clientHeight ?? 0;
    const onMove = (move: PointerEvent): void => {
      const next = startHeight - (move.clientY - startY);
      setResponseHeight(
        Math.min(Math.max(next, MIN_RESPONSE_HEIGHT), maxResponseHeight(total)),
      );
    };
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div
      className={styles.main}
      ref={mainRef}
      style={{
        gridTemplateColumns: collectionOpen
          ? `${collectionWidth}px ${SPLITTER_TRACK}px minmax(0, 1fr)`
          : 'minmax(0, 1fr)',
      }}
      // 历史弹层没有遮罩层，点空白处即关闭。
      onPointerDown={(event) => {
        if (event.target instanceof Element && !event.target.closest('button')) {
          setHistoryOpen(false);
        }
      }}
    >
      {collectionOpen ? (
        <>
          <CollectionPanel />
          <Splitter
            onPointerDown={startCollectionDrag}
            automationId={AUTOMATION_IDS.composer.collectionSplitter}
          />
        </>
      ) : null}

      <div
        className={styles.work}
        ref={workRef}
        style={{
          gridTemplateRows: request
            ? `${DOCUMENT_TABS_HEIGHT}px ${URL_BAR_HEIGHT}px minmax(0, 1fr) ${SPLITTER_TRACK}px ${responseHeight}px`
            : `${DOCUMENT_TABS_HEIGHT}px minmax(0, 1fr)`,
        }}
      >
        <DocumentTabs />
        {request ? (
          <>
            <RequestUrlBar request={request} />
            <RequestPane request={request} />
            <Splitter
              orientation="horizontal"
              onPointerDown={startResponseDrag}
              automationId={AUTOMATION_IDS.composer.splitter}
            />
            <ResponsePane request={request} />
          </>
        ) : (
          <NoOpenRequest />
        )}
      </div>
    </div>
  );
}
