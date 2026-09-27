import { parseGIF, decompressFrames, type ParsedFrame, type ParsedGIF } from 'gifuct-js';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';

export const MAX_AVATAR_BYTES = 200 * 1024; // 200 KB

export interface CropAreaPixels {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TransformOptions {
  cropPixels: CropAreaPixels;
  rotation: number; // degrees
  flipH: boolean;
  flipV: boolean;
  mimeType?: string;
}

export interface GifFrameData {
  canvas: HTMLCanvasElement;
  delay: number;
}

/**
 * Check magic bytes to determine actual image MIME type.
 */
export function detectMimeType(buffer: ArrayBuffer): string | null {
  const bytes = new Uint8Array(buffer.slice(0, 16));
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  // PNG: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png';
  }
  // GIF: 47 49 46 38 (GIF8)
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return 'image/gif';
  }
  // WebP: RIFF ... WEBP
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

/**
 * Check if the ArrayBuffer is an animated GIF (>1 frame).
 */
export function isAnimatedGifBuffer(buffer: ArrayBuffer): boolean {
  try {
    const bytes = new Uint8Array(buffer.slice(0, 4));
    if (bytes[0] !== 0x47 || bytes[1] !== 0x49 || bytes[2] !== 0x46) {
      return false;
    }
    const parsed = parseGIF(buffer);
    const frames = decompressFrames(parsed, false);
    return frames.length > 1;
  } catch {
    return false;
  }
}

/**
 * Extract and composite all frames of an animated GIF.
 */
export function extractAndCompositeGifFrames(buffer: ArrayBuffer): GifFrameData[] {
  const parsed: ParsedGIF = parseGIF(buffer);
  const frames: ParsedFrame[] = decompressFrames(parsed, true);

  if (frames.length === 0) {
    throw new Error('No frames found in GIF');
  }

  const width = parsed.lsd.width;
  const height = parsed.lsd.height;

  const result: GifFrameData[] = [];

  const compositeCanvas = document.createElement('canvas');
  compositeCanvas.width = width;
  compositeCanvas.height = height;
  const compositeCtx = compositeCanvas.getContext('2d', { willReadFrequently: true })!;

  const patchCanvas = document.createElement('canvas');
  const patchCtx = patchCanvas.getContext('2d')!;

  let prevDisposal = 0;
  let prevDims: ParsedFrame['dims'] | null = null;
  let restoreCanvas: HTMLCanvasElement | null = null;

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];

    // Handle previous frame disposal
    if (prevDisposal === 2) {
      // Restore to background (clear the area drawn by previous frame)
      if (prevDims) {
        compositeCtx.clearRect(prevDims.left, prevDims.top, prevDims.width, prevDims.height);
      }
    } else if (prevDisposal === 3 && restoreCanvas) {
      // Restore to state before previous frame
      compositeCtx.clearRect(0, 0, width, height);
      compositeCtx.drawImage(restoreCanvas, 0, 0);
    }

    // If current disposal is 3 (restore previous), save current state before this frame
    if (frame.disposalType === 3) {
      if (!restoreCanvas) {
        restoreCanvas = document.createElement('canvas');
        restoreCanvas.width = width;
        restoreCanvas.height = height;
      }
      const rCtx = restoreCanvas.getContext('2d')!;
      rCtx.clearRect(0, 0, width, height);
      rCtx.drawImage(compositeCanvas, 0, 0);
    }

    // Draw current patch
    if (frame.dims.width > 0 && frame.dims.height > 0) {
      patchCanvas.width = frame.dims.width;
      patchCanvas.height = frame.dims.height;
      const patchData = patchCtx.createImageData(frame.dims.width, frame.dims.height);
      patchData.data.set(frame.patch);
      patchCtx.putImageData(patchData, 0, 0);

      compositeCtx.drawImage(patchCanvas, frame.dims.left, frame.dims.top);
    }

    // Snapshot this frame into a separate canvas
    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = width;
    frameCanvas.height = height;
    const fCtx = frameCanvas.getContext('2d')!;
    fCtx.drawImage(compositeCanvas, 0, 0);

    // Browsers clamp <20ms to 100ms standard
    const delay = frame.delay >= 20 ? frame.delay : 100;
    result.push({ canvas: frameCanvas, delay });

    prevDisposal = frame.disposalType;
    prevDims = frame.dims;
  }

  return result;
}

/**
 * Calculates bounding area of a rotated rectangle.
 */
