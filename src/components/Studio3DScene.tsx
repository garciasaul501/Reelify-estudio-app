import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import {
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Folder,
  Layers,
  LayoutDashboard,
  Loader2,
  Music,
  Pause,
  Play,
  Plus,
  Save,
  Sparkles,
  Sun,
  SwitchCamera,
  Type as TypeIcon,
  Upload,
  Video,
  Volume2,
  VolumeX
} from 'lucide-react';

export type SubjectPresetId = 'coupe' | 'sculpture' | 'drone' | 'station' | 'protein';
export type ParticlePatternId = 'vortex' | 'fountain' | 'galaxy';

export interface SceneItem {
  description: string;
  duration: string;
  imageUrl?: string;
  scene3dPreset?: SubjectPresetId;
  overlayText?: string;
}

export interface StudioProjectContext {
  id?: string;
  title: string;
  prompt?: string;
  folder?: string;
  scenes?: SceneItem[];
  videoData?: string;
  referenceImage?: string;
}

export interface GeneratedMusicTrack {
  title: string;
  audioUrl: string;
  lyrics?: string;
}

interface Studio3DSceneProps {
  activeProject: StudioProjectContext | null;
  initialSubject?: SubjectPresetId;
  generatedMusicTrack?: GeneratedMusicTrack | null;
  onMusicTrackGenerated?: (track: GeneratedMusicTrack) => void;
  onOpenDashboard: () => void;
  onOpenCreate: () => void;
  onCreateVideoInScenario?: (preset: SubjectPresetId) => void;
  onOpenCameraRecorder?: () => void;
  onSaveProjectScenes?: (scenes: SceneItem[], uploadedVideoUrl?: string) => void;
  onCapture3DSnapshot?: (dataUrl: string, preset: SubjectPresetId) => void;
}

type CameraPresetId = 'director' | 'lens' | 'crane' | 'macro';
type LightingPresetId = 'golden' | 'cyber' | 'daylight';
type FinishPresetId = 'obsidian' | 'titanium' | 'gold';

// Pre-allocated module-scope scratch math objects (Zero GC in render loop)
const _camTargetPos = new THREE.Vector3();
const _camTargetLook = new THREE.Vector3();
const _tempVec3 = new THREE.Vector3();
const _dummyObj = new THREE.Object3D();
const _scratchColor = new THREE.Color();

const CAMERA_PRESETS: Record<CameraPresetId, { pos: [number, number, number]; target: [number, number, number]; label: string }> = {
  director: { pos: [6.8, 3.6, 7.6], target: [0, 1.1, 0], label: 'Studio Wide' },
  lens: { pos: [0.0, 1.55, 3.65], target: [0, 1.15, -0.8], label: 'Camera POV' },
  crane: { pos: [-5.5, 7.2, 5.2], target: [0, 0.9, 0], label: 'Crane Top' },
  macro: { pos: [2.3, 1.85, 5.4], target: [0, 1.45, 4.2], label: 'Cinema Rig' },
};

const LIGHTING_PRESETS: Record<
  LightingPresetId,
  {
    label: string;
    bgHex: number;
    keyHex: number;
    keyIntensity: number;
    hemiSkyHex: number;
    hemiGroundHex: number;
    rimHex: number;
    rimIntensity: number;
  }
> = {
  golden: {
    label: 'Neon White',
    bgHex: 0xffffff,
    keyHex: 0x00e5ff,
    keyIntensity: 3.2,
    hemiSkyHex: 0xffffff,
    hemiGroundHex: 0xf8fafc,
    rimHex: 0xff007f,
    rimIntensity: 3.4,
  },
  cyber: {
    label: 'Cyber Pink',
    bgHex: 0xfdf4ff,
    keyHex: 0xff007f,
    keyIntensity: 3.1,
    hemiSkyHex: 0xf0f9ff,
    hemiGroundHex: 0xf8fafc,
    rimHex: 0x00e5ff,
    rimIntensity: 3.6,
  },
  daylight: {
    label: 'Neon Cyan',
    bgHex: 0xf8fafc,
    keyHex: 0xffffff,
    keyIntensity: 3.5,
    hemiSkyHex: 0xe0f2fe,
    hemiGroundHex: 0xffffff,
    rimHex: 0x7c3aed,
    rimIntensity: 3.0,
  },
};

const FINISH_PRESETS: Record<FinishPresetId, { label: string; color: number; metalness: number; roughness: number; clearcoat: number }> = {
  obsidian: { label: 'Neon Violet', color: 0x7c3aed, metalness: 0.78, roughness: 0.18, clearcoat: 0.95 },
  titanium: { label: 'Neon Cyan', color: 0x00e5ff, metalness: 0.82, roughness: 0.16, clearcoat: 0.92 },
  gold: { label: 'Neon Pink', color: 0xff007f, metalness: 0.85, roughness: 0.18, clearcoat: 0.95 },
};

