/** Face color sampling + camera helpers */
window.CubeVision = (() => {
  const COLOR_PROTOTYPES = [
    { name: "white", rgb: [245, 245, 240] },
    { name: "yellow", rgb: [240, 210, 50] },
    { name: "red", rgb: [200, 40, 35] },
    { name: "orange", rgb: [230, 120, 35] },
    { name: "blue", rgb: [40, 90, 200] },
    { name: "green", rgb: [40, 150, 70] },
  ];

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

  function dist2(a, b) {
    const dr = a[0] - b[0];
    const dg = a[1] - b[1];
    const db = a[2] - b[2];
    return dr * dr + dg * dg + db * db;
  }

  function classifyRgb(rgb) {
    let best = COLOR_PROTOTYPES[0];
    let bestD = Infinity;
    for (const p of COLOR_PROTOTYPES) {
      const d = dist2(rgb, p.rgb);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    const [r, g, b] = rgb;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    const lum = (r + g + b) / 3;
    if (sat < 0.18 && lum > 170) return "white";
    if (sat < 0.25 && lum > 140 && r > 160 && g > 140 && b < 120) return "yellow";
    return best.name;
  }

  function samplePatch(ctx, cx, cy, size) {
    const half = Math.floor(size / 2);
    const x = Math.max(0, cx - half);
    const y = Math.max(0, cy - half);
    const data = ctx.getImageData(x, y, size, size).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] + data[i + 1] + data[i + 2] < 40) continue;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n++;
    }
    if (!n) return [0, 0, 0];
    return [r / n, g / n, b / n];
  }

  async function readFaceColors(fileOrBlob) {
    const bitmap = await createImageBitmap(fileOrBlob);
    const canvas = document.createElement("canvas");
    const maxSide = 640;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const w = canvas.width;
    const h = canvas.height;
    const insetX = w * 0.18;
    const insetY = h * 0.18;
    const usableW = w - insetX * 2;
    const usableH = h - insetY * 2;
    const patch = Math.max(6, Math.round(Math.min(usableW, usableH) / 12));

    const colors = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const cx = Math.round(insetX + (col + 0.5) * (usableW / 3));
        const cy = Math.round(insetY + (row + 0.5) * (usableH / 3));
        colors.push(classifyRgb(samplePatch(ctx, cx, cy, patch)));
      }
    }
    return { colors, previewUrl: canvas.toDataURL("image/jpeg", 0.72) };
  }

  async function readFaceFromVideo(video) {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);
    return new Promise((resolve) => {
      canvas.toBlob(async (blob) => {
        resolve(await readFaceColors(blob));
      }, "image/jpeg", 0.92);
    });
  }

  return {
    readFaceColors,
    readFaceFromVideo,
    COLOR_HEX,
    FACE_ORDER,
    FACE_HINTS,
  };
})();
