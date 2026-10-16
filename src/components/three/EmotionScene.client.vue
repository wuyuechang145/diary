<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import type { DiaryCategory, DiaryPerspective } from '@/types/diary'

const props = withDefaults(
  defineProps<{
    emotion?: string
    perspective?: DiaryPerspective
    category?: DiaryCategory
    interactiveLabel?: string
    visualSeed?: number
    variant?: 'organic' | 'planetary'
    presentation?: 'hero' | 'inline'
  }>(),
  {
    emotion: 'calm',
    perspective: 'unspecified',
    category: 'unspecified',
    interactiveLabel: '今日心象星核。可拖动查看，按回车进入。',
    visualSeed: 2417,
    variant: 'planetary',
    presentation: 'inline',
  },
)

const emit = defineEmits<{
  enter: []
}>()

type EmotionVisual = {
  deep: number
  mid: number
  edge: number
  warm: number
  glow: number
  particle: number
  roughness: number
  speed: number
  breath: number
}

type AuroraOrbit = THREE.Mesh<THREE.TubeGeometry, THREE.MeshBasicMaterial>

type ParticleField = {
  points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>
  phases: Float32Array
  baseOpacity: number
  reducedOpacity: number
  speed: number
}

type PaletteColors = {
  mid: THREE.Color
  edge: THREE.Color
  warm: THREE.Color
}

const sceneHost = ref<HTMLDivElement | null>(null)
const fallbackVisible = ref(false)
const sceneReady = ref(false)
const isDragging = ref(false)

let renderer: THREE.WebGLRenderer | undefined
let scene: THREE.Scene | undefined
let camera: THREE.PerspectiveCamera | undefined
let core: THREE.Mesh<THREE.IcosahedronGeometry, THREE.ShaderMaterial> | undefined
let orbitGroup: THREE.Group | undefined
let innerGlow: THREE.Sprite | undefined
let outerGlow: THREE.Sprite | undefined
let glowTexture: THREE.CanvasTexture | undefined
let particleTexture: THREE.CanvasTexture | undefined
let atmosphere: THREE.Mesh<THREE.IcosahedronGeometry, THREE.ShaderMaterial> | undefined
let resizeObserver: ResizeObserver | undefined
let intersectionObserver: IntersectionObserver | undefined
let motionQuery: MediaQueryList | undefined
let frameId = 0
let startTime = 0
let pulseStartedAt = 0
let pointerStart = { x: 0, y: 0 }
let rotationStart = { x: 0, y: 0 }
let targetRotation = { x: -0.12, y: 0.2 }
let parallax = { x: 0, y: 0 }
let reducedMotion = false
let movedWhileDragging = false
let sceneVisible = true
let pageVisible = true
let isCompactScene = false
const auroraOrbits: AuroraOrbit[] = []
const particleFields: ParticleField[] = []
const isPlanetary = props.variant === 'planetary'

function cameraDistance() {
  if (!isPlanetary) return 7.1
  if (isCompactScene) return 9.7
  return props.presentation === 'hero' ? 12.1 : 8.25
}

const vertexShader = `
  uniform float uTime;
  uniform float uBreath;
  uniform float uRoughness;
  uniform float uSpeed;
  uniform float uPulse;
  uniform float uPlanetary;
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vViewPosition;
  varying float vDisplacement;

  float organicWave(vec3 p) {
    float t = uTime * uSpeed;
    float a = sin(p.x * 3.2 + t * 0.46);
    float b = sin(p.y * 4.1 - t * 0.34);
    float c = sin(p.z * 3.7 + t * 0.28);
    float d = sin((p.x + p.y + p.z) * 5.0 - t * 0.22);
    float flowingBand = sin(p.y * 7.2 + p.x * 2.4 - t * 0.72) * mix(0.016, 0.006, uPlanetary);
    float organicSurface = ((a + b + c) * 0.045 + d * 0.025) * uRoughness;
    return organicSurface * mix(1.0, 0.28, uPlanetary) + flowingBand;
  }

  void main() {
    float wave = organicWave(position);
    float breath = sin(uTime * 1.05) * uBreath;
    float pulseEnabled = step(0.0, uPulse);
    float pulseEnvelope = sin(clamp(uPulse, 0.0, 1.0) * 3.14159265) * pulseEnabled;
    float pulseWave = pulseEnvelope * (0.025 + 0.025 * sin(length(position.xy) * 9.0));
    vDisplacement = wave + breath + pulseWave;

    vec3 transformed = position + normal * vDisplacement;
    vec4 viewPosition = modelViewMatrix * vec4(transformed, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vPosition = transformed;
    vViewPosition = -viewPosition.xyz;
    gl_Position = projectionMatrix * viewPosition;
  }
`

