"use client";

import Image from "next/image";
import { useEffect, useMemo } from "react";
import styles from "./SelectedImageGrid.module.css";

function ImagePreview({ file, alt }: { file: File; alt: string }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);

  useEffect(() => {
    return () => URL.revokeObjectURL(url);
  }, [url]);

  return <Image className={styles.image} src={url} alt={alt} width={640} height={400} unoptimized />;
}

export default function SelectedImageGrid({
  files,
  startNumber = 1,
  label = "세트",
  disabled = false,
  onChange,
}: {
  files: File[];
  startNumber?: number;
  label?: string;
  disabled?: boolean;
  onChange: (files: File[]) => void;
}) {
  if (files.length === 0) return null;

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= files.length) return;
    const next = [...files];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className={styles.grid} role="list" aria-label="선택한 사진 순서">
      {files.map((file, index) => {
        const number = startNumber + index;
        const previewLabel = `${number}${label}`;
        return (
          <article className={styles.card} role="listitem" key={`${file.name}-${file.lastModified}-${index}`}>
            <div className={styles.imageWrap}>
              <ImagePreview file={file} alt={`${previewLabel} 결과 사진`} />
              <span className={styles.label}>{previewLabel}</span>
            </div>
            <div className={styles.info}>
              <strong>{file.name}</strong>
              <span>{(file.size / 1024 / 1024).toFixed(2)}MB</span>
            </div>
            <div className={styles.actions}>
              <button type="button" disabled={disabled || index === 0} onClick={() => move(index, -1)} aria-label={`${previewLabel} 사진을 앞으로 이동`}>←</button>
              <button type="button" disabled={disabled || index === files.length - 1} onClick={() => move(index, 1)} aria-label={`${previewLabel} 사진을 뒤로 이동`}>→</button>
              <button type="button" disabled={disabled} onClick={() => onChange(files.filter((_, fileIndex) => fileIndex !== index))}>삭제</button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
