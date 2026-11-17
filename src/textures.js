// Procedural textures drawn once on a canvas, so there are no image files to load.

/** Oak floorboards. One texture tile covers 2 × 2 m. */
export function floorTexture(THREE, renderer) {
  const size = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const tile = 2; // metres per tile
  const px = size / tile;
  const plankW = 0.16 * px;
  // seeded random so the floor looks the same every load
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.fillStyle = '#c8ad8c';
  g.fillRect(0, 0, size, size);
  const rows = Math.round(size / plankW);
  for (let r = 0; r < rows; r++) {
    const y = r * plankW;
    let x = -rnd() * 1.2 * px;
    while (x < size) {
      const len = (0.9 + rnd() * 0.9) * px;
      // pale oak: narrow tone range so the floor reads as one surface
      const hue = 31 + rnd() * 5;
      g.fillStyle = `hsl(${hue} ${24 + rnd() * 8}% ${60 + rnd() * 9}%)`;
      g.fillRect(x, y, len, plankW);
      // grain
      g.globalAlpha = 0.06;
      for (let i = 0; i < 9; i++) {
        g.strokeStyle = rnd() > 0.5 ? '#5a3b22' : '#f3dcbc';
        g.lineWidth = 0.6 + rnd() * 1.4;
        const gy = y + rnd() * plankW;
        g.beginPath();
        g.moveTo(x, gy);
        g.bezierCurveTo(x + len * 0.3, gy + (rnd() - 0.5) * 6, x + len * 0.7, gy + (rnd() - 0.5) * 6, x + len, gy + (rnd() - 0.5) * 4);
        g.stroke();
      }
      g.globalAlpha = 1;
      // seams
      g.fillStyle = 'rgba(70,48,28,0.28)';
      g.fillRect(x, y, 1.2, plankW);
      x += len;
    }
    g.fillStyle = 'rgba(70,48,28,0.25)';
    g.fillRect(0, y, size, 1.2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  tex.userData.tile = tile;
  return tex;
}

/** Very faint plaster noise so walls don't read as flat plastic. */
export function wallTexture(THREE) {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < size * size; i++) {
    const v = 236 + Math.round((rnd() - 0.5) * 10);
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v - 3;
    img.data[i * 4 + 2] = v - 8;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  return tex;
}

/** Pale square floor tiles with grout lines. One texture tile covers 0.6 × 0.6 m (four tiles). */
export function tileTexture(THREE, renderer) {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.fillStyle = '#b9bec4';
  g.fillRect(0, 0, size, size);
  const half = size / 2;
  const grout = 3;
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    const v = 226 + Math.round(rnd() * 8);
    g.fillStyle = `rgb(${v},${v + 2},${v + 4})`;
    g.fillRect(i * half + grout / 2, j * half + grout / 2, half - grout, half - grout);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  tex.userData.tile = 0.6;
  return tex;
}
