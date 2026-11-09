# Render App: Quality Pass v0.3 (AO + Realistic Reflections)

> **Instructions for the AI agent:** The app now produces clean 8K renders (tiling, accumulation, tone mapping and helper hiding work). **Do not break any of that.** This pass adds the missing ingredients of a realistic render: ambient occlusion, believable reflections, soft shadows, and an optional path-traced **Ultra** mode. Read the whole file, study the reference renders, check the current state of each item in §2 before changing code (some may be half-implemented from `README_FIXES.md`), then follow the order in §9. Log every assumption and every library version you pick in `DECISIONS.md`.

## 0. Reference files (user must place these in the repo)

```
docs/reference/
├── expected.jpeg                        # target LOOK (different model; match lighting, AO, shadow, finish)
├── render_8k_20261109_113148.png        # current 8K output A
└── render_8k_20261109_113416.png        # current 8K output B
```

If any file is missing, ask the user to add it before starting.

## 1. What "realistic" means here (measurable descriptors)

Compared with `expected.jpeg`, the target render has:

1. **Ambient occlusion:** soft darkening where parts meet, inside the clip hooks, under ribs, and in recesses. Open flat areas stay bright.
2. **Reflections with structure:** glossy and black plastic parts show soft, large, smooth highlights and gradients that clearly come from studio light sources (softboxes), not a flat uniform color.
3. **Soft, grounded shadow:** wide penumbra, low contrast, no hard black edges.
4. **Material finish:** plastic has a subtle satin or clear-coat sheen. Edges catch light (Fresnel), so the form reads.
5. **No clipping, neutral color,** same as `README_FIXES.md` §6 A1 and A2.

## 2. Observed state of the current 8K renders (verify, then fix)

| # | Observation | Consequence |
|---|---|---|
| Q1 | No contact darkening anywhere: clip hooks, comb ribs and panel recesses are shaded only by direct light. | Surfaces look flat and "cut out". Either AO is missing, off, or too weak. |
| Q2 | The black parts are a uniform dark gray with no highlight gradient. The light parts show no sheen. | The material is rough and/or the environment has no structure to reflect (uniform white or a blurry gradient). A mirror-like finish in a blank environment shows nothing. |
| Q3 | The shadow is a thin, very dark, hard-edged streak (worst in the second render, bottom-left). | `shadowSoftness` / light-jitter soft shadows are not active, or the catcher opacity is too high. |
| Q4 | The 1:1 frame leaves roughly two thirds of the image empty. The subject is wide and short. | Most of the 8K pixels are wasted. A tight crop is worth more than extra resolution. |
| Q5 | The background reads as white. | Confirm which background mode produced these. If it is `transparent`, that is fine. If `solid`, check the color against the expected `#454545`. |

## 3. Decision: three quality modes

Rasterization with environment lighting cannot truly compute occlusion or reflections of the object on itself. Screen-space tricks approximate them. A path tracer computes them physically. So the app gets three explicit modes sharing one scene and one `RenderSettings` object:

| Mode | Engine | Use | AO / reflections |
|---|---|---|---|
| **Fast** | Current raster pipeline | Viewport and quick exports | Environment reflections, no AO |
| **High** | Raster plus GTAO plus accumulated soft shadows plus physical materials plus a structured studio environment | Default final render | Good AO, convincing environment reflections |
| **Ultra** | Path tracer (`three-gpu-pathtracer`) | Beauty renders | Physically correct AO, reflections, soft shadows, light bounce |

**Challenge to consider:** for a mostly gray plastic part, the biggest perceived-quality jump comes from AO, soft shadow and a structured environment, **not** from more pixels. 4K cropped to the subject with good lighting will look better than 8K of a flat render. Make High the default and treat Ultra as the "best quality" option, not the default.

## 4. Required changes

### 4.1 Physical materials (needed by every mode)

- Convert the normalized `MeshStandardMaterial`s to `MeshPhysicalMaterial` (copy all maps and properties).
- Add a global **Surface finish** preset and a per-material override list in a new "Materials" panel section.

| Preset | roughness | clearcoat | clearcoatRoughness | specularIntensity |
|---|---|---|---|---|
| Original (current values) | as imported | 0 | n/a | 1 |
| Matte plastic | 0.70 | 0 | n/a | 0.8 |
| **Satin plastic (default)** | 0.45 | 0.15 | 0.35 | 1 |
| Glossy plastic | 0.25 | 0.6 | 0.1 | 1 |

