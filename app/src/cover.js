// Neon Vice cover renderer: draws the multi-panel GTA-style poster onto a canvas.
// Pure canvas 2D, no libraries, no network. Layouts are diagonal polygons in
// normalised (0..1) coordinates; each panel holds one photo with its own pan/zoom.

export const DISPLAY_FONT = '"Arial Black", "Helvetica Neue", Arial, sans-serif';
export const BODY_FONT = '"Helvetica Neue", Arial, sans-serif';

// Six diagonal panel layouts. Each panel is a polygon of [x, y] points.
export const LAYOUTS = {
  slash3: [
    [[0, 0], [0.36, 0], [0.28, 1], [0, 1]],
    [[0.36, 0], [0.68, 0], [0.60, 1], [0.28, 1]],
    [[0.68, 0], [1, 0], [1, 1], [0.60, 1]],
  ],
  hero: [
    [[0, 0], [1, 0], [1, 0.52], [0, 0.66]],
    [[0, 0.66], [0.55, 0.585], [0.50, 1], [0, 1]],
    [[0.55, 0.585], [1, 0.52], [1, 1], [0.50, 1]],
  ],
  quad: [
    [[0, 0], [0.52, 0], [0.47, 0.52], [0, 0.47]],
    [[0.52, 0], [1, 0], [1, 0.55], [0.47, 0.52]],
    [[0, 0.47], [0.47, 0.52], [0.44, 1], [0, 1]],
    [[0.47, 0.52], [1, 0.55], [1, 1], [0.44, 1]],
  ],
  // Spotlight 5: one large centre column + four side panels. The centre
  // panel is a tall hexagon whose edges are shared with the side panels,
  // so the five polygons tile the canvas with no gaps.
  spotlight5: [
    [[0, 0], [0.36, 0], [0.34, 0.5], [0, 0.46]],
    [[0.64, 0], [1, 0], [1, 0.46], [0.66, 0.5]],
    [[0.36, 0], [0.64, 0], [0.66, 0.5], [0.64, 1], [0.36, 1], [0.34, 0.5]],
    [[0, 0.46], [0.34, 0.5], [0.36, 1], [0, 1]],
    [[0.66, 0.5], [1, 0.46], [1, 1], [0.64, 1]],
  ],
  // Strips: four tall vertical strips, slight slant like slash3.
  strips: [
    [[0, 0], [0.28, 0], [0.24, 1], [0, 1]],
    [[0.28, 0], [0.53, 0], [0.49, 1], [0.24, 1]],
    [[0.53, 0], [0.77, 0], [0.73, 1], [0.49, 1]],
    [[0.77, 0], [1, 0], [1, 1], [0.73, 1]],
  ],
  // Duet: two big panels, one diagonal seam.
  duet: [
    [[0, 0], [0.56, 0], [0.44, 1], [0, 1]],
    [[0.56, 0], [1, 0], [1, 1], [0.44, 1]],
  ],
};

// Colour grades: top/bottom wash colours and the neon seam colour.
export const GRADES = {
  neon: {
    washTop: 'rgba(10, 60, 74, 0.55)',
    washBottom: 'rgba(255, 45, 120, 0.52)',
    glow: 'rgba(25, 227, 255, 0.26)',
    seam: '#19e3ff',
    seamAlt: '#ff2d78',
    vignette: 0.48,
  },
  sunset: {
    washTop: 'rgba(255, 122, 26, 0.44)',
    washBottom: 'rgba(214, 51, 132, 0.52)',
    glow: 'rgba(255, 179, 71, 0.26)',
    seam: '#ffb347',
    seamAlt: '#ff5e78',
    vignette: 0.42,
  },
  vice: {
    washTop: 'rgba(88, 28, 135, 0.56)',
    washBottom: 'rgba(255, 45, 149, 0.54)',
    glow: 'rgba(255, 120, 200, 0.26)',
    seam: '#ff7ad9',
    seamAlt: '#b388ff',
    vignette: 0.46,
  },
};

