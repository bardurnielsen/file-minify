import React from 'react';
import { ArrowDown, Download, Wand2 } from 'lucide-react';
import { targetsFor } from '../../formats';
import { FileType, Tier } from '../../types';
import { TIERS, TYPE_LABEL } from '../../processing';
import { Button } from '../ui/button';
import { useNavigation } from '../../contexts/NavigationContext';
import { useFiles } from '../../hooks/useFiles';
import { formatBytes } from '../../lib/format';

// Bodies are functions of the upload limit, which is a server setting.
const STEPS: { icon: typeof ArrowDown; title: string; body: (maxFile: string) => string }[] = [
  {
    icon: ArrowDown,
    title: 'Drop files',
    body: (maxFile: string) =>
      `Up to ten at a time, ${maxFile} each. Images, video, PDFs and Office documents.`,
  },
  {
    icon: Wand2,
    title: 'We pick the settings',
    body: () => 'Office files become PDFs, everything else is shrunk in its own format. Videos wait for a click, so you can aim for a file size or resolution first.',
  },
  {
    icon: Download,
    title: 'Download',
    body: () => 'See exactly what changed - before and after sizes, and how much you saved - then download one file or all of them.',
  },
];

const SOURCES: { type: FileType; from: string }[] = [
  { type: 'image', from: 'JPG · PNG · WebP · GIF' },
  { type: 'video', from: 'MP4 · WebM · MOV · AVI' },
  { type: 'pdf', from: 'PDF' },
  { type: 'document', from: 'DOC · DOCX' },
  { type: 'spreadsheet', from: 'XLS · XLSX' },
  { type: 'presentation', from: 'PPT · PPTX' },
];

const SHRINKS: Record<FileType, string> = {
  image: 'Re-encoded at the chosen quality',
  video: 'H.264 or H.265 at the chosen quality and resolution, or aimed at a target size',
  pdf: 'Images inside downsampled with Ghostscript',
  document: '–',
  spreadsheet: '–',
  presentation: '–',
  other: '–',
};

const MERGE_POINTS = [
  {
    title: 'Set the order',
    body: 'Drag files into place, or use the arrows. The PDF follows that order, page by page.',
  },
  {
    title: 'Mix file types',
    body: 'Photos, scans, PDFs and Word, Excel or PowerPoint files all go in. Each becomes PDF pages first.',
  },
  {
    title: 'Leave some out',
    body: 'Skip any file you don’t want, and name the result before you download it.',
  },
];

// What each level means for video, where it also sets the resolution.
const VIDEO_TIER: Record<Tier, string> = {
  small: 'Video: up to 720p.',
  balanced: 'Video: up to 1080p.',
  high: 'Video: original resolution.',
};

const HowItWorks: React.FC = () => {
  const { setCurrentPage } = useNavigation();
  const maxFile = formatBytes(useFiles((s) => s.maxFileBytes));
  return (
    <div className="space-y-12">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">How it works</h1>
        <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          Drop a file and it comes back smaller. Images, PDFs and documents start straight away;
          videos wait for a click, so you can aim for a size first. The controls are there for the
          times you need them.
        </p>
      </header>

      <ol className="grid gap-4 sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <li
            key={step.title}
            className="rounded-2xl border border-zinc-200/80 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900">
                <step.icon className="h-4 w-4" />
              </span>
              <span className="text-xs font-medium text-zinc-400">Step {i + 1}</span>
            </div>
            <h2 className="mt-4 font-semibold text-zinc-900 dark:text-zinc-50">{step.title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">{step.body(maxFile)}</p>
          </li>
        ))}
      </ol>

      <section>
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Quality levels</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          One setting, remembered between visits. &ldquo;Balanced&rdquo; is the default.
        </p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          {TIERS.map((tier) => (
            <div
              key={tier.value}
              className="rounded-xl border border-zinc-200/80 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <dt className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{tier.label}</dt>
              <dd className="mt-0.5 text-[13px] text-zinc-500 dark:text-zinc-400">{tier.hint}</dd>
              <dd className="mt-1.5 text-xs text-zinc-400 dark:text-zinc-500">{VIDEO_TIER[tier.value]}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Merge into one PDF
        </h2>
        <p className="mt-1 max-w-xl text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
          Add two or more images, PDFs or Office documents and a <strong className="font-medium text-zinc-700 dark:text-zinc-200">Merge to PDF</strong>{' '}
          button appears above the list.
        </p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          {MERGE_POINTS.map((point) => (
            <li
              key={point.title}
              className="rounded-xl border border-zinc-200/80 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{point.title}</div>
              <div className="mt-0.5 text-[13px] text-zinc-500 dark:text-zinc-400">{point.body}</div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          What each file can become
        </h2>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-zinc-200/80 dark:border-zinc-800">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:bg-zinc-900/60 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-2.5">File</th>
                <th className="px-4 py-2.5">Shrinks by default</th>
                <th className="px-4 py-2.5">Can convert to</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-800 dark:bg-zinc-900">
              {SOURCES.map((row) => (
                <tr key={row.type}>
                  <td className="px-4 py-3 align-top">
                    <div className="font-medium text-zinc-900 dark:text-zinc-50">{TYPE_LABEL[row.type]}</div>
                    <div className="text-xs text-zinc-400">{row.from}</div>
                  </td>
                  <td className="px-4 py-3 align-top text-zinc-600 dark:text-zinc-300">
                    {SHRINKS[row.type] === '–' ? (
                      <span className="text-zinc-400">Always converted to PDF</span>
                    ) : (
                      SHRINKS[row.type]
                    )}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="flex flex-wrap gap-1.5">
                      {targetsFor(row.type).map((t) => (
                        <span
                          key={t.value}
                          className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                        >
                          {t.label}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200/80 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">Good to know</h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
          <li>
            If shrinking a file wouldn&apos;t make it smaller, you get the original back and the row
            says &ldquo;Already compact&rdquo;. That is a result, not a failure.
          </li>
          <li>
            For video you can aim at a file size instead of a quality level - handy for fitting a
            clip into an email. The encoder then chooses the bitrate to hit that size, so the
            quality setting no longer applies, and unless you pick one, the resolution is lowered
            to suit: a clean 720p picture beats a blocky 1080p one.
          </li>
          <li>
            H.265 makes video around a quarter smaller than H.264 at the same quality, but takes
            longer to encode and doesn&apos;t play everywhere - some browsers and older devices
            can&apos;t open it. H.264 is the default for that reason.
          </li>
          <li>Video is never enlarged. Choosing 1080p for a 720p clip leaves it at 720p.</li>
          <li>Converting to another format uses that encoder&apos;s standard quality.</li>
          <li>Files are deleted from the server within an hour. Nothing is kept.</li>
        </ul>
      </section>

      <div>
        <Button variant="primary" size="lg" onClick={() => setCurrentPage('home')}>
          Start minifying
        </Button>
      </div>
    </div>
  );
};

export default HowItWorks;
