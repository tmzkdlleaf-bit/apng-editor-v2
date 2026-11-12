// 명령 실행 입구 — 종류별 핸들러(commands/*.js)를 모아 디스패치한다.
//   (R23d item 12: 942줄 switch 를 종류별 파일로 나눔. commands.js 는 모아서 다시 내보내는 입구.
//    다른 파일의 import 경로는 그대로 './commands.js' 를 쓴다.)
import { layerCommands } from './commands/layer-cmds.js';
import { keyCommands } from './commands/key-cmds.js';
import { fxCommands } from './commands/fx-cmds.js';
import { maskCommands } from './commands/mask-cmds.js';
import { docCommands } from './commands/doc-cmds.js';

// 패치 기본기·따라가기 헬퍼는 예전처럼 commands.js 에서도 쓸 수 있게 다시 내보낸다.
export { invertPatches, applyPatches } from './patch.js';
export { remapLayerFx } from './follow.js';

// 종류별 핸들러 맵 하나로 합친다(type 이름은 서로 겹치지 않는다).
const HANDLERS = {
  ...docCommands,
  ...layerCommands,
  ...keyCommands,
  ...fxCommands,
  ...maskCommands,
};

export function applyCommand(doc, cmd) {
  const patches = [];

  // batch 는 하위 명령을 차례로 실행해 패치를 이어 붙인다(재귀).
  if (cmd.type === 'batch') {
    for (const subCmd of cmd.cmds) patches.push(...applyCommand(doc, subCmd));
    return patches;
  }

  const handler = HANDLERS[cmd.type];
  if (!handler) throw new Error(`알 수 없는 명령 타입: ${cmd.type}`);
  handler(doc, cmd, patches);
  return patches;
}
