import { useEffect, useState } from 'react';

import styles from './ImageView.module.css';

interface ImageViewProps {
  bytes: Uint8Array;
  mediaType: string | undefined;
  /** 尺寸只能从解码后的 `<img>` 拿；解析文件头对预览没有额外价值。 */
  onLoad(size: { width: number; height: number }): void;
  onError(): void;
  parityId?: string;
}

/** 把字节交给浏览器解码：解码跑在 Renderer 的图片线程上，主线程只负责挂一个元素。 */
export function ImageView({
  bytes,
  mediaType,
  onLoad,
  onError,
  parityId,
}: ImageViewProps): React.JSX.Element {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mediaType }));
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [bytes, mediaType]);

  return (
    <div className={styles.host} data-parity={parityId}>
      {url ? (
        <span className={styles.frame}>
          <img
            className={styles.image}
            src={url}
            alt=""
            onLoad={(event) => onLoad({
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight,
            })}
            onError={onError}
          />
        </span>
      ) : null}
    </div>
  );
}