const fragmentShader = `
  uniform float uTime;
  uniform float uPulse;
  uniform float uPlanetary;
  uniform vec3 uDeep;
  uniform vec3 uMid;
  uniform vec3 uEdge;
  uniform vec3 uWarm;
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vViewPosition;
  varying float vDisplacement;

  void main() {
    vec3 viewDirection = normalize(vViewPosition);
    float viewAngle = clamp(dot(normalize(vNormal), viewDirection), 0.0, 1.0);
    float fresnel = pow(1.0 - viewAngle, 2.15);
    float latitude = vPosition.y * 0.34 + sin(vPosition.x * 2.2 + uTime * 0.12) * 0.12;
    float flow = 0.5 + 0.5 * sin(vPosition.y * 6.3 + vPosition.x * 2.7 - uTime * 0.42);
    float crossFlow = 0.5 + 0.5 * sin(vPosition.z * 5.4 - vPosition.y * 2.1 + uTime * 0.27);

    vec3 color = mix(uDeep, uMid, smoothstep(-0.48, 0.46, latitude));
    color = mix(color, uEdge, flow * 0.20 + crossFlow * 0.10);
    vec3 auroraInterior = mix(uMid, uEdge, flow);
    auroraInterior = mix(auroraInterior, uWarm, crossFlow * 0.34);
    color = mix(color, auroraInterior, 0.14 + crossFlow * 0.12);

    float planetBand = 0.5 + 0.5 * sin(vPosition.y * 10.5 + sin(vPosition.x * 2.2) * 0.75 - uTime * 0.12);
    float cloudBand = smoothstep(0.28, 0.88, planetBand) * (0.48 + crossFlow * 0.52);
    vec3 planetaryColor = mix(uDeep, uMid, smoothstep(-0.62, 0.58, vPosition.y));
    planetaryColor = mix(planetaryColor, uEdge, cloudBand * 0.34);
    planetaryColor = mix(planetaryColor, uWarm, smoothstep(0.76, 1.0, crossFlow) * 0.14);
    color = mix(color, planetaryColor, uPlanetary * 0.78);

    float film = 0.5 + 0.5 * sin(fresnel * 15.0 + flow * 4.2 + uTime * 0.16);
    vec3 iridescence = mix(uEdge, uWarm, film);
    iridescence = mix(iridescence, uMid, 0.5 + 0.5 * sin(film * 5.8 + vPosition.z * 2.0));
    color = mix(color, iridescence, fresnel * 0.72);

    float innerWarmth = 1.0 - smoothstep(0.18, 1.5, length(vPosition.xy - vec2(0.18, 0.06)));
    color = mix(color, uWarm, innerWarmth * (0.31 + max(vDisplacement, 0.0) * 0.75));

    float pulseEnabled = step(0.0, uPulse);
    float pulseProgress = clamp(uPulse, 0.0, 1.0);
    float pulseRadius = mix(0.08, 1.18, pulseProgress);
    float radial = length(vPosition.xy) / 1.42;
    float pulseRing = (1.0 - smoothstep(0.0, 0.105, abs(radial - pulseRadius)))
      * (1.0 - pulseProgress) * pulseEnabled;
    color = mix(color, mix(uWarm, uEdge, 0.58), pulseRing * 0.88);

    float thinFilmRim = pow(fresnel, 1.42) * (0.55 + film * 0.55);
    vec3 lightDirection = normalize(vec3(-0.62, 0.48, 0.82));
    float sunlight = max(dot(normalize(vNormal), lightDirection), 0.0);
    float planetaryLight = 0.40 + sunlight * 0.88;
    float light = 0.56 + thinFilmRim + innerWarmth * 0.24 + max(vDisplacement, 0.0) * 1.15 + pulseRing * 1.45;
    light *= mix(1.0, planetaryLight, uPlanetary * 0.72);
    color += uEdge * pow(fresnel, 2.1) * uPlanetary * 0.52;
    gl_FragColor = vec4(color * light, 1.0);
  }
`

const atmosphereVertexShader = `
  varying vec3 vNormal;
  varying vec3 vViewPosition;

  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewPosition = -viewPosition.xyz;
    gl_Position = projectionMatrix * viewPosition;
  }
`

const atmosphereFragmentShader = `
  uniform vec3 uColor;
  varying vec3 vNormal;
  varying vec3 vViewPosition;

  void main() {
    vec3 viewDirection = normalize(vViewPosition);
    float rim = pow(1.0 - clamp(dot(normalize(vNormal), viewDirection), 0.0, 1.0), 2.6);
    float alpha = smoothstep(0.08, 0.92, rim) * 0.52;
    gl_FragColor = vec4(uColor * (0.72 + rim * 0.92), alpha);
  }
`

