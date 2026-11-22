// 명령 실행 입구 — 종류별 핸들러(commands/*.js)를 모아 디스패치한다.
//   (R23d item 12: 942줄 switch 를 종류별 파일로 나눔. commands.js 는 모아서 다시 내보내는 입구.
//    다른 파일의 import 경로는 그대로 './commands.js' 를 쓴다.)
import { layerCommands } from './commands/layer-cmds.js';
import { keyCommands } from './commands/key-cmds.js';
import { fxCommands } from './commands/fx-cmds.js';
import { maskCommands } from './commands/mask-cmds.js';
import { docCommands } from './commands/doc-cmds.js';
import { invertPatches, applyPatches } from './patch.js';

// 패치 기본기·따라가기 헬퍼는 예전처럼 commands.js 에서도 쓸 수 있게 다시 내보낸다.
export { invertPatches, applyPatches } from './patch.js';
export { remapLayerFx } from './follow.js';

// 종류별 핸들러 맵 하나로 합친다(type 이름은 서로 겹치지 않는다).
//   export 는 "한 명령 안에서 패치를 여럿 쌓은 뒤 던지는" 경우의 되감기를 시험하려고
//   테스트가 가짜 핸들러를 잠깐 끼워 넣을 수 있게 열어 둔 것뿐이다(R33-2). 앱 코드는 쓰지 않는다.
export const HANDLERS = {
  ...docCommands,
  ...layerCommands,
  ...keyCommands,
  ...fxCommands,
  ...maskCommands,
};

// 안쪽 실행기 — 하나의 공유 patches 배열에 쌓는다(batch 는 재귀). 되감기는 하지 않는다.
//   (최상위 applyCommand 에서 한 번만 되감아, batch 재귀 안에서 이중으로 되감기지 않게 한다.)
function _applyInto(doc, cmd, patches) {
  if (cmd.type === 'batch') {
    for (const subCmd of cmd.cmds) _applyInto(doc, subCmd, patches);
    return;
  }
  const handler = HANDLERS[cmd.type];
  if (!handler) throw new Error(`알 수 없는 명령 타입: ${cmd.type}`);
  handler(doc, cmd, patches);
}

// 명령 실행 입구(최상위). 중간에 오류가 나면 이미 쌓인 패치를 거꾸로 적용해
//   doc 를 호출 전과 같게 되돌린 뒤 같은 오류를 다시 던진다(반만 바뀌는 일을 막는다, R33-2).
//   되감은 뒤 doc 가 원래와 JSON.stringify 기준으로 같은지는 r33-atomic 테스트가 지킨다.
//   (현재 명령들은 이미 있는 prop 객체의 잎 값만 바꾸므로 _set 이 중간에 빈 {} 를 새로 남기지 않는다.)
export function applyCommand(doc, cmd) {
  const patches = [];
  try {
    _applyInto(doc, cmd, patches);
  } catch (err) {
    if (patches.length) applyPatches(doc, invertPatches(patches));
    throw err;
  }
  return patches;
}
