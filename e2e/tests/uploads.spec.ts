import { FILES, dropUntyped, expect, finished, open, row, test } from './helpers';

test('files the browser left untyped still upload and process', async ({ page }) => {
  // Before #14 these came back "Unsupported file type: application/octet-stream".
  await open(page);
  await dropUntyped(page, [
    { path: FILES.docx, name: 'report.docx' },
    { path: FILES.pdf, name: 'scan.pdf' },
    { path: FILES.png, name: 'photo.png' },
  ]);
  for (const name of ['report.docx', 'scan.pdf', 'photo.png']) {
    await finished(row(page, name));
    await expect(row(page, name)).not.toContainText('Unsupported file type');
  }
});

test('the drop area warns while an unsupported file is dragged, and resets after', async ({ page }) => {
  await open(page);
  const heading = page.locator('section h2');
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['x'], 'tool.exe', { type: 'application/x-msdownload' }));
    (window as unknown as { __dt: DataTransfer }).__dt = dt;
  });
  const fire = (type: string) =>
    page.evaluate((type) => {
      const dt = (window as unknown as { __dt: DataTransfer }).__dt;
      document.querySelector('section')!.dispatchEvent(
        new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt })
      );
    }, type);

  await fire('dragenter');
  await fire('dragover');
  await expect(heading).toHaveText('That file type isn’t supported');
  await fire('drop');
  await expect(heading).toHaveText('Drop files to make them smaller');
  await expect(page.getByText("tool.exe isn't a supported type.")).toBeVisible();
});
