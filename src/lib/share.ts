import { extensionOf } from '../formats';

// Types the file-sharing sheet should see. Share targets filter on MIME type
// (an email app takes video/mp4), and Chrome only shares an allowlist of them.
const MIME: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
};

export const mimeFor = (name: string) => MIME[extensionOf(name)] ?? 'application/octet-stream';

/**
 * Whether this browser can share these files. Needs a secure context (HTTPS,
 * localhost, or Chrome's insecure-origins flag) and the Web Share API with
 * file support, and the types must be ones the browser shares - Chrome on
 * Android won't share .mov or .avi. Probed with empty files of the same name
 * and type, so nothing is downloaded to decide whether to show the button.
 */
export const canShareFiles = (names: string[]) => {
  if (names.length === 0 || !window.isSecureContext) return false;
  if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false;
  try {
    return navigator.canShare({ files: names.map((n) => new File([], n, { type: mimeFor(n) })) });
  } catch {
    return false;
  }
};

/**
 * A browser only lets share() run shortly after a tap. Fetching a large video
 * first can outlast that, and share() then throws NotAllowedError; callers
 * keep what they fetched and ask for one more tap, which shares at once.
 */
export const tapHasExpired = () =>
  typeof navigator.userActivation !== 'undefined' && !navigator.userActivation.isActive;
