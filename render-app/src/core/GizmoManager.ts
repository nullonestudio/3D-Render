import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { commandStack, Command } from '../app/commands';

export class GizmoManager {
  public transformControls: TransformControls;
  private _orbitControls: OrbitControls;
  private _target: THREE.Object3D | null = null;
  private _snapEnabled = false;

  // Saved state for undo
  private _prevPosition = new THREE.Vector3();
  private _prevRotation = new THREE.Euler();
  private _prevScale = new THREE.Vector3();

  constructor(
    camera: THREE.Camera,
    canvas: HTMLCanvasElement,
    scene: THREE.Scene,
    orbitControls: OrbitControls
  ) {
    this._orbitControls = orbitControls;
    this.transformControls = new TransformControls(camera, canvas);
    this.transformControls.size = 0.5;   // scale down gizmo handles
    scene.add(this.transformControls.getHelper());

    this.transformControls.addEventListener('dragging-changed', (e: any) => {
      this._orbitControls.enabled = !e.value;
    });

    this.transformControls.addEventListener('mouseDown', () => {
      if (!this._target) return;
      this._prevPosition.copy(this._target.position);
      this._prevRotation.copy(this._target.rotation);
      this._prevScale.copy(this._target.scale);
    });

    this.transformControls.addEventListener('mouseUp', () => {
      if (!this._target) return;
      const target = this._target;
      const prevPos = this._prevPosition.clone();
      const prevRot = this._prevRotation.clone();
      const prevScale = this._prevScale.clone();
      const newPos = target.position.clone();
      const newRot = target.rotation.clone();
      const newScale = target.scale.clone();

      const cmd: Command = {
        description: 'Transform model',
        execute: () => {
          target.position.copy(newPos);
          target.rotation.copy(newRot);
          target.scale.copy(newScale);
        },
        undo: () => {
          target.position.copy(prevPos);
          target.rotation.copy(prevRot);
          target.scale.copy(prevScale);
        },
      };
      commandStack.execute(cmd);
    });
  }

  attach(object: THREE.Object3D): void {
    this._target = object;
    this.transformControls.attach(object);
  }

  detach(): void {
    this._target = null;
    this.transformControls.detach();
  }

  setMode(mode: 'translate' | 'rotate' | 'scale'): void {
    this.transformControls.setMode(mode);
  }

  setSpace(space: 'local' | 'world'): void {
    this.transformControls.setSpace(space);
  }

  toggleSnap(enabled: boolean): void {
    this._snapEnabled = enabled;
    if (enabled) {
      this.transformControls.setTranslationSnap(0.25);
      this.transformControls.setRotationSnap(THREE.MathUtils.degToRad(15));
      this.transformControls.setScaleSnap(0.25);
    } else {
      this.transformControls.setTranslationSnap(null);
      this.transformControls.setRotationSnap(null);
      this.transformControls.setScaleSnap(null);
    }
  }

  setVisible(visible: boolean): void {
    this.transformControls.enabled = visible;
    this.transformControls.getHelper().visible = visible;
  }

  dispose(): void {
    this.transformControls.dispose();
  }
}
