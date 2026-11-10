import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { appState } from '../app/state';
import { showToast } from '../ui/toast';

export class EnvironmentManager {
  private _scene: THREE.Scene;
  private _renderer: THREE.WebGLRenderer;
  private _pmremGenerator: THREE.PMREMGenerator;
  private _envTexture: THREE.Texture | null = null;   // PMREM filtered (lighting / reflections)
  private _sharpTexture: THREE.Texture | null = null; // Unfiltered sharp equirectangular (skybox)
  private _currentHdri = '';

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    this._scene = scene;
    this._renderer = renderer;
    this._pmremGenerator = new THREE.PMREMGenerator(renderer);
    this._pmremGenerator.compileEquirectangularShader();

    appState.subscribe(s => this._applySettings(s.environment));
  }

  async loadHDRI(url: string, fileName = ''): Promise<void> {
    if (url === this._currentHdri) return;
    this._currentHdri = url;

    const lowerName = (fileName || url).toLowerCase();
    const isExr = lowerName.endsWith('.exr') || lowerName.includes('.exr');

    let texture: THREE.Texture | null = null;
    let loadErr: Error | null = null;

    if (isExr) {
      // Try EXR loader first
      try {
        const loader = new EXRLoader();
        texture = await loader.loadAsync(url);
      } catch (err) {
        // Fallback to RGBELoader just in case
        try {
          const rgbe = new RGBELoader();
          texture = await rgbe.loadAsync(url);
        } catch {
          loadErr = err as Error;
        }
      }
    } else {
      // Try RGBE (HDR) loader first
      try {
        const loader = new RGBELoader();
        texture = await loader.loadAsync(url);
      } catch (err) {
        // Fallback to EXRLoader if RGBE fails (e.g. user selected .exr with blob URL)
        try {
          const exr = new EXRLoader();
          texture = await exr.loadAsync(url);
        } catch {
          loadErr = err as Error;
        }
      }
    }

    if (!texture) {
      console.error('Failed to parse HDRI/EXR file:', loadErr);
      showToast(`Failed to load ${fileName || 'HDRI'}: ${(loadErr as Error)?.message || 'Format unsupported'}`, 'error');
      this._useFallbackEnv();
      return;
    }

    try {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      texture.needsUpdate = true;

      // Keep original sharp texture for visible skybox
      this._sharpTexture?.dispose();
      this._sharpTexture = texture;

      // Generate pre-filtered PMREM texture for diffuse/specular irradiance
      const envMap = this._pmremGenerator.fromEquirectangular(texture).texture;
      this._envTexture?.dispose();
      this._envTexture = envMap;

      this._applySettings(appState.settings.environment);

      if (fileName) {
        showToast(`Loaded environment: ${fileName}`, 'success');
      }
    } catch (e) {
      console.error('PMREM generation error:', e);
      showToast(`Error processing environment map: ${(e as Error).message}`, 'error');
      this._useFallbackEnv();
    }
  }

  private _useFallbackEnv(): void {
    const room = new RoomEnvironment();
    const envMap = this._pmremGenerator.fromScene(room, 0.04).texture;
    room.dispose();

    this._envTexture?.dispose();
    this._sharpTexture?.dispose();
    this._envTexture = envMap;
    this._sharpTexture = null; // No sharp skybox for room environment

    this._applySettings(appState.settings.environment);
  }

  private _applySettings(env: typeof appState.settings.environment): void {
    if (!this._envTexture) return;

    // Apply IBL lighting & reflections
    this._scene.environment = this._envTexture;
    this._scene.environmentIntensity = env.intensity;
    this._scene.environmentRotation = new THREE.Euler(0, THREE.MathUtils.degToRad(env.rotation), 0);

    // Apply background
    if (env.showBackground && this._sharpTexture) {
      // Real loaded HDRI / EXR: show crisp equirectangular skybox
      this._scene.background = this._sharpTexture;
      this._scene.backgroundRotation = new THREE.Euler(0, THREE.MathUtils.degToRad(env.rotation), 0);
    } else {
      // Fallback procedural environment or user unchecked "Show Background": neutral dark studio
      this._scene.background = new THREE.Color(0x1e1e1e);
    }
  }

  dispose(): void {
    this._envTexture?.dispose();
    this._sharpTexture?.dispose();
    this._pmremGenerator.dispose();
  }
}
