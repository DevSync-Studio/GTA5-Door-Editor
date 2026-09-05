use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri_plugin_dialog::DialogExt;

mod ytyp_bin;
mod ydr_mesh;
mod texture_dict;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OpenedFile {
    pub path: String,
    pub name: String,
    pub text: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileFilter {
    pub title: String,
    pub extensions: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YtypAttrUpdate {
    pub name: String,
    pub special_attribute: u32,
    pub flags: Option<u32>,
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string_lossy().into_owned())
}

fn read_opened(path: PathBuf) -> Result<OpenedFile, String> {
    let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    Ok(OpenedFile {
        name: file_name(&path),
        path: path.to_string_lossy().into_owned(),
        text,
    })
}

fn pick_path(
    app: &tauri::AppHandle,
    title: &str,
    filters: &[FileFilter],
) -> Result<Option<PathBuf>, String> {
    let mut dialog = app.dialog().file().set_title(title);
    for filter in filters {
        let ext: Vec<&str> = filter.extensions.iter().map(String::as_str).collect();
        dialog = dialog.add_filter(&filter.title, &ext);
    }
    match dialog.blocking_pick_file() {
        Some(file) => file.into_path().map(Some).map_err(|e| e.to_string()),
        None => Ok(None),
    }
}

#[tauri::command]
fn open_text_file(
    app: tauri::AppHandle,
    title: String,
    filters: Vec<FileFilter>,
) -> Result<Option<OpenedFile>, String> {
    let Some(path) = pick_path(&app, &title, &filters)? else {
        return Ok(None);
    };
    read_opened(path).map(Some)
}

#[tauri::command]
fn read_text_file(path: String) -> Result<OpenedFile, String> {
    read_opened(PathBuf::from(path))
}

#[tauri::command]
fn open_ytyp_file(
    app: tauri::AppHandle,
    title: String,
    filters: Vec<FileFilter>,
) -> Result<Option<ytyp_bin::OpenedYtyp>, String> {
    let Some(path) = pick_path(&app, &title, &filters)? else {
        return Ok(None);
    };
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let name = file_name(&path);
    let path_s = path.to_string_lossy().into_owned();
    ytyp_bin::open_ytyp_bytes(&path_s, &name, &bytes).map(Some)
}

#[tauri::command]
fn read_ytyp_file(path: String) -> Result<ytyp_bin::OpenedYtyp, String> {
    let path_buf = PathBuf::from(&path);
    let bytes = std::fs::read(&path_buf).map_err(|e| e.to_string())?;
    let name = file_name(&path_buf);
    ytyp_bin::open_ytyp_bytes(&path, &name, &bytes)
}

#[tauri::command]
fn parse_ytyp_bytes(name: String, data_base64: String) -> Result<ytyp_bin::OpenedYtyp, String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data_base64)
        .map_err(|e| e.to_string())?;
    ytyp_bin::open_ytyp_bytes("", &name, &bytes)
}

#[tauri::command]
fn parse_ydr_mesh(data_base64: String) -> Result<ydr_mesh::YdrPreview, String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data_base64)
        .map_err(|e| e.to_string())?;
    ydr_mesh::extract_ydr_preview(&bytes)
}

#[tauri::command]
fn parse_ydr_mesh_path(path: String) -> Result<ydr_mesh::YdrPreview, String> {
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let mut preview = ydr_mesh::extract_ydr_preview(&bytes)?;
    if preview.name.is_empty() || preview.name == "drawable" {
        preview.name = file_name(Path::new(&path));
        if let Some(stem) = Path::new(&path).file_stem() {
            preview.name = stem.to_string_lossy().into_owned();
        }
    }
    // Auto-load sibling .ytd files: exact stem, or GTA variants like `name+hidr.ytd`.
    if let Some(dir) = Path::new(&path).parent() {
        let stem = Path::new(&path)
            .file_stem()
            .map(|s| s.to_string_lossy().to_ascii_lowercase())
            .unwrap_or_default();
        if !stem.is_empty() {
            if let Ok(entries) = std::fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    let Some(ext) = p.extension() else { continue };
                    if !ext.eq_ignore_ascii_case("ytd") {
                        continue;
                    }
                    let Some(ytd_stem) = p.file_stem() else { continue };
                    let ytd_stem = ytd_stem.to_string_lossy().to_ascii_lowercase();
                    let ok = ytd_stem == stem
                        || ytd_stem.starts_with(&(stem.clone() + "+"))
                        || ytd_stem.starts_with(&(stem.clone() + "_"));
                    if !ok {
                        continue;
                    }
                    if let Ok(ytd_bytes) = std::fs::read(&p) {
                        if let Ok(extra) = texture_dict::extract_ytd_textures(&ytd_bytes) {
                            merge_textures(&mut preview.textures, extra);
                        }
                    }
                }
            }
        }
    }
    refresh_missing_diffuse(&mut preview);
    Ok(preview)
}

