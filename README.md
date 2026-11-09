# Render App: Fix Pass v0.2

> **Instructions for the AI agent:** The prototype from `README.md` runs, but three visible defects make the output unusable. Read this entire file, study the reference images, reproduce each defect, find the root cause with the debug steps given, then apply the fixes in the order in §8. Do not rewrite the architecture. Fix what is listed, verify with the acceptance tests in §6, and log every assumption in `DECISIONS.md`.

## 0. Reference files (user must place these in the repo)

```
docs/reference/
├── expected.jpeg           # TARGET look (a different model; match the LOOK, not the geometry)
├── current_render.png      # 4K output with the bugs
└── current_viewport.png    # viewport screenshot with the bugs
```

Open all three before changing code. If a file is missing, stop and ask the user to add it.

## 1. What the target looks like (`expected.jpeg`)

The expected image shows a different object (a plastic panel). Match these qualities:

- **Background:** flat, solid neutral dark gray (about `#454545`). No gradient, no vignette, no visible HDRI.
- **Model shading:** light-gray matte surface with a smooth light-to-shadow gradient across forms. **Nothing is clipped to pure white.** Edges and details stay readable.
- **Ambient occlusion:** soft darkening in recesses, clips, and where parts meet.
- **Material colors preserved:** parts that are dark stay dark.
- **Shadow:** one very soft, low-contrast, wide-penumbra shadow beneath the object. No hard edges.
- **Color:** neutral, no color cast.
- **Framing:** subject fills roughly 85% of the frame width.
- **No UI helpers** of any kind in the image.

## 2. Observed defects

### D1. HDRI does not display properly
**Symptoms** (`current_viewport.png`, `current_render.png`):
- Background is a smooth, blurry gradient with a dark blob in the middle, not a recognisable environment.
- Environment intensity defaults to **5.00**, which is far too high.
- "Transparent Background" and "Show Background" are both ticked, yet the render has an opaque HDRI-like background. These two options contradict each other.

**Likely root causes** (verify each, in this order):
1. `scene.background` is set to the **PMREM output texture** (`envRT.texture`). PMREM output is a heavily pre-blurred, low-resolution lighting map, so the background looks like a blurry gradient. The visible background must use the **original equirectangular texture**.
2. The loaded texture has no `mapping = EquirectangularReflectionMapping`, or `.exr` is loaded without `setDataType(HalfFloatType)`, or an HDR/EXR is wrongly tagged as sRGB.
3. One intensity slider drives both lighting and background brightness, and the default (5.0) overexposes everything.
4. Rotation is applied to the wrong object, so the HDRI and its reflections disagree.

### D2. Huge X / Y / Z gizmo drawn inside the scene
**Symptoms:** very large red/green/blue axes with sprite letters "X" and "Z" float around the model in the viewport, out of scale and blurry. This is separate from the small, correct `TransformControls` gizmo at the model pivot.

**Likely root cause:** a `ViewHelper` (three.js `ViewHelper` is itself an `Object3D`) or an `AxesHelper` was added to the **main scene** with `scene.add(...)`, so it renders at world scale. It may also be a child of the scaled model root and inherit its scale. The orientation widget must be drawn in its **own small corner viewport with its own camera**, never in the scene.

### D3. Final render comes out white
**Symptoms:** the model renders as flat pure white with almost no shading (the viewport is also washed out); only a few colored parts remain visible.

**Likely root causes** (several can stack):
1. Environment intensity 5.0 plus a strong directional light plus ACES tone mapping drives surfaces beyond 1.0.
2. FBX materials converted to `MeshStandardMaterial` ended up with albedo `(1,1,1)`, roughness near 0 or default, and no ambient occlusion. Pure-white albedo clips immediately under bright lighting.
3. The offline renderer may not match the viewport. In three.js, **tone mapping and output color-space conversion are applied only when rendering to the canvas, not to a render target.** If the final render draws into a `WebGLRenderTarget` and reads it back, it skips tone mapping and sRGB conversion, so the result differs from the viewport.
4. The accumulation (anti-aliasing) step may sum samples instead of averaging them, or average already tone-mapped 8-bit values incorrectly.
5. No ambient occlusion and no soft shadow, so there is nothing to describe form once the light is bright.

### D4. Smaller issues noticed (fix too)
- The ground shadow is **hard-edged and appears clipped** at one side. The shadow-camera frustum is too tight, and shadow softness is not applied.
- The ground plane is a visible surface. It should be a **shadow catcher** so the background stays a clean solid color.
- The transform gizmo pivot sits at a bottom corner of the model rather than its center-bottom.
- The properties panel is cut off at the bottom of the window (needs `overflow-y: auto` and a max height).

