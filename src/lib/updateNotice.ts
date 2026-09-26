// Whether the update notice is put off. "Later" hides it for a week, "Skip
// this version" until a newer one; either way a newer version brings it back,
// and the header's "Update available" button stays. Remembered in this
// browser, which on Windows is the app window's own profile.
const LATER_KEY = 'fileminify-update-later';
const SKIP_KEY = 'fileminify-update-skip';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage blocked: the notice just comes back next time
  }
};

/** Call outside render: it reads the clock. */
export const noticePutOff = (version: string): boolean => {
  if (read(SKIP_KEY) === version) return true;
  const [laterVersion, until] = (read(LATER_KEY) ?? '').split('@');
  return laterVersion === version && Date.now() < Number(until);
};

export const remindLater = (version: string) => write(LATER_KEY, `${version}@${Date.now() + WEEK_MS}`);

export const skipVersion = (version: string) => write(SKIP_KEY, version);