const emotionVisuals: Record<string, EmotionVisual> = {
  calm: {
    deep: 0x17133f,
    mid: 0x6944d6,
    edge: 0x42c6cf,
    warm: 0xed655d,
    glow: 0x6f5bd8,
    particle: 0xaadfe1,
    roughness: 0.82,
    speed: 0.82,
    breath: 0.052,
  },
  gentle: {
    deep: 0x31153f,
    mid: 0xbe4f82,
    edge: 0xf19a82,
    warm: 0xff745f,
    glow: 0xbd5d86,
    particle: 0xf4c1b0,
    roughness: 0.72,
    speed: 0.72,
    breath: 0.064,
  },
  longing: {
    deep: 0x11134a,
    mid: 0x6841c9,
    edge: 0x9581ee,
    warm: 0xd35c8d,
    glow: 0x7256d9,
    particle: 0xc3b9f4,
    roughness: 0.94,
    speed: 0.66,
    breath: 0.048,
  },
  courage: {
    deep: 0x10383a,
    mid: 0x1f8981,
    edge: 0x79e0c4,
    warm: 0xff8769,
    glow: 0x2f9f92,
    particle: 0xc6f1df,
    roughness: 0.88,
    speed: 0.95,
    breath: 0.058,
  },
  tension: {
    deep: 0x32132d,
    mid: 0x74307b,
    edge: 0xe26f8c,
    warm: 0xff7257,
    glow: 0xa43f70,
    particle: 0xefb3c8,
    roughness: 1.35,
    speed: 1.22,
    breath: 0.036,
  },
  sadness: {
    deep: 0x0b1c3d,
    mid: 0x334b86,
    edge: 0x6fa7c7,
    warm: 0x8e6fae,
    glow: 0x365984,
    particle: 0x91afc3,
    roughness: 0.68,
    speed: 0.52,
    breath: 0.032,
  },
}

const perspectiveGlowColors: Partial<Record<DiaryPerspective, number>> = {
  teen: 0x5779ed,
  parent: 0xe96f64,
  family: 0x3f9f93,
}

type OrbitTopology = readonly [number, number, number, number, number]

const categoryTopologies: Record<DiaryCategory, readonly OrbitTopology[]> = {
  unspecified: [
    [1.08, -0.18, 1, 1, 1],
    [0.84, 0.42, 1, 1, 1],
    [1.34, 0.72, 1, 1, 1],
    [1.16, -0.61, 1, 1, 1],
  ],
  'daily-life': [
    [0.98, -0.12, 1.02, 1, 1.02],
    [0.78, 0.31, 0.98, 1, 0.98],
    [1.22, 0.58, 1, 1, 1],
    [1.04, -0.48, 1.01, 1, 1.01],
  ],
  'growth-conflict': [
    [1.34, -0.46, 1.03, 0.92, 0.96],
    [0.58, 0.82, 0.94, 1.08, 1.04],
    [1.49, 0.16, 1.06, 0.9, 0.94],
    [0.91, -0.94, 0.95, 1.05, 1.05],
  ],
  pressure: [
    [1.16, -0.14, 1.04, 0.72, 0.88],
    [1.02, 0.28, 0.98, 0.68, 0.84],
    [1.31, 0.49, 1.02, 0.75, 0.9],
    [1.21, -0.45, 0.97, 0.7, 0.86],
  ],
  communication: [
    [1.03, -0.34, 1.06, 1, 0.94],
    [1.03, 0.34, 1.06, 1, 0.94],
    [1.35, 0.65, 0.96, 1, 1.04],
    [1.35, -0.65, 0.96, 1, 1.04],
  ],
  'expectation-responsibility': [
    [1.12, -0.22, 1.13, 0.92, 0.82],
    [0.82, 0.46, 1.1, 0.96, 0.84],
    [1.37, 0.7, 1.08, 0.9, 0.86],
    [1.18, -0.63, 1.12, 0.94, 0.8],
  ],
  'understanding-gratitude': [
    [0.91, -0.15, 1.08, 1.04, 1.08],
    [0.74, 0.27, 1.04, 1.02, 1.05],
    [1.18, 0.5, 1.06, 1.03, 1.06],
    [0.99, -0.42, 1.07, 1.04, 1.07],
  ],
}