export function rotateSize(width: number, height: number, rotation: number): { width: number; height: number } {
  const rotRad = (rotation * Math.PI) / 180;
  return {
    width: Math.abs(Math.cos(rotRad) * width) + Math.abs(Math.sin(rotRad) * height),
    height: Math.abs(Math.sin(rotRad) * width) + Math.abs(Math.cos(rotRad) * height),
  };
}

/**
 * Apply rotation, flip, and crop to an image/canvas source and draw onto outCanvas.
 */
export function renderTransformedSource(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  options: TransformOptions,
  outCanvas: HTMLCanvasElement,
  outSize: number
): void {
  const { cropPixels, rotation, flipH, flipV } = options;
  const bBox = rotateSize(sourceWidth, sourceHeight, rotation);

  // Intermediate rotation/flip canvas
  const rotCanvas = document.createElement('canvas');
  rotCanvas.width = Math.max(1, Math.round(bBox.width));
  rotCanvas.height = Math.max(1, Math.round(bBox.height));
  const rotCtx = rotCanvas.getContext('2d')!;

  rotCtx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
  rotCtx.rotate((rotation * Math.PI) / 180);
  rotCtx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  rotCtx.drawImage(source, -sourceWidth / 2, -sourceHeight / 2);

  // Now draw crop rectangle to outCanvas
  outCanvas.width = outSize;
  outCanvas.height = outSize;
  const outCtx = outCanvas.getContext('2d')!;
  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = 'high';

  outCtx.drawImage(
    rotCanvas,
    cropPixels.x,
    cropPixels.y,
    cropPixels.width,
    cropPixels.height,
    0,
    0,
    outSize,
    outSize
  );
}

/**
 * Helper to convert canvas to blob with promise.
 */
function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to create blob from canvas'));
      },
      mimeType,
      quality
    );
  });
}

/**
 * Helper to convert Blob to base64 Data URL.
 */
function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Helper to convert raw Uint8Array to base64 Data URL.
 */
