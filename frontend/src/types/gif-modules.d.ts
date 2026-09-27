declare module 'gifuct-js' {
  export interface ParsedFrame {
    dims: {
      top: number;
      left: number;
      width: number;
      height: number;
    };
    delay: number;
    disposalType: number;
    patch: Uint8ClampedArray;
    transparentIndex?: number;
    colorTable?: number[][];
  }

  export interface ParsedGIF {
    lsd: {
      width: number;
      height: number;
      gctFlag: boolean;
      colorRes: number;
      sorted: boolean;
      gctSize: number;
      backgroundColorIndex: number;
      pixelAspectRatio: number;
    };
    frames: any[];
  }

  export function parseGIF(buffer: ArrayBuffer): ParsedGIF;
  export function decompressFrames(gif: ParsedGIF, buildPatch: boolean): ParsedFrame[];
}

declare module 'gifenc' {
  export interface GIFEncoderInstance {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      opts?: {
        palette?: number[][];
        delay?: number;
        repeat?: number;
        transparent?: boolean;
        transparentIndex?: number;
        dispose?: number;
      }
    ): void;
    finish(): void;
    bytes(): Uint8Array;
    reset(): void;
  }

  export function GIFEncoder(opts?: { auto?: boolean; initialCapacity?: number }): GIFEncoderInstance;
  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    opts?: {
      format?: string;
      oneBitAlpha?: boolean | number;
      clearAlpha?: boolean;
      clearAlphaThreshold?: number;
      clearAlphaColor?: number;
    }
  ): number[][];
  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: number[][],
    format?: string
  ): Uint8Array;
}