function applyCategoryTopology() {
  const topology = categoryTopologies[props.category]
  auroraOrbits.forEach((orbit, index) => {
    if (orbit.userData.lockTopology) return
    const transform = topology[index] ?? categoryTopologies.unspecified[index]
    if (!transform) return
    orbit.rotation.x = isPlanetary ? 1.22 + (transform[0] - 1.08) * 0.38 : transform[0]
    orbit.rotation.z = isPlanetary ? transform[1] * 0.58 : transform[1]
    orbit.scale.set(transform[2], transform[3], transform[4])
  })
  requestSceneFrame()
}

function applyPerspectiveGlow(visual: EmotionVisual) {
  if (!outerGlow) return
  outerGlow.material.color.setHex(perspectiveGlowColors[props.perspective] ?? visual.glow)
}

function seededRandom(seed: number) {
  let value = seed >>> 0
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0
    return value / 4294967296
  }
}

function createPalette(visual: EmotionVisual, particles = false): PaletteColors {
  return {
    mid: new THREE.Color(particles ? visual.particle : visual.mid),
    edge: new THREE.Color(visual.edge),
    warm: new THREE.Color(visual.warm),
  }
}

function mixPalette(target: THREE.Color, palette: PaletteColors, phase: number) {
  const cycle = ((phase % 1) + 1) % 1
  if (cycle < 0.48) return target.copy(palette.mid).lerp(palette.edge, cycle / 0.48)
  if (cycle < 0.82) return target.copy(palette.edge).lerp(palette.warm, (cycle - 0.48) / 0.34)
  return target.copy(palette.warm).lerp(palette.mid, (cycle - 0.82) / 0.18)
}

function updateAuroraColors(orbit: AuroraOrbit, palette: PaletteColors) {
  const phaseOffset = Number(orbit.userData.phaseOffset ?? 0)
  orbit.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    const positions = object.geometry.getAttribute('position')
    const colors = object.geometry.getAttribute('color') as THREE.BufferAttribute | undefined
    if (!positions || !colors) return
    const color = new THREE.Color()
    for (let index = 0; index < positions.count; index += 1) {
      const angle = Math.atan2(positions.getZ(index), positions.getX(index)) / (Math.PI * 2)
      mixPalette(color, palette, angle + phaseOffset)
      colors.setXYZ(index, color.r, color.g, color.b)
    }
    colors.needsUpdate = true
  })
}

function updateParticleColors(field: ParticleField, palette: PaletteColors) {
  const colors = field.points.geometry.getAttribute('color') as THREE.BufferAttribute
  const color = new THREE.Color()
  for (let index = 0; index < colors.count; index += 1) {
    mixPalette(color, palette, field.phases[index] ?? 0)
    colors.setXYZ(index, color.r, color.g, color.b)
  }
  colors.needsUpdate = true
}

function applyEmotion() {
  const visual = emotionVisuals[props.emotion] ?? emotionVisuals.calm!
  const auroraPalette = createPalette(visual)
  const particlePalette = createPalette(visual, true)
  if (core) {
    const uniforms = core.material.uniforms
    uniforms.uDeep!.value.setHex(visual.deep)
    uniforms.uMid!.value.setHex(visual.mid)
    uniforms.uEdge!.value.setHex(visual.edge)
    uniforms.uWarm!.value.setHex(visual.warm)
    uniforms.uRoughness!.value = visual.roughness
    uniforms.uSpeed!.value = visual.speed
    uniforms.uBreath!.value = reducedMotion ? 0 : visual.breath
  }
  if (atmosphere) atmosphere.material.uniforms.uColor!.value.setHex(visual.edge)
  applyPerspectiveGlow(visual)
  if (innerGlow) innerGlow.material.color.setHex(visual.warm)
  auroraOrbits.forEach((orbit) => updateAuroraColors(orbit, auroraPalette))
  particleFields.forEach((field) => {
    field.points.material.opacity = reducedMotion ? field.reducedOpacity : field.baseOpacity
    updateParticleColors(field, particlePalette)
  })
  applyCategoryTopology()
  requestSceneFrame()
}