- Add a **Finish** slider (global roughness multiplier 0.3 to 1.5) applied on top of the preset.
- **Dark materials (black and very dark gray) must use the glossy values by default** regardless of the preset (roughness about 0.28, clearcoat 0.5). Black plastic shows reflections best, and it is the quickest way to make the render look real.
- Per-material overrides: list each material by name with color, roughness, metalness, clearcoat. Overrides persist while the model stays loaded.
- Keep the white-albedo clamp from `README_FIXES.md` (§3.3). Do not clamp dark colors upward.
- Use `ior = 1.46` for plastic. Do not enable transmission unless a material is actually transparent.

### 4.2 Studio environment (reflection quality depends on this)

Reflections are only as good as what there is to reflect. Add an **Environment source** selector:

| Source | Behaviour |
|---|---|
| **Procedural studio (default)** | A small scene of emissive rectangular softboxes on a dark gray room, converted to an environment with `PMREMGenerator.fromScene`. |
| Room | three's `RoomEnvironment`, as a quick fallback. |
| HDRI file | User-loaded `.hdr` / `.exr`, as already implemented. |

Procedural studio requirements:
- Default layout: one large key softbox (upper left), one strip light (right), one dim fill (low front), each emissive with intensities above 1 so reflections have real contrast.
- Panel controls: for each softbox position/azimuth, elevation, width, height, intensity, color. Add and remove softboxes (max 6).
- Environment visibility is independent from the background: the studio lights the scene and appears in reflections while the background stays `solid` / `transparent` (see `README_FIXES.md` §3.2).
- Ship 2 to 3 small CC0 studio HDRIs (2K, for example from Poly Haven; record source and license in `docs/CREDITS.md`) so the HDRI option has good content out of the box. Do not downscale a loaded HDRI below 2K.
- The same environment must feed all three modes (for Ultra, convert it to an equirectangular texture, or add the softboxes as emissive meshes; check what the path tracer supports).

### 4.3 AO and soft shadows in the High mode

First check what already exists from the previous pass and what is actually active. If GTAO is already wired in and the effect is invisible, find out why before adding anything new (usual causes: radius far too small or large for the model scale, intensity too low, AO pass output not blended, pass skipped in the offline path).

- **GTAO** (`GTAOPass`) in the offline renderer, enabled in High mode. Radius is relative to model size: default about 2% of the bounding-box diagonal (slider 0.5% to 6%). Intensity slider 0 to 2, default 1.
- **Tile overscan is mandatory** for any screen-space effect: render each tile with padding (default 128 px at 8K, at least twice the AO radius in pixels) and crop it when stitching. Verify with test A6.
- AO is applied to ambient/environment lighting only where the library allows it. If it can only multiply the final color, keep the intensity moderate so direct highlights are not crushed.
- **Soft shadows by accumulation:** per sample, jitter the light direction inside a cone of `shadowSoftness` degrees (Vogel disc or Halton, deterministic). Default softness 4°. Combine with a catcher opacity of 0.3 (see Q3). The shadow penumbra must scale with the distance from the occluder to the ground, which jittering gives for free.
- Optional but recommended: a faint **contact shadow** (very short-radius occlusion where an object touches the ground) so a grounded subject does not float.
- **Reflection quality:** use the PMREM from §4.2 with `environmentIntensity` default 1.0. Do not use `envMapIntensity` hacks per material except through the override list.
- Both AO and soft shadows are final-render features. The viewport keeps cheap shadows and optional low-quality AO (toggle, default off).

### 4.4 Ultra mode: path tracing (`three-gpu-pathtracer`)

Add an **Ultra** option in the Quality section. It uses the `three-gpu-pathtracer` library (check its README and `examples` folder inside `node_modules` for the exact API of the installed version; **do not guess property names**).

