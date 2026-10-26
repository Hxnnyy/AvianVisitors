export interface Species {
  id: string;
  scientificName: string;
  commonName: string;
  artworkUrl: string | null;
}
export interface Location {
  latitude: number;
  longitude: number;
}
export interface CaptureMetadata {
  capturedAt: string | null;
  location: Location | null;
  source: "embedded" | "user" | "missing";
}
export interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Candidate {
  speciesId: string;
  scientificName: string;
  commonName: string;
  score: number;
  ranges: { start: number; end: number }[];
}
export interface Identification {
  warnings: string[];
  status: "identified" | "uncertain" | "no_bird";
  model: string;
  scoreLabel: string;
  candidates: Candidate[];
  raw: unknown;
}
export interface Capture {
  id: string;
  kind: "image" | "audio";
  status: "uploaded" | "processing" | "review" | "failed";
  metadata: CaptureMetadata;
  crop: Crop | null;
  originalUrl: string;
  identification: Identification | null;
  error: string | null;
  createdAt: string;
}
export interface Sighting {
  id: string;
  captureId: string;
  speciesId: string;
  identifiedBy: "model" | "user";
  capturedAt: string;
  location: Location;
  createdAt: string;
}
export interface CollectionEntry {
  species: Species;
  sightings: Sighting[];
}
export interface FrameSettings {
  mode: "week" | "all-time" | "manual";
  speciesIds: string[];
  showNames: boolean;
}
export interface FrameState {
  settings: FrameSettings;
  revision: string | null;
  imageUrl: string | null;
  lastContactAt: string | null;
  acknowledgedRevision: string | null;
  error: string | null;
}
export interface DeviceManifest {
  revision: string | null;
  imageUrl: string | null;
  width: 480;
  height: 800;
}
export interface ApiError {
  error: string;
}
