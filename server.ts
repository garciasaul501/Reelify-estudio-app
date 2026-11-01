import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type, Modality } from '@google/genai';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getAiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const PRESET_CYCLE = ['coupe', 'station', 'drone', 'sculpture', 'protein'] as const;
type SubjectPreset = (typeof PRESET_CYCLE)[number];

function buildFallbackPlan(prompt: string, duration = '15s', requestedSceneCount?: number) {
  const clean = prompt.trim() || 'Secuencia Cinematográfica Multi-Escenario';
  const shortTitle =
    clean.length > 42 ? `${clean.slice(0, 42).replace(/\s+\S*$/, '')}...` : clean;

  const totalSec = parseInt(duration.replace(/[^0-9]/g, ''), 10) || 15;
  const count = requestedSceneCount || (totalSec >= 30 ? 6 : totalSec >= 15 ? 4 : totalSec >= 10 ? 3 : 2);
  const perSceneSec = Math.max(2.5, Math.round((totalSec / count) * 10) / 10);

  const templates = [
    `Plano general de apertura: ${clean} bajo iluminación cálida de estudio y neblina volumétrica.`,
    `Travelling orbital en 3D: La cámara gira alrededor del sujeto principal revelando reflejos metálicos y profundidad.`,
    `Plano secuencia dinámico: Transición hacia un nuevo escenario con cambio de atmósfera y contraluz dramático.`,
    `Acercamiento macro (Close-up): Enfoque selectivo en los detalles mecánicos y texturas de alta precisión.`,
    `Toma aérea de grúa (Crane shot): Vista cenital panorámica mostrando la escala completa del escenario 3D.`,
    `Plano final heroico: Cierre épico con destello anamórfico y estabilización de horizonte.`,
    `Secuencia de acción lateral: Seguimiento de alta velocidad en plataforma dolly con reflejos de neón.`,
    `Epílogo visual: Disolvencia suave hacia el escenario principal con iluminación de contorno dorada.`,
  ];

  const scenes = Array.from({ length: count }, (_, idx) => ({
    description: templates[idx % templates.length],
    duration: `${perSceneSec}s`,
    scene3dPreset: PRESET_CYCLE[idx % PRESET_CYCLE.length],
  }));

  return {
    title: shortTitle,
    script: `Producción multi-escena (${count} escenas · ${totalSec}s): ${clean}. La secuencia recorre múltiples ángulos de cámara y escenarios 3D sincronizados.`,
    scenes,
  };
}

// Synthesize a clean stereo harmonic ambient WAV buffer (base64) when Lyria preview is unavailable on free tier
function generateSynthesizedWavBase64(prompt: string, durationSec = 4): string {
  const sampleRate = 22050;
  const numSamples = sampleRate * durationSec;
  const buffer = Buffer.alloc(44 + numSamples * 2);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + numSamples * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(numSamples * 2, 40);

  let hash = 0;
  for (let i = 0; i < prompt.length; i++) {
    hash = prompt.charCodeAt(i) + ((hash << 5) - hash);
  }
  const baseFreq = 196 + (Math.abs(hash) % 110);
  const fifthFreq = baseFreq * 1.498;
  const octaveFreq = baseFreq * 2;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const env = Math.min(1, t / 0.35) * Math.min(1, (durationSec - t) / 0.6);
    const lfo = 0.85 + 0.15 * Math.sin(2 * Math.PI * 1.8 * t);
    const wave =
      0.45 * Math.sin(2 * Math.PI * baseFreq * t) +
      0.3 * Math.sin(2 * Math.PI * fifthFreq * t) +
      0.2 * Math.sin(2 * Math.PI * octaveFreq * t);
    const sample = Math.max(-1, Math.min(1, wave * env * lfo * 0.55));
    buffer.writeInt16LE(Math.floor(sample * 32767), 44 + i * 2);
  }

  return buffer.toString('base64');
}