## 3. Required changes

### 3.1 Environment manager: separate lighting from background

```ts
// EnvironmentManager.ts
async load(file: File | string) {
  const name = typeof file === 'string' ? file : file.name;
  const url = typeof file === 'string' ? file : URL.createObjectURL(file);
  const loader = /\.exr$/i.test(name)
    ? new EXRLoader().setDataType(THREE.HalfFloatType)
    : new RGBELoader();            // check import path for the installed three version
  const tex = await loader.loadAsync(url);
  tex.mapping = THREE.EquirectangularReflectionMapping;   // linear data: do NOT set sRGB colorSpace
  if (typeof file !== 'string') URL.revokeObjectURL(url);

  const pmrem = new THREE.PMREMGenerator(this.renderer);
  const envRT = pmrem.fromEquirectangular(tex);
  pmrem.dispose();

  this.scene.environment?.dispose?.();
  this.scene.environment = envRT.texture;   // lighting and reflections ONLY
  this.backgroundTexture = tex;             // original, sharp texture kept for visible background
}

apply(s: RenderSettings) {
  const sc = this.scene;
  sc.environmentIntensity = s.environment.intensity;   // default 1.0, range 0..3
  sc.backgroundIntensity = 1.0;
  sc.backgroundBlurriness = 0;
  sc.environmentRotation.y = THREE.MathUtils.degToRad(s.environment.rotation);
  sc.backgroundRotation.y  = sc.environmentRotation.y;

  switch (s.environment.backgroundMode) {
    case 'solid':       sc.background = new THREE.Color(s.environment.backgroundColor); this.renderer.setClearAlpha(1); break;
    case 'hdri':        sc.background = this.backgroundTexture; this.renderer.setClearAlpha(1); break;
    case 'transparent': sc.background = null; this.renderer.setClearAlpha(0); break;
  }
}
```

### 3.2 Replace the two background checkboxes with one selector
Remove "Show Background" and "Transparent Background". Add a single **Background** dropdown:

| Mode | Behaviour |
|---|---|
| `solid` (default, `#454545`, color picker) | HDRI lights the scene but is invisible. Matches the expected image. |
| `hdri` | Sharp original HDRI visible, with a blur slider (0 to 1). |
| `transparent` | PNG with alpha. Only the shadow remains semi-transparent. |

The viewport and the final render must honour the same mode. For `transparent`, make sure the whole final pipeline preserves alpha (see §3.8).

### 3.3 Material normalization at import (`FBXImporter.ts`)
Convert every FBX material to `MeshStandardMaterial` with sane PBR defaults:

- Keep `color`, `map`, `normalMap` (FBX often stores normals in `bumpMap`; keep it as bump if no normal map), `aoMap`, `emissive`, `emissiveMap`, `opacity`/`transparent`, `side`, `name`, vertex colors.
- Defaults when unknown: `metalness = 0`, `roughness = 0.55`. Use source roughness/metalness maps if they exist.
- Albedo/color maps: `colorSpace = SRGBColorSpace`; data maps (normal, roughness, AO): leave linear. Set `anisotropy` from the atlas-quality setting.
- **Albedo clamp (setting, default ON, max 0.85):** if a material's color is near pure white (all channels > 0.9) and has no `map`, multiply color by `0.85`. Real white plastic reflects about 80 to 90 percent, and a perfect 1.0 clips under any bright light. Expose it as "Clamp white albedo" in the panel.
- Log a `console.table` of all materials at import (name, original type, color hex, which maps exist). This is needed for debugging.

### 3.4 Lighting and exposure defaults
- Tone mapping default: `THREE.NeutralToneMapping` (Khronos PBR Neutral), which preserves material colors better than ACES. Keep AgX and ACES as options.
- `exposure = 1.0`, `environmentIntensity = 1.0`.
- Default key light: directional, intensity about `2.0`, azimuth 35°, elevation 45°. No extra ambient light. The HDRI provides fill.
- Add a **"Studio Soft" preset** with these values and make it the startup default. Provide "Reset lighting".
- Add an **Auto exposure** button: render a small low-res frame, measure the model-region median luminance, and set exposure so the median lands near 0.75 (sRGB). Optional but useful.

