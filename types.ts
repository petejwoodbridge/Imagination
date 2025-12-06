export interface ColorOption {
  name: string;
  hex: string;
  intensity: number;
}

export type EffectMode = 'normal' | 'kaleidoscope' | 'video-prominent' | 'person-duplication' | 'wild';

export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

export interface FaceLandmark {
  x: number;
  y: number;
  z: number;
}

export interface DetectionResult {
  handLandmarks: HandLandmark[][];
  faceLandmarks: FaceLandmark[][];
}

export const MOEA_COLORS: ColorOption[] = [
  { name: 'STATIC', hex: '#E0E0E0', intensity: 1.0 },
  { name: 'BLOOD', hex: '#FF0033', intensity: 1.8 },
  { name: 'SIGNAL', hex: '#00FFCC', intensity: 1.4 },
  { name: 'TOXIN', hex: '#CCFF00', intensity: 1.3 },
  { name: 'BRUISE', hex: '#5500FF', intensity: 2.0 },
];