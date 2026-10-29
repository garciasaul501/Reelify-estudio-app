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

  // Free Business Registrations Endpoint -> Directs every registration to https://whop.com/@saulmente
  const WHOP_TARGET_URL = 'https://whop.com/@saulmente';
  const serverRegistrations: Array<{
    id: string;
    name: string;
    email: string;
    businessName: string;
    phone?: string;
    planType: string;
    targetUrl: string;
    createdAtIso: string;
  }> = [];

  app.get('/api/registrations', (_req, res) => {
    res.json({
      success: true,
      targetUrl: WHOP_TARGET_URL,
      registrations: serverRegistrations,
    });
  });

  app.post('/api/registrations', (req, res) => {
    const { name, email, businessName, phone, planType } = req.body || {};
    const cleanName = typeof name === 'string' ? name.trim() : '';
    const cleanEmail = typeof email === 'string' ? email.trim() : '';
    if (!cleanName || !cleanEmail) {
      return res.status(400).json({ error: 'Nombre y correo electrónico son obligatorios.' });
    }

    const entry = {
      id: `reg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: cleanName.slice(0, 120),
      email: cleanEmail.slice(0, 256),
      businessName: typeof businessName === 'string' && businessName.trim() ? businessName.trim().slice(0, 160) : 'Mi Negocio',
      phone: typeof phone === 'string' ? phone.trim().slice(0, 60) : '',
      planType: typeof planType === 'string' && planType.trim() ? planType.trim().slice(0, 80) : 'Acceso Gratis Total · Negocio',
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

  if (!isProduction) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: null,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