### 3.5 Shadows
- **Shadow catcher:** replace the visible ground with `ShadowMaterial({ opacity: 0.35 })` on a large plane (about 8x the model footprint) at `y = bbox.min.y - groundOffset`. Add a `Ground offset` slider (default 0). Add a `Shadow opacity` slider.
- **Frustum fit:** compute the model bounding box corners in light space and size the shadow camera to them **plus 25% margin**, so shadows are never clipped. Re-fit whenever the light or model transform changes.
- `shadow.bias ≈ -0.0005`, `shadow.normalBias ≈ 0.02 × modelSize`. Tune on the model to avoid acne and peter-panning.
- **Soft shadows in the final render via light jitter:** for each accumulation sample `i` of `N`, offset the light direction inside a cone of `shadowSoftness` degrees (use a Vogel disc or Halton sequence, deterministic per sample). Averaging the samples produces a smooth penumbra for free. In the viewport use `PCFSoftShadowMap` with a modest `shadow.radius`.

### 3.6 Ambient occlusion (needed to match the expected look)
- Add **GTAO** (`GTAOPass` from three examples) to the **final render only**, via `EffectComposer`. Viewport AO is an optional toggle, default off.
- Panel controls: AO on/off, radius, intensity.
- **Critical:** screen-space AO samples outside the tile and creates visible **seams** on tile borders. Render each tile with **overscan padding** (default 96 px, at least 2x the AO radius in pixels) via `setViewOffset` on the enlarged region, then **crop** the padding when stitching.
- If GTAO quality or performance at 8K is poor, cap AO at 4K and say so in the UI.

### 3.7 Helpers and gizmos
- Find and remove any `scene.add(viewHelper)`, `AxesHelper`, or sprite-label axes in the main scene. Search the codebase for `ViewHelper`, `AxesHelper`, and any sprite with text "X", "Y", "Z".
- Orientation widget: use `ViewHelper` correctly, drawn after the main render into a corner viewport:

```ts
const viewHelper = new ViewHelper(camera, renderer.domElement);  // NOT added to the scene
// in the render loop, after renderer.render(scene, camera):
renderer.autoClear = false;
viewHelper.render(renderer);
renderer.autoClear = true;
```

- `TransformControls`: keep it, but set a fixed on-screen `size` (about 0.8) and make sure it is **not** a child of the scaled model root.
- **Helper registry:** keep every helper object (transform gizmo, grid, shadow-camera helper, safe frame, etc.) in one `HelperRegistry`. `OfflineRenderer` must hide all of them before rendering and restore them after, including on cancel or error (`try/finally`). The final image must never contain a helper.
- Pivot: place the model root's origin at the **bottom-center of its bounding box**, so the gizmo sits there.

### 3.8 Offline renderer consistency (`OfflineRenderer.ts`)
- Use the **same** tone mapping, exposure, environment, light, shadow and AO settings as the viewport. Build both from the same `RenderSettings` through one shared `applyRenderSettings(renderer, scene, camera, settings)` function so they cannot drift.
- **Preferred pipeline:** accumulate in a half-float render target in **linear** space with weights `1/N`, then run a final `OutputPass` (tone mapping plus sRGB conversion) on the averaged result before reading pixels. This avoids tone-mapping or averaging in the wrong space.
- **Acceptable fallback for the prototype:** render each sample straight to the offscreen renderer's canvas (tone mapped), copy it with `drawImage` into the accumulation canvas using `globalAlpha = 1/(i+1)`. State this choice in `DECISIONS.md`.
- Anti-aliasing jitter must be **sub-pixel** (offset the `setViewOffset` origin by a fraction of a pixel per sample).
- **Alpha:** in `transparent` mode keep premultiplied alpha through accumulation and export (`WebGLRenderer({ alpha: true })`, `premultipliedAlpha` handled consistently, PNG with alpha). Only the shadow should be semi-transparent.
- Run a **self-check before export:** render a 64x64 test at N=1 and N=16 and assert the mean luminance differs by less than 1%. If not, show an error instead of exporting a broken image.

## 4. Settings changes (`types/settings.ts`)

```ts
environment: {
  hdri: string;
  intensity: number;            // default 1.0
  rotation: number;
  backgroundMode: 'solid' | 'hdri' | 'transparent';   // default 'solid'
  backgroundColor: string;      // default '#454545'
  backgroundBlur: number;       // hdri mode only
};
materials: { clampWhiteAlbedo: boolean; albedoMax: number };   // true, 0.85
shadow:   { opacity: number; groundOffset: number; softness: number };  // 0.35, 0, 3
ao:       { enabled: boolean; radius: number; intensity: number };       // final render on
camera:   { toneMapping: 'Neutral' | 'AgX' | 'ACES' | 'None' };         // default 'Neutral'
```

