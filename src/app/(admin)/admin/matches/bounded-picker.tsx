"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";

import {
  moveSelectableIndex,
  resolveSelectableIndex,
} from "./bounded-picker-navigation";
import styles from "./matches-admin.module.css";

export type BoundedPickerOption = Readonly<{
  value: string;
  label: string;
  status: "ACTIVE" | "INACTIVE";
  searchText?: string;
}>;

const MAX_VISIBLE_OPTIONS = 20;
const MIN_REMOTE_QUERY_LENGTH = 2;

function normalized(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("ko-KR");
}

function parseRemoteOptions(value: unknown): BoundedPickerOption[] {
  if (!value || typeof value !== "object" || !("items" in value) || !Array.isArray(value.items)) return [];
  return value.items.flatMap((candidate) => {
    if (
      !candidate ||
      typeof candidate !== "object" ||
      !("value" in candidate) ||
      typeof candidate.value !== "string" ||
      !("label" in candidate) ||
      typeof candidate.label !== "string" ||
      !("status" in candidate) ||
      (candidate.status !== "ACTIVE" && candidate.status !== "INACTIVE")
    ) return [];
    return [{ value: candidate.value, label: candidate.label, status: candidate.status }];
  }).slice(0, MAX_VISIBLE_OPTIONS);
}

export function BoundedPicker({
  ariaLabel,
  value,
  options,
  disabledValues,
  placeholder,
  remoteEndpoint,
  onChange,
}: {
  ariaLabel: string;
  value: string;
  options: readonly BoundedPickerOption[];
  disabledValues?: ReadonlySet<string>;
  placeholder: string;
  remoteEndpoint?: string;
  onChange: (value: string, option?: BoundedPickerOption) => void;
}) {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [remoteOptions, setRemoteOptions] = useState<readonly BoundedPickerOption[]>([]);
  const [remoteStatus, setRemoteStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [activeIndex, setActiveIndex] = useState(0);
  const selected = options.find((option) => option.value === value) ??
    remoteOptions.find((option) => option.value === value);

  useEffect(() => {
    if (!open || !remoteEndpoint || normalized(query).length < MIN_REMOTE_QUERY_LENGTH) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        setRemoteStatus("loading");
        const params = new URLSearchParams({ q: query });
        if (value) params.set("include", value);
        const response = await fetch(`${remoteEndpoint}?${params}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          setRemoteStatus("error");
          return;
        }
        setRemoteOptions(parseRemoteOptions(await response.json()));
        setRemoteStatus("ready");
        setActiveIndex(0);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setRemoteOptions([]);
          setRemoteStatus("error");
        }
      }
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query, remoteEndpoint, value]);

  const visible = useMemo(() => {
    const text = normalized(query);
    const source = remoteEndpoint && text ? remoteOptions : options;
    const deduped = new Map<string, BoundedPickerOption>();
    for (const option of source) {
      const haystack = normalized(`${option.label} ${option.searchText ?? ""}`);
      if (!text || haystack.includes(text)) deduped.set(option.value, option);
    }
    if (selected && (!text || normalized(selected.label).includes(text))) {
      deduped.set(selected.value, selected);
    }
    return [...deduped.values()].slice(0, MAX_VISIBLE_OPTIONS);
  }, [options, query, remoteEndpoint, remoteOptions, selected]);
  const selectableIndices = useMemo(() => visible.flatMap((option, index) =>
    option.status === "ACTIVE" && !(disabledValues?.has(option.value) && option.value !== value)
      ? [index]
      : []), [disabledValues, value, visible]);
  const resolvedActiveIndex = resolveSelectableIndex(selectableIndices, activeIndex);

  function moveActive(direction: -1 | 1) {
    const next = moveSelectableIndex(selectableIndices, resolvedActiveIndex, direction);
    if (next >= 0) setActiveIndex(next);
  }

  function choose(option?: BoundedPickerOption) {
    if (option && (option.status !== "ACTIVE" || (disabledValues?.has(option.value) && option.value !== value))) return;
    onChange(option?.value ?? "", option);
    setOpen(false);
    setQuery("");
  }

  return <div className={styles.picker}>
    <div className={styles.pickerInput}>
      <input
        aria-activedescendant={open && resolvedActiveIndex >= 0 ? `${listboxId}-${resolvedActiveIndex}` : undefined}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={open}
        aria-label={ariaLabel}
        role="combobox"
        placeholder={placeholder}
        value={open ? query : selected?.label ?? ""}
        onBlur={() => window.setTimeout(() => { setOpen(false); setQuery(""); }, 120)}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); setRemoteStatus(remoteEndpoint ? "loading" : "idle"); setActiveIndex(0); }}
        onFocus={() => { setOpen(true); setQuery(""); setRemoteStatus("idle"); setActiveIndex(0); }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            if (!open) {
              setOpen(true);
              setActiveIndex(selectableIndices[0] ?? 0);
            } else moveActive(1);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) {
              setOpen(true);
              setActiveIndex(selectableIndices.at(-1) ?? 0);
            } else moveActive(-1);
          } else if (event.key === "Enter" && open && resolvedActiveIndex >= 0 && visible[resolvedActiveIndex]) {
            event.preventDefault();
            choose(visible[resolvedActiveIndex]);
          } else if (event.key === "Escape") {
            setOpen(false);
            setQuery("");
          }
        }}
      />
      {value ? <button type="button" aria-label={`${ariaLabel} 선택 해제`} onClick={() => choose()}><X size={14} aria-hidden="true" /></button> : <ChevronDown size={15} aria-hidden="true" />}
    </div>
    {open ? <div className={styles.pickerList}>
      {remoteEndpoint && normalized(query).length < MIN_REMOTE_QUERY_LENGTH ? <p className={styles.pickerNotice}>두 글자 이상 또는 이름#태그를 입력하면 최대 {MAX_VISIBLE_OPTIONS}개만 검색합니다.</p> : null}
      {remoteEndpoint && normalized(query).length >= MIN_REMOTE_QUERY_LENGTH && remoteStatus === "loading" ? <p className={styles.pickerNotice} role="status" aria-live="polite">검색하고 있습니다…</p> : null}
      {remoteEndpoint && normalized(query).length >= MIN_REMOTE_QUERY_LENGTH && remoteStatus === "error" ? <p className={styles.pickerNotice} role="alert">검색 연결에 실패했습니다. 잠시 후 다시 입력해 주세요.</p> : null}
      {visible.length === 0 && (!remoteEndpoint || (normalized(query).length >= MIN_REMOTE_QUERY_LENGTH && remoteStatus === "ready")) ? <p className={styles.pickerNotice} role="status" aria-live="polite">검색 결과가 없습니다.</p> : null}
      <div className={styles.pickerOptions} id={listboxId} role="listbox" aria-label={`${ariaLabel} 검색 결과`}>
        {visible.map((option, index) => {
          const disabled = option.status !== "ACTIVE" || (disabledValues?.has(option.value) && option.value !== value);
          return <button
            aria-disabled={disabled}
            aria-selected={option.value === value}
            data-active={index === resolvedActiveIndex}
            disabled={disabled}
            id={`${listboxId}-${index}`}
            key={option.value}
            role="option"
            type="button"
            onMouseEnter={() => { if (!disabled) setActiveIndex(index); }}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(option)}
          >
            <span>{option.label}</span>
            {option.value === value ? <Check size={14} aria-hidden="true" /> : option.status === "INACTIVE" ? <small>비활성</small> : null}
          </button>;
        })}
      </div>
    </div> : null}
  </div>;
}
