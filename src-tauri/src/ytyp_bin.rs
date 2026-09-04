//! Minimal RSC7 Meta YTYP reader/writer focused on specialAttribute editing.
//!
//! Independent reimplementation. Format reference:
//! [CodeWalker](https://github.com/dexyfex/CodeWalker) by dexyfex
//! (RSC7 headers, JenkHash, page flags, ResourceBuilder deflate). Not affiliated.

use flate2::read::{DeflateDecoder, ZlibDecoder};
use flate2::write::DeflateEncoder;
use flate2::Compression;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::{Mutex, OnceLock};

pub(crate) const RSC7_MAGIC: u32 = 0x3743_5352; // "RSC7" LE
const META_STRING: u32 = 0x10;
const C_BASE_ARCHETYPE_DEF: u32 = 2_195_127_427;
const C_TIME_ARCHETYPE_DEF: u32 = 1_991_296_364;
const C_MLO_ARCHETYPE_DEF: u32 = 273_704_021;

/// Names learned from XML imports / companion exports in this app session.
fn name_cache() -> &'static Mutex<HashMap<u32, String>> {
    static CACHE: OnceLock<Mutex<HashMap<u32, String>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BinaryArchetype {
    pub name: String,
    pub name_hash: u32,
    pub special_attribute: u32,
    /// Absolute byte offset of specialAttribute inside decompressed system segment.
    pub sa_offset: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenedYtyp {
    pub path: String,
    pub name: String,
    pub format: String,
    pub text: String,
    pub binary_base64: Option<String>,
    pub archetypes: Vec<BinaryArchetype>,
}

fn u16_le(data: &[u8], offset: usize) -> u16 {
    u16::from_le_bytes(data[offset..offset + 2].try_into().unwrap())
}

fn u32_le(data: &[u8], offset: usize) -> u32 {
    u32::from_le_bytes(data[offset..offset + 4].try_into().unwrap())
}

fn u64_le(data: &[u8], offset: usize) -> u64 {
    u64::from_le_bytes(data[offset..offset + 8].try_into().unwrap())
}

fn write_u32_le(data: &mut [u8], offset: usize, value: u32) {
    data[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
}

/// CodeWalker `RpfResourceFileEntry.GetSizeFromFlags` - page flags → byte length.
pub(crate) fn resource_size_from_flags(flags: u32) -> usize {
    let s0 = ((flags >> 27) & 0x1) << 0;
    let s1 = ((flags >> 26) & 0x1) << 1;
    let s2 = ((flags >> 25) & 0x1) << 2;
    let s3 = ((flags >> 24) & 0x1) << 3;
    let s4 = ((flags >> 17) & 0x7F) << 4;
    let s5 = ((flags >> 11) & 0x3F) << 5;
    let s6 = ((flags >> 7) & 0xF) << 6;
    let s7 = ((flags >> 5) & 0x3) << 7;
    let s8 = ((flags >> 4) & 0x1) << 8;
    let ss = flags & 0xF;
    let base_size = 0x200usize << ss;
    let pages = (s0 + s1 + s2 + s3 + s4 + s5 + s6 + s7 + s8) as usize;
    base_size.saturating_mul(pages)
}

fn va_offset(ptr: u64) -> usize {
    (ptr & 0x0FFF_FFFF) as usize
}

fn decompress_body(body: &[u8]) -> Result<Vec<u8>, String> {
    // CodeWalker ResourceBuilder.Decompress uses raw DEFLATE (no zlib wrapper).
    let try_raw_deflate = || {
        let mut out = Vec::new();
        DeflateDecoder::new(body)
            .read_to_end(&mut out)
            .ok()
            .filter(|_| !out.is_empty())
            .map(|_| out)
    };
    let try_zlib = || {
        let mut out = Vec::new();
        ZlibDecoder::new(body)
            .read_to_end(&mut out)
            .ok()
            .filter(|_| !out.is_empty())
            .map(|_| out)
    };
    if let Some(out) = try_raw_deflate() {
        return Ok(out);
    }
    if let Some(out) = try_zlib() {
        return Ok(out);
    }
    if !body.is_empty() {
        return Ok(body.to_vec());
    }
    Err("Could not decompress RSC7 YTYP body".into())
}

pub fn prepare_rsc7(data: &[u8]) -> Result<(Vec<u8>, Vec<u8>, u32, u32), String> {
    if data.len() < 16 {
        return Err("YTYP file is too small to be RSC7".into());
    }
    let magic = u32_le(data, 0);
    if magic != RSC7_MAGIC {
        return Err("Not a binary RSC7 YTYP file".into());
    }
    let version = u32_le(data, 4);
    if version != 2 {
        return Err(format!("Unsupported RSC7 version {version} (expected 2 for YTYP)"));
    }
    let system_flags = u32_le(data, 8);
    let graphics_flags = u32_le(data, 12);
    let sys_size = resource_size_from_flags(system_flags);
    let gfx_size = resource_size_from_flags(graphics_flags);
    let decompressed = decompress_body(&data[16..])?;
    let needed = sys_size.saturating_add(gfx_size);
    if needed > 0 && decompressed.len() < needed {
        return Err(format!(
            "Decompressed YTYP is truncated ({} < {needed}; system={sys_size}, graphics={gfx_size})",
            decompressed.len()
        ));
    }
    if sys_size == 0 {
        return Err("YTYP system page size is zero - invalid resource flags".into());
    }
    let system = decompressed[..sys_size].to_vec();
    let graphics = if gfx_size == 0 {
        Vec::new()
    } else if decompressed.len() >= sys_size + gfx_size {
        decompressed[sys_size..sys_size + gfx_size].to_vec()
    } else {
        decompressed[sys_size..].to_vec()
    };
    Ok((system, graphics, system_flags, graphics_flags))
}

fn pack_rsc7(system: &[u8], graphics: &[u8], system_flags: u32, graphics_flags: u32) -> Result<Vec<u8>, String> {
    let mut combined = Vec::with_capacity(system.len() + graphics.len());
    combined.extend_from_slice(system);
    combined.extend_from_slice(graphics);

    // CodeWalker ResourceBuilder.Compress uses raw DEFLATE (no zlib wrapper).
    let mut encoder = DeflateEncoder::new(Vec::new(), Compression::default());
    encoder
        .write_all(&combined)
        .map_err(|e| e.to_string())?;
    let compressed = encoder.finish().map_err(|e| e.to_string())?;

    let mut out = Vec::with_capacity(16 + compressed.len());
    out.extend_from_slice(&RSC7_MAGIC.to_le_bytes());
    out.extend_from_slice(&2u32.to_le_bytes());
    out.extend_from_slice(&system_flags.to_le_bytes());
    out.extend_from_slice(&graphics_flags.to_le_bytes());
    out.extend_from_slice(&compressed);
    Ok(out)
}

/// CodeWalker `JenkHash.GenHash(string)` - does NOT force lowercase.
pub fn jenk_hash(input: &str) -> u32 {
    let mut hash: u32 = 0;
    for b in input.bytes() {
        hash = hash.wrapping_add(u32::from(b));
        hash = hash.wrapping_add(hash << 10);
        hash ^= hash >> 6;
    }
    hash = hash.wrapping_add(hash << 3);
    hash ^= hash >> 11;
    hash = hash.wrapping_add(hash << 15);
    hash
}

fn ensure_name(map: &mut HashMap<u32, String>, value: &str) {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return;
    }
    // Skip unresolved placeholders from CodeWalker XML.
    let lower = trimmed.to_ascii_lowercase();
    if lower.starts_with("hash_") || lower.starts_with("hash:") || lower.starts_with("0x") {
        return;
    }
    map.entry(jenk_hash(trimmed))
        .or_insert_with(|| trimmed.to_string());
    if lower != trimmed {
        map.entry(jenk_hash(&lower)).or_insert(lower);
    }
}

fn extract_xml_archetype_names(text: &str, map: &mut HashMap<u32, String>) {
    for tag in ["name", "assetName"] {
        let open = format!("<{tag}>");
        let close = format!("</{tag}>");
        let mut rest = text;
        while let Some(start) = rest.find(&open) {
            let after = &rest[start + open.len()..];
            let Some(end) = after.find(&close) else {
                break;
            };
            ensure_name(map, after[..end].trim());
            rest = &after[end + close.len()..];
        }
    }
}

fn remember_names(map: &HashMap<u32, String>) {
    if map.is_empty() {
        return;
    }
    if let Ok(mut cache) = name_cache().lock() {
        for (hash, name) in map {
            cache.entry(*hash).or_insert_with(|| name.clone());
        }
    }
}

fn cached_names() -> HashMap<u32, String> {
    name_cache()
        .lock()
        .map(|cache| cache.clone())
        .unwrap_or_default()
}

fn ingest_xml_file(path: &Path, map: &mut HashMap<u32, String>) {
    let Ok(bytes) = std::fs::read(path) else {
        return;
    };
    // Skip huge unrelated XML dumps.
    if bytes.len() > 12 * 1024 * 1024 {
        return;
    }
    let Ok(text) = String::from_utf8(bytes) else {
        return;
    };
    if !text.contains("CMapTypes") && !text.contains("<name>") {
        return;
    }
    extract_xml_archetype_names(&text, map);
}

/// Prefer companion CodeWalker/OpenIV XML exports - they contain the real names
/// that binary RSC7 YTYPs often store only as hashes.
fn collect_companion_xml_names(path: &str) -> HashMap<u32, String> {
    let mut map = HashMap::new();
    let file_path = Path::new(path);
    let Some(dir) = file_path.parent() else {
        return map;
    };

    let mut candidates: Vec<std::path::PathBuf> = Vec::new();
    if let Some(file_name) = file_path.file_name().and_then(|s| s.to_str()) {
        // door.ytyp -> door.ytyp.xml
        candidates.push(dir.join(format!("{file_name}.xml")));
    }
    if let Some(stem) = file_path.file_stem().and_then(|s| s.to_str()) {
        let stem = stem.strip_suffix(".ytyp").unwrap_or(stem);
        candidates.push(dir.join(format!("{stem}.ytyp.xml")));
        candidates.push(dir.join(format!("{stem}.xml")));
    }

    for candidate in &candidates {
        if candidate.is_file() {
            ingest_xml_file(candidate, &mut map);
        }
    }

    // Also harvest any nearby YTYP XML exports (same folder + parent).
    for folder in [dir, dir.parent().unwrap_or(dir)] {
        let Ok(entries) = std::fs::read_dir(folder) else {
            continue;
        };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
            if !(name.ends_with(".ytyp.xml")
                || (name.ends_with(".xml") && name.contains("ytyp")))
            {
                continue;
            }
            ingest_xml_file(&entry.path(), &mut map);
        }
    }

    map
}

