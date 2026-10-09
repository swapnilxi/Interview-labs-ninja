import * as THREE from 'three';

/**
 * Soft radial gold glow used as the sprite/point map in ai-bootcamp's Three.js
 * scenes. The caller owns the texture and must dispose it.
 */
export function createGlowTexture(size = 128): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const r = size / 2;
  const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.15, 'rgba(255, 246, 240,0.85)');
  grad.addColorStop(0.4, 'rgba(255, 166, 114,0.28)');
  grad.addColorStop(1, 'rgba(249, 115, 22,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}
