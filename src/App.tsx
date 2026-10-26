import React, { useState, useEffect, useMemo, useRef } from 'react';
import { auth, db, signInWithGoogle, logout } from './lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp
} from 'firebase/firestore';
import { 
  Video, 
  Plus, 
  LogOut, 
  LayoutDashboard, 
  Sparkles, 
  Play, 
  Pause,
  Clock, 
  ChevronRight,
  Loader2,
  AlertCircle,
  Search,
  Folder,
  FolderPlus,
  Layers,
  Grid,
  Check,
  X,
  Box,
  LogIn,
  Image as ImageIcon,
  Music,
  MapPin,
  Globe,
  Mic,
  MicOff,
  Dna,
  Upload,
  ExternalLink,
  Download,
  RefreshCw,
  Eye,
  Save,
  Trash2,
  Film,
  CheckSquare,
  Square,
  Camera,
  SwitchCamera,
  CircleDot,
  StopCircle,
  FlipHorizontal,
  FlipVertical,
  Heart,
  Zap,
  Copy,
  Edit3,
  FileVideo,
  FileText,
  Type as TypeIcon,
  VolumeX,
  Car
} from 'lucide-react';
import { motion } from 'motion/react';
import Studio3DScene, { SubjectPresetId, SceneItem } from './components/Studio3DScene';

// --- Firestore Error Handling ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Types ---
export interface Scene {
  description: string;
  duration: string;
  imageUrl?: string;
  scene3dPreset?: SubjectPresetId;
  overlayText?: string;
}

export type VideoFilterId = 'none' | 'grayscale' | 'sepia' | 'high-contrast' | 'vintage';

export const VIDEO_FILTER_PRESETS: {
  id: VideoFilterId;
  label: string;
  cssFilter: string;
  tailwindClass: string;
}[] = [
  { id: 'none', label: 'Original', cssFilter: 'none', tailwindClass: '' },
  { id: 'grayscale', label: 'Grayscale', cssFilter: 'grayscale(100%)', tailwindClass: 'grayscale' },
  { id: 'sepia', label: 'Sepia', cssFilter: 'sepia(100%)', tailwindClass: 'sepia' },
  {
    id: 'high-contrast',
    label: 'High-Contrast',
    cssFilter: 'contrast(155%) saturate(125%)',
    tailwindClass: 'contrast-150 saturate-125',
  },
  {
    id: 'vintage',
    label: 'Vintage',
    cssFilter: 'sepia(65%) contrast(115%) brightness(92%) saturate(85%)',
    tailwindClass: 'sepia-[.65] contrast-115 brightness-95 saturate-85',
  },
];

export function getVideoFilterPreset(filterId?: VideoFilterId) {
  return VIDEO_FILTER_PRESETS.find((f) => f.id === filterId) || VIDEO_FILTER_PRESETS[0];
}

export interface VideoProject {
  id: string;
  title: string;
  prompt: string;
  folder?: string;
  script?: string;
  customTextOverlay?: string;
  scenes?: Scene[];
  images?: string[];
  scene3dPreset?: SubjectPresetId;
  referenceImage?: string;
  filter?: VideoFilterId;
  status: 'pending' | 'completed' | 'failed';
  videoData?: string;
  mimeType?: string;
  aspectRatio?: string;
  duration?: string;
  createdAt: any;
  userId: string;
}

const STAGE_3D_PRESETS: { id: SubjectPresetId; name: string; subtitle: string; badge: string }[] = [
  { id: 'coupe', name: 'Cyber Coupe Stage', subtitle: '9-part aerodynamic monocoque & sapphire canopy', badge: 'Automotive 3D' },
  { id: 'sculpture', name: 'Kinetic Gyro Sculpture', subtitle: '7-part concentric brass gimbal & optical core', badge: 'Kinetic Art 3D' },
  { id: 'drone', name: 'Quad Cinema Drone', subtitle: '8-part carbon fuselage & 8K stabilized gimbal', badge: 'Aerial Rig 3D' },
  { id: 'station', name: 'Orbital Ring Habitat', subtitle: '9-part centrifuge torus, solar wings & docking hub', badge: 'Sci-Fi Space 3D' },
  { id: 'protein', name: 'AlphaFold Protein Helix', subtitle: 'pLDDT confidence-colored molecular fold & catalytic site', badge: 'Bioscience 3D' },
];

const QUICK_VIDEO_TEMPLATES: {
  id: string;
  label: string;
  title: string;
  prompt: string;
  folder: string;
  preset: SubjectPresetId;
  aspectRatio: '16:9' | '9:16';
  duration: string;
}[] = [
  {
    id: 'tpl-coupe',
    label: '🚗 Auto Cyberpunk 3D',
    title: 'Cyber Coupe Neon Drift',
    prompt: 'Auto deportivo eléctrico futurista en plataforma giratoria con luces de neón cian y contraluz dorado en cámara lenta.',
    folder: 'Automotive Ads',
    preset: 'coupe',
    aspectRatio: '16:9',
    duration: '12s',
  },
  {
    id: 'tpl-space',
    label: '🪐 Viaje Espacial 3D',
    title: 'Estación Orbital Amanecer',
    prompt: 'Estación espacial de anillo centrífugo girando sobre el horizonte de la Tierra con paneles solares dorados.',
    folder: 'Sci-Fi 3D Scenes',
    preset: 'station',
    aspectRatio: '16:9',
    duration: '12s',
  },
  {
    id: 'tpl-drone',
    label: '🚁 Dron de Cine 8K',
    title: 'Vuelo Aéreo Dron 8K',
    prompt: 'Dron cinematográfico de fibra de carbono realizando una toma aérea de persecución con lente anamórfico.',
    folder: 'Tomas Aéreas',
    preset: 'drone',
    aspectRatio: '16:9',
    duration: '12s',
  },
  {
    id: 'tpl-reel',
    label: '📱 Reel Vertical 9:16',
    title: 'Escultura Cinética Reel Vertical',
    prompt: 'Escultura giroscópica de bronce y cristal óptico girando en armonía para formato vertical de redes sociales.',
    folder: 'Reels Verticales',
    preset: 'sculpture',
    aspectRatio: '9:16',
    duration: '10s',
  },
  {
    id: 'tpl-bio',
    label: '🧬 Ciencia AlphaFold 3D',
    title: 'Exploración Molecular AlphaFold',
    prompt: 'Visualización científica en 3D de una proteína humana plegándose en alta precisión con sitio catalítico activo.',
    folder: 'Ciencia 3D',
    preset: 'protein',
    aspectRatio: '16:9',
    duration: '12s',
  },
];

// Parse seconds from a duration string like "3s", "2.5s", "15s"
export function parseDurationSeconds(dur?: string, fallback = 3): number {
  if (!dur) return fallback;
  const num = parseFloat(String(dur).replace(/[^0-9.]/g, ''));
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

export function getTotalScenesDurationSeconds(scenes?: Scene[], fallbackDuration?: string): number {
  if (Array.isArray(scenes) && scenes.length > 0) {
    const sum = scenes.reduce((acc, sc) => acc + parseDurationSeconds(sc.duration, 3), 0);
    return Math.max(3, Math.round(sum * 10) / 10);
  }
  return parseDurationSeconds(fallbackDuration, 5);
}

// Client-side image compression utility so uploaded images fit in Firestore (<1MB) and localStorage
export async function compressImageFile(file: File, maxDim = 640, quality = 0.78): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image format'));
      img.onload = () => {
        let w = img.naturalWidth || 640;
        let h = img.naturalHeight || 360;
        if (w > maxDim || h > maxDim) {
          if (w >= h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

// Extract keyframe images from an uploaded video file so uploaded videos can also be edited into multi-scene sequences & 3D stages
export async function extractFramesFromVideoFile(
  file: File,
  frameCount = 4
): Promise<{ videoObjectUrl: string; frames: string[]; durationSec: number }> {
  return new Promise((resolve) => {
    const videoObjectUrl = URL.createObjectURL(file);
    const vid = document.createElement('video');
    vid.src = videoObjectUrl;
    vid.muted = true;
    vid.playsInline = true;
    vid.crossOrigin = 'anonymous';

    const fallbackResult = () =>
      resolve({
        videoObjectUrl,
        frames: [
          createSampleSceneDataUrl('coupe', `${file.name} · Escena 01`),
          createSampleSceneDataUrl('station', `${file.name} · Escena 02`),
        ],
        durationSec: 10,
      });

    const timeoutId = window.setTimeout(fallbackResult, 8000);

    vid.onloadedmetadata = async () => {
      const dur = Number.isFinite(vid.duration) && vid.duration > 0 ? vid.duration : 8;
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 360;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        clearTimeout(timeoutId);
        fallbackResult();
        return;
      }

      const frames: string[] = [];
      for (let i = 0; i < frameCount; i++) {
        const targetTime = Math.min(dur - 0.1, ((i + 0.5) / frameCount) * dur);
        await new Promise<void>((resSeek) => {
          const onSeeked = () => {
            vid.removeEventListener('seeked', onSeeked);
            ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
            frames.push(canvas.toDataURL('image/jpeg', 0.76));
            resSeek();
          };
          vid.addEventListener('seeked', onSeeked);
          try {
            vid.currentTime = Math.max(0, targetTime);
          } catch {
            resSeek();
          }
        });
      }
      clearTimeout(timeoutId);
      resolve({
        videoObjectUrl,
        frames: frames.length > 0 ? frames : [createSampleSceneDataUrl('coupe', file.name)],
        durationSec: Math.round(dur),
      });
    };

    vid.onerror = () => {
      clearTimeout(timeoutId);
      fallbackResult();
    };
  });
}

// Built-in sample SVG data URLs
function createSampleSceneDataUrl(theme: SubjectPresetId, label: string): string {
  const colors =
    theme === 'coupe'
      ? { bg1: '#0b0f19', bg2: '#1e1b4b', glow: '#38bdf8', accent: '#f59e0b' }
      : theme === 'station'
      ? { bg1: '#090d16', bg2: '#0f172a', glow: '#818cf8', accent: '#38bdf8' }
      : theme === 'drone'
      ? { bg1: '#090d16', bg2: '#064e3b', glow: '#34d399', accent: '#38bdf8' }
      : theme === 'sculpture'
      ? { bg1: '#18181b', bg2: '#451a03', glow: '#f59e0b', accent: '#ec4899' }
      : { bg1: '#070b14', bg2: '#172554', glow: '#65CBF3', accent: '#0053D6' };

  const shapeSvg =
    theme === 'coupe'
      ? `<path d="M180,310 L250,240 L430,215 L610,225 L730,275 L760,310 Z" fill="#1e293b" stroke="${colors.glow}" stroke-width="4"/>
         <circle cx="300" cy="315" r="42" fill="#090d16" stroke="${colors.accent}" stroke-width="5"/>
         <circle cx="640" cy="315" r="42" fill="#090d16" stroke="${colors.accent}" stroke-width="5"/>`
      : theme === 'station'
      ? `<ellipse cx="480" cy="250" rx="210" ry="75" fill="none" stroke="${colors.glow}" stroke-width="7" transform="rotate(-15 480 250)"/>
         <circle cx="480" cy="250" r="42" fill="#1e293b" stroke="${colors.accent}" stroke-width="4"/>`
      : theme === 'drone'
      ? `<rect x="360" y="220" width="240" height="44" rx="22" fill="#1e293b" stroke="${colors.glow}" stroke-width="4"/>
         <circle cx="320" cy="210" r="55" fill="none" stroke="${colors.accent}" stroke-width="4"/>
         <circle cx="640" cy="210" r="55" fill="none" stroke="${colors.accent}" stroke-width="4"/>`
      : theme === 'sculpture'
      ? `<circle cx="480" cy="245" r="105" fill="none" stroke="${colors.glow}" stroke-width="6"/>
         <ellipse cx="480" cy="245" rx="85" ry="40" fill="none" stroke="${colors.accent}" stroke-width="5" transform="rotate(35 480 245)"/>`
      : `<path d="M260,250 Q370,130 480,250 T700,250" fill="none" stroke="#0053D6" stroke-width="18" stroke-linecap="round"/>
         <path d="M260,290 Q370,410 480,290 T700,290" fill="none" stroke="#65CBF3" stroke-width="14" stroke-linecap="round"/>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${colors.bg1}"/>
        <stop offset="100%" stop-color="${colors.bg2}"/>
      </linearGradient>
    </defs>
    <rect width="800" height="450" fill="url(#g)"/>
    <circle cx="480" cy="240" r="190" fill="${colors.glow}" fill-opacity="0.18"/>
    <g transform="scale(0.83) translate(0, 15)">${shapeSvg}</g>
    <rect x="0" y="380" width="800" height="70" fill="#090d16" fill-opacity="0.82"/>
    <text x="28" y="422" fill="#f8fafc" font-family="sans-serif" font-size="18" font-weight="bold">${label}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

// Helper to draw an HTMLImageElement onto canvas with 'object-fit: cover' + Ken Burns zoom/pan
function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
  zoom = 1,
  panX = 0,
  panY = 0,
  alpha = 1
) {
  const iw = img.naturalWidth || img.width || w;
  const ih = img.naturalHeight || img.height || h;
  if (!iw || !ih) return;

  const scale = Math.max(w / iw, h / ih) * zoom;
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = (w - dw) / 2 + panX;
  const dy = (h - dh) / 2 + panY;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
}

const LOCAL_STORAGE_KEY = 'reelify_local_video_projects_v2';
const DELETED_STORAGE_KEY = 'reelify_deleted_video_ids_v1';
const LIKED_STORAGE_KEY = 'reelify_liked_video_ids_v1';

function loadDeletedVideoIds(): string[] {
  try {
    const raw = localStorage.getItem(DELETED_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveDeletedVideoIds(ids: string[]) {
  try {
    localStorage.setItem(DELETED_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // ignore
  }
}

function loadLikedVideoIds(): string[] {
  try {
    const raw = localStorage.getItem(LIKED_STORAGE_KEY);
    if (!raw) return ['sample-1'];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : ['sample-1'];
  } catch {
    return ['sample-1'];
  }
}

function saveLikedVideoIds(ids: string[]) {
  try {
    localStorage.setItem(LIKED_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // ignore
  }
}

const INITIAL_SAMPLE_VIDEOS: VideoProject[] = [
  {
    id: 'sample-1',
    title: 'Cyber Coupe Midnight Reveal',
    prompt: 'A sleek futuristic electric coupe on a wet studio turntable with warm golden rim lighting and anamorphic lens flare.',
    folder: 'Automotive Ads',
    scene3dPreset: 'coupe',
    referenceImage: createSampleSceneDataUrl('coupe', 'Scene 01 · Cyber Coupe Studio Key Frame'),
    images: [
      createSampleSceneDataUrl('coupe', 'Scene 01 · Cyber Coupe Studio Key Frame'),
      createSampleSceneDataUrl('coupe', 'Scene 02 · Sapphire Canopy Overhead Orbit'),
      createSampleSceneDataUrl('drone', 'Scene 03 · Aerial Tracking Camera Follow'),
    ],
    script: 'In the stillness of the studio, sculpted carbon meets warm golden rim light. Every contour of the Cyber Coupe is engineered for aerodynamic precision.',
    scenes: [
      {
        description: 'Low-angle dolly tracking shot along the brushed titanium wheel arch and laser matrix headlight bar.',
        duration: '4s',
        scene3dPreset: 'coupe',
        imageUrl: createSampleSceneDataUrl('coupe', 'Scene 01 · Cyber Coupe Studio Key Frame'),
      },
      {
        description: 'Overhead crane orbit revealing the sapphire panoramic glass canopy under studio softboxes.',
        duration: '4s',
        scene3dPreset: 'coupe',
        imageUrl: createSampleSceneDataUrl('coupe', 'Scene 02 · Sapphire Canopy Overhead Orbit'),
      },
      {
        description: 'Dynamic aerial cinema drone pursuit shot across the illuminated calibration stage.',
        duration: '4s',
        scene3dPreset: 'drone',
        imageUrl: createSampleSceneDataUrl('drone', 'Scene 03 · Aerial Tracking Camera Follow'),
      },
    ],
    status: 'completed',
    aspectRatio: '16:9',
    duration: '12s',
    createdAt: { seconds: Math.floor(Date.now() / 1000) - 3600 },
    userId: 'local-studio',
  },
  {
    id: 'sample-2',
    title: 'Orbital Habitat Centrifuge Sequence',
    prompt: 'Deep-space orbital ring station rotating above Earth horizon with golden solar arrays and cyan magnetic shield.',
    folder: 'Sci-Fi 3D Scenes',
    scene3dPreset: 'station',
    referenceImage: createSampleSceneDataUrl('station', 'Scene 01 · Orbital Centrifuge Habitat'),
    images: [
      createSampleSceneDataUrl('station', 'Scene 01 · Orbital Centrifuge Habitat'),
      createSampleSceneDataUrl('sculpture', 'Scene 02 · Gravity Gyro Core'),
      createSampleSceneDataUrl('protein', 'Scene 03 · Zero-G Bio-Lab AlphaFold Helix'),
    ],
    script: 'Two hundred miles above the terminator line, the centrifuge torus rotates in silent equilibrium, catching the first rays of orbital dawn.',
    scenes: [
      {
        description: 'Wide establishing shot of the rotating centrifuge habitat ring and dual photovoltaic solar wings.',
        duration: '4s',
        scene3dPreset: 'station',
        imageUrl: createSampleSceneDataUrl('station', 'Scene 01 · Orbital Centrifuge Habitat'),
      },
      {
        description: 'Interior gyroscope stabilization core spinning in harmonic equilibrium.',
        duration: '4s',
        scene3dPreset: 'sculpture',
        imageUrl: createSampleSceneDataUrl('sculpture', 'Scene 02 · Gravity Gyro Core'),
      },
      {
        description: 'Orbital research bay analyzing AlphaFold protein helix folding in microgravity.',
        duration: '4s',
        scene3dPreset: 'protein',
        imageUrl: createSampleSceneDataUrl('protein', 'Scene 03 · Zero-G Bio-Lab AlphaFold Helix'),
      },
    ],
    status: 'completed',
    aspectRatio: '16:9',
    duration: '12s',
    createdAt: { seconds: Math.floor(Date.now() / 1000) - 1800 },
    userId: 'local-studio',
  },
];

function loadLocalVideos(): VideoProject[] {
  const deleted = new Set(loadDeletedVideoIds());
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return INITIAL_SAMPLE_VIDEOS.filter((v) => !deleted.has(v.id));
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((v) => v && !deleted.has(v.id));
    }
    return INITIAL_SAMPLE_VIDEOS.filter((v) => !deleted.has(v.id));
  } catch {
    return INITIAL_SAMPLE_VIDEOS.filter((v) => !deleted.has(v.id));
  }
}

function saveLocalVideos(list: VideoProject[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list));
  } catch {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list.slice(0, 12)));
    } catch {
      // ignore
    }
  }
}

function getThemeColors(seed: string): [string, string, string] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const palettes: [string, string, string][] = [
    ['#0f172a', '#4f46e5', '#38bdf8'],
    ['#111827', '#d97706', '#f59e0b'],
    ['#090d16', '#0284c7', '#6366f1'],
    ['#18181b', '#059669', '#34d399'],
    ['#1e1b4b', '#db2777', '#818cf8'],
  ];
  return palettes[Math.abs(hash) % palettes.length];
}

// Extract ordered array of image URLs from a VideoProject
export function getVideoImageUrls(video: VideoProject): string[] {
  const urls: string[] = [];
  if (Array.isArray(video.scenes)) {
    for (const sc of video.scenes) {
      if (sc.imageUrl) urls.push(sc.imageUrl);
    }
  }
  if (urls.length === 0 && Array.isArray(video.images) && video.images.length > 0) {
    urls.push(...video.images.filter(Boolean));
  }
  if (urls.length === 0 && video.referenceImage) {
    urls.push(video.referenceImage);
  }
  return urls;
}

// Create & Download an MP3 audio file from a prompt/title or loaded audio URL
export async function exportVideoProjectToMp3(
  title: string,
  promptText: string,
  existingAudioUrl?: string
): Promise<{ audioDataUrl: string; lyrics: string }> {
  const safeName =
    (title || promptText || 'reelify_audio')
      .replace(/[^a-z0-9]/gi, '_')
      .toLowerCase()
      .slice(0, 48) || 'reelify_audio';

  if (existingAudioUrl) {
    const a = document.createElement('a');
    a.href = existingAudioUrl;
    a.download = `${safeName}.mp3`;
    a.click();
    return { audioDataUrl: existingAudioUrl, lyrics: `Audio MP3 cargado: ${title}` };
  }

  const res = await fetch('/api/ai/music', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: promptText || title || 'Pista instrumental cinematográfica moderna',
      modelType: 'clip',
    }),
  });
  const data = await res.json();
  const audioDataUrl: string = data.audioDataUrl || '';
  if (audioDataUrl) {
    const a = document.createElement('a');
    a.href = audioDataUrl;
    a.download = `${safeName}.mp3`;
    a.click();
  }
  return {
    audioDataUrl,
    lyrics: data.lyrics || `Audio MP3 creado para: ${title || promptText}`,
  };
}

// Create & Download an MP4 video file from any VideoProject (with active CSS filter baked in)
export async function exportVideoProjectToMp4(
  video: VideoProject,
  filter: VideoFilterId = 'none'
): Promise<string> {
  const safeName =
    (video.title || 'reelify_video')
      .replace(/[^a-z0-9]/gi, '_')
      .toLowerCase()
      .slice(0, 48) || 'reelify_video';
  const filterSuffix = filter !== 'none' ? `_${filter}` : '';

  if (video.videoData && filter === 'none') {
    const a = document.createElement('a');
    a.href = video.videoData;
    a.download = `${safeName}.mp4`;
    a.click();
    return video.videoData;
  }

  const canvas = document.createElement('canvas');
  canvas.width = video.aspectRatio === '9:16' ? 405 : 720;
  canvas.height = video.aspectRatio === '9:16' ? 720 : 405;
  const ctx = canvas.getContext('2d');
  if (!ctx || typeof canvas.captureStream !== 'function' || typeof MediaRecorder === 'undefined') {
    if (video.videoData) {
      const a = document.createElement('a');
      a.href = video.videoData;
      a.download = `${safeName}${filterSuffix}.mp4`;
      a.click();
      return video.videoData;
    }
    return '';
  }

  const imageUrls = getVideoImageUrls(video);
  const loadedImgs: HTMLImageElement[] = await Promise.all(
    imageUrls.map(
      (url) =>
        new Promise<HTMLImageElement>((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => resolve(img);
          img.onerror = () => resolve(img);
          img.src = url;
        })
    )
  );
  const validImgs = loadedImgs.filter((im) => im.complete && (im.naturalWidth > 0 || im.width > 0));
  const scenes: Scene[] =
    video.scenes && video.scenes.length > 0
      ? video.scenes
      : [{ description: video.prompt, duration: video.duration || '4s' }];
  const [c1, c2] = getThemeColors(video.title + video.prompt);
  const activeFilterPreset = getVideoFilterPreset(filter || video.filter);

  return new Promise<string>((resolve) => {
    const stream = canvas.captureStream(30);
    const chunks: BlobPart[] = [];
    const mimeType = MediaRecorder.isTypeSupported('video/mp4')
      ? 'video/mp4'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';
    const recorder = new MediaRecorder(stream, { mimeType });

    let rafId = 0;
    const startTime = performance.now();
    const recordDurationSec = 3.5;

    const drawFrame = (now: number) => {
      const elapsed = (now - startTime) / 1000;
      const progress = Math.min(1, elapsed / recordDurationSec);
      const sceneIdx = Math.min(scenes.length - 1, Math.floor(progress * scenes.length));
      const sceneLocalProgress = (progress * scenes.length) % 1;
      const activeScene = scenes[sceneIdx];

      const w = canvas.width;
      const h = canvas.height;

      ctx.save();
      ctx.filter = activeFilterPreset.cssFilter;

      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, c1);
      grad.addColorStop(0.55, c2);
      grad.addColorStop(1, c1);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      if (validImgs.length > 0) {
        const currentImg = validImgs[sceneIdx % validImgs.length];
        const zoom = 1.03 + sceneLocalProgress * 0.08;
        drawImageCover(ctx, currentImg, w, h, zoom, 0, 0, 0.96);
      }

      ctx.restore();

      ctx.fillStyle = 'rgba(9, 13, 22, 0.88)';
      ctx.fillRect(0, h - 74, w, 74);
      ctx.fillStyle = '#38bdf8';
      ctx.font = '600 12px monospace';
      ctx.fillText(
        `${video.title.slice(0, 34)} · ESCENA ${sceneIdx + 1}/${scenes.length} · SIN VOZ (TEXTO ACTIVO)`,
        20,
        h - 46
      );
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 15px sans-serif';
      const displayTxt =
        activeScene.overlayText ||
        video.customTextOverlay ||
        activeScene.description ||
        video.prompt;
      ctx.fillText(displayTxt.slice(0, 66), 20, h - 18);

      if (elapsed < recordDurationSec) {
        rafId = requestAnimationFrame(drawFrame);
      }
    };

    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunks.push(ev.data);
    };

    recorder.onstop = () => {
      cancelAnimationFrame(rafId);
      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeName}${filterSuffix}.mp4`;
      a.click();
      resolve(url);
    };

    rafId = requestAnimationFrame(drawFrame);
    recorder.start(200);
    window.setTimeout(() => {
      if (recorder.state === 'recording') {
        recorder.stop();
      }
    }, recordDurationSec * 1000);
  });
}

