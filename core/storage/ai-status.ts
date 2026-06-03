import { storage } from '#imports';

export interface DownloadProgress {
  /** 0..1; 1 means weights extracted and ready. */
  loaded: number;
  state: 'starting' | 'downloading' | 'extracting' | 'done' | 'error';
  message?: string;
  updatedAt: number;
}

// Use `local:` rather than `session:` — chrome.storage.session is not exposed
// to offscreen documents by default (requires setAccessLevel), and the
// download-progress writes happen from offscreen. Local works everywhere and
// surviving SW restarts is actually useful for resuming in-progress downloads.
const nanoItem = storage.defineItem<DownloadProgress | null>('local:nanoDownload', {
  fallback: null,
});

const gemmaItem = storage.defineItem<DownloadProgress | null>('local:gemmaDownload', {
  fallback: null,
});

function progressFor(item: typeof nanoItem) {
  return {
    get: () => item.getValue(),
    set: (value: DownloadProgress | null) => item.setValue(value),
    watch: (cb: (next: DownloadProgress | null) => void) => item.watch(cb),
    clear: () => item.setValue(null),
  };
}

export const nanoDownload = progressFor(nanoItem);
export const gemmaDownload = progressFor(gemmaItem);

// Back-compat alias for any earlier imports.
export type NanoDownloadProgress = DownloadProgress;
