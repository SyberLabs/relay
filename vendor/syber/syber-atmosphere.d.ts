// Types for the vendored SyberLabs v2 kit module (syber-atmosphere.js, unmodified).
export interface AtmosphereOptions {
  mode?: 'hero' | 'ambient';
  avoid?: Element | null;
  caption?: Element | null;
  reduced?: boolean;
  allowSoftware?: boolean;
}
export interface Atmosphere {
  supported: boolean;
  destroy(): void;
}
export function mount(
  canvas: HTMLCanvasElement,
  opts?: AtmosphereOptions,
): Atmosphere;
export function paramLine(P: number[]): string;
export const RING_SVG: string;
