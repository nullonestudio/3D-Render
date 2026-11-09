import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { appState } from '../app/state';

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

  async loadHDRI(url: string): Promise<void> {
    if (url === this._currentHdri) return;
    this._currentHdri = url;
    try {
      const loader = new RGBELoader();
      const texture = await loader.loadAsync(url);
      texture.mapping = THREE.EquirectangularReflectionMapping;

      // Keep original sharp texture for background
      this._sharpTexture?.dispose();
      this._sharpTexture = texture;

      // Generate pre-filtered PMREM texture for diffuse/specular irradiance
      const envMap = this._pmremGenerator.fromEquirectangular(texture).texture;
      this._envTexture?.dispose();
      this._envTexture = envMap;

      this._applySettings(appState.settings.environment);
    } catch {
      console.warn('HDRI not found, using procedural environment:', url);
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
      // Real loaded HDRI: show crisp equirectangular skybox
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
