//! Shared RSC7 TextureDictionary parsing (standalone .ytd + embedded in .ydr).
//!
//! Independent reimplementation. Format reference:
//! [CodeWalker](https://github.com/dexyfex/CodeWalker) by dexyfex
//! (YTD legacy v13 / Gen9 v5, TextureBase, mip pitch). Not affiliated.
//! No CodeWalker source is shipped here.

use flate2::read::DeflateDecoder;
use serde::Serialize;
use std::io::Read;

use crate::ytyp_bin::{resource_size_from_flags, RSC7_MAGIC};

pub(crate) struct ResReader<'a> {
    pub system: &'a [u8],
    pub graphics: &'a [u8],
}

impl<'a> ResReader<'a> {
    pub fn resolve(&self, va: u64, len: usize) -> Option<&'a [u8]> {
        if va == 0 || len == 0 {
            return None;
        }
        if (va & 0x5000_0000) == 0x5000_0000 && (va & 0x6000_0000) != 0x6000_0000 {
            let off = (va - 0x5000_0000) as usize;
            self.system.get(off..off.checked_add(len)?)
        } else if (va & 0x6000_0000) == 0x6000_0000 {
            let off = (va - 0x6000_0000) as usize;
            self.graphics.get(off..off.checked_add(len)?)
        } else {
            None
        }
    }

    pub fn string_at(&self, va: u64) -> Option<String> {
        if (va & 0x5000_0000) != 0x5000_0000 || (va & 0x6000_0000) == 0x6000_0000 {
            return None;
        }
        let off = (va - 0x5000_0000) as usize;
        let slice = self.system.get(off..)?;
        let end = slice.iter().position(|&b| b == 0).unwrap_or(slice.len().min(256));
        let s = String::from_utf8_lossy(&slice[..end]).into_owned();
        if s.is_empty() {
            None
        } else {
            Some(s)
        }
    }
}

pub(crate) fn u16_le(b: &[u8], off: usize) -> u16 {
    match b.get(off..off + 2).and_then(|s| <[u8; 2]>::try_from(s).ok()) {
        Some(bytes) => u16::from_le_bytes(bytes),
        None => 0,
    }
}

pub(crate) fn u32_le(b: &[u8], off: usize) -> u32 {
    match b.get(off..off + 4).and_then(|s| <[u8; 4]>::try_from(s).ok()) {
        Some(bytes) => u32::from_le_bytes(bytes),
        None => 0,
    }
}

pub(crate) fn u64_le(b: &[u8], off: usize) -> u64 {
    match b.get(off..off + 8).and_then(|s| <[u8; 8]>::try_from(s).ok()) {
        Some(bytes) => u64::from_le_bytes(bytes),
        None => 0,
    }
}

#[derive(Debug, Clone)]
pub struct Rsc7Image {
    pub system: Vec<u8>,
    pub graphics: Vec<u8>,
    pub version: u32,
}

impl Rsc7Image {
    pub fn is_gen9_ytd(&self) -> bool {
        // CodeWalker: YTD Gen9 = 5, legacy = 13
        self.version == 5
    }

    pub fn is_gen9_ydr(&self) -> bool {
        // CodeWalker: YDR Gen9 = 159, legacy = 165
        self.version == 159
    }
}

/// CodeWalker `RpfFile.GetVersionFromFlags` - packed into page flags as well as header.
fn version_from_flags(system_flags: u32, graphics_flags: u32) -> u32 {
    let sv = (system_flags >> 28) & 0xF;
    let gv = (graphics_flags >> 28) & 0xF;
    (sv << 4) | gv
}

fn decompress_rsc7_body(body: &[u8]) -> Vec<u8> {
    // Prefer raw DEFLATE (CodeWalker ResourceBuilder.Compress), then zlib wrapper.
    let try_raw = || {
        let mut out = Vec::new();
        DeflateDecoder::new(body)
            .read_to_end(&mut out)
            .ok()
            .filter(|_| !out.is_empty())
            .map(|_| out)
    };
    let try_zlib = || {
        use flate2::read::ZlibDecoder;
        let mut out = Vec::new();
        ZlibDecoder::new(body)
            .read_to_end(&mut out)
            .ok()
            .filter(|_| !out.is_empty())
            .map(|_| out)
    };
    try_raw()
        .or_else(try_zlib)
        .unwrap_or_else(|| body.to_vec())
}

