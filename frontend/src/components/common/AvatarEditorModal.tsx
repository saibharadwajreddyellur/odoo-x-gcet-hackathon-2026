import React, { useState, useEffect, useRef, useCallback } from 'react';
import Cropper, { type Area, type Point } from 'react-easy-crop';
import {
  X,
  RotateCcw,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  Maximize,
  Minimize,
  RefreshCw,
  ZoomIn,
  ZoomOut,
  Loader2,
  AlertCircle,
  Sliders,
} from 'lucide-react';
import {
  detectMimeType,
  isAnimatedGifBuffer,
  extractAndCompositeGifFrames,
  processStaticImage,
  processAnimatedGif,
  renderTransformedSource,
  type GifFrameData,
} from '../../utils/imageProcessing';

interface AvatarEditorModalProps {
  file: File;
  onSave: (processedBase64: string) => Promise<void> | void;
  onCancel: () => void;
}

function getDefaultCropPixels(width: number, height: number): Area {
  const size = Math.min(width, height);
  return {
    x: Math.round((width - size) / 2),
    y: Math.round((height - size) / 2),
    width: size,
    height: size,
  };
}

export const AvatarEditorModal: React.FC<AvatarEditorModalProps> = ({ file, onSave, onCancel }) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isAnimated, setIsAnimated] = useState(false);
  const [gifFrames, setGifFrames] = useState<GifFrameData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Editor states
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0); // 0, 90, 180, 270
  const [fineRotation, setFineRotation] = useState(0); // -45 to +45
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [objectFit, setObjectFit] = useState<'contain' | 'cover'>('cover');
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  // Preview & Processing state
  const [viewMode, setViewMode] = useState<'preview' | 'original'>('preview');
  const [saving, setSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState<{ percent: number; text: string } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // References
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const staticImageRef = useRef<HTMLImageElement | null>(null);

  const totalRotation = ((rotation + fineRotation) % 360 + 360) % 360;

  // ── Load & analyze file ───────────────────────────────────────────────────
  useEffect(() => {
    let url: string | null = null;
    let isCancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const buffer = await file.arrayBuffer();
        if (isCancelled) return;

        const detectedType = detectMimeType(buffer) || file.type;
        const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (!validTypes.includes(detectedType)) {
          throw new Error('Unsupported image format. Please use JPG, PNG, WebP, or GIF.');
        }

        const animated = isAnimatedGifBuffer(buffer);
        setIsAnimated(animated);

        if (animated) {
          const frames = extractAndCompositeGifFrames(buffer);
          if (isCancelled) return;
          setGifFrames(frames);
          if (frames.length > 0) {
            setCroppedAreaPixels(getDefaultCropPixels(frames[0].canvas.width, frames[0].canvas.height));
          }
        } else {
          const img = new Image();
          url = URL.createObjectURL(file);
          img.src = url;
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = () => reject(new Error('Failed to load image. File may be corrupted.'));
          });
          if (isCancelled) return;
          staticImageRef.current = img;
          setCroppedAreaPixels(getDefaultCropPixels(img.naturalWidth, img.naturalHeight));
        }

        url = url || URL.createObjectURL(file);
        setImageUrl(url);
      } catch (err: any) {
        if (!isCancelled) {
          setLoadError(err.message || 'Failed to open image file.');
        }
      } finally {
        if (!isCancelled) setLoading(false);
      }
    }

    load();

    return () => {
      isCancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file]);

  // ── Live Circular Preview animation / update ─────────────────────────────
  useEffect(() => {
    if (loading || !previewCanvasRef.current) return;

    if (isAnimated && gifFrames.length > 0) {
      let frameIndex = 0;
      let timer: ReturnType<typeof setTimeout> | null = null;

      const renderFrame = (idx: number) => {
        if (!previewCanvasRef.current || gifFrames.length === 0) return;
        const currentFrame = gifFrames[idx];
        const sw = currentFrame.canvas.width;
        const sh = currentFrame.canvas.height;
        const cropPx = croppedAreaPixels || getDefaultCropPixels(sw, sh);
        renderTransformedSource(
          currentFrame.canvas,
          sw,
          sh,
          {
            cropPixels: cropPx,
            rotation: totalRotation,
            flipH,
            flipV,
          },
          previewCanvasRef.current,
          128
        );
      };

      // Always render immediately on mount, state change, or switching back to preview
      renderFrame(frameIndex);

      const renderLoop = () => {
        if (!previewCanvasRef.current || gifFrames.length === 0) return;
        frameIndex = (frameIndex + 1) % gifFrames.length;
        renderFrame(frameIndex);
        timer = setTimeout(renderLoop, gifFrames[frameIndex].delay);
      };

      timer = setTimeout(renderLoop, gifFrames[frameIndex].delay);
      return () => {
        if (timer) clearTimeout(timer);
      };
    } else if (staticImageRef.current) {
      const img = staticImageRef.current;
      const sw = img.naturalWidth;
      const sh = img.naturalHeight;
      const cropPx = croppedAreaPixels || getDefaultCropPixels(sw, sh);
      renderTransformedSource(
        img,
        sw,
        sh,
        {
          cropPixels: cropPx,
          rotation: totalRotation,
          flipH,
          flipV,
        },
        previewCanvasRef.current,
        128
      );
    }
  }, [loading, isAnimated, gifFrames, croppedAreaPixels, totalRotation, flipH, flipV, viewMode]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const onCropComplete = useCallback((_croppedArea: Area, currentCroppedAreaPixels: Area) => {
    setCroppedAreaPixels(currentCroppedAreaPixels);
  }, []);

  const handleRotateLeft = () => setRotation((r) => (r - 90 + 360) % 360);
  const handleRotateRight = () => setRotation((r) => (r + 90) % 360);
  const handleFlipH = () => setFlipH((h) => !h);
  const handleFlipV = () => setFlipV((v) => !v);
  const handleToggleFit = () => setObjectFit((f) => (f === 'contain' ? 'cover' : 'contain'));

  const handleReset = () => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setFineRotation(0);
    setFlipH(false);
    setFlipV(false);
    setObjectFit('cover');
    setSaveError(null);
  };

  const handleSave = async () => {
    const cropPx = croppedAreaPixels || (
      isAnimated && gifFrames.length > 0
        ? getDefaultCropPixels(gifFrames[0].canvas.width, gifFrames[0].canvas.height)
        : staticImageRef.current
        ? getDefaultCropPixels(staticImageRef.current.naturalWidth, staticImageRef.current.naturalHeight)
        : null
    );
    if (!cropPx) return;

    setSaving(true);
    setSaveError(null);
    setSaveProgress(null);

    try {
      let finalDataUrl = '';

      if (isAnimated) {
        setSaveProgress({ percent: 10, text: 'Processing animated frames...' });
        finalDataUrl = await processAnimatedGif(
          gifFrames,
          {
            cropPixels: cropPx,
            rotation: totalRotation,
            flipH,
            flipV,
          },
          (percent, text) => setSaveProgress({ percent, text })
        );
      } else if (staticImageRef.current) {
        setSaveProgress({ percent: 50, text: 'Optimizing and compressing image...' });
        finalDataUrl = await processStaticImage(staticImageRef.current, {
          cropPixels: cropPx,
          rotation: totalRotation,
          flipH,
          flipV,
          mimeType: file.type,
        });
      } else {
        throw new Error('Image source is not ready.');
      }

      setSaveProgress({ percent: 100, text: 'Saving avatar...' });
      await onSave(finalDataUrl);
    } catch (err: any) {
      setSaveError(err.message || 'Failed to process avatar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onCancel();
      }}
    >
      <div className="relative bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden flex flex-col my-auto max-h-[95vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white">
          <h2 className="text-sm font-semibold text-slate-900">Profile Picture Editor</h2>
          <button
            onClick={onCancel}
            disabled={saving}
            className="rounded-md p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        {loading ? (
          <div className="py-24 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
            <p className="text-xs text-slate-500 font-medium">Loading and analyzing image...</p>
          </div>
        ) : loadError ? (
          <div className="p-8 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mb-3">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900 mb-1">Failed to load image</h3>
            <p className="text-xs text-slate-500 max-w-md mb-6">{loadError}</p>
            <button
              onClick={onCancel}
              className="text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg transition-colors"
            >
              Choose another file
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-12 flex-1 min-h-0 overflow-y-auto">
            {/* Left: Interactive Cropper Viewport */}
            <div className="md:col-span-7 bg-slate-950 flex flex-col items-center justify-center relative min-h-[340px] md:min-h-[440px] select-none p-4">
              {imageUrl && (
                <div className="relative w-full h-[320px] md:h-[400px]">
                  <Cropper
                    image={imageUrl}
                    crop={crop}
                    zoom={zoom}
                    rotation={totalRotation}
                    aspect={1}
                    cropShape="round"
                    showGrid={true}
                    objectFit={objectFit}
                    transform={`translate(${crop.x}px, ${crop.y}px) rotate(${totalRotation}deg) scale(${zoom}) scale(${flipH ? -1 : 1}, ${flipV ? -1 : 1})`}
                    onCropChange={setCrop}
                    onZoomChange={setZoom}
                    onCropComplete={onCropComplete}
                    onCropAreaChange={onCropComplete}
                    classes={{
                      containerClassName: 'rounded-lg overflow-hidden',
                    }}
                  />
                </div>
              )}

              {/* Viewport overlay helper */}
              <div className="absolute bottom-6 left-6 right-6 flex items-center justify-between pointer-events-none">
                <span className="text-[11px] text-white/70 bg-black/60 backdrop-blur-sm px-2.5 py-1 rounded-md">
                  Drag to reposition · Scroll or pinch to zoom
                </span>
                <span className="text-[11px] font-mono text-white/70 bg-black/60 backdrop-blur-sm px-2.5 py-1 rounded-md">
                  {Math.round(zoom * 100)}%
                </span>
              </div>
            </div>

            {/* Right: Controls & Live Preview */}
            <div className="md:col-span-5 bg-white p-5 flex flex-col justify-between border-t md:border-t-0 md:border-l border-slate-100 space-y-5 overflow-y-auto">
              {/* Preview Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    PFP Preview
                  </span>
                  <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-md">
                    <button
                      onClick={() => setViewMode('preview')}
                      className={`text-[10px] font-medium px-2 py-0.5 rounded transition-all ${
                        viewMode === 'preview'
                          ? 'bg-white text-slate-800 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      Preview
                    </button>
                    <button
                      onClick={() => setViewMode('original')}
                      className={`text-[10px] font-medium px-2 py-0.5 rounded transition-all ${
                        viewMode === 'original'
                          ? 'bg-white text-slate-800 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      Original
                    </button>
                  </div>
                </div>

                {/* Circular Preview Container */}
                <div className="flex items-center gap-4 bg-slate-50 border border-slate-200/80 rounded-xl p-3.5">
                  <div className="relative shrink-0">
                    <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-white shadow-md bg-slate-900 flex items-center justify-center">
                      <canvas
                        ref={previewCanvasRef}
                        width={128}
                        height={128}
                        className={`w-full h-full object-cover ${viewMode === 'preview' ? 'block' : 'hidden'}`}
                      />
                      {imageUrl && (
                        <img
                          src={imageUrl}
                          alt="Original"
                          className={`w-full h-full object-cover ${viewMode === 'original' ? 'block' : 'hidden'}`}
                        />
                      )}
                    </div>
                  </div>

                  <div className="min-w-0 space-y-1">
                    <p className="text-xs font-semibold text-slate-800 truncate">
                      {isAnimated ? 'Animated Avatar' : 'StockSense Avatar'}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Export: 1:1 circular · 512×512
                    </p>
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                        Target ≤ 200 KB
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Editing Controls */}
              <div className="space-y-4">
                {/* Zoom control */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-medium text-slate-700 flex items-center gap-1.5">
                      <ZoomIn className="w-3.5 h-3.5 text-slate-400" /> Zoom
                    </span>
                    <span className="text-slate-400 font-mono text-[11px]">{zoom.toFixed(2)}x</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setZoom((z) => Math.max(1, +(z - 0.2).toFixed(2)))}
                      className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
                      title="Zoom Out"
                    >
                      <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="range"
                      min={1}
                      max={3}
                      step={0.02}
                      value={zoom}
                      onChange={(e) => setZoom(parseFloat(e.target.value))}
                      className="flex-1 accent-brand-600 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                    />
                    <button
                      onClick={() => setZoom((z) => Math.min(3, +(z + 0.2).toFixed(2)))}
                      className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
                      title="Zoom In"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Fine rotation slider */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-medium text-slate-700 flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-slate-400" /> Fine Angle
                    </span>
                    <span className="text-slate-400 font-mono text-[11px]">
                      {fineRotation > 0 ? `+${fineRotation}°` : `${fineRotation}°`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-45}
                    max={45}
                    step={1}
                    value={fineRotation}
                    onChange={(e) => setFineRotation(parseInt(e.target.value, 10))}
                    className="w-full accent-brand-600 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                  />
                </div>

                {/* Transform Buttons Grid */}
                <div className="grid grid-cols-5 gap-1.5 pt-1">
                  <button
                    onClick={handleRotateLeft}
                    className="flex flex-col items-center justify-center p-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                    title="Rotate -90°"
                  >
                    <RotateCcw className="w-4 h-4 mb-0.5" />
                    <span className="text-[10px] font-medium">-90°</span>
                  </button>

                  <button
                    onClick={handleRotateRight}
                    className="flex flex-col items-center justify-center p-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                    title="Rotate +90°"
                  >
                    <RotateCw className="w-4 h-4 mb-0.5" />
                    <span className="text-[10px] font-medium">+90°</span>
                  </button>

                  <button
                    onClick={handleFlipH}
                    className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-colors ${
                      flipH
                        ? 'border-brand-600 bg-brand-50 text-brand-700'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                    }`}
                    title="Flip Horizontal"
                  >
                    <FlipHorizontal className="w-4 h-4 mb-0.5" />
                    <span className="text-[10px] font-medium">Flip H</span>
                  </button>

                  <button
                    onClick={handleFlipV}
                    className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-colors ${
                      flipV
                        ? 'border-brand-600 bg-brand-50 text-brand-700'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                    }`}
                    title="Flip Vertical"
                  >
                    <FlipVertical className="w-4 h-4 mb-0.5" />
                    <span className="text-[10px] font-medium">Flip V</span>
                  </button>

                  <button
                    onClick={handleToggleFit}
                    className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-colors ${
                      objectFit === 'contain'
                        ? 'border-brand-600 bg-brand-50 text-brand-700'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                    }`}
                    title={objectFit === 'contain' ? 'Switch to Fill (Cover)' : 'Switch to Fit (Contain)'}
                  >
                    {objectFit === 'contain' ? (
                      <Minimize className="w-4 h-4 mb-0.5" />
                    ) : (
                      <Maximize className="w-4 h-4 mb-0.5" />
                    )}
                    <span className="text-[10px] font-medium">
                      {objectFit === 'contain' ? 'Fit' : 'Fill'}
                    </span>
                  </button>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={handleReset}
                    className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Reset all
                  </button>
                </div>
              </div>

              {/* Progress & Error Feedback */}
              {saveProgress && (
                <div className="space-y-1.5 bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <div className="flex justify-between text-[11px] font-medium text-slate-700">
                    <span>{saveProgress.text}</span>
                    <span>{saveProgress.percent}%</span>
                  </div>
                  <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-brand-600 h-full transition-all duration-300 rounded-full"
                      style={{ width: `${saveProgress.percent}%` }}
                    />
                  </div>
                </div>
              )}

              {saveError && (
                <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-lg p-3 text-xs text-rose-700">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-500" />
                  <div className="flex-1">{saveError}</div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={saving}
                  className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-5 py-2 text-xs font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors shadow-sm"
                >
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Save Avatar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
