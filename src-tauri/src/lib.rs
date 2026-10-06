// Tauri 2 진입점.
// 보안: 파일 쓰기/읽기 경로는 "웹뷰(JS)"가 정하지 않는다. Rust 명령이 네이티브 대화상자를
// 직접 열어 사용자가 고른 경로에만 접근한다. JS 는 이름 제안·확장자·바이트만 넘긴다
// (JS 가 임의 경로 문자열을 넘겨 어디든 쓰는 일을 원천 차단).

use serde::Serialize;
use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

// 16진수 한 글자 → 값.
fn hex_val(c: u8) -> Option<u8> {
    match c {
        b'0'..=b'9' => Some(c - b'0'),
        b'a'..=b'f' => Some(c - b'a' + 10),
        b'A'..=b'F' => Some(c - b'A' + 10),
        _ => None,
    }
}

// JS encodeURIComponent 로 ASCII 화한 헤더 값을 되돌린다(%XX → 원래 바이트, UTF-8 복원).
// 헤더 값은 ASCII 만 담을 수 있어 한글 파일명을 이렇게 주고받는다.
fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let (Some(h), Some(l)) = (hex_val(b[i + 1]), hex_val(b[i + 2])) {
                out.push((h << 4) | l);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

// 저장: Rust 가 저장 대화상자를 열고, 사용자가 고른 경로에만 원시 바이트를 쓴다.
// 본문(bytes)은 Tauri 2 원시 바이트 전달(InvokeBody::Raw). 이름·확장자·마지막 폴더는 헤더로.
// 반환: 저장한 경로(성공) / None(취소).
#[tauri::command]
async fn save_with_dialog(app: AppHandle, request: Request<'_>) -> Result<Option<String>, String> {
    let bytes: Vec<u8> = match request.body() {
        InvokeBody::Raw(b) => b.clone(),
        _ => return Err("요청 본문이 원시 바이트가 아닙니다.".into()),
    };
    let headers = request.headers();
    let header = |k: &str| headers.get(k).and_then(|v| v.to_str().ok());
    let default_name = header("x-default-name")
        .map(percent_decode)
        .unwrap_or_else(|| "export".into());
    let last_dir = header("x-last-dir").map(percent_decode).unwrap_or_default();
    let ext = header("x-extension").unwrap_or("").to_string();

    let mut builder = app.dialog().file().set_file_name(&default_name);
    if !ext.is_empty() {
        builder = builder.add_filter(&ext, &[ext.as_str()]);
    }
    if !last_dir.is_empty() {
        builder = builder.set_directory(&last_dir);
    }

    let Some(file_path) = builder.blocking_save_file() else {
        return Ok(None);
    };
    let path = file_path.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[derive(Serialize)]
struct OpenedProject {
    path: String,
    text: String,
}

// 열기: Rust 가 열기 대화상자를 열고, 고른 텍스트 파일을 읽어 { path, text } 로 돌려준다.
// 반환: 파일 내용(성공) / None(취소).
#[tauri::command]
async fn open_project_with_dialog(
    app: AppHandle,
    dir: String,
) -> Result<Option<OpenedProject>, String> {
    let mut builder = app
        .dialog()
        .file()
        .add_filter("프로젝트", &["apngproj", "json"]);
    if !dir.is_empty() {
        builder = builder.set_directory(&dir);
    }
    let Some(file_path) = builder.blocking_pick_file() else {
        return Ok(None);
    };
    let path = file_path.into_path().map_err(|e| e.to_string())?;
    let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    Ok(Some(OpenedProject {
        path: path.to_string_lossy().into_owned(),
        text,
    }))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // 자동 업데이트(데스크톱만). 설치된 앱이 GitHub 릴리스의 latest.json 을 보고 새 버전을 받는다.
            #[cfg(desktop)]
            {
                app.app_handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
                app.app_handle().plugin(tauri_plugin_process::init())?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            save_with_dialog,
            open_project_with_dialog
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
