import { mergePage } from './api';

// Pages drawn large (POST /merge/page), kept for the session: hovering over a
// page in the list, then opening it in the merge dialog, fetches it once.
const cache = new Map<string, Promise<string>>();

export const largePage = (sourceId: string, page: number): Promise<string> => {
  const key = `${sourceId}#${page}`;
  let image = cache.get(key);
  if (!image) {
    image = mergePage(sourceId, page);
    cache.set(key, image);
    image.catch(() => cache.delete(key)); // let a later look try again
  }
  return image;
};
