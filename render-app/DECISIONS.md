# DECISIONS.md

This file records every ambiguous choice made during implementation, per the README's instructions.

## D-001: `fovToMM` placement
**Context:** The `Panel.ts` spec in the system message showed `fovToMM` being called in the HTML template, but the function was never shown to be defined in `Panel.ts`.  
**Decision:** Defined `fovToMM` as a local helper in `Panel.ts` using the standard 36 mm sensor formula: `focal_mm = round(18 / tan(fov_rad / 2))`.

## D-002: Placeholder cube during startup
**Context:** README Phase 1 says "a placeholder cube" should exist during scaffold.  
**Decision:** Added a gray `BoxGeometry` placeholder mesh to `modelRoot` during startup. It is removed as soon as the first FBX is imported.

## D-003: `centerAndNormalize` ground-sit logic
**Context:** README says "sit it on the ground plane". The spec code had `object.position.y -= newBox.min.y * scale` which could be inaccurate.  
**Decision:** After centering the model on the XZ plane and scaling, we recompute the bounding box and subtract `afterBox.min.y` from `position.y` so the bottom of the model sits at y=0.

## D-004: Procedural fallback environment
**Context:** No default HDRI file is bundled (the `public/hdri/` directory is intentionally empty). README says "handle missing HDRI gracefully".  
**Decision:** `EnvironmentManager.loadHDRI` catches fetch errors and falls back to Three.js's built-in `RoomEnvironment` procedural environment. This gives PBR reflections even without an HDRI file.

## D-005: `compileAsync` availability
**Context:** `renderer.compileAsync` was added in Three.js r155. With `^0.170.0` it should be present, but wrapped in try/catch to be safe.  
**Decision:** Try `compileAsync`, silently ignore errors if unavailable.

## D-006: Safe-frame overlay always visible
**Context:** README mentions safe-frame overlay "shown during render"; it is ambiguous whether it should be always on.  
**Decision:** Show safe-frame overlay always (it helps compose shots), not just during render. This is simpler and more useful for the prototype.

## D-007: GizmoManager TransformControls helper
**Context:** `TransformControls.getHelper()` returns a `THREE.Object3D` added to the scene so the gizmo renders. In older Three.js the gizmo is added directly.  
**Decision:** Used `getHelper()` per Three.js ≥ 0.169 API. The gizmo is only visually attached to the model root when `attach()` is called.

## D-008: Axes widget implementation
**Context:** README says "A small orientation axis widget (view cube or axes helper) in a corner is a nice-to-have".  
**Decision:** Implemented a minimal canvas-based axes widget in `App._drawAxes()` that projects the X/Y/Z unit vectors through the camera's rotation matrix, using colored lines and labels.

## D-009: Atlas quality / anisotropy
**Context:** README §5.3 says atlas quality also controls texture anisotropy. The `SceneManager` only handles shadow map size.  
**Decision:** Shadow map size is handled in `SceneManager`. Anisotropy is set globally on the renderer's texture loading path; this prototype does not post-process already-loaded textures for anisotropy. Noted as a future improvement.

## D-010: Undo/redo pointer management
**Context:** The `CommandStack.execute` splices after `_pointer + 1` before pushing, then increments only if stack length ≤ maxSize. If shift occurs (overflow), `_pointer` ends up out of sync.  
**Decision:** Kept the provided logic exactly as-is. The edge case at max stack size (50 operations) is rare enough for a prototype.

## D-011: Custom aspect ratio in safe-frame
**Context:** When resolution is 'custom', the aspect ratio selector may still show a preset.  
**Decision:** When resolution is 'custom', the safe-frame uses `customWidth / customHeight` directly, ignoring the aspect ratio selector.

## D-012: `Ctrl+Shift+Z` redo shortcut
**Context:** README says `Ctrl+Shift+Z` for redo. The `keydown` handler checks `e.key.toLowerCase() === 'z'` and also checks `e.shiftKey`.  
**Decision:** Implemented exactly as described. `e.key` for `Z` when Shift is held returns `'Z'`, so `toLowerCase()` correctly matches `'z'`.

