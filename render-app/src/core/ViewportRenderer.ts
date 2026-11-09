import * as THREE from 'three';
import { appState } from '../app/state';

export class ViewportRenderer {
  public renderer: THREE.WebGLRenderer;
  private _canvas: HTMLCanvasElement;
  private _container: HTMLElement;
  private _resizeObserver: ResizeObserver;
  private _animFrameId: number | null = null;
  private _paused = false;

  constructor(container: HTMLElement) {
    this._container = container;
    this._canvas = document.createElement('canvas');
    container.appendChild(this._canvas);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this._canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.VSMShadowMap;

    this._applyToneMapping();
    this._resize();

    this._resizeObserver = new ResizeObserver(() => this._resize());
    this._resizeObserver.observe(container);

    document.addEventListener('visibilitychange', () => {
      this._paused = document.hidden;
    });

    appState.subscribe(() => this._applyToneMapping());
  }

  private _applyToneMapping(): void {
    const { toneMapping, exposure } = appState.settings.camera;
    const map: Record<string, THREE.ToneMapping> = {
      ACES: THREE.ACESFilmicToneMapping,
      AgX: THREE.AgXToneMapping,
      Neutral: THREE.NeutralToneMapping,
      None: THREE.NoToneMapping,
    };
    this.renderer.toneMapping = map[toneMapping] ?? THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = exposure;
  }

  private _resize(): void {
    const w = this._container.clientWidth;
    const h = this._container.clientHeight;
    this.renderer.setSize(w, h, false);
    this._canvas.style.width = '100%';
    this._canvas.style.height = '100%';
  }

  startLoop(renderFn: () => void): void {
    const loop = () => {
      this._animFrameId = requestAnimationFrame(loop);
      if (!this._paused) renderFn();
    };
    loop();
  }

  stopLoop(): void {
    if (this._animFrameId !== null) {
      cancelAnimationFrame(this._animFrameId);
      this._animFrameId = null;
    }
  }

  get size(): { width: number; height: number } {
    return { width: this._canvas.clientWidth, height: this._canvas.clientHeight };
  }

  dispose(): void {
    this.stopLoop();
    this._resizeObserver.disconnect();
    this.renderer.dispose();
  }
}
