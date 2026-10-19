/**
 * High-accuracy Rubik face color reader.
 * Strategy: crop to face square → sample sticker centers (median) →
 * HSV rules + LAB distance → per-face relative cleanup.
 */
window.CubeVision = (() => {
  const COLOR_HEX = {
    white: "#f4f4f0",
    yellow: "#f0d24a",
    red: "#e23b2f",
    orange: "#f07a2e",
    blue: "#2f6fdb",
    green: "#2f9e4a",
  };

  const FACE_ORDER = ["U", "R", "F", "D", "L", "B"];
  const FACE_HINTS = {
    U: "Up / Top",
    D: "Down / Bottom",
    F: "Front",
    B: "Back",
    R: "Right",
    L: "Left",
  };

  // Canonical centers in roughly perceptual space (approx Lab-ish via RGB→XYZ→Lab)
  const PROTOTYPES = [
    { name: "white", lab: [90, 0, 2] },
    { name: "yellow", lab: [85, 5, 80] },
    { name: "red", lab: [48, 65, 45] },
    { name: "orange", lab: [65, 40, 65] },
    { name: "blue", lab: [35, 25, -55] },
    { name: "green", lab: [55, -45, 35] },
  ];

  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    const s = max === 0 ? 0 : d / max;
    const v = max;
    return { h, s, v };
  }

  function rgbToLab(r, g, b) {
    // sRGB → XYZ → Lab (D65)
    r /= 255; g /= 255; b /= 255;
    r = r > 0.04045 ? ((r + 0.055) / 1.055) ** 2.4 : r / 12.92;
    g = g > 0.04045 ? ((g + 0.055) / 1.055) ** 2.4 : g / 12.92;
    b = b > 0.04045 ? ((b + 0.055) / 1.055) ** 2.4 : b / 12.92;
    let x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
    let y = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 1.0;
    let z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    x = f(x); y = f(y); z = f(z);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  }

  function labDist(a, b) {
    const dl = a[0] - b[0];
    const da = a[1] - b[1];
    const db = a[2] - b[2];
    return dl * dl + da * da + db * db;
  }

  function median(arr) {
    if (!arr.length) return 0;
    const s = arr.slice().sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  /** Sample sticker with median RGB from central region (ignores plastic gaps). */
  function sampleSticker(ctx, cx, cy, size) {
    const half = Math.max(3, Math.floor(size / 2));
    const x0 = Math.max(0, cx - half);
    const y0 = Math.max(0, cy - half);
    const w = Math.min(ctx.canvas.width - x0, half * 2);
    const h = Math.min(ctx.canvas.height - y0, half * 2);
    const data = ctx.getImageData(x0, y0, w, h).data;
    const rs = [];
    const gs = [];
    const bs = [];
    // Use only inner 60% of patch
    const marginX = Math.floor(w * 0.2);
    const marginY = Math.floor(h * 0.2);
    for (let y = marginY; y < h - marginY; y++) {
      for (let x = marginX; x < w - marginX; x++) {
        const i = (y * w + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        // skip near-black (gaps) and specular white blowouts
        const lum = (r + g + b) / 3;
        if (lum < 25 || lum > 252) continue;
        rs.push(r); gs.push(g); bs.push(b);
      }
    }
    if (!rs.length) {
      // fallback: full patch average
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < data.length; i += 4) {
        r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
      }
      return n ? [r / n, g / n, b / n] : [128, 128, 128];
    }
    return [median(rs), median(gs), median(bs)];
  }

  function classifyOne(rgb, wbGain) {
    let [r, g, b] = rgb;
    // Simple white-balance
    r = Math.min(255, r * wbGain[0]);
    g = Math.min(255, g * wbGain[1]);
    b = Math.min(255, b * wbGain[2]);

    const hsv = rgbToHsv(r, g, b);
    const lab = rgbToLab(r, g, b);

    // Low saturation → white (or pale yellow)
    if (hsv.s < 0.18) {
      if (hsv.v > 0.55) return "white";
      // dark unsaturated — still likely white in shadow
      if (hsv.v > 0.35 && lab[0] > 45) return "white";
    }

    // Yellow: high V, moderate-high S, hue ~35–75
    if (hsv.h >= 35 && hsv.h <= 80 && hsv.s > 0.2 && hsv.v > 0.35) {
      return "yellow";
    }

    // Orange vs Red by hue
    if ((hsv.h <= 25 || hsv.h >= 345) && hsv.s > 0.28) {
      // borderline: use a* and hue
      if (hsv.h > 12 && hsv.h < 35) return "orange";
      return "red";
    }
    if (hsv.h > 15 && hsv.h < 45 && hsv.s > 0.3) {
      return hsv.h < 22 ? "red" : "orange";
    }

    // Green
    if (hsv.h >= 75 && hsv.h <= 170 && hsv.s > 0.2) return "green";
    // Blue
    if (hsv.h >= 175 && hsv.h <= 270 && hsv.s > 0.2) return "blue";

    // Fallback: nearest Lab prototype
    let best = "white";
    let bestD = Infinity;
    for (const p of PROTOTYPES) {
      const d = labDist(lab, p.lab);
      if (d < bestD) {
        bestD = d;
        best = p.name;
      }
    }
    return best;
  }

  /** Estimate white-balance gains from brightest low-sat pixels. */
  function estimateWhiteBalance(ctx) {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const data = ctx.getImageData(0, 0, w, h).data;
    let rSum = 0, gSum = 0, bSum = 0, n = 0;
    const step = 8;
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const i = (y * w + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const hsv = rgbToHsv(r, g, b);
        if (hsv.s < 0.2 && hsv.v > 0.45) {
          rSum += r; gSum += g; bSum += b; n++;
        }
      }
    }
    if (n < 10) return [1, 1, 1];
    const rAvg = rSum / n, gAvg = gSum / n, bAvg = bSum / n;
    const gray = (rAvg + gAvg + bAvg) / 3;
    return [
      gray / Math.max(1, rAvg),
      gray / Math.max(1, gAvg),
      gray / Math.max(1, bAvg),
    ];
  }

  /**
   * Read 9 colors from image. Prefer sampling inside the same square as the camera guide (~12% inset).
   */
  function analyzeCanvas(ctx) {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    // Match camera overlay: inset ~12%
    const inset = 0.14;
    const x0 = w * inset;
    const y0 = h * inset;
    const usableW = w * (1 - 2 * inset);
    const usableH = h * (1 - 2 * inset);
    const cell = Math.min(usableW, usableH) / 3;
    const patch = Math.max(8, Math.round(cell * 0.32));

    const wb = estimateWhiteBalance(ctx);
    const rgbs = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const cx = Math.round(x0 + (col + 0.5) * (usableW / 3));
        const cy = Math.round(y0 + (row + 0.5) * (usableH / 3));
        // Also try a slightly smaller sample for robustness
        const a = sampleSticker(ctx, cx, cy, patch);
        const b = sampleSticker(ctx, cx, cy, Math.round(patch * 0.7));
        rgbs.push([
          (a[0] + b[0]) / 2,
          (a[1] + b[1]) / 2,
          (a[2] + b[2]) / 2,
        ]);
      }
    }

    let colors = rgbs.map((rgb) => classifyOne(rgb, wb));

    // Relative cleanup: if center looks white-ish but classified wrong under warm light
    const centerRgb = rgbs[4];
    const ch = rgbToHsv(centerRgb[0] * wb[0], centerRgb[1] * wb[1], centerRgb[2] * wb[2]);
    // Ensure we don't have 7+ of same color (impossible) — rare; skip

    // Red/orange confusion cleanup using hue ranking on face
    const redOrangeIdx = [];
    colors.forEach((c, i) => {
      if (c === "red" || c === "orange") redOrangeIdx.push(i);
    });
    if (redOrangeIdx.length >= 2) {
      const hues = redOrangeIdx.map((i) => {
        const [r, g, b] = rgbs[i];
        return rgbToHsv(r * wb[0], g * wb[1], b * wb[2]).h;
      });
      // Lower hue (more red-ish) vs higher (orange). Normalize wrap.
      const norm = hues.map((h) => (h > 180 ? h - 360 : h));
      const mid = median(norm);
      redOrangeIdx.forEach((i, k) => {
        colors[i] = norm[k] <= mid ? "red" : "orange";
      });
      // If only slight spread, keep HSV primary
      const spread = Math.max(...norm) - Math.min(...norm);
      if (spread < 8) {
        redOrangeIdx.forEach((i) => {
          colors[i] = classifyOne(rgbs[i], wb);
        });
      }
    }

    return { colors, rgbs };
  }

  async function readFaceColors(fileOrBlob) {
    const bitmap = await createImageBitmap(fileOrBlob);
    const canvas = document.createElement("canvas");
    const maxSide = 900;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const { colors } = analyzeCanvas(ctx);
    return {
      colors,
      previewUrl: canvas.toDataURL("image/jpeg", 0.8),
    };
  }

  /**
   * Capture only the guide square region from the live video (best accuracy).
   */
  async function readFaceFromVideo(video) {
    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;
    // Crop to center square matching overlay (inset 12–14%)
    const inset = 0.14;
    const side = Math.min(vw, vh) * (1 - 2 * inset);
    const sx = (vw - side) / 2;
    const sy = (vh - side) / 2;

    const canvas = document.createElement("canvas");
    canvas.width = 600;
    canvas.height = 600;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(video, sx, sy, side, side, 0, 0, 600, 600);

    const { colors } = analyzeCanvas(ctx);
    return {
      colors,
      previewUrl: canvas.toDataURL("image/jpeg", 0.85),
    };
  }

  return {
    readFaceColors,
    readFaceFromVideo,
    COLOR_HEX,
    FACE_ORDER,
    FACE_HINTS,
  };
})();