pub(crate) fn prepare_rsc7(data: &[u8], kind: &str) -> Result<Rsc7Image, String> {
    if data.len() < 16 {
        return Err(format!("{kind} file is too small"));
    }
    if u32_le(data, 0) != RSC7_MAGIC {
        return Err(format!("Not a binary RSC7 {kind} file"));
    }
    let header_version = u32_le(data, 4);
    let system_flags = u32_le(data, 8);
    let graphics_flags = u32_le(data, 12);
    let flag_version = version_from_flags(system_flags, graphics_flags);
    // Prefer the explicit RSC7 version dword; fall back to flags when header is odd.
    let version = if header_version == 5
        || header_version == 13
        || header_version == 159
        || header_version == 165
        || header_version == flag_version
    {
        header_version
    } else if flag_version == 5
        || flag_version == 13
        || flag_version == 159
        || flag_version == 165
    {
        flag_version
    } else {
        header_version
    };
    let sys_size = resource_size_from_flags(system_flags);
    let gfx_size = resource_size_from_flags(graphics_flags);
    let decompressed = decompress_rsc7_body(&data[16..]);
    if decompressed.len() < sys_size {
        return Err(format!(
            "Decompressed {kind} is truncated ({} < {sys_size})",
            decompressed.len()
        ));
    }
    let system = decompressed[..sys_size].to_vec();
    let graphics = if gfx_size > 0 && decompressed.len() >= sys_size + gfx_size {
        decompressed[sys_size..sys_size + gfx_size].to_vec()
    } else {
        decompressed[sys_size..].to_vec()
    };
    Ok(Rsc7Image {
        system,
        graphics,
        version,
    })
}

/// RGBA8 texture ready for Three.js DataTexture.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewTexture {
    pub name: String,
    pub width: u32,
    pub height: u32,
    /// Raw RGBA8 bytes, base64-encoded.
    pub rgba_base64: String,
    pub source: String, // "embedded" | "ytd"
}

// Legacy D3D formats
const FMT_A8R8G8B8: u32 = 21;
const FMT_X8R8G8B8: u32 = 22;
const FMT_A8: u32 = 28;
const FMT_A8B8G8R8: u32 = 32;
const FMT_L8: u32 = 50;
const FMT_DXT1: u32 = 0x3154_5844;
const FMT_DXT3: u32 = 0x3354_5844;
const FMT_DXT5: u32 = 0x3554_5844;
const FMT_ATI1: u32 = 0x3149_5441;
const FMT_ATI2: u32 = 0x3249_5441;
const FMT_BC7: u32 = 0x2037_4342;

/// Map Gen9 BufferFormat (DXGI-style) → legacy TextureFormat used by our decoder.
/// Mirrors CodeWalker `TextureBase.GetLegacyFormat` + common TYPELESS/SRGB variants.
fn g9_to_legacy(g9: u8) -> u32 {
    match g9 {
        0x1B | 0x1C | 0x1D | 0x1E | 0x1F | 0x20 => FMT_A8B8G8R8, // R8G8B8A8_*
        0x56 | 0x57 | 0x5A | 0x5B => FMT_A8R8G8B8,              // B8G8R8A8_*
        0x41 => FMT_A8,                                         // A8_UNORM
        0x3D => FMT_L8,                                         // R8_UNORM
        0x46 | 0x47 | 0x48 => FMT_DXT1,                         // BC1
        0x49 | 0x4A | 0x4B => FMT_DXT3,                         // BC2
        0x4C | 0x4D | 0x4E => FMT_DXT5,                         // BC3
        0x4F | 0x50 | 0x51 => FMT_ATI1,                         // BC4
        0x52 | 0x53 | 0x54 => FMT_ATI2,                         // BC5
        0x61 | 0x62 | 0x63 => FMT_BC7,                          // BC7
        _ => FMT_A8R8G8B8,
    }
}