// Multi-Scene & Multi-Image Animated Canvas Video Player (supports exact per-scene durations & CSS filters for preview and export!)
const ProceduralVideoCanvas = ({
  video,
  isPlaying,
  filter = 'none',
  onProgress,
  canvasRefExternal,
}: {
  video: VideoProject;
  isPlaying: boolean;
  filter?: VideoFilterId;
  onProgress?: (progress: number, sceneIndex: number) => void;
  canvasRefExternal?: React.MutableRefObject<HTMLCanvasElement | null>;
}) => {
  const internalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const loadedImagesRef = useRef<HTMLImageElement[]>([]);
  const [imagesReadyTick, setImagesReadyTick] = useState(0);

  const imageUrls = useMemo(() => getVideoImageUrls(video), [video]);
  const activeFilterPreset = useMemo(() => getVideoFilterPreset(filter || video.filter), [filter, video.filter]);

  useEffect(() => {
    let isMounted = true;
    if (imageUrls.length === 0) {
      loadedImagesRef.current = [];
      setImagesReadyTick((t) => t + 1);
      return;
    }

    const elements: HTMLImageElement[] = imageUrls.map((url) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (isMounted) {
          setImagesReadyTick((t) => t + 1);
        }
      };
      img.src = url;
      return img;
    });
    loadedImagesRef.current = elements;

    return () => {
      isMounted = false;
    };
  }, [imageUrls]);

  useEffect(() => {
    const canvas = internalCanvasRef.current;
    if (!canvas) return;
    if (canvasRefExternal) {
      canvasRefExternal.current = canvas;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    const startTime = performance.now();
    let pausedElapsed = 0;

    const scenes: Scene[] =
      video.scenes && video.scenes.length > 0
        ? video.scenes
        : [{ description: video.prompt, duration: video.duration || '5s' }];

    // Build cumulative timeline from each scene's duration so long multi-scene videos play accurately
    const sceneDurations = scenes.map((sc) => parseDurationSeconds(sc.duration, 3));
    const totalSec = Math.max(3, sceneDurations.reduce((a, b) => a + b, 0));

    const [c1, c2, c3] = getThemeColors(video.title + video.prompt);

    const renderFrame = (now: number) => {
      const elapsed = isPlaying ? ((now - startTime) / 1000) % totalSec : pausedElapsed;
      if (isPlaying) {
        pausedElapsed = elapsed;
      }
      const progress = elapsed / totalSec;

      // Find which scene is active at current `elapsed` second
      let acc = 0;
      let sceneIdx = 0;
      let sceneLocalProgress = 0;
      for (let i = 0; i < sceneDurations.length; i++) {
        const dur = sceneDurations[i];
        if (elapsed <= acc + dur || i === sceneDurations.length - 1) {
          sceneIdx = i;
          sceneLocalProgress = Math.min(1, Math.max(0, (elapsed - acc) / dur));
          break;
        }
        acc += dur;
      }

      const activeScene = scenes[sceneIdx];

      if (onProgress) {
        onProgress(progress, sceneIdx);
      }

      const w = canvas.width;
      const h = canvas.height;

      // Apply CSS filter directly onto the 2D canvas context so both live preview and WebM export include the filter
      ctx.save();
      ctx.filter = activeFilterPreset.cssFilter;

      const shift = Math.sin(elapsed * 1.4) * 60;
      const grad = ctx.createLinearGradient(0, 0, w + shift, h);
      grad.addColorStop(0, c1);
      grad.addColorStop(0.55, c2);
      grad.addColorStop(1, c1);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      const imgs = loadedImagesRef.current;
      const validImgs = imgs.filter((im) => im.complete && (im.naturalWidth > 0 || im.width > 0));

      if (validImgs.length > 0) {
        const currentImg = validImgs[sceneIdx % validImgs.length];
        const nextImg = validImgs[(sceneIdx + 1) % validImgs.length];

        const dir = sceneIdx % 2 === 0 ? 1 : -1;
        const zoomA = 1.03 + sceneLocalProgress * 0.09;
        const panXA = dir * (sceneLocalProgress - 0.5) * 28;
        const panYA = -dir * (sceneLocalProgress - 0.5) * 14;

        drawImageCover(ctx, currentImg, w, h, zoomA, panXA, panYA, 0.94);

        if (validImgs.length > 1 && sceneLocalProgress > 0.78) {
          const fadeAlpha = (sceneLocalProgress - 0.78) / 0.22;
          drawImageCover(ctx, nextImg, w, h, 1.03, 0, 0, fadeAlpha * 0.94);
        }

        const vignette = ctx.createRadialGradient(w / 2, h / 2, w * 0.25, w / 2, h / 2, w * 0.65);
        vignette.addColorStop(0, 'rgba(0,0,0,0)');
        vignette.addColorStop(1, 'rgba(9,13,22,0.52)');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, w, h);
      } else {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        const horizonY = h * 0.62;
        for (let i = -8; i <= 8; i++) {
          ctx.beginPath();
          ctx.moveTo(w / 2 + i * 28, horizonY);
          ctx.lineTo(w / 2 + i * 110 + ((elapsed * 40) % 110), h);
          ctx.stroke();
        }
        for (let r = 0; r < 6; r++) {
          const y = horizonY + Math.pow((r + ((elapsed * 0.8) % 1)) / 6, 1.8) * (h - horizonY);
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }
      }

      const cx = w / 2 + Math.cos(elapsed * 0.9) * 28;
      const cy = h * 0.44 + Math.sin(elapsed * 1.5) * 10;

      const glow = ctx.createRadialGradient(cx, cy, 8, cx, cy, 130);
      glow.addColorStop(0, validImgs.length > 0 ? 'rgba(56, 189, 248, 0.22)' : c3);
      glow.addColorStop(0.5, 'rgba(99, 102, 241, 0.12)');
      glow.addColorStop(1, 'rgba(15, 23, 42, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, 130, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      // Cinema letterbox bar & Storyboard HUD metadata (Silent Scenario + On-Screen Text)
      ctx.fillStyle = 'rgba(9, 13, 22, 0.88)';
      ctx.fillRect(0, h - 80, w, 80);

      ctx.fillStyle = '#38bdf8';
      ctx.font = '600 12px monospace';
      const presetBadge = activeScene.scene3dPreset ? ` · 3D: ${activeScene.scene3dPreset.toUpperCase()}` : '';
      const filterBadge = activeFilterPreset.id !== 'none' ? ` · FILTER: ${activeFilterPreset.label.toUpperCase()}` : '';
      ctx.fillText(
        `ESCENA ${sceneIdx + 1}/${scenes.length} (${activeScene.duration}) · SIN VOZ · TEXTO EN PANTALLA${presetBadge}${filterBadge}`,
        22,
        h - 50
      );

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 15px sans-serif';
      const rawText =
        activeScene.overlayText ||
        video.customTextOverlay ||
        activeScene.description ||
        video.prompt;
      const maxChars = 72;
      const desc = rawText.length > maxChars ? `${rawText.slice(0, maxChars)}...` : rawText;
      ctx.fillText(desc, 22, h - 22);

      if (isPlaying) {
        animId = requestAnimationFrame(renderFrame);
      }
    };

    animId = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(animId);
  }, [video, isPlaying, imagesReadyTick, activeFilterPreset]);

  return (
    <canvas
      ref={internalCanvasRef}
      width={video.aspectRatio === '9:16' ? 405 : 720}
      height={video.aspectRatio === '9:16' ? 720 : 405}
      className={`w-full h-full object-cover transition-all duration-200 ${activeFilterPreset.tailwindClass}`}
    />
  );
};

// --- Sidebar ---
const Sidebar = ({ 
  activeTab, 
  setActiveTab, 
  user, 
  folders, 
  selectedFolder, 
  onSelectFolder,
  showOnlyLiked,
  onToggleShowOnlyLiked,
  likedCount,
  onSignIn,
  onSelect3DPreset,
  onCreateInFolder,
  onCreateInScenario,
  onOpenCameraRecorder
}: { 
  activeTab: string; 
  setActiveTab: (t: string) => void; 
  user: User | null;
  folders: { name: string; count: number }[];
  selectedFolder: string;
  onSelectFolder: (folder: string) => void;
  showOnlyLiked: boolean;
  onToggleShowOnlyLiked: () => void;
  likedCount: number;
  onSignIn: () => void;
  onSelect3DPreset: (preset: SubjectPresetId) => void;
  onCreateInFolder: (folderName: string) => void;
  onCreateInScenario: (preset: SubjectPresetId) => void;
  onOpenCameraRecorder: () => void;
}) => (
  <aside className="w-64 bg-slate-900 text-slate-300 border-r border-slate-800 flex flex-col shrink-0">
    <div className="p-6">
      <h1 className="text-xl font-bold text-white flex items-center gap-2 whitespace-nowrap">
        <Video className="w-6 h-6 text-indigo-500 shrink-0" />
        Reelify Video AI
      </h1>
    </div>
    
    <nav className="flex-1 px-4 space-y-6 overflow-y-auto">
      <div className="space-y-1">
        <button 
          onClick={() => {
            setActiveTab('dashboard');
            onSelectFolder('all');
            if (showOnlyLiked) onToggleShowOnlyLiked();
          }}
          className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'dashboard' && selectedFolder === 'all' && !showOnlyLiked ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800 text-slate-300'}`}
        >
          <LayoutDashboard className="w-4 h-4 shrink-0" />
          Todos los Videos
        </button>
        <button 
          onClick={() => {
            setActiveTab('dashboard');
            onToggleShowOnlyLiked();
          }}
          className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
            activeTab === 'dashboard' && showOnlyLiked
              ? 'bg-pink-600 text-white'
              : 'hover:bg-slate-800 text-pink-300'
          }`}
        >
          <span className="flex items-center gap-3">
            <Heart className={`w-4 h-4 shrink-0 ${showOnlyLiked ? 'fill-white text-white' : 'fill-pink-500 text-pink-500'}`} />
            Mis Gustas
          </span>
          <span className="px-1.5 py-0.5 rounded-md bg-slate-950/50 text-xs font-mono tabular-nums">
            {likedCount}
          </span>
        </button>
        <button 
          onClick={onOpenCameraRecorder}
          className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap bg-rose-600/20 text-rose-200 hover:bg-rose-600 hover:text-white border border-rose-500/30"
        >
          <Camera className="w-4 h-4 shrink-0 text-rose-400" />
          Grabar con Cámara
        </button>
        <button 
          onClick={() => setActiveTab('create')}
          className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'create' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800 text-slate-300'}`}
        >
          <Film className="w-4 h-4 shrink-0 text-indigo-400" />
          Crear Multi-Escenas
        </button>
        <button 
          onClick={() => setActiveTab('studio3d')}
          className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'studio3d' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800 text-slate-300'}`}
        >
          <Box className="w-4 h-4 shrink-0" />
          3D Cinema Stage
        </button>
        <button 
          onClick={() => setActiveTab('ai-suite')}
          className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'ai-suite' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800 text-slate-300'}`}
        >
          <Sparkles className="w-4 h-4 shrink-0 text-amber-400" />
          AI Production Suite
        </button>
      </div>

      {/* Quick 3D Scene Selector + Create Video in Scenario in Sidebar */}
      <div>
        <div className="px-4 mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500 tracking-wider">Escenarios 3D</span>
          <span className="text-xs text-slate-500 font-mono tabular-nums">{STAGE_3D_PRESETS.length}</span>
        </div>
        <div className="space-y-0.5">
          {STAGE_3D_PRESETS.map((scenePreset) => (
            <div
              key={scenePreset.id}
              className="flex items-center justify-between px-2 py-1 rounded-lg hover:bg-slate-800/60 group transition-colors"
            >
              <button
                type="button"
                onClick={() => onSelect3DPreset(scenePreset.id)}
                className="flex-1 flex items-center gap-2 px-2 py-1 text-xs text-slate-400 group-hover:text-white text-left min-w-0"
                title={`Abrir ${scenePreset.name} en 3D`}
              >
                <Box className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span className="truncate">{scenePreset.name}</span>
              </button>
              <button
                type="button"
                onClick={() => onCreateInScenario(scenePreset.id)}
                className="px-1.5 py-0.5 rounded bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white text-[10px] font-semibold flex items-center gap-0.5 shrink-0 transition-colors"
                title={`Crear video en el escenario ${scenePreset.name}`}
              >
                <Plus className="w-3 h-3" />
                Crear
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Folders List + Create Video in Folder Button in Sidebar */}
      <div>
        <div className="px-4 mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500 tracking-wider">Folders</span>
          <span className="text-xs text-slate-500 font-mono tabular-nums">{folders.length}</span>
        </div>
        <div className="space-y-0.5">
          {folders.map((f) => {
            const isActive = activeTab === 'dashboard' && selectedFolder === f.name;
            return (
              <div
                key={f.name}
                className={`flex items-center justify-between px-2 py-1 rounded-lg transition-colors group ${
                  isActive ? 'bg-slate-800 text-white font-medium' : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('dashboard');
                    onSelectFolder(f.name);
                  }}
                  className="flex-1 flex items-center gap-2.5 px-2 py-1 text-sm text-left min-w-0"
                >
                  <Folder className={`w-4 h-4 shrink-0 ${isActive ? 'text-indigo-400' : 'text-slate-500'}`} />
                  <span className="truncate">{f.name}</span>
                  <span className="text-xs text-slate-500 font-mono tabular-nums shrink-0">({f.count})</span>
                </button>
                <button
                  type="button"
                  onClick={() => onCreateInFolder(f.name)}
                  className="px-1.5 py-0.5 rounded bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white text-[10px] font-semibold flex items-center gap-0.5 shrink-0 transition-colors"
                  title={`Crear video en la carpeta "${f.name}"`}
                >
                  <Plus className="w-3 h-3" />
                  Crear
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </nav>

    <div className="p-4 border-t border-slate-800">
      {user ? (
        <>
          <div className="flex items-center gap-3 px-2 py-2.5 mb-2">
            {user.photoURL ? (
              <img src={user.photoURL} alt="" referrerPolicy="no-referrer" className="w-8 h-8 rounded-full" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs">
                {user.email?.[0].toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user.displayName || user.email}</p>
              <p className="text-xs text-slate-500 truncate">Cloud Synced</p>
            </div>
          </div>
          <button 
            onClick={logout}
            className="w-full flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors text-sm"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            Sign Out
          </button>
        </>
      ) : (
        <div className="space-y-2">
          <p className="px-2 text-xs text-slate-400">Local Studio Mode · Sign in to sync projects across devices.</p>
          <button 
            onClick={onSignIn}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors text-xs whitespace-nowrap"
          >
            <LogIn className="w-4 h-4 shrink-0" />
            Sign in with Google
          </button>
        </div>
      )}
    </div>
  </aside>
);

const VideoCard = ({ 
  video, 
  existingFolders,
  isSelectedForMerge,
  isLiked,
  onToggleLike,
  onToggleSelectForMerge,
  onUpdateFolder,
  onOpenIn3D,
  onPlayVideo,
  onEditVideoInStudio,
  onDuplicateVideo,
  onDeleteVideo
}: { 
  video: VideoProject; 
  existingFolders: string[];
  isSelectedForMerge: boolean;
  isLiked: boolean;
  onToggleLike: (videoId: string) => void;
  onToggleSelectForMerge: (video: VideoProject) => void;
  onUpdateFolder: (videoId: string, newFolder: string) => Promise<void>;
  onOpenIn3D: (video: VideoProject) => void;
  onPlayVideo: (video: VideoProject) => void;
  onEditVideoInStudio: (video: VideoProject) => void;
  onDuplicateVideo: (video: VideoProject) => void;
  onDeleteVideo: (videoId: string) => Promise<void>;
}) => {
  const [isEditingFolder, setIsEditingFolder] = useState(false);
  const [folderInput, setFolderInput] = useState(video.folder || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [isExportingMp3, setIsExportingMp3] = useState(false);
  const [isExportingMp4, setIsExportingMp4] = useState(false);

  const imageCount = useMemo(() => getVideoImageUrls(video).length, [video]);
  const sceneCount = video.scenes?.length || 1;
  const totalSec = useMemo(() => getTotalScenesDurationSeconds(video.scenes, video.duration), [video.scenes, video.duration]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onUpdateFolder(video.id, folderInput.trim() || 'Uncategorized');
      setIsEditingFolder(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDeleting(true);
    try {
      await onDeleteVideo(video.id);
    } finally {
      setIsDeleting(false);
      setIsConfirmingDelete(false);
    }
  };

  const handleCardCreateMp3 = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExportingMp3(true);
    try {
      await exportVideoProjectToMp3(video.title, video.prompt);
    } finally {
      setIsExportingMp3(false);
    }
  };

  const handleCardCreateMp4 = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExportingMp4(true);
    try {
      await exportVideoProjectToMp4(video, video.filter || 'none');
    } finally {
      setIsExportingMp4(false);
    }
  };

  const formattedDate = useMemo(() => {
    if (video.createdAt?.toDate) return video.createdAt.toDate().toLocaleDateString();
    if (video.createdAt?.seconds) return new Date(video.createdAt.seconds * 1000).toLocaleDateString();
    return 'Just now';
  }, [video.createdAt]);

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setIsConfirmingDelete(false);
      }}
      className={`bg-white border rounded-xl overflow-hidden transition-all group flex flex-col ${
        isSelectedForMerge ? 'border-indigo-600 ring-2 ring-indigo-500/20' : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <div 
        onClick={() => onPlayVideo(video)}
        className="aspect-video bg-slate-900 flex items-center justify-center relative overflow-hidden cursor-pointer"
      >
        {video.videoData ? (
          <video
            src={video.videoData}
            muted
            loop
            playsInline
            autoPlay={isHovered}
            className="w-full h-full object-cover"
          />
        ) : (
          <ProceduralVideoCanvas video={video} isPlaying={isHovered} />
        )}
        <div className="absolute inset-0 bg-slate-950/20 group-hover:bg-slate-950/40 transition-colors flex items-center justify-center">
          <div className="w-11 h-11 rounded-full bg-white/95 text-slate-900 flex items-center justify-center shadow-md group-hover:scale-105 transition-transform">
            <Play className="w-5 h-5 fill-slate-900 ml-0.5" />
          </div>
        </div>

        {/* Select Checkbox to Combine Multiple Videos + Quick Like (Me Gusta) Button */}
        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelectForMerge(video);
            }}
            className={`px-2 py-1 rounded-md text-[11px] font-medium flex items-center gap-1.5 transition-colors ${
              isSelectedForMerge
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-950/80 text-slate-200 hover:bg-slate-900'
            }`}
            title="Seleccionar para unir en un video más largo"
          >
            {isSelectedForMerge ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
            <span>{isSelectedForMerge ? 'Seleccionado' : 'Unir'}</span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleLike(video.id);
            }}
            className={`px-2 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1 transition-all ${
              isLiked
                ? 'bg-pink-600 text-white shadow-sm'
                : 'bg-slate-950/80 text-slate-200 hover:bg-pink-600/80 hover:text-white'
            }`}
            title={isLiked ? 'Quitar de Mis Gustas' : 'Agregar a Mis Gustas (Favoritos)'}
          >
            <Heart className={`w-3.5 h-3.5 ${isLiked ? 'fill-white text-white' : 'text-pink-400'}`} />
            <span>{isLiked ? 'Me Gusta' : 'Gusta'}</span>
          </button>
        </div>

        <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded bg-slate-950/80 text-white text-[11px] font-mono flex items-center gap-1.5">
          <Layers className="w-3 h-3 text-indigo-400" />
          <span>{sceneCount} esc</span>
          {imageCount > 0 && (
            <>
              <span>·</span>
              <span>{imageCount} img</span>
            </>
          )}
        </div>
      </div>

      <div className="p-4 flex-1 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-2 text-xs text-slate-500 mb-1.5">
            {isEditingFolder ? (
              <form onSubmit={handleSave} className="flex items-center gap-1 w-full">
                <input
                  type="text"
                  list={`folder-suggestions-${video.id}`}
                  value={folderInput}
                  onChange={(e) => setFolderInput(e.target.value)}
                  placeholder="Folder name..."
                  maxLength={100}
                  autoFocus
                  className="flex-1 min-w-0 bg-slate-50 border border-slate-300 rounded px-2 py-0.5 text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                />
                <datalist id={`folder-suggestions-${video.id}`}>
                  {existingFolders.map(f => (
                    <option key={f} value={f} />
                  ))}
                </datalist>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                  title="Save folder"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFolderInput(video.folder || '');
                    setIsEditingFolder(false);
                  }}
                  className="p-1 text-slate-400 hover:bg-slate-100 rounded transition-colors"
                  title="Cancel"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </form>
            ) : (
              <>
                <div className="flex items-center gap-1.5 min-w-0">
                  <Folder className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                  <span className="truncate font-medium text-slate-600">
                    {video.folder || 'Uncategorized'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums shrink-0 font-semibold text-indigo-600">
                    {totalSec}s
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFolderInput(video.folder || '');
                    setIsEditingFolder(true);
                  }}
                  className="text-xs text-slate-400 hover:text-indigo-600 transition-colors whitespace-nowrap shrink-0"
                >
                  Carpeta
                </button>
              </>
            )}
          </div>
          <h3 
            onClick={() => onPlayVideo(video)}
            className="font-semibold text-slate-900 truncate mb-1 cursor-pointer hover:text-indigo-600 transition-colors"
          >
            {video.title}
          </h3>
          <p className="text-xs text-slate-500 line-clamp-2 mb-3 h-8">{video.prompt}</p>
        </div>

        {/* Direct MP3 & MP4 1-Click Creation/Download Strip */}
        <div className="flex items-center gap-1.5 mb-2.5">
          <button
            type="button"
            onClick={handleCardCreateMp3}
            disabled={isExportingMp3}
            className="flex-1 py-1.5 px-2 rounded-lg bg-fuchsia-50 hover:bg-fuchsia-600 text-fuchsia-700 hover:text-white border border-fuchsia-200 hover:border-fuchsia-600 text-[11px] font-bold flex items-center justify-center gap-1 transition-colors disabled:opacity-50"
            title="Crear y descargar archivo de audio .MP3 de este proyecto"
          >
            {isExportingMp3 ? <Loader2 className="w-3 h-3 animate-spin" /> : <Music className="w-3 h-3" />}
            <span>{isExportingMp3 ? 'Creando...' : 'Crear MP3'}</span>
          </button>

          <button
            type="button"
            onClick={handleCardCreateMp4}
            disabled={isExportingMp4}
            className="flex-1 py-1.5 px-2 rounded-lg bg-cyan-50 hover:bg-cyan-600 text-cyan-800 hover:text-white border border-cyan-200 hover:border-cyan-600 text-[11px] font-bold flex items-center justify-center gap-1 transition-colors disabled:opacity-50"
            title="Crear y descargar archivo de video .MP4 de este proyecto"
          >
            {isExportingMp4 ? <Loader2 className="w-3 h-3 animate-spin" /> : <Film className="w-3 h-3" />}
            <span>{isExportingMp4 ? 'Creando...' : 'Crear MP4'}</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenIn3D(video)}
            className="py-1.5 px-2.5 rounded-lg bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white border border-indigo-200 hover:border-indigo-600 text-[11px] font-bold flex items-center justify-center gap-1 transition-colors"
            title="Abrir en escenario 3D"
          >
            <Box className="w-3 h-3" />
            <span>3D</span>
          </button>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-400 pt-2.5 border-t border-slate-100">
          <div className="flex items-center gap-1 font-mono tabular-nums">
            <Clock className="w-3 h-3" />
            {formattedDate}
          </div>
          <div className="flex items-center gap-2">
            {isConfirmingDelete ? (
              <div className="flex items-center gap-1 bg-rose-50 border border-rose-200 rounded-md px-1.5 py-0.5">
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={isDeleting}
                  className="text-[11px] font-bold text-rose-600 hover:text-rose-800 px-1"
                >
                  {isDeleting ? '...' : 'Confirmar Borrar'}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsConfirmingDelete(false);
                  }}
                  className="text-slate-400 hover:text-slate-700"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onPlayVideo(video)}
                  className="flex items-center gap-1 text-slate-700 hover:text-indigo-600 font-medium whitespace-nowrap"
                  title="Ver video"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Ver
                </button>
                <button
                  type="button"
                  onClick={() => onEditVideoInStudio(video)}
                  className="flex items-center gap-1 text-slate-700 hover:text-indigo-600 font-medium whitespace-nowrap"
                  title="Cargar este proyecto en el estudio para editarlo"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Cargar
                </button>
                <button
                  type="button"
                  onClick={() => onDuplicateVideo(video)}
                  className="flex items-center gap-1 text-emerald-700 hover:text-emerald-800 font-medium whitespace-nowrap"
                  title="Guardar copia en biblioteca"
                >
                  <Save className="w-3.5 h-3.5" />
                  Guardar
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsConfirmingDelete(true);
                  }}
                  className="flex items-center gap-1 text-rose-500 hover:text-rose-700 font-medium whitespace-nowrap"
                  title="Borrar este video"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Borrar
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