// Procedural radial contact shadow texture
function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 12, 128, 128, 120);
  grad.addColorStop(0, 'rgba(124, 58, 237, 0.32)');
  grad.addColorStop(0.55, 'rgba(0, 229, 255, 0.14)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Procedural soft glowing neon sprite texture for 3D audio-reactive particles
function createNeonParticleSpriteTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 60);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
  grad.addColorStop(0.28, 'rgba(255, 255, 255, 0.92)');
  grad.addColorStop(0.62, 'rgba(255, 255, 255, 0.38)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Procedural studio floor calibration grid texture (White Floor + Electric Neon Grid)
function createStageFloorTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 1024, 1024);

  ctx.strokeStyle = 'rgba(0, 229, 255, 0.38)';
  ctx.lineWidth = 2;
  const step = 64;
  for (let i = 0; i <= 1024; i += step) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 1024);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(1024, i);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(255, 0, 127, 0.52)';
  ctx.lineWidth = 3.5;
  [180, 320, 460].forEach((radius) => {
    ctx.beginPath();
    ctx.arc(512, 512, radius, 0, Math.PI * 2);
    ctx.stroke();
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export default function Studio3DScene({
  activeProject,
  initialSubject = 'coupe',
  generatedMusicTrack,
  onMusicTrackGenerated,
  onOpenDashboard,
  onOpenCreate,
  onCreateVideoInScenario,
  onOpenCameraRecorder,
  onSaveProjectScenes,
  onCapture3DSnapshot,
}: Studio3DSceneProps) {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const capture3DFrameRef = useRef<(() => string | null) | null>(null);

  const [cameraPreset, setCameraPreset] = useState<CameraPresetId>('director');
  const [lightingPreset, setLightingPreset] = useState<LightingPresetId>('golden');
  const [subjectPreset, setSubjectPreset] = useState<SubjectPresetId>(initialSubject);
  const [finishPreset, setFinishPreset] = useState<FinishPresetId>('gold');
  const [explodedFactor, setExplodedFactor] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isAutoMultiScene, setIsAutoMultiScene] = useState<boolean>(true);
  const [activeSceneIndex, setActiveSceneIndex] = useState<number>(0);
  const [isDockCollapsed, setIsDockCollapsed] = useState<boolean>(false);
  const [inspectedPartName, setInspectedPartName] = useState<string>('Estudio 3D Neón & Blanco · Partículas 3D Rítmicas Activas');
  const [localScenes, setLocalScenes] = useState<SceneItem[]>(() => activeProject?.scenes || []);
  const [uploaded3DVideoUrl, setUploaded3DVideoUrl] = useState<string | null>(() => activeProject?.videoData || null);
  const [uploaded3DVideoName, setUploaded3DVideoName] = useState<string>(
    () => (activeProject?.videoData ? 'Video del Proyecto Activo' : '')
  );
  const [videoBgMode, setVideoBgMode] = useState<'dome_and_wall' | 'scene_backdrop' | 'led_wall'>('dome_and_wall');
  const [videoBgOpacity, setVideoBgOpacity] = useState<number>(0.85);
  const [isVideoBgMuted, setIsVideoBgMuted] = useState<boolean>(true);
  const [isDraggingVideoOver3D, setIsDraggingVideoOver3D] = useState<boolean>(false);
  const [isLiveWebcamOnWall, setIsLiveWebcamOnWall] = useState<boolean>(false);
  const [webcamFacingMode, setWebcamFacingMode] = useState<'user' | 'environment'>('user');
  const [isWebcamMirrored, setIsWebcamMirrored] = useState<boolean>(false);
  const [saveFeedback, setSaveFeedback] = useState<boolean>(false);
  const [snapshotFeedback, setSnapshotFeedback] = useState<boolean>(false);
  const [scenarioTextInput, setScenarioTextInput] = useState<string>(
    () =>
      activeProject?.scenes?.[0]?.overlayText ||
      activeProject?.scenes?.[0]?.description ||
      'EDICIÓN NEÓN & BLANCO 3D · PRODUCCIÓN EN ESCENARIO SIN VOZ'
  );
  const [textFeedback, setTextFeedback] = useState<boolean>(false);

  // 3D Music-Reactive Particle System State & Web Audio API Refs
  const [particlesEnabled, setParticlesEnabled] = useState<boolean>(true);
  const [particlePattern, setParticlePattern] = useState<ParticlePatternId>('vortex');
  const [particleReactivity, setParticleReactivity] = useState<number>(1.35);
  const [musicAudioUrl, setMusicAudioUrl] = useState<string | null>(() => generatedMusicTrack?.audioUrl || null);
  const [musicTrackTitle, setMusicTrackTitle] = useState<string>(
    () => generatedMusicTrack?.title || 'Pulso Rítmico Neón 3D (124 BPM)'
  );
  const [isMusicPlaying, setIsMusicPlaying] = useState<boolean>(false);
  const [isGeneratingMusic, setIsGeneratingMusic] = useState<boolean>(false);
  const [beatMeterUi, setBeatMeterUi] = useState<{ bass: number; mid: number; treble: number }>({
    bass: 38,
    mid: 45,
    treble: 32,
  });

  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const threeVideoTexRef = useRef<THREE.VideoTexture | null>(null);
  const liveWebcamStreamRef = useRef<MediaStream | null>(null);
  const sceneImgElRef = useRef<HTMLImageElement | null>(null);

  const musicAudioElRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const freqDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  // Ensure scenarios never speak unwanted audio (Modo Silencio · Solo Texto)
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, [activeSceneIndex, subjectPreset]);

  // Sync when activeProject changes
  useEffect(() => {
    if (activeProject?.scenes) {
      setLocalScenes(activeProject.scenes);
      const firstSc = activeProject.scenes[0];
      if (firstSc) {
        setScenarioTextInput(firstSc.overlayText || firstSc.description);
      }
    }
    if (activeProject?.videoData) {
      setUploaded3DVideoUrl(activeProject.videoData);
      if (!uploaded3DVideoName) {
        setUploaded3DVideoName(activeProject.title || 'Video del Proyecto');
      }
    }
  }, [activeProject]);

  // Sync when generatedMusicTrack prop changes from parent App
  useEffect(() => {
    if (generatedMusicTrack?.audioUrl) {
      setMusicAudioUrl(generatedMusicTrack.audioUrl);
      setMusicTrackTitle(generatedMusicTrack.title || 'Música Generada IA');
    }
  }, [generatedMusicTrack]);

  // Mutable refs for 60fps loop access without re-creating the WebGL context
  const stateRef = useRef({
    cameraPreset: 'director' as CameraPresetId,
    hasPendingCameraTransition: false,
    lightingPreset: 'golden' as LightingPresetId,
    subjectPreset: initialSubject as SubjectPresetId,
    finishPreset: 'gold' as FinishPresetId,
    explodedFactor: 0,
    isPlaying: true,
    activeSceneIndex: 0,
    isWebcamMirrored: false,
    hasDynamicVideoBg: Boolean(activeProject?.videoData),
    videoBgMode: 'dome_and_wall' as 'dome_and_wall' | 'scene_backdrop' | 'led_wall',
    videoBgOpacity: 0.85,
    particlesEnabled: true,
    particlePattern: 'vortex' as ParticlePatternId,
    particleReactivity: 1.35,
    isMusicPlaying: false,
    bassEnergy: 0,
    midEnergy: 0,
    trebleEnergy: 0,
    beatPulse: 0,
    projectTitle: activeProject?.title || 'Reelify 3D Neon Studio',
    currentSceneText:
      activeProject?.scenes?.[0]?.overlayText ||
      activeProject?.scenes?.[0]?.description ||
      'CYBER COUPE 3D · ESCENARIO VISUAL EN PANTALLA',
  });

  useEffect(() => {
    setSubjectPreset(initialSubject);
    stateRef.current.subjectPreset = initialSubject;
  }, [initialSubject]);

  useEffect(() => {
    stateRef.current.explodedFactor = explodedFactor;
  }, [explodedFactor]);

  useEffect(() => {
    stateRef.current.particlesEnabled = particlesEnabled;
  }, [particlesEnabled]);

  useEffect(() => {
    stateRef.current.particlePattern = particlePattern;
  }, [particlePattern]);

  useEffect(() => {
    stateRef.current.particleReactivity = particleReactivity;
  }, [particleReactivity]);

  useEffect(() => {
    stateRef.current.isMusicPlaying = isMusicPlaying;
  }, [isMusicPlaying]);

  useEffect(() => {
    stateRef.current.videoBgMode = videoBgMode;
  }, [videoBgMode]);

  useEffect(() => {
    stateRef.current.videoBgOpacity = videoBgOpacity;
  }, [videoBgOpacity]);

  useEffect(() => {
    if (videoElRef.current && !isLiveWebcamOnWall) {
      videoElRef.current.muted = isVideoBgMuted;
    }
  }, [isVideoBgMuted, isLiveWebcamOnWall]);

  useEffect(() => {
    stateRef.current.isPlaying = isPlaying;
    if (videoElRef.current && !isLiveWebcamOnWall) {
      if (isPlaying) {
        videoElRef.current.play().catch(() => {});
      } else {
        videoElRef.current.pause();
      }
    }
  }, [isPlaying, isLiveWebcamOnWall]);

  useEffect(() => {
    stateRef.current.subjectPreset = subjectPreset;
  }, [subjectPreset]);

  useEffect(() => {
    stateRef.current.finishPreset = finishPreset;
  }, [finishPreset]);

  useEffect(() => {
    stateRef.current.lightingPreset = lightingPreset;
  }, [lightingPreset]);

  // Update active scene image & 3D preset when activeSceneIndex changes
  useEffect(() => {
    stateRef.current.activeSceneIndex = activeSceneIndex;
    stateRef.current.projectTitle = activeProject?.title || 'Reelify 3D Gold Studio';
    const sc = localScenes[activeSceneIndex];
    if (sc) {
      const displayTxt = sc.overlayText || sc.description;
      stateRef.current.currentSceneText = displayTxt;
      setScenarioTextInput(displayTxt);
      if (sc.scene3dPreset) {
        setSubjectPreset(sc.scene3dPreset);
        stateRef.current.subjectPreset = sc.scene3dPreset;
      }
      const imgUrl = sc.imageUrl || activeProject?.referenceImage;
      if (imgUrl) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = imgUrl;
        sceneImgElRef.current = img;
      }
    }
  }, [activeSceneIndex, localScenes, activeProject]);

  // Auto-cycle through multiple scenes & 3D scenarios when Preview Multi-Scene is enabled
  useEffect(() => {
    if (!isPlaying || !isAutoMultiScene || localScenes.length <= 1) return;
    const currentSc = localScenes[activeSceneIndex];
    const sec = Math.max(2, parseFloat(String(currentSc?.duration || '3s')) || 3);
    const timer = window.setTimeout(() => {
      const nextIdx = (activeSceneIndex + 1) % localScenes.length;
      setActiveSceneIndex(nextIdx);
      const camKeys: CameraPresetId[] = ['director', 'lens', 'crane', 'macro'];
      triggerCameraPreset(camKeys[nextIdx % camKeys.length]);
      const lightKeys: LightingPresetId[] = ['golden', 'cyber', 'daylight'];
      setLightingPreset(lightKeys[nextIdx % lightKeys.length]);
    }, sec * 1000);
    return () => clearTimeout(timer);
  }, [isPlaying, isAutoMultiScene, activeSceneIndex, localScenes]);

  // Load uploaded video into hidden HTMLVideoElement + THREE.VideoTexture for Dynamic 3D Studio Background & LED Wall
  useEffect(() => {
    if (isLiveWebcamOnWall) return;
    if (!uploaded3DVideoUrl) {
      stateRef.current.hasDynamicVideoBg = false;
      if (threeVideoTexRef.current) {
        threeVideoTexRef.current.dispose();
        threeVideoTexRef.current = null;
      }
      if (videoElRef.current) {
        videoElRef.current.pause();
        videoElRef.current = null;
      }
      return;
    }
    const vid = document.createElement('video');
    vid.src = uploaded3DVideoUrl;
    vid.crossOrigin = 'anonymous';
    vid.loop = true;
    vid.muted = isVideoBgMuted;
    vid.playsInline = true;
    vid.play().catch(() => {
      vid.muted = true;
      vid.play().catch(() => {});
    });
    videoElRef.current = vid;

    const vTex = new THREE.VideoTexture(vid);
    vTex.colorSpace = THREE.SRGBColorSpace;
    vTex.minFilter = THREE.LinearFilter;
    vTex.magFilter = THREE.LinearFilter;
    if (threeVideoTexRef.current) {
      threeVideoTexRef.current.dispose();
    }
    threeVideoTexRef.current = vTex;
    stateRef.current.hasDynamicVideoBg = true;

    return () => {
      vid.pause();
    };
  }, [uploaded3DVideoUrl, isLiveWebcamOnWall]);

  const startWebcamOn3DWall = async (mode: 'user' | 'environment') => {
    liveWebcamStreamRef.current?.getTracks().forEach((t) => t.stop());
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      liveWebcamStreamRef.current = stream;
      const vid = document.createElement('video');
      vid.srcObject = stream;
      vid.muted = true;
      vid.playsInline = true;
      await vid.play();
      videoElRef.current = vid;
      const vTex = new THREE.VideoTexture(vid);
      vTex.colorSpace = THREE.SRGBColorSpace;
      vTex.minFilter = THREE.LinearFilter;
      vTex.magFilter = THREE.LinearFilter;
      if (threeVideoTexRef.current) threeVideoTexRef.current.dispose();
      threeVideoTexRef.current = vTex;
      stateRef.current.hasDynamicVideoBg = true;
      setIsLiveWebcamOnWall(true);
      setInspectedPartName(
        `Cámara en Vivo (${mode === 'user' ? 'Frontal' : 'Trasera'}) · Fondo Dinámico 3D`
      );
    } catch {
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        liveWebcamStreamRef.current = fallbackStream;
        const vid = document.createElement('video');
        vid.srcObject = fallbackStream;
        vid.muted = true;
        vid.playsInline = true;
        await vid.play();
        videoElRef.current = vid;
        const vTex = new THREE.VideoTexture(vid);
        vTex.colorSpace = THREE.SRGBColorSpace;
        if (threeVideoTexRef.current) threeVideoTexRef.current.dispose();
        threeVideoTexRef.current = vTex;
        stateRef.current.hasDynamicVideoBg = true;
        setIsLiveWebcamOnWall(true);
        setInspectedPartName('Cámara en Vivo Proyectada en Fondo Dinámico 3D');
      } catch {
        if (onOpenCameraRecorder) {
          onOpenCameraRecorder();
        }
      }
    }
  };

  // Toggle Live Device Camera Feed directly onto the 3D Curved LED Volume Wall & Dynamic Background
  const handleToggleLiveWebcamOn3DWall = async () => {
    if (isLiveWebcamOnWall) {
      liveWebcamStreamRef.current?.getTracks().forEach((t) => t.stop());
      liveWebcamStreamRef.current = null;
      setIsLiveWebcamOnWall(false);
      stateRef.current.hasDynamicVideoBg = Boolean(uploaded3DVideoUrl);
      setInspectedPartName('Estudio 3D Imperial · Pantalla IMAX & Fondo Dinámico');
      return;
    }
    await startWebcamOn3DWall(webcamFacingMode);
  };

  // Flip/Switch Camera (Front <-> Rear & Mirror) on the 3D LED Volume Wall
  const handleFlipWebcamOn3DWall = async () => {
    const nextMode = webcamFacingMode === 'user' ? 'environment' : 'user';
    setWebcamFacingMode(nextMode);
    const nextMirrored = !isWebcamMirrored;
    setIsWebcamMirrored(nextMirrored);
    stateRef.current.isWebcamMirrored = nextMirrored;
    if (isLiveWebcamOnWall) {
      await startWebcamOn3DWall(nextMode);
    }
  };

  // Connect HTMLAudioElement to Web Audio API AnalyserNode for real-time 3D particle beat reactivity
  const ensureAudioAnalyser = (audioEl: HTMLAudioElement) => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
      }
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }
      if (!analyserRef.current) {
        const analyser = audioCtxRef.current.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.78;
        analyserRef.current = analyser;
        freqDataRef.current = new Uint8Array(analyser.frequencyBinCount);
      }
      if (!mediaSourceRef.current && analyserRef.current) {
        const src = audioCtxRef.current.createMediaElementSource(audioEl);
        src.connect(analyserRef.current);
        analyserRef.current.connect(audioCtxRef.current.destination);
        mediaSourceRef.current = src;
      }
    } catch {
      // Fallback to procedural harmonic rhythm if MediaElementSource already bound
    }
  };

  const playMusicUrlIn3DStudio = async (url: string, titleLabel?: string) => {
    setMusicAudioUrl(url);
    if (titleLabel) setMusicTrackTitle(titleLabel);
    setParticlesEnabled(true);
    stateRef.current.particlesEnabled = true;

    requestAnimationFrame(async () => {
      const audioEl = musicAudioElRef.current;
      if (!audioEl) return;
      try {
        audioEl.src = url;
        audioEl.loop = true;
        ensureAudioAnalyser(audioEl);
        await audioEl.play();
        setIsMusicPlaying(true);
        stateRef.current.isMusicPlaying = true;
        setInspectedPartName(`Partículas 3D Sincronizadas al Ritmo · ${titleLabel || musicTrackTitle}`);
      } catch {
        setIsMusicPlaying(true);
        stateRef.current.isMusicPlaying = true;
      }
    });
  };

  // Generate AI Music via /api/ai/music and synchronize 3D particles to its rhythm
  const handleGenerateAndPlayRhythmMusic = async () => {
    if (isGeneratingMusic) return;
    setIsGeneratingMusic(true);
    setParticlesEnabled(true);
    stateRef.current.particlesEnabled = true;
    try {
      const promptSeed =
        activeProject?.prompt ||
        activeProject?.title ||
        scenarioTextInput ||
        `Electronic synthwave neon cinema beat for ${subjectPreset} 3D showcase`;
      const res = await fetch('/api/ai/music', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `${promptSeed} — energetic rhythmic electronic bassline and crystal synth arpeggios`,
          modelType: 'clip',
        }),
      });
      const data = await res.json();
      if (data.audioDataUrl) {
        const newTitle = `Ritmo IA · ${(activeProject?.title || subjectPreset.toUpperCase()).slice(0, 28)}`;
        const trackObj: GeneratedMusicTrack = {
          title: newTitle,
          audioUrl: data.audioDataUrl,
          lyrics: data.lyrics,
        };
        if (onMusicTrackGenerated) {
          onMusicTrackGenerated(trackObj);
        }
        await playMusicUrlIn3DStudio(data.audioDataUrl, newTitle);
      }
    } catch {
      setIsMusicPlaying(true);
      stateRef.current.isMusicPlaying = true;
    } finally {
      setIsGeneratingMusic(false);
    }
  };

  const handleToggleMusicPlayback = async () => {
    const audioEl = musicAudioElRef.current;
    if (isMusicPlaying) {
      audioEl?.pause();
      setIsMusicPlaying(false);
      stateRef.current.isMusicPlaying = false;
      return;
    }
    if (musicAudioUrl && audioEl) {
      try {
        if (audioEl.src !== musicAudioUrl) {
          audioEl.src = musicAudioUrl;
        }
        ensureAudioAnalyser(audioEl);
        await audioEl.play();
        setIsMusicPlaying(true);
        stateRef.current.isMusicPlaying = true;
        setParticlesEnabled(true);
        return;
      } catch {
        // If playback blocked or no URL, generate fresh AI rhythm music
      }
    }
    await handleGenerateAndPlayRhythmMusic();
  };

  const handleUploadMusicForParticles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const objUrl = URL.createObjectURL(file);
    playMusicUrlIn3DStudio(objUrl, file.name);
    e.target.value = '';
  };

  useEffect(() => {
    return () => {
      liveWebcamStreamRef.current?.getTracks().forEach((t) => t.stop());
      if (threeVideoTexRef.current) {
        threeVideoTexRef.current.dispose();
      }
      if (musicAudioElRef.current) {
        musicAudioElRef.current.pause();
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  // Keyboard shortcut 'H' to collapse/expand bottom control dock
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key.toLowerCase() === 'h') {
        setIsDockCollapsed((prev) => !prev);
      } else if (e.key === ' ') {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const triggerCameraPreset = (preset: CameraPresetId) => {
    setCameraPreset(preset);
    stateRef.current.cameraPreset = preset;
    stateRef.current.hasPendingCameraTransition = true;
  };

  const handleSelectSubject = (subId: SubjectPresetId) => {
    setSubjectPreset(subId);
    if (localScenes.length > 0) {
      setLocalScenes((prev) =>
        prev.map((sc, idx) => (idx === activeSceneIndex ? { ...sc, scene3dPreset: subId } : sc))
      );
    }
  };

  const applyVideoFileAs3DBackground = (file: File) => {
    if (isLiveWebcamOnWall) {
      liveWebcamStreamRef.current?.getTracks().forEach((t) => t.stop());
      setIsLiveWebcamOnWall(false);
    }
    const objUrl = URL.createObjectURL(file);
    setUploaded3DVideoUrl(objUrl);
    setUploaded3DVideoName(file.name);
    setIsPlaying(true);
    setInspectedPartName(`Fondo de Video Dinámico 3D Activo · ${file.name}`);
    if (onSaveProjectScenes) {
      onSaveProjectScenes(localScenes, objUrl);
    }
  };

  const handleUploadVideoTo3D = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    applyVideoFileAs3DBackground(file);
    e.target.value = '';
  };

  const handleDropVideoOn3DStage = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingVideoOver3D(false);
    const file = e.dataTransfer.files?.[0];
    if (file && (file.type.startsWith('video/') || /\.(mp4|webm|mov|mkv|ogg)$/i.test(file.name))) {
      applyVideoFileAs3DBackground(file);
    }
  };

  const handleClearVideoBackground = () => {
    if (isLiveWebcamOnWall) {
      liveWebcamStreamRef.current?.getTracks().forEach((t) => t.stop());
      setIsLiveWebcamOnWall(false);
    }
    setUploaded3DVideoUrl(null);
    setUploaded3DVideoName('');
    stateRef.current.hasDynamicVideoBg = false;
    setInspectedPartName('Estudio 3D Imperial · Fondo Original Restaurado');
  };

  const handleSave3DConfig = () => {
    if (onSaveProjectScenes) {
      onSaveProjectScenes(localScenes, uploaded3DVideoUrl || undefined);
    }
    setSaveFeedback(true);
    setTimeout(() => setSaveFeedback(false), 2200);
  };

  const handleCreateScenarioText = () => {
    const presetLabels: Record<SubjectPresetId, string> = {
      coupe: 'AUTO CYBER COUPE 3D · EDICIÓN ORO IMPERIAL EN ESTUDIO',
      station: 'ESTACIÓN ORBITAL 3D · ANILLO CENTRÍFUGO EN GRAVEDAD CERO',
      drone: 'DRON DE CINE 8K · TOMA AÉREA ESTABILIZADA EN ESTUDIO',
      sculpture: 'ESCULTURA GIROSCÓPICA 3D · ARMONÍA CINÉTICA Y LUZ DORADA',
      protein: 'HÉLICE ALPHAFOLD 3D · ESTRUCTURA MOLECULAR DE ALTA CONFIANZA',
    };
    const finalTxt =
      scenarioTextInput.trim() && scenarioTextInput.trim() !== stateRef.current.currentSceneText
        ? scenarioTextInput.trim()
        : presetLabels[subjectPreset];

    setScenarioTextInput(finalTxt);
    stateRef.current.currentSceneText = finalTxt;

    const nextScenes: SceneItem[] =
      localScenes.length > 0
        ? localScenes.map((sc, idx) =>
            idx === activeSceneIndex
              ? { ...sc, overlayText: finalTxt, description: finalTxt, scene3dPreset: subjectPreset }
              : sc
          )
        : [
            {
              description: finalTxt,
              overlayText: finalTxt,
              duration: '4s',
              scene3dPreset: subjectPreset,
            },
          ];

    setLocalScenes(nextScenes);
    if (onSaveProjectScenes) {
      onSaveProjectScenes(nextScenes, uploaded3DVideoUrl || undefined);
    }
    setTextFeedback(true);
    setTimeout(() => setTextFeedback(false), 2200);
  };

  const handleTake3DSnapshot = () => {
    const snapDataUrl = capture3DFrameRef.current?.();
    if (!snapDataUrl) return;
    const textForSnap =
      scenarioTextInput.trim() ||
      `Captura 3D de ${subjectPreset.toUpperCase()} (${CAMERA_PRESETS[cameraPreset].label} · ${LIGHTING_PRESETS[lightingPreset].label})`;
    const newSceneItem: SceneItem = {
      description: textForSnap,
      overlayText: textForSnap,
      duration: '4s',
      scene3dPreset: subjectPreset,
      imageUrl: snapDataUrl,
    };
    const nextScenes = [...localScenes, newSceneItem];
    setLocalScenes(nextScenes);
    setActiveSceneIndex(nextScenes.length - 1);
    if (onCapture3DSnapshot) {
      onCapture3DSnapshot(snapDataUrl, subjectPreset);
    }
    if (onSaveProjectScenes) {
      onSaveProjectScenes(nextScenes, uploaded3DVideoUrl || undefined);
    }
    setSnapshotFeedback(true);
    setTimeout(() => setSnapshotFeedback(false), 2200);
  };

  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      const probeCanvas = document.createElement('canvas');
      const gl = probeCanvas.getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0f19);
    scene.fog = new THREE.FogExp2(0x0b0f19, 0.022);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTexture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 120);
    camera.position.set(...CAMERA_PRESETS.director.pos);

    capture3DFrameRef.current = () => {
      try {
        renderer.render(scene, camera);
        return renderer.domElement.toDataURL('image/jpeg', 0.85);
      } catch {
        return null;
      }
    };

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...CAMERA_PRESETS.director.target);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI / 2 - 0.03;
    controls.minDistance = 1.8;
    controls.maxDistance = 22;

    const onControlStart = () => {
      stateRef.current.hasPendingCameraTransition = false;
    };
    controls.addEventListener('start', onControlStart);

    const hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x1e293b, 0.85);
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xffe4b5, 3.2);
    keyLight.position.set(7, 11, 6);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    const d = 9;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 28;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x60a5fa, 1.25);
    fillLight.position.set(-7, 5, 4);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xf59e0b, 2.6);
    rimLight.position.set(0, 6, -8);
    scene.add(rimLight);

    if (!isSoftwareGl) {
      RectAreaLightUniformsLib.init();
      const rectLightLeft = new THREE.RectAreaLight(0xfff7ed, 4.0, 2.4, 3.2);
      rectLightLeft.position.set(-4.6, 3.2, 2.2);
      rectLightLeft.lookAt(0, 1.0, 0);
      scene.add(rectLightLeft);

      const rectLightRight = new THREE.RectAreaLight(0xe0f2fe, 3.5, 2.4, 3.2);
      rectLightRight.position.set(4.6, 3.2, 2.2);
      rectLightRight.lookAt(0, 1.0, 0);
      scene.add(rectLightRight);
    }

    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    const floorTex = createStageFloorTexture(maxAnisotropy);
    const contactShadowTex = createContactShadowTexture();

    const heroPrimaryMat = new THREE.MeshPhysicalMaterial({
      color: FINISH_PRESETS.obsidian.color,
      metalness: FINISH_PRESETS.obsidian.metalness,
      roughness: FINISH_PRESETS.obsidian.roughness,
      clearcoat: FINISH_PRESETS.obsidian.clearcoat,
      clearcoatRoughness: 0.12,
    });

    const brushedMetalMat = new THREE.MeshPhysicalMaterial({
      color: 0xd1d5db,
      metalness: 0.94,
      roughness: 0.18,
      anisotropy: 0.75,
    });

    const darkMatteMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      metalness: 0.25,
      roughness: 0.65,
    });

    const copperAccentMat = new THREE.MeshPhysicalMaterial({
      color: 0xf59e0b,
      metalness: 0.9,
      roughness: 0.22,
      clearcoat: 0.6,
    });

    const opticalGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0xe0f2fe,
      metalness: 0.0,
      roughness: 0.05,
      transmission: isSoftwareGl ? 0 : 0.92,
      transparent: true,
      opacity: isSoftwareGl ? 0.42 : 1.0,
      ior: 1.65,
      thickness: 0.8,
      clearcoat: 1.0,
      depthWrite: false,
    });

    const emissiveCyanMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 2.2,
      roughness: 0.2,
    });

    const plddtVeryHighMat = new THREE.MeshPhysicalMaterial({
      color: 0x0053d6,
      metalness: 0.25,
      roughness: 0.22,
      clearcoat: 0.85,
    });
    const plddtConfidentMat = new THREE.MeshPhysicalMaterial({
      color: 0x65cbf3,
      metalness: 0.2,
      roughness: 0.28,
      clearcoat: 0.75,
    });
    const plddtLowMat = new THREE.MeshPhysicalMaterial({
      color: 0xffdb13,
      metalness: 0.15,
      roughness: 0.35,
      clearcoat: 0.6,
    });
    const plddtVeryLowMat = new THREE.MeshPhysicalMaterial({
      color: 0xff7d45,
      metalness: 0.1,
      roughness: 0.45,
      clearcoat: 0.4,
    });

    const floorGeo = new THREE.PlaneGeometry(60, 60);
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: 0.55,
      metalness: 0.2,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    const shadowPlaneGeo = new THREE.PlaneGeometry(7.2, 7.2);
    const shadowPlaneMat = new THREE.MeshBasicMaterial({
      map: contactShadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.55,
    });
    const stageShadowMesh = new THREE.Mesh(shadowPlaneGeo, shadowPlaneMat);
    stageShadowMesh.rotation.x = -Math.PI / 2;
    stageShadowMesh.position.y = 0.02;
    scene.add(stageShadowMesh);

    // Panoramic 360° Dynamic Video Studio Sky-Dome (renders uploaded video as surrounding 3D environment)
    const videoSkyDomeGeo = new THREE.SphereGeometry(38, 48, 32);
    const videoSkyDomeMat = new THREE.MeshBasicMaterial({
      side: THREE.BackSide,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    const videoSkyDomeMesh = new THREE.Mesh(videoSkyDomeGeo, videoSkyDomeMat);
    videoSkyDomeMesh.position.set(0, 2.0, 0);
    videoSkyDomeMesh.visible = false;
    videoSkyDomeMesh.userData.partName = 'Domo Panorámico 360° · Fondo de Video Dinámico 3D';
    scene.add(videoSkyDomeMesh);

    // Curved 3D Cinema IMAX LED Volume Wall
    const ledCanvas = document.createElement('canvas');
    ledCanvas.width = 1024;
    ledCanvas.height = 512;
    const ledCtx = ledCanvas.getContext('2d')!;
    const ledCanvasTex = new THREE.CanvasTexture(ledCanvas);
    ledCanvasTex.colorSpace = THREE.SRGBColorSpace;

    const ledWallGroup = new THREE.Group();
    ledWallGroup.position.set(0, 2.75, -5.2);
    scene.add(ledWallGroup);

    const ledWallGeo = new THREE.CylinderGeometry(8.5, 8.5, 4.4, 48, 1, true, -Math.PI * 0.32, Math.PI * 0.64);
    ledWallGeo.scale(-1, 1, 1);
    const ledWallMat = new THREE.MeshBasicMaterial({
      map: ledCanvasTex,
      side: THREE.DoubleSide,
    });
    const ledWallMesh = new THREE.Mesh(ledWallGeo, ledWallMat);
    ledWallMesh.position.set(0, 0, 7.2);
    ledWallMesh.userData.partName = 'Pantalla Curva IMAX 3D (Fondo de Video Dinámico y Escenas)';
    ledWallGroup.add(ledWallMesh);

    const ledFrameTop = new THREE.Mesh(
      new THREE.TorusGeometry(8.52, 0.06, 12, 48, Math.PI * 0.64),
      copperAccentMat
    );
    ledFrameTop.rotation.x = Math.PI / 2;
    ledFrameTop.rotation.z = Math.PI * 0.18;
    ledFrameTop.position.set(0, 2.22, 7.2);
    ledWallGroup.add(ledFrameTop);

    const turntableGroup = new THREE.Group();
    const lathePoints = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(2.8, 0),
      new THREE.Vector2(2.65, 0.14),
      new THREE.Vector2(2.35, 0.18),
      new THREE.Vector2(2.25, 0.32),
      new THREE.Vector2(0, 0.32),
    ];
    const pedestalGeo = new THREE.LatheGeometry(lathePoints, 64);
    const pedestalMesh = new THREE.Mesh(pedestalGeo, darkMatteMat);
    pedestalMesh.receiveShadow = true;
    pedestalMesh.castShadow = true;
    pedestalMesh.userData.partName = 'Motorized Turntable Plinth';
    turntableGroup.add(pedestalMesh);

    const trimRingGeo = new THREE.TorusGeometry(2.32, 0.025, 16, 64);
    const trimRingMesh = new THREE.Mesh(trimRingGeo, emissiveCyanMat);
    trimRingMesh.rotation.x = Math.PI / 2;
    trimRingMesh.position.y = 0.28;
    turntableGroup.add(trimRingMesh);
    scene.add(turntableGroup);

    const subjectsRoot = new THREE.Group();
    subjectsRoot.position.y = 0.32;
    turntableGroup.add(subjectsRoot);

    const explodableParts: { mesh: THREE.Object3D; basePos: THREE.Vector3; explodeOffset: THREE.Vector3 }[] = [];
    const registerExplodable = (mesh: THREE.Object3D, offset: [number, number, number]) => {
      explodableParts.push({
        mesh,
        basePos: mesh.position.clone(),
        explodeOffset: new THREE.Vector3(...offset),
      });
    };

    // Subject A: Cyber-Coupe Concept Vehicle
    const coupeGroup = new THREE.Group();
    const chassisShape = new THREE.Shape();
    chassisShape.moveTo(-1.6, 0.18);
    chassisShape.lineTo(1.65, 0.18);
    chassisShape.lineTo(1.75, 0.42);
    chassisShape.lineTo(0.85, 0.62);
    chassisShape.lineTo(-0.95, 0.65);
    chassisShape.lineTo(-1.68, 0.48);
    chassisShape.closePath();

    const chassisGeo = new THREE.ExtrudeGeometry(chassisShape, {
      depth: 1.36,
      bevelEnabled: true,
      bevelSegments: 4,
      steps: 1,
      bevelSize: 0.08,
      bevelThickness: 0.08,
    });
    chassisGeo.center();
    const chassisMesh = new THREE.Mesh(chassisGeo, heroPrimaryMat);
    chassisMesh.position.set(0, 0.46, 0);
    chassisMesh.castShadow = true;
    chassisMesh.receiveShadow = true;
    chassisMesh.userData.partName = 'Aerodynamic Monocoque Chassis';
    coupeGroup.add(chassisMesh);
    registerExplodable(chassisMesh, [0, 0.35, 0]);

    const canopyShape = new THREE.Shape();
    canopyShape.moveTo(-0.85, 0);
    canopyShape.quadraticCurveTo(0.05, 0.52, 0.85, 0);
    canopyShape.closePath();
    const canopyGeo = new THREE.ExtrudeGeometry(canopyShape, {
      depth: 1.02,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.05,
      bevelThickness: 0.05,
    });
    canopyGeo.center();
    const canopyMesh = new THREE.Mesh(canopyGeo, opticalGlassMat);
    canopyMesh.position.set(-0.08, 0.82, 0);
    canopyMesh.renderOrder = 2;
    canopyMesh.userData.partName = 'Sapphire Panoramic Canopy';
    coupeGroup.add(canopyMesh);
    registerExplodable(canopyMesh, [0, 0.95, 0]);

    const wheelPositions: [number, number, number][] = [
      [-1.05, 0.32, 0.76],
      [1.05, 0.32, 0.76],
      [-1.05, 0.32, -0.76],
      [1.05, 0.32, -0.76],
    ];
    const tireGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.24, 32);
    tireGeo.rotateX(Math.PI / 2);
    const rimGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.26, 24);
    rimGeo.rotateX(Math.PI / 2);
    const spokeGeo = new THREE.BoxGeometry(0.34, 0.045, 0.27);
    const caliperGeo = new THREE.BoxGeometry(0.12, 0.16, 0.26);

    const coupeWheels: THREE.Group[] = [];

    wheelPositions.forEach(([wx, wy, wz], idx) => {
      const wheelUnit = new THREE.Group();
      wheelUnit.position.set(wx, wy, wz);
      const tire = new THREE.Mesh(tireGeo, darkMatteMat);
      tire.castShadow = true;
      const rim = new THREE.Mesh(rimGeo, brushedMetalMat);
      const spokeA = new THREE.Mesh(spokeGeo, copperAccentMat);
      const spokeB = new THREE.Mesh(spokeGeo, copperAccentMat);
      spokeB.rotation.z = Math.PI / 2;
      const caliper = new THREE.Mesh(caliperGeo, emissiveCyanMat);
      caliper.position.set(-0.1, 0.06, 0);
      wheelUnit.add(tire, rim, spokeA, spokeB, caliper);
      wheelUnit.userData.partName = `Forged Turbine Wheel #${idx + 1}`;
      coupeGroup.add(wheelUnit);
      coupeWheels.push(wheelUnit);
      registerExplodable(wheelUnit, [wx * 0.35, 0, Math.sign(wz) * 0.55]);
    });

    const lightBarGeo = new THREE.BoxGeometry(0.08, 0.06, 1.28);
    const frontLightBar = new THREE.Mesh(lightBarGeo, emissiveCyanMat);
    frontLightBar.position.set(1.72, 0.42, 0);
    frontLightBar.userData.partName = 'Laser Matrix Headlight Bar';
    coupeGroup.add(frontLightBar);
    registerExplodable(frontLightBar, [0.55, 0.1, 0]);

    const rearTaillightMat = new THREE.MeshStandardMaterial({
      color: 0xf43f5e,
      emissive: 0xe11d48,
      emissiveIntensity: 2.5,
      roughness: 0.2,
    });
    const rearLightBar = new THREE.Mesh(lightBarGeo, rearTaillightMat);
    rearLightBar.position.set(-1.69, 0.48, 0);
    rearLightBar.userData.partName = 'Crimson Plasma Taillight Strip';
    coupeGroup.add(rearLightBar);
    registerExplodable(rearLightBar, [-0.55, 0.1, 0]);

    const sideSkirtGeo = new THREE.BoxGeometry(2.15, 0.05, 1.52);
    const sideSkirtMesh = new THREE.Mesh(sideSkirtGeo, darkMatteMat);
    sideSkirtMesh.position.set(0, 0.2, 0);
    sideSkirtMesh.userData.partName = 'Ground-Effect Carbon Splitter & Side Skirts';
    coupeGroup.add(sideSkirtMesh);
    registerExplodable(sideSkirtMesh, [0, -0.22, 0]);

    const spoilerGeo = new THREE.BoxGeometry(0.28, 0.04, 1.44);
    const spoilerMesh = new THREE.Mesh(spoilerGeo, copperAccentMat);
    spoilerMesh.position.set(-1.55, 0.78, 0);
    spoilerMesh.userData.partName = 'Active Carbon Rear Diffuser Wing';
    coupeGroup.add(spoilerMesh);
    registerExplodable(spoilerMesh, [-0.5, 0.5, 0]);

    subjectsRoot.add(coupeGroup);

    // Subject B: Architectural Kinetic Gyro Sculpture
    const sculptureGroup = new THREE.Group();
    sculptureGroup.visible = false;

    const basePedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 0.28, 32), darkMatteMat);
    basePedestal.position.y = 0.14;
    basePedestal.castShadow = true;
    sculptureGroup.add(basePedestal);

    const outerGyroRing = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.07, 24, 64), heroPrimaryMat);
    outerGyroRing.position.y = 1.35;
    outerGyroRing.castShadow = true;
    outerGyroRing.userData.partName = 'Outer Gimbal Ring';
    sculptureGroup.add(outerGyroRing);
    registerExplodable(outerGyroRing, [0, 0.6, 0]);

    const midGyroRing = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.06, 24, 64), copperAccentMat);
    midGyroRing.position.y = 1.35;
    midGyroRing.rotation.y = Math.PI / 3;
    midGyroRing.castShadow = true;
    midGyroRing.userData.partName = 'Harmonic Brass Meridian Ring';
    sculptureGroup.add(midGyroRing);
    registerExplodable(midGyroRing, [0.5, 0.3, 0]);

    const innerGyroRing = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.05, 20, 48), brushedMetalMat);
    innerGyroRing.position.y = 1.35;
    innerGyroRing.rotation.x = Math.PI / 4;
    innerGyroRing.castShadow = true;
    innerGyroRing.userData.partName = 'Inner Titanium Balance Ring';
    sculptureGroup.add(innerGyroRing);
    registerExplodable(innerGyroRing, [-0.5, 0.3, 0]);

    const coreCrystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 2), opticalGlassMat);
    coreCrystal.position.y = 1.35;
    coreCrystal.renderOrder = 2;
    coreCrystal.userData.partName = 'Refractive Optical Core';
    sculptureGroup.add(coreCrystal);
    registerExplodable(coreCrystal, [0, 1.05, 0]);

    subjectsRoot.add(sculptureGroup);

    // Subject C: Quad-Rotor Cinema Drone
    const droneGroup = new THREE.Group();
    droneGroup.visible = false;

    const droneHull = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.75, 8, 24), heroPrimaryMat);
    droneHull.rotation.z = Math.PI / 2;
    droneHull.position.y = 1.15;
    droneHull.castShadow = true;
    droneHull.userData.partName = 'Carbon Avionics Fuselage';
    droneGroup.add(droneHull);
    registerExplodable(droneHull, [0, 0.35, 0]);

    const gimbalPod = new THREE.Mesh(new THREE.SphereGeometry(0.24, 24, 24), opticalGlassMat);
    gimbalPod.position.set(0.48, 0.92, 0);
    gimbalPod.renderOrder = 2;
    gimbalPod.userData.partName = 'Stabilized 8K Optical Gimbal';
    droneGroup.add(gimbalPod);
    registerExplodable(gimbalPod, [0.45, -0.3, 0]);

    const armOffsets: [number, number][] = [
      [0.75, 0.75],
      [0.75, -0.75],
      [-0.75, 0.75],
      [-0.75, -0.75],
    ];
    armOffsets.forEach(([ax, az], idx) => {
      const armUnit = new THREE.Group();
      armUnit.position.set(ax, 1.2, az);
      const motorPod = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.22, 20), copperAccentMat);
      const rotorRing = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.025, 12, 36), brushedMetalMat);
      rotorRing.rotation.x = Math.PI / 2;
      rotorRing.position.y = 0.08;
      armUnit.add(motorPod, rotorRing);
      armUnit.userData.partName = `Brushless Thruster Assembly #${idx + 1}`;
      droneGroup.add(armUnit);
      registerExplodable(armUnit, [ax * 0.5, 0.4, az * 0.5]);
    });

    subjectsRoot.add(droneGroup);

    // Subject D: Orbital Space Station Ring Habitat
    const stationGroup = new THREE.Group();
    stationGroup.visible = false;

    const stationCoreSpindle = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.9, 28), brushedMetalMat);
    stationCoreSpindle.position.y = 1.35;
    stationCoreSpindle.castShadow = true;
    stationCoreSpindle.userData.partName = 'Zero-G Docking Hub & Axial Spine';
    stationGroup.add(stationCoreSpindle);
    registerExplodable(stationCoreSpindle, [0, 0.35, 0]);

    const centrifugeHabitat = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.14, 24, 64), heroPrimaryMat);
    centrifugeHabitat.position.y = 1.35;
    centrifugeHabitat.rotation.x = Math.PI / 2.4;
    centrifugeHabitat.castShadow = true;
    centrifugeHabitat.userData.partName = 'Rotating Centrifuge Habitat Torus';
    stationGroup.add(centrifugeHabitat);
    registerExplodable(centrifugeHabitat, [0, 0.7, 0]);

    const innerShieldRing = new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.04, 16, 48), emissiveCyanMat);
    innerShieldRing.position.y = 1.35;
    innerShieldRing.rotation.x = Math.PI / 2.4;
    innerShieldRing.userData.partName = 'Magnetic Radiation Shield Array';
    stationGroup.add(innerShieldRing);
    registerExplodable(innerShieldRing, [0, -0.35, 0]);

    const solarWingGeo = new THREE.BoxGeometry(1.5, 0.03, 0.48);
    const leftSolarWing = new THREE.Mesh(solarWingGeo, copperAccentMat);
    leftSolarWing.position.set(-1.15, 1.55, 0);
    leftSolarWing.castShadow = true;
    leftSolarWing.userData.partName = 'Port Photovoltaic Solar Wing';
    stationGroup.add(leftSolarWing);
    registerExplodable(leftSolarWing, [-0.75, 0.35, 0]);

    const rightSolarWing = new THREE.Mesh(solarWingGeo, copperAccentMat);
    rightSolarWing.position.set(1.15, 1.55, 0);
    rightSolarWing.castShadow = true;
    rightSolarWing.userData.partName = 'Starboard Photovoltaic Solar Wing';
    stationGroup.add(rightSolarWing);
    registerExplodable(rightSolarWing, [0.75, 0.35, 0]);

    const cupolaDome = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 24), opticalGlassMat);
    cupolaDome.position.set(0, 2.38, 0);
    cupolaDome.renderOrder = 2;
    cupolaDome.userData.partName = 'Deep-Space Observation Cupola';
    stationGroup.add(cupolaDome);
    registerExplodable(cupolaDome, [0, 0.95, 0]);

    subjectsRoot.add(stationGroup);

    // Subject E: AlphaFold 3D Protein Helix & Molecular Folding Complex
    const proteinGroup = new THREE.Group();
    proteinGroup.visible = false;

    const helixPointsA: THREE.Vector3[] = [];
    for (let i = 0; i <= 40; i++) {
      const t = (i / 40) * Math.PI * 4;
      helixPointsA.push(new THREE.Vector3(Math.cos(t) * 0.55 - 0.35, 0.45 + (i / 40) * 1.65, Math.sin(t) * 0.55));
    }
    const helixCurveA = new THREE.CatmullRomCurve3(helixPointsA);
    const helixGeoA = new THREE.TubeGeometry(helixCurveA, 96, 0.085, 16, false);
    const helixMeshA = new THREE.Mesh(helixGeoA, plddtVeryHighMat);
    helixMeshA.castShadow = true;
    helixMeshA.userData.partName = 'Alpha-Helix Core Domain (pLDDT > 90 · Very High Confidence)';
    proteinGroup.add(helixMeshA);
    registerExplodable(helixMeshA, [-0.55, 0.3, 0]);

    const helixPointsB: THREE.Vector3[] = [];
    for (let i = 0; i <= 36; i++) {
      const t = (i / 36) * Math.PI * 3.5;
      helixPointsB.push(new THREE.Vector3(Math.sin(t) * 0.52 + 0.42, 0.52 + (i / 36) * 1.55, Math.cos(t) * 0.52));
    }
    const helixCurveB = new THREE.CatmullRomCurve3(helixPointsB);
    const helixGeoB = new THREE.TubeGeometry(helixCurveB, 84, 0.075, 16, false);
    const helixMeshB = new THREE.Mesh(helixGeoB, plddtConfidentMat);
    helixMeshB.castShadow = true;
    helixMeshB.userData.partName = 'Secondary Beta-Turn Fold (pLDDT 70–90 · Confident)';
    proteinGroup.add(helixMeshB);
    registerExplodable(helixMeshB, [0.55, 0.3, 0]);

    const linkerLoopMesh = new THREE.Mesh(new THREE.TorusKnotGeometry(0.42, 0.055, 64, 16, 2, 3), plddtLowMat);
    linkerLoopMesh.position.set(0, 1.35, 0);
    linkerLoopMesh.castShadow = true;
    linkerLoopMesh.userData.partName = 'Flexible Inter-Domain Linker (pLDDT 50–70 · Low Confidence)';
    proteinGroup.add(linkerLoopMesh);
    registerExplodable(linkerLoopMesh, [0, 0.65, 0.45]);

    const disorderedPoints: THREE.Vector3[] = [
      new THREE.Vector3(-0.9, 1.85, 0.3),
      new THREE.Vector3(-1.25, 2.15, -0.2),
      new THREE.Vector3(-0.75, 2.38, -0.55),
      new THREE.Vector3(-0.2, 2.25, 0.4),
      new THREE.Vector3(0.55, 2.42, 0.15),
    ];
    const disorderedCurve = new THREE.CatmullRomCurve3(disorderedPoints);
    const disorderedMesh = new THREE.Mesh(new THREE.TubeGeometry(disorderedCurve, 48, 0.05, 12, false), plddtVeryLowMat);
    disorderedMesh.userData.partName = 'Disordered Terminal Loop (pLDDT < 50 · Intrinsically Disordered)';
    proteinGroup.add(disorderedMesh);
    registerExplodable(disorderedMesh, [0, 0.95, -0.4]);

    const activeSiteLigand = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 2), opticalGlassMat);
    activeSiteLigand.position.set(0, 1.35, 0);
    activeSiteLigand.renderOrder = 2;
    activeSiteLigand.userData.partName = 'Catalytic Active-Site Binding Pocket & Cofactor';
    proteinGroup.add(activeSiteLigand);
    registerExplodable(activeSiteLigand, [0, 0.85, 0]);

    subjectsRoot.add(proteinGroup);

    // 7. Hero Cinema Camera Rig & Dolly on Foreground Track
    const cameraRigGroup = new THREE.Group();
    cameraRigGroup.position.set(0, 0, 4.2);
    scene.add(cameraRigGroup);

    const rigShadowMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), shadowPlaneMat);
    rigShadowMesh.rotation.x = -Math.PI / 2;
    rigShadowMesh.position.y = 0.02;
    cameraRigGroup.add(rigShadowMesh);

    const tripodBase = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.58, 0.14, 6), darkMatteMat);
    tripodBase.position.y = 0.07;
    tripodBase.castShadow = true;
    tripodBase.userData.partName = 'Heavy Dolly Spider Base';
    cameraRigGroup.add(tripodBase);

    const riserCol = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 1.25, 24), brushedMetalMat);
    riserCol.position.y = 0.72;
    riserCol.castShadow = true;
    riserCol.userData.partName = 'Hydraulic Elevation Column';
    cameraRigGroup.add(riserCol);

    const cameraHeadGroup = new THREE.Group();
    cameraHeadGroup.position.y = 1.45;
    cameraRigGroup.add(cameraHeadGroup);

    const camBodyShape = new THREE.Shape();
    camBodyShape.moveTo(-0.22, -0.18);
    camBodyShape.lineTo(0.22, -0.18);
    camBodyShape.lineTo(0.22, 0.18);
    camBodyShape.lineTo(-0.22, 0.18);
    camBodyShape.closePath();
    const camBodyGeo = new THREE.ExtrudeGeometry(camBodyShape, {
      depth: 0.48,
      bevelEnabled: true,
      bevelSize: 0.03,
      bevelThickness: 0.03,
      bevelSegments: 3,
    });
    camBodyGeo.center();
    const camBodyMesh = new THREE.Mesh(camBodyGeo, darkMatteMat);
    camBodyMesh.castShadow = true;
    camBodyMesh.userData.partName = 'Reelify 65mm Digital Cinema Body';
    cameraHeadGroup.add(camBodyMesh);
    registerExplodable(camBodyMesh, [0, 0.25, 0]);

    const reelGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.09, 28);
    reelGeo.rotateZ(Math.PI / 2);
    const frontReel = new THREE.Mesh(reelGeo, copperAccentMat);
    frontReel.position.set(0, 0.34, -0.1);
    frontReel.castShadow = true;
    frontReel.userData.partName = 'Forward Coaxial Magazine Reel';
    cameraHeadGroup.add(frontReel);
    registerExplodable(frontReel, [0, 0.65, -0.15]);

    const rearReel = new THREE.Mesh(reelGeo, brushedMetalMat);
    rearReel.position.set(0, 0.34, 0.24);
    rearReel.castShadow = true;
    rearReel.userData.partName = 'Take-Up Magazine Reel';
    cameraHeadGroup.add(rearReel);
    registerExplodable(rearReel, [0, 0.65, 0.28]);

    const lensPoints = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(0.14, 0),
      new THREE.Vector2(0.14, 0.22),
      new THREE.Vector2(0.17, 0.26),
      new THREE.Vector2(0.17, 0.44),
      new THREE.Vector2(0.12, 0.44),
    ];
    const lensBarrelGeo = new THREE.LatheGeometry(lensPoints, 32);
    lensBarrelGeo.rotateX(-Math.PI / 2);
    const lensBarrelMesh = new THREE.Mesh(lensBarrelGeo, brushedMetalMat);
    lensBarrelMesh.position.set(0, 0, -0.26);
    lensBarrelMesh.castShadow = true;
    lensBarrelMesh.userData.partName = 'Anamorphic Prime 50mm T1.4 Lens';
    cameraHeadGroup.add(lensBarrelMesh);
    registerExplodable(lensBarrelMesh, [0, 0, -0.55]);

    const lensGlassMesh = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 16), opticalGlassMat);
    lensGlassMesh.scale.z = 0.35;
    lensGlassMesh.position.set(0, 0, -0.68);
    lensGlassMesh.renderOrder = 3;
    lensGlassMesh.userData.partName = 'Multi-Coated Fluorite Front Element';
    cameraHeadGroup.add(lensGlassMesh);
    registerExplodable(lensGlassMesh, [0, 0, -0.85]);

    const monitorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.16, 0.025), emissiveCyanMat);
    monitorMesh.position.set(-0.34, 0.08, 0.05);
    monitorMesh.rotation.y = 0.35;
    monitorMesh.userData.partName = 'Calibrated HDR Field Monitor';
    cameraHeadGroup.add(monitorMesh);
    registerExplodable(monitorMesh, [-0.45, 0.15, 0]);

    // 8. InstancedMesh: 36 Overhead Studio Truss Acoustic Panels & Spot Nodes
    const trussCount = 36;
    const trussNodeGeo = new THREE.CylinderGeometry(0.14, 0.22, 0.28, 16);
    const trussNodeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.35,
      metalness: 0.8,
    });
    const trussInstanced = new THREE.InstancedMesh(trussNodeGeo, trussNodeMat, trussCount);
    let idx = 0;
    for (let gx = -2.5; gx <= 2.5; gx += 1) {
      for (let gz = -2.5; gz <= 2.5; gz += 1) {
        if (idx >= trussCount) break;
        _dummyObj.position.set(gx * 2.4, 5.8 + ((idx % 3) - 1) * 0.08, gz * 2.4);
        _dummyObj.rotation.set(0, (idx * Math.PI) / 6, 0);
        const s = 0.88 + (idx % 4) * 0.07;
        _dummyObj.scale.set(s, s, s);
        _dummyObj.updateMatrix();
        trussInstanced.setMatrixAt(idx, _dummyObj.matrix);

        _scratchColor.setHSL(0.6 + (idx % 5) * 0.02, 0.35, 0.45 + (idx % 3) * 0.1);
        trussInstanced.setColorAt(idx, _scratchColor);
        idx++;
      }
    }
    trussInstanced.instanceMatrix.needsUpdate = true;
    if (trussInstanced.instanceColor) trussInstanced.instanceColor.needsUpdate = true;
    trussInstanced.computeBoundingSphere();
    scene.add(trussInstanced);

    // 8b. 3D Audio-Reactive Particle System (720 Orbital Neon Particles + 48-Bar 3D Circular Spectrum Ring)
    const particleSpriteTex = createNeonParticleSpriteTexture();
    const PARTICLE_COUNT = 720;
    const particleGeo = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(PARTICLE_COUNT * 3);
    const particleColors = new Float32Array(PARTICLE_COUNT * 3);
    const particleBaseRadii = new Float32Array(PARTICLE_COUNT);
    const particleBaseAngles = new Float32Array(PARTICLE_COUNT);
    const particleBaseHeights = new Float32Array(PARTICLE_COUNT);
    const particleSpeeds = new Float32Array(PARTICLE_COUNT);
    const particleBands = new Uint8Array(PARTICLE_COUNT); // 0 = Bass, 1 = Mid, 2 = Treble

    const neonPaletteHex = [0xff007f, 0x00e5ff, 0x7c3aed, 0xf59e0b];

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const band = i % 3; // 0: Bass, 1: Mid, 2: Treble
      particleBands[i] = band;
      const radius = 1.65 + (i / PARTICLE_COUNT) * 5.2 + (band === 0 ? -0.25 : band === 2 ? 0.45 : 0);
      const angle = (i * 2.39996) % (Math.PI * 2); // Golden angle spiral distribution
      const height = 0.25 + ((i * 17) % 100) / 100 * 3.8;

      particleBaseRadii[i] = radius;
      particleBaseAngles[i] = angle;
      particleBaseHeights[i] = height;
      particleSpeeds[i] = 0.35 + (band * 0.28) + ((i % 7) * 0.06);

      particlePositions[i * 3] = Math.cos(angle) * radius;
      particlePositions[i * 3 + 1] = height;
      particlePositions[i * 3 + 2] = Math.sin(angle) * radius;

      _scratchColor.setHex(neonPaletteHex[i % neonPaletteHex.length]);
      particleColors[i * 3] = _scratchColor.r;
      particleColors[i * 3 + 1] = _scratchColor.g;
      particleColors[i * 3 + 2] = _scratchColor.b;
    }

    const posAttr = new THREE.BufferAttribute(particlePositions, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    const colAttr = new THREE.BufferAttribute(particleColors, 3);
    colAttr.setUsage(THREE.DynamicDrawUsage);
    particleGeo.setAttribute('position', posAttr);
    particleGeo.setAttribute('color', colAttr);

    const particleMat = new THREE.PointsMaterial({
      size: 0.22,
      map: particleSpriteTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    const audioParticlePoints = new THREE.Points(particleGeo, particleMat);
    audioParticlePoints.frustumCulled = false;
    audioParticlePoints.userData.partName = 'Sistema de Partículas 3D Neón · Reactivo al Ritmo Musical';
    scene.add(audioParticlePoints);

    // 48-Pillar Circular 3D Equalizer Ring surrounding the Turntable Plinth
    const EQ_BAR_COUNT = 48;
    const eqBarGeo = new THREE.BoxGeometry(0.065, 1.0, 0.065);
    eqBarGeo.translate(0, 0.5, 0); // Pivot at bottom-center so bars grow upward from stage floor
    const eqBarMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xff007f,
      emissiveIntensity: 1.6,
      roughness: 0.2,
      metalness: 0.7,
    });
    const eqRingInstanced = new THREE.InstancedMesh(eqBarGeo, eqBarMat, EQ_BAR_COUNT);
    eqRingInstanced.frustumCulled = false;
    eqRingInstanced.userData.partName = 'Anillo Ecualizador 3D · 48 Barras de Espectro Musical';
    const eqRadius = 2.68;
    for (let i = 0; i < EQ_BAR_COUNT; i++) {
      const theta = (i / EQ_BAR_COUNT) * Math.PI * 2;
      _dummyObj.position.set(Math.cos(theta) * eqRadius, 0.16, Math.sin(theta) * eqRadius);
      _dummyObj.rotation.set(0, -theta, 0);
      _dummyObj.scale.set(1, 0.15, 1);
      _dummyObj.updateMatrix();
      eqRingInstanced.setMatrixAt(i, _dummyObj.matrix);
      _scratchColor.setHex(i % 2 === 0 ? 0x00e5ff : 0xff007f);
      eqRingInstanced.setColorAt(i, _scratchColor);
    }
    eqRingInstanced.instanceMatrix.needsUpdate = true;
    if (eqRingInstanced.instanceColor) eqRingInstanced.instanceColor.needsUpdate = true;
    turntableGroup.add(eqRingInstanced);

    // 9. Throttled Raycasting
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const inspectableMeshes: THREE.Object3D[] = [
      ledWallMesh,
      pedestalMesh,
      chassisMesh,
      canopyMesh,
      frontLightBar,
      spoilerMesh,
      outerGyroRing,
      midGyroRing,
      innerGyroRing,
      coreCrystal,
      droneHull,
      gimbalPod,
      stationCoreSpindle,
      centrifugeHabitat,
      innerShieldRing,
      leftSolarWing,
      rightSolarWing,
      cupolaDome,
      helixMeshA,
      helixMeshB,
      linkerLoopMesh,
      disorderedMesh,
      activeSiteLigand,
      tripodBase,
      riserCol,
      camBodyMesh,
      frontReel,
      rearReel,
      lensBarrelMesh,
      lensGlassMesh,
      monitorMesh,
    ];

    const onPointerDown = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(inspectableMeshes, true);
      if (hits.length > 0) {
        let obj: THREE.Object3D | null = hits[0].object;
        while (obj && !obj.userData.partName) {
          obj = obj.parent;
        }
        if (obj?.userData.partName) {
          setInspectedPartName(obj.userData.partName);
        }
      }
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const onResize = () => {
      if (!container) return;
      const newW = container.clientWidth || window.innerWidth;
      const newH = container.clientHeight || window.innerHeight;
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      renderer.setSize(newW, newH);
    };
    window.addEventListener('resize', onResize);

    const clock = new THREE.Clock();
    let frameId = 0;
    let currentExplode = 0;
    let dollyAngle = 0;
    let ledFrameCounter = 0;

    function updateLedVolumeTexture(elapsed: number) {
      const w = ledCanvas.width;
      const h = ledCanvas.height;

      const grad = ledCtx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.5, '#f0f9ff');
      grad.addColorStop(1, '#fdf4ff');
      ledCtx.fillStyle = grad;
      ledCtx.fillRect(0, 0, w, h);

      const vidEl = videoElRef.current;
      const imgEl = sceneImgElRef.current;

      if (vidEl && vidEl.readyState >= 2) {
        ledCtx.save();
        if (stateRef.current.isWebcamMirrored) {
          ledCtx.translate(w, 0);
          ledCtx.scale(-1, 1);
        }
        ledCtx.drawImage(vidEl, 0, 0, w, h);
        ledCtx.restore();
      } else if (imgEl && imgEl.complete && (imgEl.naturalWidth > 0 || imgEl.width > 0)) {
        const zoom = 1.04 + Math.sin(elapsed * 0.7) * 0.04;
        const dw = w * zoom;
        const dh = h * zoom;
        ledCtx.drawImage(imgEl, (w - dw) / 2, (h - dh) / 2, dw, dh);
      } else {
        ledCtx.strokeStyle = 'rgba(0, 229, 255, 0.45)';
        ledCtx.lineWidth = 2;
        for (let x = 0; x <= w; x += 64) {
          ledCtx.beginPath();
          ledCtx.moveTo(x, 0);
          ledCtx.lineTo(x, h);
          ledCtx.stroke();
        }
        for (let y = 0; y <= h; y += 64) {
          ledCtx.beginPath();
          ledCtx.moveTo(0, y);
          ledCtx.lineTo(w, y);
          ledCtx.stroke();
        }
      }

      // Crisp White & Electric Neon Lower-Third Bar + Real-Time Audio Spectrum Overlay
      ledCtx.fillStyle = 'rgba(255, 255, 255, 0.94)';
      ledCtx.fillRect(0, h - 104, w, 104);
      ledCtx.strokeStyle = '#ff007f';
      ledCtx.lineWidth = 3;
      ledCtx.beginPath();
      ledCtx.moveTo(0, h - 104);
      ledCtx.lineTo(w, h - 104);
      ledCtx.stroke();

      // Draw 20 mini neon equalizer bars on the right side of the IMAX LED lower-third
      const st = stateRef.current;
      if (st.particlesEnabled) {
        const barCount = 20;
        const startX = w - 250;
        const baseLineY = h - 18;
        for (let b = 0; b < barCount; b++) {
          const ratio = b / barCount;
          const bandVal =
            ratio < 0.33
              ? st.bassEnergy
              : ratio < 0.66
              ? st.midEnergy
              : st.trebleEnergy;
          const wave = 0.25 + 0.75 * Math.abs(Math.sin(elapsed * 6.5 + b * 0.55));
          const barH = Math.max(6, Math.min(72, (bandVal * 0.75 + wave * 0.25) * 72));
          ledCtx.fillStyle = b % 2 === 0 ? '#ff007f' : '#00e5ff';
          ledCtx.fillRect(startX + b * 11, baseLineY - barH, 7, barH);
        }
      }

      ledCtx.fillStyle = '#00b8d4';
      ledCtx.font = 'bold 16px "JetBrains Mono", monospace';
      const bgVideoTag = stateRef.current.hasDynamicVideoBg ? ' · FONDO DE VIDEO 3D ACTIVO' : '';
      const musicTag = stateRef.current.isMusicPlaying ? ' · MÚSICA & PARTÍCULAS 3D EN VIVO' : ' · PARTÍCULAS 3D ACTIVAS';
      ledCtx.fillText(
        `ESTUDIO 3D NEÓN & BLANCO · ESCENA 0${stateRef.current.activeSceneIndex + 1}${bgVideoTag}${musicTag}`,
        36,
        h - 64
      );
      ledCtx.fillStyle = '#ff007f';
      ledCtx.font = 'bold 24px "Plus Jakarta Sans", sans-serif';
      const desc = stateRef.current.currentSceneText || '';
      ledCtx.fillText(desc.length > 56 ? `${desc.slice(0, 56)}...` : desc, 36, h - 24);

      ledCanvasTex.needsUpdate = true;
    }

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || typeof gl.fenceSync !== 'function') {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    let smoothedBass = 0.25;
    let smoothedMid = 0.22;
    let smoothedTreble = 0.18;

    function tick() {
      const delta = Math.min(clock.getDelta(), 0.1);
      const elapsed = clock.elapsedTime;
      const st = stateRef.current;

      coupeGroup.visible = st.subjectPreset === 'coupe';
      sculptureGroup.visible = st.subjectPreset === 'sculpture';
      droneGroup.visible = st.subjectPreset === 'drone';
      stationGroup.visible = st.subjectPreset === 'station';
      proteinGroup.visible = st.subjectPreset === 'protein';

      // --- REAL-TIME MUSIC RHYTHM & FFT SPECTRUM EXTRACTION ---
      let rawBass = 0;
      let rawMid = 0;
      let rawTreble = 0;
      const analyser = analyserRef.current;
      const freqBins = freqDataRef.current;
      const audioEl = musicAudioElRef.current;
      const hasLiveAudioSignal = Boolean(
        st.isMusicPlaying && analyser && freqBins && audioEl && !audioEl.paused
      );

      if (hasLiveAudioSignal && analyser && freqBins) {
        analyser.getByteFrequencyData(freqBins);
        const binCount = freqBins.length; // 64 bins for fftSize=128
        let bSum = 0;
        const bEnd = Math.max(1, Math.floor(binCount * 0.18));
        for (let i = 0; i < bEnd; i++) bSum += freqBins[i];
        rawBass = bSum / (bEnd * 255);

        let mSum = 0;
        const mEnd = Math.max(bEnd + 1, Math.floor(binCount * 0.55));
        for (let i = bEnd; i < mEnd; i++) mSum += freqBins[i];
        rawMid = mSum / ((mEnd - bEnd) * 255);

        let tSum = 0;
        for (let i = mEnd; i < binCount; i++) tSum += freqBins[i];
        rawTreble = tSum / (Math.max(1, binCount - mEnd) * 255);
      }

      // Blend with procedural 124-BPM studio synth beat when playing or if audio element is warming up
      if (st.isPlaying || st.isMusicPlaying) {
        const bpmFreq = (124 / 60) * Math.PI * 2;
        const kickWave = Math.pow(Math.max(0, Math.sin(elapsed * bpmFreq)), 4);
        const snareWave = Math.pow(Math.max(0, Math.sin(elapsed * bpmFreq * 0.5 + Math.PI * 0.5)), 6);
        const arpWave = 0.5 + 0.5 * Math.sin(elapsed * bpmFreq * 2.0 + Math.cos(elapsed * 3.2));

        const synthScale = st.isMusicPlaying ? 0.65 : 0.42;
        rawBass = Math.max(rawBass, kickWave * synthScale);
        rawMid = Math.max(rawMid, (0.35 * kickWave + 0.65 * snareWave) * synthScale);
        rawTreble = Math.max(rawTreble, arpWave * synthScale);
      }

      const reactivity = st.particleReactivity;
      smoothedBass = THREE.MathUtils.damp(smoothedBass, Math.min(1.4, rawBass * reactivity), 14, delta);
      smoothedMid = THREE.MathUtils.damp(smoothedMid, Math.min(1.4, rawMid * reactivity), 12, delta);
      smoothedTreble = THREE.MathUtils.damp(smoothedTreble, Math.min(1.4, rawTreble * reactivity), 16, delta);
      const beatPulse = Math.min(1.5, smoothedBass * 0.55 + smoothedMid * 0.3 + smoothedTreble * 0.15);

      st.bassEnergy = smoothedBass;
      st.midEnergy = smoothedMid;
      st.trebleEnergy = smoothedTreble;
      st.beatPulse = beatPulse;

      // Update UI Beat Meter every ~6 frames to avoid excess React re-renders
      if (ledFrameCounter % 6 === 0 && st.particlesEnabled) {
        setBeatMeterUi({
          bass: Math.min(100, Math.round(smoothedBass * 85)),
          mid: Math.min(100, Math.round(smoothedMid * 85)),
          treble: Math.min(100, Math.round(smoothedTreble * 85)),
        });
      }

      // --- UPDATE 3D AUDIO-REACTIVE PARTICLES & 48-PILLAR EQUALIZER RING ---
      audioParticlePoints.visible = st.particlesEnabled;
      eqRingInstanced.visible = st.particlesEnabled;

      if (st.particlesEnabled) {
        // Pulse particle size and turntable neon ring to the bass beat
        particleMat.size = 0.17 + smoothedBass * 0.18 + smoothedTreble * 0.06;
        emissiveCyanMat.emissiveIntensity = 1.8 + beatPulse * 2.4;
        eqBarMat.emissiveIntensity = 1.2 + smoothedBass * 2.2;

        const positionsArr = posAttr.array as Float32Array;
        const colorsArr = colAttr.array as Float32Array;
        const pattern = st.particlePattern;

        for (let i = 0; i < PARTICLE_COUNT; i++) {
          const band = particleBands[i];
          const bandEnergy = band === 0 ? smoothedBass : band === 1 ? smoothedMid : smoothedTreble;
          const speed = particleSpeeds[i] * (1 + bandEnergy * 1.6);
          const baseR = particleBaseRadii[i];
          const baseH = particleBaseHeights[i];
          const phase = particleBaseAngles[i] + elapsed * speed * (st.isPlaying || st.isMusicPlaying ? 1 : 0.15);

          let px = 0;
          let py = 0;
          let pz = 0;

          if (pattern === 'vortex') {
            // Spiral Neon Vortex: Bass expands radius, Mid creates vertical harmonic waves
            const r = baseR + smoothedBass * 0.95 * Math.sin(phase * 2 + i * 0.1);
            px = Math.cos(phase) * r;
            pz = Math.sin(phase) * r;
            py =
              baseH +
              Math.sin(elapsed * 3.4 + baseR * 1.5) * (0.22 + smoothedMid * 0.85) +
              (band === 0 ? smoothedBass * 0.55 : 0);
          } else if (pattern === 'fountain') {
            // Rhythmic 3D Fountain Jets: Particles launch upward from the stage plinth on beat hits
            const cycle = ((elapsed * (0.45 + bandEnergy * 0.55) + i / PARTICLE_COUNT) % 1);
            const jetR = 0.9 + cycle * (baseR * 0.85) + smoothedBass * 0.45;
            const archY = Math.sin(cycle * Math.PI) * (1.8 + bandEnergy * 2.8) + 0.2;
            px = Math.cos(phase * 0.8) * jetR;
            pz = Math.sin(phase * 0.8) * jetR;
            py = archY;
          } else {
            // Acoustic 3-Arm Spiral Galaxy
            const armAngle = phase + (i % 3) * ((Math.PI * 2) / 3) + baseR * 0.45;
            const galR = baseR * (0.85 + smoothedBass * 0.35);
            px = Math.cos(armAngle) * galR;
            pz = Math.sin(armAngle) * galR;
            py =
              1.45 +
              Math.cos(baseR * 2.0 - elapsed * 4.0) * (0.28 + smoothedMid * 0.95) +
              Math.sin(armAngle * 3) * smoothedTreble * 0.45;
          }

          positionsArr[i * 3] = px;
          positionsArr[i * 3 + 1] = Math.max(0.08, py);
          positionsArr[i * 3 + 2] = pz;

          // Dynamic neon color shift on high/bass energy peaks
          if (band === 0) {
            // Neon Pink -> Electric Gold on heavy bass
            colorsArr[i * 3] = 1.0;
            colorsArr[i * 3 + 1] = Math.min(1, 0.08 + smoothedBass * 0.65);
            colorsArr[i * 3 + 2] = Math.max(0.2, 0.55 - smoothedBass * 0.25);
          } else if (band === 1) {
            // Neon Cyan -> Electric White-Cyan on mid peaks
            colorsArr[i * 3] = Math.min(1, smoothedMid * 0.55);
            colorsArr[i * 3 + 1] = 0.9;
            colorsArr[i * 3 + 2] = 1.0;
          } else {
            // Neon Violet -> Electric Magenta on treble shimmer
            colorsArr[i * 3] = Math.min(1, 0.52 + smoothedTreble * 0.48);
            colorsArr[i * 3 + 1] = Math.min(1, 0.22 + smoothedTreble * 0.35);
            colorsArr[i * 3 + 2] = 0.96;
          }
        }
        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;

        // Update 48-Pillar Circular 3D Equalizer Ring around the Turntable
        for (let i = 0; i < EQ_BAR_COUNT; i++) {
          const theta = (i / EQ_BAR_COUNT) * Math.PI * 2 + elapsed * 0.25;
          let binVal = 0;
          if (hasLiveAudioSignal && freqBins) {
            const binIdx = i % Math.min(48, freqBins.length);
            binVal = (freqBins[binIdx] / 255) * reactivity;
          } else {
            const symIdx = Math.abs((i % 24) - 12) / 12;
            const waveVal = Math.abs(Math.sin(elapsed * 5.2 + i * 0.38));
            binVal = (1 - symIdx) * smoothedBass * 0.8 + symIdx * smoothedTreble * 0.6 + waveVal * smoothedMid * 0.45;
          }
          const barScaleY = Math.max(0.08, Math.min(1.85, 0.1 + binVal * 1.15));
          _dummyObj.position.set(Math.cos(theta) * eqRadius, 0.16, Math.sin(theta) * eqRadius);
          _dummyObj.rotation.set(0, -theta, 0);
          _dummyObj.scale.set(1 + smoothedBass * 0.35, barScaleY, 1 + smoothedBass * 0.35);
          _dummyObj.updateMatrix();
          eqRingInstanced.setMatrixAt(i, _dummyObj.matrix);

          // Shift bar color between Neon Cyan, Neon Violet, and Neon Pink by amplitude
          if (barScaleY > 0.85) {
            _scratchColor.setHex(0xff007f);
          } else if (barScaleY > 0.42) {
            _scratchColor.setHex(0x7c3aed);
          } else {
            _scratchColor.setHex(0x00e5ff);
          }
          eqRingInstanced.setColorAt(i, _scratchColor);
        }
        eqRingInstanced.instanceMatrix.needsUpdate = true;
        if (eqRingInstanced.instanceColor) eqRingInstanced.instanceColor.needsUpdate = true;
      }

      ledFrameCounter++;
      if (ledFrameCounter % 2 === 0) {
        updateLedVolumeTexture(elapsed);
      }

      // Dynamic 3D Video Background Binding (Sky-Dome 360°, Direct Scene Backdrop, or LED Wall)
      const activeVideoTex = threeVideoTexRef.current;
      const vidEl = videoElRef.current;
      const isVideoReady = Boolean(st.hasDynamicVideoBg && activeVideoTex && vidEl && vidEl.readyState >= 2);

      if (isVideoReady && activeVideoTex) {
        if (st.videoBgMode === 'scene_backdrop') {
          scene.background = activeVideoTex;
          videoSkyDomeMesh.visible = false;
        } else if (st.videoBgMode === 'dome_and_wall') {
          if ( videoSkyDomeMat.map !== activeVideoTex ) {
            videoSkyDomeMat.map = activeVideoTex;
            videoSkyDomeMat.needsUpdate = true;
          }
          videoSkyDomeMat.opacity = st.videoBgOpacity;
          videoSkyDomeMesh.visible = true;
          if (!(scene.background instanceof THREE.Color)) {
            scene.background = new THREE.Color(LIGHTING_PRESETS[st.lightingPreset].bgHex);
          }
        } else {
          videoSkyDomeMesh.visible = false;
          if (!(scene.background instanceof THREE.Color)) {
            scene.background = new THREE.Color(LIGHTING_PRESETS[st.lightingPreset].bgHex);
          }
        }
      } else {
        videoSkyDomeMesh.visible = false;
        if (!(scene.background instanceof THREE.Color)) {
          scene.background = new THREE.Color(LIGHTING_PRESETS[st.lightingPreset].bgHex);
        }
      }

      const finish = FINISH_PRESETS[st.finishPreset];
      _scratchColor.setHex(finish.color);
      heroPrimaryMat.color.lerp(_scratchColor, 1 - Math.exp(-8 * delta));
      heroPrimaryMat.metalness = THREE.MathUtils.damp(heroPrimaryMat.metalness, finish.metalness, 8, delta);
      heroPrimaryMat.roughness = THREE.MathUtils.damp(heroPrimaryMat.roughness, finish.roughness, 8, delta);

      const lp = LIGHTING_PRESETS[st.lightingPreset];
      _scratchColor.setHex(lp.bgHex);
      if (scene.background instanceof THREE.Color) {
        scene.background.lerp(_scratchColor, 1 - Math.exp(-5 * delta));
      }
      if (scene.fog instanceof THREE.FogExp2) {
        scene.fog.color.lerp(_scratchColor, 1 - Math.exp(-5 * delta));
        scene.fog.density = isVideoReady && st.videoBgMode !== 'led_wall' ? 0.004 : 0.012;
      }
      _scratchColor.setHex(lp.keyHex);
      keyLight.color.lerp(_scratchColor, 1 - Math.exp(-6 * delta));
      keyLight.intensity = THREE.MathUtils.damp(keyLight.intensity, lp.keyIntensity, 6, delta);
      _scratchColor.setHex(lp.rimHex);
      rimLight.color.lerp(_scratchColor, 1 - Math.exp(-6 * delta));
      rimLight.intensity = THREE.MathUtils.damp(rimLight.intensity, lp.rimIntensity, 6, delta);
      _scratchColor.setHex(lp.hemiSkyHex);
      hemiLight.color.lerp(_scratchColor, 1 - Math.exp(-6 * delta));

      currentExplode = THREE.MathUtils.damp(currentExplode, st.explodedFactor, 6, delta);
      for (let i = 0; i < explodableParts.length; i++) {
        const item = explodableParts[i];
        _tempVec3.copy(item.explodeOffset).multiplyScalar(currentExplode).add(item.basePos);
        item.mesh.position.copy(_tempVec3);
      }

      if (st.isPlaying) {
        dollyAngle += delta * 0.45;
        subjectsRoot.rotation.y += delta * 0.55;
        frontReel.rotation.x += delta * 2.2;
        rearReel.rotation.x += delta * 2.2;
        if (videoSkyDomeMesh.visible) {
          videoSkyDomeMesh.rotation.y += delta * 0.04;
        }

        cameraRigGroup.position.x = Math.sin(dollyAngle) * 1.35;
        cameraHeadGroup.lookAt(0, 0.9, 0);

        if (coupeGroup.visible) {
          for (let wIdx = 0; wIdx < coupeWheels.length; wIdx++) {
            coupeWheels[wIdx].rotation.z -= delta * 5.2;
          }
          coupeGroup.position.y = Math.sin(clock.elapsedTime * 6.0) * 0.012;
        }
        if (sculptureGroup.visible) {
          outerGyroRing.rotation.x += delta * 0.7;
          midGyroRing.rotation.y -= delta * 1.1;
          innerGyroRing.rotation.z += delta * 1.4;
        }
        if (stationGroup.visible) {
          centrifugeHabitat.rotation.z += delta * 0.85;
          innerShieldRing.rotation.z -= delta * 1.25;
        }
        if (proteinGroup.visible) {
          linkerLoopMesh.rotation.y += delta * 0.65;
          activeSiteLigand.rotation.x += delta * 0.9;
        }
      }

      if (st.hasPendingCameraTransition) {
        const preset = CAMERA_PRESETS[st.cameraPreset];
        _camTargetPos.set(...preset.pos);
        _camTargetLook.set(...preset.target);

        const alpha = 1 - Math.exp(-5.5 * delta);
        camera.position.lerp(_camTargetPos, alpha);
        controls.target.lerp(_camTargetLook, alpha);

        if (
          camera.position.distanceToSquared(_camTargetPos) < 0.002 &&
          controls.target.distanceToSquared(_camTargetLook) < 0.002
        ) {
          st.hasPendingCameraTransition = false;
        }
      }

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    frameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      controls.removeEventListener('start', onControlStart);
      controls.dispose();
      floorTex.dispose();
      contactShadowTex.dispose();
      particleSpriteTex.dispose();
      particleGeo.dispose();
      particleMat.dispose();
      eqBarGeo.dispose();
      eqBarMat.dispose();
      ledCanvasTex.dispose();
      videoSkyDomeGeo.dispose();
      videoSkyDomeMat.dispose();
      envTexture.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!isDraggingVideoOver3D) setIsDraggingVideoOver3D(true);
      }}
      onDragLeave={() => setIsDraggingVideoOver3D(false)}
      onDrop={handleDropVideoOn3DStage}
      className="relative w-screen h-screen overflow-hidden bg-white text-fuchsia-600 select-none"
    >
      {/* Hidden Audio Element for AI Generated Music & Web Audio API Beat Analyzer */}
      <audio
        ref={musicAudioElRef}
        crossOrigin="anonymous"
        onPlay={() => {
          setIsMusicPlaying(true);
          stateRef.current.isMusicPlaying = true;
        }}
        onPause={() => {
          setIsMusicPlaying(false);
          stateRef.current.isMusicPlaying = false;
        }}
        onEnded={() => {
          setIsMusicPlaying(false);
          stateRef.current.isMusicPlaying = false;
        }}
        className="hidden"
      />

      {/* Dedicated WebGL Mount Container (Outside React HUD overlays) */}
      <div ref={canvasMountRef} className="absolute inset-0 w-full h-full" />

      {/* Drag & Drop Video Overlay */}
      {isDraggingVideoOver3D && (
        <div
          style={{ backgroundColor: 'rgba(255, 255, 255, 0.92)' }}
          className="absolute inset-4 z-30 rounded-2xl border-2 border-dashed border-fuchsia-500 flex flex-col items-center justify-center gap-3 pointer-events-none shadow-2xl"
        >
          <Upload className="w-12 h-12 text-fuchsia-600" />
          <p className="text-xl font-bold text-fuchsia-600 font-display-gold">
            Suelta tu archivo de video aquí para usarlo como Fondo Dinámico del Estudio 3D
          </p>
          <p className="text-xs text-cyan-600 font-semibold">
            Compatible con MP4, WebM y MOV · Proyección en Domo 360° + Pantalla Curva IMAX 3D
          </p>
        </div>
      )}

      {/* Top Bar Contract: White Background & Electric Neon 3 Zones */}
      <header
        style={{ backgroundColor: 'rgba(255, 255, 255, 0.95)' }}
        className="absolute top-4 left-6 right-6 z-10 flex items-center justify-between gap-4 px-5 py-3 rounded-xl border-2 border-cyan-400 text-fuchsia-600 pointer-events-auto shadow-xl"
      >
        {/* Zone 1: Brand Wordmark */}
        <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
          <Video className="w-5 h-5 text-fuchsia-600" />
          <span className="text-base font-extrabold tracking-wider text-fuchsia-600 font-display-gold">
            Reelify Video AI
          </span>
          <span className="text-xs text-cyan-500">·</span>
          <span className="text-xs text-violet-700 font-semibold truncate max-w-52">{inspectedPartName}</span>
        </div>

        {/* Zone 2: Multi-Scene Sequence Switcher */}
        <div className="hidden lg:flex items-center gap-2 text-xs text-violet-700 min-w-0 overflow-x-auto">
          {activeProject ? (
            <div className="flex items-center gap-2 truncate">
              <Folder className="w-3.5 h-3.5 text-fuchsia-600 shrink-0" />
              <span className="font-bold text-fuchsia-600 truncate max-w-40">{activeProject.title}</span>
              {localScenes.length > 0 && (
                <div className="flex items-center gap-1 ml-1">
                  {localScenes.map((sc, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setActiveSceneIndex(idx);
                        const camKeys: CameraPresetId[] = ['director', 'lens', 'crane', 'macro'];
                        triggerCameraPreset(camKeys[idx % camKeys.length]);
                      }}
                      className={`px-2 py-0.5 rounded text-xs font-mono tabular-nums transition-colors ${
                        activeSceneIndex === idx
                          ? 'bg-fuchsia-600 text-white font-bold shadow-xs'
                          : 'bg-white text-cyan-700 border border-cyan-400 hover:bg-cyan-50'
                      }`}
                      title={sc.description}
                    >
                      S{idx + 1} ({sc.duration})
                    </button>
                  ))}
                </div>
              )}
              {localScenes.length > 1 && (
                <button
                  onClick={() => setIsAutoMultiScene((prev) => !prev)}
                  className={`px-2.5 py-0.5 rounded text-xs font-semibold transition-colors ${
                    isAutoMultiScene
                      ? 'bg-cyan-500 text-white font-bold'
                      : 'bg-white text-violet-700 border border-cyan-400'
                  }`}
                >
                  {isAutoMultiScene ? 'Auto Multi-Escena: ON' : 'Auto Multi-Escena: OFF'}
                </button>
              )}
            </div>
          ) : (
            <span className="text-cyan-700 font-semibold">
              Estudio 3D Fondo Blanco & Neón · Partículas 3D Rítmicas + Fondo Dinámico
            </span>
          )}
        </div>

        {/* Zone 3: AI Music Rhythm Generator, Upload Dynamic Video Background, Camera, Snapshot, Save & Navigation */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={isGeneratingMusic}
            onClick={handleGenerateAndPlayRhythmMusic}
            className="px-3 py-1.5 text-xs font-extrabold text-white bg-gradient-to-r from-fuchsia-600 via-violet-600 to-cyan-500 hover:from-fuchsia-500 hover:to-cyan-400 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-md disabled:opacity-60"
            title="Generar música con IA (Lyria) y hacer que las partículas 3D reaccionen al ritmo automáticamente"
          >
            {isGeneratingMusic ? (
              <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
            ) : (
              <Music className="w-3.5 h-3.5 text-white" />
            )}
            <span>{isGeneratingMusic ? 'Generando Ritmo IA...' : 'Música IA · Partículas 3D'}</span>
          </button>

          <label
            className="cursor-pointer px-3 py-1.5 text-xs font-bold text-fuchsia-600 bg-white hover:bg-fuchsia-50 border border-fuchsia-400 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0"
            title="Subir un archivo de video (.mp4, .webm, .mov) para usarlo como fondo dinámico del estudio 3D"
          >
            <Upload className="w-3.5 h-3.5 text-fuchsia-600" />
            <span>{uploaded3DVideoUrl ? 'Cambiar Video 3D' : 'Video Fondo 3D'}</span>
            <input type="file" accept="video/*,.mp4,.webm,.mov" onChange={handleUploadVideoTo3D} className="hidden" />
          </label>

          <button
            onClick={handleToggleLiveWebcamOn3DWall}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 border ${
              isLiveWebcamOnWall
                ? 'bg-fuchsia-600 text-white border-fuchsia-400'
                : 'text-fuchsia-600 bg-white hover:bg-fuchsia-50 border-fuchsia-400'
            }`}
            title="Proyectar cámara de tu dispositivo en vivo como fondo dinámico 3D"
          >
            <Camera className="w-3.5 h-3.5 text-fuchsia-600" />
            {isLiveWebcamOnWall ? 'Detener Cámara 3D' : 'Cámara en 3D'}
          </button>

          {isLiveWebcamOnWall && (
            <button
              onClick={handleFlipWebcamOn3DWall}
              className="px-2.5 py-1.5 text-xs font-semibold text-cyan-700 bg-white hover:bg-cyan-50 border border-cyan-400 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
              title="Voltear cámara frontal/trasera en la pantalla 3D"
            >
              <SwitchCamera className="w-3.5 h-3.5 text-cyan-600" />
              Voltear
            </button>
          )}

          <button
            onClick={handleTake3DSnapshot}
            className="px-3 py-1.5 text-xs font-semibold text-violet-700 bg-white hover:bg-violet-50 border border-violet-400 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
            title="Capturar foto del escenario 3D actual y agregarla como escena"
          >
            {snapshotFeedback ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Camera className="w-3.5 h-3.5 text-violet-600" />}
            {snapshotFeedback ? '¡Foto 3D Guardada!' : 'Foto 3D'}
          </button>

          <button
            onClick={handleSave3DConfig}
            className="px-3 py-1.5 text-xs font-semibold text-cyan-700 bg-white hover:bg-cyan-50 border border-cyan-400 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            {saveFeedback ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Save className="w-3.5 h-3.5 text-cyan-600" />}
            {saveFeedback ? 'Guardado' : 'Guardar 3D'}
          </button>

          <button
            onClick={() => {
              if (onCreateVideoInScenario) {
                onCreateVideoInScenario(subjectPreset);
              } else {
                onOpenCreate();
              }
            }}
            className="px-3 py-1.5 text-xs font-bold text-white bg-fuchsia-600 hover:bg-fuchsia-500 border border-fuchsia-400 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
            title="Crear un nuevo video usando este escenario 3D"
          >
            <Plus className="w-3.5 h-3.5 text-white" />
            Crear Video
          </button>

          <button
            onClick={onOpenDashboard}
            className="px-3 py-1.5 text-xs font-semibold text-violet-700 bg-white hover:bg-violet-50 border border-cyan-400 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <LayoutDashboard className="w-3.5 h-3.5 text-fuchsia-600" />
            Tablero
          </button>
        </div>
      </header>

      {/* Active Scene Text Creator, 3D Audio-Reactive Particle Controls & Dynamic Video Background Strip */}
      {!isDockCollapsed && (
        <div
          style={{ backgroundColor: 'rgba(255, 255, 255, 0.95)' }}
          className="absolute top-20 left-1/2 -translate-x-1/2 z-10 max-w-4xl w-[95vw] px-4 py-3 rounded-xl border-2 border-fuchsia-400 pointer-events-auto space-y-2.5 shadow-xl"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-fuchsia-600 font-bold font-mono tabular-nums flex items-center gap-1.5">
              <VolumeX className="w-3.5 h-3.5 text-cyan-600" />
              <span>
                Estudio 3D Neón & Blanco · Escena {activeSceneIndex + 1}/{Math.max(1, localScenes.length)} · 3D: {subjectPreset.toUpperCase()}
              </span>
            </span>

            {/* Dynamic Video Background Controls */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-mono font-bold text-violet-700">Modo Fondo Video:</span>
              {(
                [
                  { id: 'dome_and_wall', label: 'Domo 360° + LED' },
                  { id: 'scene_backdrop', label: 'Fondo Completo' },
                  { id: 'led_wall', label: 'Pantalla IMAX' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setVideoBgMode(m.id)}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                    videoBgMode === m.id
                      ? 'bg-fuchsia-600 text-white font-bold'
                      : 'bg-white text-cyan-700 border border-cyan-400 hover:bg-cyan-50'
                  }`}
                >
                  {m.label}
                </button>
              ))}

              {uploaded3DVideoUrl && (
                <>
                  <div className="flex items-center gap-1 bg-white px-2 py-0.5 rounded border border-cyan-400">
                    <span className="text-[10px] font-mono font-bold text-fuchsia-600">Brillo</span>
                    <input
                      type="range"
                      min={0.2}
                      max={1}
                      step={0.05}
                      value={videoBgOpacity}
                      onChange={(e) => setVideoBgOpacity(parseFloat(e.target.value))}
                      className="w-14 accent-fuchsia-600 cursor-pointer"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsVideoBgMuted((prev) => !prev)}
                    className="px-2 py-0.5 rounded bg-white border border-cyan-400 text-[11px] font-semibold text-violet-700 hover:bg-cyan-50"
                  >
                    {isVideoBgMuted ? 'Audio Video: Mute' : 'Audio Video: ON'}
                  </button>
                  <button
                    type="button"
                    onClick={handleClearVideoBackground}
                    className="px-2 py-0.5 rounded bg-rose-600 text-[11px] font-semibold text-white hover:bg-rose-500"
                    title="Quitar el video de fondo y restaurar el fondo blanco del estudio 3D"
                  >
                    Quitar Fondo
                  </button>
                </>
              )}
            </div>
          </div>

          {/* 3D Audio-Reactive Particle System & Music Rhythm Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-cyan-200 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setParticlesEnabled((prev) => !prev)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold flex items-center gap-1 transition-all border ${
                  particlesEnabled
                    ? 'bg-fuchsia-600 text-white border-fuchsia-400 shadow-xs'
                    : 'bg-white text-violet-700 border-cyan-400 hover:bg-cyan-50'
                }`}
                title="Activar o desactivar el sistema de partículas 3D reactivas al ritmo"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Partículas 3D: {particlesEnabled ? 'ON' : 'OFF'}</span>
              </button>

              {(
                [
                  { id: 'vortex', label: 'Vórtice Neón' },
                  { id: 'fountain', label: 'Fuente Rítmica' },
                  { id: 'galaxy', label: 'Galaxia Acústica' },
                ] as { id: ParticlePatternId; label: string }[]
              ).map((pat) => (
                <button
                  key={pat.id}
                  type="button"
                  onClick={() => {
                    setParticlesEnabled(true);
                    setParticlePattern(pat.id);
                  }}
                  className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                    particlesEnabled && particlePattern === pat.id
                      ? 'bg-cyan-500 text-white'
                      : 'bg-white text-violet-700 border border-cyan-300 hover:bg-cyan-50'
                  }`}
                >
                  {pat.label}
                </button>
              ))}

              <div className="flex items-center gap-1.5 bg-white px-2.5 py-0.5 rounded-lg border border-cyan-400">
                <span className="text-[10px] font-mono font-bold text-fuchsia-600">Ritmo</span>
                <input
                  type="range"
                  min={0.5}
                  max={2.5}
                  step={0.05}
                  value={particleReactivity}
                  onChange={(e) => setParticleReactivity(parseFloat(e.target.value))}
                  className="w-16 accent-fuchsia-600 cursor-pointer"
                  title="Sensibilidad de reacción de las partículas 3D al ritmo musical"
                />
                <span className="text-[10px] font-mono font-bold text-violet-700 tabular-nums">
                  {particleReactivity.toFixed(1)}x
                </span>
              </div>
            </div>

            {/* Music Playback & Live Frequency Spectrum Meter */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handleToggleMusicPlayback}
                disabled={isGeneratingMusic}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold flex items-center gap-1 transition-all border ${
                  isMusicPlaying
                    ? 'bg-cyan-500 text-white border-cyan-400'
                    : 'bg-white text-fuchsia-600 border-fuchsia-400 hover:bg-fuchsia-50'
                }`}
                title="Reproducir o pausar música para que las partículas 3D bailen al ritmo"
              >
                {isMusicPlaying ? <Pause className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                <span className="truncate max-w-36">
                  {isMusicPlaying ? `Sonando: ${musicTrackTitle}` : 'Reproducir Ritmo Musical'}
                </span>
              </button>

              <label
                className="cursor-pointer px-2 py-1 rounded-lg bg-white hover:bg-cyan-50 border border-cyan-400 text-[11px] font-bold text-violet-700 flex items-center gap-1"
                title="Cargar archivo MP3 o WAV propio para sincronizar las partículas 3D"
              >
                <Upload className="w-3 h-3 text-fuchsia-600" />
                <span>Cargar MP3</span>
                <input
                  type="file"
                  accept="audio/*,.mp3,.wav,.ogg"
                  onChange={handleUploadMusicForParticles}
                  className="hidden"
                />
              </label>

              {/* Live 3-Band Neon Equalizer Readout */}
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 border border-cyan-400 font-mono text-[10px] font-bold tabular-nums"
                title="Nivel de reacción en tiempo real: Graves (Bass), Medios (Mid) y Agudos (High)"
              >
                <span className="text-fuchsia-600">B:{beatMeterUi.bass}%</span>
                <span className="text-cyan-600">M:{beatMeterUi.mid}%</span>
                <span className="text-violet-700">H:{beatMeterUi.treble}%</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={scenarioTextInput}
              onChange={(e) => {
                setScenarioTextInput(e.target.value);
                stateRef.current.currentSceneText = e.target.value;
              }}
              placeholder="Escribe el texto neón en pantalla para este escenario 3D..."
              className="flex-1 bg-white border-2 border-cyan-400 focus:border-fuchsia-500 rounded-lg px-3 py-1.5 text-xs text-fuchsia-700 font-semibold outline-none"
            />
            <button
              type="button"
              onClick={handleCreateScenarioText}
              className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-fuchsia-600 via-violet-600 to-cyan-500 hover:from-fuchsia-500 hover:to-cyan-400 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-all shadow-md"
              title="Crear y aplicar letras neón en pantalla al escenario 3D actual"
            >
              {textFeedback ? <Check className="w-3.5 h-3.5 text-white" /> : <TypeIcon className="w-3.5 h-3.5 text-white" />}
              <span>{textFeedback ? '¡Texto Neón Aplicado!' : 'Aplicar Texto Neón'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Unified Collapsible Bottom Control Dock */}
      <div
        style={{
          bottom: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          maxWidth: 'min(1080px, 95vw)',
          width: '100%',
        }}
        className="absolute z-10 flex flex-col items-center pointer-events-auto"
      >
        <button
          onClick={() => setIsDockCollapsed((prev) => !prev)}
          style={{ backgroundColor: 'rgba(255, 255, 255, 0.95)' }}
          className="px-3.5 py-1 rounded-t-lg border-2 border-b-0 border-cyan-400 text-xs font-bold text-fuchsia-600 hover:text-violet-700 flex items-center gap-1.5 transition-colors whitespace-nowrap"
        >
          {isDockCollapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5 text-cyan-600" />
              Mostrar Controles 3D (H)
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5 text-cyan-600" />
              Ocultar Controles (H)
            </>
          )}
        </button>

        {!isDockCollapsed && (
          <div
            style={{ backgroundColor: 'rgba(255, 255, 255, 0.95)' }}
            className="w-full rounded-xl border-2 border-cyan-400 px-4 py-3 text-fuchsia-600 shadow-2xl flex flex-wrap items-center justify-between gap-3"
          >
            {/* 1. Preview Playback & 5 Stage 3D Scene Subjects */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsPlaying((prev) => !prev)}
                className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-fuchsia-600 via-violet-600 to-cyan-500 hover:from-fuchsia-500 hover:to-cyan-400 text-white text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 shadow-sm"
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                {isPlaying ? 'Pausar 3D' : 'Reproducir 3D'}
              </button>

              <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-lg border border-cyan-400">
                {(
                  [
                    { id: 'coupe', label: 'Cyber Coupe' },
                    { id: 'sculpture', label: 'Gyro Sculpture' },
                    { id: 'drone', label: 'Cinema Drone' },
                    { id: 'station', label: 'Orbital Station' },
                    { id: 'protein', label: 'AlphaFold Helix' },
                  ] as { id: SubjectPresetId; label: string }[]
                ).map((sub) => (
                  <button
                    key={sub.id}
                    onClick={() => handleSelectSubject(sub.id)}
                    className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      subjectPreset === sub.id
                        ? 'bg-fuchsia-600 text-white font-bold shadow-xs'
                        : 'text-violet-700 hover:text-fuchsia-600'
                    }`}
                  >
                    {sub.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Camera Angle Presets */}
            <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-lg border border-cyan-400">
              <Camera className="w-3.5 h-3.5 text-fuchsia-600 ml-1.5 mr-1 shrink-0" />
              {(Object.keys(CAMERA_PRESETS) as CameraPresetId[]).map((presetKey) => (
                <button
                  key={presetKey}
                  onClick={() => triggerCameraPreset(presetKey)}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    cameraPreset === presetKey
                      ? 'bg-cyan-500 text-white font-bold'
                      : 'text-violet-700 hover:text-fuchsia-600'
                  }`}
                >
                  {CAMERA_PRESETS[presetKey].label}
                </button>
              ))}
            </div>

            {/* 3. Surface Finish & Lighting Mood */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-lg border border-cyan-400">
                <Sparkles className="w-3.5 h-3.5 text-fuchsia-600 ml-1.5 mr-1 shrink-0" />
                {(Object.keys(FINISH_PRESETS) as FinishPresetId[]).map((fKey) => (
                  <button
                    key={fKey}
                    onClick={() => setFinishPreset(fKey)}
                    className={`px-2 py-1 rounded text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      finishPreset === fKey
                        ? 'bg-fuchsia-600 text-white font-bold'
                        : 'text-violet-700 hover:text-fuchsia-600'
                    }`}
                  >
                    {FINISH_PRESETS[fKey].label.split(' ')[1]}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-lg border border-cyan-400">
                <Sun className="w-3.5 h-3.5 text-cyan-600 ml-1.5 mr-1 shrink-0" />
                {(Object.keys(LIGHTING_PRESETS) as LightingPresetId[]).map((lKey) => (
                  <button
                    key={lKey}
                    onClick={() => setLightingPreset(lKey)}
                    className={`px-2 py-1 rounded text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      lightingPreset === lKey
                        ? 'bg-cyan-500 text-white font-bold'
                        : 'text-violet-700 hover:text-fuchsia-600'
                    }`}
                  >
                    {LIGHTING_PRESETS[lKey].label}
                  </button>
                ))}
              </div>
            </div>

            {/* 4. Exploded Rig Slider */}
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-cyan-400">
              <Layers className="w-3.5 h-3.5 text-fuchsia-600 shrink-0" />
              <span className="text-xs font-bold text-violet-700 whitespace-nowrap">Explode</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={explodedFactor}
                onChange={(e) => setExplodedFactor(parseFloat(e.target.value))}
                className="w-20 accent-fuchsia-600 cursor-pointer"
              />
              <span className="text-xs font-mono font-bold tabular-nums text-fuchsia-600 w-8 text-right">
                {Math.round(explodedFactor * 100)}%
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

