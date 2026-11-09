import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { appState } from '../app/state';

export type ImportProgress = (stage: string, pct: number) => void;

export async function importFBX(
  file: File,
  onProgress?: ImportProgress
): Promise<THREE.Group> {
  onProgress?.('Reading file', 0.05);

  const url = URL.createObjectURL(file);
  try {
    const loader = new FBXLoader();

    onProgress?.('Parsing FBX', 0.2);
    const object = await new Promise<THREE.Group>((resolve, reject) => {
      loader.load(
        url,
        resolve,
        (evt) => {
          if (evt.total > 0) {
            const pct = 0.2 + (evt.loaded / evt.total) * 0.4;
            onProgress?.('Loading textures', pct);
          }
        },
        reject
      );
    });

    onProgress?.('Building scene', 0.7);
    fixModel(object);
    onProgress?.('Done', 1.0);

    return object;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function fixModel(object: THREE.Group): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;

    child.castShadow = true;
    child.receiveShadow = true;

    const materials = Array.isArray(child.material) ? child.material : [child.material];
    const newMaterials: THREE.Material[] = materials.map(mat => convertMaterial(mat));

    if (Array.isArray(child.material)) {
      child.material = newMaterials;
    } else {
      child.material = newMaterials[0];
    }
  });
}

function convertMaterial(mat: THREE.Material): THREE.Material {
  const globalMat = appState.settings.material;

  if (
    mat instanceof THREE.MeshPhongMaterial ||
    mat instanceof THREE.MeshLambertMaterial ||
    mat instanceof THREE.MeshBasicMaterial
  ) {
    const matAny = mat as any;

    let baseColor = matAny.color ? matAny.color.clone() : new THREE.Color(0.8, 0.8, 0.8);
    let roughness = globalMat.roughness;
    let metalness = globalMat.metalness;

    const lum = 0.299 * baseColor.r + 0.587 * baseColor.g + 0.114 * baseColor.b;

    if (lum < 0.25) {
      // Dark / black components: give glossy/satin sheen so reflections of softboxes show
      roughness = Math.min(0.22, globalMat.roughness);
      metalness = Math.max(0.08, globalMat.metalness);
    } else if (!matAny.map) {
      // Light untextured parts: avoid 100% pure diffuse blowout; give crisp sheen
      if (baseColor.r > 0.92 && baseColor.g > 0.92 && baseColor.b > 0.92) {
        baseColor.setRGB(0.8, 0.8, 0.8);
      }
      roughness = Math.min(0.32, globalMat.roughness);
    } else {
      matAny.map.colorSpace = THREE.SRGBColorSpace;
    }

    if (mat instanceof THREE.MeshPhongMaterial && mat.shininess > 10) {
      roughness = Math.max(0.08, Math.min(0.6, 1 - (mat.shininess / 150)));
      metalness = Math.min(1.0, (mat as any).reflectivity ?? metalness);
      if (matAny.specularMap) {
        matAny.specularMap.colorSpace = THREE.SRGBColorSpace;
      }
    }

    const stdMat = new THREE.MeshStandardMaterial({
      name: mat.name,
      color: baseColor,
      emissive: matAny.emissive?.clone() ?? new THREE.Color(0, 0, 0),
      transparent: mat.transparent,
      opacity: mat.opacity,
      side: mat.side,
      wireframe: (mat as any).wireframe ?? false,
      roughness,
      metalness,
    });

    if (matAny.map) stdMat.map = matAny.map;
    if (matAny.normalMap) stdMat.normalMap = matAny.normalMap;
    if (matAny.emissiveMap) {
      matAny.emissiveMap.colorSpace = THREE.SRGBColorSpace;
      stdMat.emissiveMap = matAny.emissiveMap;
    }
    if (matAny.aoMap) {
      stdMat.aoMap = matAny.aoMap;
      stdMat.aoMapIntensity = 1.0;
    }
    if (matAny.alphaMap) stdMat.alphaMap = matAny.alphaMap;
    if (matAny.envMap) stdMat.envMap = matAny.envMap;

    mat.dispose();
    return stdMat;
  }

  if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
    if ((mat as any).map) {
      (mat as any).map.colorSpace = THREE.SRGBColorSpace;
    } else {
      const c = (mat as THREE.MeshStandardMaterial).color;
      if (c && c.r > 0.92 && c.g > 0.92 && c.b > 0.92) {
        c.setRGB(0.8, 0.8, 0.8);
      }
      mat.roughness = globalMat.roughness;
      mat.metalness = globalMat.metalness;
    }
    return mat;
  }

  return mat;
}
