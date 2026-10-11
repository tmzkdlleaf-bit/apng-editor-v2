// 이펙트 레지스트리 — 정적 import Map (id → 모듈)
// 새 효과 추가 = 파일 하나 + 아래에 import 한 줄 + Map 등록 한 줄.
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

const _all = [
  // 시험용(S5-5에서 제거)
  testDots, testLightRays, testSourceMirror,
  // 빛
  sparkle, glow, bokeh, lightBeams, sheen, wipe, lensFlare, caustics, lightLeak, candle, flashlight, stageLights, neon,
  // 날씨
  smoke, rain, snow, petals, fog, windowRain, leaves, sandstorm,
];

export const effects = new Map(_all.map((e) => [e.id, e]));

export function getEffect(id) { return effects.get(id); }
export function getAllEffects() { return [...effects.values()]; }
