import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { appState } from '../app/state';

export interface CameraBookmark {
  name: string;
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
  mode: 'perspective' | 'orthographic';
}

export class CameraManager {
  public camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  public controls: OrbitControls;
  private _perspCamera: THREE.PerspectiveCamera;
  private _orthoCamera: THREE.OrthographicCamera;
  private _bookmarks: CameraBookmark[] = [];
  private _aspect = 1;

  constructor(canvas: HTMLCanvasElement) {
    this._perspCamera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
    this._perspCamera.position.set(3, 2, 5);
    this._perspCamera.lookAt(0, 0, 0);

    this._orthoCamera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.01, 1000);
    this._orthoCamera.position.set(3, 2, 5);
    this._orthoCamera.lookAt(0, 0, 0);

    this.camera = this._perspCamera;
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;

    appState.subscribe(s => this._applySettings(s.camera));
  }

  private _applySettings(cam: typeof appState.settings.camera): void {
    if (cam.mode === 'perspective') {
      this._perspCamera.fov = cam.fov;
      this._perspCamera.near = cam.near;
      this._perspCamera.far = cam.far;
      this._perspCamera.updateProjectionMatrix();
      if (this.camera !== this._perspCamera) this._switchTo(this._perspCamera);
    } else {
      this._orthoCamera.near = cam.near;
      this._orthoCamera.far = cam.far;
      this._orthoCamera.updateProjectionMatrix();
      if (this.camera !== this._orthoCamera) this._switchTo(this._orthoCamera);
    }
  }

  private _switchTo(cam: THREE.PerspectiveCamera | THREE.OrthographicCamera): void {
    const pos = this.camera.position.clone();
    const target = this.controls.target.clone();
    cam.position.copy(pos);
    this.camera = cam;
    this.controls.object = cam;
    this.controls.target.copy(target);
    this.controls.update();
  }

  updateAspect(width: number, height: number): void {
    this._aspect = width / height;
    this._perspCamera.aspect = this._aspect;
    this._perspCamera.updateProjectionMatrix();
    const frustum = this.controls.getDistance() * Math.tan(THREE.MathUtils.degToRad(this._perspCamera.fov / 2));
    this._orthoCamera.left = -frustum * this._aspect;
    this._orthoCamera.right = frustum * this._aspect;
    this._orthoCamera.top = frustum;
    this._orthoCamera.bottom = -frustum;
    this._orthoCamera.updateProjectionMatrix();
  }

  frameModel(box: THREE.Box3): void {
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = this._perspCamera.fov * (Math.PI / 180);
    const distance = (maxDim / 2) / Math.tan(fov / 2) * 1.8;
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(dir, distance);
    this.controls.update();
  }

  saveBookmark(name: string): void {
    const bookmark: CameraBookmark = {
      name,
      position: this.camera.position.clone(),
      target: this.controls.target.clone(),
      fov: this._perspCamera.fov,
      mode: appState.settings.camera.mode,
    };
    const idx = this._bookmarks.findIndex(b => b.name === name);
    if (idx >= 0) this._bookmarks[idx] = bookmark;
    else this._bookmarks.push(bookmark);
  }

  recallBookmark(name: string): boolean {
    const b = this._bookmarks.find(bm => bm.name === name);
    if (!b) return false;
    this.camera.position.copy(b.position);
    this.controls.target.copy(b.target);
    this.controls.update();
    return true;
  }

  deleteBookmark(name: string): void {
    this._bookmarks = this._bookmarks.filter(b => b.name !== name);
  }

  get bookmarks(): CameraBookmark[] { return [...this._bookmarks]; }

  reset(): void {
    this.camera.position.set(3, 2, 5);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  update(): void {
    this.controls.update();
  }

  get activeCamera(): THREE.PerspectiveCamera | THREE.OrthographicCamera {
    return this.camera;
  }
}
