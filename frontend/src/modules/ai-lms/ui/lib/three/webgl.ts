/** True when the browser can create a WebGL context. */
export function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}

/** Device pixel ratio capped at 2: sharper than 1x, without 3x phones paying 9x the fill cost. */
export const cappedPixelRatio = () => Math.min(window.devicePixelRatio || 1, 2);
