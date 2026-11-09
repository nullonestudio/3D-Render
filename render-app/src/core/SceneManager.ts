import * as THREE from 'three';
import { appState } from '../app/state';

export class SceneManager {
  public scene: THREE.Scene;
  public modelRoot: THREE.Group;
  public groundPlane: THREE.Mesh;

  private _mainLight: THREE.DirectionalLight | THREE.PointLight | THREE.SpotLight;
  private _ambientLight: THREE.AmbientLight;
  private _currentBox: THREE.Box3 | null = null;

  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1e1e1e);

    this.modelRoot = new THREE.Group();
    this.modelRoot.name = 'ModelRoot';
    this.scene.add(this.modelRoot);

    // Ground plane (pure shadow catcher)
    const groundGeo = new THREE.PlaneGeometry(200, 200);
    const groundMat = new THREE.ShadowMaterial({
      opacity: 0.35,
      transparent: true,
      depthWrite: false,
    });
    this.groundPlane = new THREE.Mesh(groundGeo, groundMat);
    this.groundPlane.rotation.x = -Math.PI / 2;
    this.groundPlane.position.y = -0.002; // prevent z-fighting with models resting at y=0
    this.groundPlane.receiveShadow = true;
    this.groundPlane.name = 'GroundPlane';
    this.scene.add(this.groundPlane);

    // Ambient light
    this._ambientLight = new THREE.AmbientLight(0xffffff, 0.15);
    this.scene.add(this._ambientLight);

    // Main directional light
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(1024, 1024);
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 80;
    (dirLight.shadow.camera as THREE.OrthographicCamera).left = -10;
    (dirLight.shadow.camera as THREE.OrthographicCamera).right = 10;
    (dirLight.shadow.camera as THREE.OrthographicCamera).top = 10;
    (dirLight.shadow.camera as THREE.OrthographicCamera).bottom = -10;
    dirLight.shadow.bias = -0.0005;
    dirLight.shadow.normalBias = 0.02; // prevents shadow acne on curved PBR surfaces
    dirLight.shadow.radius = 1.5;

    this._mainLight = dirLight;
    this.scene.add(this._mainLight);
    this.scene.add(this._mainLight.target); // Essential: target must be in scene graph

    this._updateLight();
    appState.subscribe(() => this._updateLight());
  }

  private _updateLight(): void {
    const { light } = appState.settings;
    this._mainLight.color.set(light.color);
    this._mainLight.intensity = light.intensity;

    const azRad = THREE.MathUtils.degToRad(light.azimuth);
    const elRad = THREE.MathUtils.degToRad(light.elevation);
    const r = 20;

    this._mainLight.position.set(
      r * Math.cos(elRad) * Math.sin(azRad),
      r * Math.sin(elRad),
      r * Math.cos(elRad) * Math.cos(azRad)
    );

    if (this._mainLight instanceof THREE.DirectionalLight) {
      this._mainLight.target.position.set(0, 0, 0);
      this._mainLight.target.updateMatrixWorld();
    }

    // Apply shadow softness (PCF blur radius)
    if (this._mainLight.shadow) {
      this._mainLight.shadow.radius = Math.max(1, light.shadowSoftness);
    }

    // Ground visibility
    this.groundPlane.visible = light.groundVisible !== false;

    // Update shadow map size based on atlas quality
    const { atlasQuality } = appState.settings.quality;
    const shadowSizes: Record<string, number> = {
      low: 512, medium: 1024, high: 2048, ultra: 4096
    };
    const size = shadowSizes[atlasQuality] ?? 1024;
    if (this._mainLight.shadow && this._mainLight.shadow.mapSize.x !== size) {
      this._mainLight.shadow.mapSize.set(size, size);
      if (this._mainLight.shadow.map) {
        this._mainLight.shadow.map.dispose();
        (this._mainLight.shadow as any).map = null;
      }
    }

    if (this._currentBox) {
      this.fitShadowCamera(this._currentBox);
    }
  }

  fitShadowCamera(box: THREE.Box3): void {
    this._currentBox = box.clone();
    if (!(this._mainLight instanceof THREE.DirectionalLight)) return;

    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z, 2.0);

    // Expand frustum so cast shadows on ground plane are never clipped
    const ext = maxDim * 2.2;
    const cam = this._mainLight.shadow.camera as THREE.OrthographicCamera;
    cam.left = -ext;
    cam.right = ext;
    cam.top = ext;
    cam.bottom = -ext;
    cam.near = 0.5;
    cam.far = 60;
    cam.updateProjectionMatrix();
  }

  setGroundVisible(visible: boolean): void {
    this.groundPlane.visible = visible;
  }

  get mainLight(): THREE.Light { return this._mainLight; }
}