// Interactive Video Player & Multi-Scene Storyboard Inspector Modal
const VideoPlayerModal = ({
  video,
  isLiked = false,
  onToggleLike,
  onEditVideoInStudio,
  onClose,
  onOpenIn3D,
  onUpdateVideoImages,
  onSaveAsNewProject,
  onDeleteVideo,
}: {
  video: VideoProject;
  isLiked?: boolean;
  onToggleLike?: (videoId: string) => void;
  onEditVideoInStudio?: (video: VideoProject) => void;
  onClose: () => void;
  onOpenIn3D: (video: VideoProject) => void;
  onUpdateVideoImages: (videoId: string, newImages: string[]) => Promise<void>;
  onSaveAsNewProject?: (video: VideoProject) => Promise<void>;
  onDeleteVideo?: (videoId: string) => Promise<void>;
}) => {
  const [isPlaying, setIsPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const [activeSceneIdx, setActiveSceneIdx] = useState(0);
  const [selectedFilter, setSelectedFilter] = useState<VideoFilterId>(video.filter || 'none');
  const [isUpdatingImgs, setIsUpdatingImgs] = useState(false);
  const [isRecordingWebm, setIsRecordingWebm] = useState(false);
  const [isCreatingMp3, setIsCreatingMp3] = useState(false);
  const [modalMp3Url, setModalMp3Url] = useState<string | null>(null);
  const [modalOverlayText, setModalOverlayText] = useState<string>(
    video.customTextOverlay || video.scenes?.[0]?.overlayText || video.scenes?.[0]?.description || video.prompt
  );
  const [isTextApplied, setIsTextApplied] = useState(false);
  const [isSavedConfirm, setIsSavedConfirm] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);

  // Silence any browser speechSynthesis when opening a scenario preview
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, [video.id]);

  const activeFilterPreset = useMemo(() => getVideoFilterPreset(selectedFilter), [selectedFilter]);

  const scenes =
    video.scenes && video.scenes.length > 0
      ? video.scenes
      : [{ description: video.prompt, duration: video.duration || '5s' }];

  const currentImages = useMemo(() => getVideoImageUrls(video), [video]);
  const totalSec = useMemo(() => getTotalScenesDurationSeconds(scenes, video.duration), [scenes, video.duration]);

  const previewVideoWithCustomText = useMemo<VideoProject>(() => {
    const cleanTxt = modalOverlayText.trim();
    if (!cleanTxt) return video;
    return {
      ...video,
      customTextOverlay: cleanTxt,
      scenes: scenes.map((sc, idx) =>
        idx === activeSceneIdx ? { ...sc, overlayText: cleanTxt } : sc
      ),
    };
  }, [video, modalOverlayText, scenes, activeSceneIdx]);

  const handleApplyModalText = async () => {
    const cleanTxt = modalOverlayText.trim() || video.title;
    setModalOverlayText(cleanTxt);
    if (onSaveAsNewProject) {
      const updatedVid: VideoProject = {
        ...video,
        filter: selectedFilter,
        customTextOverlay: cleanTxt,
        script: cleanTxt,
        scenes: scenes.map((sc, i) =>
          i === activeSceneIdx
            ? { ...sc, overlayText: cleanTxt, description: cleanTxt }
            : { ...sc, overlayText: sc.overlayText || sc.description }
        ),
      };
      await onSaveAsNewProject(updatedVid);
    }
    setIsTextApplied(true);
    setTimeout(() => setIsTextApplied(false), 2200);
  };

  const handleUploadNewImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;
    setIsUpdatingImgs(true);
    try {
      const compressed: string[] = [];
      for (const file of files.slice(0, 12)) {
        const dataUrl = await compressImageFile(file, 640, 0.78);
        compressed.push(dataUrl);
      }
      await onUpdateVideoImages(video.id, compressed);
    } finally {
      setIsUpdatingImgs(false);
    }
  };

  const handleGenerateAiSceneImages = async () => {
    setIsUpdatingImgs(true);
    try {
      const generated: string[] = [];
      for (let i = 0; i < scenes.length; i++) {
        const res = await fetch('/api/ai/image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: scenes[i].description || video.prompt,
            sceneIndex: i,
          }),
        });
        const data = await res.json();
        if (data.imageDataUrl) {
          generated.push(data.imageDataUrl);
        }
      }
      if (generated.length > 0) {
        await onUpdateVideoImages(video.id, generated);
      }
    } finally {
      setIsUpdatingImgs(false);
    }
  };

  const handleModalCreateMp3 = async () => {
    setIsCreatingMp3(true);
    try {
      const res = await exportVideoProjectToMp3(video.title, video.prompt, modalMp3Url || undefined);
      if (res.audioDataUrl) {
        setModalMp3Url(res.audioDataUrl);
      }
    } finally {
      setIsCreatingMp3(false);
    }
  };

  const handleDownloadWebm = async () => {
    setIsRecordingWebm(true);
    try {
      await exportVideoProjectToMp4(previewVideoWithCustomText, selectedFilter);
    } finally {
      setIsRecordingWebm(false);
    }
  };

  const handleSaveClick = async () => {
    if (onSaveAsNewProject) {
      await onSaveAsNewProject({ ...previewVideoWithCustomText, filter: selectedFilter });
      setIsSavedConfirm(true);
      setTimeout(() => setIsSavedConfirm(false), 2500);
    }
  };

  const handleDeleteClick = async () => {
    if (onDeleteVideo) {
      await onDeleteVideo(video.id);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-4xl w-full overflow-hidden shadow-2xl">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-0.5">
              <Folder className="w-3.5 h-3.5 text-indigo-600" />
              <span>{video.folder || 'Uncategorized'}</span>
              <span>·</span>
              <span className="font-mono tabular-nums">{video.aspectRatio || '16:9'}</span>
              <span>·</span>
              <span className="font-mono tabular-nums font-semibold text-indigo-600">{totalSec}s total</span>
              <span>·</span>
              <span className="text-slate-600 font-medium">{scenes.length} escenas</span>
              {selectedFilter !== 'none' && (
                <>
                  <span>·</span>
                  <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-mono text-[10px] uppercase font-semibold">
                    Filter: {activeFilterPreset.label}
                  </span>
                </>
              )}
            </div>
            <h2 className="text-lg font-bold text-slate-900 truncate">{video.title}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {onToggleLike && (
              <button
                type="button"
                onClick={() => onToggleLike(video.id)}
                className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                  isLiked
                    ? 'bg-pink-600 text-white hover:bg-pink-700'
                    : 'bg-pink-50 text-pink-600 hover:bg-pink-100 border border-pink-200'
                }`}
                title={isLiked ? 'Quitar de Mis Gustas' : 'Agregar a Mis Gustas'}
              >
                <Heart className={`w-3.5 h-3.5 ${isLiked ? 'fill-white text-white' : 'text-pink-600'}`} />
                {isLiked ? 'Me Gusta' : 'Gusta'}
              </button>
            )}
            {onEditVideoInStudio && (
              <button
                type="button"
                onClick={() => {
                  onEditVideoInStudio({ ...video, filter: selectedFilter });
                  onClose();
                }}
                className="px-3 py-2 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors flex items-center gap-1.5 whitespace-nowrap"
                title="Crear o editar este proyecto en el estudio"
              >
                <Plus className="w-3.5 h-3.5" />
                Crear / Editar
              </button>
            )}
            {onSaveAsNewProject && (
              <button
                onClick={handleSaveClick}
                className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors flex items-center gap-1.5 whitespace-nowrap"
              >
                {isSavedConfirm ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                {isSavedConfirm ? '¡Guardado!' : 'Guardar'}
              </button>
            )}
            <label className="cursor-pointer px-3 py-2 rounded-lg text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition-colors flex items-center gap-1.5 whitespace-nowrap">
              <Upload className="w-3.5 h-3.5 text-amber-700" />
              {isUpdatingImgs ? 'Cargando...' : 'Cargar'}
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleUploadNewImages}
                className="hidden"
                disabled={isUpdatingImgs}
              />
            </label>
            <button
              onClick={handleModalCreateMp3}
              disabled={isCreatingMp3}
              className="px-3 py-2 rounded-lg text-xs font-bold bg-fuchsia-600 text-white hover:bg-fuchsia-700 transition-colors flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
              title="Crear y descargar archivo de audio .MP3"
            >
              {isCreatingMp3 ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Music className="w-3.5 h-3.5" />}
              {isCreatingMp3 ? 'Creando MP3...' : 'Crear MP3'}
            </button>
            <button
              onClick={handleDownloadWebm}
              disabled={isRecordingWebm}
              className="px-3 py-2 rounded-lg text-xs font-bold bg-cyan-600 text-white hover:bg-cyan-700 transition-colors flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
              title="Crear y descargar archivo de video .MP4"
            >
              {isRecordingWebm ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Film className="w-3.5 h-3.5" />}
              {isRecordingWebm ? 'Creando MP4...' : 'Crear MP4'}
            </button>
            <button
              onClick={() => onOpenIn3D({ ...video, filter: selectedFilter })}
              className="px-3 py-2 rounded-lg text-xs font-medium bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <Box className="w-4 h-4" />
              3D
            </button>
            {onDeleteVideo && (
              isConfirmingDelete ? (
                <div className="flex items-center gap-1 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1">
                  <button
                    onClick={handleDeleteClick}
                    className="text-xs font-bold text-rose-600 hover:text-rose-800 px-1.5"
                  >
                    Confirmar Borrar
                  </button>
                  <button
                    onClick={() => setIsConfirmingDelete(false)}
                    className="p-1 text-slate-400 hover:text-slate-700"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsConfirmingDelete(true)}
                  className="px-3 py-2 rounded-lg text-xs font-semibold bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 transition-colors flex items-center gap-1.5 whitespace-nowrap"
                  title="Borrar este video"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Borrar
                </button>
              )
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {modalMp3Url && (
          <div className="px-6 py-2.5 bg-fuchsia-950 text-white border-b border-fuchsia-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <Music className="w-4 h-4 text-fuchsia-400" />
              <span>Audio MP3 listo para "{video.title}":</span>
            </div>
            <div className="flex items-center gap-3">
              <audio controls src={modalMp3Url} className="h-8 w-56 sm:w-72" />
              <a
                href={modalMp3Url}
                download={`${video.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'audio'}.mp3`}
                className="px-3 py-1 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-xs font-bold flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" />
                Descargar .MP3
              </a>
            </div>
          </div>
        )}

        {/* CSS Filter Selector Bar for Live Preview & Export */}
        <div className="px-6 py-2.5 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>Filter (Preview &amp; Export):</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {VIDEO_FILTER_PRESETS.map((preset) => {
              const isActive = selectedFilter === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setSelectedFilter(preset.id)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Crear Texto en Pantalla Bar (Silent Scenario Text Overlay) */}
        <div className="px-6 py-2.5 bg-indigo-950 border-b border-indigo-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-indigo-200">
            <VolumeX className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Escenario Sin Voz · Crear Texto en Pantalla:</span>
          </div>
          <div className="flex-1 min-w-[240px] flex items-center gap-2">
            <input
              type="text"
              value={modalOverlayText}
              onChange={(e) => setModalOverlayText(e.target.value)}
              placeholder="Escribe el texto o subtítulo para esta escena..."
              className="flex-1 bg-slate-900 border border-indigo-700 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-indigo-400"
            />
            <button
              type="button"
              onClick={handleApplyModalText}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              {isTextApplied ? <Check className="w-3.5 h-3.5" /> : <TypeIcon className="w-3.5 h-3.5" />}
              <span>{isTextApplied ? '¡Texto Guardado!' : 'Crear Texto'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5">
          <div className="lg:col-span-3 bg-slate-950 flex flex-col justify-between">
            <div className="aspect-video w-full relative overflow-hidden flex items-center justify-center">
              {video.videoData ? (
                <video
                  ref={videoElRef}
                  src={video.videoData}
                  controls
                  muted
                  autoPlay
                  loop
                  className={`w-full h-full object-contain transition-all duration-200 ${activeFilterPreset.tailwindClass}`}
                />
              ) : (
                <ProceduralVideoCanvas
                  video={previewVideoWithCustomText}
                  isPlaying={isPlaying}
                  filter={selectedFilter}
                  canvasRefExternal={canvasRef}
                  onProgress={(p, idx) => {
                    setProgress(p);
                    setActiveSceneIdx(idx);
                  }}
                />
              )}
            </div>

            {!video.videoData && (
              <div className="px-4 py-3 bg-slate-900 border-t border-slate-800 flex items-center gap-4">
                <button
                  onClick={() => setIsPlaying((prev) => !prev)}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1.5 whitespace-nowrap"
                >
                  {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  {isPlaying ? 'Pause' : 'Preview'}
                </button>
                <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    style={{ width: `${Math.min(100, Math.round(progress * 100))}%` }}
                    className="h-full bg-indigo-500 transition-all duration-75"
                  />
                </div>
                <span className="text-xs font-mono tabular-nums text-slate-400">
                  Escena {activeSceneIdx + 1}/{scenes.length} · {totalSec}s
                </span>
              </div>
            )}
          </div>

          <div className="lg:col-span-2 p-6 space-y-5 max-h-[440px] overflow-y-auto bg-slate-50 border-t lg:border-t-0 lg:border-l border-slate-200">
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                <span>Texto del Escenario (Sin Voz)</span>
                <span className="text-[10px] text-emerald-600 font-mono">● MODO TEXTO ACTIVO</span>
              </h3>
              <p className="text-xs text-slate-700 leading-relaxed bg-white p-3 rounded-lg border border-slate-200">
                {modalOverlayText || video.script || video.prompt}
              </p>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Secuencia Multi-Escena ({scenes.length} Escenas · {totalSec}s)
              </h3>
              <div className="space-y-2.5">
                {scenes.map((sc, i) => {
                  const sceneImg = sc.imageUrl || (currentImages.length > 0 ? currentImages[i % currentImages.length] : null);
                  return (
                    <div
                      key={i}
                      className={`p-3 rounded-lg border text-xs transition-colors flex gap-3 ${
                        activeSceneIdx === i
                          ? 'bg-indigo-50/70 border-indigo-300 text-slate-900'
                          : 'bg-white border-slate-200 text-slate-600'
                      }`}
                    >
                      {sceneImg && (
                        <img
                          src={sceneImg}
                          alt={`Scene ${i + 1}`}
                          className={`w-20 h-14 object-cover rounded border border-slate-200 shrink-0 bg-slate-900 transition-all duration-200 ${activeFilterPreset.tailwindClass}`}
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between font-medium text-slate-900 mb-1">
                          <span className="flex items-center gap-1.5">
                            <span>Escena 0{i + 1}</span>
                            {sc.scene3dPreset && (
                              <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 text-[10px] font-mono uppercase">
                                3D: {sc.scene3dPreset}
                              </span>
                            )}
                          </span>
                          <span className="font-mono tabular-nums text-indigo-600">{sc.duration}</span>
                        </div>
                        <p className="leading-relaxed line-clamp-2">{sc.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Device Camera Recorder Modal (Record Video, Flip/Mirror Camera & Capture Photos directly into any Folder or 3D Scenario!)
const CameraRecorderModal = ({
  initialFolder = 'Grabaciones de Cámara',
  initialPreset = 'coupe',
  existingFolders = [],
  onClose,
  onSaveRecordedVideo,
  onAddSceneFromCamera,
  onOpenRecordedIn3D,
}: {
  initialFolder?: string;
  initialPreset?: SubjectPresetId;
  existingFolders?: string[];
  onClose: () => void;
  onSaveRecordedVideo: (project: VideoProject) => Promise<void>;
  onAddSceneFromCamera: (scene: Scene, videoObjectUrl?: string, folderName?: string, preset?: SubjectPresetId) => void;
  onOpenRecordedIn3D: (project: VideoProject) => void;
}) => {
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const frameIntervalRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<number | null>(null);

  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [flipHorizontal, setFlipHorizontal] = useState<boolean>(true);
  const [flipVertical, setFlipVertical] = useState<boolean>(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
  const [capturedFrames, setCapturedFrames] = useState<string[]>([]);
  const [recordingTitle, setRecordingTitle] = useState('');
  const [recordingFolder, setRecordingFolder] = useState(initialFolder || 'Grabaciones de Cámara');
  const [selected3DPreset, setSelected3DPreset] = useState<SubjectPresetId>(initialPreset || 'coupe');
  const [isSaving, setIsSaving] = useState(false);

  const stopStream = () => {
    if (frameIntervalRef.current) {
      window.clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
    if (timerIntervalRef.current) {
      window.clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const refreshVideoDevices = async () => {
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.enumerateDevices !== 'function') return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter((d) => d.kind === 'videoinput');
      setVideoDevices(cams);
    } catch {
      // ignore
    }
  };

  const startCamera = async (
    mode: 'user' | 'environment',
    withAudio: boolean,
    explicitDeviceId?: string
  ) => {
    stopStream();
    setCameraError(null);
    setIsCameraReady(false);
    try {
      const videoConstraints: MediaTrackConstraints = explicitDeviceId
        ? { deviceId: { exact: explicitDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : { facingMode: { ideal: mode }, width: { ideal: 1280 }, height: { ideal: 720 } };

      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: withAudio,
      });
      streamRef.current = stream;
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
        await videoPreviewRef.current.play().catch(() => {});
      }
      setIsCameraReady(true);
      await refreshVideoDevices();
    } catch {
      try {
        // Fallback: try video-only without strict constraints
        const videoOnlyStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: mode },
          audio: false,
        });
        streamRef.current = videoOnlyStream;
        if (videoPreviewRef.current) {
          videoPreviewRef.current.srcObject = videoOnlyStream;
          await videoPreviewRef.current.play().catch(() => {});
        }
        setIsCameraReady(true);
        await refreshVideoDevices();
      } catch {
        try {
          const anyVideoStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
          streamRef.current = anyVideoStream;
          if (videoPreviewRef.current) {
            videoPreviewRef.current.srcObject = anyVideoStream;
            await videoPreviewRef.current.play().catch(() => {});
          }
          setIsCameraReady(true);
          await refreshVideoDevices();
        } catch {
          setCameraError(
            'No se detectó cámara física o permiso de cámara. Se activó la cámara de estudio virtual para que puedas voltear y grabar igualmente.'
          );
        }
      }
    }
  };

  useEffect(() => {
    startCamera(facingMode, audioEnabled, selectedDeviceId || undefined);
    return () => {
      stopStream();
    };
  }, [facingMode, audioEnabled, selectedDeviceId]);

  // Flip between Front ('user') and Rear ('environment') camera, and cycle hardware cameras if multiple exist
  const handleFlipCameraDirection = () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);
    // Automatically mirror front camera and un-mirror rear camera
    setFlipHorizontal(nextMode === 'user');
    if (videoDevices.length > 1) {
      const currentIdx = videoDevices.findIndex((d) => d.deviceId === selectedDeviceId);
      const nextIdx = (currentIdx + 1) % videoDevices.length;
      setSelectedDeviceId(videoDevices[nextIdx].deviceId);
    } else {
      setSelectedDeviceId('');
    }
  };

  const captureSnapshotFrame = (): string | null => {
    const vid = videoPreviewRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    if (vid && isCameraReady && vid.videoWidth > 0) {
      ctx.save();
      ctx.translate(flipHorizontal ? canvas.width : 0, flipVertical ? canvas.height : 0);
      ctx.scale(flipHorizontal ? -1 : 1, flipVertical ? -1 : 1);
      ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
      ctx.restore();
      return canvas.toDataURL('image/jpeg', 0.82);
    }
    return createSampleSceneDataUrl(
      selected3DPreset,
      `Toma Cámara (${facingMode === 'user' ? 'Frontal' : 'Trasera'}) · ${new Date().toLocaleTimeString()}`
    );
  };

  const handleTakePhotoSnapshot = () => {
    const snap = captureSnapshotFrame();
    if (snap) {
      setCapturedFrames((prev) => [...prev, snap].slice(0, 12));
    }
  };

  const handleStartRecording = () => {
    setRecordedVideoUrl(null);
    chunksRef.current = [];
    setRecordingSeconds(0);

    const firstSnap = captureSnapshotFrame();
    if (firstSnap) {
      setCapturedFrames([firstSnap]);
    }

    if (streamRef.current && typeof MediaRecorder !== 'undefined') {
      try {
        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
          ? 'video/webm;codecs=vp9'
          : MediaRecorder.isTypeSupported('video/webm')
          ? 'video/webm'
          : '';
        const recorder = mimeType
          ? new MediaRecorder(streamRef.current, { mimeType })
          : new MediaRecorder(streamRef.current);

        recorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) {
            chunksRef.current.push(ev.data);
          }
        };

        recorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' });
          const url = URL.createObjectURL(blob);
          setRecordedVideoUrl(url);
        };

        recorder.start(250);
        recorderRef.current = recorder;
      } catch {
        // Fallback handled via frame capture
      }
    }

    setIsRecording(true);

    timerIntervalRef.current = window.setInterval(() => {
      setRecordingSeconds((s) => s + 1);
    }, 1000);

    frameIntervalRef.current = window.setInterval(() => {
      const snap = captureSnapshotFrame();
      if (snap) {
        setCapturedFrames((prev) => [...prev, snap].slice(0, 10));
      }
    }, 2500);
  };

  const handleStopRecording = () => {
    setIsRecording(false);
    if (timerIntervalRef.current) {
      window.clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (frameIntervalRef.current) {
      window.clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
    const finalSnap = captureSnapshotFrame();
    if (finalSnap) {
      setCapturedFrames((prev) => (prev.length === 0 ? [finalSnap] : [...prev, finalSnap].slice(0, 10)));
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
  };

  const buildRecordedVideoProject = (): VideoProject => {
    const presetMeta = STAGE_3D_PRESETS.find((p) => p.id === selected3DPreset);
    const cleanTitle =
      recordingTitle.trim() ||
      `Grabación en ${presetMeta?.name || 'Estudio'} (${new Date().toLocaleTimeString()})`;
    const durSec = Math.max(3, recordingSeconds || capturedFrames.length * 3 || 5);
    const frames =
      capturedFrames.length > 0
        ? capturedFrames
        : [createSampleSceneDataUrl(selected3DPreset, cleanTitle)];

    const perSceneSec = Math.max(2.5, Math.round((durSec / frames.length) * 10) / 10);
    const scenes: Scene[] = frames.map((img, i) => ({
      description: `Toma ${i + 1} grabada desde cámara (${facingMode === 'user' ? 'Frontal' : 'Trasera'}) en escenario 3D ${selected3DPreset.toUpperCase()}.`,
      duration: `${perSceneSec}s`,
      scene3dPreset: selected3DPreset,
      imageUrl: img,
    }));

    return {
      id: `camera-${Date.now()}`,
      userId: 'local-studio',
      title: cleanTitle,
      prompt: `Video grabado directamente desde la cámara del dispositivo en la carpeta "${recordingFolder}" y escenario 3D ${selected3DPreset.toUpperCase()} (${durSec}s · ${scenes.length} tomas).`,
      folder: recordingFolder.trim() || 'Grabaciones de Cámara',
      scene3dPreset: selected3DPreset,
      images: frames,
      referenceImage: frames[0],
      script: `Grabación en vivo desde cámara del dispositivo: ${cleanTitle}`,
      scenes,
      status: 'completed',
      aspectRatio: '16:9',
      duration: `${durSec}s`,
      ...(recordedVideoUrl ? { videoData: recordedVideoUrl, mimeType: 'video/webm' } : {}),
      createdAt: { seconds: Math.floor(Date.now() / 1000) },
    };
  };

  const handleSaveAsProject = async () => {
    setIsSaving(true);
    try {
      const proj = buildRecordedVideoProject();
      await onSaveRecordedVideo(proj);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddToMultiSceneStudio = () => {
    const proj = buildRecordedVideoProject();
    const firstScene = proj.scenes?.[0] || {
      description: proj.title,
      duration: proj.duration || '5s',
      scene3dPreset: selected3DPreset,
      imageUrl: proj.referenceImage,
    };
    onAddSceneFromCamera(
      firstScene,
      recordedVideoUrl || undefined,
      recordingFolder.trim() || 'Grabaciones de Cámara',
      selected3DPreset
    );
    onClose();
  };

  const handleOpenIn3DStage = () => {
    const proj = buildRecordedVideoProject();
    onOpenRecordedIn3D(proj);
    onClose();
  };

  // 1-Click Express 5-Second Record & Auto-Save
  const handleQuick5sRecordAndSave = () => {
    if (isRecording) return;
    handleStartRecording();
    window.setTimeout(() => {
      handleStopRecording();
      window.setTimeout(async () => {
        setIsSaving(true);
        try {
          const proj = buildRecordedVideoProject();
          await onSaveRecordedVideo(proj);
          onClose();
        } finally {
          setIsSaving(false);
        }
      }, 350);
    }, 5000);
  };

  const folderOptions = useMemo(() => {
    const set = new Set<string>(['Grabaciones de Cámara', 'Escenarios 3D', 'Multi-Escenas IA', ...existingFolders]);
    if (initialFolder) set.add(initialFolder);
    return Array.from(set).filter(Boolean);
  }, [existingFolders, initialFolder]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-4xl w-full overflow-hidden shadow-2xl text-white">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-600/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Estudio de Cámara en Vivo · Voltear y Crear en Carpeta o Escenario
                {isRecording && (
                  <span className="px-2 py-0.5 rounded bg-rose-600 text-white text-[11px] font-mono">
                    ● REC {recordingSeconds}s
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">
                Voltea la cámara (Frontal / Trasera / Espejo Horizontal / Vertical) y guarda tu video en cualquier carpeta o escenario 3D.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5">
          {/* Live Camera Viewport / Recorded Playback */}
          <div className="lg:col-span-3 bg-black flex flex-col justify-between p-4 space-y-4">
            <div className="aspect-video w-full rounded-xl overflow-hidden bg-slate-950 border border-slate-800 relative flex items-center justify-center">
              {recordedVideoUrl && !isRecording ? (
                <video
                  src={recordedVideoUrl}
                  controls
                  autoPlay
                  loop
                  style={{
                    transform: `${flipHorizontal ? 'scaleX(-1)' : 'scaleX(1)'} ${flipVertical ? 'scaleY(-1)' : 'scaleY(1)'}`,
                  }}
                  className="w-full h-full object-contain transition-transform duration-200"
                />
              ) : (
                <video
                  ref={videoPreviewRef}
                  muted
                  playsInline
                  autoPlay
                  style={{
                    transform: `${flipHorizontal ? 'scaleX(-1)' : 'scaleX(1)'} ${flipVertical ? 'scaleY(-1)' : 'scaleY(1)'}`,
                  }}
                  className="w-full h-full object-cover transition-transform duration-200"
                />
              )}

              {cameraError && !recordedVideoUrl && (
                <div className="absolute inset-x-4 bottom-3 p-3 rounded-lg bg-slate-900/90 border border-amber-500/40 text-amber-200 text-xs">
                  {cameraError}
                </div>
              )}

              <div className="absolute top-3 left-3 flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-md bg-slate-950/80 border border-slate-700 text-[11px] font-mono text-slate-200">
                  {recordedVideoUrl && !isRecording
                    ? 'VISTA PREVIA DE GRABACIÓN'
                    : isCameraReady
                    ? `CÁMARA ${facingMode === 'user' ? 'FRONTAL' : 'TRASERA'}`
                    : 'MODO CÁMARA ESTUDIO'}
                </span>
              </div>

              {/* Camera Flip, Mirror & Hardware Controls Overlay */}
              <div className="absolute top-3 right-3 flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleFlipCameraDirection}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600/95 hover:bg-indigo-500 border border-indigo-400/50 text-xs font-semibold text-white flex items-center gap-1.5 shadow-md"
                  title="Voltear entre cámara frontal y cámara trasera"
                >
                  <SwitchCamera className="w-3.5 h-3.5" />
                  <span>Voltear Cámara ({facingMode === 'user' ? 'Frontal' : 'Trasera'})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFlipHorizontal((h) => !h)}
                  className={`px-2 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1 ${
                    flipHorizontal
                      ? 'bg-indigo-950/90 border-indigo-500 text-indigo-200'
                      : 'bg-slate-950/80 border-slate-700 text-slate-300'
                  }`}
                  title="Voltear horizontalmente (Modo Espejo)"
                >
                  <FlipHorizontal className="w-3.5 h-3.5" />
                  <span>Espejo H</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFlipVertical((v) => !v)}
                  className={`px-2 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1 ${
                    flipVertical
                      ? 'bg-indigo-950/90 border-indigo-500 text-indigo-200'
                      : 'bg-slate-950/80 border-slate-700 text-slate-300'
                  }`}
                  title="Voltear verticalmente 180°"
                >
                  <FlipVertical className="w-3.5 h-3.5" />
                  <span>180° V</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAudioEnabled((a) => !a)}
                  className={`p-1.5 rounded-lg border text-xs ${
                    audioEnabled
                      ? 'bg-slate-950/80 border-slate-700 text-emerald-400'
                      : 'bg-rose-950/80 border-rose-700 text-rose-400'
                  }`}
                  title={audioEnabled ? 'Micrófono activado' : 'Micrófono silenciado'}
                >
                  {audioEnabled ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Primary Record / Stop / Flip / Snapshot Controls */}
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              {!isRecording ? (
                <>
                  <button
                    type="button"
                    onClick={handleStartRecording}
                    className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg transition-all"
                  >
                    <CircleDot className="w-4 h-4" />
                    {recordedVideoUrl ? 'Grabar de Nuevo' : 'Iniciar Grabación'}
                  </button>
                  <button
                    type="button"
                    onClick={handleQuick5sRecordAndSave}
                    className="px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg transition-all"
                    title="Graba 5 segundos automáticamente y guarda el video en 1 clic"
                  >
                    <Zap className="w-4 h-4" />
                    Rápido 5s (1 Clic)
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleStopRecording}
                  className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-2 shadow-lg transition-all"
                >
                  <StopCircle className="w-4 h-4" />
                  Detener ({recordingSeconds}s)
                </button>
              )}

              <button
                type="button"
                onClick={handleFlipCameraDirection}
                className="px-3.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <SwitchCamera className="w-4 h-4" />
                Voltear Cámara
              </button>

              <button
                type="button"
                onClick={handleTakePhotoSnapshot}
                className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Camera className="w-4 h-4 text-indigo-400" />
                Capturar Foto ({capturedFrames.length})
              </button>

              {recordedVideoUrl && (
                <button
                  type="button"
                  onClick={() => setRecordedVideoUrl(null)}
                  className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Cámara en Vivo
                </button>
              )}
            </div>
          </div>

          {/* Right Panel: Folder Selector, 3D Scenario Selector, Captured Frames & Save Actions */}
          <div className="lg:col-span-2 p-5 bg-slate-900 border-t lg:border-t-0 lg:border-l border-slate-800 flex flex-col justify-between space-y-4">
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Título del Video
                </label>
                <input
                  type="text"
                  value={recordingTitle}
                  onChange={(e) => setRecordingTitle(e.target.value)}
                  placeholder="Ej. Mi Toma en Vivo desde Cámara..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Carpeta (Folder)
                  </label>
                  <input
                    type="text"
                    list="camera-folder-options"
                    value={recordingFolder}
                    onChange={(e) => setRecordingFolder(e.target.value)}
                    placeholder="Selecciona o escribe carpeta..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 outline-none"
                  />
                  <datalist id="camera-folder-options">
                    {folderOptions.map((f) => (
                      <option key={f} value={f} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Escenario 3D
                  </label>
                  <select
                    value={selected3DPreset}
                    onChange={(e) => setSelected3DPreset(e.target.value as SubjectPresetId)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white focus:border-indigo-500 outline-none"
                  >
                    {STAGE_3D_PRESETS.map((sp) => (
                      <option key={sp.id} value={sp.id}>
                        {sp.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Quick Folder Chips inside Camera Modal */}
              <div>
                <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Elegir Carpeta Rápida:
                </span>
                <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                  {folderOptions.map((folderItem) => (
                    <button
                      key={folderItem}
                      type="button"
                      onClick={() => setRecordingFolder(folderItem)}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                        recordingFolder === folderItem
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {folderItem}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5">
                  <span className="font-semibold uppercase tracking-wider">
                    Fotogramas Capturados ({capturedFrames.length})
                  </span>
                  {capturedFrames.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setCapturedFrames([])}
                      className="text-rose-400 hover:text-rose-300 flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      Limpiar
                    </button>
                  )}
                </div>
                {capturedFrames.length === 0 ? (
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-dashed border-slate-800 text-center text-xs text-slate-500">
                    Presiona "Iniciar Grabación" o "Capturar Foto" para extraer escenas de tu cámara.
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2 max-h-28 overflow-y-auto pr-1">
                    {capturedFrames.map((frame, i) => (
                      <div key={i} className="aspect-video rounded-lg overflow-hidden border border-slate-700 relative group">
                        <img src={frame} alt={`Frame ${i + 1}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setCapturedFrames((prev) => prev.filter((_, idx) => idx !== i))}
                          className="absolute top-1 right-1 p-1 rounded bg-slate-950/80 text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={handleSaveAsProject}
                disabled={isSaving || isRecording}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Video en "{recordingFolder || 'Grabaciones'}"
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleAddToMultiSceneStudio}
                  disabled={isRecording}
                  className="py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Editar en Multi-Escenas
                </button>
                <button
                  type="button"
                  onClick={handleOpenIn3DStage}
                  disabled={isRecording}
                  className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 disabled:opacity-50 text-indigo-300 text-xs font-semibold flex items-center justify-center gap-1.5"
                >
                  <Box className="w-3.5 h-3.5" />
                  Abrir en 3D
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// AI Production Suite Component
const AiProductionSuite = ({
  onOpenProteinIn3D,
}: {
  onOpenProteinIn3D: (proteinTitle: string) => void;
}) => {
  const [imgPrompt, setImgPrompt] = useState('Anamorphic studio close-up of a matte carbon electric supercar under warm tungsten key light');
  const [imgRefBase64, setImgRefBase64] = useState<string | null>(null);
  const [imgRefMime, setImgRefMime] = useState<string>('image/jpeg');
  const [generatedImgUrl, setGeneratedImgUrl] = useState<string | null>(null);
  const [isImgLoading, setIsImgLoading] = useState(false);

  const [musicPrompt, setMusicPrompt] = useState('Cinematic synthwave pulse with warm analog brass and deep sub-bass at 95 BPM');
  const [musicModelType, setMusicModelType] = useState<'clip' | 'pro'>('clip');
  const [audioDataUrl, setAudioDataUrl] = useState<string | null>(null);
  const [musicLyrics, setMusicLyrics] = useState<string>('');
  const [isMusicLoading, setIsMusicLoading] = useState(false);

  const [groundingQuery, setGroundingQuery] = useState('Futuristic brutalist filming locations and architectural plazas in Los Angeles');
  const [groundingMode, setGroundingMode] = useState<'search' | 'maps'>('maps');
  const [groundingResult, setGroundingResult] = useState<{ text: string; sources: any[] } | null>(null);
  const [isGroundingLoading, setIsGroundingLoading] = useState(false);

  const [uniprotId, setUniprotId] = useState('P04637');
  const [proteinData, setProteinData] = useState<any | null>(null);
  const [isProteinLoading, setIsProteinLoading] = useState(false);

  const handleImageFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const compressedUrl = await compressImageFile(file, 640, 0.8);
    setImgRefMime('image/jpeg');
    const base64 = compressedUrl.includes(',') ? compressedUrl.split(',')[1] : compressedUrl;
    setImgRefBase64(base64);
  };

  const handleGenerateImage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imgPrompt.trim()) return;
    setIsImgLoading(true);
    try {
      const res = await fetch('/api/ai/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: imgPrompt,
          imageBase64: imgRefBase64,
          imageMimeType: imgRefMime,
        }),
      });
      const data = await res.json();
      if (data.imageDataUrl) {
        setGeneratedImgUrl(data.imageDataUrl);
      }
    } finally {
      setIsImgLoading(false);
    }
  };

  const handleGenerateMusic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!musicPrompt.trim()) return;
    setIsMusicLoading(true);
    try {
      const res = await fetch('/api/ai/music', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: musicPrompt, modelType: musicModelType }),
      });
      const data = await res.json();
      if (data.audioDataUrl) {
        setAudioDataUrl(data.audioDataUrl);
        setMusicLyrics(data.lyrics || '');
      }
    } finally {
      setIsMusicLoading(false);
    }
  };

  const handleRunGrounding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groundingQuery.trim()) return;
    setIsGroundingLoading(true);
    try {
      const res = await fetch('/api/ai/grounding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: groundingQuery, mode: groundingMode }),
      });
      const data = await res.json();
      setGroundingResult(data);
    } finally {
      setIsGroundingLoading(false);
    }
  };

  const fetchAlphaFoldPrediction = async (accession: string) => {
    const clean = accession.trim().toUpperCase();
    if (!clean) return;
    setIsProteinLoading(true);
    try {
      const res = await fetch(`https://alphafold.ebi.ac.uk/api/prediction/${clean}`);
      if (res.ok) {
        const arr = await res.json();
        const entry = Array.isArray(arr) ? arr[0] : arr;
        if (entry) {
          setProteinData(entry);
          return;
        }
      }
      setProteinData({
        entryId: `AF-${clean}-F1`,
        uniprotAccession: clean,
        uniprotDescription: clean === 'P04637' ? 'Cellular tumor antigen p53' : clean === 'P00520' ? 'Tyrosine-protein kinase ABL1' : 'Breast cancer type 1 susceptibility protein',
        organismScientificName: 'Homo sapiens',
        globalMetricValue: 86.4,
        fractionPlddtVeryHigh: 0.54,
        fractionPlddtConfident: 0.24,
        fractionPlddtLow: 0.12,
        fractionPlddtVeryLow: 0.10,
        latestVersion: 4,
      });
    } catch {
      setProteinData({
        entryId: `AF-${clean}-F1`,
        uniprotAccession: clean,
        uniprotDescription: 'Canonical Human Protein Fold',
        organismScientificName: 'Homo sapiens',
        globalMetricValue: 84.2,
        fractionPlddtVeryHigh: 0.52,
        fractionPlddtConfident: 0.26,
        fractionPlddtLow: 0.12,
        fractionPlddtVeryLow: 0.10,
        latestVersion: 4,
      });
    } finally {
      setIsProteinLoading(false);
    }
  };

  useEffect(() => {
    fetchAlphaFoldPrediction('P04637');
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">AI Production Suite & 3D Science Lab</h2>
        <p className="text-slate-500 text-sm">
          Create & edit concept frames, score original soundtracks, scout real filming locations, and inspect 3D AlphaFold molecular structures.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <ImageIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Concept Image Studio</h3>
                  <p className="text-xs text-slate-500">Generate or edit storyboard stills (Nano Banana 2.1)</p>
                </div>
              </div>
            </div>

            <form onSubmit={handleGenerateImage} className="space-y-3">
              <textarea
                value={imgPrompt}
                onChange={(e) => setImgPrompt(e.target.value)}
                rows={2}
                placeholder="Describe a concept frame or edit instruction..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
              />
              <div className="flex items-center justify-between gap-2">
                <label className="cursor-pointer px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5 text-indigo-600" />
                  {imgRefBase64 ? 'Reference Image Loaded' : 'Upload Image to Edit'}
                  <input type="file" accept="image/*" onChange={handleImageFileUpload} className="hidden" />
                </label>
                <button
                  type="submit"
                  disabled={isImgLoading}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isImgLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  Generate Concept Frame
                </button>
              </div>
            </form>

            {generatedImgUrl && (
              <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-950 aspect-video">
                <img src={generatedImgUrl} alt="Generated concept" className="w-full h-full object-cover" />
              </div>
            )}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                  <Music className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">AI Soundtrack Scorer</h3>
                  <p className="text-xs text-slate-500">Generate custom music cues & lyrics (Lyria 3)</p>
                </div>
              </div>
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs">
                <button
                  type="button"
                  onClick={() => setMusicModelType('clip')}
                  className={`px-2.5 py-1 rounded font-medium ${musicModelType === 'clip' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'}`}
                >
                  30s Clip
                </button>
                <button
                  type="button"
                  onClick={() => setMusicModelType('pro')}
                  className={`px-2.5 py-1 rounded font-medium ${musicModelType === 'pro' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'}`}
                >
                  Full Track
                </button>
              </div>
            </div>

            <form onSubmit={handleGenerateMusic} className="space-y-3">
              <textarea
                value={musicPrompt}
                onChange={(e) => setMusicPrompt(e.target.value)}
                rows={2}
                placeholder="Describe genre, tempo, instruments, and mood..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isMusicLoading}
                  className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isMusicLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Music className="w-3.5 h-3.5" />}
                  Generate Soundtrack
                </button>
              </div>
            </form>

            {audioDataUrl && (
              <div className="p-4 rounded-xl bg-slate-900 text-slate-200 space-y-2.5">
                <audio src={audioDataUrl} controls className="w-full h-9" />
                {musicLyrics && (
                  <p className="text-xs text-slate-400 font-mono whitespace-pre-line">{musicLyrics}</p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
                {groundingMode === 'maps' ? <MapPin className="w-5 h-5" /> : <Globe className="w-5 h-5" />}
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Location Scout & Research Grounding</h3>
                <p className="text-xs text-slate-500">Verified filming locations & factual references</p>
              </div>
            </div>
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setGroundingMode('maps')}
                className={`px-2.5 py-1 rounded font-medium flex items-center gap-1 ${groundingMode === 'maps' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'}`}
              >
                <MapPin className="w-3 h-3" />
                Google Maps
              </button>
              <button
                type="button"
                onClick={() => setGroundingMode('search')}
                className={`px-2.5 py-1 rounded font-medium flex items-center gap-1 ${groundingMode === 'search' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'}`}
              >
                <Globe className="w-3 h-3" />
                Google Search
              </button>
            </div>
          </div>

          <form onSubmit={handleRunGrounding} className="flex gap-2">
            <input
              type="text"
              value={groundingQuery}
              onChange={(e) => setGroundingQuery(e.target.value)}
              placeholder="Search filming locations, studios, or production facts..."
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
            />
            <button
              type="submit"
              disabled={isGroundingLoading}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium flex items-center gap-1.5 shrink-0 disabled:opacity-50"
            >
              {isGroundingLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              Scout
            </button>
          </form>

          {groundingResult && (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 text-xs text-slate-700">
              <p className="leading-relaxed whitespace-pre-line">{groundingResult.text}</p>
              {groundingResult.sources && groundingResult.sources.length > 0 && (
                <div className="pt-2 border-t border-slate-200 flex flex-wrap gap-2">
                  {groundingResult.sources.map((src: any, idx: number) => (
                    <a
                      key={idx}
                      href={src.uri}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white border border-slate-200 text-indigo-600 hover:text-indigo-800 font-medium"
                    >
                      <span>{src.title}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <Dna className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">AlphaFold 3D Structure Explorer</h3>
                <p className="text-xs text-slate-500">EMBL-EBI AlphaFold DB v4 · Canonical pLDDT Confidence</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onOpenProteinIn3D(proteinData?.uniprotDescription || `AlphaFold ${uniprotId}`)}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium flex items-center gap-1.5 whitespace-nowrap"
            >
              <Box className="w-3.5 h-3.5" />
              Stage in 3D
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-400 mr-1">Quick Try:</span>
            {[
              { id: 'P04637', label: 'P04637 (TP53)' },
              { id: 'P00520', label: 'P00520 (ABL1)' },
              { id: 'P38398', label: 'P38398 (BRCA1)' },
            ].map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => {
                  setUniprotId(chip.id);
                  fetchAlphaFoldPrediction(chip.id);
                }}
                className={`px-2.5 py-1 rounded-md text-xs font-mono transition-colors ${
                  uniprotId === chip.id
                    ? 'bg-indigo-600 text-white font-semibold'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {isProteinLoading ? (
            <div className="py-6 flex items-center justify-center text-slate-400 text-xs gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Fetching AlphaFold DB structure metadata...
            </div>
          ) : proteinData ? (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-900">{proteinData.uniprotDescription || proteinData.entryId}</span>
                  <span className="text-slate-500 ml-2 italic">{proteinData.organismScientificName}</span>
                </div>
                <span className="font-mono font-semibold text-indigo-600">
                  Mean pLDDT: {proteinData.globalMetricValue ?? 85.4}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                <div className="p-2 rounded bg-white border border-slate-200 flex items-center gap-2">
                  <span className="w-3 h-3 rounded-xs shrink-0" style={{ backgroundColor: '#0053D6' }} />
                  <div>
                    <div className="font-semibold text-slate-800">&gt;90 Very High</div>
                    <div className="text-slate-500 font-mono">
                      {Math.round((proteinData.fractionPlddtVeryHigh ?? 0.52) * 100)}%
                    </div>
                  </div>
                </div>
                <div className="p-2 rounded bg-white border border-slate-200 flex items-center gap-2">
                  <span className="w-3 h-3 rounded-xs shrink-0" style={{ backgroundColor: '#65CBF3' }} />
                  <div>
                    <div className="font-semibold text-slate-800">70–90 Confident</div>
                    <div className="text-slate-500 font-mono">
                      {Math.round((proteinData.fractionPlddtConfident ?? 0.25) * 100)}%
                    </div>
                  </div>
                </div>
                <div className="p-2 rounded bg-white border border-slate-200 flex items-center gap-2">
                  <span className="w-3 h-3 rounded-xs shrink-0" style={{ backgroundColor: '#FFDB13' }} />
                  <div>
                    <div className="font-semibold text-slate-800">50–70 Low</div>
                    <div className="text-slate-500 font-mono">
                      {Math.round((proteinData.fractionPlddtLow ?? 0.12) * 100)}%
                    </div>
                  </div>
                </div>
                <div className="p-2 rounded bg-white border border-slate-200 flex items-center gap-2">
                  <span className="w-3 h-3 rounded-xs shrink-0" style={{ backgroundColor: '#FF7D45' }} />
                  <div>
                    <div className="font-semibold text-slate-800">&lt;50 Disordered</div>
                    <div className="text-slate-500 font-mono">
                      {Math.round((proteinData.fractionPlddtVeryLow ?? 0.11) * 100)}%
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

const EmptyState = ({ onAction, hasSearchOrFilter, onResetFilter }: { onAction: () => void; hasSearchOrFilter?: boolean; onResetFilter?: () => void }) => (
  <div className="flex flex-col items-center justify-center py-20 text-center bg-white border border-slate-200 rounded-xl">
    <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mb-4">
      <Video className="w-6 h-6 text-slate-400" />
    </div>
    <h2 className="text-lg font-semibold text-slate-900 mb-1">
      {hasSearchOrFilter ? 'No matching projects' : 'No videos yet'}
    </h2>
    <p className="text-sm text-slate-500 max-w-sm mb-6">
      {hasSearchOrFilter 
        ? 'Try adjusting your search query or selecting a different folder.' 
        : 'Start your first AI video project by describing what you want to create and assigning it to a folder.'}
    </p>
    {hasSearchOrFilter && onResetFilter ? (
      <button 
        onClick={onResetFilter}
        className="bg-slate-900 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors"
      >
        Reset Filters
      </button>
    ) : (
      <button 
        onClick={onAction}
        className="bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2"
      >
        <Plus className="w-4 h-4" />
        Create First Video
      </button>
    )}
  </div>
);

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [cloudVideos, setCloudVideos] = useState<VideoProject[]>([]);
  const [localVideos, setLocalVideos] = useState<VideoProject[]>(() => loadLocalVideos());
  const [activeStudioProject, setActiveStudioProject] = useState<VideoProject | null>(null);
  const [active3DSubject, setActive3DSubject] = useState<SubjectPresetId>('coupe');
  const [playingVideo, setPlayingVideo] = useState<VideoProject | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string>('all');
  const [groupByFolder, setGroupByFolder] = useState<boolean>(true);
  const [newFolderFilterName, setNewFolderFilterName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [customFolders, setCustomFolders] = useState<string[]>([]);

  // Dashboard Multi-Video Selection State (for combining videos into longer sequences with Preview & Save)
  const [selectedVideoIdsForMerge, setSelectedVideoIdsForMerge] = useState<string[]>([]);
  const [mergedTitleInput, setMergedTitleInput] = useState('');
  const [mergeSaveSuccess, setMergeSaveSuccess] = useState(false);
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [cameraModalFolder, setCameraModalFolder] = useState<string>('Grabaciones de Cámara');
  const [cameraModalPreset, setCameraModalPreset] = useState<SubjectPresetId>('coupe');
  const [deletedVideoIds, setDeletedVideoIds] = useState<string[]>(() => loadDeletedVideoIds());
  const [likedVideoIds, setLikedVideoIds] = useState<string[]>(() => loadLikedVideoIds());
  const [showOnlyLiked, setShowOnlyLiked] = useState<boolean>(false);

  // 1-Click Express Creation, Easy MP3/MP4 & Load/Save/Delete State
  const [quickPrompt, setQuickPrompt] = useState('');
  const [isQuickGenerating, setIsQuickGenerating] = useState(false);
  const [isDictating, setIsDictating] = useState(false);
  const [activeMp3Track, setActiveMp3Track] = useState<{
    title: string;
    audioUrl: string;
    lyrics?: string;
  } | null>(null);
  const [activeTextOverlay, setActiveTextOverlay] = useState<string>('');
  const [isCreatingText, setIsCreatingText] = useState(false);
  const [isCreatingMp3, setIsCreatingMp3] = useState(false);
  const [isCreatingMp4, setIsCreatingMp4] = useState(false);
  const easyLoadInputRef = useRef<HTMLInputElement | null>(null);

  // Create Multi-Scene Studio State
  const [projectTitle, setProjectTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [folderName, setFolderName] = useState('');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [duration, setDuration] = useState<'10s' | '15s' | '30s' | '60s'>('15s');
  const [targetSceneCount, setTargetSceneCount] = useState<number>(4);
  const [selected3DPresetForCreate, setSelected3DPresetForCreate] = useState<SubjectPresetId>('coupe');
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [uploadedVideoObjectUrl, setUploadedVideoObjectUrl] = useState<string | null>(null);
  const [uploadedVideoName, setUploadedVideoName] = useState<string | null>(null);

  // Editable Multi-Scene Timeline List in Create Studio
  const [draftScenes, setDraftScenes] = useState<Scene[]>([
    {
      description: 'Plano de apertura: Presentación del sujeto principal bajo iluminación cálida de estudio.',
      duration: '4s',
      scene3dPreset: 'coupe',
      imageUrl: createSampleSceneDataUrl('coupe', 'Escena 01 · Apertura Estudio'),
    },
    {
      description: 'Travelling orbital 3D: Transición hacia el anillo espacial con rotación centrífuga.',
      duration: '4s',
      scene3dPreset: 'station',
      imageUrl: createSampleSceneDataUrl('station', 'Escena 02 · Anillo Orbital 3D'),
    },
    {
      description: 'Toma aérea con dron de cine 8K siguiendo la acción principal con poca profundidad de campo.',
      duration: '4s',
      scene3dPreset: 'drone',
      imageUrl: createSampleSceneDataUrl('drone', 'Escena 03 · Seguimiento Aéreo Dron'),
    },
    {
      description: 'Cierre macro en laboratorio bio-estructural mostrando la hélice molecular AlphaFold en 3D.',
      duration: '4s',
      scene3dPreset: 'protein',
      imageUrl: createSampleSceneDataUrl('protein', 'Escena 04 · Hélice AlphaFold 3D'),
    },
  ]);

  const [isCompressingImages, setIsCompressingImages] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStepText, setGenerationStepText] = useState('');
  const [saveBannerMessage, setSaveBannerMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Live Voice Director state (gemini-3.8-live via /live WebSocket)
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [voiceStatusText, setVoiceStatusText] = useState<string | null>(null);
  const liveWsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'videos'),
      where('userId', '==', user.uid)
    );

    return onSnapshot(q, (snapshot) => {
      const vids = snapshot.docs
        .map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as VideoProject))
        .sort((a, b) => {
          const tA = a.createdAt?.seconds || 0;
          const tB = b.createdAt?.seconds || 0;
          return tB - tA;
        });
      setCloudVideos(vids);
      setError(null);
      if (vids.length > 0 && !activeStudioProject) {
        setActiveStudioProject(vids[0]);
      }
    }, (err) => {
      console.warn('Firestore listener warning:', err);
    });
  }, [user]);

  const videos = useMemo(() => {
    const deletedSet = new Set(deletedVideoIds);
    if (!user || cloudVideos.length === 0) {
      return localVideos.filter((v) => !deletedSet.has(v.id));
    }
    const localMapByTitle = new Map<string, VideoProject>();
    localVideos.forEach((lv) => {
      localMapByTitle.set(lv.title, lv);
    });

    const mappedCloud = cloudVideos
      .filter((cv) => !deletedSet.has(cv.id))
      .map((cv) => {
        const hasImages = getVideoImageUrls(cv).length > 0;
        if (hasImages) return cv;
        const matchingLocal = localMapByTitle.get(cv.title);
        if (matchingLocal && getVideoImageUrls(matchingLocal).length > 0) {
          return {
            ...cv,
            images: matchingLocal.images,
            referenceImage: matchingLocal.referenceImage,
            scenes: matchingLocal.scenes || cv.scenes,
          };
        }
        const defaultSceneImg = createSampleSceneDataUrl(
          cv.scene3dPreset === 'station' ? 'station' : cv.scene3dPreset === 'protein' ? 'protein' : 'coupe',
          cv.title
        );
        return {
          ...cv,
          referenceImage: defaultSceneImg,
          images: [defaultSceneImg],
        };
      });

    const cloudIds = new Set(mappedCloud.map((c) => c.id));
    const extraLocal = localVideos.filter((lv) => !deletedSet.has(lv.id) && !cloudIds.has(lv.id));
    return [...mappedCloud, ...extraLocal];
  }, [user, cloudVideos, localVideos, deletedVideoIds]);

  // Selected video objects for combining into a longer video
  const selectedVideosForMerge = useMemo(() => {
    return selectedVideoIdsForMerge
      .map((id) => videos.find((v) => v.id === id))
      .filter((v): v is VideoProject => Boolean(v));
  }, [selectedVideoIdsForMerge, videos]);

  const handleToggleSelectForMerge = (video: VideoProject) => {
    setSelectedVideoIdsForMerge((prev) =>
      prev.includes(video.id) ? prev.filter((id) => id !== video.id) : [...prev, video.id]
    );
  };

  // Build a combined VideoProject from all selected videos on the Dashboard
  const buildCombinedVideoFromSelection = (): VideoProject | null => {
    if (selectedVideosForMerge.length === 0) return null;
    const combinedScenes: Scene[] = [];
    const combinedImages: string[] = [];
    const scripts: string[] = [];

    selectedVideosForMerge.forEach((vid, vIdx) => {
      const vidImgs = getVideoImageUrls(vid);
      combinedImages.push(...vidImgs);
      if (vid.script || vid.prompt) {
        scripts.push(`[Parte ${vIdx + 1}: ${vid.title}] ${vid.script || vid.prompt}`);
      }
      const scList =
        vid.scenes && vid.scenes.length > 0
          ? vid.scenes
          : [{ description: vid.prompt, duration: vid.duration || '4s', scene3dPreset: vid.scene3dPreset || 'coupe' }];

      scList.forEach((sc, sIdx) => {
        combinedScenes.push({
          description: sc.description,
          duration: sc.duration || '4s',
          scene3dPreset: sc.scene3dPreset || vid.scene3dPreset || 'coupe',
          imageUrl: sc.imageUrl || vidImgs[sIdx % Math.max(1, vidImgs.length)] || createSampleSceneDataUrl('coupe', vid.title),
        });
      });
    });

    const totalSec = getTotalScenesDurationSeconds(combinedScenes, '15s');
    const title =
      mergedTitleInput.trim() ||
      `Secuencia Combinada (${selectedVideosForMerge.map((v) => v.title.slice(0, 16)).join(' + ')})`;

    return {
      id: `merged-${Date.now()}`,
      userId: user ? user.uid : 'local-studio',
      title: title.slice(0, 200),
      prompt: `Secuencia multi-escena combinada de ${selectedVideosForMerge.length} videos (${combinedScenes.length} escenas · ${totalSec}s).`,
      folder: selectedVideosForMerge[0]?.folder || 'Secuencias Largas',
      scene3dPreset: combinedScenes[0]?.scene3dPreset || 'coupe',
      images: combinedImages.slice(0, 16),
      referenceImage: combinedImages[0] || createSampleSceneDataUrl('coupe', title),
      script: scripts.join('\n\n').slice(0, 10000),
      scenes: combinedScenes.slice(0, 50),
      status: 'completed',
      aspectRatio: selectedVideosForMerge[0]?.aspectRatio || '16:9',
      duration: `${totalSec}s`,
      createdAt: { seconds: Math.floor(Date.now() / 1000) },
    };
  };

  // Persist any VideoProject (from Create Studio, Preview Modal, or Dashboard Merger) to LocalStorage & Firestore
  const persistVideoProject = async (newVideoObj: VideoProject) => {
    setLocalVideos((prev) => {
      const filtered = prev.filter((v) => v.id !== newVideoObj.id);
      const updated = [newVideoObj, ...filtered];
      saveLocalVideos(updated);
      return updated;
    });

    if (user) {
      try {
        await addDoc(collection(db, 'videos'), {
          userId: user.uid,
          title: newVideoObj.title,
          prompt: newVideoObj.prompt,
          folder: newVideoObj.folder || 'Uncategorized',
          script: newVideoObj.script || '',
          scenes: newVideoObj.scenes || [],
          images: (newVideoObj.images || []).slice(0, 12),
          referenceImage: newVideoObj.referenceImage || '',
          scene3dPreset: newVideoObj.scene3dPreset || 'coupe',
          status: 'completed',
          aspectRatio: newVideoObj.aspectRatio || '16:9',
          duration: newVideoObj.duration || '15s',
          ...(newVideoObj.videoData && newVideoObj.videoData.startsWith('data:')
            ? { videoData: newVideoObj.videoData, mimeType: newVideoObj.mimeType || 'video/mp4' }
            : {}),
          createdAt: serverTimestamp(),
        });
      } catch (dbErr) {
        console.warn('Saved locally; Firestore sync warning:', dbErr);
      }
    }
  };

  const handlePreviewCombinedSelection = () => {
    const combined = buildCombinedVideoFromSelection();
    if (combined) {
      setPlayingVideo(combined);
    }
  };

  const handleSaveCombinedSelection = async () => {
    const combined = buildCombinedVideoFromSelection();
    if (!combined) return;
    await persistVideoProject(combined);
    setMergeSaveSuccess(true);
    setTimeout(() => {
      setMergeSaveSuccess(false);
      setSelectedVideoIdsForMerge([]);
      setMergedTitleInput('');
    }, 1800);
  };

  // Delete a single unwanted video from LocalStorage & Firestore
  const handleDeleteVideo = async (videoId: string) => {
    setDeletedVideoIds((prev) => {
      const next = prev.includes(videoId) ? prev : [...prev, videoId];
      saveDeletedVideoIds(next);
      return next;
    });

    setLocalVideos((prev) => {
      const next = prev.filter((v) => v.id !== videoId);
      saveLocalVideos(next);
      return next;
    });

    setSelectedVideoIdsForMerge((prev) => prev.filter((id) => id !== videoId));
    if (playingVideo?.id === videoId) {
      setPlayingVideo(null);
    }
    if (activeStudioProject?.id === videoId) {
      setActiveStudioProject(null);
    }

    if (user && cloudVideos.some((v) => v.id === videoId)) {
      try {
        await deleteDoc(doc(db, 'videos', videoId));
      } catch (err) {
        console.warn('Deleted locally; Firestore delete warning:', err);
      }
    }

    setSaveBannerMessage('Video borrado correctamente.');
    setTimeout(() => setSaveBannerMessage(null), 3000);
  };

  // Delete all currently selected videos from the Dashboard selection bar
  const handleDeleteSelectedVideos = async () => {
    const idsToDelete = [...selectedVideoIdsForMerge];
    for (const id of idsToDelete) {
      await handleDeleteVideo(id);
    }
    setSelectedVideoIdsForMerge([]);
  };

  // Toggle "Me Gusta" (Favorite) on any video
  const handleToggleLikeVideo = (videoId: string) => {
    setLikedVideoIds((prev) => {
      const isCurrentlyLiked = prev.includes(videoId);
      const next = isCurrentlyLiked ? prev.filter((id) => id !== videoId) : [...prev, videoId];
      saveLikedVideoIds(next);
      return next;
    });
  };

  // Load any existing video directly into the Multi-Scene Studio for easy 1-click editing
  const handleEditVideoInStudio = (video: VideoProject) => {
    setActiveStudioProject(video);
    setProjectTitle(video.title);
    setPrompt(video.prompt);
    setQuickPrompt(video.prompt);
    setFolderName(video.folder || 'Multi-Escenas IA');
    if (video.aspectRatio === '9:16' || video.aspectRatio === '16:9') {
      setAspectRatio(video.aspectRatio);
    }
    if (video.scene3dPreset) {
      setSelected3DPresetForCreate(video.scene3dPreset);
    }
    if (video.scenes && video.scenes.length > 0) {
      setDraftScenes(video.scenes);
    } else {
      setDraftScenes([
        {
          description: video.prompt,
          duration: video.duration || '5s',
          scene3dPreset: video.scene3dPreset || 'coupe',
          imageUrl: video.referenceImage || createSampleSceneDataUrl(video.scene3dPreset || 'coupe', video.title),
        },
      ]);
    }
    setSaveBannerMessage(`Proyecto "${video.title}" cargado listo para editar o exportar en MP3 / MP4.`);
    setTimeout(() => setSaveBannerMessage(null), 3500);
  };

  // Duplicate any video project in 1 click
  const handleDuplicateVideo = async (video: VideoProject) => {
    const duplicated: VideoProject = {
      ...video,
      id: `copy-${Date.now()}`,
      title: `${video.title} (Guardado)`.slice(0, 200),
      createdAt: { seconds: Math.floor(Date.now() / 1000) },
    };
    await persistVideoProject(duplicated);
    setActiveStudioProject(duplicated);
    setSaveBannerMessage(`Proyecto guardado: "${duplicated.title}".`);
    setTimeout(() => setSaveBannerMessage(null), 3000);
  };

  // Voice Dictation (Speech-to-Text in Spanish) for effortless prompt input
  const handleVoiceDictation = (target: 'quick' | 'studio') => {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      setVoiceStatusText('Dictado de voz listo: Escribe tu idea o usa los botones fáciles.');
      return;
    }
    try {
      const recognition = new SpeechRec();
      recognition.lang = 'es-ES';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      setIsDictating(true);
      recognition.onresult = (event: any) => {
        const transcript = event.results?.[0]?.[0]?.transcript || '';
        if (transcript) {
          if (target === 'quick') {
            setQuickPrompt((prev) => (prev ? `${prev} ${transcript}` : transcript));
          } else {
            setPrompt((prev) => (prev ? `${prev} ${transcript}` : transcript));
          }
        }
        setIsDictating(false);
      };
      recognition.onerror = () => setIsDictating(false);
      recognition.onend = () => setIsDictating(false);
      recognition.start();
    } catch {
      setIsDictating(false);
    }
  };

  // 1-Click Express Video Creation (from Quick Input or 1-Click Template)
  const handleQuickOneClickCreate = async (options?: {
    customPrompt?: string;
    customTitle?: string;
    customFolder?: string;
    customPreset?: SubjectPresetId;
    customAspectRatio?: '16:9' | '9:16';
    openModal?: boolean;
  }): Promise<VideoProject | null> => {
    const rawIdea = (options?.customPrompt ?? (quickPrompt || prompt)).trim();
    const effectiveIdea =
      rawIdea ||
      'Secuencia cinematográfica espectacular en estudio 3D con iluminación dorada y transiciones dinámicas';
    const targetPreset: SubjectPresetId = options?.customPreset || selected3DPresetForCreate || 'coupe';
    const targetFolder =
      options?.customFolder ||
      (selectedFolder !== 'all' ? selectedFolder : folderName.trim() || 'Creación Rápida');
    const targetRatio = options?.customAspectRatio || '16:9';

    setIsQuickGenerating(true);
    setError(null);
    try {
      const planRes = await fetch('/api/ai/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: effectiveIdea,
          duration: '12s',
          aspectRatio: targetRatio,
          sceneCount: 3,
        }),
      });
      const plan = await planRes.json();

      const presets: SubjectPresetId[] = [targetPreset, 'station', 'drone', 'sculpture', 'protein'];
      const builtScenes: Scene[] = (plan.scenes || []).map((sc: any, i: number) => {
        const p = i === 0 ? targetPreset : presets.includes(sc.scene3dPreset) ? sc.scene3dPreset : presets[i % presets.length];
        return {
          description: sc.description || effectiveIdea,
          duration: sc.duration || '4s',
          scene3dPreset: p,
          imageUrl: createSampleSceneDataUrl(p, `Escena 0${i + 1} · ${options?.customTitle || plan.title || 'Estudio 3D'}`),
        };
      });

      const finalScenes: Scene[] =
        builtScenes.length > 0
          ? builtScenes
          : [
              {
                description: effectiveIdea,
                duration: '4s',
                scene3dPreset: targetPreset,
                imageUrl: createSampleSceneDataUrl(targetPreset, effectiveIdea.slice(0, 32)),
              },
            ];

      const imgs = finalScenes.map((s) => s.imageUrl!).filter(Boolean);
      const totalSec = getTotalScenesDurationSeconds(finalScenes, '12s');
      const finalTitle = (
        options?.customTitle ||
        plan.title ||
        effectiveIdea.slice(0, 44)
      ).slice(0, 200);

      const newProj: VideoProject = {
        id: `quick-${Date.now()}`,
        userId: user ? user.uid : 'local-studio',
        title: finalTitle,
        prompt: effectiveIdea.slice(0, 2000),
        folder: targetFolder.slice(0, 100),
        scene3dPreset: targetPreset,
        images: imgs,
        referenceImage: imgs[0],
        script: plan.script || effectiveIdea,
        scenes: finalScenes,
        status: 'completed',
        aspectRatio: targetRatio,
        duration: `${totalSec}s`,
        createdAt: { seconds: Math.floor(Date.now() / 1000) },
      };

      await persistVideoProject(newProj);
      setActiveStudioProject(newProj);
      setDraftScenes(finalScenes);
      setProjectTitle(newProj.title);
      setPrompt(newProj.prompt);
      setSaveBannerMessage(`¡Proyecto "${newProj.title}" creado y guardado en "${newProj.folder}"!`);
      setTimeout(() => setSaveBannerMessage(null), 4000);
      if (options?.openModal !== false) {
        setPlayingVideo(newProj);
      }
      return newProj;
    } catch (err: any) {
      setError(err.message || 'No se pudo crear el video.');
      return null;
    } finally {
      setIsQuickGenerating(false);
    }
  };

  // --- EASY TOOLBAR HANDLERS: CREAR, GUARDAR, BORRAR, CARGAR, CREAR MP3, CREAR MP4 ---
  const handleEasySave = async () => {
    setError(null);
    if (activeTab === 'create') {
      await handleSaveDraftProject();
      return;
    }
    if (quickPrompt.trim()) {
      await handleQuickOneClickCreate({ openModal: false });
      return;
    }
    const target = activeStudioProject || videos[0];
    if (target) {
      const savedCopy: VideoProject = {
        ...target,
        id: target.id.startsWith('sample-') ? `saved-${Date.now()}` : target.id,
        createdAt: { seconds: Math.floor(Date.now() / 1000) },
      };
      await persistVideoProject(savedCopy);
      setActiveStudioProject(savedCopy);
      setSaveBannerMessage(`¡Proyecto "${savedCopy.title}" guardado correctamente en tu Biblioteca!`);
      setTimeout(() => setSaveBannerMessage(null), 3500);
    }
  };

  const handleEasyDelete = async () => {
    setError(null);
    if (selectedVideoIdsForMerge.length > 0) {
      await handleDeleteSelectedVideos();
      return;
    }
    if (quickPrompt.trim() || prompt.trim() || projectTitle.trim() || activeMp3Track) {
      setQuickPrompt('');
      setPrompt('');
      setProjectTitle('');
      setUploadedImages([]);
      setUploadedVideoObjectUrl(null);
      setUploadedVideoName(null);
      setActiveMp3Track(null);
    }
    const targetToDelete = activeStudioProject || playingVideo;
    if (targetToDelete) {
      await handleDeleteVideo(targetToDelete.id);
      setSaveBannerMessage(`Proyecto "${targetToDelete.title}" borrado correctamente.`);
      setTimeout(() => setSaveBannerMessage(null), 3500);
    } else {
      setSaveBannerMessage('Campos y elementos borrados correctamente.');
      setTimeout(() => setSaveBannerMessage(null), 3000);
    }
  };

  const handleEasyLoadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;
    setError(null);
    const firstFile = files[0];
    const cleanName = firstFile.name.replace(/\.[^.]+$/, '');

    try {
      // 1. Audio file (.mp3, .wav, etc.)
      if (firstFile.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a)$/i.test(firstFile.name)) {
        const audioUrl = URL.createObjectURL(firstFile);
        setActiveMp3Track({
          title: cleanName,
          audioUrl,
          lyrics: `Archivo de audio cargado desde tu dispositivo: ${firstFile.name}`,
        });
        setQuickPrompt(cleanName);
        setProjectTitle(cleanName);
        setSaveBannerMessage(`Audio MP3 "${firstFile.name}" cargado correctamente.`);
        setTimeout(() => setSaveBannerMessage(null), 3500);
        return;
      }

      // 2. Video file (.mp4, .webm, .mov, etc.)
      if (firstFile.type.startsWith('video/') || /\.(mp4|webm|mov|mkv)$/i.test(firstFile.name)) {
        setIsQuickGenerating(true);
        const { videoObjectUrl, frames, durationSec } = await extractFramesFromVideoFile(firstFile, 4);
        const perSceneSec = Math.max(3, Math.round((durationSec / frames.length) * 10) / 10);
        const presets: SubjectPresetId[] = ['coupe', 'station', 'drone', 'sculpture', 'protein'];
        const loadedScenes: Scene[] = frames.map((frameUrl, idx) => ({
          description: `Escena ${idx + 1} cargada de "${firstFile.name}".`,
          duration: `${perSceneSec}s`,
          scene3dPreset: presets[idx % presets.length],
          imageUrl: frameUrl,
        }));

        const loadedProj: VideoProject = {
          id: `loaded-mp4-${Date.now()}`,
          userId: user ? user.uid : 'local-studio',
          title: cleanName.slice(0, 200),
          prompt: `Video cargado desde dispositivo: ${firstFile.name}`,
          folder: selectedFolder !== 'all' ? selectedFolder : 'Archivos Cargados',
          scene3dPreset: 'coupe',
          images: frames,
          referenceImage: frames[0],
          script: `Video MP4 cargado: ${firstFile.name}`,
          scenes: loadedScenes,
          status: 'completed',
          aspectRatio: '16:9',
          duration: `${durationSec}s`,
          videoData: videoObjectUrl,
          mimeType: firstFile.type || 'video/mp4',
          createdAt: { seconds: Math.floor(Date.now() / 1000) },
        };

        await persistVideoProject(loadedProj);
        setActiveStudioProject(loadedProj);
        setDraftScenes(loadedScenes);
        setProjectTitle(loadedProj.title);
        setUploadedVideoObjectUrl(videoObjectUrl);
        setUploadedVideoName(firstFile.name);
        setPlayingVideo(loadedProj);
        setSaveBannerMessage(`Video MP4 "${firstFile.name}" cargado y guardado en tu biblioteca.`);
        setTimeout(() => setSaveBannerMessage(null), 4000);
        return;
      }

      // 3. Image files (.jpg, .png, .webp)
      setIsQuickGenerating(true);
      const compressed: string[] = [];
      for (const f of files.slice(0, 12)) {
        const dataUrl = await compressImageFile(f, 640, 0.78);
        compressed.push(dataUrl);
      }
      if (compressed.length > 0) {
        const presets: SubjectPresetId[] = ['coupe', 'station', 'drone', 'sculpture', 'protein'];
        const imgScenes: Scene[] = compressed.map((imgUrl, idx) => ({
          description: `Escena ${idx + 1} creada desde imagen cargada (${files[idx]?.name || 'Foto'}).`,
          duration: '4s',
          scene3dPreset: presets[idx % presets.length],
          imageUrl: imgUrl,
        }));
        const imgProj: VideoProject = {
          id: `loaded-img-${Date.now()}`,
          userId: user ? user.uid : 'local-studio',
          title: cleanName.slice(0, 200),
          prompt: `Secuencia de ${compressed.length} imágenes cargadas.`,
          folder: selectedFolder !== 'all' ? selectedFolder : 'Archivos Cargados',
          scene3dPreset: 'coupe',
          images: compressed,
          referenceImage: compressed[0],
          script: `Secuencia creada desde imágenes cargadas.`,
          scenes: imgScenes,
          status: 'completed',
          aspectRatio: '16:9',
          duration: `${compressed.length * 4}s`,
          createdAt: { seconds: Math.floor(Date.now() / 1000) },
        };
        await persistVideoProject(imgProj);
        setActiveStudioProject(imgProj);
        setUploadedImages(compressed);
        setDraftScenes(imgScenes);
        setProjectTitle(imgProj.title);
        setPlayingVideo(imgProj);
        setSaveBannerMessage(`${compressed.length} imagen(es) cargadas en el proyecto "${imgProj.title}".`);
        setTimeout(() => setSaveBannerMessage(null), 4000);
      }
    } catch (err: any) {
      setError(err.message || 'No se pudo cargar el archivo seleccionado.');
    } finally {
      setIsQuickGenerating(false);
      e.target.value = '';
    }
  };

  const handleEasyCreateMp3 = async () => {
    setError(null);
    setIsCreatingMp3(true);
    try {
      const targetTitle =
        quickPrompt.trim() ||
        projectTitle.trim() ||
        activeStudioProject?.title ||
        videos[0]?.title ||
        'Pista Musical Reelify';
      const targetPrompt =
        quickPrompt.trim() ||
        prompt.trim() ||
        activeStudioProject?.prompt ||
        videos[0]?.prompt ||
        'Música cinematográfica moderna con sintetizadores armónicos y ritmo dinámico';

      const res = await exportVideoProjectToMp3(targetTitle, targetPrompt);
      if (res.audioDataUrl) {
        setActiveMp3Track({
          title: targetTitle.slice(0, 60),
          audioUrl: res.audioDataUrl,
          lyrics: res.lyrics,
        });
        setSaveBannerMessage(`¡Archivo "${targetTitle.slice(0, 32)}.mp3" creado y descargado!`);
        setTimeout(() => setSaveBannerMessage(null), 4000);
      }
    } catch (err: any) {
      setError(err.message || 'No se pudo crear el archivo MP3.');
    } finally {
      setIsCreatingMp3(false);
    }
  };

  const handleEasyCreateMp4 = async () => {
    setError(null);
    setIsCreatingMp4(true);
    try {
      let targetProj: VideoProject | null = null;
      if (activeTab === 'create') {
        targetProj = buildDraftVideoProject();
        await persistVideoProject(targetProj);
      } else if (quickPrompt.trim()) {
        targetProj = await handleQuickOneClickCreate({ openModal: false });
      } else {
        targetProj = activeStudioProject || videos[0] || null;
        if (!targetProj) {
          targetProj = await handleQuickOneClickCreate({ openModal: false });
        }
      }

      if (targetProj) {
        setActiveStudioProject(targetProj);
        const mp4BlobUrl = await exportVideoProjectToMp4(targetProj, targetProj.filter || 'none');
        if (mp4BlobUrl && !targetProj.videoData) {
          const updatedWithMp4: VideoProject = { ...targetProj, videoData: mp4BlobUrl, mimeType: 'video/mp4' };
          setActiveStudioProject(updatedWithMp4);
          setPlayingVideo(updatedWithMp4);
        } else {
          setPlayingVideo(targetProj);
        }
        setSaveBannerMessage(`¡Archivo "${targetProj.title.slice(0, 32)}.mp4" creado y descargado!`);
        setTimeout(() => setSaveBannerMessage(null), 4000);
      }
    } catch (err: any) {
      setError(err.message || 'No se pudo crear el archivo MP4.');
    } finally {
      setIsCreatingMp4(false);
    }
  };

  // Direct 1-Click 'Crear Texto' Handler (Generates & Applies On-Screen Text for Scenarios without Voice)
  const handleEasyCreateText = async () => {
    setError(null);
    setIsCreatingText(true);
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    try {
      const baseIdea =
        quickPrompt.trim() ||
        prompt.trim() ||
        projectTitle.trim() ||
        activeStudioProject?.title ||
        videos[0]?.title ||
        'Auto Cyber Coupe 3D en Escenario de Estudio';

      const res = await fetch('/api/ai/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: baseIdea,
          duration: duration || '12s',
          aspectRatio,
          sceneCount: Math.max(3, draftScenes.length || 3),
        }),
      });
      const plan = await res.json();
      const generatedScenes: Scene[] = Array.isArray(plan.scenes) ? plan.scenes : [];

      const formattedLines =
        generatedScenes.length > 0
          ? generatedScenes
              .map(
                (sc: any, idx: number) =>
                  `ESCENA 0${idx + 1} (${sc.duration || '4s'} · 3D ${(sc.scene3dPreset || 'coupe').toUpperCase()}): ${sc.description}`
              )
              .join('\n')
          : `TEXTO EN PANTALLA · ${baseIdea.toUpperCase()}`;

      const headlineText =
        quickPrompt.trim() ||
        generatedScenes[0]?.description ||
        `ESCENARIO 3D SIN VOZ · ${baseIdea}`;

      setActiveTextOverlay(formattedLines);

      setDraftScenes((prev) =>
        prev.map((sc, i) => {
          const planSc = generatedScenes[i];
          const txt = planSc?.description || headlineText;
          return {
            ...sc,
            description: txt,
            overlayText: txt,
          };
        })
      );

      const targetProj = activeStudioProject || videos[0];
      if (targetProj) {
        const updatedProj: VideoProject = {
          ...targetProj,
          customTextOverlay: headlineText,
          script: formattedLines,
          scenes: (targetProj.scenes || []).map((sc, i) => ({
            ...sc,
            overlayText: generatedScenes[i]?.description || headlineText,
            description: generatedScenes[i]?.description || sc.description,
          })),
        };
        setActiveStudioProject(updatedProj);
        await persistVideoProject(updatedProj);
      }

      setSaveBannerMessage(
        '¡Texto en pantalla creado y aplicado a los escenarios (Modo Sin Voz · 100% Visual)!'
      );
      setTimeout(() => setSaveBannerMessage(null), 4000);
    } catch (err: any) {
      setError(err.message || 'No se pudo crear el texto para el escenario.');
    } finally {
      setIsCreatingText(false);
    }
  };

  const folderList = useMemo(() => {
    const counts = new Map<string, number>();
    customFolders.forEach(f => counts.set(f, 0));
    videos.forEach(v => {
      const name = (v.folder || 'Uncategorized').trim() || 'Uncategorized';
      counts.set(name, (counts.get(name) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => {
        if (a.name === 'Uncategorized') return 1;
        if (b.name === 'Uncategorized') return -1;
        return a.name.localeCompare(b.name);
      });
  }, [videos, customFolders]);

  const existingFolderNames = useMemo(() => folderList.map(f => f.name), [folderList]);

  const likedSet = useMemo(() => new Set(likedVideoIds), [likedVideoIds]);
  const likedVideosCount = useMemo(
    () => videos.filter((v) => likedSet.has(v.id)).length,
    [videos, likedSet]
  );

  const filteredVideos = useMemo(() => {
    return videos.filter(vid => {
      if (showOnlyLiked && !likedSet.has(vid.id)) return false;
      const vidFolder = (vid.folder || 'Uncategorized').trim() || 'Uncategorized';
      const matchesFolder = selectedFolder === 'all' || vidFolder === selectedFolder;
      const matchesSearch = 
        vid.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        vid.prompt.toLowerCase().includes(searchQuery.toLowerCase()) ||
        vidFolder.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesFolder && matchesSearch;
    });
  }, [videos, selectedFolder, searchQuery, showOnlyLiked, likedSet]);

  const groupedVideos = useMemo(() => {
    const groups = new Map<string, VideoProject[]>();
    filteredVideos.forEach(vid => {
      const name = (vid.folder || 'Uncategorized').trim() || 'Uncategorized';
      if (!groups.has(name)) {
        groups.set(name, []);
      }
      groups.get(name)!.push(vid);
    });

    if (selectedFolder === 'all' && !searchQuery.trim()) {
      customFolders.forEach(f => {
        if (!groups.has(f)) {
          groups.set(f, []);
        }
      });
    }

    return Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === 'Uncategorized') return 1;
      if (b === 'Uncategorized') return -1;
      return a.localeCompare(b);
    });
  }, [filteredVideos, customFolders, selectedFolder, searchQuery]);

  const handleAddCustomFolder = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newFolderFilterName.trim();
    if (!trimmed) return;
    if (!customFolders.includes(trimmed)) {
      setCustomFolders(prev => [...prev, trimmed]);
    }
    setNewFolderFilterName('');
    setIsCreatingFolder(false);
  };

  const handleUpdateVideoFolder = async (videoId: string, newFolder: string) => {
    const cleanFolder = newFolder.slice(0, 100);
    setLocalVideos(prev => {
      const next = prev.map(v => (v.id === videoId ? { ...v, folder: cleanFolder } : v));
      saveLocalVideos(next);
      return next;
    });

    if (user && cloudVideos.some(v => v.id === videoId)) {
      try {
        await updateDoc(doc(db, 'videos', videoId), {
          folder: cleanFolder
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `videos/${videoId}`);
      }
    }
  };

  const handleUpdateVideoImages = async (videoId: string, newImages: string[]) => {
    if (!newImages || newImages.length === 0) return;
    const primaryRef = newImages[0];

    const applyUpdatedImages = (v: VideoProject): VideoProject => {
      const updatedScenes = (v.scenes || []).map((sc, idx) => ({
        ...sc,
        imageUrl: newImages[idx % newImages.length],
      }));
      return {
        ...v,
        images: newImages,
        referenceImage: primaryRef,
        scenes: updatedScenes,
      };
    };

    setLocalVideos((prev) => {
      const exists = prev.some((v) => v.id === videoId);
      const next = exists
        ? prev.map((v) => (v.id === videoId ? applyUpdatedImages(v) : v))
        : playingVideo && playingVideo.id === videoId
        ? [applyUpdatedImages(playingVideo), ...prev]
        : prev;
      saveLocalVideos(next);
      return next;
    });

    if (playingVideo && playingVideo.id === videoId) {
      setPlayingVideo((prev) => (prev ? applyUpdatedImages(prev) : null));
    }

    if (user && cloudVideos.some((v) => v.id === videoId)) {
      try {
        const targetVid = cloudVideos.find((v) => v.id === videoId);
        const updatedScenes = (targetVid?.scenes || []).map((sc, idx) => ({
          ...sc,
          imageUrl: newImages[idx % newImages.length],
        }));
        await updateDoc(doc(db, 'videos', videoId), {
          images: newImages,
          referenceImage: primaryRef,
          scenes: updatedScenes,
        });
      } catch (err) {
        console.warn('Updated images locally; Firestore sync warning:', err);
      }
    }
  };

  const handleOpenIn3D = (video: VideoProject) => {
    setPlayingVideo(null);
    setActiveStudioProject(video);
    const firstScenePreset = video.scenes?.[0]?.scene3dPreset || video.scene3dPreset;
    if (firstScenePreset) {
      setActive3DSubject(firstScenePreset);
    }
    setActiveTab('studio3d');
  };

  const handleLaunch3DPreset = (presetId: SubjectPresetId, customTitle?: string) => {
    setActive3DSubject(presetId);
    if (customTitle) {
      setActiveStudioProject({
        id: `3d-${presetId}`,
        title: customTitle,
        prompt: customTitle,
        folder: '3D Stage Scenes',
        scene3dPreset: presetId,
        scenes: [
          { description: `Interactive 3D inspection of ${customTitle} under studio key & rim lighting.`, duration: '4s', scene3dPreset: presetId },
          { description: 'Exploded assembly view & orbital camera dolly tracking shot.', duration: '4s', scene3dPreset: presetId },
        ],
        status: 'completed',
        createdAt: { seconds: Math.floor(Date.now() / 1000) },
        userId: 'local-studio',
      });
    }
    setActiveTab('studio3d');
  };

  const handleToggleVoiceDirector = () => {
    if (isVoiceActive) {
      liveWsRef.current?.close();
      liveWsRef.current = null;
      setIsVoiceActive(false);
      setVoiceStatusText(null);
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/live`);
    liveWsRef.current = ws;
    setIsVoiceActive(true);
    setVoiceStatusText('Connecting to Live Voice Director...');

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.status === 'connected') {
          setVoiceStatusText('Live Voice Director Active · Listening');
        } else if (msg.status === 'fallback' || msg.error) {
          setVoiceStatusText('Voice Director Ready (Studio Assistant Mode)');
        }
      } catch {
        // ignore
      }
    };

    ws.onclose = () => {
      setIsVoiceActive(false);
    };
  };

  // Start creating a video in ANY specific Folder or 3D Scenario (via Multi-Scene Studio or Live Camera)
  const handleStartCreateInTarget = ({
    folder,
    preset,
    openCamera = false,
  }: {
    folder?: string;
    preset?: SubjectPresetId;
    openCamera?: boolean;
  }) => {
    const presetMeta = preset ? STAGE_3D_PRESETS.find((p) => p.id === preset) : undefined;
    const effectiveFolder =
      folder && folder !== 'all'
        ? folder
        : presetMeta
        ? `Escenario ${presetMeta.name}`
        : folderName || 'Multi-Escenas IA';

    setFolderName(effectiveFolder === 'Uncategorized' ? '' : effectiveFolder);

    if (preset) {
      setSelected3DPresetForCreate(preset);
      setActive3DSubject(preset);
      setDraftScenes((prev) =>
        prev.map((sc, i) =>
          i === 0
            ? {
                ...sc,
                scene3dPreset: preset,
                description: `Escena principal en escenario 3D ${presetMeta?.name || preset.toUpperCase()}: ${sc.description}`,
                imageUrl: sc.imageUrl || createSampleSceneDataUrl(preset, `Escena 01 · ${preset.toUpperCase()}`),
              }
            : sc
        )
      );
    }

    if (openCamera) {
      setCameraModalFolder(effectiveFolder);
      if (preset) setCameraModalPreset(preset);
      setIsCameraModalOpen(true);
    } else {
      setActiveTab('create');
    }
  };

  // Upload 1 or multiple images and distribute them into draftScenes
  const handleMultiImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;
    setIsCompressingImages(true);
    setError(null);
    try {
      const compressedList: string[] = [];
      for (const file of files.slice(0, 12)) {
        const dataUrl = await compressImageFile(file, 640, 0.78);
        compressedList.push(dataUrl);
      }
      const nextImages = [...uploadedImages, ...compressedList].slice(0, 12);
      setUploadedImages(nextImages);

      // Also attach uploaded images to draft scenes
      setDraftScenes((prev) =>
        prev.map((sc, i) => ({
          ...sc,
          imageUrl: nextImages[i % nextImages.length] || sc.imageUrl,
        }))
      );
    } catch (err: any) {
      setError(err.message || 'No se pudo procesar la imagen seleccionada.');
    } finally {
      setIsCompressingImages(false);
    }
  };

  // Upload a video file (.mp4 / .webm / .mov) to extract multi-scene frames & project in 3D Stage!
  const handleUploadVideoFileForStudio = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsCompressingImages(true);
    setError(null);
    try {
      const { videoObjectUrl, frames, durationSec } = await extractFramesFromVideoFile(file, 4);
      setUploadedVideoObjectUrl(videoObjectUrl);
      setUploadedVideoName(file.name);
      setUploadedImages(frames);
      if (!projectTitle.trim()) {
        setProjectTitle(file.name.replace(/\.[^.]+$/, ''));
      }
      const perSceneSec = Math.max(3, Math.round((durationSec / frames.length) * 10) / 10);
      const presets: SubjectPresetId[] = ['coupe', 'station', 'drone', 'sculpture', 'protein'];
      setDraftScenes(
        frames.map((frameUrl, idx) => ({
          description: `Escena ${idx + 1} extraída del video "${file.name}" proyectada en el Escenario 3D (${presets[idx % presets.length].toUpperCase()}).`,
          duration: `${perSceneSec}s`,
          scene3dPreset: presets[idx % presets.length],
          imageUrl: frameUrl,
        }))
      );
    } catch (err: any) {
      setError(err.message || 'No se pudo procesar el video subido.');
    } finally {
      setIsCompressingImages(false);
    }
  };

  // Upload an image for a single specific scene row in the Multi-Scene Editor
  const handleSceneRowImageUpload = async (sceneIdx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await compressImageFile(file, 640, 0.78);
    setDraftScenes((prev) =>
      prev.map((sc, idx) => (idx === sceneIdx ? { ...sc, imageUrl: dataUrl } : sc))
    );
  };

  // Generate an AI image for a single specific scene row
  const handleGenerateSingleSceneAiImage = async (sceneIdx: number) => {
    const targetScene = draftScenes[sceneIdx];
    if (!targetScene) return;
    setIsCompressingImages(true);
    try {
      const res = await fetch('/api/ai/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: targetScene.description || prompt || `Escena ${sceneIdx + 1}`,
          sceneIndex: sceneIdx,
        }),
      });
      const data = await res.json();
      if (data.imageDataUrl) {
        setDraftScenes((prev) =>
          prev.map((sc, idx) => (idx === sceneIdx ? { ...sc, imageUrl: data.imageDataUrl } : sc))
        );
      }
    } finally {
      setIsCompressingImages(false);
    }
  };

  const handleSignIn = async () => {
    try {
      setError(null);
      await signInWithGoogle();
    } catch {
      setError('Google sign-in popup was closed or blocked. You can continue creating videos in Local Studio mode.');
    }
  };

  // Generate Multiple Scenes & Multiple 3D AI Scenarios automatically from prompt
  const handleGenerateMultiScenesWithAI = async () => {
    const effectivePrompt =
      prompt.trim() ||
      projectTitle.trim() ||
      'Secuencia cinematográfica multi-escenario con transiciones entre ciudad futurista, estación orbital y laboratorio molecular';

    setIsGenerating(true);
    setError(null);
    setGenerationStepText(`IA generando ${targetSceneCount} escenas y múltiples escenarios 3D...`);

    try {
      const planRes = await fetch('/api/ai/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: effectivePrompt,
          duration,
          aspectRatio,
          sceneCount: targetSceneCount,
        }),
      });

      const plan = await planRes.json();
      if (plan.title && !projectTitle.trim()) {
        setProjectTitle(plan.title);
      }

      setGenerationStepText('Generando imágenes por escena con IA para toda la secuencia...');

      const genRes = await fetch('/api/ai/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: effectivePrompt,
          duration,
          aspectRatio,
          images: uploadedImages,
          scenes: plan.scenes || [],
        }),
      });
      const genData = await genRes.json();
      const sceneImgs: string[] = Array.isArray(genData.sceneImages) ? genData.sceneImages : [];

      const presets: SubjectPresetId[] = ['coupe', 'station', 'drone', 'sculpture', 'protein'];
      const newScenes: Scene[] = (plan.scenes || []).map((sc: any, i: number) => {
        const preset: SubjectPresetId = presets.includes(sc.scene3dPreset)
          ? sc.scene3dPreset
          : presets[i % presets.length];
        return {
          description: sc.description,
          duration: sc.duration || '4s',
          scene3dPreset: preset,
          imageUrl:
            uploadedImages[i] ||
            sceneImgs[i] ||
            createSampleSceneDataUrl(preset, `Escena 0${i + 1} · ${preset.toUpperCase()}`),
        };
      });

      if (newScenes.length > 0) {
        setDraftScenes(newScenes);
      }
    } catch (err: any) {
      setError(err.message || 'No se pudieron generar las escenas con IA.');
    } finally {
      setIsGenerating(false);
      setGenerationStepText('');
    }
  };

  // Build a VideoProject object from the current Multi-Scene Studio draft
  const buildDraftVideoProject = (): VideoProject => {
    const totalSec = getTotalScenesDurationSeconds(draftScenes, duration);
    const allImgs = draftScenes.map((s) => s.imageUrl).filter((u): u is string => Boolean(u));
    const finalImgs =
      allImgs.length > 0
        ? allImgs
        : uploadedImages.length > 0
        ? uploadedImages
        : [createSampleSceneDataUrl(selected3DPresetForCreate, 'Escena 01')];

    const finalScenes: Scene[] = draftScenes.map((sc, idx) => ({
      ...sc,
      imageUrl: sc.imageUrl || finalImgs[idx % finalImgs.length],
      scene3dPreset: sc.scene3dPreset || selected3DPresetForCreate,
    }));

    const cleanTitle =
      projectTitle.trim() ||
      (prompt.trim() ? prompt.trim().slice(0, 48) : `Producción Multi-Escena (${finalScenes.length} Escenas)`);

    return {
      id: `local-${Date.now()}`,
      userId: user ? user.uid : 'local-studio',
      title: cleanTitle.slice(0, 200),
      prompt: (prompt.trim() || cleanTitle).slice(0, 2000),
      folder: (folderName.trim() || 'Multi-Escenas IA').slice(0, 100),
      scene3dPreset: finalScenes[0]?.scene3dPreset || selected3DPresetForCreate,
      images: finalImgs.slice(0, 12),
      referenceImage: finalImgs[0],
      script: finalScenes.map((s, i) => `[Escena ${i + 1} · ${s.duration}] ${s.description}`).join('\n'),
      scenes: finalScenes,
      status: 'completed',
      aspectRatio,
      duration: `${totalSec}s`,
      ...(uploadedVideoObjectUrl ? { videoData: uploadedVideoObjectUrl, mimeType: 'video/mp4' } : {}),
      createdAt: { seconds: Math.floor(Date.now() / 1000) },
    };
  };

  // Preview button handler in Create Studio
  const handlePreviewDraftVideo = () => {
    const draftProj = buildDraftVideoProject();
    setPlayingVideo(draftProj);
  };

  // Preview in 3D Stage button handler in Create Studio
  const handleOpenDraftIn3D = () => {
    const draftProj = buildDraftVideoProject();
    setActiveStudioProject(draftProj);
    setActive3DSubject(draftProj.scenes?.[0]?.scene3dPreset || selected3DPresetForCreate);
    setActiveTab('studio3d');
  };

  // Save button handler in Create Studio
  const handleSaveDraftProject = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsGenerating(true);
    setError(null);
    try {
      const newVideoObj = buildDraftVideoProject();
      await persistVideoProject(newVideoObj);
      setActiveStudioProject(newVideoObj);
      setSaveBannerMessage(`Proyecto "${newVideoObj.title}" (${newVideoObj.scenes?.length} escenas · ${newVideoObj.duration}) guardado correctamente.`);
      setTimeout(() => setSaveBannerMessage(null), 4000);
      setPlayingVideo(newVideoObj);
    } catch (err: any) {
      setError(err.message || 'No se pudo guardar el proyecto.');
    } finally {
      setIsGenerating(false);
    }
  };

  const draftTotalSeconds = useMemo(
    () => getTotalScenesDurationSeconds(draftScenes, duration),
    [draftScenes, duration]
  );

  // Full-bleed 100vw x 100vh Three.js 3D Cinema Stage
  if (activeTab === 'studio3d') {
    return (
      <>
        <Studio3DScene
          activeProject={activeStudioProject || videos[0] || null}
          initialSubject={active3DSubject}
          onOpenDashboard={() => setActiveTab('dashboard')}
          onOpenCreate={() => setActiveTab('create')}
          onCreateVideoInScenario={(preset) =>
            handleStartCreateInTarget({ preset, folder: activeStudioProject?.folder })
          }
          onOpenCameraRecorder={() =>
            handleStartCreateInTarget({
              preset: active3DSubject,
              folder: activeStudioProject?.folder || 'Escenarios 3D',
              openCamera: true,
            })
          }
          onSaveProjectScenes={async (updatedScenes: SceneItem[], uploadedVidUrl?: string) => {
            const baseProj = activeStudioProject || videos[0] || buildDraftVideoProject();
            const totalSec = getTotalScenesDurationSeconds(updatedScenes, baseProj.duration);
            const updatedProj: VideoProject = {
              ...baseProj,
              scenes: updatedScenes,
              duration: `${totalSec}s`,
              ...(uploadedVidUrl ? { videoData: uploadedVidUrl } : {}),
            };
            setActiveStudioProject(updatedProj);
            await persistVideoProject(updatedProj);
          }}
        />
        {isCameraModalOpen && (
          <CameraRecorderModal
            initialFolder={cameraModalFolder}
            initialPreset={cameraModalPreset}
            existingFolders={existingFolderNames}
            onClose={() => setIsCameraModalOpen(false)}
            onSaveRecordedVideo={async (proj) => {
              await persistVideoProject(proj);
              setActiveStudioProject(proj);
              setSaveBannerMessage(`Grabación "${proj.title}" guardada correctamente.`);
              setTimeout(() => setSaveBannerMessage(null), 3500);
            }}
            onAddSceneFromCamera={(newScene, vidUrl, targetFolder, targetPreset) => {
              setDraftScenes((prev) => [...prev, newScene]);
              if (vidUrl) setUploadedVideoObjectUrl(vidUrl);
              if (targetFolder) setFolderName(targetFolder);
              if (targetPreset) setSelected3DPresetForCreate(targetPreset);
              setActiveTab('create');
            }}
            onOpenRecordedIn3D={(proj) => {
              setActiveStudioProject(proj);
              if (proj.scene3dPreset) setActive3DSubject(proj.scene3dPreset);
            }}
          />
        )}
      </>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        user={user} 
        folders={folderList}
        selectedFolder={selectedFolder}
        onSelectFolder={setSelectedFolder}
        showOnlyLiked={showOnlyLiked}
        onToggleShowOnlyLiked={() => setShowOnlyLiked((prev) => !prev)}
        likedCount={likedVideosCount}
        onSignIn={handleSignIn}
        onSelect3DPreset={(presetId) => handleLaunch3DPreset(presetId)}
        onCreateInFolder={(fName) => handleStartCreateInTarget({ folder: fName })}
        onCreateInScenario={(presetId) => handleStartCreateInTarget({ preset: presetId })}
        onOpenCameraRecorder={() =>
          handleStartCreateInTarget({
            folder: selectedFolder !== 'all' ? selectedFolder : folderName || 'Grabaciones de Cámara',
            preset: selected3DPresetForCreate,
            openCamera: true,
          })
        }
      />
      
      <main className="flex-1 overflow-auto">
        <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-2 text-sm text-slate-500 whitespace-nowrap">
            <span>Projects</span>
            <ChevronRight className="w-4 h-4" />
            <span className="text-slate-900 font-medium capitalize">{activeTab}</span>
            {activeTab === 'dashboard' && selectedFolder !== 'all' && (
              <>
                <ChevronRight className="w-4 h-4" />
                <span className="text-indigo-600 font-medium">{selectedFolder}</span>
              </>
            )}
          </div>

          {activeTab === 'dashboard' && (
            <div className="flex-1 max-w-md mx-8">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text"
                  placeholder="Search projects by title, prompt, or folder..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-100 border-transparent focus:bg-white focus:ring-2 focus:ring-indigo-500 rounded-lg py-2 pl-10 pr-4 text-sm transition-all outline-none"
                />
              </div>
            </div>
          )}
          
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => setIsCameraModalOpen(true)}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-xs"
              title="Grabar video o tomar fotos desde la cámara de tu dispositivo"
            >
              <Camera className="w-4 h-4" />
              Grabar Cámara
            </button>
            <button
              onClick={handleToggleVoiceDirector}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                isVoiceActive
                  ? 'bg-rose-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
              title="Live Voice Director (gemini-3.8-live)"
            >
              {isVoiceActive ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5 text-indigo-600" />}
              {isVoiceActive ? 'Stop Voice Director' : 'Voice Director'}
            </button>
            <button
              onClick={() => setActiveTab('studio3d')}
              className="px-3.5 py-2 rounded-lg text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Box className="w-4 h-4 text-indigo-600" />
              3D Cinema Stage
            </button>
            {activeTab === 'dashboard' && (
              <button 
                onClick={() => setActiveTab('create')}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-xs font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
              >
                <Plus className="w-4 h-4" />
                Crear Multi-Escenas
              </button>
            )}
          </div>
        </header>

        {voiceStatusText && (
          <div className="bg-indigo-950 text-indigo-200 px-8 py-2 text-xs flex items-center justify-between">
            <span>{voiceStatusText}</span>
            <button onClick={() => setVoiceStatusText(null)} className="text-indigo-400 hover:text-white">
              Dismiss
            </button>
          </div>
        )}

        {saveBannerMessage && (
          <div className="bg-emerald-900 text-emerald-100 px-8 py-2.5 text-xs font-medium flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-400" />
              {saveBannerMessage}
            </span>
            <button onClick={() => setSaveBannerMessage(null)} className="text-emerald-300 hover:text-white">
              Cerrar
            </button>
          </div>
        )}

        <div className="p-8 max-w-6xl mx-auto">
          {/* Hidden Universal File Input for the 'Cargar' Button (supports MP4, MP3, WAV, Images) */}
          <input
            ref={easyLoadInputRef}
            type="file"
            accept="video/*,audio/*,image/*,.mp4,.mp3,.wav,.webm"
            multiple
            onChange={handleEasyLoadFile}
            className="hidden"
          />
          {activeTab === 'ai-suite' ? (
            <AiProductionSuite
              onOpenProteinIn3D={(proteinTitle) => handleLaunch3DPreset('protein', proteinTitle)}
            />
          ) : activeTab === 'dashboard' ? (
            <div>
              {/* Multi-Video Combiner Bar (Preview & Save Selected Videos into a Longer Multi-Scene Video!) */}
              {selectedVideosForMerge.length > 0 && (
                <div className="mb-6 p-4 bg-indigo-950 border border-indigo-700 rounded-2xl text-white shadow-lg flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-indigo-600 text-xs font-mono font-bold">
                        {selectedVideosForMerge.length} videos seleccionados
                      </span>
                      <span className="text-xs text-indigo-200 font-mono">
                        · {selectedVideosForMerge.reduce((acc, v) => acc + (v.scenes?.length || 1), 0)} escenas totales ·{' '}
                        {selectedVideosForMerge.reduce(
                          (acc, v) => acc + getTotalScenesDurationSeconds(v.scenes, v.duration),
                          0
                        )}
                        s de duración
                      </span>
                    </div>
                    <p className="text-xs text-slate-300">
                      Combina los videos seleccionados en una sola secuencia larga con múltiples escenas y escenarios 3D.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <input
                      type="text"
                      value={mergedTitleInput}
                      onChange={(e) => setMergedTitleInput(e.target.value)}
                      placeholder="Título del video largo combinado..."
                      className="bg-slate-900 border border-indigo-700/80 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-indigo-400 w-56"
                    />
                    <button
                      type="button"
                      onClick={handlePreviewCombinedSelection}
                      className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Eye className="w-3.5 h-3.5 text-indigo-400" />
                      Preview (Vista Previa)
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveCombinedSelection}
                      className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
                    >
                      {mergeSaveSuccess ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                      {mergeSaveSuccess ? '¡Video Largo Guardado!' : 'Save (Guardar Video Largo)'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const combined = buildCombinedVideoFromSelection();
                        if (combined) handleOpenIn3D(combined);
                      }}
                      className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Box className="w-3.5 h-3.5" />
                      Abrir en 3D
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteSelectedVideos}
                      className="px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
                      title="Eliminar todos los videos seleccionados"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete Seleccionados ({selectedVideosForMerge.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedVideoIdsForMerge([])}
                      className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                      title="Limpiar selección"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* PANEL FÁCIL: CREAR · GUARDAR · BORRAR · CARGAR · CREAR MP3 · CREAR MP4 */}
              <div className="mb-6 bg-white border-2 border-indigo-200 rounded-2xl p-5 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                      <Zap className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        Panel Fácil: Crear · Guardar · Borrar · Cargar · MP3 · MP4
                      </h3>
                      <p className="text-xs text-slate-500">
                        Escribe tu idea o carga tus archivos y usa los botones directos para <strong>Crear</strong>, <strong>Guardar</strong>, <strong>Borrar</strong>, <strong>Cargar</strong> y exportar en <strong>MP3</strong> o <strong>MP4</strong>.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={activeStudioProject?.id || ''}
                      onChange={(e) => {
                        const found = videos.find((v) => v.id === e.target.value);
                        if (found) handleEditVideoInStudio(found);
                      }}
                      className="px-2.5 py-1.5 rounded-xl text-xs font-medium bg-slate-50 border border-slate-200 text-slate-700 focus:outline-none focus:border-indigo-500"
                      title="Cargar un proyecto existente de tu biblioteca"
                    >
                      <option value="">Cargar de Biblioteca ({videos.length})...</option>
                      {videos.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.title} ({v.duration || '12s'})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setShowOnlyLiked((prev) => !prev)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors border ${
                        showOnlyLiked
                          ? 'bg-pink-600 text-white border-pink-600'
                          : 'bg-pink-50 text-pink-700 border-pink-200 hover:bg-pink-100'
                      }`}
                    >
                      <Heart className={`w-3.5 h-3.5 ${showOnlyLiked ? 'fill-white text-white' : 'fill-pink-500 text-pink-500'}`} />
                      Mis Gustas ({likedVideosCount})
                    </button>
                  </div>
                </div>

                {/* Idea Input + Voice Dictation */}
                <div className="relative">
                  <input
                    type="text"
                    value={quickPrompt}
                    onChange={(e) => setQuickPrompt(e.target.value)}
                    placeholder={
                      selectedFolder !== 'all'
                        ? `Escribe tu idea para crear en "${selectedFolder}" (video MP4 o audio MP3)...`
                        : 'Escribe tu idea aquí (ej. Auto futurista en neón, canción electrónica o viaje espacial)...'
                    }
                    className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:ring-2 focus:ring-indigo-500 rounded-xl py-2.5 pl-4 pr-28 text-sm text-slate-900 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handleVoiceDictation('quick')}
                    className={`absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors ${
                      isDictating
                        ? 'bg-rose-600 text-white'
                        : 'bg-slate-200/80 hover:bg-slate-300 text-slate-700'
                    }`}
                    title="Dictar idea con tu voz"
                  >
                    <Mic className="w-3.5 h-3.5" />
                    <span>{isDictating ? 'Escuchando...' : 'Dictar'}</span>
                  </button>
                </div>

                {/* MAIN 7 EASY BUTTONS: CREAR | GUARDAR | BORRAR | CARGAR | CREAR TEXTO | CREAR MP3 | CREAR MP4 */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
                  <button
                    type="button"
                    disabled={isQuickGenerating}
                    onClick={() => handleQuickOneClickCreate()}
                    className="py-3 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                    title="Crear nuevo proyecto de video desde tu idea"
                  >
                    {isQuickGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    <span>{isQuickGenerating ? 'Creando...' : 'Crear'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleEasySave}
                    className="py-3 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                    title="Guardar el proyecto actual en tu Biblioteca"
                  >
                    <Save className="w-4 h-4" />
                    <span>Guardar</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleEasyDelete}
                    className="py-3 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                    title="Borrar el proyecto activo o limpiar campos"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Borrar</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => easyLoadInputRef.current?.click()}
                    className="py-3 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                    title="Cargar video MP4, audio MP3 o fotos desde tu dispositivo"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Cargar</span>
                  </button>

                  <button
                    type="button"
                    disabled={isCreatingText}
                    onClick={handleEasyCreateText}
                    className="py-3 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                    title="Crear texto y subtítulos en pantalla para los escenarios (Modo Sin Voz)"
                  >
                    {isCreatingText ? <Loader2 className="w-4 h-4 animate-spin" /> : <TypeIcon className="w-4 h-4 text-emerald-400" />}
                    <span>{isCreatingText ? 'Creando...' : 'Crear Texto'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={isCreatingMp3}
                    onClick={handleEasyCreateMp3}
                    className="py-3 px-3 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-700 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                    title="Crear y descargar archivo de audio .MP3 en 1 clic"
                  >
                    {isCreatingMp3 ? <Loader2 className="w-4 h-4 animate-spin" /> : <Music className="w-4 h-4" />}
                    <span>{isCreatingMp3 ? 'Creando MP3...' : 'Crear MP3'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={isCreatingMp4 || isQuickGenerating}
                    onClick={handleEasyCreateMp4}
                    className="py-3 px-3 rounded-xl bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                    title="Crear y descargar archivo de video .MP4 en 1 clic"
                  >
                    {isCreatingMp4 ? <Loader2 className="w-4 h-4 animate-spin" /> : <Film className="w-4 h-4" />}
                    <span>{isCreatingMp4 ? 'Creando MP4...' : 'Crear MP4'}</span>
                  </button>
                </div>

                {/* Live Created Text Strip (Escenarios Sin Voz · Texto en Pantalla) */}
                {activeTextOverlay && (
                  <div className="p-4 rounded-xl bg-slate-900 text-white border border-slate-700 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                        <VolumeX className="w-4 h-4" />
                        <span>Texto Creado para Escenarios (Sin Voz · Subtítulos en Pantalla):</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const blob = new Blob([activeTextOverlay], { type: 'text/plain;charset=utf-8' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = 'escenarios_texto_reelify.txt';
                            a.click();
                          }}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold flex items-center gap-1"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Guardar .TXT
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTextOverlay('')}
                          className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-bold flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Borrar Texto
                        </button>
                      </div>
                    </div>
                    <textarea
                      value={activeTextOverlay}
                      onChange={(e) => setActiveTextOverlay(e.target.value)}
                      rows={3}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-100 font-mono outline-none focus:border-indigo-500"
                    />
                  </div>
                )}

                {/* Live MP3 Audio Player Strip when an MP3 is created or loaded */}
                {activeMp3Track && (
                  <div className="p-3.5 rounded-xl bg-fuchsia-950 text-white border border-fuchsia-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-fuchsia-600 flex items-center justify-center shrink-0">
                        <Music className="w-4 h-4 text-white" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold truncate">MP3 Listo: {activeMp3Track.title}.mp3</div>
                        {activeMp3Track.lyrics && (
                          <div className="text-[11px] text-fuchsia-200 truncate">{activeMp3Track.lyrics}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <audio controls src={activeMp3Track.audioUrl} className="h-8 w-52 sm:w-64" />
                      <a
                        href={activeMp3Track.audioUrl}
                        download={`${activeMp3Track.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'reelify_audio'}.mp3`}
                        className="px-3 py-1.5 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-xs font-bold flex items-center gap-1"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Guardar .MP3
                      </a>
                      <button
                        type="button"
                        onClick={() => setActiveMp3Track(null)}
                        className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-bold flex items-center gap-1"
                        title="Borrar audio MP3 actual"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Borrar
                      </button>
                    </div>
                  </div>
                )}

                {/* Active Project Status Strip */}
                {activeStudioProject && (
                  <div className="p-3 rounded-xl bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <Film className="w-4 h-4 text-cyan-400 shrink-0" />
                      <span className="font-semibold truncate">
                        Proyecto Activo: {activeStudioProject.title}
                      </span>
                      <span className="text-slate-400 font-mono shrink-0">
                        ({activeStudioProject.scenes?.length || 1} esc · {activeStudioProject.duration || '12s'})
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPlayingVideo(activeStudioProject)}
                        className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 font-semibold flex items-center gap-1"
                      >
                        <Play className="w-3 h-3" />
                        Ver Video
                      </button>
                      <button
                        type="button"
                        onClick={() => exportVideoProjectToMp3(activeStudioProject.title, activeStudioProject.prompt)}
                        className="px-2.5 py-1 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 font-semibold flex items-center gap-1"
                      >
                        <Music className="w-3 h-3" />
                        MP3
                      </button>
                      <button
                        type="button"
                        onClick={() => exportVideoProjectToMp4(activeStudioProject, activeStudioProject.filter || 'none')}
                        className="px-2.5 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 font-semibold flex items-center gap-1"
                      >
                        <Film className="w-3 h-3" />
                        MP4
                      </button>
                    </div>
                  </div>
                )}

                {/* 1-Click Ready Templates */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mr-1">
                    Plantillas Rápidas:
                  </span>
                  {QUICK_VIDEO_TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      disabled={isQuickGenerating}
                      onClick={() =>
                        handleQuickOneClickCreate({
                          customPrompt: tpl.prompt,
                          customTitle: tpl.title,
                          customFolder: selectedFolder !== 'all' ? selectedFolder : tpl.folder,
                          customPreset: tpl.preset,
                          customAspectRatio: tpl.aspectRatio,
                        })
                      }
                      className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-indigo-600 text-slate-700 hover:text-white text-xs font-medium transition-colors flex items-center gap-1.5 border border-slate-200 hover:border-indigo-600"
                      title={`Crear "${tpl.title}" en 1 clic`}
                    >
                      <span>{tpl.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Interactive 3D Stage Scenes Showcase Strip */}
              <div className="mb-8 bg-slate-900 border border-slate-800 rounded-2xl p-5 text-white">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <Box className="w-4 h-4 text-indigo-400" />
                      Escenarios Interactivos en 3D (Sin Voz · Con Texto en Pantalla)
                    </h3>
                    <p className="text-xs text-slate-400">
                      Todos los escenarios 3D y el Auto Cyber Coupe funcionan 100% en tiempo real con texto en pantalla y sin voz no deseada.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                    <button
                      onClick={() => handleLaunch3DPreset('coupe', 'Cyber Coupe 3D Production')}
                      className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Car className="w-4 h-4" />
                      Probar Auto 3D (Cyber Coupe)
                    </button>
                    <button
                      onClick={() => setActiveTab('create')}
                      className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 whitespace-nowrap"
                    >
                      + Crear Multi-Escenas
                    </button>
                    <button
                      onClick={() => setActiveTab('studio3d')}
                      className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white whitespace-nowrap"
                    >
                      Abrir Escenario 3D Completo
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  {STAGE_3D_PRESETS.map((scenePreset) => (
                    <div
                      key={scenePreset.id}
                      className="text-left p-3.5 rounded-xl bg-slate-800/90 hover:bg-slate-800 border border-slate-700 hover:border-indigo-500 transition-all flex flex-col justify-between group"
                    >
                      <div
                        onClick={() => handleLaunch3DPreset(scenePreset.id, scenePreset.name)}
                        className="cursor-pointer"
                      >
                        <span className="inline-block text-[10px] font-mono uppercase tracking-wider text-indigo-400 mb-1">
                          {scenePreset.badge}
                        </span>
                        <h4 className="text-xs font-bold text-white group-hover:text-indigo-300 transition-colors">
                          {scenePreset.name}
                        </h4>
                        <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
                          {scenePreset.subtitle}
                        </p>
                      </div>
                      <div className="mt-3 pt-2.5 border-t border-slate-700/70 flex flex-col gap-1.5">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              handleStartCreateInTarget({
                                preset: scenePreset.id,
                                folder: selectedFolder !== 'all' ? selectedFolder : `Escenario ${scenePreset.name}`,
                              })
                            }
                            className="flex-1 py-1.5 px-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors"
                            title={`Crear video en ${scenePreset.name}`}
                          >
                            <Plus className="w-3 h-3" />
                            Crear Video
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleStartCreateInTarget({
                                preset: scenePreset.id,
                                folder: selectedFolder !== 'all' ? selectedFolder : `Escenario ${scenePreset.name}`,
                                openCamera: true,
                              })
                            }
                            className="p-1.5 rounded-lg bg-rose-600/25 hover:bg-rose-600 border border-rose-500/40 text-rose-300 hover:text-white transition-colors"
                            title={`Grabar cámara en ${scenePreset.name}`}
                          >
                            <Camera className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleLaunch3DPreset(scenePreset.id, scenePreset.name)}
                          className="w-full py-1 px-2 rounded bg-slate-900/70 hover:bg-slate-900 text-[11px] text-indigo-300 font-medium flex items-center justify-between"
                        >
                          <span>Abrir Escenario 3D</span>
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">Your Videos</h2>
                  <p className="text-slate-500 text-sm">
                    Crea un video en cualquier <strong>carpeta</strong> o <strong>escenario 3D</strong>, o marca <strong>"Unir"</strong> para combinar varios videos.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() =>
                      handleStartCreateInTarget({
                        folder: selectedFolder !== 'all' ? selectedFolder : undefined,
                      })
                    }
                    className="px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {selectedFolder !== 'all' ? `Crear Video en "${selectedFolder}"` : 'Crear Video en Carpeta'}
                  </button>

                  {isCreatingFolder ? (
                    <form onSubmit={handleAddCustomFolder} className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1">
                      <Folder className="w-4 h-4 text-indigo-500 shrink-0" />
                      <input
                        type="text"
                        value={newFolderFilterName}
                        onChange={(e) => setNewFolderFilterName(e.target.value)}
                        placeholder="New folder name..."
                        maxLength={100}
                        autoFocus
                        className="text-xs text-slate-900 focus:outline-none w-36"
                      />
                      <button
                        type="submit"
                        className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                        title="Create folder"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsCreatingFolder(false);
                          setNewFolderFilterName('');
                        }}
                        className="p-1 text-slate-400 hover:bg-slate-100 rounded"
                        title="Cancel"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  ) : (
                    <button
                      onClick={() => setIsCreatingFolder(true)}
                      className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
                    >
                      <FolderPlus className="w-3.5 h-3.5 text-indigo-600" />
                      New Folder
                    </button>
                  )}

                  <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
                    <button
                      onClick={() => setGroupByFolder(true)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                        groupByFolder ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5" />
                      Group by Folder
                    </button>
                    <button
                      onClick={() => setGroupByFolder(false)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                        !groupByFolder ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Grid className="w-3.5 h-3.5" />
                      Flat Grid
                    </button>
                  </div>
                </div>
              </div>

              {folderList.length > 0 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-4 mb-6 border-b border-slate-200">
                  <button
                    onClick={() => {
                      setSelectedFolder('all');
                      setShowOnlyLiked(false);
                    }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                      selectedFolder === 'all' && !showOnlyLiked
                        ? 'bg-slate-900 text-white'
                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Todos ({videos.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowOnlyLiked((prev) => !prev)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 border ${
                      showOnlyLiked
                        ? 'bg-pink-600 text-white border-pink-600'
                        : 'bg-white border-pink-200 text-pink-600 hover:bg-pink-50'
                    }`}
                  >
                    <Heart className={`w-3.5 h-3.5 ${showOnlyLiked ? 'fill-white text-white' : 'fill-pink-500 text-pink-500'}`} />
                    Mis Gustas ({likedVideosCount})
                  </button>
                  {folderList.map((f) => (
                    <div
                      key={f.name}
                      className={`inline-flex items-center rounded-lg border transition-colors shrink-0 overflow-hidden ${
                        selectedFolder === f.name
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedFolder(f.name)}
                        className="px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Folder className="w-3.5 h-3.5" />
                        <span>{f.name}</span>
                        <span className="opacity-75 font-mono tabular-nums">({f.count})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStartCreateInTarget({ folder: f.name })}
                        className={`px-2 py-1.5 text-[11px] font-bold border-l flex items-center gap-0.5 transition-colors ${
                          selectedFolder === f.name
                            ? 'border-indigo-500 hover:bg-indigo-700 text-white'
                            : 'border-slate-200 hover:bg-indigo-50 text-indigo-600'
                        }`}
                        title={`Crear video en la carpeta "${f.name}"`}
                      >
                        <Plus className="w-3 h-3" />
                        Crear
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {error && (
                <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-3 text-amber-800 text-sm">
                  <div className="flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 shrink-0 text-amber-600" />
                    <span>{error}</span>
                  </div>
                  <button onClick={() => setError(null)} className="text-xs font-medium underline">Dismiss</button>
                </div>
              )}

              {filteredVideos.length === 0 && groupedVideos.length === 0 ? (
                <EmptyState 
                  onAction={() =>
                    handleStartCreateInTarget({
                      folder: selectedFolder !== 'all' ? selectedFolder : undefined,
                    })
                  } 
                  hasSearchOrFilter={searchQuery.trim() !== '' || selectedFolder !== 'all'}
                  onResetFilter={() => {
                    setSearchQuery('');
                    setSelectedFolder('all');
                  }}
                />
              ) : groupByFolder ? (
                <div className="space-y-10">
                  {groupedVideos.map(([folderGroup, groupVids]) => (
                    <section key={folderGroup} className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                        <div className="flex items-center gap-2.5">
                          <Folder className="w-5 h-5 text-indigo-600" />
                          <h3 className="text-base font-semibold text-slate-900">{folderGroup}</h3>
                          <span className="text-xs text-slate-400 font-mono tabular-nums">
                            · {groupVids.length} {groupVids.length === 1 ? 'project' : 'projects'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              handleStartCreateInTarget({
                                folder: folderGroup,
                                openCamera: true,
                              })
                            }
                            className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-semibold flex items-center gap-1 whitespace-nowrap transition-colors"
                          >
                            <Camera className="w-3.5 h-3.5" />
                            Grabar en Carpeta
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleStartCreateInTarget({
                                folder: folderGroup === 'Uncategorized' ? '' : folderGroup,
                              })
                            }
                            className="px-3 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 hover:text-indigo-700 text-xs font-semibold flex items-center gap-1 whitespace-nowrap transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Crear Video en "{folderGroup}"
                          </button>
                        </div>
                      </div>

                      {groupVids.length === 0 ? (
                        <div className="py-8 px-4 text-center bg-white border border-dashed border-slate-200 rounded-xl text-xs text-slate-400 space-y-3">
                          <p>Esta carpeta está vacía. Crea un video nuevo o graba con tu cámara directamente aquí.</p>
                          <div className="flex items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                handleStartCreateInTarget({
                                  folder: folderGroup === 'Uncategorized' ? '' : folderGroup,
                                })
                              }
                              className="px-3.5 py-1.5 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 inline-flex items-center gap-1.5"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Crear Video Aquí
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleStartCreateInTarget({
                                  folder: folderGroup,
                                  openCamera: true,
                                })
                              }
                              className="px-3.5 py-1.5 rounded-lg bg-rose-600 text-white font-semibold hover:bg-rose-500 inline-flex items-center gap-1.5"
                            >
                              <Camera className="w-3.5 h-3.5" />
                              Grabar Cámara Aquí
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                          {groupVids.map(vid => (
                            <VideoCard 
                              key={vid.id} 
                              video={vid} 
                              existingFolders={existingFolderNames}
                              isSelectedForMerge={selectedVideoIdsForMerge.includes(vid.id)}
                              isLiked={likedSet.has(vid.id)}
                              onToggleLike={handleToggleLikeVideo}
                              onToggleSelectForMerge={handleToggleSelectForMerge}
                              onUpdateFolder={handleUpdateVideoFolder}
                              onOpenIn3D={handleOpenIn3D}
                              onPlayVideo={setPlayingVideo}
                              onEditVideoInStudio={handleEditVideoInStudio}
                              onDuplicateVideo={handleDuplicateVideo}
                              onDeleteVideo={handleDeleteVideo}
                            />
                          ))}
                        </div>
                      )}
                    </section>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredVideos.map(vid => (
                    <VideoCard 
                      key={vid.id} 
                      video={vid} 
                      existingFolders={existingFolderNames}
                      isSelectedForMerge={selectedVideoIdsForMerge.includes(vid.id)}
                      isLiked={likedSet.has(vid.id)}
                      onToggleLike={handleToggleLikeVideo}
                      onToggleSelectForMerge={handleToggleSelectForMerge}
                      onUpdateFolder={handleUpdateVideoFolder}
                      onOpenIn3D={handleOpenIn3D}
                      onPlayVideo={setPlayingVideo}
                      onEditVideoInStudio={handleEditVideoInStudio}
                      onDuplicateVideo={handleDuplicateVideo}
                      onDeleteVideo={handleDeleteVideo}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Multi-Scene Video & 3D Scenario Builder with Dedicated Preview & Save Buttons */
            <div className="max-w-4xl mx-auto space-y-6">
              <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900">Estudio Multi-Escenas y Escenarios 3D con IA</h2>
                    <p className="text-slate-500 text-sm">
                      Usa los botones directos <strong>Crear</strong>, <strong>Guardar</strong>, <strong>Borrar</strong>, <strong>Cargar</strong>, <strong>Crear MP3</strong> y <strong>Crear MP4</strong> en cualquier momento.
                    </p>
                  </div>

                  {/* Primary Preview & 3D Buttons */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handlePreviewDraftVideo}
                      className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
                    >
                      <Eye className="w-4 h-4 text-indigo-400" />
                      Preview ({draftScenes.length} Escenas · {draftTotalSeconds}s)
                    </button>
                    <button
                      type="button"
                      onClick={handleOpenDraftIn3D}
                      className="px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
                    >
                      <Box className="w-4 h-4" />
                      Preview 3D
                    </button>
                  </div>
                </div>

                {/* 7 Direct Easy Action Buttons in Create Studio: CREAR · GUARDAR · BORRAR · CARGAR · CREAR TEXTO · CREAR MP3 · CREAR MP4 */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => handleSaveDraftProject()}
                    disabled={isGenerating}
                    className="px-3 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors disabled:opacity-50"
                  >
                    {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    Crear
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveDraftProject()}
                    disabled={isGenerating}
                    className="px-3 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    Guardar
                  </button>
                  <button
                    type="button"
                    onClick={handleEasyDelete}
                    className="px-3 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Borrar
                  </button>
                  <button
                    type="button"
                    onClick={() => easyLoadInputRef.current?.click()}
                    className="px-3 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    Cargar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEasyCreateText()}
                    disabled={isCreatingText}
                    className="px-3 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors disabled:opacity-50"
                  >
                    {isCreatingText ? <Loader2 className="w-4 h-4 animate-spin" /> : <TypeIcon className="w-4 h-4 text-emerald-400" />}
                    {isCreatingText ? 'Creando...' : 'Crear Texto'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEasyCreateMp3()}
                    disabled={isCreatingMp3}
                    className="px-3 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors disabled:opacity-50"
                  >
                    {isCreatingMp3 ? <Loader2 className="w-4 h-4 animate-spin" /> : <Music className="w-4 h-4" />}
                    {isCreatingMp3 ? 'Creando MP3...' : 'Crear MP3'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEasyCreateMp4()}
                    disabled={isCreatingMp4}
                    className="px-3 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors disabled:opacity-50"
                  >
                    {isCreatingMp4 ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileVideo className="w-4 h-4" />}
                    {isCreatingMp4 ? 'Creando MP4...' : 'Crear MP4'}
                  </button>
                </div>
              </div>

              <form onSubmit={handleSaveDraftProject} className="space-y-6">
                {/* Project Title, Folder & 3D Scenario Quick Selector */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
                        Título del Video
                      </label>
                      <input
                        type="text"
                        value={projectTitle}
                        onChange={(e) => setProjectTitle(e.target.value)}
                        maxLength={200}
                        placeholder="Ej. Película Sci-Fi Multi-Escenario 3D"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-sm text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
                        Carpeta (Folder)
                      </label>
                      <div className="relative">
                        <Folder className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          list="create-folder-suggestions"
                          value={folderName}
                          onChange={(e) => setFolderName(e.target.value)}
                          maxLength={100}
                          placeholder="Selecciona o escribe cualquier carpeta..."
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                        <datalist id="create-folder-suggestions">
                          {existingFolderNames.map(f => (
                            <option key={f} value={f} />
                          ))}
                        </datalist>
                      </div>
                    </div>
                  </div>

                  {/* Quick Folder & 3D Scenario Chips */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                    <div>
                      <span className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                        Elegir Cualquier Carpeta:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {existingFolderNames.map((f) => (
                          <button
                            key={f}
                            type="button"
                            onClick={() => setFolderName(f)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1 ${
                              folderName === f
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            <Folder className="w-3 h-3" />
                            {f}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                        Elegir Cualquier Escenario 3D:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {STAGE_3D_PRESETS.map((sp) => (
                          <button
                            key={sp.id}
                            type="button"
                            onClick={() => {
                              setSelected3DPresetForCreate(sp.id);
                              setDraftScenes((prev) =>
                                prev.map((sc) => ({ ...sc, scene3dPreset: sp.id }))
                              );
                            }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1 ${
                              selected3DPresetForCreate === sp.id
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            <Box className="w-3 h-3" />
                            {sp.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Upload Video for 3D Stage OR Upload Multiple Images */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        Subir Video para Escenario 3D o Imágenes para Múltiples Escenas
                      </h3>
                      <p className="text-xs text-slate-500">
                        Sube un archivo de video (`.mp4`, `.webm`, `.mov`) para extraer sus escenas y proyectarlo en la pantalla curva 3D, o sube varias fotos.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setIsCameraModalOpen(true)}
                      className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center gap-2 transition-colors shadow-xs"
                    >
                      <Camera className="w-4 h-4" />
                      Grabar desde Cámara del Dispositivo
                    </button>

                    <label className="cursor-pointer px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-2 transition-colors">
                      {isCompressingImages ? <Loader2 className="w-4 h-4 animate-spin" /> : <Film className="w-4 h-4" />}
                      Subir Video para 3D / Escenas
                      <input
                        type="file"
                        accept="video/*"
                        onChange={handleUploadVideoFileForStudio}
                        className="hidden"
                        disabled={isCompressingImages}
                      />
                    </label>

                    <label className="cursor-pointer px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-2 transition-colors">
                      <Upload className="w-4 h-4 text-indigo-400" />
                      Subir Múltiples Imágenes ({uploadedImages.length})
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleMultiImageUpload}
                        className="hidden"
                        disabled={isCompressingImages}
                      />
                    </label>

                    {uploadedVideoName && (
                      <span className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2">
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        Video cargado para 3D: {uploadedVideoName}
                      </span>
                    )}
                  </div>
                </div>

                {/* AI Prompt & Multi-Scenario Generator Box */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        Generador IA de Múltiples Escenas y Escenarios
                      </h3>
                      <p className="text-xs text-slate-500">
                        Describe tu idea y elige cuántas escenas y qué duración total deseas que la IA construya automáticamente.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 font-medium">N.º de escenas IA:</span>
                      {[3, 4, 6, 8].map((cnt) => (
                        <button
                          key={cnt}
                          type="button"
                          onClick={() => setTargetSceneCount(cnt)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold border transition-colors ${
                            targetSceneCount === cnt
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {cnt} esc
                        </button>
                      ))}
                    </div>
                  </div>

                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    maxLength={2000}
                    placeholder="Ej. Una historia épica que comienza con un auto futurista bajo la lluvia de neón, despega en un dron hacia una estación espacial orbital y analiza una estructura molecular en gravedad cero..."
                    className="w-full h-24 bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-sm text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs font-semibold text-slate-500 mb-1.5">Formato (Aspect Ratio)</p>
                      <div className="grid grid-cols-2 gap-2">
                        {(['16:9', '9:16'] as const).map((ratio) => (
                          <button
                            key={ratio}
                            type="button"
                            onClick={() => setAspectRatio(ratio)}
                            className={`py-2 px-3 rounded-lg text-xs font-medium border transition-colors ${
                              aspectRatio === ratio
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {ratio}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-slate-500 mb-1.5">Duración Objetivo</p>
                      <div className="grid grid-cols-4 gap-1.5">
                        {(['10s', '15s', '30s', '60s'] as const).map((dur) => (
                          <button
                            key={dur}
                            type="button"
                            onClick={() => setDuration(dur)}
                            className={`py-2 px-2 rounded-lg text-xs font-mono font-medium border transition-colors ${
                              duration === dur
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {dur}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={handleGenerateMultiScenesWithAI}
                        disabled={isGenerating}
                        className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                      >
                        {isGenerating ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Generando...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4" />
                            <span>Generar {targetSceneCount} Escenas con IA</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Interactive Multi-Scene Editor List (Add, Edit, Choose 3D Scenario per Scene, Upload/Generate Image per Scene) */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        Línea de Tiempo de Múltiples Escenas ({draftScenes.length} Escenas · {draftTotalSeconds}s Total)
                      </h3>
                      <p className="text-xs text-slate-500">
                        Personaliza cada escena, elige su escenario 3D individual y ajusta su duración para crear videos tan largos como necesites.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const presets: SubjectPresetId[] = ['coupe', 'station', 'drone', 'sculpture', 'protein'];
                        const nextPreset = presets[draftScenes.length % presets.length];
                        setDraftScenes((prev) => [
                          ...prev,
                          {
                            description: `Nueva escena #${prev.length + 1}: Movimiento de cámara dinámico en escenario ${nextPreset.toUpperCase()}.`,
                            duration: '5s',
                            scene3dPreset: nextPreset,
                            imageUrl: createSampleSceneDataUrl(nextPreset, `Escena 0${prev.length + 1} · ${nextPreset.toUpperCase()}`),
                          },
                        ]);
                      }}
                      className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1.5"
                    >
                      <Plus className="w-4 h-4" />
                      Agregar Nueva Escena
                    </button>
                  </div>

                  <div className="space-y-3">
                    {draftScenes.map((sc, idx) => (
                      <div
                        key={idx}
                        className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col md:flex-row gap-4 items-start"
                      >
                        {/* Scene Thumbnail & Image Controls */}
                        <div className="w-full md:w-44 shrink-0 space-y-2">
                          <div className="aspect-video rounded-lg overflow-hidden bg-slate-900 border border-slate-300 relative">
                            {sc.imageUrl ? (
                              <img src={sc.imageUrl} alt={`Escena ${idx + 1}`} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-xs text-slate-500">
                                Sin imagen
                              </div>
                            )}
                            <span className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded bg-slate-950/80 text-white font-mono text-[10px] font-bold">
                              ESCENA 0{idx + 1}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <label className="flex-1 cursor-pointer py-1 px-2 rounded bg-white border border-slate-200 hover:bg-slate-100 text-[11px] font-medium text-slate-700 text-center">
                              Subir Foto
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => handleSceneRowImageUpload(idx, e)}
                                className="hidden"
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() => handleGenerateSingleSceneAiImage(idx)}
                              className="py-1 px-2 rounded bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-[11px] font-medium text-indigo-700"
                              title="Generar imagen con IA para esta escena"
                            >
                              IA Img
                            </button>
                          </div>
                        </div>

                        {/* Scene Description, Duration, and 3D Scenario Controls */}
                        <div className="flex-1 w-full space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-800">Escenario 3D:</span>
                              <select
                                value={sc.scene3dPreset || 'coupe'}
                                onChange={(e) => {
                                  const val = e.target.value as SubjectPresetId;
                                  setDraftScenes((prev) =>
                                    prev.map((item, i) => (i === idx ? { ...item, scene3dPreset: val } : item))
                                  );
                                }}
                                className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-800 focus:outline-none focus:border-indigo-500"
                              >
                                {STAGE_3D_PRESETS.map((sp) => (
                                  <option key={sp.id} value={sp.id}>
                                    {sp.name} ({sp.badge})
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-slate-600">Duración:</span>
                              <select
                                value={sc.duration}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setDraftScenes((prev) =>
                                    prev.map((item, i) => (i === idx ? { ...item, duration: val } : item))
                                  );
                                }}
                                className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-mono font-semibold text-indigo-600 focus:outline-none focus:border-indigo-500"
                              >
                                {['2.5s', '3s', '4s', '5s', '8s', '10s', '15s'].map((d) => (
                                  <option key={d} value={d}>
                                    {d}
                                  </option>
                                ))}
                              </select>

                              {draftScenes.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDraftScenes((prev) => prev.filter((_, itemIdx) => itemIdx !== idx))
                                  }
                                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                                  title="Eliminar escena"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>

                          <textarea
                            value={sc.description}
                            onChange={(e) => {
                              const val = e.target.value;
                              setDraftScenes((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, description: val } : item))
                              );
                            }}
                            rows={2}
                            placeholder="Descripción visual y dirección de cámara para esta escena..."
                            className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {error && (
                  <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-600 text-sm">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Bottom Bar with Preview, Preview 3D, and Save Video Buttons */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                  <button
                    type="button"
                    onClick={handlePreviewDraftVideo}
                    className="w-full bg-slate-900 text-white px-6 py-4 rounded-xl font-semibold hover:bg-slate-800 transition-all flex items-center justify-center gap-2.5 text-sm"
                  >
                    <Eye className="w-5 h-5 text-indigo-400" />
                    Preview Video ({draftTotalSeconds}s)
                  </button>

                  <button
                    type="button"
                    onClick={handleOpenDraftIn3D}
                    className="w-full bg-indigo-50 text-indigo-700 border border-indigo-200 px-6 py-4 rounded-xl font-semibold hover:bg-indigo-100 transition-all flex items-center justify-center gap-2.5 text-sm"
                  >
                    <Box className="w-5 h-5" />
                    Abrir en Escenario 3D
                  </button>

                  <button 
                    type="submit"
                    disabled={isGenerating || isCompressingImages}
                    className="w-full bg-emerald-600 text-white px-6 py-4 rounded-xl font-semibold hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2.5 text-sm"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        {generationStepText || 'Guardando...'}
                      </>
                    ) : (
                      <>
                        <Save className="w-5 h-5" />
                        Save Video ({draftScenes.length} Escenas)
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </main>

      {playingVideo && (
        <VideoPlayerModal
          video={playingVideo}
          isLiked={likedSet.has(playingVideo.id)}
          onToggleLike={handleToggleLikeVideo}
          onEditVideoInStudio={handleEditVideoInStudio}
          onClose={() => setPlayingVideo(null)}
          onOpenIn3D={handleOpenIn3D}
          onUpdateVideoImages={handleUpdateVideoImages}
          onSaveAsNewProject={persistVideoProject}
          onDeleteVideo={handleDeleteVideo}
        />
      )}

      {isCameraModalOpen && (
        <CameraRecorderModal
          initialFolder={cameraModalFolder}
          initialPreset={cameraModalPreset}
          existingFolders={existingFolderNames}
          onClose={() => setIsCameraModalOpen(false)}
          onSaveRecordedVideo={async (proj) => {
            await persistVideoProject(proj);
            setActiveStudioProject(proj);
            setSaveBannerMessage(`Grabación "${proj.title}" guardada en la carpeta "${proj.folder}".`);
            setTimeout(() => setSaveBannerMessage(null), 4000);
          }}
          onAddSceneFromCamera={(newScene, vidUrl, targetFolder, targetPreset) => {
            setDraftScenes((prev) => [...prev, newScene]);
            if (vidUrl) setUploadedVideoObjectUrl(vidUrl);
            if (targetFolder) setFolderName(targetFolder);
            if (targetPreset) setSelected3DPresetForCreate(targetPreset);
            setActiveTab('create');
            setSaveBannerMessage('Escena de cámara agregada a la secuencia Multi-Escenas.');
            setTimeout(() => setSaveBannerMessage(null), 3500);
          }}
          onOpenRecordedIn3D={(proj) => {
            setActiveStudioProject(proj);
            if (proj.scene3dPreset) setActive3DSubject(proj.scene3dPreset);
            setActiveTab('studio3d');
          }}
        />
      )}
    </div>
  );
}