export function uint8ArrayToDataURL(bytes: Uint8Array, mimeType: string): string {
  let binary = '';
  const len = bytes.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

/**
 * Process a static image (JPG/PNG/WebP) with progressive compression <= 200 KB.
 */
export async function processStaticImage(
  imageElement: HTMLImageElement,
  options: TransformOptions
): Promise<string> {
  const sourceWidth = imageElement.naturalWidth;
  const sourceHeight = imageElement.naturalHeight;

  // Attempt resolutions starting at 512x512 down to 256x256
  const sizes = [512, 440, 384, 320, 256];
  const outCanvas = document.createElement('canvas');

  // Preferred export formats
  const targetMime = options.mimeType && options.mimeType !== 'image/gif'
    ? options.mimeType
    : 'image/webp';

  for (const size of sizes) {
    renderTransformedSource(imageElement, sourceWidth, sourceHeight, options, outCanvas, size);

    // If source requested PNG, try PNG first
    if (targetMime === 'image/png') {
      const pngBlob = await canvasToBlob(outCanvas, 'image/png');
      if (pngBlob.size <= MAX_AVATAR_BYTES) {
        return await blobToDataURL(pngBlob);
      }
    }

    // Try WebP (best quality/size ratio)
    const qualities = [0.92, 0.85, 0.78, 0.70, 0.60];
    for (const quality of qualities) {
      const webpBlob = await canvasToBlob(outCanvas, 'image/webp', quality);
      if (webpBlob.size <= MAX_AVATAR_BYTES) {
        return await blobToDataURL(webpBlob);
      }
    }

    // Fallback to JPEG if browser doesn't do WebP or for JPEG preference
    for (const quality of qualities) {
      const jpegBlob = await canvasToBlob(outCanvas, 'image/jpeg', quality);
      if (jpegBlob.size <= MAX_AVATAR_BYTES) {
        return await blobToDataURL(jpegBlob);
      }
    }
  }

  // Extreme fallback: 256px JPEG at 0.50
  renderTransformedSource(imageElement, sourceWidth, sourceHeight, options, outCanvas, 256);
  const finalBlob = await canvasToBlob(outCanvas, 'image/jpeg', 0.50);
  if (finalBlob.size > MAX_AVATAR_BYTES) {
    throw new Error(`Unable to compress static image under 200 KB (${Math.round(finalBlob.size / 1024)} KB).`);
  }
  return await blobToDataURL(finalBlob);
}

/**
 * Process an animated GIF with progressive optimization <= 200 KB while preserving animation.
 */
export async function processAnimatedGif(
  frames: GifFrameData[],
  options: TransformOptions,
  onProgress?: (progress: number, status: string) => void
): Promise<string> {
  if (frames.length === 0) {
    throw new Error('No GIF frames to process.');
  }

  const sourceWidth = frames[0].canvas.width;
  const sourceHeight = frames[0].canvas.height;

  // Progressive dimensions to try until file is <= 200 KB
  const dimensionCandidates = [384, 300, 256, 200, 160, 128];
  const maxColorsOptions = [256, 128, 64];

  let bestResultBytes: Uint8Array | null = null;
  let smallestOversizedBytes = Infinity;

  const tempCanvas = document.createElement('canvas');

  for (const size of dimensionCandidates) {
    for (const maxColors of maxColorsOptions) {
      onProgress?.(
        Math.round((dimensionCandidates.indexOf(size) / dimensionCandidates.length) * 100),
        `Optimizing animated GIF (${size}×${size}, ${maxColors} colors)...`
      );

      // Render each transformed frame to size x size
      const transformedFrames: { data: Uint8Array; delay: number }[] = [];
      let anyTransparency = false;

      for (let i = 0; i < frames.length; i++) {
        renderTransformedSource(
          frames[i].canvas,
          sourceWidth,
          sourceHeight,
          options,
          tempCanvas,
          size
        );
        const ctx = tempCanvas.getContext('2d')!;
        const imgData = ctx.getImageData(0, 0, size, size);
        const rgbaData = new Uint8Array(imgData.data.buffer);

        // Check for 1-bit transparency
        for (let p = 3; p < rgbaData.length; p += 4) {
          if (rgbaData[p] < 128) {
            anyTransparency = true;
            rgbaData[p] = 0; // force binary alpha
          }
        }

        transformedFrames.push({
          data: rgbaData,
          delay: frames[i].delay,
        });
      }

      // Build a robust global palette by sampling across frames
      const samplePixelsPerFrame = Math.max(50, Math.floor(12000 / frames.length));
      const sampleTotal = samplePixelsPerFrame * frames.length;
      const sampleBuffer = new Uint8Array(sampleTotal * 4);

      let sOffset = 0;
      for (let f = 0; f < frames.length; f++) {
        const frameData = transformedFrames[f].data;
        const totalPx = size * size;
        const step = Math.max(1, Math.floor(totalPx / samplePixelsPerFrame));
        for (let p = 0; p < samplePixelsPerFrame; p++) {
          const pxIdx = ((p * step) % totalPx) * 4;
          sampleBuffer[sOffset] = frameData[pxIdx];
          sampleBuffer[sOffset + 1] = frameData[pxIdx + 1];
          sampleBuffer[sOffset + 2] = frameData[pxIdx + 2];
          sampleBuffer[sOffset + 3] = frameData[pxIdx + 3];
          sOffset += 4;
        }
      }

      const paletteFormat = anyTransparency ? 'rgba4444' : 'rgb565';
      const globalPalette = quantize(sampleBuffer, maxColors, {
        format: paletteFormat,
        oneBitAlpha: anyTransparency,
      });

      let transIndex = -1;
      if (anyTransparency) {
        transIndex = globalPalette.findIndex((c) => c[3] === 0);
      }

      // Encode into GIF stream
      const encoder = GIFEncoder();

      for (let f = 0; f < transformedFrames.length; f++) {
        const { data, delay } = transformedFrames[f];
        const index = applyPalette(data, globalPalette, paletteFormat);

        encoder.writeFrame(index, size, size, {
          palette: f === 0 ? globalPalette : undefined,
          delay,
          repeat: 0, // loop forever
          transparent: transIndex !== -1,
          transparentIndex: transIndex !== -1 ? transIndex : 0,
        });
      }

      encoder.finish();
      const output = encoder.bytes();

      if (output.length <= MAX_AVATAR_BYTES) {
        bestResultBytes = output;
        break;
      } else {
        if (output.length < smallestOversizedBytes) {
          smallestOversizedBytes = output.length;
        }
      }
    }

    if (bestResultBytes) {
      break;
    }
  }

  if (bestResultBytes && bestResultBytes.length <= MAX_AVATAR_BYTES) {
    onProgress?.(100, 'Optimization complete!');
    return uint8ArrayToDataURL(bestResultBytes, 'image/gif');
  }

  // Clear, actionable failure as required:
  throw new Error(
    `This animated GIF (${frames.length} frames) is ${Math.round(smallestOversizedBytes / 1024)} KB after progressive compression. The maximum allowed is 200 KB. Please use a shorter or simpler animated GIF to preserve animation quality.`
  );
}