/// CodeWalker builds JenkIndex from drawable/model filenames in the same package.
/// For loose files we scan the YTYP folder and its parent for matching stems.
fn collect_nearby_names(path: &str) -> HashMap<u32, String> {
    let mut map = collect_companion_xml_names(path);
    let file_path = Path::new(path);
    if let Some(stem) = file_path.file_stem().and_then(|s| s.to_str()) {
        let stem = stem.strip_suffix(".ytyp").unwrap_or(stem);
        ensure_name(&mut map, stem);
    }

    let mut dirs = Vec::new();
    if let Some(parent) = file_path.parent() {
        dirs.push(parent.to_path_buf());
        if let Some(grand) = parent.parent() {
            dirs.push(grand.to_path_buf());
        }
    }

    const EXTS: &[&str] = &[
        ".ydr", ".yft", ".ydd", ".ytd", ".ytyp", ".ycd", ".ymap", ".ybn",
    ];

    for dir in dirs {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if !file_type.is_file() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().into_owned();
            let lower = name.to_ascii_lowercase();
            for ext in EXTS {
                if lower.ends_with(ext) {
                    let stem_len = name.len().saturating_sub(ext.len());
                    if stem_len > 0 {
                        ensure_name(&mut map, &name[..stem_len]);
                    }
                    break;
                }
            }
            if lower.ends_with(".ytyp.xml") || lower.ends_with(".ymap.xml") {
                if let Some((stem, _)) = name.split_once('.') {
                    ensure_name(&mut map, stem);
                }
            }
        }
    }
    map
}

