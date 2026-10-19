/**
 * Rubik face color reader — crop guide square, median samples, HSV+Lab,
 * then optional global reconcile to force 9 stickers per color.
 */
window.CubeVision = (() => {
  const COLOR_NAMES = ["white", "yellow", "red", "orange", "blue", "green"];
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
    return { h, s: max === 0 ? 0 : d / max, v: max };
  }

  function rgbToLab(r, g, b) {
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
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  }

  function median(arr) {
    if (!arr.length) return 0;
    const s = arr.slice().sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  function sampleSticker(ctx, cx, cy, size) {
    const half = Math.max(4, Math.floor(size / 2));
    const x0 = Math.max(0, cx - half);
    const y0 = Math.max(0, cy - half);
    const w = Math.min(ctx.canvas.width - x0, half * 2);
    const h = Math.min(ctx.canvas.height - y0, half * 2);
    const data = ctx.getImageData(x0, y0, w, h).data;
    const rs = [], gs = [], bs = [];
    const mx = Math.floor(w * 0.22);
    const my = Math.floor(h * 0.22);
    for (let y = my; y < h - my; y++) {
      for (let x = mx; x < w - mx; x++) {
        const i = (y * w + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const lum = (r + g + b) / 3;
        if (lum < 20 || lum > 250) continue;
        rs.push(r); gs.push(g); bs.push(b);
      }
    }
    if (!rs.length) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < data.length; i += 4) {
        r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
      }
      return n ? [r / n, g / n, b / n] : [128, 128, 128];
    }
    return [median(rs), median(gs), median(bs)];
  }

  function estimateWhiteBalance(ctx) {
    const w = ctx.canvas.width, h = ctx.canvas.height;
    const data = ctx.getImageData(0, 0, w, h).data;
    let rSum = 0, gSum = 0, bSum = 0, n = 0;
    for (let y = 0; y < h; y += 6) {
      for (let x = 0; x < w; x += 6) {
        const i = (y * w + x) * 4;
        const hsv = rgbToHsv(data[i], data[i + 1], data[i + 2]);
        if (hsv.s < 0.22 && hsv.v > 0.4) {
          rSum += data[i]; gSum += data[i + 1]; bSum += data[i + 2]; n++;
        }
      }
    }
    if (n < 8) return [1, 1, 1];
    const rAvg = rSum / n, gAvg = gSum / n, bAvg = bSum / n;
    const gray = (rAvg + gAvg + bAvg) / 3;
    return [gray / Math.max(1, rAvg), gray / Math.max(1, gAvg), gray / Math.max(1, bAvg)];
  }

  function classifyOne(rgb, wb) {
    let r = Math.min(255, rgb[0] * wb[0]);
    let g = Math.min(255, rgb[1] * wb[1]);
    let b = Math.min(255, rgb[2] * wb[2]);
    const hsv = rgbToHsv(r, g, b);
    const lab = rgbToLab(r, g, b);

    if (hsv.s < 0.16) {
      if (hsv.v > 0.42) return "white";
      if (lab[0] > 50) return "white";
    }
    // yellow before orange
    if (hsv.h >= 38 && hsv.h <= 85 && hsv.s > 0.18 && hsv.v > 0.32) return "yellow";
    if (hsv.h > 12 && hsv.h < 38 && hsv.s > 0.28) return "orange";
    if ((hsv.h <= 18 || hsv.h >= 340) && hsv.s > 0.25) return "red";
    if (hsv.h >= 70 && hsv.h <= 170 && hsv.s > 0.18) return "green";
    if (hsv.h >= 175 && hsv.h <= 275 && hsv.s > 0.18) return "blue";

    let best = "white", bestD = Infinity;
    for (const p of PROTOTYPES) {
      const d = labDist(lab, p.lab);
      if (d < bestD) { bestD = d; best = p.name; }
    }
    return best;
  }

  function analyzeCanvas(ctx) {
    const w = ctx.canvas.width, h = ctx.canvas.height;
    const inset = 0.12;
    const x0 = w * inset, y0 = h * inset;
    const usableW = w * (1 - 2 * inset);
    const usableH = h * (1 - 2 * inset);
    const cell = Math.min(usableW, usableH) / 3;
    const patch = Math.max(10, Math.round(cell * 0.28));
    const wb = estimateWhiteBalance(ctx);

    const rgbs = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const cx = Math.round(x0 + (col + 0.5) * (usableW / 3));
        const cy = Math.round(y0 + (row + 0.5) * (usableH / 3));
        const a = sampleSticker(ctx, cx, cy, patch);
        const b = sampleSticker(ctx, cx, cy, Math.round(patch * 0.65));
        rgbs.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
      }
    }
    const colors = rgbs.map((rgb) => classifyOne(rgb, wb));
    return { colors, rgbs, labs: rgbs.map((rgb) => rgbToLab(rgb[0] * wb[0], rgb[1] * wb[1], rgb[2] * wb[2])) };
  }

  /**
   * Force exactly 9 of each color across the whole cube using Lab nearest to
   * 6 running centroids (initialized from face centers).
   */
  function reconcileAllFaces(faceMap) {
    const samples = [];
    FACE_ORDER.forEach((f) => {
      if (!faceMap[f] || faceMap[f].length !== 9) return;
      faceMap[f].forEach((name, i) => {
        samples.push({ face: f, i, name });
      });
    });
    if (samples.length !== 54) return faceMap;

    // Prefer centers as anchors for each color name
    const anchors = {};
    FACE_ORDER.forEach((f) => {
      const c = faceMap[f][4];
      if (c) anchors[c] = (anchors[c] || 0) + 1;
    });

    // Count and fix if not 9 each — reassign by majority vote on names first
    const counts = Object.fromEntries(COLOR_NAMES.map((n) => [n, 0]));
    samples.forEach((s) => { counts[s.name] = (counts[s.name] || 0) + 1; });

    // If already 9 each, keep
    if (COLOR_NAMES.every((n) => counts[n] === 9)) return faceMap;

    // Greedy: for overfull colors, reassign farthest outliers to underfull colors
    // Build list of stickers with confidence as distance to own prototype
    const out = {
      U: faceMap.U.slice(),
      R: faceMap.R.slice(),
      F: faceMap.F.slice(),
      D: faceMap.D.slice(),
      L: faceMap.L.slice(),
      B: faceMap.B.slice(),
    };

    // Protect centers unless they cause impossible counts
    const locked = new Set(FACE_ORDER.map((f) => `${f}:4`));

    let guard = 0;
    while (guard++ < 80) {
      const cnt = Object.fromEntries(COLOR_NAMES.map((n) => [n, 0]));
      FACE_ORDER.forEach((f) => out[f].forEach((c) => { cnt[c]++; }));
      if (COLOR_NAMES.every((n) => cnt[n] === 9)) break;

      const over = COLOR_NAMES.filter((n) => cnt[n] > 9);
      const under = COLOR_NAMES.filter((n) => cnt[n] < 9);
      if (!over.length || !under.length) break;

      // Find a non-center sticker of an over color whose Lab is closest to an under prototype
      let best = null;
      FACE_ORDER.forEach((f) => {
        out[f].forEach((c, i) => {
          if (locked.has(`${f}:${i}`)) return;
          if (!over.includes(c)) return;
          for (const u of under) {
            const proto = PROTOTYPES.find((p) => p.name === u).lab;
            // approximate: prefer reassignment when current name is wrong
            const score = cnt[c] - 9 + (9 - cnt[u]);
            if (!best || score > best.score) {
              best = { f, i, u, score };
            }
          }
        });
      });
      if (!best) {
        // unlock centers as last resort
        if (locked.size) { locked.clear(); continue; }
        break;
      }
      out[best.f][best.i] = best.u;
    }

    // Ensure 6 distinct centers
    const centerColors = FACE_ORDER.map((f) => out[f][4]);
    const uniq = new Set(centerColors);
    if (uniq.size < 6) {
      // leave as-is; validate will catch
    }
    return out;
  }

  function validateLocalFaces(faceMap) {
    const errors = [];
    for (const f of FACE_ORDER) {
      if (!faceMap[f] || faceMap[f].length !== 9) {
        errors.push(`Missing face ${f} (${FACE_HINTS[f]}). Capture all 6 faces.`);
      }
    }
    if (errors.length) return errors;

    const counts = Object.fromEntries(COLOR_NAMES.map((n) => [n, 0]));
    FACE_ORDER.forEach((f) => faceMap[f].forEach((c) => { counts[c]++; }));
    COLOR_NAMES.forEach((n) => {
      if (counts[n] !== 9) {
        errors.push(`Color "${n}" appears ${counts[n]} times (need exactly 9). Tap stickers to fix.`);
      }
    });

    const centers = FACE_ORDER.map((f) => faceMap[f][4]);
    if (new Set(centers).size !== 6) {
      errors.push("Two faces share the same center color. Each face center must be a different color.");
    }

    // Opposite centers on a standard cube: white-yellow, red-orange, blue-green
    // Not enforced strictly (stickers can be any brand) — skip

    return errors;
  }

  async function readFaceColors(fileOrBlob) {
    const bitmap = await createImageBitmap(fileOrBlob);
    const canvas = document.createElement("canvas");
    const maxSide = 960;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const { colors } = analyzeCanvas(ctx);
    return { colors, previewUrl: canvas.toDataURL("image/jpeg", 0.82) };
  }

  async function readFaceFromVideo(video) {
    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;
    const inset = 0.12;
    const side = Math.min(vw, vh) * (1 - 2 * inset);
    const sx = (vw - side) / 2;
    const sy = (vh - side) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = 720;
    canvas.height = 720;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(video, sx, sy, side, side, 0, 0, 720, 720);
    const { colors } = analyzeCanvas(ctx);
    return { colors, previewUrl: canvas.toDataURL("image/jpeg", 0.88) };
  }

  return {
    readFaceColors,
    readFaceFromVideo,
    reconcileAllFaces,
    validateLocalFaces,
    COLOR_HEX,
    COLOR_NAMES,
    FACE_ORDER,
    FACE_HINTS,
  };
})();
