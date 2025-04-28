import { elizaLogger } from '@elizaos/core';
import ffmpeg from 'fluent-ffmpeg';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * Creates a simple SRT subtitle file from narration text with precise timing
 * Each segment shows for a specific duration with natural reading pace
 */
function createSubtitleFile(narrationText: string, audioLengthMs: number): string {
  const tempDir = path.join(os.tmpdir(), 'video-fun');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const srtPath = path.join(tempDir, `subs-${Date.now()}.srt`);

  // Split text into ~30 char segments (on word boundaries) for better readability
  const words = narrationText.split(' ');
  const segments: string[] = [];
  let currentSegment = '';

  for (const word of words) {
    if (currentSegment.length + word.length + 1 > 30) {
      segments.push(currentSegment.trim());
      currentSegment = word;
    } else {
      currentSegment += ' ' + word;
    }
  }
  if (currentSegment) {
    segments.push(currentSegment.trim());
  }

  // Calculate timing for each segment
  // Average reading speed is about 200-250ms per word
  // We'll use 250ms per word as a base, with minimum 2s per segment for readability
  const getSegmentDuration = (text: string): number => {
    const wordCount = text.split(' ').length;
    return Math.max(2000, wordCount * 250); // minimum 2s, or 250ms per word
  };

  // Calculate segment timings while ensuring we don't exceed audio length
  let currentTime = 0;
  const timings: Array<{ start: number; end: number; text: string }> = [];

  segments.forEach((text, index) => {
    const duration = getSegmentDuration(text);
    const isLast = index === segments.length - 1;

    // For the last segment, ensure it doesn't exceed audio length
    const end = isLast
      ? Math.min(currentTime + duration, audioLengthMs - 500) // Leave 500ms at the end
      : currentTime + duration;

    timings.push({
      start: currentTime,
      end,
      text
    });

    currentTime = end + 100; // 100ms gap between segments
  });

  // Generate SRT content
  const srtContent = timings.map((timing, index) => {
    return `${index + 1}
${formatSrtTimestamp(timing.start)} --> ${formatSrtTimestamp(timing.end)}
${timing.text}
`;
  }).join('\n');

  fs.writeFileSync(srtPath, srtContent);
  return srtPath;
}

/**
 * Formats a millisecond timestamp into SRT format (00:00:00,000)
 */
function formatSrtTimestamp(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
}

/**
 * Merges a video file with an audio buffer using fluent-ffmpeg and adds subtitles that fade out
 * @param videoBuffer The video buffer to merge
 * @param audioBuffer The audio buffer to merge with the video
 * @param narrationText Optional narration text to add as subtitles
 * @returns Promise<Buffer> The merged video as a buffer with soft subtitles
 */
