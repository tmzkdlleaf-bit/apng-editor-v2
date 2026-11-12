// 이펙트 레지스트리 — 정적 import Map (id → 모듈)
// 새 효과 추가 = 파일 하나 + 아래에 import 한 줄 + Map 등록 한 줄.
import { LIGHT_BG_PARAM } from '../core/render/fx-run.js';
import testDots from './test-dots.js';
import testLightRays from './test-light-rays.js';
import testSourceMirror from './test-source-mirror.js';

// 빛 (S5-1)
import sparkle from './sparkle.js';
import glow from './glow.js';
import bokeh from './bokeh.js';
import lightBeams from './light-beams.js';
import sheen from './sheen.js';
import wipe from './wipe.js';
import lensFlare from './lens-flare.js';
import caustics from './caustics.js';
import lightLeak from './light-leak.js';
import candle from './candle.js';
import flashlight from './flashlight.js';
import stageLights from './stage-lights.js';
import neon from './neon.js';

// 날씨 (S5-1)
import smoke from './smoke.js';
import rain from './rain.js';
import snow from './snow.js';
import petals from './petals.js';
import fog from './fog.js';
import windowRain from './window-rain.js';
import leaves from './leaves.js';
import sandstorm from './sandstorm.js';
import windBend from './wind-bend.js';
import grass from './grass.js';
import lightning from './lightning.js';
import fireflies from './fireflies.js';
import aurora from './aurora.js';
import clouds from './clouds.js';
import frost from './frost.js';

// 파티클 (S5-2)
import sparks from './sparks.js';
import particles from './particles.js';
import bubbles from './bubbles.js';
import emotes from './emotes.js';

// 오버레이 (S5-2)
import vignette from './vignette.js';
import grain from './grain.js';
import scanlines from './scanlines.js';
import glitch from './glitch.js';
import wave from './wave.js';
import chromatic from './chromatic.js';
import tvNoise from './tv-noise.js';
import vhs from './vhs.js';
import halftone from './halftone.js';

// 사이버 (S5-2)
import hologram from './hologram.js';
import datarain from './datarain.js';
import circuit from './circuit.js';
import neonGrid from './neon-grid.js';
import hudRing from './hud-ring.js';
import scanLaser from './scan-laser.js';

// 판타지 (S5-3)
import magicCircle from './magic-circle.js';
import runes from './runes.js';
import aura from './aura.js';
import spiritFlame from './spirit-flame.js';
import fairyDust from './fairy-dust.js';
import energyOrb from './energy-orb.js';
import magicShield from './magic-shield.js';

// 연출 (S5-3)
import flame from './flame.js';
import fireworks from './fireworks.js';
import confetti from './confetti.js';
import speedLines from './speed-lines.js';
import comicFlash from './comic-flash.js';
import impactFlash from './impact-flash.js';
import ripple from './ripple.js';
import shockwave from './shockwave.js';
import countdown from './countdown.js';
import iris from './iris.js';
import letterbox from './letterbox.js';
import curtain from './curtain.js';
import spotlight from './spotlight.js';
import focusSun from './focus-sun.js';

// 공포 (R28b)
import crack from './crack.js';
import drip from './drip.js';
import madness from './madness.js';
import pulseBorder from './pulse-border.js';
import veins from './veins.js';

// 변형 (R28c)
import dropShadow from './drop-shadow.js';
import bloom from './bloom.js';
import heatHaze from './heat-haze.js';
import mosaic from './mosaic.js';
import partialBlur from './partial-blur.js';

// 전환 (R28d)
import inkWipe from './ink-wipe.js';
import shatter from './shatter.js';
import paperBurn from './paper-burn.js';
import criticalBurst from './critical-burst.js';
import cardFlip from './card-flip.js';
import holoTransition from './holo-transition.js';
import holoFoil from './holo-foil.js';

// 시험용 효과 3개는 앱 목록에서 뺐다(R27). 테스트만 globalThis.__APNG_TEST_REGISTRY 를 켜고 쓴다
// (tests/helpers/fixtures.js 가 모든 페이지에 켠다). 앱에서는 이 표시가 없어 등록되지 않는다.
const _testFx = [testDots, testLightRays, testSourceMirror];

const _all = [
  // 빛
  sparkle, glow, bokeh, lightBeams, sheen, wipe, lensFlare, caustics, lightLeak, candle, flashlight, stageLights, neon,
  // 날씨
  smoke, rain, snow, petals, fog, windowRain, leaves, sandstorm, windBend, grass,
  lightning, fireflies, aurora, clouds, frost,   // R28e
  // 파티클
  sparks, particles, bubbles, emotes,
  // 오버레이
  vignette, grain, scanlines, glitch, wave, chromatic, tvNoise, vhs, halftone,
  // 사이버
  hologram, datarain, circuit, neonGrid, hudRing, scanLaser,
  // 판타지
  magicCircle, runes, aura, spiritFlame, fairyDust, energyOrb, magicShield,
  // 연출
  flame, fireworks, confetti, speedLines, comicFlash, impactFlash, ripple, shockwave, countdown, iris, letterbox, curtain, spotlight, focusSun,
  // 공포 (R28b)
  crack, drip, madness, pulseBorder, veins,
  // 변형 (R28c)
  dropShadow, bloom, heatHaze, mosaic, partialBlur,
  // 전환 (R28d) — 홀로 코팅은 반복형이라 '빛' 분류
  inkWipe, shatter, paperBurn, criticalBurst, cardFlip, holoTransition, holoFoil,
];

// "밝은 배경용"(R27): lightBg:true 인 효과에 고급 파라미터를 붙인다. 엔진(fx-run)이 값을 읽어 처리.
for (const e of _all) {
  if (e.lightBg && !(e.params ?? []).some((d) => d.key === 'lightBg')) e.params = [...(e.params ?? []), LIGHT_BG_PARAM];
}

export const effects = new Map(_all.map((e) => [e.id, e]));
if (globalThis.__APNG_TEST_REGISTRY) for (const e of _testFx) effects.set(e.id, e);

export function getEffect(id) { return effects.get(id); }
export function getAllEffects() { return [...effects.values()]; }
