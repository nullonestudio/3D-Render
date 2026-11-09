import * as THREE from 'three';
import { ViewportRenderer } from '../core/ViewportRenderer';
import { SceneManager } from '../core/SceneManager';
import { EnvironmentManager } from '../core/EnvironmentManager';
import { CameraManager } from '../core/CameraManager';
import { GizmoManager } from '../core/GizmoManager';
import { importFBX } from '../import/FBXImporter';
import { centerAndNormalize, disposeObject } from '../import/ModelUtils';
import { OfflineRenderer } from '../render/OfflineRenderer';
import { Panel } from '../ui/Panel';
import { LoadingOverlay } from '../ui/LoadingOverlay';
import { Toolbar } from '../ui/Toolbar';
import { appState } from './state';
import { commandStack } from './commands';

// Simple toast utility
function showToast(msg: string, type: 'info' | 'error' | 'success' = 'info', duration = 4000): void {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

export class App {
  private _viewportRenderer: ViewportRenderer;
  private _sceneManager: SceneManager;
  private _envManager: EnvironmentManager;
  private _cameraManager: CameraManager;
  private _gizmoManager: GizmoManager;
  private _panel: Panel;
  private _loading: LoadingOverlay;
  private _toolbar: Toolbar;
  private _offlineRenderer: OfflineRenderer | null = null;
  private _isRendering = false;
  private _currentModel: THREE.Group | null = null;

  // Safe-frame overlay
  private _safeFrame: HTMLElement;
  private _axesCanvas: HTMLCanvasElement;

  constructor(appContainer: HTMLElement) {
    // ---- Build DOM layout ----
    const toolbar = new Toolbar();
    this._toolbar = toolbar;

    const mainArea = document.createElement('div');
    mainArea.id = 'main-area';
    appContainer.appendChild(mainArea);

    const viewportContainer = document.createElement('div');
    viewportContainer.id = 'viewport-container';
    mainArea.appendChild(viewportContainer);

    // Safe-frame overlay
    this._safeFrame = document.createElement('div');
    this._safeFrame.id = 'safe-frame';
    this._safeFrame.style.display = 'none';
    viewportContainer.appendChild(this._safeFrame);

    // Mini axes canvas
    this._axesCanvas = document.createElement('canvas');
    this._axesCanvas.id = 'axes-canvas';
    this._axesCanvas.width = 80;
    this._axesCanvas.height = 80;
    viewportContainer.appendChild(this._axesCanvas);

    // Panel
    this._panel = new Panel();
    mainArea.appendChild(this._panel.element);

    // Loading overlay
    this._loading = new LoadingOverlay();

    // ---- Core systems ----
    this._viewportRenderer = new ViewportRenderer(viewportContainer);
    this._sceneManager = new SceneManager();
    this._envManager = new EnvironmentManager(
      this._sceneManager.scene,
      this._viewportRenderer.renderer
    );
    this._cameraManager = new CameraManager(
      this._viewportRenderer.renderer.domElement
    );
    this._panel.setCameraManager(this._cameraManager);

    this._gizmoManager = new GizmoManager(
      this._cameraManager.camera,
      this._viewportRenderer.renderer.domElement,
      this._sceneManager.scene,
      this._cameraManager.controls
    );

    // ---- Startup ----
    this._startup();

    // ---- Toolbar hooks ----
    this._toolbar.onImport(file => this._importFile(file));
    this._toolbar.onRender(() => this._toggleRender());
    this._toolbar.onModeChange(mode => this._gizmoManager.setMode(mode));
    this._toolbar.onFrame(() => this._frameModel());
    this._toolbar.onSpaceToggle(space => this._gizmoManager.setSpace(space));

    // ---- Keyboard shortcuts ----
    document.addEventListener('keydown', (e) => this._onKey(e));

    // ---- Drag and drop ----
    viewportContainer.addEventListener('dragover', (e) => {
      e.preventDefault();
      viewportContainer.classList.add('drag-over');
    });
    viewportContainer.addEventListener('dragleave', () => {
      viewportContainer.classList.remove('drag-over');
    });
    viewportContainer.addEventListener('drop', (e) => {
      e.preventDefault();
      viewportContainer.classList.remove('drag-over');
      const file = e.dataTransfer?.files[0];
      if (file && file.name.toLowerCase().endsWith('.fbx')) {
        this._importFile(file);
      } else if (file) {
        showToast('Only FBX files are supported', 'error');
      }
    });

    // ---- HDRI change event ----
    window.addEventListener('hdri-changed', (e: Event) => {
      const url = (e as CustomEvent).detail?.url;
      if (url) this._envManager.loadHDRI(url);
    });

    // ---- Frame model event ----
    window.addEventListener('frame-model', () => this._frameModel());

    // ---- Resize observer ----
    new ResizeObserver(() => {
      const { width, height } = this._viewportRenderer.size;
      this._cameraManager.updateAspect(width, height);
      this._updateSafeFrame();
    }).observe(viewportContainer);

    appState.subscribe(() => this._updateSafeFrame());

    // ---- Render loop ----
    this._viewportRenderer.startLoop(() => this._tick());
  }

  private async _startup(): Promise<void> {
    this._loading.show('Initializing');
    this._loading.update(0.1, 'Compiling shaders...');

    // Add a placeholder cube while loading
    const cubeGeo = new THREE.BoxGeometry(1, 1, 1);
    const cubeMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.5, metalness: 0.3 });
    const cube = new THREE.Mesh(cubeGeo, cubeMat);
    cube.castShadow = true;
    cube.receiveShadow = true;
    cube.position.y = 0.5;
    cube.name = '__placeholder__';
    this._sceneManager.modelRoot.add(cube);

    // Load environment
    this._loading.update(0.3, 'Loading environment...');
    await this._envManager.loadHDRI(appState.settings.environment.hdri);

    // Precompile shaders
    this._loading.update(0.7, 'Compiling shaders...');
    try {
      await this._viewportRenderer.renderer.compileAsync(
        this._sceneManager.scene,
        this._cameraManager.camera
      );
    } catch {
      // compileAsync may not be available in older builds
    }

    this._loading.update(1.0, 'Ready');
    setTimeout(() => this._loading.hide(), 300);
  }

  private async _importFile(file: File): Promise<void> {
    if (!file.name.toLowerCase().endsWith('.fbx')) {
      showToast('Only FBX files are supported', 'error');
      return;
    }

    // Dispose old model
    if (this._currentModel) {
      this._gizmoManager.detach();
      disposeObject(this._currentModel);
      this._sceneManager.modelRoot.remove(this._currentModel);
      this._currentModel = null;
    }

    // Remove placeholder
    const placeholder = this._sceneManager.modelRoot.getObjectByName('__placeholder__');
    if (placeholder) {
      this._sceneManager.modelRoot.remove(placeholder);
      (placeholder as THREE.Mesh).geometry?.dispose();
    }

    this._loading.show('Importing FBX');

    try {
      const model = await importFBX(file, (stage, pct) => {
        this._loading.update(pct, stage);
      });

      this._loading.update(0.85, 'Centering model...');
      const box = centerAndNormalize(model);

      // Auto-fit aspect ratio if model is wide, avoiding empty borders in 1:1
      const size = new THREE.Vector3();
      box.getSize(size);
      if (size.x > size.y * 1.25 && appState.settings.quality.aspectRatio === '1:1') {
        appState.update(s => { s.quality.aspectRatio = '16:9'; });
      }

      this._sceneManager.modelRoot.add(model);
      this._currentModel = model;

      // Fit shadow camera
      this._sceneManager.fitShadowCamera(box);

      // Frame camera snugly to fill ~85% of the safe frame
      const aspect = this._getRenderAspect();
      this._cameraManager.frameModel(box, aspect);

      // Attach gizmo
      this._gizmoManager.attach(this._sceneManager.modelRoot);

      // Compile shaders
      this._loading.update(0.95, 'Compiling shaders...');
      try {
        await this._viewportRenderer.renderer.compileAsync(
          this._sceneManager.scene,
          this._cameraManager.camera
        );
      } catch { /* ignore */ }

      this._loading.hide();
      showToast(`Loaded: ${file.name}`, 'success');
    } catch (err) {
      this._loading.hide();
      console.error('Import failed:', err);
      showToast(`Import failed: ${(err as Error).message}`, 'error');
    }
  }

  private async _toggleRender(): Promise<void> {
    if (this._isRendering) {
      this._offlineRenderer?.cancel();
      this._isRendering = false;
      this._toolbar.setRenderState(false);
      this._gizmoManager.setVisible(true);
      this._viewportRenderer.startLoop(() => this._tick());
      this._loading.hide();
      return;
    }

    this._isRendering = true;
    this._toolbar.setRenderState(true);
    this._gizmoManager.setVisible(false);
    this._viewportRenderer.stopLoop();
    this._offlineRenderer = new OfflineRenderer();

    this._loading.show('Rendering', true, () => {
      this._offlineRenderer?.cancel();
      this._isRendering = false;
      this._toolbar.setRenderState(false);
      this._gizmoManager.setVisible(true);
      this._viewportRenderer.startLoop(() => this._tick());
      this._loading.hide();
    });

    await this._offlineRenderer.render(
      this._viewportRenderer.renderer,
      this._sceneManager.scene,
      this._cameraManager.activeCamera,
      (tile, total, pct) => {
        this._loading.update(pct, `Tile ${tile} / ${total}`);
      },
      () => {
        this._isRendering = false;
        this._toolbar.setRenderState(false);
        this._gizmoManager.setVisible(true);
        this._viewportRenderer.startLoop(() => this._tick());
        this._loading.hide();
        showToast('Render complete! Check your downloads.', 'success', 5000);
      },
      (err) => {
        this._isRendering = false;
        this._toolbar.setRenderState(false);
        this._gizmoManager.setVisible(true);
        this._viewportRenderer.startLoop(() => this._tick());
        this._loading.hide();
        showToast(`Render error: ${err.message}`, 'error', 8000);
      }
    );
  }

  private _frameModel(): void {
    if (this._currentModel) {
      const box = new THREE.Box3().setFromObject(this._sceneManager.modelRoot);
      const aspect = this._getRenderAspect();
      this._cameraManager.frameModel(box, aspect);
    }
  }

  private _getRenderAspect(): number {
    const q = appState.settings.quality;
    if (q.resolution === 'custom') {
      return q.customWidth / q.customHeight;
    }
    const ratioMap: Record<string, [number, number]> = {
      '1:1': [1, 1], '16:9': [16, 9], '4:3': [4, 3], '3:2': [3, 2]
    };
    const [w, h] = ratioMap[q.aspectRatio] ?? [16, 9];
    return w / h;
  }

  private _onKey(e: KeyboardEvent): void {
    // Ignore when typing in an input
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;

    switch (e.key.toLowerCase()) {
      case 'w':
        this._gizmoManager.setMode('translate');
        this._toolbar.setActiveMode('translate');
        break;
      case 'e':
        this._gizmoManager.setMode('rotate');
        this._toolbar.setActiveMode('rotate');
        break;
      case 'r':
        this._gizmoManager.setMode('scale');
        this._toolbar.setActiveMode('scale');
        break;
      case 'q':
        // toggle space
        break;
      case 'f':
        this._frameModel();
        break;
      case 'z':
        if (e.ctrlKey && e.shiftKey) {
          commandStack.redo();
        } else if (e.ctrlKey) {
          commandStack.undo();
        }
        break;
      case 'control':
        this._gizmoManager.toggleSnap(true);
        break;
    }
  }

  private _tick(): void {
    this._cameraManager.update();
    this._drawAxes();
    this._viewportRenderer.renderer.render(
      this._sceneManager.scene,
      this._cameraManager.camera
    );
  }

  private _updateSafeFrame(): void {
    const container = document.getElementById('viewport-container');
    if (!container) return;
    const vw = container.clientWidth;
    const vh = container.clientHeight;

    const q = appState.settings.quality;
    let aspectW = 1, aspectH = 1;

    if (q.resolution === 'custom') {
      aspectW = q.customWidth;
      aspectH = q.customHeight;
    } else {
      const ratioMap: Record<string, [number, number]> = {
        '1:1': [1, 1], '16:9': [16, 9], '4:3': [4, 3], '3:2': [3, 2]
      };
      [aspectW, aspectH] = ratioMap[q.aspectRatio] ?? [1, 1];
    }

    const aspect = aspectW / aspectH;
    let fw: number, fh: number;
    if (vw / vh > aspect) {
      fh = vh;
      fw = fh * aspect;
    } else {
      fw = vw;
      fh = fw / aspect;
    }

    this._safeFrame.style.display = 'block';
    this._safeFrame.style.width = `${fw}px`;
    this._safeFrame.style.height = `${fh}px`;
    this._safeFrame.style.left = `${(vw - fw) / 2}px`;
    this._safeFrame.style.top = `${(vh - fh) / 2}px`;
  }

  private _drawAxes(): void {
    const cam = this._cameraManager.camera;
    const ctx = this._axesCanvas.getContext('2d')!;
    const size = 80;
    ctx.clearRect(0, 0, size, size);

    const cx = size / 2;
    const cy = size / 2;
    const r = 28;

    // Get camera's rotation matrix
    const mat = new THREE.Matrix4().extractRotation(cam.matrixWorldInverse);
    const dirs: [THREE.Vector3, string, string][] = [
      [new THREE.Vector3(1, 0, 0), '#e05252', 'X'],
      [new THREE.Vector3(0, 1, 0), '#52c052', 'Y'],
      [new THREE.Vector3(0, 0, 1), '#5280e0', 'Z'],
    ];

    // Sort by depth (z in view space) so farther axes render first
    const projected = dirs.map(([v, color, label]) => {
      const vv = v.clone().applyMatrix4(mat);
      return { vv, color, label };
    }).sort((a, b) => a.vv.z - b.vv.z);

    projected.forEach(({ vv, color, label }) => {
      const ex = cx + vv.x * r;
      const ey = cy - vv.y * r;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(ex, ey);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, ex + (ex - cx) * 0.3, ey + (ey - cy) * 0.3);
    });

    // Center dot
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#ccc';
    ctx.fill();
  }
}