function createAuroraOrbit(
  radiusX: number,
  radiusY: number,
  tiltX: number,
  tiltZ: number,
  opacity: number,
  thickness: number,
  phaseOffset: number,
) {
  const controlPoints: THREE.Vector3[] = []
  const controlCount = isCompactScene ? 36 : 48
  for (let index = 0; index < controlCount; index += 1) {
    const angle = (index / controlCount) * Math.PI * 2
    const ripple = 1 + Math.sin(angle * 3 + phaseOffset * 9) * 0.018
    controlPoints.push(new THREE.Vector3(
      Math.cos(angle) * radiusX * ripple,
      Math.sin(angle * 2 + phaseOffset * 5) * 0.025,
      Math.sin(angle) * radiusY * ripple,
    ))
  }
  const curve = new THREE.CatmullRomCurve3(controlPoints, true, 'centripetal')
  const tubularSegments = reducedMotion ? 64 : isCompactScene ? 96 : 144
  const radialSegments = reducedMotion ? 3 : isCompactScene ? 4 : 5
  const geometry = new THREE.TubeGeometry(
    curve,
    tubularSegments,
    isPlanetary ? thickness * 0.78 : thickness,
    radialSegments,
    true,
  )
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geometry.getAttribute('position').count * 3), 3))
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: isPlanetary ? Math.min(0.96, opacity * 1.38) : opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const orbit = new THREE.Mesh(geometry, material)
  orbit.rotation.x = tiltX
  orbit.rotation.z = tiltZ
  orbit.userData.phaseOffset = phaseOffset
  if (isPlanetary) {
    const haloGeometry = new THREE.TubeGeometry(
      curve,
      tubularSegments,
      thickness * 3.6,
      Math.max(3, radialSegments - 1),
      true,
    )
    haloGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(haloGeometry.getAttribute('position').count * 3), 3))
    const haloMaterial = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: Math.min(0.28, opacity * 0.42),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    orbit.add(new THREE.Mesh(haloGeometry, haloMaterial))
  }
  auroraOrbits.push(orbit)
  return orbit
}

function createParticleField(options: {
  count: number
  minRadius: number
  radiusSpread: number
  height: number
  depthScale: number
  size: number
  opacity: number
  reducedOpacity: number
  speed: number
  seedOffset: number
}) {
  const random = seededRandom(props.visualSeed + options.seedOffset)
  const positions = new Float32Array(options.count * 3)
  const colors = new Float32Array(options.count * 3)
  const phases = new Float32Array(options.count)
  for (let index = 0; index < options.count; index += 1) {
    const radius = options.minRadius + random() * options.radiusSpread
    const angle = random() * Math.PI * 2
    positions[index * 3] = Math.cos(angle) * radius
    positions[index * 3 + 1] = (random() - 0.5) * options.height
    positions[index * 3 + 2] = Math.sin(angle) * radius * options.depthScale
    phases[index] = random()
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    vertexColors: true,
    size: options.size,
    transparent: true,
    opacity: reducedMotion ? options.reducedOpacity : options.opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
    map: particleTexture,
    alphaTest: 0.018,
  })
  const points = new THREE.Points(geometry, material)
  const field: ParticleField = {
    points,
    phases,
    baseOpacity: options.opacity,
    reducedOpacity: options.reducedOpacity,
    speed: options.speed,
  }
  particleFields.push(field)
  scene?.add(points)
}

function createGlowTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const context = canvas.getContext('2d')
  if (context) {
    const gradient = context.createRadialGradient(128, 128, 5, 128, 128, 126)
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.92)')
    gradient.addColorStop(0.14, 'rgba(255, 255, 255, 0.48)')
    gradient.addColorStop(0.42, 'rgba(255, 255, 255, 0.16)')
    gradient.addColorStop(0.72, 'rgba(255, 255, 255, 0.045)')
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, 256, 256)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function createParticleTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 96
  canvas.height = 96
  const context = canvas.getContext('2d')
  if (context) {
    const gradient = context.createRadialGradient(48, 48, 0, 48, 48, 47)
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)')
    gradient.addColorStop(0.12, 'rgba(255, 255, 255, 0.98)')
    gradient.addColorStop(0.34, 'rgba(255, 255, 255, 0.56)')
    gradient.addColorStop(0.68, 'rgba(255, 255, 255, 0.12)')
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, 96, 96)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function buildScene() {
  const host = sceneHost.value
  if (!host) return

  try {
    isCompactScene = window.innerWidth < 720
    renderer = new THREE.WebGLRenderer({
      antialias: !isCompactScene,
      alpha: true,
      powerPreference: 'high-performance',
    })
    renderer.setClearColor(0x000000, 0)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = isPlanetary ? 1.28 : 1.08
    host.appendChild(renderer.domElement)

    scene = new THREE.Scene()
    camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100)
    camera.position.set(0, 0, cameraDistance())

    const coreGeometry = new THREE.IcosahedronGeometry(1.42, reducedMotion ? 3 : isCompactScene ? 4 : 5)
    const coreMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uPulse: { value: -1 },
        uPlanetary: { value: isPlanetary ? 1 : 0 },
        uBreath: { value: reducedMotion ? 0 : 0.052 },
        uRoughness: { value: 0.82 },
        uSpeed: { value: 0.82 },
        uDeep: { value: new THREE.Color(0x17133f) },
        uMid: { value: new THREE.Color(0x6944d6) },
        uEdge: { value: new THREE.Color(0x42c6cf) },
        uWarm: { value: new THREE.Color(0xed655d) },
      },
      transparent: !isPlanetary,
    })
    core = new THREE.Mesh(coreGeometry, coreMaterial)
    core.rotation.set(targetRotation.x, targetRotation.y, -0.1)
    if (isPlanetary) core.scale.setScalar(1.04)
    scene.add(core)

    if (isPlanetary) {
      const atmosphereMaterial = new THREE.ShaderMaterial({
        vertexShader: atmosphereVertexShader,
        fragmentShader: atmosphereFragmentShader,
        uniforms: {
          uColor: { value: new THREE.Color(0x42c6cf) },
        },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
      })
      atmosphere = new THREE.Mesh(coreGeometry.clone(), atmosphereMaterial)
      atmosphere.scale.setScalar(1.055)
      core.add(atmosphere)
    }

    glowTexture = createGlowTexture()
    particleTexture = createParticleTexture()
    const outerGlowMaterial = new THREE.SpriteMaterial({
      map: glowTexture,
      color: 0x6f5bd8,
      transparent: true,
      opacity: reducedMotion ? 0.25 : 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    outerGlow = new THREE.Sprite(outerGlowMaterial)
    outerGlow.scale.set(isPlanetary ? 6.4 : 6.45, isPlanetary ? 6.4 : 6.45, 1)
    outerGlow.position.z = -0.62
    scene.add(outerGlow)

    const innerGlowMaterial = new THREE.SpriteMaterial({
      map: glowTexture,
      color: 0xed655d,
      transparent: true,
      opacity: reducedMotion ? 0.24 : isPlanetary ? 0.46 : 0.38,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    innerGlow = new THREE.Sprite(innerGlowMaterial)
    innerGlow.scale.set(isPlanetary ? 3.86 : 3.72, isPlanetary ? 3.86 : 3.72, 1)
    innerGlow.position.set(0.12, 0.04, -0.18)
    scene.add(innerGlow)

    orbitGroup = new THREE.Group()
    const orbitCount = reducedMotion ? 2 : isCompactScene ? 3 : 4
    const orbitDefinitions = isPlanetary
      ? [
          [2.34, 1.84, 1.22, -0.16, 0.62, 0.018, 0.03],
          [2.64, 2.08, 1.30, 0.18, 0.40, 0.012, 0.31],
          [2.08, 1.62, 1.10, 0.52, 0.48, 0.014, 0.59],
          [2.92, 2.31, 1.34, -0.34, 0.27, 0.009, 0.81],
        ] as const
      : [
          [2.18, 1.48, 1.08, -0.18, 0.47, 0.014, 0.03],
          [2.55, 1.72, 0.84, 0.42, 0.21, 0.009, 0.31],
          [1.95, 1.35, 1.34, 0.72, 0.29, 0.011, 0.59],
          [2.78, 1.92, 1.16, -0.61, 0.13, 0.007, 0.81],
        ] as const
    orbitDefinitions.slice(0, orbitCount).forEach((definition) => {
      orbitGroup?.add(createAuroraOrbit(
        definition[0],
        definition[1],
        definition[2],
        definition[3],
        definition[4],
        definition[5],
        definition[6],
      ))
    })
    if (isPlanetary) {
      const equatorialOrbit = createAuroraOrbit(
        2.74,
        2.24,
        0.32,
        -0.045,
        0.76,
        0.021,
        0.17,
      )
      equatorialOrbit.userData.lockTopology = true
      equatorialOrbit.userData.primaryEquatorialOrbit = true
      orbitGroup.add(equatorialOrbit)
    }
    scene.add(orbitGroup)

    const nearCount = reducedMotion ? 72 : isCompactScene ? (isPlanetary ? 460 : 360) : (isPlanetary ? 1160 : 880)
    const farCount = reducedMotion ? 42 : isCompactScene ? (isPlanetary ? 260 : 180) : (isPlanetary ? 760 : 560)
    createParticleField({
      count: nearCount,
      minRadius: 1.86,
      radiusSpread: 1.34,
      height: 2.45,
      depthScale: 0.66,
      size: isCompactScene ? (isPlanetary ? 0.028 : 0.021) : (isPlanetary ? 0.034 : 0.026),
      opacity: isPlanetary ? 0.86 : 0.62,
      reducedOpacity: 0.30,
      speed: -0.016,
      seedOffset: 19,
    })
    createParticleField({
      count: farCount,
      minRadius: 2.95,
      radiusSpread: 1.55,
      height: 3.55,
      depthScale: 0.72,
      size: isCompactScene ? (isPlanetary ? 0.017 : 0.012) : (isPlanetary ? 0.021 : 0.015),
      opacity: isPlanetary ? 0.52 : 0.34,
      reducedOpacity: 0.18,
      speed: 0.007,
      seedOffset: 71,
    })
    if (isPlanetary && !reducedMotion) {
      createParticleField({
        count: isCompactScene ? 110 : 240,
        minRadius: 2.02,
        radiusSpread: 0.92,
        height: 1.28,
        depthScale: 0.72,
        size: isCompactScene ? 0.042 : 0.052,
        opacity: 0.94,
        reducedOpacity: 0.34,
        speed: 0.026,
        seedOffset: 137,
      })
    }

    applyEmotion()

    resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(host)
    intersectionObserver = new IntersectionObserver(([entry]) => {
      sceneVisible = Boolean(entry?.isIntersecting)
      requestSceneFrame()
    }, { threshold: 0.01 })
    intersectionObserver.observe(host)
    resize()
    startTime = performance.now()
    requestSceneFrame()
  } catch (error) {
    console.warn('WebGL 不可用，已切换到静态心象。', error)
    fallbackVisible.value = true
  }
}

function resize() {
  const host = sceneHost.value
  if (!host || !renderer || !camera) return
  const { width, height } = host.getBoundingClientRect()
  if (!width || !height) return
  const dprCap = isCompactScene ? 1.25 : 1.75
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, dprCap))
  renderer.setSize(width, height, false)
  camera.aspect = width / height
  if (isPlanetary) {
    // Keep the complete ring system inside narrow editor and reader panels.
    const verticalHalfAngle = THREE.MathUtils.degToRad(camera.fov / 2)
    const ringFitDistance = 3.04 / (Math.tan(verticalHalfAngle) * camera.aspect)
    camera.position.z = Math.max(cameraDistance(), ringFitDistance)
  }
  camera.updateProjectionMatrix()
  requestSceneFrame()
}

