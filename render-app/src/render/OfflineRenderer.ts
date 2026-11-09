import * as THREE from 'three';
import { TileStitcher } from './TileStitcher';
import { exportPNG } from './Exporter';
import { RenderSettings } from '../types/settings';
import { appState } from '../app/state';

export type RenderProgress = (tile: number, total: number, pct: number) => void;

const RESOLUTION_MAP: Record<string, number> = {
  '1k': 1024, '2k': 2048, '4k': 4096, '8k': 8192,
};

const ASPECT_MAP: Record<string, [number, number]> = {
  '1:1': [1, 1], '16:9': [16, 9], '4:3': [4, 3], '3:2': [3, 2],
};

function getOutputSize(settings: RenderSettings): { w: number; h: number } {
  const q = settings.quality;
  if (q.resolution === 'custom') {
    return { w: q.customWidth, h: q.customHeight };
  }
  const longEdge = RESOLUTION_MAP[q.resolution] ?? 2048;
  const [aw, ah] = ASPECT_MAP[q.aspectRatio as string] ?? [16, 9];
  if (aw >= ah) {
    return { w: longEdge, h: Math.round(longEdge * ah / aw) };
  } else {
    return { h: longEdge, w: Math.round(longEdge * aw / ah) };
  }
}

const TONE_MAP: Record<string, THREE.ToneMapping> = {
  ACES: THREE.ACESFilmicToneMapping,
  AgX: THREE.AgXToneMapping,
  Neutral: THREE.NeutralToneMapping,
  None: THREE.NoToneMapping,
};

export class OfflineRenderer {
  private _cancelled = false;