function polygonPath(ctx, points, w, h) {
  ctx.beginPath();
  points.forEach(([x, y], i) => {
    const px = x * w;
    const py = y * h;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.closePath();
}

// Draw one photo into one panel: cover-fit, then the panel's pan/zoom.
export function drawPanelPhoto(ctx, img, polygon, panel, w, h) {
  if (!img || !img.naturalWidth) return;
  polygonPath(ctx, polygon, w, h);
  ctx.save();
  ctx.clip();
  // Panel bounds, for the cover-fit math.
  let minX = 1, maxX = 0, minY = 1, maxY = 0;
  for (const [x, y] of polygon) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const pw = (maxX - minX) * w;
  const ph = (maxY - minY) * h;
  const cx = (minX + maxX) / 2 * w;
  const cy = (minY + maxY) / 2 * h;
  const fit = Math.max(pw / img.naturalWidth, ph / img.naturalHeight);
  const scale = fit * (panel.zoom || 1);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  // When a tall photo is squeezed into a short panel, cover-fit crops the
  // top and bottom hard; bias a little toward the photo's upper third,
  // where faces usually are, instead of dead centre.
  const anchorY = dh > ph * 1.25 ? 0.44 : 0.5;
  const dx = cx - dw / 2 + (panel.ox || 0) * pw;
  const dy = cy - dh * anchorY + (panel.oy || 0) * ph;
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
}

// Which panel, if any, contains the normalised point (nx, ny)?
export function panelAt(layoutName, nx, ny) {
  const polys = LAYOUTS[layoutName] || LAYOUTS.slash3;
  for (let i = polys.length - 1; i >= 0; i--) {
    if (pointInPolygon(nx, ny, polys[i])) return i;
  }
  return -1;
}

function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function applyGrade(ctx, w, h, grade, withGlow) {
  const g = GRADES[grade] || GRADES.neon;
  // Night pass first: pull the whole photo down toward dusk so the neon
  // washes read as night, not as a tint over daylight.
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = 'rgba(52, 84, 110, 0.62)';
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
  // Top wash fading to a bottom wash.
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, g.washTop);
  grad.addColorStop(0.55, 'rgba(0,0,0,0)');
  grad.addColorStop(1, g.washBottom);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  if (withGlow) {
    // Neon glow bleeding from the top-right corner.
    const glow = ctx.createRadialGradient(w * 0.9, -h * 0.05, 0, w * 0.9, -h * 0.05, w * 0.9);
    glow.addColorStop(0, g.glow);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    // Diagonal light streak across the cover.
    ctx.save();
    ctx.globalAlpha = 0.10;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(w * 0.15, 0);
    ctx.lineTo(w * 0.38, 0);
    ctx.lineTo(w * 0.12, h);
    ctx.lineTo(-w * 0.10, h);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  // Vignette: darken the edges so the caption pops.
  const vig = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.max(w, h) * 0.78);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, `rgba(2,6,12,${g.vignette})`);
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);
}

function drawSeams(ctx, polys, w, h, grade) {
  const g = GRADES[grade] || GRADES.neon;
  ctx.save();
  ctx.lineJoin = 'round';
  polys.forEach((poly, i) => {
    polygonPath(ctx, poly, w, h);
    ctx.strokeStyle = i % 2 === 0 ? g.seam : g.seamAlt;
    ctx.lineWidth = Math.max(3, w * 0.004);
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = Math.max(8, w * 0.012);
    ctx.stroke();
  });
  ctx.restore();
}

function drawCaption(ctx, w, h, caption) {
  const title = (caption.title || '').toUpperCase();
  const subtitle = (caption.subtitle || '').toUpperCase();
  const tagline = (caption.tagline || '').toUpperCase();
  const stars = Math.max(0, Math.min(5, caption.stars || 0));
  const poster = !!caption.poster;
  if (!title && !subtitle) return;
  const size = caption.titleSize || 104;
  const spot = caption.spot || 'bottom';
  const grade = GRADES[caption.grade] || GRADES.neon;
  const base = size * (w / 1080);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Backing band so the lettering reads at thumbnail size. With poster
  // details on, the band grows to hold a star row and a tagline; with
  // them off, the geometry is exactly the classic one (bandH 1.55x,
  // title at 0.44, subtitle at 0.82), so old shots render unchanged.
  const bandH = poster ? base * 2.0 : base * 1.55;
  const bandY = spot === 'top' ? h * 0.02 : h - bandH - h * 0.03;
  ctx.fillStyle = 'rgba(3, 8, 14, 0.72)';
  ctx.fillRect(0, bandY, w, bandH);
  const edge = Math.max(3, w * 0.004);
  ctx.fillStyle = grade.seam;
  ctx.fillRect(0, bandY, w, edge);
  ctx.fillRect(0, bandY + bandH - edge, w, edge);

  if (poster && stars > 0) {
    const starPx = Math.max(16, base * 0.24);
    ctx.font = `700 ${starPx}px ${BODY_FONT}`;
    ctx.fillStyle = '#ffb347';
    ctx.fillText(`${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}`, w / 2, bandY + bandH * 0.12);
  }

  if (title) {
    // Fit the title to the width: shrink until it fits with room to spare.
    let fontPx = base;
    ctx.font = `900 ${fontPx}px ${DISPLAY_FONT}`;
    const maxW = w * 0.92;
    while (ctx.measureText(title).width > maxW && fontPx > 28) {
      fontPx -= 4;
      ctx.font = `900 ${fontPx}px ${DISPLAY_FONT}`;
    }
    const ty = bandY + bandH * (poster ? 0.45 : 0.44);
    ctx.lineWidth = Math.max(4, fontPx * 0.07);
    ctx.strokeStyle = 'rgba(4, 10, 16, 0.9)';
    ctx.lineJoin = 'round';
    // Chromatic offset shadows: cyan left, magenta right.
    ctx.fillStyle = 'rgba(25, 227, 255, 0.85)';
    ctx.fillText(title, w / 2 - fontPx * 0.045, ty);
    ctx.fillStyle = 'rgba(255, 45, 120, 0.85)';
    ctx.fillText(title, w / 2 + fontPx * 0.045, ty);
    ctx.strokeText(title, w / 2, ty);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(title, w / 2, ty);
  }
  if (subtitle) {
    const subPx = Math.max(20, base * 0.24);
    ctx.font = `700 ${subPx}px ${BODY_FONT}`;
    ctx.fillStyle = '#d7f6ff';
    const spaced = subtitle.split('').join(' ');
    const sy = bandY + bandH * (poster ? 0.70 : 0.82);
    ctx.fillText(spaced, w / 2, sy);
  }
  if (poster && tagline) {
    const tagPx = Math.max(16, base * 0.20);
    ctx.font = `italic 700 ${tagPx}px ${BODY_FONT}`;
    ctx.fillStyle = '#ffd7ef';
    const spaced = tagline.split('').join(' ');
    ctx.fillText(spaced, w / 2, bandY + bandH * 0.89);
  }
  ctx.restore();
}

