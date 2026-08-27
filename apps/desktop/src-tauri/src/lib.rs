//! SmartPet Tauri 宿主：原生命令 + 托盘。
//! 注意：本机（Orange Pi）根分区只读且缺 webkit2gtk-4.1，无法本地编译；
//! 编译验证走 CI / 具备系统依赖的机器（`tauri build`）。

use serde::Serialize;
use std::path::PathBuf;

const DEFAULT_SETTINGS_YAML: &str = r#"# SmartPet AI 提供商配置（key 只存引用，明文 key 进系统钥匙串/keys.json）
llm-pi-ai:
  providers:
    deepseek-official:
      displayName: DeepSeek 官方
      apiKeyEnv: DEEPSEEK_API_KEY
      api: openai-completions
      baseURL: https://api.deepseek.com
      models:
        - id: deepseek-chat
          name: DeepSeek Chat
          contextWindow: 131072
          input: [text]
  default:
    provider: deepseek-official
    model: deepseek-chat
"#;

fn data_dir() -> PathBuf {
    if let Ok(home) = std::env::var("SMART_PET_HOME") {
        return PathBuf::from(home);
    }
    #[cfg(desktop)]
    {
        dirs::config_dir()
            .map(|dir| dir.join("smartpet"))
            .unwrap_or_else(|| PathBuf::from(".smartpet"))
    }
    #[cfg(not(desktop))]
    {
        PathBuf::from(".smartpet")
    }
}

/// 读取 settings.yaml（缺失时返回默认模板）
#[tauri::command]
fn read_settings() -> Result<String, String> {
    let path = data_dir().join("settings.yaml");
    match std::fs::read_to_string(&path) {
        Ok(text) => Ok(text),
        Err(_) => Ok(DEFAULT_SETTINGS_YAML.to_string()),
    }
}

/// 保存 settings.yaml
#[tauri::command]
fn save_settings(text: String) -> Result<(), String> {
    let dir = data_dir();
    std::fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    std::fs::write(dir.join("settings.yaml"), text).map_err(|err| err.to_string())
}

/// keyring 别名解析（apiKeyRef）。
/// MVP：`~/.smartpet/keys.json`（注意 chmod 600）；正式版接系统钥匙串（keyring crate，跨平台）。
#[tauri::command]
fn resolve_key(reference: String) -> Result<Option<String>, String> {
    let path = data_dir().join("keys.json");
    let raw = std::fs::read_to_string(&path).unwrap_or_else(|_| "{}".into());
    let map: serde_json::Map<String, serde_json::Value> =
        serde_json::from_str(&raw).map_err(|err| err.to_string())?;
    Ok(map.get(&reference).and_then(|v| v.as_str()).map(String::from))
}

/// 读取本地持久化的宠物文档（base64；缺失返回 null）
#[tauri::command]
fn load_pet_binary() -> Result<Option<String>, String> {
    let path = data_dir().join("pet.bin.b64");
    match std::fs::read_to_string(&path) {
        Ok(text) => Ok(Some(text.trim().to_string())),
        Err(_) => Ok(None),
    }
}

/// 保存本地持久化的宠物文档（base64）
#[tauri::command]
fn save_pet_binary(base64: String) -> Result<(), String> {
    let dir = data_dir();
    std::fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    std::fs::write(dir.join("pet.bin.b64"), base64).map_err(|err| err.to_string())
}

/// 当前平台（bridge 用）
#[tauri::command]
fn platform() -> Result<String, String> {
    #[cfg(target_os = "android")]
    {
        return Ok("android".into());
    }
    #[cfg(target_os = "windows")]
    {
        return Ok("windows".into());
    }
    #[cfg(target_os = "macos")]
    {
        return Ok("macos".into());
    }
    #[cfg(target_os = "linux")]
    {
        return Ok("linux".into());
    }
    #[allow(unreachable_code)]
    Ok("unknown".into())
}

/// 桌面通知（MVP：log；后续接 notification 插件）
#[tauri::command]
fn notify(title: String, body: String) -> Result<(), String> {
    println!("[smartpet] notify: {title} — {body}");
    Ok(())
}

#[cfg(desktop)]
#[derive(Serialize, Clone)]
struct TrayAction<'a> {
    action: &'a str,
}

/// 桌面与移动端统一入口；`mobile` cfg 由 tauri-build 注入（Android/iOS）
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // 托盘菜单仅桌面端可用（tauri::menu / tray_by_id 都是 #[cfg(desktop)]）
            #[cfg(desktop)]
            {
                use tauri::{Emitter, Manager};
                use tauri::menu::{MenuBuilder, MenuItemBuilder};
                let feed = MenuItemBuilder::with_id("feed", "喂食").build(app)?;
                let play = MenuItemBuilder::with_id("play", "玩耍").build(app)?;
                let games = MenuItemBuilder::with_id("games", "小游戏").build(app)?;
                let quit = MenuItemBuilder::with_id("quit", "退出").build(app)?;
                let menu = MenuBuilder::new(app)
                    .items(&[&feed, &play, &games, &quit])
                    .build()?;

                if let Some(tray) = app.tray_by_id("main-tray") {
                    tray.set_menu(Some(menu.clone()))?;
                    tray.on_menu_event(move |handle: &tauri::AppHandle, event| {
                        let action = match event.id.as_ref() {
                            "feed" => Some("feed"),
                            "play" => Some("play"),
                            "games" => Some("games"),
                            "quit" => {
                                handle.exit(0);
                                None
                            }
                            _ => None,
                        };
                        if let Some(action) = action {
                            let _ = handle.emit("tray:action", TrayAction { action });
                        }
                    });
                }
            }
            #[cfg(not(desktop))]
            {
                let _ = app;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_settings,
            save_settings,
            resolve_key,
            load_pet_binary,
            save_pet_binary,
            platform,
            notify
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}