  async render(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
    onProgress?: RenderProgress,
    onDone?: () => void,
    onError?: (err: Error) => void,
  ): Promise<void> {
    this._cancelled = false;
    const settings = appState.settings;

    const { w: fullW, h: fullH } = getOutputSize(settings);
    const resLabel = settings.quality.resolution;

    // GPU limit check
    const maxTexSize = renderer.capabilities.maxTextureSize;
    if (fullW > maxTexSize || fullH > maxTexSize) {
      onError?.(new Error(
        `GPU max texture size is ${maxTexSize}px. Requested ${Math.max(fullW, fullH)}px. Try a lower resolution.`,
      ));
      return;
    }

    // Save previous renderer state
    const origSize = new THREE.Vector2();
    renderer.getSize(origSize);
    const origPixelRatio = renderer.getPixelRatio();
    const origToneMapping = renderer.toneMapping;
    const origExposure = renderer.toneMappingExposure;
    const origOutputColorSpace = renderer.outputColorSpace;
    const origClearColor = new THREE.Color();
    renderer.getClearColor(origClearColor);
    const origClearAlpha = renderer.getClearAlpha();
    const origBg = scene.background;
    const origShadowType = renderer.shadowMap.type;

    // Find main directional light for area-light shadow accumulation
    let foundDirLight: THREE.DirectionalLight | null = null;
    scene.traverse((obj) => {
      if (!foundDirLight && obj instanceof THREE.DirectionalLight && obj.castShadow) {
        foundDirLight = obj;
      }
    });
    const dirLight: THREE.DirectionalLight | null = foundDirLight;
    const origLightPos = dirLight ? (dirLight as THREE.DirectionalLight).position.clone() : null;

    // Configure renderer for final render
    const { toneMapping: tm, exposure } = settings.camera;
    renderer.toneMapping = TONE_MAP[tm] ?? THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = exposure;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.type = THREE.VSMShadowMap; // smooth VSM shadow map
    renderer.setPixelRatio(1);
    renderer.setRenderTarget(null);

    // If transparent background is enabled, clear background so alpha is preserved
    if (settings.quality.transparentBackground) {
      scene.background = null;
      renderer.setClearColor(0x000000, 0);
    }

    // Setup rendering camera
    let renderCam: THREE.PerspectiveCamera | THREE.OrthographicCamera;
    if (camera instanceof THREE.PerspectiveCamera) {
      renderCam = camera.clone() as THREE.PerspectiveCamera;
      renderCam.aspect = fullW / fullH;
      renderCam.updateProjectionMatrix();
    } else {
      renderCam = camera.clone() as THREE.OrthographicCamera;
    }

    const TILE = Math.min(1024, fullW, fullH);
    const tilesX = Math.ceil(fullW / TILE);
    const tilesY = Math.ceil(fullH / TILE);
    const totalTiles = tilesX * tilesY;
    const samples = settings.quality.pixelQuality;

    // Area-light jitter simulation radius based on shadowSoftness
    const shadowSoftness = settings.light.shadowSoftness;
    const lightJitterRadius = (samples > 1 && shadowSoftness > 1) ? (shadowSoftness * 0.25) : 0;

    const stitcher = new TileStitcher(fullW, fullH);
    let tileIdx = 0;

    try {
      for (let ty = 0; ty < tilesY; ty++) {
        for (let tx = 0; tx < tilesX; tx++) {
          if (this._cancelled) break;

          const tileX = tx * TILE;
          const tileY = ty * TILE;
          const curW = Math.min(TILE, fullW - tileX);
          const curH = Math.min(TILE, fullH - tileY);

          renderer.setSize(curW, curH, false);

          const tileCanvas = document.createElement('canvas');
          tileCanvas.width = curW;
          tileCanvas.height = curH;
          const tileCtx = tileCanvas.getContext('2d')!;
          tileCtx.clearRect(0, 0, curW, curH);

          for (let s = 0; s < samples; s++) {
            if (this._cancelled) break;

            // Camera sub-pixel spatial jitter
            const jx = samples > 1 ? (Math.random() - 0.5) : 0;
            const jy = samples > 1 ? (Math.random() - 0.5) : 0;

            if (renderCam instanceof THREE.PerspectiveCamera) {
              renderCam.setViewOffset(
                fullW, fullH,
                tileX + jx, tileY + jy,
                curW, curH,
              );
            }

            // Light position jitter: simulates physically true area light penumbra
            if (lightJitterRadius > 0 && dirLight && origLightPos) {
              const dl = dirLight as THREE.DirectionalLight;
              if (s === 0) {
                dl.position.copy(origLightPos);
              } else {
                const ang = Math.random() * Math.PI * 2;
                const rad = Math.sqrt(Math.random()) * lightJitterRadius;
                dl.position.set(
                  origLightPos.x + rad * Math.cos(ang),
                  origLightPos.y + rad * Math.sin(ang) * 0.4,
                  origLightPos.z + rad * Math.sin(ang)
                );
              }
              dl.updateMatrixWorld();
            }

            renderer.clear();
            renderer.render(scene, renderCam);

            if (s === 0) {
              tileCtx.globalAlpha = 1.0;
              tileCtx.drawImage(renderer.domElement, 0, 0);
            } else {
              tileCtx.globalAlpha = 1 / (s + 1);
              tileCtx.drawImage(renderer.domElement, 0, 0);
            }
          }

          stitcher.blitTile(tileCanvas, tileX, tileY);
          tileIdx++;
          onProgress?.(tileIdx, totalTiles, tileIdx / totalTiles);

          // Yield to browser
          await new Promise<void>(r => requestAnimationFrame(() => r()));
        }
        if (this._cancelled) break;
      }

      if (renderCam instanceof THREE.PerspectiveCamera) {
        renderCam.clearViewOffset();
      }

      if (!this._cancelled) {
        const blob = await stitcher.toBlob();
        exportPNG(blob, resLabel);
        onDone?.();
      }
    } catch (err) {
      onError?.(err as Error);
    } finally {
      // Restore light position
      if (dirLight && origLightPos) {
        const dl = dirLight as THREE.DirectionalLight;
        dl.position.copy(origLightPos);
        dl.updateMatrixWorld();
      }

      // Restore renderer to original viewport state
      renderer.setSize(origSize.x, origSize.y, false);
      renderer.setPixelRatio(origPixelRatio);
      renderer.toneMapping = origToneMapping;
      renderer.toneMappingExposure = origExposure;
      renderer.outputColorSpace = origOutputColorSpace;
      renderer.shadowMap.type = origShadowType;
      renderer.setClearColor(origClearColor, origClearAlpha);
      scene.background = origBg;
    }
  }

  cancel(): void {
    this._cancelled = true;
  }
}
