# 3D Render App (Three.js Prototype)

A fast, browser-based 3D render application for importing FBX models, adjusting PBR lighting, reflections, and camera parameters in real-time, and exporting production-quality images at resolutions up to 8K.

---

## Getting Started

```bash
npm install
npm run dev      # starts dev server at http://localhost:5173
npm run build    # production TypeScript & Vite build
npm run preview  # preview the production build locally
```

---

## How to Use

1. **Import FBX Model**
   * Drag and drop any `.fbx` file directly into the 3D viewport, or click **📂 Import FBX** in the top toolbar.
   * Models are automatically centered at the origin, placed on the ground plane, and scaled to a normalized 2-unit bounding box.
   * Wide models automatically adjust the render frame to **16:9** to avoid wasted canvas area.

2. **Transform & Navigate**
   * **Translate:** Press `W` or click **↔ Translate**
   * **Rotate:** Press `E` or click **↻ Rotate**
   * **Scale:** Press `R` or click **⇔ Scale**
   * **Coordinate Space:** Press `Q` to toggle between World and Local space.
   * **Snap:** Hold `Ctrl` while dragging any gizmo handle to snap translation (0.25 units), rotation (15°), or scale.
   * **Undo / Redo:** Press `Ctrl+Z` to undo transformations; `Ctrl+Shift+Z` to redo.
   * **Fit to Frame:** Press `F` or click **⊡ Frame** to frame the model snugly inside the safe-frame overlay.

3. **Lighting & Environment**
   * **Light:** Change light type (Directional, Point, Spot), adjust intensity, azimuth (0–360°), elevation (5–90°), and shadow softness.
   * **Environment (HDRI):** A CC0 1K studio HDRI (`studio_small_09_1k.hdr`) is bundled by default for softbox reflections and rim highlights. Load your own `.hdr` or `.exr` file anytime via the **HDRI** file picker.
   * **Surface & Sheen:** Adjust global **Roughness** and **Metalness** sliders live to tune glossiness or matte finishes on imported models.

4. **Output & Render**
   * Select a resolution preset (**1K / 2K / 4K / 8K**) or enter custom dimensions.
   * Choose an aspect ratio (**16:9**, **3:2**, **4:3**, **1:1**, or **Custom**). The safe-frame overlay in the viewport shows the exact rendered crop.
   * Check **Transparent PNG Output** for an alpha cutout without background or skybox.
   * Click **▶ Render**. A progress overlay will display tiled render stages (`Tile X / Y`) and percent complete.
   * The final render automatically downloads to your browser's default Downloads folder as a timestamped PNG (`render_4k_YYYYMMDD_HHMMSS.png`).
   * Click **⏹ Cancel** on the toolbar or progress overlay to cleanly abort rendering at any time.

---

## Known Limits & 8K Rendering

* **Tiled Offline Rendering:** High resolutions (4K and 8K) are divided into 1024×1024 pixel tiles and assembled using an `OffscreenCanvas`. This allows rendering images that exceed the GPU's single render target limit.
* **GPU Maximum Texture Size:** The application queries `gl.MAX_TEXTURE_SIZE` before starting. If the requested resolution exceeds your GPU's hard ceiling, a friendly warning is displayed with an offer to fall back to a safe resolution (e.g., 4K).
* **Accumulation Anti-Aliasing:** Pixel quality settings (1, 4, 16, 64 samples) perform sub-pixel camera jitter and area-light jitter. Higher samples significantly improve contact penumbras and edge smoothing, but increase render time proportionally.
* **Canvas Memory:** 8K renders allocate an uncompressed 8192×8192 2D canvas in browser memory (~268 MB RGBA buffer). On low-memory devices or integrated GPUs, 4K is recommended.

