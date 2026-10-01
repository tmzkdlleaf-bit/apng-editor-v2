const _MAP = {
  'normal':      'source-over',
  'multiply':    'multiply',
  'screen':      'screen',
  'overlay':     'overlay',
  'darken':      'darken',
  'lighten':     'lighten',
  'color-dodge': 'color-dodge',
  'color-burn':  'color-burn',
  'hard-light':  'hard-light',
  'soft-light':  'soft-light',
  'difference':  'difference',
  'exclusion':   'exclusion',
};

export function blendToComposite(blend) {
  return _MAP[blend] ?? 'source-over';
}