export async function mergeVideoAndAudio(
  videoBuffer: Buffer,
  audioBuffer: Buffer,
  narrationText?: string
): Promise<Buffer> {
  elizaLogger.debug('Starting video and audio merge process');
  elizaLogger.debug(`Video buffer size: ${videoBuffer.length} bytes`);
  elizaLogger.debug(`Audio buffer size: ${audioBuffer.length} bytes`);

  // Create temp directory if it doesn't exist
  const tempDir = path.join(os.tmpdir(), 'video-fun');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
    elizaLogger.debug(`Created temp directory: ${tempDir}`);
  }

  // Create temporary file paths
  const videoPath = path.join(tempDir, `video-${Date.now()}.mp4`);
  const audioPath = path.join(tempDir, `audio-${Date.now()}.mp3`);
  const outputPath = path.join(tempDir, `merged-${Date.now()}.mp4`);

  try {
    // Write buffers to temporary files
    fs.writeFileSync(videoPath, videoBuffer);
    fs.writeFileSync(audioPath, audioBuffer);

    // Get audio and video durations
    const [audioDuration, videoDuration] = await Promise.all([
      new Promise<number>((resolve, reject) => {
        ffmpeg.ffprobe(audioPath, (err, metadata) => {
          if (err) reject(err);
          resolve((metadata.format.duration || 0) * 1000);
        });
      }),
      new Promise<number>((resolve, reject) => {
        ffmpeg.ffprobe(videoPath, (err, metadata) => {
          if (err) reject(err);
          resolve((metadata.format.duration || 0) * 1000);
        });
      })
    ]);

    // Create subtitle file if narration is provided
    let subtitlePath: string | undefined;
    if (narrationText) {
      subtitlePath = createSubtitleFile(narrationText, audioDuration);
      elizaLogger.debug('Created subtitle file');
    }

    // Create a promise to handle the ffmpeg processing
    await new Promise<void>((resolve, reject) => {
      let command = ffmpeg()
        .input(videoPath)
        .input(audioPath);

      // Add subtitles with basic styling
      if (subtitlePath) {
        command = command
          .input(subtitlePath)
          .outputOptions([
            '-vf subtitles=' + subtitlePath + ':force_style=\'Fontname=Arial,Fontsize=20,PrimaryColour=&HFFFFFF&,Outline=0,Shadow=1,Alignment=2,MarginV=25,MarginL=10,MarginR=10\'',
            '-c:v libx264',
            '-c:a aac',
            '-map 0:v:0',
            '-map 1:a:0'
          ]);
      } else {
        command = command
          .outputOptions([
            '-c:v libx264',
            '-c:a aac',
            '-map 0:v:0',
            '-map 1:a:0'
          ]);
      }

      command
        .on('start', (command) => {
          elizaLogger.debug(`FFmpeg started with command: ${command}`);
        })
        .on('progress', (progress) => {
          elizaLogger.debug(`Processing: ${Math.round(progress.percent || 0)}%`);
        })
        .on('end', () => {
          elizaLogger.debug('FFmpeg processing completed');
          resolve();
        })
        .on('error', (err) => {
          elizaLogger.error('FFmpeg processing failed:', err);
          reject(err);
        })
        .save(outputPath);
    });

    // Read the merged file
    const mergedBuffer = fs.readFileSync(outputPath);
    elizaLogger.debug(`Merge completed successfully. Output size: ${(mergedBuffer.length / 1024 / 1024).toFixed(2)}MB`);

    // Clean up temporary files
    fs.unlinkSync(videoPath);
    fs.unlinkSync(audioPath);
    fs.unlinkSync(outputPath);
    if (subtitlePath) {
      fs.unlinkSync(subtitlePath);
    }

    return mergedBuffer;
  } catch (error) {
    elizaLogger.error('Error during video processing:', error);
    // Clean up on error
    if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
    if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    throw error;
  }
}

/**
 * Concatenates two video buffers, appending the second video after the first
 * @param firstVideoBuffer The first video buffer
 * @param secondVideoBuffer The second video buffer to append
 * @returns Promise<Buffer> The concatenated video as a buffer
 */