Remove `showBackground` and `transparentBackground` and migrate any code using them.

## 5. Default look ("Studio Soft")

| Setting | Value |
|---|---|
| Background | solid `#454545` |
| Environment intensity | 1.0 |
| Key light | directional, 2.0, azimuth 35°, elevation 45°, softness 3° |
| Tone mapping / exposure | Neutral / 1.0 |
| White albedo clamp | on, 0.85 |
| Shadow catcher opacity | 0.35 |
| AO (final render) | on |
| Pixel quality (final) | 16 samples |

## 6. Acceptance tests

Load the same FBX used in `current_render.png` and render at 2K, 4K and (if the GPU allows) 8K.

- [ ] **A1 Exposure:** in the model region, at most 1% of pixels are at or above 250 (8-bit) and the median luminance is roughly 170 to 225. The form is readable: visible shading gradient on large surfaces.
- [ ] **A2 Background:** in `solid` mode the four corners of the render are `#454545` within ±2. In `transparent` mode the corners have alpha 0.
- [ ] **A3 No helpers:** the final PNG contains no gizmo, axes, grid, or safe-frame pixels. `HelperRegistry` reports all helpers hidden during the render and restored afterwards (also after a cancel).
- [ ] **A4 Gizmo:** the viewport shows only the small transform gizmo at the model's bottom-center, plus the orientation widget in the corner. No oversized axes anywhere.
- [ ] **A5 HDRI:** with `hdri` mode on, the background is sharp and recognisable. Rotating the HDRI moves the reflections on glossy parts consistently with the background. With `solid` mode, reflections still show the HDRI.
- [ ] **A6 Shadow:** the shadow is soft, not clipped, with no hard straight edge, and has a visible penumbra.
- [ ] **A7 AO:** recesses and part junctions are visibly darker than open surfaces.
- [ ] **A8 Consistency:** a 1K render and the viewport (downscaled) have mean luminance within 5% of each other. N=1 and N=64 renders have mean luminance within 1%.
- [ ] **A9 Seams:** a 4K render with 512 px tiles and one with 2048 px tiles differ by less than 1 level on average, with no visible seams.
- [ ] **A10 Side by side:** put `expected.jpeg` and the new render next to each other and report the remaining visible differences honestly in `DECISIONS.md`.

## 7. Debug tools to add (`?debug=1`)

- **Equirect viewer:** shows the raw loaded HDRI as a flat image, and logs its width, height, data type, mapping, and color space. Use it to confirm D1 cause #2.
- **Histogram overlay** of the last render, with the clipped-pixel percentage.
- **Material table** (see §3.3) and a list of all registered helpers.
- **Render config dump** printing the exact renderer, tone mapping, exposure, and accumulation settings used by both the viewport and the offline renderer, to expose any mismatch (D3 causes #3 and #4).

## 8. Order of work

1. Add the debug tools (§7) and reproduce D1, D2, D3. Record the confirmed root causes in `DECISIONS.md`.
2. Fix helpers and the orientation widget (§3.7). This is the easiest win.
3. Environment manager and background modes (§3.1, §3.2, §4).
4. Material normalization and the lighting and exposure defaults (§3.3, §3.4). This alone should cure most of the white-out.
5. Shadow catcher, frustum fit, and soft shadows (§3.5).
6. Offline renderer consistency and alpha (§3.8).
7. AO with tile overscan (§3.6).
8. Panel overflow fix and pivot placement. Run all tests in §6.

## 9. Honest expectation and fallback

`expected.jpeg` looks like it came from a ray-traced or global-illumination renderer. Rasterized PBR with image-based lighting, AO, and accumulated soft shadows can get close but will not reproduce inter-object light bounce exactly. If after §8 the result is still clearly flatter than the reference (A10), do **not** keep tuning blindly. Report it, and propose an optional **Path Trace** mode using `three-gpu-pathtracer` as the next phase. Do not implement it in this pass.

## 10. Definition of done

- [ ] D1, D2, D3 and D4 are all reproduced and then verified fixed
- [ ] Acceptance tests A1 to A9 pass, A10 is documented
- [ ] `npm run build` passes with no TypeScript errors and no console errors at runtime
- [ ] `DECISIONS.md` records confirmed root causes and every assumption
- [ ] No regressions in import, gizmo transforms, camera bookmarks, or the loading overlay