function shouldContinueRendering() {
  return pageVisible && sceneVisible && (!reducedMotion || isDragging.value || pulseStartedAt > 0)
}

function requestSceneFrame() {
  if (frameId || !renderer || !scene || !camera || !core || !pageVisible || !sceneVisible) return
  frameId = requestAnimationFrame(render)
}

function render(now: number) {
  frameId = 0
  if (!renderer || !scene || !camera || !core) return
  const elapsed = reducedMotion ? 0 : (now - startTime) / 1000
  const pulseProgress = pulseStartedAt > 0 ? Math.min((now - pulseStartedAt) / 820, 1) : -1
  const rotationResponse = isPlanetary && isDragging.value ? 0.18 : 0.055
  core.material.uniforms.uTime!.value = elapsed
  core.material.uniforms.uPulse!.value = pulseProgress
  core.rotation.x += (targetRotation.x + parallax.y * 0.12 - core.rotation.x) * rotationResponse
  core.rotation.y += (targetRotation.y + parallax.x * 0.16 - core.rotation.y) * rotationResponse

  if (!reducedMotion && !isDragging.value) targetRotation.y += 0.0011
  if (orbitGroup && !reducedMotion) {
    orbitGroup.rotation.y = elapsed * 0.028 + parallax.x * 0.06
    orbitGroup.rotation.z = Math.sin(elapsed * 0.12) * 0.025
  }
  if (!reducedMotion) {
    particleFields.forEach((field, index) => {
      field.points.rotation.y = elapsed * field.speed
      field.points.rotation.x = (index === 0 ? 0.18 : -0.12) + Math.sin(elapsed * 0.08 + index) * 0.018
      if (isPlanetary) {
        field.points.material.opacity = field.baseOpacity * (0.88 + Math.sin(elapsed * (0.72 + index * 0.19) + index * 1.7) * 0.12)
      }
    })
  }

  const pulseEnvelope = pulseProgress >= 0 ? Math.sin(pulseProgress * Math.PI) * (1 - pulseProgress * 0.35) : 0
  if (outerGlow) {
    const scaleX = (isPlanetary ? 6.4 : 6.45) + pulseEnvelope * 0.72
    const scaleY = (isPlanetary ? 6.4 : 6.45) + pulseEnvelope * 0.72
    outerGlow.scale.set(scaleX, scaleY, 1)
    outerGlow.material.opacity = (reducedMotion ? 0.25 : isPlanetary ? 0.40 : 0.34) + pulseEnvelope * 0.16
  }
  if (innerGlow) {
    const scaleX = (isPlanetary ? 3.86 : 3.72) + pulseEnvelope * 0.32
    const scaleY = (isPlanetary ? 3.86 : 3.72) + pulseEnvelope * 0.32
    innerGlow.scale.set(scaleX, scaleY, 1)
    innerGlow.material.opacity = (reducedMotion ? 0.24 : isPlanetary ? 0.46 : 0.38) + pulseEnvelope * 0.20
  }

  renderer.render(scene, camera)
  sceneReady.value = true
  if (pulseProgress >= 1 || reducedMotion) {
    pulseStartedAt = 0
    core.material.uniforms.uPulse!.value = -1
  }
  if (shouldContinueRendering()) requestSceneFrame()
}