fn collect_strings(system: &[u8], blocks: &[(u32, u32, usize)]) -> HashMap<u32, String> {
    let mut map = HashMap::new();
    for &(name_hash, length, data_off) in blocks {
        if name_hash != META_STRING {
            continue;
        }
        if data_off == 0 || data_off >= system.len() {
            continue;
        }
        let end = (data_off + length as usize).min(system.len());
        let chunk = &system[data_off..end];
        let mut start = 0usize;
        while start < chunk.len() {
            if chunk[start] == 0 {
                start += 1;
                continue;
            }
            let mut end_s = start;
            while end_s < chunk.len() && chunk[end_s] != 0 {
                end_s += 1;
            }
            if let Ok(s) = std::str::from_utf8(&chunk[start..end_s]) {
                ensure_name(&mut map, s);
            }
            start = end_s + 1;
        }
    }
    map
}

fn resolve_name(strings: &HashMap<u32, String>, name_key: u32) -> String {
    strings
        .get(&name_key)
        .cloned()
        .unwrap_or_else(|| format!("hash_{name_key:08X}"))
}

fn resolve_name_key(name: &str) -> Option<u32> {
    let trimmed = name.trim();
    if let Some(rest) = trimmed
        .strip_prefix("hash_")
        .or_else(|| trimmed.strip_prefix("hash:"))
        .or_else(|| trimmed.strip_prefix("0x"))
    {
        return u32::from_str_radix(rest, 16).ok();
    }
    Some(jenk_hash(trimmed))
}

