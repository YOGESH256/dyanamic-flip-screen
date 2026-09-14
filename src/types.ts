/** Crop rectangle in source-video pixel space. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One recorded point on the crop path. Times are in video seconds. */
export interface Keyframe {
  t: number;
  rect: Rect;
  volume: number;
  rate: number;
}

/** Wire format, matches the original assignment spec. */
export interface KeyframeJson {
  timeStamp: number;
  coordinates: [number, number, number, number];
  volume: number;
  playbackRate: number;
}

export interface AspectPreset {
  label: string;
  w: number;
  h: number;
}

export const ASPECT_PRESETS: AspectPreset[] = [
  { label: '9:16', w: 9, h: 16 },
  { label: '9:18', w: 9, h: 18 },
  { label: '4:5', w: 4, h: 5 },
  { label: '1:1', w: 1, h: 1 },
  { label: '3:4', w: 3, h: 4 },
  { label: '4:3', w: 4, h: 3 },
];