#[tauri::command]
fn parse_ytd_textures(data_base64: String) -> Result<Vec<texture_dict::PreviewTexture>, String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data_base64)
        .map_err(|e| e.to_string())?;
    texture_dict::extract_ytd_textures(&bytes)
}

#[tauri::command]
fn parse_ytd_textures_path(path: String) -> Result<Vec<texture_dict::PreviewTexture>, String> {
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    texture_dict::extract_ytd_textures(&bytes)
}

fn merge_textures(
    into: &mut Vec<texture_dict::PreviewTexture>,
    extra: Vec<texture_dict::PreviewTexture>,
) {
    for tex in extra {
        if let Some(existing) = into
            .iter_mut()
            .find(|t| t.name.eq_ignore_ascii_case(&tex.name))
        {
            if existing.source == "embedded" && tex.source == "ytd" {
                *existing = tex;
            }
        } else {
            into.push(tex);
        }
    }
}

fn refresh_missing_diffuse(preview: &mut ydr_mesh::YdrPreview) {
    preview.missing_diffuse = preview.meshes.iter().any(|m| {
        m.diffuse_name
            .as_ref()
            .map(|n| {
                !preview
                    .textures
                    .iter()
                    .any(|t| t.name.eq_ignore_ascii_case(n))
            })
            .unwrap_or(true)
    });
}