export async function concatenateVideos(
  firstVideoBuffer: Buffer,
  secondVideoBuffer: Buffer
): Promise<Buffer> {
  elizaLogger.debug('Starting video concatenation process');

  // Create temp directory if it doesn't exist
  const tempDir = path.join(os.tmpdir(), 'video-fun');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Create temporary file paths
  const firstVideoPath = path.join(tempDir, `first-${Date.now()}.mp4`);
  const secondVideoPath = path.join(tempDir, `second-${Date.now()}.mp4`);
  const outputPath = path.join(tempDir, `concat-${Date.now()}.mp4`);
  const concatListPath = path.join(tempDir, `concat-list-${Date.now()}.txt`);

  try {
    // Write buffers to temporary files
    fs.writeFileSync(firstVideoPath, firstVideoBuffer);
    fs.writeFileSync(secondVideoPath, secondVideoBuffer);

    // Create a concat file list for FFmpeg
    const concatContent = `file '${firstVideoPath}'\nfile '${secondVideoPath}'`;
    fs.writeFileSync(concatListPath, concatContent);

    // Concatenate the videos
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(concatListPath)
        .inputOptions(['-f concat', '-safe 0'])
        .outputOptions([
          '-c copy',  // Copy all streams without re-encoding
          '-movflags +faststart'  // Enable fast start for web playback
        ])
        .on('start', (command) => {
          elizaLogger.debug(`FFmpeg concatenation started with command: ${command}`);
        })
        .on('progress', (progress) => {
          elizaLogger.debug(`Processing: ${Math.round(progress.percent || 0)}%`);
        })
        .on('end', () => {
          elizaLogger.debug('FFmpeg concatenation completed');
          resolve();
        })
        .on('error', (err) => {
          elizaLogger.error('FFmpeg concatenation failed:', err);
          reject(err);
        })
        .save(outputPath);
    });

    // Read the concatenated file
    const concatenatedBuffer = fs.readFileSync(outputPath);
    elizaLogger.debug(`Concatenation completed. Final size: ${(concatenatedBuffer.length / 1024 / 1024).toFixed(2)}MB`);

    // Clean up temporary files
    fs.unlinkSync(firstVideoPath);
    fs.unlinkSync(secondVideoPath);
    fs.unlinkSync(outputPath);
    fs.unlinkSync(concatListPath);

    return concatenatedBuffer;
  } catch (error) {
    elizaLogger.error('Error during video concatenation:', error);

    // Clean up on error
    if (fs.existsSync(firstVideoPath)) fs.unlinkSync(firstVideoPath);
    if (fs.existsSync(secondVideoPath)) fs.unlinkSync(secondVideoPath);
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    if (fs.existsSync(concatListPath)) fs.unlinkSync(concatListPath);

    throw error;
  }
}

/**
 * Extracts either the first or last frame from a video buffer and returns it as a base64 PNG image
 * @param videoBuffer The video buffer to extract the frame from
 * @param getLastFrame If true, extracts the last frame; if false, extracts the first frame
 * @returns Promise<string> The frame as a base64 PNG image string
 */
export async function extractFrameFromVideo(
  videoBuffer: Buffer,
  getLastFrame = false
): Promise<string> {
  elizaLogger.debug(`Starting frame extraction (${getLastFrame ? 'last' : 'first'} frame)`);

  // Create temp directory if it doesn't exist
  const tempDir = path.join(os.tmpdir(), 'video-fun');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Create temporary file paths
  const videoPath = path.join(tempDir, `video-${Date.now()}.mp4`);
  const framePath = path.join(tempDir, `frame-${Date.now()}.png`);

  try {
    // Write video buffer to temporary file
    fs.writeFileSync(videoPath, videoBuffer);
    elizaLogger.debug(`Wrote video file to: ${videoPath}`);

    // Get video duration for last frame extraction
    let videoDuration = 0;
    if (getLastFrame) {
      videoDuration = await new Promise<number>((resolve, reject) => {
        ffmpeg.ffprobe(videoPath, (err, metadata) => {
          if (err) reject(err);
          resolve(metadata.format.duration || 0);
        });
      });
    }

    // Extract the frame
    await new Promise<void>((resolve, reject) => {
      let command = ffmpeg(videoPath)
        .outputOptions(['-vframes 1']) // Extract only one frame
        .output(framePath);

      if (getLastFrame) {
        // Seek to the last frame (subtract a small offset to ensure we get a frame)
        command = command.seekInput(Math.max(0, videoDuration - 0.1));
      }

      command
        .on('end', () => {
          elizaLogger.debug('Frame extraction completed');
          resolve();
        })
        .on('error', (err) => {
          elizaLogger.error('Frame extraction failed:', err);
          reject(err);
        })
        .run();
    });

    // Read the frame and convert to base64
    const frameBuffer = fs.readFileSync(framePath);
    const base64Image = `data:image/png;base64,${frameBuffer.toString('base64')}`;

    // Clean up temporary files
    fs.unlinkSync(videoPath);
    fs.unlinkSync(framePath);
    elizaLogger.debug('Cleaned up temporary files');

    return base64Image;
  } catch (error) {
    elizaLogger.error('Error during frame extraction:', error);

    // Clean up on error
    if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
    if (fs.existsSync(framePath)) fs.unlinkSync(framePath);
    elizaLogger.debug('Cleaned up temporary files after error');

    throw error;
  }
}