fn compute_pitch(format: u32, width: u32, height: u32) -> (usize, usize) {
    let w = width.max(1) as usize;
    let h = height.max(1) as usize;
    match format {
        FMT_DXT1 | FMT_ATI1 => {
            let row = ((w + 3) / 4) * 8;
            (row, row * ((h + 3) / 4))
        }
        FMT_DXT3 | FMT_DXT5 | FMT_ATI2 | FMT_BC7 => {
            let row = ((w + 3) / 4) * 16;
            (row, row * ((h + 3) / 4))
        }
        FMT_A8 | FMT_L8 => (w, w * h),
        _ => {
            let row = w * 4;
            (row, row * h)
        }
    }
}

fn calc_data_size(format: u32, width: u32, height: u32, depth: u32, levels: u32) -> usize {
    let mut div = 1u32;
    let mut len = 0usize;
    let depth = depth.max(1);
    for _ in 0..levels.max(1) {
        let mw = (width / div).max(1);
        let mh = (height / div).max(1);
        let (_row, slice) = compute_pitch(format, mw, mh);
        len = len.saturating_add(slice.saturating_mul(depth as usize));
        div = div.saturating_mul(2);
    }
    len
}

fn mip0_len(stride: u32, height: u32) -> usize {
    (stride as usize).saturating_mul(height as usize)
}

fn bgra_u32_to_rgba(pixels: &[u32]) -> Vec<u8> {
    let mut out = Vec::with_capacity(pixels.len() * 4);
    for p in pixels {
        let b = (p & 0xFF) as u8;
        let g = ((p >> 8) & 0xFF) as u8;
        let r = ((p >> 16) & 0xFF) as u8;
        let a = ((p >> 24) & 0xFF) as u8;
        out.extend_from_slice(&[r, g, b, a]);
    }
    out
}

fn decode_block_format(format: u32, width: u32, height: u32, data: &[u8]) -> Option<Vec<u8>> {
    let w = width as usize;
    let h = height as usize;
    let mut image = vec![0u32; w * h];
    let ok = match format {
        FMT_DXT1 => texture2ddecoder::decode_bc1(data, w, h, &mut image).is_ok(),
        FMT_DXT3 => texture2ddecoder::decode_bc2(data, w, h, &mut image).is_ok(),
        FMT_DXT5 => texture2ddecoder::decode_bc3(data, w, h, &mut image).is_ok(),
        FMT_ATI1 => texture2ddecoder::decode_bc4(data, w, h, &mut image).is_ok(),
        FMT_ATI2 => texture2ddecoder::decode_bc5(data, w, h, &mut image).is_ok(),
        FMT_BC7 => texture2ddecoder::decode_bc7(data, w, h, &mut image).is_ok(),
        _ => false,
    };
    if ok {
        Some(bgra_u32_to_rgba(&image))
    } else {
        None
    }
}

fn decode_rgba8(format: u32, width: u32, height: u32, stride: u32, data: &[u8]) -> Option<Vec<u8>> {
    if width == 0 || height == 0 {
        return None;
    }
    let (_row, slice) = compute_pitch(format, width, height);
    let need = if stride > 0 {
        mip0_len(stride, height).max(slice)
    } else {
        slice
    };
    let mip = if data.len() >= need {
        &data[..need]
    } else if data.len() >= slice {
        &data[..slice]
    } else {
        data
    };

    match format {
        FMT_A8R8G8B8 | FMT_X8R8G8B8 => {
            let pitch = if stride > 0 { stride } else { width * 4 };
            Some(bgra_to_rgba(mip, width, height, pitch))
        }
        FMT_A8B8G8R8 => {
            let pitch = if stride > 0 { stride } else { width * 4 };
            Some(rgba_copy(mip, width, height, pitch))
        }
        FMT_A8 | FMT_L8 => {
            let pitch = if stride > 0 { stride } else { width };
            Some(l8_to_rgba(mip, width, height, pitch))
        }
        FMT_DXT1 | FMT_DXT3 | FMT_DXT5 | FMT_ATI1 | FMT_ATI2 | FMT_BC7 => {
            decode_block_format(format, width, height, mip)
        }
        _ => decode_block_format(FMT_BC7, width, height, mip)
            .or_else(|| decode_block_format(FMT_DXT5, width, height, mip)),
    }
}

