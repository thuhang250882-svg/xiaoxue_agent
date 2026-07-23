"""
Xiaoxue 3D Character Model Generator v2
录井小雪 高质量3D角色模型生成器

Uses raw GLB binary generation for full control over:
- Smooth vertex normals (Phong shading)
- Higher subdivision surfaces
- Proper PBR materials
- Clean geometry without boolean artifacts

Character: Chibi-style young female petroleum engineer
- Large expressive head (chibi proportion ~55%)
- Compact body in red work uniform
- White safety helmet with PetroChina branding
- Cute, friendly, professional appearance
"""

import struct
import json
import numpy as np
import os
import base64
import tempfile

# ─── GLB Builder ──────────────────────────────────────────────────────────────

class GLBBuilder:
    """Low-level GLB binary builder."""

    def __init__(self):
        self.meshes = []      # list of dict: vertices, normals, indices, material
        self.materials = []   # list of dict: name, pbrBaseColor, metallic, roughness

    def add_material(self, name, base_color, metallic=0.0, roughness=0.5, emissive=None):
        """Add a PBR material. base_color = [r,g,b,a] 0-1."""
        mat = {
            "name": name,
            "baseColor": list(base_color),
            "metallic": metallic,
            "roughness": roughness,
            "emissive": list(emissive or [0, 0, 0]),
        }
        self.materials.append(mat)
        return len(self.materials) - 1

    def add_mesh(self, vertices, normals, indices, material_idx):
        """Add a mesh with smooth normals."""
        self.meshes.append({
            "vertices": np.array(vertices, dtype=np.float32),
            "normals": np.array(normals, dtype=np.float32),
            "indices": np.array(indices, dtype=np.uint32),
            "material": material_idx,
        })

    def build(self):
        """Build the final GLB bytes."""
        # Collect all buffer data
        buffer_data = bytearray()
        accessors = []
        buffer_views = []
        mesh_defs = []
        node_defs = []
        mesh_idx = 0

        for mesh_info in self.meshes:
            verts = mesh_info["vertices"]
            norms = mesh_info["normals"]
            inds = mesh_info["indices"]
            mat_idx = mesh_info["material"]

            # Pad to 4-byte alignment
            def pad(data):
                while len(data) % 4 != 0:
                    data += b'\x00'
                return data

            # Vertices buffer view
            verts_bytes = verts.tobytes()
            verts_offset = len(buffer_data)
            buffer_data += pad(verts_bytes)
            bv_idx = len(buffer_views)
            buffer_views.append({
                "buffer": 0,
                "byteOffset": verts_offset,
                "byteLength": len(verts_bytes),
                "target": 34962,  # ARRAY_BUFFER
            })
            verts_min = verts.min(axis=0).tolist()
            verts_max = verts.max(axis=0).tolist()
            va_idx = len(accessors)
            accessors.append({
                "bufferView": bv_idx,
                "componentType": 5126,  # FLOAT
                "count": len(verts),
                "type": "VEC3",
                "min": verts_min,
                "max": verts_max,
            })

            # Normals buffer view
            norms_bytes = norms.tobytes()
            norms_offset = len(buffer_data)
            buffer_data += pad(norms_bytes)
            nbv_idx = len(buffer_views)
            buffer_views.append({
                "buffer": 0,
                "byteOffset": norms_offset,
                "byteLength": len(norms_bytes),
                "target": 34962,
            })
            na_idx = len(accessors)
            accessors.append({
                "bufferView": nbv_idx,
                "componentType": 5126,
                "count": len(norms),
                "type": "VEC3",
            })

            # Indices buffer view
            inds_bytes = inds.tobytes()
            inds_offset = len(buffer_data)
            buffer_data += pad(inds_bytes)
            ibv_idx = len(buffer_views)
            buffer_views.append({
                "buffer": 0,
                "byteOffset": inds_offset,
                "byteLength": len(inds_bytes),
                "target": 34963,  # ELEMENT_ARRAY_BUFFER
            })
            component_type = 5123 if inds.dtype == np.uint16 else 5125  # UNSIGNED_SHORT or UNSIGNED_INT
            ia_idx = len(accessors)
            accessors.append({
                "bufferView": ibv_idx,
                "componentType": component_type,
                "count": len(inds),
                "type": "SCALAR",
                "min": [int(inds.min())],
                "max": [int(inds.max())],
            })

            # Mesh primitive
            prim = {
                "attributes": {
                    "POSITION": va_idx,
                    "NORMAL": na_idx,
                },
                "indices": ia_idx,
                "material": mat_idx,
            }
            m_idx = len(mesh_defs)
            mesh_defs.append({"primitives": [prim]})

            # Node
            node_defs.append({"mesh": m_idx})
            mesh_idx += 1

        # Build glTF JSON
        gltf = {
            "asset": {
                "version": "2.0",
                "generator": "XiaoxueModelGenerator v2",
            },
            "scene": 0,
            "scenes": [{"nodes": list(range(len(node_defs)))}],
            "nodes": node_defs,
            "meshes": mesh_defs,
            "accessors": accessors,
            "bufferViews": buffer_views,
            "buffers": [{"byteLength": len(buffer_data)}],
            "materials": [
                {
                    "name": m["name"],
                    "pbrMetallicRoughness": {
                        "baseColorFactor": m["baseColor"],
                        "metallicFactor": m["metallic"],
                        "roughnessFactor": m["roughness"],
                    },
                    "emissiveFactor": m["emissive"],
                }
                for m in self.materials
            ],
        }

        # Encode JSON
        json_bytes = json.dumps(gltf, separators=(',', ':')).encode('utf-8')
        # Pad JSON to 4-byte alignment
        while len(json_bytes) % 4 != 0:
            json_bytes += b'\x20'  # space padding

        # Pad buffer to 4-byte alignment
        while len(buffer_data) % 4 != 0:
            buffer_data += b'\x00'

        # GLB header
        total_length = 12 + 8 + len(json_bytes) + 8 + len(buffer_data)
        header = struct.pack('<III', 0x46546C67, 2, total_length)  # magic, version, length

        # JSON chunk
        json_header = struct.pack('<II', len(json_bytes), 0x4E4F534A)  # length, type=JSON

        # BIN chunk
        bin_header = struct.pack('<II', len(buffer_data), 0x004E4942)  # length, type=BIN

        return header + json_header + json_bytes + bin_header + bytes(buffer_data)


