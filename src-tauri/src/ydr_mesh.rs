//! YDR drawable mesh extractor with UVs + embedded textures.
//!
//! Independent reimplementation. Format reference:
//! [CodeWalker](https://github.com/dexyfex/CodeWalker) by dexyfex
//! (legacy v165 / Gen9 v159 VertexBuffer, IndexBuffer, VertexDeclarationG9).
//! Not affiliated. No CodeWalker source is shipped here.

use serde::Serialize;

use crate::texture_dict::{
    parse_texture_dictionary, prepare_rsc7, u16_le, u32_le, u64_le, PreviewTexture, ResReader,
};
use crate::ytyp_bin::jenk_hash;

const DIFFUSE_SAMPLERS: &[u32] = &[
    4059966321, // DiffuseSampler
    181641832,  // DiffuseSampler2
    1429813046, // DiffuseSampler3
    4015001285, // DiffuseSamplerPoint
];
const TEXCOORD0: usize = 6;
const TEXCOORD1: usize = 7;

/// Gen9 semantic slots → legacy component (CodeWalker VertexDeclarationG9).
const G9_SLOT_POSITION: usize = 0;
const G9_SLOT_TEXCOORD0: usize = 28;
const G9_SLOT_TEXCOORD1: usize = 29;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YdrMeshPart {
    pub positions: Vec<f32>,
    pub uvs: Vec<f32>,
    pub indices: Vec<u32>,
    pub diffuse_name: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YdrPreview {
    pub name: String,
    pub name_hash: u32,
    pub meshes: Vec<YdrMeshPart>,
    pub textures: Vec<PreviewTexture>,
    pub has_embedded_textures: bool,
    pub missing_diffuse: bool,
    /// RSC7 resource version (YDR: 165 legacy / 159 Gen9).
    pub resource_version: u32,
    /// True when Gen9 layouts were used for textures / mesh.
    pub gen9: bool,
}

#[derive(Clone, Copy)]
struct VertLayout {
    pos_off: usize,
    uv_off: usize,
    uv_half: bool,
}

fn try_vertex_buffer(
    reader: &ResReader<'_>,
    data_ptr: u64,
    count: u32,
    stride: u32,
) -> Option<Vec<u8>> {
    if data_ptr == 0 || count == 0 || stride == 0 || stride > 512 || count > 2_000_000 {
        return None;
    }
    let data_len = (count as usize).checked_mul(stride as usize)?;
    reader.resolve(data_ptr, data_len).map(|s| s.to_vec())
}

fn try_index_bytes(
    reader: &ResReader<'_>,
    data_ptr: u64,
    count: u32,
    index_size: u32,
) -> Option<Vec<u8>> {
    if data_ptr == 0 || count == 0 || index_size == 0 || count > 6_000_000 {
        return None;
    }
    let data_len = (count as usize).checked_mul(index_size as usize)?;
    reader.resolve(data_ptr, data_len).map(|s| s.to_vec())
}

fn g9_element_size(ty: u8) -> usize {
    match ty {
        2 => 16,  // R32G32B32A32_FLOAT
        6 => 12,  // R32G32B32_FLOAT
        10 => 8,  // R16G16B16A16_FLOAT
        16 => 8,  // R32G32_TYPELESS (Float2)
        24 => 4,  // D3DX_R10G10B10A2
        28 | 30 => 4, // R8G8B8A8_*
        34 => 4,  // R16G16_FLOAT (Half2)
        _ => 0,
    }
}

fn g9_is_half2(ty: u8) -> bool {
    ty == 34 // R16G16_FLOAT
}

/// VertexDeclarationG9 @ 320 bytes: Offsets[52], Sizes[52], Types[52], Data u64.
fn layout_from_g9_decl(info_ptr: u64, reader: &ResReader<'_>) -> Option<VertLayout> {
    if info_ptr == 0 {
        return None;
    }
    let raw = reader.resolve(info_ptr, 320)?;
    let types = &raw[260..312];
    let mut pos_off = None;
    let mut uv: Option<(usize, bool)> = None;

    // Prefer declared Offsets[]; fall back to packing order if zeroed.
    let mut packed = 0usize;
    for i in 0..52 {
        let ty = types[i];
        if ty == 0 {
            continue;
        }
        let off = u32_le(raw, i * 4) as usize;
        let use_off = if off != 0 || i == G9_SLOT_POSITION {
            off
        } else {
            packed
        };
        if i == G9_SLOT_POSITION {
            pos_off = Some(use_off);
        } else if i == G9_SLOT_TEXCOORD0 && uv.is_none() {
            uv = Some((use_off, g9_is_half2(ty)));
        } else if i == G9_SLOT_TEXCOORD1 && uv.is_none() {
            uv = Some((use_off, g9_is_half2(ty)));
        }
        packed = packed.saturating_add(g9_element_size(ty));
    }

    let pos_off = pos_off?;
    let (uv_off, uv_half) = uv.unwrap_or((0, true));
    Some(VertLayout {
        pos_off,
        uv_off,
        uv_half,
    })
}

/// Legacy VertexBuffer (128 bytes).
fn parse_vertex_buffer_legacy(
    ptr: u64,
    reader: &ResReader<'_>,
) -> Option<(Vec<u8>, u32, u32, u64)> {
    if ptr == 0 {
        return None;
    }
    let raw = reader.resolve(ptr, 0x40)?;
    let stride = u16_le(raw, 0x08) as u32;
    let count = u32_le(raw, 0x18);
    let info_ptr = u64_le(raw, 0x30);
    if let Some(data) = try_vertex_buffer(reader, u64_le(raw, 0x10), count, stride) {
        return Some((data, count, stride, info_ptr));
    }
    if let Some(data) = try_vertex_buffer(reader, u64_le(raw, 0x20), count, stride) {
        return Some((data, count, stride, info_ptr));
    }
    None
}

/// Gen9 VertexBuffer (64 bytes): Count@8, Stride@0x0C, Data@0x18, Info@0x38.
fn parse_vertex_buffer_gen9(
    ptr: u64,
    reader: &ResReader<'_>,
) -> Option<(Vec<u8>, u32, u32, u64)> {
    if ptr == 0 {
        return None;
    }
    let raw = reader.resolve(ptr, 0x40)?;
    let count = u32_le(raw, 0x08);
    let stride = u16_le(raw, 0x0C) as u32;
    let data_ptr = u64_le(raw, 0x18);
    let info_ptr = u64_le(raw, 0x38);
    let data = try_vertex_buffer(reader, data_ptr, count, stride)?;
    Some((data, count, stride, info_ptr))
}

fn parse_vertex_buffer(
    ptr: u64,
    reader: &ResReader<'_>,
    gen9: bool,
) -> Option<(Vec<u8>, u32, u32, u64)> {
    if gen9 {
        parse_vertex_buffer_gen9(ptr, reader).or_else(|| parse_vertex_buffer_legacy(ptr, reader))
    } else {
        parse_vertex_buffer_legacy(ptr, reader).or_else(|| parse_vertex_buffer_gen9(ptr, reader))
    }
}

/// Legacy IndexBuffer: Count@8, Data@0x10, ushort indices.
fn parse_index_buffer_legacy(ptr: u64, reader: &ResReader<'_>) -> Option<(Vec<u8>, u32, u32)> {
    if ptr == 0 {
        return None;
    }
    let raw = reader.resolve(ptr, 0x40)?;
    let count = u32_le(raw, 0x08);
    try_index_bytes(reader, u64_le(raw, 0x10), count, 2).map(|d| (d, count, 2))
}

/// Gen9 IndexBuffer (64 bytes): Count@8, IndexSize@0x0C, Data@0x18.
fn parse_index_buffer_gen9(ptr: u64, reader: &ResReader<'_>) -> Option<(Vec<u8>, u32, u32)> {
    if ptr == 0 {
        return None;
    }
    let raw = reader.resolve(ptr, 0x40)?;
    let count = u32_le(raw, 0x08);
    let index_size = u16_le(raw, 0x0C) as u32;
    let size = if index_size == 2 || index_size == 4 {
        index_size
    } else {
        2
    };
    try_index_bytes(reader, u64_le(raw, 0x18), count, size).map(|d| (d, count, size))
}

fn parse_index_buffer(
    ptr: u64,
    reader: &ResReader<'_>,
    gen9: bool,
) -> Option<(Vec<u8>, u32, u32)> {
    if gen9 {
        parse_index_buffer_gen9(ptr, reader).or_else(|| parse_index_buffer_legacy(ptr, reader))
    } else {
        parse_index_buffer_legacy(ptr, reader).or_else(|| parse_index_buffer_gen9(ptr, reader))
    }
}

fn component_size(ty: u8) -> usize {
    match ty {
        1 => 4,  // Half2
        2 => 4,  // Float
        3 => 8,  // Half4
        5 => 8,  // Float2
        6 => 12, // Float3
        7 => 16, // Float4
        8 | 9 | 10 => 4,
        _ => 0,
    }
}

fn f16_to_f32(h: u16) -> f32 {
    let sign = (h >> 15) & 1;
    let exp = (h >> 10) & 0x1F;
    let mant = h & 0x3FF;
    let f = if exp == 0 {
        if mant == 0 {
            0.0
        } else {
            let mut m = mant as f32;
            let mut e = -14i32;
            while m < 1.0 {
                m *= 2.0;
                e -= 1;
            }
            m -= 1.0;
            (1.0 + m / 1024.0) * 2f32.powi(e)
        }
    } else if exp == 31 {
        if mant == 0 {
            f32::INFINITY
        } else {
            f32::NAN
        }
    } else {
        (1.0 + mant as f32 / 1024.0) * 2f32.powi(exp as i32 - 15)
    };
    if sign != 0 {
        -f
    } else {
        f
    }
}

/// Legacy VertexDeclaration: (uv_offset, uv_is_half2).
fn uv_layout_legacy(info_ptr: u64, reader: &ResReader<'_>) -> Option<(usize, bool)> {
    if info_ptr == 0 {
        return None;
    }
    let raw = reader.resolve(info_ptr, 16)?;
    let flags = u32_le(raw, 0);
    let types = u64_le(raw, 8);
    for sem in [TEXCOORD0, TEXCOORD1] {
        if ((flags >> sem) & 1) == 0 {
            continue;
        }
        let mut offset = 0usize;
        for k in 0..sem {
            if ((flags >> k) & 1) == 1 {
                let ty = ((types >> (k * 4)) & 0xF) as u8;
                offset += component_size(ty);
            }
        }
        let ty = ((types >> (sem * 4)) & 0xF) as u8;
        let is_half = ty == 1; // Half2
        if component_size(ty) == 0 {
            continue;
        }
        return Some((offset, is_half));
    }
    None
}

fn fallback_uv_layout(stride: u32) -> Option<(usize, bool)> {
    let s = stride as usize;
    if s >= 28 {
        return Some((s - 4, true));
    }
    if s >= 20 {
        return Some((s - 8, false));
    }
    None
}

fn read_u16_at(b: &[u8], off: usize) -> u16 {
    match b.get(off..off + 2).and_then(|s| <[u8; 2]>::try_from(s).ok()) {
        Some(bytes) => u16::from_le_bytes(bytes),
        None => 0,
    }
}

fn read_u32_at(b: &[u8], off: usize) -> u32 {
    match b.get(off..off + 4).and_then(|s| <[u8; 4]>::try_from(s).ok()) {
        Some(bytes) => u32::from_le_bytes(bytes),
        None => 0,
    }
}

fn read_f32_at(b: &[u8], off: usize) -> f32 {
    match b.get(off..off + 4).and_then(|s| <[u8; 4]>::try_from(s).ok()) {
        Some(bytes) => f32::from_le_bytes(bytes),
        None => 0.0,
    }
}

fn read_uv(vb: &[u8], off: usize, half: bool) -> (f32, f32) {
    if half {
        if off + 4 > vb.len() {
            return (0.0, 0.0);
        }
        (f16_to_f32(read_u16_at(vb, off)), f16_to_f32(read_u16_at(vb, off + 2)))
    } else {
        if off + 8 > vb.len() {
            return (0.0, 0.0);
        }
        (read_f32_at(vb, off), read_f32_at(vb, off + 4))
    }
}

fn resolve_vert_layout(
    info_ptr: u64,
    reader: &ResReader<'_>,
    stride: u32,
    gen9: bool,
) -> VertLayout {
    if gen9 {
        if let Some(l) = layout_from_g9_decl(info_ptr, reader) {
            return l;
        }
    }
    let (uv_off, uv_half) = uv_layout_legacy(info_ptr, reader)
        .or_else(|| {
            if !gen9 {
                None
            } else {
                layout_from_g9_decl(info_ptr, reader).map(|l| (l.uv_off, l.uv_half))
            }
        })
        .or_else(|| fallback_uv_layout(stride))
        .unwrap_or((0, true));
    VertLayout {
        pos_off: 0,
        uv_off,
        uv_half,
    }
}

fn texture_base_name(ptr: u64, reader: &ResReader<'_>) -> Option<String> {
    if ptr == 0 {
        return None;
    }
    // TextureBase.NamePointer @ 0x28 for both legacy and Gen9.
    let raw = reader.resolve(ptr, 0x50)?;
    let name_ptr = u64_le(raw, 0x28);
    reader.string_at(name_ptr)
}

/// Legacy ShaderFX (48 bytes): ParametersPointer@0, ParameterCount@0x10, hashes after vectors.
fn diffuse_from_shader_legacy(shader_ptr: u64, reader: &ResReader<'_>) -> Option<String> {
    let raw = reader.resolve(shader_ptr, 0x30)?;
    let params_ptr = u64_le(raw, 0x00);
    let param_count = raw[0x10] as usize;
    if params_ptr == 0 || param_count == 0 || param_count > 128 {
        return None;
    }
    let params_bytes = reader.resolve(params_ptr, param_count * 16)?;
    let mut first_tex: Option<String> = None;
    let mut diffuse: Option<String> = None;

    let mut vec_bytes = 0usize;
    let mut tex_ptrs: Vec<(usize, u64)> = Vec::new();
    for i in 0..param_count {
        let off = i * 16;
        let data_type = params_bytes[off];
        let data_ptr = u64_le(params_bytes, off + 8);
        if data_type == 0 {
            tex_ptrs.push((i, data_ptr));
        } else {
            vec_bytes += 16 * data_type as usize;
        }
    }
    let hashes_off = param_count * 16 + vec_bytes;
    let hashes = reader.resolve(params_ptr + hashes_off as u64, param_count * 4);

    for (i, data_ptr) in tex_ptrs {
        let name = texture_base_name(data_ptr, reader);
        if first_tex.is_none() {
            first_tex = name.clone();
        }
        if let Some(hraw) = hashes {
            let hash = u32_le(hraw, i * 4);
            if DIFFUSE_SAMPLERS.contains(&hash) {
                diffuse = name;
                break;
            }
        }
    }
    diffuse.or(first_tex)
}

/// Gen9 ShaderFX (64 bytes) + ShaderParamInfosG9 - no ShadersGen9Conversion.xml needed;
/// we match known DiffuseSampler hashes and fall back to the first texture param.
fn diffuse_from_shader_gen9(shader_ptr: u64, reader: &ResReader<'_>) -> Option<String> {
    let raw = reader.resolve(shader_ptr, 0x40)?;
    let tex_refs = u64_le(raw, 0x10);
    let infos_ptr = u64_le(raw, 0x20);
    if tex_refs == 0 || infos_ptr == 0 {
        return None;
    }
    let infos = reader.resolve(infos_ptr, 8)?;
    let num_textures = infos[1] as usize;
    let num_params = infos[4] as usize;
    if num_textures == 0 || num_textures > 64 || num_params == 0 || num_params > 256 {
        return None;
    }
    let params = reader.resolve(infos_ptr + 8, num_params * 8)?;
    // First of the multi-thread copies is enough for name resolution.
    let tex_ptrs = reader.resolve(tex_refs, num_textures * 8)?;

    let mut first_tex: Option<String> = None;
    let mut diffuse: Option<String> = None;
    for i in 0..num_params {
        let name_hash = u32_le(params, i * 8);
        let data = u32_le(params, i * 8 + 4);
        let ty = data & 0x3;
        if ty != 0 {
            continue; // Texture = 0
        }
        let tex_idx = ((data >> 2) & 0xFF) as usize;
        if tex_idx >= num_textures {
            continue;
        }
        let tptr = u64_le(tex_ptrs, tex_idx * 8);
        let name = texture_base_name(tptr, reader);
        if first_tex.is_none() {
            first_tex = name.clone();
        }
        if DIFFUSE_SAMPLERS.contains(&name_hash) {
            diffuse = name;
            break;
        }
    }
    diffuse.or(first_tex)
}

fn diffuse_from_shader(shader_ptr: u64, reader: &ResReader<'_>, gen9: bool) -> Option<String> {
    if gen9 {
        diffuse_from_shader_gen9(shader_ptr, reader)
            .or_else(|| diffuse_from_shader_legacy(shader_ptr, reader))
    } else {
        diffuse_from_shader_legacy(shader_ptr, reader)
            .or_else(|| diffuse_from_shader_gen9(shader_ptr, reader))
    }
}

fn load_shaders(shader_group_ptr: u64, reader: &ResReader<'_>, gen9: bool) -> Vec<Option<String>> {
    if shader_group_ptr == 0 {
        return Vec::new();
    }
    let Some(sg) = reader.resolve(shader_group_ptr, 0x20) else {
        return Vec::new();
    };
    let shaders_ptr = u64_le(sg, 0x10);
    let count = u16_le(sg, 0x18) as usize;
    if shaders_ptr == 0 || count == 0 || count > 256 {
        return Vec::new();
    }
    let Some(ptrs) = reader.resolve(shaders_ptr, count * 8) else {
        return Vec::new();
    };
    let mut out = Vec::with_capacity(count);
    for i in 0..count {
        let sp = u64_le(ptrs, i * 8);
        out.push(if sp == 0 {
            None
        } else {
            diffuse_from_shader(sp, reader, gen9)
        });
    }
    out
}

fn mesh_from_geometry(
    ptr: u64,
    reader: &ResReader<'_>,
    diffuse_name: Option<String>,
    gen9: bool,
) -> Option<YdrMeshPart> {
    let raw = reader.resolve(ptr, 0x98)?;
    let vb_ptr = u64_le(raw, 0x18);
    let ib_ptr = u64_le(raw, 0x38);
    let vertices_count = u16_le(raw, 0x60) as u32;
    let vertex_stride = u16_le(raw, 0x70) as u32;
    let vertex_data_ptr = u64_le(raw, 0x78);

    let (vb_data, count, stride, info_ptr) =
        parse_vertex_buffer(vb_ptr, reader, gen9).or_else(|| {
            let data = try_vertex_buffer(reader, vertex_data_ptr, vertices_count, vertex_stride)?;
            Some((data, vertices_count, vertex_stride, 0))
        })?;
    let (ib_data, ib_count, index_size) = parse_index_buffer(ib_ptr, reader, gen9)?;

    if stride < 12 || count == 0 || ib_count < 3 {
        return None;
    }

    let layout = resolve_vert_layout(info_ptr, reader, stride, gen9);
    let pos_off = layout.pos_off;
    let uv_off = layout.uv_off;
    let uv_half = layout.uv_half;

    let mut positions = Vec::with_capacity(count as usize * 3);
    let mut uvs = Vec::with_capacity(count as usize * 2);
    for i in 0..count as usize {
        let base = i * stride as usize;
        let po = base + pos_off;
        if po + 12 > vb_data.len() {
            break;
        }
        let x = read_f32_at(&vb_data, po);
        let y = read_f32_at(&vb_data, po + 4);
        let z = read_f32_at(&vb_data, po + 8);
        // GTA Z-up → Three.js Y-up
        positions.push(x);
        positions.push(z);
        positions.push(-y);

        let need = if uv_half { 4 } else { 8 };
        let (u, v) = if uv_off + need <= stride as usize {
            read_uv(&vb_data, base + uv_off, uv_half)
        } else {
            (0.0, 0.0)
        };
        uvs.push(u);
        uvs.push(1.0 - v);
    }

    let mut indices = Vec::with_capacity(ib_count as usize);
    if index_size == 2 {
        for i in 0..(ib_count as usize) {
            let off = i * 2;
            if off + 2 > ib_data.len() {
                break;
            }
            indices.push(u32::from(read_u16_at(&ib_data, off)));
        }
    } else if index_size == 4 {
        for i in 0..(ib_count as usize) {
            let off = i * 4;
            if off + 4 > ib_data.len() {
                break;
            }
            indices.push(read_u32_at(&ib_data, off));
        }
    } else {
        return None;
    }

    if positions.len() < 9 || indices.len() < 3 {
        return None;
    }

    Some(YdrMeshPart {
        positions,
        uvs,
        indices,
        diffuse_name,
    })
}

fn parse_model(
    ptr: u64,
    reader: &ResReader<'_>,
    shaders: &[Option<String>],
    gen9: bool,
) -> Vec<YdrMeshPart> {
    let Some(raw) = reader.resolve(ptr, 0x30) else {
        return Vec::new();
    };
    let geoms_ptr = u64_le(raw, 0x08);
    let geoms_count = u16_le(raw, 0x10) as usize;
    let shader_map_ptr = u64_le(raw, 0x20);
    if geoms_count == 0 || geoms_ptr == 0 || geoms_count > 256 {
        return Vec::new();
    }
    let Some(ptr_data) = reader.resolve(geoms_ptr, geoms_count * 8) else {
        return Vec::new();
    };
    let shader_ids = reader
        .resolve(shader_map_ptr, geoms_count * 2)
        .map(|b| {
            (0..geoms_count)
                .map(|i| u16_le(b, i * 2) as usize)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let mut out = Vec::new();
    for i in 0..geoms_count {
        let geom_va = u64_le(ptr_data, i * 8);
        if geom_va == 0 {
            continue;
        }
        let diffuse = shader_ids
            .get(i)
            .and_then(|&sid| shaders.get(sid).cloned().flatten());
        if let Some(mesh) = mesh_from_geometry(geom_va, reader, diffuse, gen9) {
            out.push(mesh);
        }
    }
    out
}

fn parse_models(
    ptr: u64,
    reader: &ResReader<'_>,
    shaders: &[Option<String>],
    gen9: bool,
) -> Vec<YdrMeshPart> {
    if ptr == 0 {
        return Vec::new();
    }
    let Some(raw) = reader.resolve(ptr, 16) else {
        return Vec::new();
    };
    let data_ptr = u64_le(raw, 0);
    let count = u16_le(raw, 8) as usize;
    let capacity = u16_le(raw, 10) as usize;
    let n = count.max(capacity).min(64);
    if n == 0 || data_ptr == 0 {
        return Vec::new();
    }
    let Some(ptr_data) = reader.resolve(data_ptr, n * 8) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for i in 0..count.min(n) {
        let model_va = u64_le(ptr_data, i * 8);
        if model_va == 0 {
            continue;
        }
        out.extend(parse_model(model_va, reader, shaders, gen9));
    }
    out
}

fn parse_drawable(
    ptr: u64,
    reader: &ResReader<'_>,
    gen9: bool,
    resource_version: u32,
) -> Result<YdrPreview, String> {
    let raw = reader
        .resolve(ptr, 0xB0)
        .ok_or_else(|| "Drawable header out of bounds".to_string())?;

    let shader_group_ptr = u64_le(raw, 0x10);
    let high_models_ptr = u64_le(raw, 0x50);
    let models_ptr = match u64_le(raw, 0xA0) {
        0 => high_models_ptr,
        p => p,
    };
    let name_ptr = u64_le(raw, 0xA8);
    let name = reader
        .string_at(name_ptr)
        .unwrap_or_else(|| "drawable".into());

    let shaders = load_shaders(shader_group_ptr, reader, gen9);

    let mut textures = Vec::new();
    let mut has_embedded = false;
    if shader_group_ptr != 0 {
        if let Some(sg) = reader.resolve(shader_group_ptr, 0x10) {
            let td_ptr = u64_le(sg, 0x08);
            if td_ptr != 0 {
                textures = parse_texture_dictionary(td_ptr, reader, "embedded", gen9);
                has_embedded = !textures.is_empty();
            }
        }
    }

    let mut meshes = parse_models(models_ptr, reader, &shaders, gen9);
    if meshes.is_empty() && high_models_ptr != 0 && high_models_ptr != models_ptr {
        meshes = parse_models(high_models_ptr, reader, &shaders, gen9);
    }
    if meshes.is_empty() {
        let med = u64_le(raw, 0x58);
        meshes = parse_models(med, reader, &shaders, gen9);
    }
    if meshes.is_empty() {
        return Err("No renderable geometry found in this YDR".into());
    }

    // If shaders didn't name a diffuse but we only have one texture, bind it.
    if textures.len() == 1 {
        let only = textures[0].name.clone();
        for m in &mut meshes {
            if m.diffuse_name.is_none() {
                m.diffuse_name = Some(only.clone());
            }
        }
    }

    let missing_diffuse = meshes.iter().any(|m| {
        m.diffuse_name
            .as_ref()
            .map(|n| !textures.iter().any(|t| t.name.eq_ignore_ascii_case(n)))
            .unwrap_or(true)
    });

    let name_hash = jenk_hash(&name.to_ascii_lowercase());

    Ok(YdrPreview {
        name,
        name_hash,
        meshes,
        textures,
        has_embedded_textures: has_embedded,
        missing_diffuse,
        resource_version,
        gen9,
    })
}

pub fn extract_ydr_preview(data: &[u8]) -> Result<YdrPreview, String> {
    let image = prepare_rsc7(data, "YDR")?;
    let reader = ResReader {
        system: &image.system,
        graphics: &image.graphics,
    };
    let known_gen9 = image.is_gen9_ydr();
    let known_legacy = image.version == 165;
    let gen9 = if known_legacy {
        false
    } else if known_gen9 {
        true
    } else {
        // Ambiguous version - prefer Gen9 for Enhanced assets.
        true
    };

    let mut preview = parse_drawable(0x5000_0000, &reader, gen9, image.version)?;
    // Flip layout if the other mode yields more geometry / textures (ambiguous versions only).
    if !known_gen9 && !known_legacy {
        let alt_gen9 = !gen9;
        if let Ok(alt) = parse_drawable(0x5000_0000, &reader, alt_gen9, image.version) {
            let prefer_alt = (alt.meshes.len() > preview.meshes.len())
                || (alt.textures.len() > preview.textures.len()
                    && alt.meshes.len() >= preview.meshes.len());
            if prefer_alt {
                preview = alt;
            }
        }
    }
    Ok(preview)
}