fn bgra_to_rgba(src: &[u8], width: u32, height: u32, stride: u32) -> Vec<u8> {
    let mut out = vec![0u8; (width * height * 4) as usize];
    for y in 0..height as usize {
        let row = y * stride as usize;
        for x in 0..width as usize {
            let i = row + x * 4;
            let o = (y * width as usize + x) * 4;
            if i + 3 >= src.len() {
                break;
            }
            out[o] = src[i + 2];
            out[o + 1] = src[i + 1];
            out[o + 2] = src[i];
            out[o + 3] = src[i + 3];
        }
    }
    out
}

fn rgba_copy(src: &[u8], width: u32, height: u32, stride: u32) -> Vec<u8> {
    let mut out = vec![0u8; (width * height * 4) as usize];
    for y in 0..height as usize {
        let row = y * stride as usize;
        for x in 0..width as usize {
            let i = row + x * 4;
            let o = (y * width as usize + x) * 4;
            if i + 3 >= src.len() {
                break;
            }
            out[o..o + 4].copy_from_slice(&src[i..i + 4]);
        }
    }
    out
}

fn l8_to_rgba(src: &[u8], width: u32, height: u32, stride: u32) -> Vec<u8> {
    let mut out = vec![0u8; (width * height * 4) as usize];
    for y in 0..height as usize {
        let row = y * stride as usize;
        for x in 0..width as usize {
            let i = row + x;
            let o = (y * width as usize + x) * 4;
            if i >= src.len() {
                break;
            }
            let v = src[i];
            out[o] = v;
            out[o + 1] = v;
            out[o + 2] = v;
            out[o + 3] = 255;
        }
    }
    out
}