# ─── Geometry Generators ──────────────────────────────────────────────────────

def smooth_sphere(radius, rings=32, sectors=48):
    """Generate a UV sphere with smooth normals."""
    vertices = []
    normals = []
    indices = []

    for r in range(rings + 1):
        phi = np.pi * r / rings
        for s in range(sectors + 1):
            theta = 2 * np.pi * s / sectors
            x = radius * np.sin(phi) * np.cos(theta)
            y = radius * np.cos(phi)
            z = radius * np.sin(phi) * np.sin(theta)
            vertices.append([x, y, z])
            # Normal is just normalized position for a sphere
            length = np.sqrt(x*x + y*y + z*z) or 1
            normals.append([x/length, y/length, z/length])

    for r in range(rings):
        for s in range(sectors):
            i1 = r * (sectors + 1) + s
            i2 = i1 + sectors + 1
            indices.extend([i1, i2, i1 + 1, i1 + 1, i2, i2 + 1])

    return np.array(vertices), np.array(normals), np.array(indices, dtype=np.uint32)


def smooth_cylinder(radius, height, sectors=48, capped=True):
    """Generate a cylinder with smooth normals."""
    vertices = []
    normals = []
    indices = []
    half_h = height / 2

    # Side
    for s in range(sectors + 1):
        theta = 2 * np.pi * s / sectors
        x = radius * np.cos(theta)
        z = radius * np.sin(theta)
        nx = np.cos(theta)
        nz = np.sin(theta)
        vertices.extend([[x, half_h, z], [x, -half_h, z]])
        normals.extend([[nx, 0, nz], [nx, 0, nz]])

    side_base = 0
    for s in range(sectors):
        i1 = side_base + s * 2
        i2 = i1 + 1
        i3 = i1 + 2
        i4 = i1 + 3
        indices.extend([i1, i2, i3, i3, i2, i4])

    if capped:
        # Top cap
        top_center_idx = len(vertices)
        vertices.append([0, half_h, 0])
        normals.append([0, 1, 0])
        for s in range(sectors + 1):
            theta = 2 * np.pi * s / sectors
            vertices.append([radius * np.cos(theta), half_h, radius * np.sin(theta)])
            normals.append([0, 1, 0])
        for s in range(sectors):
            indices.extend([top_center_idx, top_center_idx + 1 + s, top_center_idx + 2 + s])

        # Bottom cap
        bot_center_idx = len(vertices)
        vertices.append([0, -half_h, 0])
        normals.append([0, -1, 0])
        for s in range(sectors + 1):
            theta = 2 * np.pi * s / sectors
            vertices.append([radius * np.cos(theta), -half_h, radius * np.sin(theta)])
            normals.append([0, -1, 0])
        for s in range(sectors):
            indices.extend([bot_center_idx, bot_center_idx + 2 + s, bot_center_idx + 1 + s])

    return np.array(vertices), np.array(normals), np.array(indices, dtype=np.uint32)


