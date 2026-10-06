// 릴리스 빌드에서 윈도우에 콘솔 창이 추가로 뜨지 않게 한다.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    apng_editor_lib::run()
}