Integration requirements:
1. Pin compatible versions of `three`, `three-mesh-bvh` and `three-gpu-pathtracer` (read their peer dependency ranges). Record the choice in `DECISIONS.md`. If the installed `three` conflicts, use the version range the library supports rather than patching the library.
2. Build the path-traced scene from the **same** scene object (model, lights, environment, ground). Sync material, light, camera and environment changes into the tracer when settings change.
3. Build the BVH **asynchronously** with progress reported to the loading overlay (use the library's async scene setup and its worker support if available). The BVH build can freeze the page on heavy FBX files.
4. Settings (defaults): samples preset **Draft 64 / Good 256 / Final 1024**, bounces 5, glossy filtering about 0.5 to suppress fireflies, multiple importance sampling on.
5. Progressive display: show the path-traced image converging in the viewport (small preview) and a progress bar `sample 112/256` with Cancel. Cancel must free all GPU resources.
6. **Memory and 8K strategy** (important): an 8K float target is roughly 530 MB (7680 x 4320) to 940 MB (1:1) and will fail on many GPUs.
   - Query the safe maximum macro-tile size from `renderer.capabilities` and a small allocation probe.
   - Render each **macro tile** (default 2048 or 4096 px, whichever is safe) to completion by using `camera.setViewOffset(...)` and updating the tracer camera, read it back, and stitch it into the final canvas exactly like the existing tiler.
   - If the library does not honour view offsets, fall back to rendering at the largest safe size and tell the user the output was capped, with a clear message. Do not silently upscale.
   - Path tracing has no screen-space effects, so there are no AO seams, but verify the macro-tile borders anyway (A6).
7. **Tone mapping and color:** apply the same tone mapping and exposure as High mode in a final output step so the two modes look alike. Check `README_FIXES.md` §3.8 for the render-target tone mapping caveat.
8. **Background and alpha:** support `solid` mode. If the library cannot produce a clean shadow catcher for `transparent` mode, use a large matte ground plane whose color equals the solid background color, and disable `transparent` for Ultra with a note in the UI. Do not ship a broken transparent mode.
9. Show an estimated time after the first few samples (based on measured sample rate) before the user commits to a long Final render.
10. Do not add an external denoiser. If the library ships a simple denoise pass, expose it as a toggle; otherwise rely on sample count.

### 4.5 Framing: stop wasting pixels

- Add a **Frame to subject** button and a **Fit margin** setting (default 6% of the frame). It sets the camera distance so the model's projected bounding box fills the frame minus margins for the current aspect ratio.
- Add an **Auto aspect** option: pick the aspect ratio closest to the subject's projected bounding box (for example 3:1 or 16:9 for wide parts).
- Keep the safe-frame overlay in sync. The final render must match the safe frame exactly.

### 4.6 UI additions (Quality section)

- Quality mode: Fast / High / Ultra (default High).
- High: AO on/off, AO radius, AO intensity, shadow softness, shadow opacity, samples (16/64/256).
- Ultra: samples preset, bounces, glossy filter, estimated time.
- Materials: preset, Finish slider, per-material overrides.
- Environment: source selector, softbox editor, HDRI picker.
- Framing: Frame to subject, margin, Auto aspect.
- Show a small caption of what each mode costs (for example "Ultra: slow, physically accurate").

## 5. Settings changes (`types/settings.ts`)

```ts
quality: {
  mode: 'fast' | 'high' | 'ultra';        // default 'high'
  pixelQuality: 1 | 4 | 16 | 64 | 256;    // raster samples
  atlasQuality: 'low' | 'medium' | 'high' | 'ultra';
  resolution: '1k' | '2k' | '4k' | '8k' | 'custom';
};
ao:       { enabled: boolean; radiusPct: number; intensity: number; overscanPx: number };  // true, 2, 1, 128
shadow:   { opacity: number; softness: number; groundOffset: number; contact: boolean };  // 0.3, 4, 0, true
materials:{ preset: 'original' | 'matte' | 'satin' | 'glossy'; finish: number;
            darkGlossy: boolean; overrides: Record<string, MaterialOverride> };           // 'satin', 1, true
studio:   { source: 'procedural' | 'room' | 'hdri'; softboxes: Softbox[] };                // 'procedural'
pathTracer: { samples: 64 | 256 | 1024; bounces: number; glossyFilter: number;
              macroTilePx: 'auto' | 2048 | 4096 };                                        // 256, 5, 0.5, 'auto'
framing:  { fitToSubject: boolean; marginPct: number; autoAspect: boolean };              // false, 6, false
```

## 6. Acceptance tests

Use the same FBX as `render_8k_*.png`. Render at 4K (and 8K where the GPU allows).

- [ ] **A1 AO visible:** choose patches at the base of a clip hook and an open flat area nearby. With AO on, the recess patch is at least 12% darker than with AO off, and the open patch changes by less than 2%.
- [ ] **A2 Reflections:** in the glossy-dark preset, a black part region has a luminance standard deviation of at least 6 levels (a visible highlight gradient). With the Matte preset it is visibly lower. Report the numbers.
- [ ] **A3 Shadow:** the shadow penumbra is at least 1.5% of the model width and the darkest shadow pixel is not pure black (at most 75% darkening on a light background).
- [ ] **A4 Finish:** switching Matte, Satin and Glossy changes highlights without changing the base color or clipping the exposure (A1 and A2 from `README_FIXES.md` §6 still pass).
- [ ] **A5 Environment:** moving a softbox moves the reflections on the glossy parts accordingly. The background stays solid.
- [ ] **A6 Seams:** 8K output rendered with two different tile sizes differs by less than 1 level on average, with no visible seams in High and Ultra.
- [ ] **A7 Convergence (Ultra):** two independent 256-sample renders differ by an RMS of at most 3 levels in a flat region. Draft is visibly noisier than Final, Final is clean.
- [ ] **A8 Mode consistency:** the model-region median luminance of High and Ultra renders is within 10%, so switching mode changes realism, not exposure.
- [ ] **A9 Framing:** Frame to subject places the subject's bounding box within the margin on all sides. A wide part rendered at the auto aspect uses at least 60% of the frame area.
- [ ] **A10 Resource safety:** 8K Ultra either completes through macro tiles or stops with a clear "capped at X" or "not enough GPU memory" message. It never hangs the tab, and Cancel frees memory (no growth over 3 render/cancel cycles).
- [ ] **A11 Side by side:** compare each mode with `expected.jpeg` and list remaining differences honestly in `DECISIONS.md`.

## 7. Debug tools (extend `?debug=1`)

- AO-only view (output the occlusion buffer) and a reflection-only view (environment contribution only).
- Environment viewer: show the PMREM / equirect texture the model is actually using, plus softbox layout.
- Path-tracer stats: samples/sec, macro tile size, memory estimate, BVH build time.
- Render config dump per mode (tone mapping, exposure, AO params, jitter cone, samples) to catch High-versus-Ultra drift.

## 8. Non-goals

- Caustics, subsurface scattering, volumetrics, motion blur, animation
- Cloud or server-side rendering
- External denoiser binaries or heavyweight dependencies beyond `three-gpu-pathtracer` and its peer libraries
- A material editor with texture painting

## 9. Order of work

1. Add the debug views and reproduce Q1 to Q5. Note which pieces from `README_FIXES.md` are already active.
2. Physical materials, presets and the Materials panel (§4.1). Visible improvement on black parts immediately.
3. Procedural studio environment and softbox editor (§4.2).
4. Soft shadows by light jitter and catcher tuning (§4.3, fixes Q3).
5. GTAO with overscan padding (§4.3, fixes Q1). Run A1 and A6.
6. Frame to subject and Auto aspect (§4.5, fixes Q4).
7. Ultra mode (§4.4): integration, async BVH, macro tiles, progress, cancel, consistency.
8. UI polish, time estimates, tests A1 to A11, update the project README.

## 10. Honest expectations

- High mode will look clearly better than the current renders (AO, structured reflections, soft shadow) but it still **approximates** occlusion and cannot reflect the object in itself.
- Ultra mode gives physically correct results but is slow, and 8K may be limited by GPU memory. A good laptop GPU should handle 4K Final in minutes; 8K will take much longer, and the app must say so before starting.
- If Ultra proves too slow or unstable in the browser on the target hardware, report the measurements in `DECISIONS.md` instead of hiding it, and propose a desktop path (for example Filament or a native renderer) as a later phase.

## 11. Definition of done

- [ ] Fast, High and Ultra modes selectable, each completing a 4K render
- [ ] A1 to A10 pass, A11 documented
- [ ] No regression in import, tiling, helper hiding, camera bookmarks or the loading overlay
- [ ] `npm run build` passes with no TypeScript errors and no console errors
- [ ] `DECISIONS.md` lists library versions, assumptions and measured render times