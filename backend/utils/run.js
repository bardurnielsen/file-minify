// Shared options for every shelled-out conversion. Without a timeout a crafted
// media file can wedge a job forever; without a raised maxBuffer, ffmpeg's
// progress output on a long video overruns exec's 1MB default and the job fails
// opaquely.
const RUN = {
  timeout: 5 * 60 * 1000,
  maxBuffer: 16 * 1024 * 1024,
  killSignal: 'SIGKILL',
};

module.exports = { RUN };
