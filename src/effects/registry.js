// 이펙트 레지스트리 — effectId → { name, evaluate } 맵
const _registry = new Map();

export function registerEffect(id, effect) {
  _registry.set(id, effect);
}

export function getEffects() {
  return _registry;
}