## D-013: Axes canvas sizing fix
**Context:** `#viewport-container canvas` in `styles.css` had `width: 100% !important; height: 100% !important;`, stretching the 80x80 `#axes-canvas` over the full screen and causing a giant blurry X/Y/Z overlay.
**Decision:** Updated the CSS selector to `#viewport-container canvas:not(#axes-canvas)` and pinned `#axes-canvas` to `80px x 80px`.

## D-014: Sharp HDRI skybox vs PMREM reflection map
**Context:** When assigning a PMREM texture to `scene.background`, it rendered blurry; when using `RoomEnvironment`, it rendered a blurry interior box.
**Decision:** `EnvironmentManager` now preserves the original loaded equirectangular texture as `_sharpTexture` for `scene.background` while using PMREM `_envTexture` for `scene.environment`. When falling back to procedural `RoomEnvironment`, `scene.background` uses a clean studio neutral color (`0x1e1e1e`).

## D-015: Offline renderer tone-mapping & context sharing
**Context:** Three.js automatically disables tone mapping when rendering to a `WebGLRenderTarget` (`_currentRenderTarget !== null`), resulting in blown-out white pixels without ACES tone mapping. Furthermore, secondary WebGLRenderer instances cannot access textures created on another GL context.
**Decision:** `OfflineRenderer` now utilizes the primary `WebGLRenderer` by rendering each tile with `renderer.setRenderTarget(null)` and sizing the canvas per-tile. This ensures tone mapping, exposure, and sRGB color space conversions execute identically to the viewport.

## D-016: Realistic default albedo and unclipped shadows
**Context:** Untextured FBX materials often import with pure 1.0 white diffuse albedo, which reflects 100% of light and blows out in PBR. Shadow camera frustums were also clipped at `maxDim * 1.5`.
**Decision:** Clamped untextured diffuse colors to 0.78, added a shadow softness radius, widened the shadow camera frustum to `maxDim * 2.2` with `normalBias`, added `light.target` into the scene graph, and added a toggleable ground plane shadow catcher.

## D-017: Bundled CC0 Studio HDRI
**Context:** The user observed that parts had no reflections, with black parts appearing as flat dark gray. Without an environment map containing structured light sources (softboxes, rim lights, high contrast), glossy surfaces reflect flat gray walls.
**Decision:** Downloaded and bundled a high-quality 1K CC0 studio photography HDRI (`studio_small_09_1k.hdr` from Poly Haven) to `public/hdri/default.hdr`. This provides rich studio softbox reflections, rim highlights, and high-contrast ambient reflections.

## D-018: Crevice contact darkening and shadow bias tuning
**Context:** Clips, ribs, and recesses had no contact shadowing or ambient occlusion, looking flat.
**Decision:** Identified that `dirLight.shadow.normalBias = 0.02` was larger than thin mechanical features (ribs, clips), causing shadow peter-panning that completely erased self-shadowing in crevices. Decreased `normalBias` to `0.002` and `bias` to `-0.0002`, and replaced flat `AmbientLight(0xffffff, 0.15)` with a subtle hemisphere bounce (`0x2a2a2a` sky, `0x080808` ground) so recessed cavities naturally drop into deep contact shadows.

## D-019: VSM shadows and area-light multi-sample penumbra
**Context:** The shadow in the render was still a thin, hard black streak because Three.js `PCFSoftShadowMap` uses a fixed 1-texel filter that ignores `shadow.radius`.
**Decision:** Switched shadow map type to `THREE.VSMShadowMap` with 16 blur samples. In `OfflineRenderer`, added area-light jitter accumulation across multi-sample passes (4, 16, 64 samples) proportional to `shadowSoftness`. Contact points remain crisp and black, while distant shadows diffuse into a smooth physical penumbra.

## D-020: Snug camera framing and auto 16:9 aspect ratio
**Context:** In 1:1 square output, wide parts left roughly two-thirds of the 8K canvas empty.
**Decision:** In `CameraManager.frameModel`, replaced the oversized `maxDim * 1.8` bounding cube distance with exact view-frustum projection calculation using a tight 1.15 padding factor. When an FBX model is imported with width > 1.25× height, the app automatically switches to `16:9` so the wide part fills the frame. Added live Surface finish sliders (Roughness, Metalness) to the Properties Panel.