def smooth_torus(major_r, minor_r, major_segs=48, minor_segs=24):
    """Generate a torus with smooth normals."""
    vertices = []
    normals = []
    indices = []

    for i in range(major_segs + 1):
        theta = 2 * np.pi * i / major_segs
        cos_theta = np.cos(theta)
        sin_theta = np.sin(theta)
        for j in range(minor_segs + 1):
            phi = 2 * np.pi * j / minor_segs
            cos_phi = np.cos(phi)
            sin_phi = np.sin(phi)

            x = (major_r + minor_r * cos_phi) * cos_theta
            y = minor_r * sin_phi
            z = (major_r + minor_r * cos_phi) * sin_theta

            nx = cos_phi * cos_theta
            ny = sin_phi
            nz = cos_phi * sin_theta

            vertices.append([x, y, z])
            normals.append([nx, ny, nz])

    for i in range(major_segs):
        for j in range(minor_segs):
            i1 = i * (minor_segs + 1) + j
            i2 = i1 + minor_segs + 1
            indices.extend([i1, i2, i1 + 1, i1 + 1, i2, i2 + 1])

    return np.array(vertices), np.array(normals), np.array(indices, dtype=np.uint32)


def smooth_egg(radius_x, radius_y, rings=32, sectors=48):
    """Generate an egg-shaped ellipsoid with smooth normals."""
    vertices = []
    normals = []
    indices = []

    for r in range(rings + 1):
        phi = np.pi * r / rings
        # Egg shape: top is rounder, bottom is narrower
        egg_factor = 1.0 + 0.15 * np.sin(phi)
        for s in range(sectors + 1):
            theta = 2 * np.pi * s / sectors
            x = radius_x * egg_factor * np.sin(phi) * np.cos(theta)
            y = radius_y * np.cos(phi)
            z = radius_x * egg_factor * np.sin(phi) * np.sin(theta)
            vertices.append([x, y, z])
            length = np.sqrt(x*x + y*y + z*z) or 1
            normals.append([x/length, y/length, z/length])

    for r in range(rings):
        for s in range(sectors):
            i1 = r * (sectors + 1) + s
            i2 = i1 + sectors + 1
            indices.extend([i1, i2, i1 + 1, i1 + 1, i2, i2 + 1])

    return np.array(vertices), np.array(normals), np.array(indices, dtype=np.uint32)


def transform_mesh(verts, norms, matrix):
    """Apply a 4x4 transform matrix to vertices and normals."""
    # Transform vertices
    ones = np.ones((len(verts), 1))
    verts_h = np.hstack([verts, ones])
    verts_t = (matrix @ verts_h.T).T[:, :3]

    # Transform normals (use upper-left 3x3, normalized)
    norms_h = np.hstack([norms, np.zeros((len(norms), 1))])
    norms_t = (matrix @ norms_h.T).T[:, :3]
    lengths = np.linalg.norm(norms_t, axis=1, keepdims=True)
    lengths[lengths == 0] = 1
    norms_t = norms_t / lengths

    return verts_t, norms_t


def translate(x=0, y=0, z=0):
    m = np.eye(4)
    m[0, 3] = x
    m[1, 3] = y
    m[2, 3] = z
    return m