fn write_ytyp_binary(
    path: &str,
    binary_base64: &str,
    updates: Vec<YtypAttrUpdate>,
) -> Result<(), String> {
    use base64::Engine;
    let original = base64::engine::general_purpose::STANDARD
        .decode(binary_base64)
        .map_err(|e| e.to_string())?;
    let mapped: Vec<(String, ytyp_bin::ArchetypeUpdate)> = updates
        .into_iter()
        .map(|u| {
            (
                u.name,
                ytyp_bin::ArchetypeUpdate {
                    special_attribute: u.special_attribute,
                    flags: u.flags,
                },
            )
        })
        .collect();
    let next = ytyp_bin::apply_archetype_updates(&original, &mapped, Some(path))?;
    if let Some(parent) = Path::new(path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(path, next).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_ytyp_binary(
    path: String,
    binary_base64: String,
    updates: Vec<YtypAttrUpdate>,
) -> Result<(), String> {
    write_ytyp_binary(&path, &binary_base64, updates)
}

#[tauri::command]
fn save_ytyp_binary_as(
    app: tauri::AppHandle,
    title: String,
    default_name: String,
    binary_base64: String,
    updates: Vec<YtypAttrUpdate>,
) -> Result<Option<OpenedFile>, String> {
    let dialog = app
        .dialog()
        .file()
        .set_title(&title)
        .set_file_name(&default_name)
        .add_filter("YTYP", &["ytyp"]);
    let Some(file) = dialog.blocking_save_file() else {
        return Ok(None);
    };
    let path = file.into_path().map_err(|e| e.to_string())?;
    let path_str = path.to_string_lossy().into_owned();
    write_ytyp_binary(&path_str, &binary_base64, updates)?;
    Ok(Some(OpenedFile {
        name: file_name(&path),
        path: path_str,
        text: String::new(),
    }))
}

#[tauri::command]
fn save_text_file(path: String, contents: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, contents).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_text_file_as(
    app: tauri::AppHandle,
    title: String,
    default_name: String,
    contents: String,
    filters: Vec<FileFilter>,
) -> Result<Option<OpenedFile>, String> {
    let mut dialog = app
        .dialog()
        .file()
        .set_title(&title)
        .set_file_name(&default_name);
    for filter in &filters {
        let ext: Vec<&str> = filter.extensions.iter().map(String::as_str).collect();
        dialog = dialog.add_filter(&filter.title, &ext);
    }
    let Some(file) = dialog.blocking_save_file() else {
        return Ok(None);
    };
    let path = file.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&path, &contents).map_err(|e| e.to_string())?;
    Ok(Some(OpenedFile {
        name: file_name(&path),
        path: path.to_string_lossy().into_owned(),
        text: contents,
    }))
}

#[tauri::command]
fn backup_existing(path: String) -> Result<Option<String>, String> {
    let source = Path::new(&path);
    if !source.exists() {
        return Ok(None);
    }
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs();
    let backup = format!("{path}.{stamp}.bak");
    std::fs::copy(source, &backup).map_err(|e| e.to_string())?;
    Ok(Some(backup))
}

#[tauri::command]
fn pick_directory(app: tauri::AppHandle, title: String) -> Result<Option<String>, String> {
    let Some(folder) = app
        .dialog()
        .file()
        .set_title(&title)
        .blocking_pick_folder()
    else {
        return Ok(None);
    };
    let path = folder.into_path().map_err(|e| e.to_string())?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[tauri::command]
fn reveal_in_explorer(path: String) -> Result<(), String> {
    let target = Path::new(&path);
    if !target.exists() {
        return Err("File not found on disk.".into());
    }
    let absolute = std::fs::canonicalize(target).unwrap_or_else(|_| target.to_path_buf());

    #[cfg(target_os = "windows")]
    {
        // Strip Windows UNC prefix \\?\ so Explorer accepts the path.
        let display = absolute.to_string_lossy();
        let cleaned = display
            .strip_prefix(r"\\?\")
            .unwrap_or(display.as_ref())
            .to_string();
        std::process::Command::new("explorer")
            .arg(format!("/select,{cleaned}"))
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-R", &absolute.to_string_lossy()])
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let parent = absolute
            .parent()
            .ok_or_else(|| "No parent folder.".to_string())?;
        std::process::Command::new("xdg-open")
            .arg(parent)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    Err("Reveal in explorer is not supported on this OS.".into())
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &url])
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    Err("Opening URLs is not supported on this OS.".into())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    use tauri_plugin_prevent_default::Flags;
    use tauri_plugin_prevent_default::PlatformOptions;

    // Block WebView browser chrome; leave editing shortcuts alone.
    #[cfg(debug_assertions)]
    let flags = Flags::CONTEXT_MENU
        | Flags::RELOAD
        | Flags::PRINT
        | Flags::DOWNLOADS
        | Flags::SOURCE
        | Flags::OPEN
        | Flags::FIND
        | Flags::CARET_BROWSING;
    #[cfg(not(debug_assertions))]
    let flags = Flags::CONTEXT_MENU
        | Flags::RELOAD
        | Flags::PRINT
        | Flags::DOWNLOADS
        | Flags::SOURCE
        | Flags::OPEN
        | Flags::FIND
        | Flags::CARET_BROWSING
        | Flags::DEV_TOOLS;

    let prevent = tauri_plugin_prevent_default::Builder::new()
        .with_flags(flags)
        .platform(
            PlatformOptions::new()
                .browser_accelerator_keys(false)
                .default_context_menus(false)
                .default_script_dialogs(false)
                .password_autosave(false),
        )
        .build();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(prevent)
        .invoke_handler(tauri::generate_handler![
            open_text_file,
            read_text_file,
            open_ytyp_file,
            read_ytyp_file,
            parse_ytyp_bytes,
            parse_ydr_mesh,
            parse_ydr_mesh_path,
            parse_ytd_textures,
            parse_ytd_textures_path,
            save_ytyp_binary,
            save_ytyp_binary_as,
            save_text_file,
            save_text_file_as,
            backup_existing,
            pick_directory,
            reveal_in_explorer,
            open_external_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running GTA5 Door Editor");
}
