export type LightType = 'directional' | 'point' | 'spot';
export type AtlasQuality = 'low' | 'medium' | 'high' | 'ultra';
export type PixelQuality = 1 | 4 | 16 | 64;
export type Resolution = '1k' | '2k' | '4k' | '8k' | 'custom';
export type AspectRatio = '1:1' | '16:9' | '4:3' | '3:2' | 'custom';
export type ToneMapping = 'ACES' | 'AgX' | 'Neutral' | 'None';
export type CameraMode = 'perspective' | 'orthographic';

export interface RenderSettings {
  light: {
    type: LightType;
    color: string;
    intensity: number;
    azimuth: number;
    elevation: number;
    shadowSoftness: number;
    groundVisible: boolean;
  };
  environment: {
    hdri: string;
    intensity: number;
    rotation: number;
    showBackground: boolean;
  };
  material: {
    roughness: number;
    metalness: number;
  };
  quality: {
    atlasQuality: AtlasQuality;
    pixelQuality: PixelQuality;
    resolution: Resolution;
    aspectRatio: AspectRatio;
    customWidth: number;
    customHeight: number;
    transparentBackground: boolean;
    ambientOcclusion: boolean;
    aoIntensity: number;
  };
  camera: {
    mode: CameraMode;
    fov: number;
    near: number;
    far: number;
    exposure: number;
    toneMapping: ToneMapping;
  };
}

export const DEFAULT_SETTINGS: RenderSettings = {
  light: {
    type: 'directional',
    color: '#ffffff',
    intensity: 1.5,
    azimuth: 45,
    elevation: 50,
    shadowSoftness: 3.0,
    groundVisible: true,
  },
  environment: {
    hdri: '/hdri/default.hdr',
    intensity: 1.0,
    rotation: 0,
    showBackground: true,
  },
  material: {
    roughness: 0.35,
    metalness: 0.05,
  },
  quality: {
    atlasQuality: 'high',
    pixelQuality: 4,
    resolution: '2k',
    aspectRatio: '16:9',
    customWidth: 1920,
    customHeight: 1080,
    transparentBackground: false,
    ambientOcclusion: true,
    aoIntensity: 1.5,
  },
  camera: {
    mode: 'perspective',
    fov: 40,
    near: 0.01,
    far: 1000,
    exposure: 1.0,
    toneMapping: 'ACES',
  },
};