def scale_matrix(sx=1, sy=1, sz=1):
    m = np.eye(4)
    m[0, 0] = sx
    m[1, 1] = sy
    m[2, 2] = sz
    return m

def rotate_x(a):
    c, s = np.cos(a), np.sin(a)
    m = np.eye(4)
    m[1, 1] = c; m[1, 2] = -s
    m[2, 1] = s; m[2, 2] = c
    return m

def rotate_z(a):
    c, s = np.cos(a), np.sin(a)
    m = np.eye(4)
    m[0, 0] = c; m[0, 1] = -s
    m[1, 0] = s; m[1, 1] = c
    return m

def mirror_x():
    return scale_matrix(-1, 1, 1)


# ─── Color Palette ────────────────────────────────────────────────────────────

SKIN      = [1.0, 0.82, 0.67, 1.0]   # Warm skin
SKIN_DARK = [0.90, 0.72, 0.57, 1.0]   # Shadow skin
HAIR      = [0.15, 0.11, 0.10, 1.0]   # Dark brown/black
RED       = [0.78, 0.12, 0.12, 1.0]   # 中国石油红
RED_DARK  = [0.65, 0.10, 0.10, 1.0]   # Dark red
WHITE     = [0.95, 0.95, 0.95, 1.0]   # Helmet white
GOLD      = [0.86, 0.71, 0.0, 1.0]    # 宝石花 gold
BLACK     = [0.12, 0.12, 0.12, 1.0]   # Boots/gloves
EYE_BLACK = [0.08, 0.08, 0.08, 1.0]   # Eye pupil
EYE_WHITE = [0.98, 0.98, 0.98, 1.0]   # Eye white
PINK      = [1.0, 0.65, 0.6, 1.0]     # Cheek blush
MOUTH     = [0.85, 0.4, 0.4, 1.0]     # Mouth
BELT_GRAY = [0.2, 0.2, 0.2, 1.0]      # Belt
EMBLEM_G  = [0.86, 0.71, 0.0, 0.9]    # Logo gold


# ─── Character Builder ────────────────────────────────────────────────────────