// Poster role labels: one small pill per panel ("THE ANGLER" style).
// Presets rotate per panel; the editor can override (or clear) any panel's
// label, and Surprise me rotates the preset offset.
export const PRESET_LABELS = ['THE ANGLER', 'THE DRIVER', 'THE CAPTAIN', 'THE RUNNER', 'THE FIXER'];

export function labelFor(state, i) {
  const o = state.labelOverrides && state.labelOverrides[i];
  if (o !== undefined) return o; // empty string hides that panel's chip
  return PRESET_LABELS[(i + (state.labelOffset || 0)) % PRESET_LABELS.length];
}

function drawLabels(ctx, w, h, state) {
  const polys = LAYOUTS[state.layout] || LAYOUTS.slash3;
  const grade = GRADES[state.grade] || GRADES.neon;
  const px = Math.max(13, Math.round(w * 0.015));
  ctx.save();
  ctx.font = `800 ${px}px ${BODY_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  polys.forEach((poly, i) => {
    const label = (labelFor(state, i) || '').toUpperCase();
    if (!label) return;
    let minX = 1, maxX = 0, minY = 1, maxY = 0;
    for (const [x, y] of poly) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    const tw = ctx.measureText(label).width;
    const padX = px * 0.9;
    const padY = px * 0.55;
    const chipW = tw + padX * 2;
    const chipH = px + padY * 2;
    const cxp = (minX + maxX) / 2 * w;
    // Chips sit at the panel's top edge — or its bottom edge when the
    // caption band is on top — so they never hide under the band.
    const top = state.spot === 'top' ? maxY * h - chipH - 14 : minY * h + 14;
    const x = Math.max(chipW / 2 + 8, Math.min(w - chipW / 2 - 8, cxp));
    ctx.beginPath();
    ctx.roundRect(x - chipW / 2, top, chipW, chipH, chipH / 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
    ctx.fill();
    ctx.lineWidth = Math.max(2, w * 0.002);
    ctx.strokeStyle = grade.seam;
    ctx.stroke();
    ctx.fillStyle = '#0b0f14';
    ctx.fillText(label, x, top + chipH / 2 + 1);
  });
  ctx.restore();
}

// The whole cover: background, panels, grade, seams, caption.
export function drawCover(canvas, state) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const polys = LAYOUTS[state.layout] || LAYOUTS.slash3;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#04080e';
  ctx.fillRect(0, 0, w, h);
  polys.forEach((poly, i) => {
    const panel = state.panels[i] || { photoId: null, zoom: 1.15, ox: 0, oy: 0 };
    const img = state.photos[panel.photoId];
    if (img) drawPanelPhoto(ctx, img, poly, panel, w, h);
  });
  applyGrade(ctx, w, h, state.grade, state.glow);
  drawSeams(ctx, polys, w, h, state.grade);
  if (state.poster) drawLabels(ctx, w, h, state);
  drawCaption(ctx, w, h, {
    title: state.title,
    subtitle: state.subtitle,
    titleSize: state.titleSize,
    spot: state.spot,
    grade: state.grade,
    tagline: state.tagline,
    stars: state.stars,
    poster: state.poster,
  });
}