fn read_meta_blocks(system: &[u8]) -> Result<Vec<(u32, u32, usize)>, String> {
    if system.len() < 112 {
        return Err("System segment too small for Meta header".into());
    }
    let data_blocks_pointer = u64_le(system, 0x30);
    let data_blocks_count = u16_le(system, 0x4C) as usize;
    if data_blocks_count == 0 || data_blocks_pointer == 0 {
        return Err("YTYP Meta has no data blocks".into());
    }
    let block_array_offset = va_offset(data_blocks_pointer);
    let mut blocks = Vec::with_capacity(data_blocks_count);
    for i in 0..data_blocks_count {
        let offset = block_array_offset + i * 16;
        if offset + 16 > system.len() {
            break;
        }
        let name_hash = u32_le(system, offset);
        let length = u32_le(system, offset + 4);
        let data_ptr = u64_le(system, offset + 8);
        let data_off = va_offset(data_ptr);
        blocks.push((name_hash, length, data_off));
    }
    if blocks.is_empty() {
        return Err("Failed to read YTYP Meta data blocks".into());
    }
    Ok(blocks)
}

fn structure_stride(name_hash: u32) -> Option<usize> {
    match name_hash {
        C_BASE_ARCHETYPE_DEF => Some(144),
        C_TIME_ARCHETYPE_DEF => Some(160),
        C_MLO_ARCHETYPE_DEF => Some(240),
        _ => None,
    }
}

fn parse_archetypes(system: &[u8], path: Option<&str>) -> Result<Vec<BinaryArchetype>, String> {
    let blocks = read_meta_blocks(system)?;
    let mut strings = collect_strings(system, &blocks);
    for (hash, name) in cached_names() {
        strings.entry(hash).or_insert(name);
    }
    if let Some(path) = path {
        for (hash, name) in collect_nearby_names(path) {
            strings.entry(hash).or_insert(name);
        }
    }
    remember_names(&strings);
    let mut out = Vec::new();

    for &(name_hash, length, data_off) in &blocks {
        let Some(stride) = structure_stride(name_hash) else {
            continue;
        };
        if data_off == 0 || data_off >= system.len() {
            continue;
        }
        let end = (data_off + length as usize).min(system.len());
        let mut cursor = data_off;
        while cursor + stride <= end {
            if cursor + 112 > system.len() {
                break;
            }
            let special_attribute = u32_le(system, cursor + 16);
            let name_key = u32_le(system, cursor + 88);
            // Fall back to assetName when name is unresolved (CodeWalker does similar).
            let asset_key = u32_le(system, cursor + 112);
            let mut name = resolve_name(&strings, name_key);
            if name.starts_with("hash_") {
                let asset_name = resolve_name(&strings, asset_key);
                if !asset_name.starts_with("hash_") {
                    name = asset_name;
                }
            }
            out.push(BinaryArchetype {
                name,
                name_hash: name_key,
                special_attribute,
                sa_offset: (cursor + 16) as u32,
            });
            cursor += stride;
        }
    }

    if out.is_empty() {
        return Err("No archetypes with specialAttribute were found in this YTYP".into());
    }
    Ok(out)
}

