import { DownloadRoute, MissingTool, PhoneAccess, ResultDetails, Route, UpdateStatus } from '../types';

const API = '/api';

export interface UploadedInfo {
  id: string;
  originalName: string;
  size: number;
  mimetype: string;
}

const messageFrom = (raw: string, status: number, fallback: string) => {
  try {
    const json = JSON.parse(raw);
    if (typeof json.error === 'string' && json.error) return json.error;
  } catch {
    /* not JSON */
  }
  return `${fallback} (${status})`;
};

/** Uploads one file with real progress, resolving to the backend's record. */
export const uploadFile = (file: File, onProgress: (fraction: number) => void) =>
  new Promise<UploadedInfo>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API}/upload`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const json = JSON.parse(xhr.responseText);
          if (json.success && Array.isArray(json.data) && json.data[0]) {
            resolve(json.data[0] as UploadedInfo);
            return;
          }
        } catch {
          /* fall through */
        }
        reject(new Error('Unexpected response from the server'));
        return;
      }
      reject(new Error(messageFrom(xhr.responseText, xhr.status, 'Upload failed')));
    };
    xhr.onerror = () => reject(new Error('Network error while uploading'));
    xhr.onabort = () => reject(new Error('Upload cancelled'));
    const form = new FormData();
    // FormData sends a file's own (internal) type, not a `type` property laid
    // over it - which is how the dropzone fills in a type the browser left
    // blank (see getFilesFromEvent in FileProcessor). Re-wrap so the upload
    // carries it; the backend's MIME allowlist refuses octet-stream. File
    // parts reference the original data, so this copies nothing.
    form.append(
      'files',
      new File([file], file.name, { type: file.type, lastModified: file.lastModified })
    );
    xhr.send(form);
  });

export interface ProcessResponse {
  id: string;
  originalSize: number;
  compressedSize?: number;
  convertedSize?: number;
  newFormat?: string;
  details?: ResultDetails | null;
}

export const processFile = async (
  serverId: string,
  route: Route,
  body: Record<string, string | number>
): Promise<ProcessResponse> => {
  const response = await fetch(`${API}/${route}/${serverId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(messageFrom(raw, response.status, 'Processing failed'));
  }
  const json = JSON.parse(raw);
  if (!json.success || !json.data?.id) throw new Error('Unexpected response from the server');
  return json.data as ProcessResponse;
};

export const downloadBlob = async (route: DownloadRoute, processedId: string) => {
  const response = await fetch(`${API}/${route}/download/${processedId}`);
  if (!response.ok) {
    throw new Error(messageFrom(await response.text(), response.status, 'Download failed'));
  }
  return response.blob();
};

export const deleteUpload = (serverId: string) =>
  fetch(`${API}/upload/${serverId}`, { method: 'DELETE' }).catch(() => undefined);

export class MergeError extends Error {
  failedId?: string;
  constructor(message: string, failedId?: string) {
    super(message);
    this.failedId = failedId;
  }
}

export interface MergeResponse {
  id: string;
  size: number;
  pageCount: number;
  fileCount: number;
}

/** POST /merge with an explicit, ordered list of temp-file ids. */
export const mergeFiles = async (ids: string[]): Promise<MergeResponse> => {
  const response = await fetch(`${API}/merge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  const raw = await response.text();
  let json: { success?: boolean; error?: string; failedId?: string; data?: MergeResponse } = {};
  try {
    json = JSON.parse(raw);
  } catch {
    /* not JSON */
  }
  if (!response.ok || !json.success || !json.data?.id) {
    throw new MergeError(json.error || `Merge failed (${response.status})`, json.failedId);
  }
  return json.data;
};

export interface ServerConfig {
  maxFileBytes: number;
  /** The rest only from the Windows build, and only to the PC itself. */
  phone?: PhoneAccess;
  version?: string;
  missingTools?: MissingTool[];
  /** A tools install window is open on the PC. */
  installingTools?: boolean;
}

const MISSING_TOOLS: MissingTool[] = ['ffmpeg', 'imagemagick', 'libreoffice', 'ghostscript', 'vcruntime'];

const parsePhone = (raw: unknown): PhoneAccess | undefined => {
  const phone = raw as Partial<PhoneAccess> | null | undefined;
  if (typeof phone?.enabled !== 'boolean' || !Array.isArray(phone.urls)) return undefined;
  return {
    enabled: phone.enabled,
    urls: phone.urls.filter((u): u is string => typeof u === 'string' && u.startsWith('http://')),
  };
};

/** Server limits. Falls back to null when unreachable; callers keep their default. */
export const fetchConfig = async (): Promise<ServerConfig | null> => {
  try {
    const response = await fetch(`${API}/config`);
    if (!response.ok) return null;
    const json = await response.json();
    if (!(Number(json?.maxFileBytes) > 0)) return null;
    return {
      maxFileBytes: Number(json.maxFileBytes),
      phone: parsePhone(json.phone),
      version: typeof json.version === 'string' ? json.version : undefined,
      missingTools: Array.isArray(json.missingTools)
        ? json.missingTools.filter((t: unknown): t is MissingTool => MISSING_TOOLS.includes(t as MissingTool))
        : undefined,
      installingTools: json.installingTools === true,
    };
  } catch {
    return null;
  }
};

// The Windows build's own endpoints want this on a POST: a header no other
// page could send without a CORS preflight, which is never granted
// (routes/native.js).
const NATIVE_POST = { 'X-FileMinify': '1' };

/** The Windows build: is there a newer release? Null when it can't say. */
export const fetchUpdateStatus = async (): Promise<UpdateStatus | null> => {
  try {
    const response = await fetch(`${API}/native/update`);
    if (!response.ok) return null;
    const json = await response.json();
    if (typeof json?.available !== 'boolean') return null;
    return json as UpdateStatus;
  } catch {
    return null;
  }
};

/** Download the newer setup and start it. Resolves once setup is running. */
export const startUpdate = async (): Promise<void> => {
  const response = await fetch(`${API}/native/update`, { method: 'POST', headers: NATIVE_POST });
  if (!response.ok) throw new Error(`Update failed (${response.status})`);
};

/** Install the missing tools, in a window of their own on the PC. */
export const installMissingTools = async (): Promise<void> => {
  const response = await fetch(`${API}/native/tools`, { method: 'POST', headers: NATIVE_POST });
  if (!response.ok) throw new Error(`Could not start the install (${response.status})`);
};