function triggerResonance() {
  pulseStartedAt = performance.now()
  requestSceneFrame()
}

function enterScene() {
  triggerResonance()
  emit('enter')
}

function handlePointerMove(event: PointerEvent) {
  const host = sceneHost.value
  if (!host) return
  const bounds = host.getBoundingClientRect()
  if (!reducedMotion) {
    parallax.x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2
    parallax.y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2
  }
  if (!isDragging.value) return

  const deltaX = event.clientX - pointerStart.x
  const deltaY = event.clientY - pointerStart.y
  if (Math.abs(deltaX) + Math.abs(deltaY) > 5) movedWhileDragging = true
  const horizontalSensitivity = isPlanetary ? 0.016 : 0.008
  const verticalSensitivity = isPlanetary ? 0.011 : 0.006
  const verticalLimit = isPlanetary ? 1.08 : 0.8
  targetRotation.y = rotationStart.y + deltaX * horizontalSensitivity
  targetRotation.x = Math.max(
    -verticalLimit,
    Math.min(verticalLimit, rotationStart.x + deltaY * verticalSensitivity),
  )
  requestSceneFrame()
}

function handlePointerDown(event: PointerEvent) {
  isDragging.value = true
  movedWhileDragging = false
  pointerStart = { x: event.clientX, y: event.clientY }
  rotationStart = { ...targetRotation }
  sceneHost.value?.setPointerCapture(event.pointerId)
  requestSceneFrame()
}

function handlePointerUp(event: PointerEvent) {
  isDragging.value = false
  if (sceneHost.value?.hasPointerCapture(event.pointerId)) sceneHost.value.releasePointerCapture(event.pointerId)
  if (!movedWhileDragging) enterScene()
  requestSceneFrame()
}

function handlePointerCancel(event: PointerEvent) {
  isDragging.value = false
  if (sceneHost.value?.hasPointerCapture(event.pointerId)) sceneHost.value.releasePointerCapture(event.pointerId)
  requestSceneFrame()
}

function handleVisibilityChange() {
  pageVisible = !document.hidden
  requestSceneFrame()
}

function handleMotionPreference(event: MediaQueryListEvent) {
  reducedMotion = event.matches
  pulseStartedAt = 0
  if (core) core.material.uniforms.uPulse!.value = -1
  applyEmotion()
}

function disposeScene() {
  cancelAnimationFrame(frameId)
  frameId = 0
  resizeObserver?.disconnect()
  intersectionObserver?.disconnect()
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  motionQuery?.removeEventListener('change', handleMotionPreference)
  scene?.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line) {
      object.geometry?.dispose()
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      materials.forEach((material) => material.dispose())
    }
    if (object instanceof THREE.Sprite) object.material.dispose()
  })
  glowTexture?.dispose()
  particleTexture?.dispose()
  renderer?.dispose()
  renderer?.domElement.remove()
  auroraOrbits.length = 0
  particleFields.length = 0
}

onMounted(() => {
  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  reducedMotion = motionQuery.matches
  pageVisible = !document.hidden
  motionQuery.addEventListener('change', handleMotionPreference)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  buildScene()
})

onBeforeUnmount(disposeScene)

watch(() => props.emotion, applyEmotion)
watch(() => props.perspective, applyEmotion)
watch(() => props.category, applyCategoryTopology)
</script>

<template>
  <div
    ref="sceneHost"
    :class="['emotion-scene', `emotion-scene--${variant}`, { dragging: isDragging, 'scene-ready': sceneReady }]"
    role="button"
    tabindex="0"
    :aria-label="interactiveLabel"
    @pointerdown="handlePointerDown"
    @pointermove="handlePointerMove"
    @pointerup="handlePointerUp"
    @pointercancel="handlePointerCancel"
    @keydown.enter="enterScene"
    @keydown.space.prevent="enterScene"
  >
    <div :class="['static-core', { loading: !fallbackVisible && !sceneReady }]" aria-hidden="true">
      <span></span>
    </div>
  </div>
</template>