fn archetypes_to_xml(archetypes: &[BinaryArchetype]) -> String {
    let mut body = String::from(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<CMapTypes>\n <archetypes>\n",
    );
    for item in archetypes {
        body.push_str(&format!(
            "  <Item type=\"CBaseArchetypeDef\">\n   <name>{}</name>\n   <specialAttribute value=\"{}\" />\n  </Item>\n",
            xml_escape(&item.name),
            item.special_attribute
        ));
    }
    body.push_str(" </archetypes>\n</CMapTypes>\n");
    body
}

fn xml_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

pub fn is_rsc7(data: &[u8]) -> bool {
    data.len() >= 4 && u32_le(data, 0) == RSC7_MAGIC
}

pub fn looks_like_xml(data: &[u8]) -> bool {
    let sample = String::from_utf8_lossy(&data[..data.len().min(256)]);
    let trimmed = sample.trim_start_matches('\u{feff}').trim_start();
    trimmed.starts_with('<') || trimmed.contains("CMapTypes")
}

pub fn open_ytyp_bytes(path: &str, name: &str, data: &[u8]) -> Result<OpenedYtyp, String> {
    if looks_like_xml(data) {
        let text = String::from_utf8(data.to_vec()).map_err(|e| e.to_string())?;
        let mut xml_names = HashMap::new();
        extract_xml_archetype_names(&text, &mut xml_names);
        remember_names(&xml_names);
        return Ok(OpenedYtyp {
            path: path.to_string(),
            name: name.to_string(),
            format: "xml".into(),
            text,
            binary_base64: None,
            archetypes: Vec::new(),
        });
    }
    if !is_rsc7(data) {
        return Err("Unsupported YTYP. Use XML export or a binary RSC7 .ytyp".into());
    }

    let (system, _graphics, _sf, _gf) = prepare_rsc7(data)?;
    let archetypes = parse_archetypes(&system, Some(path))?;
    let text = archetypes_to_xml(&archetypes);
    use base64::Engine;
    let binary_base64 = base64::engine::general_purpose::STANDARD.encode(data);

    Ok(OpenedYtyp {
        path: path.to_string(),
        name: name.to_string(),
        format: "binary".into(),
        text,
        binary_base64: Some(binary_base64),
        archetypes,
    })
}

pub fn apply_special_attributes(
    original: &[u8],
    updates: &[(String, u32)],
    path: Option<&str>,
) -> Result<Vec<u8>, String> {
    let (mut system, graphics, system_flags, graphics_flags) = prepare_rsc7(original)?;
    let archetypes = parse_archetypes(&system, path)?;
    let mut by_hash: HashMap<u32, u32> = HashMap::new();
    let mut by_name: HashMap<String, u32> = HashMap::new();
    for (name, value) in updates {
        by_name.insert(name.to_ascii_lowercase(), *value);
        if let Some(hash) = resolve_name_key(name) {
            by_hash.insert(hash, *value);
        }
    }

    let mut changed = 0usize;
    for arch in &archetypes {
        let value = by_hash
            .get(&arch.name_hash)
            .or_else(|| by_name.get(&arch.name.to_ascii_lowercase()));
        let Some(value) = value else {
            continue;
        };
        let offset = arch.sa_offset as usize;
        if offset + 4 > system.len() {
            continue;
        }
        write_u32_le(&mut system, offset, *value);
        changed += 1;
    }
    if changed == 0 {
        return Err("No matching archetypes were updated in the binary YTYP".into());
    }
    pack_rsc7(&system, &graphics, system_flags, graphics_flags)
}

#[cfg(test)]
mod tests {
    use super::{jenk_hash, resource_size_from_flags};

    #[test]
    fn size_from_flags_matches_codewalker_examples() {
        let flags_8192 = 1u32 << 17;
        assert_eq!(resource_size_from_flags(flags_8192), 8192);

        let flags_16384 = 1u32 << 11;
        assert_eq!(resource_size_from_flags(flags_16384), 16384);

        let flags_24576 = (1u32 << 17) | (1u32 << 11);
        assert_eq!(resource_size_from_flags(flags_24576), 24576);
    }

    #[test]
    fn jenk_hash_matches_codewalker_gen_hash() {
        assert_eq!(jenk_hash("prop_gate_airport_01"), 0x2B3AD141);
    }
}

