import { FILES, asFile, drop, expect, finished, open, row, test } from './helpers';

// Encodes run one at a time, and a Best-quality 1080p clip takes long enough
// to watch that.
test.setTimeout(240_000);

test('videos encode one at a time, and a new one still uploads meanwhile', async ({ page }) => {
  await open(page);
  await drop(page, [
    asFile(FILES.clip1080, 'first.mp4', 'video/mp4'),
    asFile(FILES.clip1080, 'second.mp4', 'video/mp4'),
  ]);
  const first = row(page, 'first.mp4');
  const second = row(page, 'second.mp4');
  for (const r of [first, second]) {
    await expect(r).toContainText('choose settings below');
    await r.getByRole('radiogroup', { name: 'Quality' }).getByRole('radio', { name: 'Best quality' }).click();
  }
  await first.getByRole('button', { name: 'Compress' }).click();
  await second.getByRole('button', { name: 'Compress' }).click();

  await expect(page.getByText(/^Compressing/)).toHaveCount(1);
  await expect(page.getByText('Waiting for a free slot…')).toHaveCount(1);

  // A third video dropped mid-encode uploads straight away instead of queuing.
  await drop(page, asFile(FILES.clip720, 'third.mp4', 'video/mp4'));
  await expect(row(page, 'third.mp4')).toContainText('choose settings below');
  await expect(page.getByText(/^Compressing/)).toHaveCount(1);

  await finished(first, 180_000);
  await finished(second, 180_000);
});

test('the settings panel is gone after Compress, and the adjust button reopens it', async ({ page }) => {
  await open(page);
  // The way it was first seen: other rows updating while the panel closes,
  // after its settings were changed. AnimatePresence could then miss the
  // exit's end and leave the panel mounted at zero height - invisible, but
  // its Compress button still reachable with Tab.
  await drop(page, [FILES.clip720, FILES.png, FILES.pdf]);
  const video = row(page, 'clip-720.mp4');
  await expect(video).toContainText('choose settings below');
  await video.getByRole('radio', { name: 'H.265' }).click();
  await video.getByRole('radiogroup', { name: 'Quality' }).getByRole('radio', { name: 'Smaller' }).click();
  await video.getByRole('button', { name: 'Compress' }).click();
  await finished(video);
  await finished(row(page, 'fx.png'));

  // A button is focusable unless it or an ancestor is display: none, which
  // is exactly what the fix guarantees; zero height and opacity don't count.
  const focusable = () =>
    page.evaluate(
      () =>
        [...document.querySelectorAll('button')].filter(
          (b) => ['Compress', 'Apply', 'Apply and redo'].includes(b.textContent ?? '') && b.offsetParent !== null
        ).length
    );
  await expect.poll(focusable, { timeout: 5_000 }).toBe(0);

  await video.getByRole('button', { name: 'Adjust settings' }).click();
  await expect(video.getByRole('button', { name: 'Apply and redo' })).toBeVisible();
});