// Generate a scene-specific cinematic SVG illustration data URL when Nano Banana is unavailable on free tier
function buildFallbackConceptSvgDataUrl(prompt: string, sceneIndex = 0): string {
  const safePrompt = prompt.replace(/[<>&"']/g, '').slice(0, 74);
  const palettes = [
    { bg1: '#0b0f19', bg2: '#1e1b4b', bg3: '#0f172a', glow: '#38bdf8', accent: '#f59e0b' },
    { bg1: '#090d16', bg2: '#134e4a', bg3: '#0f172a', glow: '#34d399', accent: '#38bdf8' },
    { bg1: '#18181b', bg2: '#3b0764', bg3: '#090d16', glow: '#ec4899', accent: '#818cf8' },
    { bg1: '#0c0a09', bg2: '#451a03', bg3: '#0f172a', glow: '#f59e0b', accent: '#38bdf8' },
  ];
  let hash = sceneIndex * 31;
  for (let i = 0; i < prompt.length; i++) {
    hash = prompt.charCodeAt(i) + ((hash << 5) - hash);
  }
  const pal = palettes[Math.abs(hash + sceneIndex) % palettes.length];
  const cx = 480 + ((sceneIndex % 3) - 1) * 70;
  const cy = 225 + ((sceneIndex % 2) * 20);

  const lower = prompt.toLowerCase();
  const isCar = /car|coupe|auto|vehicle|neon|street|highway|coche|carro/.test(lower);
  const isSpace = /space|orbital|station|planet|galaxy|espacio|estación/.test(lower);
  const isBio = /protein|alphafold|dna|helix|molecular|proteína/.test(lower);

  const subjectArt = isCar
    ? `<g transform="translate(${cx}, ${cy + 25})">
        <ellipse cx="0" cy="52" rx="220" ry="28" fill="${pal.glow}" fill-opacity="0.22"/>
        <path d="M-175,35 L-130,-18 L-25,-38 L95,-32 L165,12 L180,35 Z" fill="#1e293b" stroke="${pal.glow}" stroke-width="3"/>
        <path d="M-110,-15 L-20,-32 L78,-26 L120,6 L-110,6 Z" fill="${pal.glow}" fill-opacity="0.35"/>
        <circle cx="-105" cy="38" r="32" fill="#090d16" stroke="${pal.accent}" stroke-width="4"/>
        <circle cx="110" cy="38" r="32" fill="#090d16" stroke="${pal.accent}" stroke-width="4"/>
        <rect x="155" y="14" width="28" height="8" rx="4" fill="${pal.accent}"/>
      </g>`
    : isSpace
    ? `<g transform="translate(${cx}, ${cy})">
        <ellipse cx="0" cy="0" rx="175" ry="62" fill="none" stroke="${pal.glow}" stroke-width="6" transform="rotate(-18)"/>
        <ellipse cx="0" cy="0" rx="115" ry="38" fill="none" stroke="${pal.accent}" stroke-width="3" transform="rotate(-18)"/>
        <circle cx="0" cy="0" r="34" fill="#1e293b" stroke="#f8fafc" stroke-width="2.5"/>
        <rect x="-240" y="-12" width="75" height="24" fill="${pal.accent}" fill-opacity="0.7" transform="rotate(-18)"/>
        <rect x="165" y="-12" width="75" height="24" fill="${pal.accent}" fill-opacity="0.7" transform="rotate(-18)"/>
      </g>`
    : isBio
    ? `<g transform="translate(${cx}, ${cy})">
        <path d="M-150,-40 Q-75,-110 0,-20 T150,20" fill="none" stroke="#0053D6" stroke-width="14" stroke-linecap="round"/>
        <path d="M-150,30 Q-75,100 0,10 T150,-35" fill="none" stroke="#65CBF3" stroke-width="12" stroke-linecap="round"/>
        <circle cx="0" cy="-5" r="26" fill="${pal.accent}" fill-opacity="0.85"/>
      </g>`
    : `<g transform="translate(${cx}, ${cy})">
        <circle cx="0" cy="0" r="110" fill="none" stroke="${pal.glow}" stroke-width="3" stroke-dasharray="14 8"/>
        <polygon points="0,-78 72,52 -72,52" fill="${pal.glow}" fill-opacity="0.18" stroke="${pal.accent}" stroke-width="3.5"/>
        <circle cx="0" cy="6" r="24" fill="${pal.accent}" fill-opacity="0.85"/>
      </g>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${pal.bg1}"/>
        <stop offset="52%" stop-color="${pal.bg2}"/>
        <stop offset="100%" stop-color="${pal.bg3}"/>
      </linearGradient>
      <radialGradient id="glow" cx="50%" cy="44%" r="46%">
        <stop offset="0%" stop-color="${pal.glow}" stop-opacity="0.5"/>
        <stop offset="55%" stop-color="${pal.accent}" stop-opacity="0.18"/>
        <stop offset="100%" stop-color="${pal.bg1}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="960" height="540" fill="url(#bg)"/>
    <circle cx="${cx}" cy="${cy}" r="250" fill="url(#glow)"/>
    <g stroke="${pal.glow}" stroke-opacity="0.2" stroke-width="1.2" fill="none">
      <line x1="0" y1="360" x2="960" y2="360"/>
      <line x1="180" y1="360" x2="40" y2="540"/>
      <line x1="380" y1="360" x2="310" y2="540"/>
      <line x1="580" y1="360" x2="650" y2="540"/>
      <line x1="780" y1="360" x2="920" y2="540"/>
    </g>
    ${subjectArt}
    <rect x="0" y="452" width="960" height="88" fill="#090d16" fill-opacity="0.82"/>
    <text x="36" y="484" fill="${pal.glow}" font-family="monospace" font-size="13" font-weight="bold">SCENE 0${sceneIndex + 1} · REELIFY VISUAL STORYBOARD FRAME</text>
    <text x="36" y="514" fill="#f8fafc" font-family="sans-serif" font-size="17" font-weight="600">${safePrompt}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf-8').toString('base64')}`;
}

function extractRasterBase64(
  imageInput?: string,
  mimeHint?: string
): { data: string; mimeType: string } | null {
  if (!imageInput || typeof imageInput !== 'string') return null;
  if (imageInput.startsWith('data:image/svg')) return null;
  if (imageInput.startsWith('data:')) {
    const [header, b64] = imageInput.split(',');
    if (!b64) return null;
    const match = header.match(/^data:([^;]+);base64$/i);
    const mimeType = match ? match[1] : mimeHint || 'image/jpeg';
    if (mimeType.includes('svg')) return null;
    return { data: b64, mimeType };
  }
  return { data: imageInput, mimeType: mimeHint || 'image/jpeg' };
}

async function generateSceneImageOrFallback(
  ai: GoogleGenAI | null,
  scenePrompt: string,
  sceneIdx: number,
  refBase64?: string,
  refMime?: string
): Promise<string> {
  const rasterRef = extractRasterBase64(refBase64, refMime);
  if (ai) {
    try {
      const contents: any = rasterRef
        ? {
            parts: [
              {
                inlineData: {
                  data: rasterRef.data,
                  mimeType: rasterRef.mimeType,
                },
              },
              { text: `Cinematic video frame for scene ${sceneIdx + 1}: ${scenePrompt}` },
            ],
          }
        : `Cinematic video frame for scene ${sceneIdx + 1}: ${scenePrompt}`;

      const response = await ai.models.generateContent({
        model: 'gemini-nano-banana-2.1',
        contents,
      });

      const parts = response.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData?.data) {
          const mime = part.inlineData.mimeType || 'image/png';
          return `data:${mime};base64,${part.inlineData.data}`;
        }
      }
    } catch {
      // Fall through to SVG frame
    }
  }
  return buildFallbackConceptSvgDataUrl(scenePrompt, sceneIdx);
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '50mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'reelify-studio' });
  });

  // 1. AI Endpoint for Multi-Scene Scriptwriting & Storyboard Planning
  app.post('/api/ai/plan', async (req, res) => {
    const { prompt, duration = '15s', aspectRatio = '16:9', sceneCount } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const totalSec = parseInt(String(duration).replace(/[^0-9]/g, ''), 10) || 15;
    const targetCount =
      typeof sceneCount === 'number' && sceneCount >= 1 && sceneCount <= 12
        ? sceneCount
        : totalSec >= 30
        ? 6
        : totalSec >= 15
        ? 4
        : totalSec >= 10
        ? 3
        : 2;

    const ai = getAiClient();
    if (!ai) {
      return res.json(buildFallbackPlan(prompt, duration, targetCount));
    }

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `You are Reelify's AI Video Producer. Create a production-ready multi-scene video script and a storyboard with EXACTLY ${targetCount} distinct scenes for the following prompt: "${prompt}". Target total duration: ${duration}, aspect ratio: ${aspectRatio}. For each scene, also choose the best matching 3D stage environment from: "coupe", "sculpture", "drone", "station", "protein".`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: {
                type: Type.STRING,
                description: 'A concise, compelling title for the video project (max 60 chars).',
              },
              script: {
                type: Type.STRING,
                description: 'Full voiceover or narrative direction script.',
              },
              scenes: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    description: {
                      type: Type.STRING,
                      description: 'Detailed visual and camera movement direction for this scene.',
                    },
                    duration: {
                      type: Type.STRING,
                      description: 'Duration of this scene, e.g. "3s" or "5s".',
                    },
                    scene3dPreset: {
                      type: Type.STRING,
                      description: 'One of: coupe, sculpture, drone, station, protein',
                    },
                  },
                  required: ['description', 'duration'],
                },
              },
            },
            required: ['title', 'script', 'scenes'],
          },
        },
      });

      const rawText = response.text?.trim() || '';
      if (rawText) {
        const parsed = JSON.parse(rawText);
        const fallbackScenes = buildFallbackPlan(prompt, duration, targetCount).scenes;
        const resolvedScenes =
          Array.isArray(parsed.scenes) && parsed.scenes.length > 0
            ? parsed.scenes.map((sc: any, i: number) => ({
                description: sc.description || fallbackScenes[i % fallbackScenes.length].description,
                duration: sc.duration || `${Math.max(2.5, Math.round((totalSec / targetCount) * 10) / 10)}s`,
                scene3dPreset: PRESET_CYCLE.includes(sc.scene3dPreset)
                  ? sc.scene3dPreset
                  : PRESET_CYCLE[i % PRESET_CYCLE.length],
              }))
            : fallbackScenes;

        return res.json({
          title: parsed.title || 'Untitled Video',
          script: parsed.script || prompt,
          scenes: resolvedScenes,
        });
      }
      return res.json(buildFallbackPlan(prompt, duration, targetCount));
    } catch (error: any) {
      console.warn('Gemini plan fallback triggered:', error?.message || error);
      return res.json(buildFallbackPlan(prompt, duration, targetCount));
    }
  });

  // 2. Video Generation & Multi-Scene / Multi-Image Animation Endpoint
  app.post('/api/ai/generate-video', async (req, res) => {
    const {
      prompt,
      aspectRatio = '16:9',
      duration = '15s',
      imageBase64,
      imageMimeType,
      images = [],
      scenes = [],
    } = req.body || {};

    if (!prompt && !imageBase64 && (!Array.isArray(images) || images.length === 0) && (!Array.isArray(scenes) || scenes.length === 0)) {
      return res.status(400).json({ error: 'Prompt, scenes, or at least one image is required' });
    }

    const ai = getAiClient();
    const uploadedDataUrls: string[] = Array.isArray(images)
      ? images.map((it: any) => (typeof it === 'string' ? it : it?.dataUrl)).filter(Boolean)
      : [];

    if (imageBase64 && uploadedDataUrls.length === 0) {
      uploadedDataUrls.push(`data:${imageMimeType || 'image/jpeg'};base64,${imageBase64}`);
    }

    if (ai) {
      try {
        const primaryBase64 =
          imageBase64 ||
          (uploadedDataUrls[0] && uploadedDataUrls[0].includes(',')
            ? uploadedDataUrls[0].split(',')[1]
            : undefined);

        const inputPayload = primaryBase64
          ? [
              {
                type: 'image',
                data: primaryBase64,
                mime_type: imageMimeType || 'image/jpeg',
              },
              {
                type: 'text',
                text: prompt || 'Animate this scene with smooth cinematic camera motion and realistic studio lighting.',
              },
            ]
          : prompt;

        const interaction = await ai.interactions.create(
          {
            model: 'gemini-omni-1.1-flash',
            input: inputPayload,
            background: false,
            store: false,
            stream: false,
            response_format: {
              type: 'video',
              aspect_ratio: aspectRatio === '9:16' ? '9:16' : '16:9',
              duration: duration === '10s' ? '10s' : '5s',
              resolution: '720p',
            },
          } as any,
          { timeout: 60000 }
        );

        const videoPart = (interaction as any).output_video;
        if (videoPart && videoPart.data) {
          const mimeType = videoPart.mime_type || 'video/mp4';
          return res.json({
            success: true,
            mode: 'omni',
            mimeType,
            videoDataUrl: `data:${mimeType};base64,${videoPart.data}`,
            sceneImages: uploadedDataUrls,
          });
        }
      } catch (omniErr: any) {
        console.info('Omni video model unavailable on current key tier, synthesizing multi-scene visuals:', omniErr?.message);
      }
    }

    const targetScenes =
      Array.isArray(scenes) && scenes.length > 0
        ? scenes
        : buildFallbackPlan(prompt || 'Cinematic sequence', duration).scenes;

    const sceneImages: string[] = [];
    for (let i = 0; i < targetScenes.length; i++) {
      if (targetScenes[i]?.imageUrl) {
        sceneImages.push(targetScenes[i].imageUrl);
      } else if (uploadedDataUrls[i]) {
        sceneImages.push(uploadedDataUrls[i]);
      } else {
        const scDesc = targetScenes[i]?.description || prompt || `Scene ${i + 1}`;
        const frameUrl = await generateSceneImageOrFallback(ai, scDesc, i);
        sceneImages.push(frameUrl);
      }
    }

    return res.json({
      success: true,
      mode: 'synthesized-images',
      sceneImages,
      message: 'Storyboard & multi-scene motion sequence synthesized.',
    });
  });

  // 3. Create & Edit Images Endpoint (gemini-nano-banana-2.1)
  app.post('/api/ai/image', async (req, res) => {
    const { prompt, imageBase64, imageMimeType, sceneIndex = 0 } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const ai = getAiClient();
    const imageDataUrl = await generateSceneImageOrFallback(ai, prompt, sceneIndex, imageBase64, imageMimeType);

    return res.json({
      success: true,
      imageDataUrl,
    });
  });

  // 3b. Multimodal Scene Rewrite & AI Regeneration Endpoint (Analyze Scene Photo + Text/Voice Instruction)
  app.post('/api/ai/rewrite-scene', async (req, res) => {
    const {
      currentDescription = '',
      instruction = '',
      imageBase64,
      imageMimeType,
      sceneIndex = 0,
      scene3dPreset = 'coupe',
      regenerateVisual = false,
    } = req.body || {};

    const ai = getAiClient();
    const rasterPhoto = extractRasterBase64(imageBase64, imageMimeType);
    const cleanInstruction = String(instruction || '').trim();
    const cleanCurrent = String(currentDescription || '').trim();

    let rewrittenDescription = '';
    let rewrittenOverlayText = '';
    let suggestedPreset = PRESET_CYCLE.includes(scene3dPreset) ? scene3dPreset : 'coupe';

    if (ai) {
      try {
        const promptText = `Eres el Director Creativo de Reelify Studio.
Reescribe y mejora en español la Escena #${Number(sceneIndex) + 1} de un video multi-escena.
- Descripción actual de la escena: "${cleanCurrent || 'Escena cinematográfica en estudio 3D'}"
- Instrucción del usuario (por texto o voz): "${cleanInstruction || 'Analiza la foto adjunta y reescribe la escena con dirección de cámara cinematográfica, iluminación profesional y subtítulo atractivo.'}"
- Escenario 3D actual: "${suggestedPreset}"
${rasterPhoto ? '- Se ha adjuntado una fotografía de referencia para esta escena: describe e integra fielmente los elementos visuales, colores, sujeto y atmósfera de la foto en la nueva dirección de escena.' : ''}
Devuelve un JSON con:
1. "description": Descripción visual detallada y dirección de cámara para la escena (máx 240 caracteres, en español).
2. "overlayText": Texto corto o subtítulo impactante en pantalla para modo sin voz (máx 110 caracteres, en español).
3. "scene3dPreset": El mejor escenario 3D entre "coupe", "sculpture", "drone", "station", "protein".`;

        const contents: any = rasterPhoto
          ? {
              parts: [
                {
                  inlineData: {
                    data: rasterPhoto.data,
                    mimeType: rasterPhoto.mimeType,
                  },
                },
                { text: promptText },
              ],
            }
          : promptText;

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                description: { type: Type.STRING },
                overlayText: { type: Type.STRING },
                scene3dPreset: { type: Type.STRING },
              },
              required: ['description', 'overlayText'],
            },
          },
        });

        const raw = response.text?.trim() || '';
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.description) rewrittenDescription = String(parsed.description).trim();
          if (parsed.overlayText) rewrittenOverlayText = String(parsed.overlayText).trim();
          if (parsed.scene3dPreset && PRESET_CYCLE.includes(parsed.scene3dPreset)) {
            suggestedPreset = parsed.scene3dPreset;
          }
        }
      } catch (err: any) {
        console.warn('Gemini rewrite-scene fallback triggered:', err?.message || err);
      }
    }

    if (!rewrittenDescription) {
      const baseFocus = cleanInstruction
        ? cleanInstruction
        : cleanCurrent || `Secuencia visual en escenario 3D ${suggestedPreset.toUpperCase()}`;
      const photoBadge = rasterPhoto ? ' [Basado en Foto de Escena]' : '';
      rewrittenDescription = `Escena 0${Number(sceneIndex) + 1}${photoBadge}: ${baseFocus} — Toma cinematográfica con travelling suave, iluminación volumétrica de estudio y enfoque dinámico en escenario 3D (${suggestedPreset.toUpperCase()}).`;
      rewrittenOverlayText = cleanInstruction
        ? `${cleanInstruction.slice(0, 95)}`
        : `ESCENA 0${Number(sceneIndex) + 1} · ${baseFocus.slice(0, 80)}`;
    }

    let regeneratedImageDataUrl: string | undefined;
    if (regenerateVisual) {
      regeneratedImageDataUrl = await generateSceneImageOrFallback(
        ai,
        rewrittenDescription,
        Number(sceneIndex) || 0,
        imageBase64,
        imageMimeType
      );
    }

    return res.json({
      success: true,
      description: rewrittenDescription,
      overlayText: rewrittenOverlayText || rewrittenDescription,
      scene3dPreset: suggestedPreset,
      ...(regeneratedImageDataUrl ? { imageDataUrl: regeneratedImageDataUrl } : {}),
    });
  });

  // 3c. Transcribe Video/Audio & Regenerate as 3D Multi-Scene Sequence Endpoint (gemini-3.5-transcribe + gemini-3.8-flash)
  app.post('/api/ai/transcribe-video-3d', async (req, res) => {
    const {
      videoName = 'Video Subido',
      mediaBase64,
      mediaMimeType = 'video/mp4',
      frames = [],
      prompt = '',
      durationSec = 12,
      sceneCount = 4,
      targetPreset = 'coupe',
      regenerateVisuals = false,
    } = req.body || {};

    const ai = getAiClient();
    const targetCount = Math.min(8, Math.max(2, Number(sceneCount) || 4));
    const perSceneSec = Math.max(2.5, Math.round((Number(durationSec || 12) / targetCount) * 10) / 10);
    const frameList: string[] = Array.isArray(frames) ? frames.filter((f) => typeof f === 'string' && f.length > 0) : [];

    let transcriptText = '';
    let generatedTitle = `${String(videoName).replace(/\.[^.]+$/, '')} · Transcripción 3D IA`;
    let generatedScenes: Array<{
      description: string;
      overlayText: string;
      duration: string;
      scene3dPreset: SubjectPreset;
      imageUrl?: string;
    }> = [];

    // Step 1: Attempt direct audio/video transcription with gemini-3.5-transcribe when mediaBase64 is provided
    if (ai && mediaBase64 && typeof mediaBase64 === 'string') {
      try {
        const cleanMedia = mediaBase64.includes(',') ? mediaBase64.split(',')[1] : mediaBase64;
        if (cleanMedia.length > 0 && cleanMedia.length < 18_000_000) {
          const transRes = await ai.models.generateContent({
            model: 'gemini-3.5-transcribe',
            contents: {
              parts: [
                {
                  inlineData: {
                    data: cleanMedia,
                    mimeType: mediaMimeType || 'video/mp4',
                  },
                },
                {
                  text: 'Transcribe en español todo el audio, narración o contenido hablado de este video. Si no hay voz hablada, describe brevemente la acción sonora y visual principal.',
                },
              ],
            },
          });
          if (transRes.text?.trim()) {
            transcriptText = transRes.text.trim();
          }
        }
      } catch (transErr: any) {
        console.info('gemini-3.5-transcribe fallback to multimodal frame analysis:', transErr?.message);
      }
    }

    // Step 2: Multimodal analysis of video frames + transcript to build 3D regenerated scenes via gemini-3.8-flash
    if (ai) {
      try {
        const parts: any[] = [];
        for (const frameDataUrl of frameList.slice(0, 4)) {
          const raster = extractRasterBase64(frameDataUrl);
          if (raster) {
            parts.push({
              inlineData: {
                data: raster.data,
                mimeType: raster.mimeType,
              },
            });
          }
        }

        const analysisPrompt = `Eres el Director de Producción 3D de Reelify Video AI.
Analiza el video "${videoName}" ${transcriptText ? `(Transcripción detectada: "${transcriptText}")` : ''} ${prompt ? `(Instrucción del usuario: "${prompt}")` : ''}.
Tu tarea es:
1. Generar una transcripción narrativa completa en español ("transcript") que resuma o transcriba el video para usarlo en escenarios 3D.
2. Dividir y regenerar el video en exactamente ${targetCount} escenas 3D ("scenes") de ~${perSceneSec}s cada una.
3. Asignar a cada escena un escenario 3D ("scene3dPreset") entre: "coupe", "station", "drone", "sculpture", "protein".
Devuelve JSON con: "title", "transcript", y "scenes" (cada escena con "description", "overlayText", "duration", "scene3dPreset").`;

        parts.push({ text: analysisPrompt });

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: { parts },
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                transcript: { type: Type.STRING },
                scenes: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      description: { type: Type.STRING },
                      overlayText: { type: Type.STRING },
                      duration: { type: Type.STRING },
                      scene3dPreset: { type: Type.STRING },
                    },
                    required: ['description', 'overlayText', 'duration', 'scene3dPreset'],
                  },
                },
              },
              required: ['title', 'transcript', 'scenes'],
            },
          },
        });

        const raw = response.text?.trim() || '';
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.title) generatedTitle = String(parsed.title).trim();
          if (parsed.transcript) transcriptText = String(parsed.transcript).trim();
          if (Array.isArray(parsed.scenes) && parsed.scenes.length > 0) {
            generatedScenes = parsed.scenes.map((sc: any, idx: number) => {
              const preset: SubjectPreset = PRESET_CYCLE.includes(sc.scene3dPreset)
                ? sc.scene3dPreset
                : PRESET_CYCLE[idx % PRESET_CYCLE.length];
              return {
                description: String(sc.description || `Escena 0${idx + 1} transcrita en 3D`),
                overlayText: String(sc.overlayText || sc.description || `ESCENA 0${idx + 1} · 3D IA`),
                duration: String(sc.duration || `${perSceneSec}s`),
                scene3dPreset: preset,
                imageUrl: frameList[idx % Math.max(1, frameList.length)],
              };
            });
          }
        }
      } catch (err: any) {
        console.warn('Multimodal video-to-3D transcription fallback triggered:', err?.message);
      }
    }

    if (!transcriptText) {
      const cleanName = String(videoName).replace(/\.[^.]+$/, '') || 'Secuencia de Video';
      transcriptText = `[Transcripción IA 3D · ${cleanName}] Secuencia visual transcrita y sincronizada en ${targetCount} escenas 3D (${perSceneSec}s por toma). ${
        prompt ? `Dirección aplicada: ${prompt}.` : 'Iluminación volumétrica neón y rotación orbital 360° en estudio.'
      }`;
    }

    if (generatedScenes.length === 0) {
      const cleanName = String(videoName).replace(/\.[^.]+$/, '') || 'Video 3D';
      const startIdx = PRESET_CYCLE.indexOf(targetPreset as SubjectPreset);
      generatedScenes = Array.from({ length: targetCount }, (_, idx) => {
        const preset = PRESET_CYCLE[(Math.max(0, startIdx) + idx) % PRESET_CYCLE.length];
        return {
          description: `Escena 0${idx + 1} [Transcrita de "${cleanName}"]: ${
            prompt || 'Toma cinematográfica regenerada en escenario 3D con cámara en órbita y luces neón'
          } (${preset.toUpperCase()}).`,
          overlayText: `ESCENA 0${idx + 1} · ${cleanName.toUpperCase().slice(0, 34)} · 3D ${preset.toUpperCase()}`,
          duration: `${perSceneSec}s`,
          scene3dPreset: preset,
          imageUrl: frameList[idx % Math.max(1, frameList.length)],
        };
      });
    }

    if (regenerateVisuals) {
      for (let i = 0; i < generatedScenes.length; i++) {
        const sc = generatedScenes[i];
        const refImg = sc.imageUrl || frameList[i % Math.max(1, frameList.length)];
        sc.imageUrl = await generateSceneImageOrFallback(ai, sc.description, i, refImg);
      }
    }

    return res.json({
      success: true,
      title: generatedTitle,
      transcript: transcriptText,
      scenes: generatedScenes,
    });
  });

  // 3e. 1-Click Viral Express Creator & Scene Transcriber from Idea, Photo, or Prompt (gemini-3.8-flash + multimodal)
  app.post('/api/ai/viral-express', async (req, res) => {
    const {
      ideaPrompt = '',
      photos = [],
      mediaBase64,
      mediaMimeType = 'video/mp4',
      viralFormula = 'reel-ventas',
      aspectRatio = '9:16',
      sceneCount = 4,
      targetPreset = 'coupe',
    } = req.body || {};

    const ai = getAiClient();
    const targetCount = Math.min(8, Math.max(3, Number(sceneCount) || 4));
    const photoList: string[] = Array.isArray(photos)
      ? photos.filter((p) => typeof p === 'string' && p.length > 0).slice(0, 8)
      : [];
    const cleanIdea = String(ideaPrompt || '').trim() || 'Cómo hacer crecer tu negocio con videos virales e inteligencia artificial 3D';

    const transitionsCycle = ['zoom-cut', 'slide-up', 'neon-flash', 'wipe-right', 'dissolve', 'slide-left', 'wipe-radial'];

    let viralTitle = `${cleanIdea.slice(0, 48)} · Viral IA`;
    let viralHook = `🔥 ¡PARA TODO! Mira cómo transformar "${cleanIdea.slice(0, 38)}" en segundos:`;
    let viralCta = '🚀 Sígueme y entra al link en mi perfil (whop.com/@saulmente) para empezar gratis hoy.';
    let viralHashtags = '#Viral #Negocios #InteligenciaArtificial #ReelsVirales #Creador3D #Emprendimiento';
    let fullTranscript = '';
    let generatedScenes: Array<{
      description: string;
      overlayText: string;
      duration: string;
      scene3dPreset: SubjectPreset;
      transition: string;
      imageUrl?: string;
    }> = [];

    // Optional step 1: If audio/video media is provided, transcribe spoken voice first
    let detectedVoiceTranscript = '';
    if (ai && mediaBase64 && typeof mediaBase64 === 'string') {
      try {
        const cleanMedia = mediaBase64.includes(',') ? mediaBase64.split(',')[1] : mediaBase64;
        if (cleanMedia.length > 0 && cleanMedia.length < 16_000_000) {
          const transRes = await ai.models.generateContent({
            model: 'gemini-3.5-transcribe',
            contents: {
              parts: [
                {
                  inlineData: {
                    data: cleanMedia,
                    mimeType: mediaMimeType || 'video/mp4',
                  },
                },
                {
                  text: 'Transcribe en español todo lo que se dice o ocurre en este archivo para convertirlo en escenas virales.',
                },
              ],
            },
          });
          if (transRes.text?.trim()) {
            detectedVoiceTranscript = transRes.text.trim();
          }
        }
      } catch {
        // Fallback to multimodal prompt/photo analysis
      }
    }

    // Step 2: Multimodal Viral Script, Hook, Scene Transcription & Storyboard via gemini-3.8-flash
    if (ai) {
      try {
        const parts: any[] = [];
        for (const pUrl of photoList.slice(0, 4)) {
          const raster = extractRasterBase64(pUrl);
          if (raster) {
            parts.push({
              inlineData: {
                data: raster.data,
                mimeType: raster.mimeType,
              },
            });
          }
        }

        const formulaPrompt = `Eres un Director Experto en Videos Virales (TikTok, Instagram Reels, YouTube Shorts) y Transcripción de Escenas con IA.
A partir de esta entrada del usuario:
- Idea / Prompt: "${cleanIdea}"
- Fórmula Viral seleccionada: "${viralFormula}"
- Formato: "${aspectRatio}"
${photoList.length > 0 ? `- El usuario subió ${photoList.length} foto(s): analiza visualmente lo que aparece en las fotos y transcríbelo dentro de las escenas.` : ''}
${detectedVoiceTranscript ? `- Audio transcrito detectado: "${detectedVoiceTranscript}"` : ''}

Crea una producción viral completa y ultra persuasiva en español con exactamente ${targetCount} escenas.
Devuelve un JSON con:
1. "title": Título magnético y viral (máx 55 caracteres).
2. "viralHook": Gancho explosivo para los primeros 3 segundos que detenga el scroll (máx 110 caracteres).
3. "viralCta": Llamada a la acción final clara y persuasiva (máx 110 caracteres).
4. "hashtags": 6 hashtags virales separados por espacio.
5. "transcript": Transcripción completa escena por escena con marcas de tiempo (ej. "[00:00-00:03] ESCENA 1: ...").
6. "scenes": Lista de ${targetCount} escenas. Cada escena debe tener:
   - "description": Dirección visual cinematográfica y de cámara en español.
   - "overlayText": Subtítulo viral impactante en mayúsculas para mostrar en pantalla (máx 85 caracteres).
   - "duration": Duración como "3s" o "4s".
   - "scene3dPreset": El mejor escenario 3D entre "coupe", "station", "drone", "sculpture", "protein".`;

        parts.push({ text: formulaPrompt });

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: { parts },
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                viralHook: { type: Type.STRING },
                viralCta: { type: Type.STRING },
                hashtags: { type: Type.STRING },
                transcript: { type: Type.STRING },
                scenes: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      description: { type: Type.STRING },
                      overlayText: { type: Type.STRING },
                      duration: { type: Type.STRING },
                      scene3dPreset: { type: Type.STRING },
                    },
                    required: ['description', 'overlayText', 'duration', 'scene3dPreset'],
                  },
                },
              },
              required: ['title', 'viralHook', 'viralCta', 'hashtags', 'transcript', 'scenes'],
            },
          },
        });

        const raw = response.text?.trim() || '';
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.title) viralTitle = String(parsed.title).trim();
          if (parsed.viralHook) viralHook = String(parsed.viralHook).trim();
          if (parsed.viralCta) viralCta = String(parsed.viralCta).trim();
          if (parsed.hashtags) viralHashtags = String(parsed.hashtags).trim();
          if (parsed.transcript) fullTranscript = String(parsed.transcript).trim();
          if (Array.isArray(parsed.scenes) && parsed.scenes.length > 0) {
            generatedScenes = parsed.scenes.map((sc: any, idx: number) => {
              const preset: SubjectPreset = PRESET_CYCLE.includes(sc.scene3dPreset)
                ? sc.scene3dPreset
                : PRESET_CYCLE[idx % PRESET_CYCLE.length];
              return {
                description: String(sc.description || cleanIdea),
                overlayText: String(sc.overlayText || sc.description || `ESCENA 0${idx + 1}`).toUpperCase(),
                duration: String(sc.duration || '3.5s'),
                scene3dPreset: preset,
                transition: transitionsCycle[idx % transitionsCycle.length],
                imageUrl: photoList[idx % Math.max(1, photoList.length)],
              };
            });
          }
        }
      } catch (err: any) {
        console.warn('Viral express fallback triggered:', err?.message);
      }
    }

    if (generatedScenes.length === 0) {
      const startPresetIdx = Math.max(0, PRESET_CYCLE.indexOf(targetPreset as SubjectPreset));
      const stepTemplates = [
        {
          overlay: `🔥 GANCHO VIRAL: ${cleanIdea.toUpperCase().slice(0, 52)}`,
          desc: `Escena 01 (Hook Viral 0-3s): Impacto visual inmediato presentando "${cleanIdea}" con zoom dinámico e iluminación neón de alto contraste.`,
        },
        {
          overlay: `⚡ EL SECRETO QUE NADIE TE CUENTA SOBRE ${cleanIdea.toUpperCase().slice(0, 36)}`,
          desc: `Escena 02 (Desarrollo y Valor): Cámara orbital 360° mostrando los detalles clave en escenario 3D interactivo.`,
        },
        {
          overlay: `💎 RESULTADO EN TIEMPO REAL · CALIDAD DE ESTUDIO 3D`,
          desc: `Escena 03 (Demostración / Transformación): Transición rápida revelando el resultado profesional con efectos visuales y subtítulos dinámicos.`,
        },
        {
          overlay: `🚀 EMPIEZA GRATIS HOY · LINK EN PERFIL (WHOP @SAULMENTE)`,
          desc: `Escena 04 (Llamada a la Acción Viral): Toma heroica de cierre invitando a registrarse y compartir el video.`,
        },
      ];

      generatedScenes = Array.from({ length: targetCount }, (_, idx) => {
        const preset = PRESET_CYCLE[(startPresetIdx + idx) % PRESET_CYCLE.length];
        const tpl = stepTemplates[idx % stepTemplates.length];
        return {
          description: tpl.desc,
          overlayText: tpl.overlay,
          duration: '3.5s',
          scene3dPreset: preset,
          transition: transitionsCycle[idx % transitionsCycle.length],
          imageUrl:
            photoList[idx % Math.max(1, photoList.length)] ||
            buildFallbackConceptSvgDataUrl(`${cleanIdea} · Escena ${idx + 1}`, idx),
        };
      });
    } else {
      for (let i = 0; i < generatedScenes.length; i++) {
        if (!generatedScenes[i].imageUrl) {
          generatedScenes[i].imageUrl = buildFallbackConceptSvgDataUrl(
            generatedScenes[i].description || cleanIdea,
            i
          );
        }
      }
    }

    if (!fullTranscript) {
      fullTranscript = generatedScenes
        .map(
          (sc, i) =>
            `[00:0${i * 3} - 00:0${(i + 1) * 3}] ESCENA 0${i + 1} (${sc.scene3dPreset.toUpperCase()} · ${sc.transition.toUpperCase()}):\n🎙️ Subtítulo Viral: "${sc.overlayText}"\n🎬 Acción Visual: ${sc.description}`
        )
        .join('\n\n');
    }

    return res.json({
      success: true,
      title: viralTitle,
      viralHook,
      viralCta,
      hashtags: viralHashtags,
      transcript: fullTranscript,
      scenes: generatedScenes,
    });
  });

  // 3d. Stitch / Combine Multiple Photos & Rotate in 3D with AI Endpoint
  app.post('/api/ai/stitch-rotate-photos-3d', async (req, res) => {
    const {
      photos = [],
      rotationAngle = 360,
      spinDirection = 'right',
      prompt = '',
      scene3dPreset = 'coupe',
      regenerateWithAi = false,
    } = req.body || {};

    const photoList: string[] = Array.isArray(photos)
      ? photos.filter((p) => typeof p === 'string' && p.length > 0).slice(0, 12)
      : [];

    if (photoList.length === 0) {
      return res.status(400).json({ error: 'Se requiere al menos una foto para juntar y girar en 3D.' });
    }

    const ai = getAiClient();
    const validPreset: SubjectPreset = PRESET_CYCLE.includes(scene3dPreset) ? scene3dPreset : 'coupe';
    const dirLabel = spinDirection === 'left' ? 'Giro Orbital Izquierda ↺' : 'Giro Orbital Derecha ↻';

    let orbitalTitle = `Galería 3D (${photoList.length} Fotos Juntas · Giro ${rotationAngle}° IA)`;
    let orbitalSummary = `Fusión holográfica 3D de ${photoList.length} fotografías sincronizadas en carrusel orbital (${dirLabel} · ${rotationAngle}°).`;
    let photoDescriptions: string[] = [];

    if (ai) {
      try {
        const parts: any[] = [];
        for (const pUrl of photoList.slice(0, 4)) {
          const raster = extractRasterBase64(pUrl);
          if (raster) {
            parts.push({
              inlineData: {
                data: raster.data,
                mimeType: raster.mimeType,
              },
            });
          }
        }

        parts.push({
          text: `Eres el Director de Fotografía 3D de Reelify Studio.
El usuario ha juntado ${photoList.length} fotografías para girarlas en un carrusel orbital 3D (${dirLabel}, ángulo ${rotationAngle}°) en el escenario "${validPreset}".
${prompt ? `Instrucción adicional del usuario: "${prompt}".` : ''}
Devuelve un JSON en español con:
1. "title": Título impactante para la secuencia de fotos juntas girando en 3D.
2. "summary": Descripción de cómo se fusionan y giran las fotos en el estudio 3D.
3. "captions": Lista de ${photoList.length} textos breves (uno para cada foto en órbita 3D).`,
        });

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: { parts },
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                summary: { type: Type.STRING },
                captions: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: ['title', 'summary', 'captions'],
            },
          },
        });

        const raw = response.text?.trim() || '';
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.title) orbitalTitle = String(parsed.title).trim();
          if (parsed.summary) orbitalSummary = String(parsed.summary).trim();
          if (Array.isArray(parsed.captions)) {
            photoDescriptions = parsed.captions.map((c: any) => String(c).trim());
          }
        }
      } catch (err: any) {
        console.warn('Gemini stitch-rotate-photos-3d fallback triggered:', err?.message);
      }
    }

    const outputPhotos: string[] = [];
    for (let i = 0; i < photoList.length; i++) {
      if (regenerateWithAi) {
        const cap =
          photoDescriptions[i] ||
          `${prompt || 'Fotografía en órbita 3D con iluminación neón'} · Ángulo ${Math.round(
            ((i + 1) / photoList.length) * Number(rotationAngle || 360)
          )}°`;
        const genImg = await generateSceneImageOrFallback(ai, cap, i, photoList[i]);
        outputPhotos.push(genImg);
      } else {
        outputPhotos.push(photoList[i]);
      }
    }

    const scenes = outputPhotos.map((imgUrl, idx) => {
      const preset = PRESET_CYCLE[(PRESET_CYCLE.indexOf(validPreset) + idx) % PRESET_CYCLE.length];
      const deg = Math.round(((idx + 1) / outputPhotos.length) * Number(rotationAngle || 360));
      const caption =
        photoDescriptions[idx] ||
        `Foto #${idx + 1} unida y girando a ${deg}° (${dirLabel}) en el escenario 3D ${preset.toUpperCase()}.`;
      return {
        description: caption,
        overlayText: `FOTO 3D 0${idx + 1} · GIRO ${deg}° · ${caption.slice(0, 68)}`,
        duration: '4s',
        scene3dPreset: preset,
        imageUrl: imgUrl,
      };
    });

    return res.json({
      success: true,
      title: orbitalTitle,
      summary: orbitalSummary,
      photos: outputPhotos,
      scenes,
    });
  });

  // 4. Generate Music Endpoint (lyria-3-clip-preview / lyria-3-pro-preview)
  app.post('/api/ai/music', async (req, res) => {
    const { prompt, modelType = 'clip' } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Music prompt is required' });
    }

    const modelName = modelType === 'pro' ? 'lyria-3-pro-preview' : 'lyria-3-clip-preview';
    const ai = getAiClient();

    if (ai) {
      try {
        const responseStream = await ai.models.generateContentStream({
          model: modelName,
          contents: prompt,
          config: {
            responseModalities: ['AUDIO', 'TEXT'],
          },
        });

        const audioBuffers: Buffer[] = [];
        let textOutput = '';
        let mimeType = 'audio/wav';

        for await (const chunk of responseStream) {
          const parts = chunk.candidates?.[0]?.content?.parts || [];
          for (const part of parts) {
            if (part.inlineData?.data) {
              if (part.inlineData.mimeType) mimeType = part.inlineData.mimeType;
              audioBuffers.push(Buffer.from(part.inlineData.data, 'base64'));
            }
            if (part.text) {
              textOutput += part.text;
            }
          }
        }

        if (audioBuffers.length > 0) {
          const combinedBase64 = Buffer.concat(audioBuffers).toString('base64');
          return res.json({
            success: true,
            mode: modelName,
            mimeType,
            audioDataUrl: `data:${mimeType};base64,${combinedBase64}`,
            lyrics: textOutput.trim() || `Instrumental cue generated for: ${prompt}`,
          });
        }
      } catch (err: any) {
        console.info('Lyria music generation fallback triggered:', err?.message);
      }
    }

    const wavBase64 = generateSynthesizedWavBase64(prompt, 4);
    return res.json({
      success: true,
      mode: 'studio-synth',
      mimeType: 'audio/wav',
      audioDataUrl: `data:audio/wav;base64,${wavBase64}`,
      lyrics: `[Studio Ambient Score · 92 BPM]\nAtmospheric harmonic pad & cinema pulse tailored for: "${prompt}"`,
    });
  });

  // 5. Google Search & Google Maps Grounding Endpoint (gemini-3.8-flash)
  app.post('/api/ai/grounding', async (req, res) => {
    const { query, mode = 'search', lat, lng } = req.body || {};
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Query is required' });
    }

    const ai = getAiClient();
    if (ai) {
      try {
        const isMaps = mode === 'maps';
        const config: any = {
          tools: isMaps ? [{ googleMaps: {} }] : [{ googleSearch: {} }],
        };

        if (isMaps && typeof lat === 'number' && typeof lng === 'number') {
          config.toolConfig = {
            retrievalConfig: {
              latLng: {
                latitude: lat,
                longitude: lng,
              },
            },
          };
        }

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: isMaps
            ? `You are a film location scout for Reelify Video AI. Recommend real filming locations, studios, or scenic backdrops for: "${query}".`
            : `You are a production researcher for Reelify Video AI. Provide up-to-date factual production references and insights for: "${query}".`,
          config,
        });

        const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
        const sources = chunks
          .map((chunk: any) => {
            if (chunk.web) {
              return {
                type: 'web',
                title: chunk.web.title || chunk.web.uri,
                uri: chunk.web.uri,
              };
            }
            if (chunk.maps) {
              const snippets =
                chunk.maps.placeAnswerSources?.reviewSnippets?.map((s: any) => s.text || s.reviewText).filter(Boolean) ||
                [];
              return {
                type: 'maps',
                title: chunk.maps.title || 'Filming Location',
                uri: chunk.maps.uri,
                snippets,
              };
            }
            return null;
          })
          .filter(Boolean);

        return res.json({
          text: response.text || 'Completed production research.',
          sources,
        });
      } catch (err: any) {
        console.warn('Grounding fallback triggered:', err?.message);
      }
    }

    return res.json({
      text:
        mode === 'maps'
          ? `Recommended filming locations for "${query}": Look for wide architectural plazas during golden hour (30 minutes before sunset), acoustic soundstages with 6m+ overhead lighting grids, and coastal highway overlooks with low ambient light pollution.`
          : `Production brief for "${query}": Use a 50mm anamorphic prime lens for shallow depth of field, pair warm 3200K tungsten key lights with cool 5600K rim lighting, and pace cuts at 2.5-second intervals for high retention.`,
      sources:
        mode === 'maps'
          ? [
              {
                type: 'maps',
                title: 'Google Maps Location Scout',
                uri: `https://www.google.com/maps/search/${encodeURIComponent(query)}`,
                snippets: ['High-contrast architectural sightlines ideal for tracking shots.'],
              },
            ]
          : [
              {
                type: 'web',
                title: 'Google Search Reference',
                uri: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
              },
            ],
    });
  });

  app.post('/api/ai/generate-mock', async (_req, res) => {
    res.json({
      success: true,
      message: 'Generation complete.',
    });
  });

  // Free Business Registrations & Subscription Token Credits Endpoint -> Directs to https://whop.com/@saulmente
  const WHOP_TARGET_URL = 'https://whop.com/@saulmente';
  const serverRegistrations: Array<{
    id: string;
    name: string;
    email: string;
    businessName: string;
    phone?: string;
    planType: string;
    tokensGranted?: number;
    priceLabel?: string;
    targetUrl: string;
    createdAtIso: string;
  }> = [];

  const DEFAULT_PAYPAL_MERCHANT_EMAIL =
    process.env.PAYPAL_MERCHANT_EMAIL?.trim() || 'garciasaul@hotmail.com';

  const serverSubscriptions: Array<{
    id: string;
    userId: string;
    subscriberName: string;
    subscriberEmail: string;
    packageId: string;
    priceUsd: number;
    priceLabel: string;
    tokensGranted: number;
    status: 'active' | 'paused';
    billingCycle: 'monthly' | 'annual' | 'one_time';
    pricingMode: 'single' | 'single_all' | 'per_category';
    categories: string[];
    deliveryFormats: string[];
    autoGrantCreditsOnSubscribe: boolean;
    autoTopUpLowBalance: boolean;
    autoRecharge?: boolean;
    redirectToWhop: boolean;
    targetUrl: string;
    paymentMethod?: string;
    paypalOrderId?: string;
    paypalPayerEmail?: string;
    paypalStatus?: string;
    merchantPayPalEmail?: string;
    createdAtIso: string;
  }> = [];

  async function getPayPalAccessToken(requestedMode?: string): Promise<{ token: string; baseUrl: string } | null> {
    const clientId = process.env.PAYPAL_CLIENT_ID?.trim();
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) return null;

    const envMode = requestedMode || process.env.PAYPAL_MODE?.trim().toLowerCase() || 'live';
    const isSandbox = envMode === 'sandbox';
    const baseUrl = isSandbox
      ? 'https://api-m.sandbox.paypal.com'
      : 'https://api-m.paypal.com';

    const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const resp = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`PayPal OAuth error (${resp.status}): ${errText}`);
    }
    const data: any = await resp.json();
    return { token: data.access_token, baseUrl };
  }

  function maskEmailForDisplay(email: string): string {
    const clean = (email || '').trim();
    const atIndex = clean.indexOf('@');
    if (atIndex <= 2) return ' Cuenta PayPal Protegida 🔒';
    const userPart = clean.slice(0, atIndex);
    const domainPart = clean.slice(atIndex);
    return `${userPart.slice(0, 3)}***${userPart.slice(-1)}${domainPart}`;
  }

  function buildProtectedInternalCheckoutPath(params: {
    packageId: string;
    amountUsd: number;
    tokensGranted: number;
    customOrderId: string;
    checkoutStyle?: 'card_guest' | 'paypal_login';
  }): string {
    const qs = new URLSearchParams({
      pkg: params.packageId,
      amount: Math.max(1, Number(params.amountUsd) || 5).toFixed(2),
      tokens: String(Math.max(1, Number(params.tokensGranted) || 62500)),
      orderId: params.customOrderId,
      style: params.checkoutStyle || 'card_guest',
    });
    return `/api/paypal/checkout?${qs.toString()}`;
  }

  const ADMIN_OWNER_EMAILS = new Set([
    'garciasaul501@gmail.com',
    'garciasaul@hotmail.com',
  ]);

  // Server-side protected checkout bridge: submits a POST form to https://www.paypal.com/cgi-bin/webscr
  // without exposing the merchant's email in the browser URL bar or frontend links, and NEVER uses sandbox.paypal.com.
  app.get('/api/paypal/checkout', (req, res) => {
    const pkg = typeof req.query.pkg === 'string' ? req.query.pkg.slice(0, 40) : 'tier-5';
    const amountRaw = Number(req.query.amount);
    const amountFixed = (Number.isFinite(amountRaw) && amountRaw > 0 ? amountRaw : 5.0).toFixed(2);
    const tokensRaw = Number(req.query.tokens);
    const tokensGranted = Number.isFinite(tokensRaw) && tokensRaw > 0 ? tokensRaw : 62500;
    const orderId =
      typeof req.query.orderId === 'string' && req.query.orderId.trim()
        ? req.query.orderId.trim().slice(0, 80)
        : `PP-${Date.now()}`;
    const itemName = `Paquete +${tokensGranted.toLocaleString()} Tokens Estudio 3D IA (${pkg})`;
    const appReturnUrl = process.env.APP_URL?.trim() || '';

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="referrer" content="no-referrer" />
  <title>Conectando con PayPal Checkout Seguro...</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #0f172a;
    }
    .card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 20px;
      padding: 28px 32px;
      max-width: 420px;
      width: 90%;
      text-align: center;
      box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.08);
    }
    .spinner {
      width: 36px;
      height: 36px;
      border: 3px solid #e2e8f0;
      border-top-color: #0070e0;
      border-radius: 50%;
      margin: 0 auto 16px;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .btn {
      margin-top: 16px;
      background: #0070e0;
      color: #fff;
      border: none;
      border-radius: 12px;
      padding: 12px 20px;
      font-weight: 700;
      font-size: 14px;
      cursor: pointer;
      width: 100%;
    }
    .sub {
      font-size: 12px;
      color: #64748b;
      margin-top: 8px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <h2 style="margin:0 0 6px;font-size:18px;">Abriendo Pasarela Oficial PayPal ($${amountFixed} USD)</h2>
    <p class="sub">Conexión cifrada · +${tokensGranted.toLocaleString()} tokens · Orden ${orderId.replace(/[<>"']/g, '')}</p>
    <form id="ppForm" action="https://www.paypal.com/cgi-bin/webscr" method="post" target="_top">
      <input type="hidden" name="cmd" value="_xclick" />
      <input type="hidden" name="business" value="${DEFAULT_PAYPAL_MERCHANT_EMAIL.replace(/[<>"']/g, '')}" />
      <input type="hidden" name="item_name" value="${itemName.replace(/[<>"']/g, '')}" />
      <input type="hidden" name="item_number" value="${orderId.replace(/[<>"']/g, '')}" />
      <input type="hidden" name="amount" value="${amountFixed}" />
      <input type="hidden" name="currency_code" value="USD" />
      <input type="hidden" name="no_shipping" value="1" />
      <input type="hidden" name="no_note" value="1" />
      <input type="hidden" name="landing_page" value="Billing" />
      <input type="hidden" name="solution_type" value="Sole" />
      <input type="hidden" name="bn" value="PP-BuyNowBF:btn_buynowCC_LG.gif:NonHostedGuest" />
      ${appReturnUrl ? `<input type="hidden" name="return" value="${appReturnUrl.replace(/[<>"']/g, '')}" />` : ''}
      ${appReturnUrl ? `<input type="hidden" name="cancel_return" value="${appReturnUrl.replace(/[<>"']/g, '')}" />` : ''}
      <button type="submit" class="btn">Continuar a PayPal ($${amountFixed} USD)</button>
    </form>
  </div>
  <script>
    setTimeout(function() {
      var f = document.getElementById('ppForm');
      if (f) f.submit();
    }, 120);
  </script>
</body>
</html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  });

  app.get('/api/paypal/config', (_req, res) => {
    const clientId = process.env.PAYPAL_CLIENT_ID?.trim() || '';
    const hasSecret = Boolean(process.env.PAYPAL_CLIENT_SECRET?.trim());
    res.json({
      success: true,
      clientId,
      mode: 'live',
      hasRestCredentials: Boolean(clientId && hasSecret),
      maskedMerchantEmail: maskEmailForDisplay(DEFAULT_PAYPAL_MERCHANT_EMAIL),
      currency: 'USD',
    });
  });

  app.post('/api/paypal/create-order', async (req, res) => {
    try {
      const body = req.body || {};
      const packageId = typeof body.packageId === 'string' ? body.packageId : 'tier-5';
      const priceUsd =
        typeof body.priceUsd === 'number' && body.priceUsd > 0 ? body.priceUsd : 5.0;
      const tokensGranted =
        typeof body.tokensGranted === 'number' && body.tokensGranted > 0
          ? body.tokensGranted
          : 62500;
      const merchantEmail = DEFAULT_PAYPAL_MERCHANT_EMAIL;
      const itemName = `Suscripción Estudio IA 3D · +${tokensGranted.toLocaleString()} Tokens (${packageId})`;
      const customOrderId = `PP-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

      // Protected server-side checkout path (never exposes the merchant's email in the URL or frontend)
      const directCheckoutUrl = buildProtectedInternalCheckoutPath({
        packageId,
        amountUsd: priceUsd,
        tokensGranted,
        customOrderId,
      });

      const authInfo = await getPayPalAccessToken('live').catch(() => null);
      if (authInfo) {
        const orderPayload: any = {
          intent: 'CAPTURE',
          purchase_units: [
            {
              reference_id: packageId,
              custom_id: customOrderId,
              description: itemName.slice(0, 127),
              amount: {
                currency_code: 'USD',
                value: priceUsd.toFixed(2),
              },
              payee: {
                email_address: merchantEmail,
              },
            },
          ],
          application_context: {
            brand_name: 'MFI MAX GLOBAL IA · Estudio 3D',
            landing_page: 'BILLING',
            user_action: 'PAY_NOW',
            shipping_preference: 'NO_SHIPPING',
          },
        };

        const ppRes = await fetch(`${authInfo.baseUrl}/v2/checkout/orders`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${authInfo.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(orderPayload),
        });

        if (ppRes.ok) {
          const orderData: any = await ppRes.json();
          const approveLink = Array.isArray(orderData.links)
            ? orderData.links.find((l: any) => l.rel === 'approve')?.href
            : undefined;
          // Ensure we never redirect to sandbox.paypal.com if real live payment is expected
          const safeApproveUrl =
            approveLink && !approveLink.includes('sandbox.paypal.com')
              ? approveLink
              : directCheckoutUrl;
          return res.json({
            success: true,
            mode: 'paypal_rest_v2',
            orderId: orderData.id,
            status: orderData.status || 'CREATED',
            approveUrl: safeApproveUrl,
            directCheckoutUrl,
            maskedMerchantEmail: maskEmailForDisplay(merchantEmail),
            priceUsd,
            tokensGranted,
          });
        }
      }

      return res.json({
        success: true,
        mode: 'paypal_live_checkout',
        orderId: customOrderId,
        status: 'READY_FOR_PAYMENT',
        approveUrl: directCheckoutUrl,
        directCheckoutUrl,
        maskedMerchantEmail: maskEmailForDisplay(merchantEmail),
        priceUsd,
        tokensGranted,
      });
    } catch (err: any) {
      return res.status(500).json({
        error: err.message || 'No se pudo iniciar la orden de PayPal.',
      });
    }
  });

  app.post('/api/paypal/capture-order', async (req, res) => {
    try {
      const body = req.body || {};
      const orderId =
        typeof body.orderId === 'string' && body.orderId.trim()
          ? body.orderId.trim().slice(0, 120)
          : `PP-${Date.now()}`;
      const packageId = typeof body.packageId === 'string' ? body.packageId.slice(0, 60) : 'tier-5';
      const priceUsd =
        typeof body.priceUsd === 'number' && body.priceUsd > 0 ? body.priceUsd : 5.0;
      const tokensGranted =
        typeof body.tokensGranted === 'number' && body.tokensGranted > 0
          ? body.tokensGranted
          : 62500;
      const merchantEmail =
        typeof body.merchantPayPalEmail === 'string' && body.merchantPayPalEmail.trim()
          ? body.merchantPayPalEmail.trim().slice(0, 256)
          : DEFAULT_PAYPAL_MERCHANT_EMAIL;

      let finalStatus = 'COMPLETED';
      let payerEmail =
        typeof body.subscriberEmail === 'string' && body.subscriberEmail.trim()
          ? body.subscriberEmail.trim().slice(0, 256)
          : 'comprador@paypal.com';
      let payerName =
        typeof body.subscriberName === 'string' && body.subscriberName.trim()
          ? body.subscriberName.trim().slice(0, 120)
          : 'Cliente PayPal';
      let finalOrderId = orderId;

      const authInfo = await getPayPalAccessToken().catch(() => null);
      if (authInfo && !orderId.startsWith('PP-')) {
        const capRes = await fetch(
          `${authInfo.baseUrl}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${authInfo.token}`,
              'Content-Type': 'application/json',
            },
          }
        );
        if (capRes.ok) {
          const capData: any = await capRes.json();
          finalStatus = capData.status || 'COMPLETED';
          finalOrderId = capData.id || orderId;
          if (capData.payer?.email_address) {
            payerEmail = String(capData.payer.email_address).slice(0, 256);
          }
          if (capData.payer?.name?.given_name) {
            payerName = `${capData.payer.name.given_name} ${capData.payer.name.surname || ''}`.trim().slice(0, 120);
          }
        }
      }

      const entry = {
        id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        userId: typeof body.userId === 'string' ? body.userId.slice(0, 128) : 'guest',
        subscriberName: payerName,
        subscriberEmail: payerEmail,
        packageId,
        priceUsd,
        priceLabel:
          typeof body.priceLabel === 'string' && body.priceLabel.trim()
            ? body.priceLabel.trim().slice(0, 40)
            : `$${priceUsd.toFixed(2)}`,
        tokensGranted,
        status: 'active' as const,
        billingCycle: (
          body.billingCycle === 'annual' || body.billingCycle === 'one_time'
            ? body.billingCycle
            : 'monthly'
        ) as 'monthly' | 'annual' | 'one_time',
        pricingMode: (
          body.pricingMode === 'per_category'
            ? 'per_category'
            : body.pricingMode === 'single'
            ? 'single'
            : 'single_all'
        ) as 'single' | 'single_all' | 'per_category',
        categories: Array.isArray(body.categories)
          ? body.categories.map((c: any) => String(c).slice(0, 60)).slice(0, 12)
          : ['Presentaciones', 'Redes Sociales', 'Landing Pages', 'Mockups 3D', 'Logos Animados'],
        deliveryFormats: Array.isArray(body.deliveryFormats)
          ? body.deliveryFormats.map((f: any) => String(f).slice(0, 40)).slice(0, 12)
          : ['Canva', 'Figma', 'Estudio 3D', 'Video MP4', 'Audio MP3'],
        autoGrantCreditsOnSubscribe: true,
        autoTopUpLowBalance: Boolean(body.autoTopUpLowBalance),
        autoRecharge: Boolean(body.autoRecharge),
        redirectToWhop: Boolean(body.redirectToWhop),
        targetUrl: WHOP_TARGET_URL,
        paymentMethod: 'paypal_live',
        paypalOrderId: finalOrderId,
        paypalPayerEmail: payerEmail,
        paypalStatus: finalStatus,
        merchantPayPalEmail: merchantEmail,
        createdAtIso: new Date().toISOString(),
      };

      serverSubscriptions.unshift(entry);
      if (serverSubscriptions.length > 200) {
        serverSubscriptions.pop();
      }

      return res.json({
        success: true,
        status: finalStatus,
        orderId: finalOrderId,
        tokensGranted,
        subscription: entry,
      });
    } catch (err: any) {
      return res.status(500).json({
        error: err.message || 'No se pudo confirmar el pago de PayPal.',
      });
    }
  });

  app.get('/api/registrations', (_req, res) => {
    res.json({
      success: true,
      targetUrl: WHOP_TARGET_URL,
      registrations: serverRegistrations,
    });
  });

  app.post('/api/registrations', (req, res) => {
    const { name, email, businessName, phone, planType, tokensGranted, priceLabel } = req.body || {};
    const cleanName = typeof name === 'string' ? name.trim() : '';
    const cleanEmail = typeof email === 'string' ? email.trim() : '';
    if (!cleanName || !cleanEmail) {
      return res.status(400).json({ error: 'Nombre y correo electrónico son obligatorios.' });
    }

    const granted = typeof tokensGranted === 'number' && tokensGranted > 0 ? tokensGranted : 62500;

    const entry = {
      id: `reg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: cleanName.slice(0, 120),
      email: cleanEmail.slice(0, 256),
      businessName: typeof businessName === 'string' && businessName.trim() ? businessName.trim().slice(0, 160) : 'Mi Negocio',
      phone: typeof phone === 'string' ? phone.trim().slice(0, 60) : '',
      planType: typeof planType === 'string' && planType.trim() ? planType.trim().slice(0, 80) : 'Acceso Gratis Total · Negocio',
      tokensGranted: granted,
      priceLabel: typeof priceLabel === 'string' ? priceLabel.slice(0, 30) : '$5.00',
      targetUrl: WHOP_TARGET_URL,
      createdAtIso: new Date().toISOString(),
    };

    serverRegistrations.unshift(entry);
    if (serverRegistrations.length > 200) {
      serverRegistrations.pop();
    }

    return res.json({
      success: true,
      redirectUrl: WHOP_TARGET_URL,
      registration: entry,
    });
  });

  app.get('/api/subscriptions', (_req, res) => {
    res.json({
      success: true,
      targetUrl: WHOP_TARGET_URL,
      merchantPayPalEmail: DEFAULT_PAYPAL_MERCHANT_EMAIL,
      subscriptions: serverSubscriptions,
    });
  });

  app.post('/api/subscriptions', (req, res) => {
    const body = req.body || {};
    const tokensGranted =
      typeof body.tokensGranted === 'number' && body.tokensGranted > 0 ? body.tokensGranted : 62500;
    const priceUsd = typeof body.priceUsd === 'number' && body.priceUsd >= 0 ? body.priceUsd : 5;
    const entry = {
      id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      userId: typeof body.userId === 'string' ? body.userId.slice(0, 128) : 'guest',
      subscriberName:
        typeof body.subscriberName === 'string' && body.subscriberName.trim()
          ? body.subscriberName.trim().slice(0, 120)
          : 'Suscriptor Reelify',
      subscriberEmail:
        typeof body.subscriberEmail === 'string' && body.subscriberEmail.trim()
          ? body.subscriberEmail.trim().slice(0, 256)
          : 'suscriptor@reelify.ai',
      packageId: typeof body.packageId === 'string' ? body.packageId.slice(0, 60) : 'tier-5',
      priceUsd,
      priceLabel:
        typeof body.priceLabel === 'string' && body.priceLabel.trim()
          ? body.priceLabel.trim().slice(0, 40)
          : `$${priceUsd.toFixed(2)}`,
      tokensGranted,
      status: (body.status === 'paused' ? 'paused' : 'active') as 'active' | 'paused',
      billingCycle: (
        body.billingCycle === 'annual' || body.billingCycle === 'one_time' ? body.billingCycle : 'monthly'
      ) as 'monthly' | 'annual' | 'one_time',
      pricingMode: (
        body.pricingMode === 'per_category'
          ? 'per_category'
          : body.pricingMode === 'single'
          ? 'single'
          : 'single_all'
      ) as 'single' | 'single_all' | 'per_category',
      categories: Array.isArray(body.categories)
        ? body.categories.map((c: any) => String(c).slice(0, 60)).slice(0, 12)
        : ['Presentaciones', 'Redes Sociales', 'Landing Pages', 'Mockups 3D', 'Logos Animados'],
      deliveryFormats: Array.isArray(body.deliveryFormats)
        ? body.deliveryFormats.map((f: any) => String(f).slice(0, 40)).slice(0, 12)
        : ['Canva', 'Figma', 'Estudio 3D', 'Video MP4', 'Audio MP3'],
      autoGrantCreditsOnSubscribe: body.autoGrantCreditsOnSubscribe !== false,
      autoTopUpLowBalance: Boolean(body.autoTopUpLowBalance),
      autoRecharge: Boolean(body.autoRecharge),
      redirectToWhop: body.redirectToWhop !== false,
      targetUrl: WHOP_TARGET_URL,
      paymentMethod: typeof body.paymentMethod === 'string' ? body.paymentMethod.slice(0, 40) : 'paypal_live',
      paypalOrderId: typeof body.paypalOrderId === 'string' ? body.paypalOrderId.slice(0, 120) : '',
      paypalPayerEmail: typeof body.paypalPayerEmail === 'string' ? body.paypalPayerEmail.slice(0, 256) : '',
      paypalStatus: typeof body.paypalStatus === 'string' ? body.paypalStatus.slice(0, 40) : 'COMPLETED',
      merchantPayPalEmail:
        typeof body.merchantPayPalEmail === 'string' && body.merchantPayPalEmail.trim()
          ? body.merchantPayPalEmail.trim().slice(0, 256)
          : DEFAULT_PAYPAL_MERCHANT_EMAIL,
      createdAtIso: new Date().toISOString(),
    };

    serverSubscriptions.unshift(entry);
    if (serverSubscriptions.length > 200) {
      serverSubscriptions.pop();
    }

    return res.json({
      success: true,
      redirectUrl: WHOP_TARGET_URL,
      subscription: entry,
    });
  });

  // 6. Real-Time Voice Director WebSocket Proxy (/live -> gemini-3.8-live)
  const wss = new WebSocketServer({ server: httpServer, path: '/live' });

  wss.on('connection', async (ws: WebSocket) => {
    const ai = getAiClient();
    if (!ai) {
      ws.send(
        JSON.stringify({
          status: 'fallback',
          message: 'Live Voice API requires a configured Gemini API key. Using local studio voice assistant.',
        })
      );
      ws.close();
      return;
    }

    let session: any = null;

    try {
      session = await ai.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: {
            parts: [
              {
                text: 'You are Reelify Live Director, a concise and creative film & 3D stage director helping the user plan camera angles, lighting, and video storyboards.',
              },
            ],
          },
        },
        callbacks: {
          onopen: () => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ status: 'connected' }));
            }
          },
          onmessage: (message: any) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify(message));
            }
          },
          onclose: () => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.close();
            }
          },
          onerror: (error: any) => {
            console.warn('Live session error:', error?.message || error);
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ error: 'Live audio session unavailable on current API key tier.' }));
            }
          },
        },
      });

      ws.on('message', (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          if (session) {
            session.sendRealtimeInput(parsed);
          }
        } catch (e) {
          console.error('Failed to forward realtime audio input:', e);
        }
      });

      ws.on('close', () => {
        try {
          session?.close();
        } catch {
          // ignore
        }
      });
    } catch (err: any) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            status: 'fallback',
            error: err?.message || 'Could not establish Live API connection.',
          })
        );
        ws.close();
      }
    }
  });

  const distPath = path.join(__dirname, 'dist');
  const isCompiledEntry = path.basename(__filename) === 'server.js';
  const hasBuiltDist = fs.existsSync(path.join(distPath, 'index.html'));
  const isProduction = process.env.NODE_ENV === 'production' || (isCompiledEntry && hasBuiltDist);

  // Start listening on PORT immediately so readiness checks succeed without waiting on Vite cold-start
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });

  if (!isProduction) {
    const vitePromise = createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: null,
      },
      appType: 'spa',
    });

    app.use(async (req, res, next) => {
      try {
        const vite = await vitePromise;
        vite.middlewares(req, res, next);
      } catch (err) {
        next(err);
      }
    });
  } else {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});