fn to_base64(bytes: &[u8]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

fn finish_texture(
    name: String,
    width: u32,
    height: u32,
    format: u32,
    stride: u32,
    levels: u32,
    depth: u32,
    data_ptr: u64,
    reader: &ResReader<'_>,
    source: &str,
    alt_size: Option<usize>,
) -> Option<PreviewTexture> {
    if width == 0 || height == 0 || data_ptr == 0 {
        return None;
    }
    let computed = calc_data_size(format, width, height, depth, levels);
    // Gen9 stores BlockCount×BlockStride as the real graphics buffer; prefer it when present.
    let full = match alt_size {
        Some(alt) if alt > 0 && alt <= 64 * 1024 * 1024 => {
            if computed == 0 || alt >= computed / 2 {
                alt
            } else {
                computed
            }
        }
        _ => computed,
    };
    if full == 0 || full > 64 * 1024 * 1024 {
        return None;
    }
    let data = reader.resolve(data_ptr, full)?;
    let rgba = decode_rgba8(format, width, height, stride, data)?;
    Some(PreviewTexture {
        name,
        width,
        height,
        rgba_base64: to_base64(&rgba),
        source: source.to_string(),
    })
}

/// Legacy Texture (144 bytes): Name@0x28, Width@0x50, Stride@0x56, Format@0x58, Levels@0x5D, Data@0x70
fn read_texture_legacy(ptr: u64, reader: &ResReader<'_>, source: &str) -> Option<PreviewTexture> {
    let raw = reader.resolve(ptr, 0x90)?;
    let name_ptr = u64_le(raw, 0x28);
    let name = reader.string_at(name_ptr).unwrap_or_else(|| format!("tex_{ptr:x}"));
    let width = u16_le(raw, 0x50) as u32;
    let height = u16_le(raw, 0x52) as u32;
    let depth = u16_le(raw, 0x54).max(1) as u32;
    let stride = u16_le(raw, 0x56) as u32;
    let format = u32_le(raw, 0x58);
    let levels = raw.get(0x5D).copied().unwrap_or(1).max(1) as u32;
    let data_ptr = u64_le(raw, 0x70);
    finish_texture(
        name, width, height, format, stride, levels, depth, data_ptr, reader, source, None,
    )
}

/// Gen9 TextureBase (80 bytes) layout from CodeWalker TextureBase.Read(IsGen9).
fn read_texture_gen9(ptr: u64, reader: &ResReader<'_>, source: &str) -> Option<PreviewTexture> {
    let raw = reader.resolve(ptr, 0x50)?;
    let block_count = u32_le(raw, 0x08);
    let block_stride = u32_le(raw, 0x0C);
    let width = u16_le(raw, 0x18) as u32;
    let height = u16_le(raw, 0x1A) as u32;
    let depth = u16_le(raw, 0x1C).max(1) as u32;
    let g9_format = raw.get(0x1F).copied().unwrap_or(0);
    let levels = raw.get(0x22).copied().unwrap_or(1).max(1) as u32;
    let name_ptr = u64_le(raw, 0x28);
    let data_ptr = u64_le(raw, 0x38);
    let name = reader.string_at(name_ptr).unwrap_or_else(|| format!("tex_{ptr:x}"));
    let format = g9_to_legacy(g9_format);
    let (stride, _) = compute_pitch(format, width, height);
    let alt = if block_count > 0 && block_stride > 0 {
        Some((block_count as usize).saturating_mul(block_stride as usize))
    } else {
        None
    };
    finish_texture(
        name,
        width,
        height,
        format,
        stride as u32,
        levels,
        depth,
        data_ptr,
        reader,
        source,
        alt,
    )
}

fn read_texture(ptr: u64, reader: &ResReader<'_>, source: &str, gen9: bool) -> Option<PreviewTexture> {
    if gen9 {
        read_texture_gen9(ptr, reader, source).or_else(|| read_texture_legacy(ptr, reader, source))
    } else {
        read_texture_legacy(ptr, reader, source).or_else(|| read_texture_gen9(ptr, reader, source))
    }
}

/// Parse TextureDictionary at a system VA (YTD root or ShaderGroup embed).
pub fn parse_texture_dictionary(
    ptr: u64,
    reader: &ResReader<'_>,
    source: &str,
    gen9: bool,
) -> Vec<PreviewTexture> {
    if ptr == 0 {
        return Vec::new();
    }
    let Some(raw) = reader.resolve(ptr, 0x40) else {
        return Vec::new();
    };
    // ResourceSimpleList64_uint TextureNameHashes @ 0x20
    // ResourcePointerList64<Texture> Textures @ 0x30
    let tex_list_ptr = u64_le(raw, 0x30);
    let tex_count = u16_le(raw, 0x38) as usize;
    if tex_list_ptr == 0 || tex_count == 0 || tex_count > 4096 {
        return Vec::new();
    }
    let Some(ptrs) = reader.resolve(tex_list_ptr, tex_count * 8) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for i in 0..tex_count {
        let tptr = u64_le(ptrs, i * 8);
        if tptr == 0 {
            continue;
        }
        if let Some(tex) = read_texture(tptr, reader, source, gen9) {
            out.push(tex);
        }
    }
    // If preferred layout failed entirely, flip Gen9 flag once.
    if out.is_empty() {
        for i in 0..tex_count {
            let tptr = u64_le(ptrs, i * 8);
            if tptr == 0 {
                continue;
            }
            if let Some(tex) = read_texture(tptr, reader, source, !gen9) {
                out.push(tex);
            }
        }
    }
    out
}

pub fn extract_ytd_textures(data: &[u8]) -> Result<Vec<PreviewTexture>, String> {
    let image = prepare_rsc7(data, "YTD")?;
    let reader = ResReader {
        system: &image.system,
        graphics: &image.graphics,
    };
    // Prefer version bit; also try the other layout if empty.
    let mut gen9 = image.is_gen9_ytd();
    if image.version != 5 && image.version != 13 {
        // Ambiguous version - probe Gen9 first for Enhanced assets, then legacy.
        gen9 = true;
    }
    let mut textures = parse_texture_dictionary(0x5000_0000, &reader, "ytd", gen9);
    if textures.is_empty() {
        textures = parse_texture_dictionary(0x5000_0000, &reader, "ytd", !gen9);
    }
    if textures.is_empty() {
        return Err(format!(
            "No textures found in this YTD (resource version {})",
            image.version
        ));
    }
    Ok(textures)
}
