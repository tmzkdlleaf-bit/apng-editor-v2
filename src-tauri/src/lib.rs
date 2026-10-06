// Tauri 2 진입점. 파일 쓰기/읽기는 커스텀 명령으로 한다(임의 경로, fs 스코프 불필요).
// 네이티브 저장/열기 대화상자는 dialog 플러그인(JS: window.__TAURI__.dialog)을 쓴다.

// 내보내기 저장: dialog 로 고른 경로에 바이트를 쓴다.
#[tauri::command]
fn write_file_bytes(path: String, contents: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, &contents).map_err(|e| e.to_string())
}

// 프로젝트(.apngproj/.json) 불러오기: 텍스트 파일을 읽어 돌려준다.
#[tauri::command]
fn read_file_text(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        // 자동 업데이트를 켤 때(Cargo.toml 의 updater/process 주석을 푼 뒤) 아래 두 줄을 추가한다:
        //   .plugin(tauri_plugin_updater::Builder::new().build())
        //   .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![write_file_bytes, read_file_text])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