def build_character(builder):
    """Build a high-quality chibi Xiaoxue character."""

    # ═══════════════════════════════════════════════════════════════════════════
    # MATERIALS
    # ═══════════════════════════════════════════════════════════════════════════

    mat_skin     = builder.add_material("skin",      SKIN,      roughness=0.6)
    mat_hair     = builder.add_material("hair",      HAIR,      roughness=0.4)
    mat_red      = builder.add_material("uniform",   RED,       roughness=0.5)
    mat_red_d    = builder.add_material("uniform_d", RED_DARK,  roughness=0.5)
    mat_helmet   = builder.add_material("helmet",    WHITE,     roughness=0.3, metallic=0.1)
    mat_helmet_r = builder.add_material("helmet_rim",RED,       roughness=0.4)
    mat_boots    = builder.add_material("boots",     BLACK,     roughness=0.7)
    mat_eye_w    = builder.add_material("eye_white", EYE_WHITE, roughness=0.2)
    mat_eye_b    = builder.add_material("eye_pupil", EYE_BLACK, roughness=0.1)
    mat_pink     = builder.add_material("cheek",     PINK,      roughness=0.8)
    mat_mouth    = builder.add_material("mouth",     MOUTH,     roughness=0.6)
    mat_belt     = builder.add_material("belt",      BELT_GRAY, roughness=0.6, metallic=0.3)
    mat_gold     = builder.add_material("gold",      GOLD,      roughness=0.3, metallic=0.6)
    mat_emblem   = builder.add_material("emblem",    EMBLEM_G,  roughness=0.2, metallic=0.7)

    S = 48  # sector count for smooth curves
    R = 24  # ring count

    # ═══════════════════════════════════════════════════════════════════════════
    # HEAD — large chibi head (key to cuteness)
    # ═══════════════════════════════════════════════════════════════════════════

    # Main head — slightly egg-shaped (wider at cheeks)
    v, n, i = smooth_egg(0.38, 0.40, rings=R, sectors=S)
    builder.add_mesh(v, n, i, mat_skin)

    # ═══════════════════════════════════════════════════════════════════════════
    # HAIR — smooth cap with side strands
    # ═══════════════════════════════════════════════════════════════════════════

    # Hair cap — slightly larger sphere, bottom half removed by positioning
    hv, hn, hi = smooth_sphere(0.42, rings=R, sectors=S)
    # Move up and cut: only keep top 55%
    mask = hv[:, 1] > -0.08
    hv_filtered = hv[mask]
    hn_filtered = hn[mask]
    # Re-triangulate (simple fan from top)
    hair_indices = []
    # Find top vertex (highest y)
    top_idx = int(np.argmax(hv_filtered[:, 1]))
    for vi in range(1, len(hv_filtered) - 1):
        if vi != top_idx and vi + 1 != top_idx:
            hair_indices.extend([top_idx, vi, vi + 1])
    if hair_indices:
        builder.add_mesh(hv_filtered, hn_filtered,
                        np.array(hair_indices, dtype=np.uint32), mat_hair)

    # Hair bangs — front fringe (elongated torus segment)
    bv, bn, bi = smooth_torus(0.36, 0.04, major_segs=32, minor_segs=12)
    # Keep only front-top portion
    bang_mask = (bn[:, 2] > 0.3) & (bn[:, 1] > -0.2)
    if bang_mask.any():
        bv_f = bv[bang_mask]
        bn_f = bn[bang_mask]
        # Simple triangulation
        bi_fan = []
        for vi in range(1, len(bv_f) - 1):
            bi_fan.extend([0, vi, vi + 1])
        if bi_fan:
            builder.add_mesh(bv_f, bn_f, np.array(bi_fan, dtype=np.uint32), mat_hair)

    # Side hair strands — smooth cylinders
    for side in [-1, 1]:
        sv, sn, si = smooth_cylinder(0.045, 0.22, sectors=16)
        sv, sn = transform_mesh(sv, sn,
            translate(side * 0.30, 1.48, 0.05) @ rotate_x(side * 0.15))
        builder.add_mesh(sv, sn, si, mat_hair)

    # Back hair — long flowing piece
    bv2, bn2, bi2 = smooth_cylinder(0.08, 0.35, sectors=16)
    bv2, bn2 = transform_mesh(bv2, bn2,
        translate(0, 1.35, -0.18) @ rotate_x(0.15))
    builder.add_mesh(bv2, bn2, bi2, mat_hair)

    # ═══════════════════════════════════════════════════════════════════════════
    # FACE — large expressive eyes (key to chibi style)
    # ═══════════════════════════════════════════════════════════════════════════

    for side in [-1, 1]:
        # Eye white — slightly oval
        ew_v, ew_n, ew_i = smooth_sphere(0.065, rings=16, sectors=24)
        ew_v, ew_n = transform_mesh(ew_v, ew_n,
            translate(side * 0.12, 1.60, 0.34) @ scale_matrix(1.0, 1.2, 0.6))
        builder.add_mesh(ew_v, ew_n, ew_i, mat_eye_w)

        # Eye pupil — dark circle
        ep_v, ep_n, ep_i = smooth_sphere(0.045, rings=12, sectors=16)
        ep_v, ep_n = transform_mesh(ep_v, ep_n,
            translate(side * 0.12, 1.60, 0.37) @ scale_matrix(1.0, 1.1, 0.5))
        builder.add_mesh(ep_v, ep_n, ep_i, mat_eye_b)

        # Eye highlight — tiny bright spot
        eh_v, eh_n, eh_i = smooth_sphere(0.015, rings=8, sectors=8)
        eh_v, eh_n = transform_mesh(eh_v, eh_n,
            translate(side * 0.12 + 0.02, 1.62, 0.39))
        mat_hl = builder.add_material(f"eye_hl_{side}", [1, 1, 1, 1], roughness=0.1)
        builder.add_mesh(eh_v, eh_n, eh_i, mat_hl)

        # Eyebrow — thin curved line
        bv_brow, bn_brow, bi_brow = smooth_cylinder(0.008, 0.07, sectors=8)
        bv_brow, bn_brow = transform_mesh(bv_brow, bn_brow,
            translate(side * 0.12, 1.68, 0.36) @ rotate_z(side * 0.2))
        builder.add_mesh(bv_brow, bn_brow, bi_brow, mat_hair)

    # Nose — tiny cute bump
    nv, nn, ni = smooth_sphere(0.025, rings=8, sectors=12)
    nv, nn = transform_mesh(nv, nn,
        translate(0, 1.55, 0.38) @ scale_matrix(0.8, 0.6, 0.7))
    builder.add_mesh(nv, nn, ni, mat_skin)

    # Mouth — small curved smile
    mv, mn, mi = smooth_torus(0.035, 0.006, major_segs=24, minor_segs=8)
    mv, mn = transform_mesh(mv, mn,
        translate(0, 1.49, 0.36) @ rotate_x(np.pi * 0.55))
    builder.add_mesh(mv, mn, mi, mat_mouth)

    # Cheek blush — soft pink ellipsoids
    for side in [-1, 1]:
        cv, cn, ci = smooth_sphere(0.05, rings=12, sectors=16)
        cv, cn = transform_mesh(cv, cn,
            translate(side * 0.20, 1.52, 0.30) @ scale_matrix(1.0, 0.7, 0.5))
        builder.add_mesh(cv, cn, ci, mat_pink)

    # ═══════════════════════════════════════════════════════════════════════════
    # HELMET — smooth white dome with red rim
    # ═══════════════════════════════════════════════════════════════════════════

    # Helmet dome — sphere cut in half
    hv2, hn2, hi2 = smooth_sphere(0.38, rings=R, sectors=S)
    dome_mask = hv2[:, 1] > -0.02
    hv_d = hv2[dome_mask]
    hn_d = hn2[dome_mask]
    di_fan = []
    top_i = int(np.argmax(hv_d[:, 1]))
    for vi in range(1, len(hv_d) - 1):
        if vi != top_i and vi + 1 != top_i:
            di_fan.extend([top_i, vi, vi + 1])
    if di_fan:
        builder.add_mesh(hv_d, hn_d, np.array(di_fan, dtype=np.uint32), mat_helmet)

    # Helmet rim — torus at the base
    rv, rn, ri = smooth_torus(0.39, 0.025, major_segs=S, minor_segs=12)
    rv, rn = transform_mesh(rv, rn, translate(0, 1.92, 0))
    builder.add_mesh(rv, rn, ri, mat_helmet_r)

    # Helmet ridge — raised line on top
    rv2, rn2, ri2 = smooth_cylinder(0.025, 0.2, sectors=12)
    rv2, rn2 = transform_mesh(rv2, rn2, translate(0, 2.08, 0))
    builder.add_mesh(rv2, rn2, ri2, mat_helmet)

    # PetroChina logo on helmet — gold disc
    lv, ln, li = smooth_sphere(0.04, rings=12, sectors=16)
    lv, ln = transform_mesh(lv, ln,
        translate(0, 2.02, 0.32) @ scale_matrix(1, 0.3, 1))
    builder.add_mesh(lv, ln, li, mat_emblem)

    # ═══════════════════════════════════════════════════════════════════════════
    # BODY — compact torso in red uniform
    # ═══════════════════════════════════════════════════════════════════════════

    # Torso — smooth rounded shape
    tv, tn, ti = smooth_egg(0.28, 0.35, rings=R, sectors=S)
    tv, tn = transform_mesh(tv, tn, translate(0, 0.85, 0) @ scale_matrix(1.0, 0.9, 0.85))
    builder.add_mesh(tv, tn, ti, mat_red)

    # Shoulders — slightly wider
    sv, sn, si = smooth_cylinder(0.32, 0.1, sectors=S)
    sv, sn = transform_mesh(sv, sn, translate(0, 1.16, 0))
    builder.add_mesh(sv, sn, si, mat_red)

    # Belt
    bv3, bn3, bi3 = smooth_torus(0.29, 0.02, major_segs=S, minor_segs=8)
    bv3, bn3 = transform_mesh(bv3, bn3, translate(0, 0.65, 0))
    builder.add_mesh(bv3, bn3, bi3, mat_belt)

    # Chest emblem (宝石花) — flat gold disc
    ev, en, ei = smooth_sphere(0.04, rings=10, sectors=12)
    ev, en = transform_mesh(ev, en,
        translate(0, 0.95, 0.24) @ scale_matrix(1, 0.3, 1))
    builder.add_mesh(ev, en, ei, mat_gold)

    # ═══════════════════════════════════════════════════════════════════════════
    # ARMS — smooth rounded
    # ═══════════════════════════════════════════════════════════════════════════

    for side in [-1, 1]:
        # Upper arm
        av, an, ai = smooth_cylinder(0.07, 0.25, sectors=16)
        av, an = transform_mesh(av, an,
            translate(side * 0.34, 0.98, 0) @ rotate_z(side * 0.25))
        builder.add_mesh(av, an, ai, mat_red)

        # Elbow
        ev2, en2, ei2 = smooth_sphere(0.065, rings=10, sectors=12)
        ev2, en2 = transform_mesh(ev2, en2, translate(side * 0.38, 0.83, 0))
        builder.add_mesh(ev2, en2, ei2, mat_red)

        # Forearm (skin showing)
        fv, fn, fi = smooth_cylinder(0.06, 0.22, sectors=16)
        fv, fn = transform_mesh(fv, fn,
            translate(side * 0.40, 0.70, 0) @ rotate_z(side * 0.1))
        builder.add_mesh(fv, fn, fi, mat_skin)

        # Glove
        gv, gn, gi = smooth_sphere(0.06, rings=10, sectors=12)
        gv, gn = transform_mesh(gv, gn, translate(side * 0.42, 0.57, 0))
        builder.add_mesh(gv, gn, gi, mat_boots)

    # ═══════════════════════════════════════════════════════════════════════════
    # LEGS — in red pants with black boots
    # ═══════════════════════════════════════════════════════════════════════════

    for side in [-1, 1]:
        # Upper leg (pants)
        ulv, uln, uli = smooth_cylinder(0.085, 0.28, sectors=16)
        ulv, uln = transform_mesh(ulv, uln, translate(side * 0.12, 0.35, 0))
        builder.add_mesh(ulv, uln, uli, mat_red_d)

        # Knee
        kv, kn, ki = smooth_sphere(0.075, rings=8, sectors=12)
        kv, kn = transform_mesh(kv, kn, translate(side * 0.12, 0.18, 0))
        builder.add_mesh(kv, kn, ki, mat_red_d)

        # Lower leg
        llv, lln, lli = smooth_cylinder(0.075, 0.25, sectors=16)
        llv, lln = transform_mesh(llv, lln, translate(side * 0.12, 0.02, 0))
        builder.add_mesh(llv, lln, lli, mat_red_d)

        # Boot shaft
        bsv, bsn, bsi = smooth_cylinder(0.08, 0.12, sectors=16)
        bsv, bsn = transform_mesh(bsv, bsn, translate(side * 0.12, -0.15, 0))
        builder.add_mesh(bsv, bsn, bsi, mat_boots)

        # Boot sole
        bsv2, bsn2, bsi2 = smooth_cylinder(0.085, 0.04, sectors=16)
        bsv2, bsn2 = transform_mesh(bsv2, bsn2, translate(side * 0.12, -0.24, 0))
        builder.add_mesh(bsv2, bsn2, bsi2, mat_boots)

        # Boot toe (front bump)
        btv, btn, bti = smooth_sphere(0.055, rings=8, sectors=12)
        btv, btn = transform_mesh(btv, btn,
            translate(side * 0.12, -0.22, 0.04) @ scale_matrix(0.9, 0.7, 1.0))
        builder.add_mesh(btv, btn, bti, mat_boots)


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("Building Xiaoxue character model v2 (high quality)...")

    builder = GLBBuilder()
    build_character(builder)

    print(f"  Meshes: {len(builder.meshes)}")
    print(f"  Materials: {len(builder.materials)}")

    # Build GLB
    glb_bytes = builder.build()
    print(f"  GLB size: {len(glb_bytes):,} bytes ({len(glb_bytes)/1024:.1f} KB)")

    # Write file
    output_dir = os.path.join(os.path.dirname(__file__), "..",
                              "packages", "app", "public", "assets")
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, "xiaoxue.glb")

    with open(output_path, 'wb') as f:
        f.write(glb_bytes)

    print(f"  Written to: {output_path}")
    print("\n[X] Xiaoxue model v2 generated successfully!")


if __name__ == "__main__":
    main()
