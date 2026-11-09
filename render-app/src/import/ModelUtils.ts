import * as THREE from 'three';

export function computeBoundingBox(object: THREE.Object3D): THREE.Box3 {
  return new THREE.Box3().setFromObject(object);
}

export function centerAndNormalize(object: THREE.Object3D): THREE.Box3 {
  const box = computeBoundingBox(object);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);

  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = 2.0 / maxDim;
  object.scale.multiplyScalar(scale);
  object.updateMatrixWorld(true);

  const newBox = computeBoundingBox(object);
  const newCenter = new THREE.Vector3();
  newBox.getCenter(newCenter);
  object.position.sub(newCenter);
  // Sit on ground: move up so bottom is at y=0
  const afterBox = computeBoundingBox(object);
  object.position.y -= afterBox.min.y;
  object.updateMatrixWorld(true);

  return computeBoundingBox(object);
}

export function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      if (child.geometry) {
        child.geometry.dispose();
      }
      if (Array.isArray(child.material)) {
        child.material.forEach(mat => disposeMaterial(mat));
      } else if (child.material) {
        disposeMaterial(child.material);
      }
    }
  });
}

function disposeMaterial(mat: THREE.Material): void {
  mat.dispose();
  const matAny = mat as any;
  const texProps = [
    'map', 'normalMap', 'roughnessMap', 'metalnessMap',
    'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap',
    'lightMap', 'envMap', 'displacementMap',
  ];
  texProps.forEach(prop => {
    if (matAny[prop] instanceof THREE.Texture) {
      matAny[prop].dispose();
    }
  });
}
