"""
Xiaoxue 3D Character Model Generator
录井小雪 3D 角色模型生成器

Creates a stylized petroleum worker character using trimesh primitives
and exports as GLB format for use with the Three.js pet renderer.

Character design:
- Young female petroleum engineer
- Cartoon 3D style
- Red petroleum work uniform (中国石油 红色工服)
- White safety helmet (白色安全帽)
- PetroChina logo on chest (宝石花 logo)
- Friendly and professional appearance
"""

import trimesh
import numpy as np
import os

# ─── Material Definitions ──────────────────────────────────────────────────────

def mat(name, color):
    """Create a SimpleMaterial with RGBA color."""
    return trimesh.visual.material.SimpleMaterial(
        name=name,
        diffuse=[int(c) for c in color[:3]],
        ambient=[int(c * 0.3) for c in color[:3]],
        specular=[200, 200, 200],
        glossiness=0.3,
        double_sided=False,
    )

MATERIALS = {
    "skin":      mat("skin",      [255, 210, 170]),
    "hair":      mat("hair",      [40, 30, 25]),
    "uniform":   mat("uniform",   [200, 30, 30]),      # 中国石油红
    "uniform_d": mat("uniform_d", [170, 25, 25]),      # 深红 (阴影)
    "helmet":    mat("helmet",    [240, 240, 240]),     # 白色安全帽
    "helmet_r":  mat("helmet_r",  [220, 60, 60]),      # 红色帽沿
    "boots":     mat("boots",     [50, 50, 50]),        # 黑色工靴
    "gloves":    mat("gloves",    [50, 50, 50]),
    "logo":      mat("logo",      [220, 180, 0]),       # 宝石花金色
    "eyes":      mat("eyes",      [30, 30, 30]),
    "mouth":     mat("mouth",     [200, 100, 100]),
    "cheek":     mat("cheek",     [255, 180, 160]),     # 腮红
    "belt":      mat("belt",      [60, 60, 60]),
    "emblem":    mat("emblem",    [220, 180, 0]),       # 宝石花徽章
}


# ─── Geometry Helpers ──────────────────────────────────────────────────────────

def make_sphere(radius, subdivisions=3):
    """Create an icosphere with given subdivisions."""
    sphere = trimesh.creation.icosphere(subdivisions=subdivisions)
    sphere.vertices *= radius
    return sphere

def make_rounded_cylinder(radius, height, sections=24):
    """Create a cylinder with beveled edges."""
    cyl = trimesh.creation.cylinder(radius=radius, height=height, sections=sections)
    return cyl

def make_torus(major_r, minor_r, major_sections=32, minor_sections=12):
    """Create a torus shape."""
    return trimesh.creation.torus(major_radius=major_r, minor_radius=minor_r,
                                   major_sections=major_sections, minor_sections=minor_sections)


def create_mesh(geometry, material_name, transform=None):
    """Create a Trimesh object with material applied."""
    if transform is not None:
        geometry = geometry.copy()
        geometry.apply_transform(transform)
    visual = trimesh.visual.TextureVisuals(material=MATERIALS[material_name])
    mesh = trimesh.Trimesh(vertices=geometry.vertices, faces=geometry.faces, visual=visual)
    return mesh


def translate(x=0, y=0, z=0):
    """Create a translation matrix."""
    return trimesh.transformations.translation_matrix([x, y, z])

def scale(sx=1, sy=1, sz=1):
    """Create a scale matrix."""
    return np.diag([sx, sy, sz, 1.0])

def rotate_x(angle):
    return trimesh.transformations.rotation_matrix(angle, [1, 0, 0])

def rotate_y(angle):
    return trimesh.transformations.rotation_matrix(angle, [0, 1, 0])

def rotate_z(angle):
    return trimesh.transformations.rotation_matrix(angle, [0, 0, 1])


# ─── Character Assembly ────────────────────────────────────────────────────────

def build_character():
    """Build the complete Xiaoxue character."""
    parts = []

    # ═══ BODY (Torso) ═══
    # Main torso — slightly rounded cylinder
    torso = make_rounded_cylinder(radius=0.35, height=0.7, sections=24)
    parts.append(create_mesh(torso, "uniform", translate(0, 0.85, 0)))

    # Shoulder area — wider top
    shoulders = make_rounded_cylinder(radius=0.38, height=0.15, sections=24)
    parts.append(create_mesh(shoulders, "uniform", translate(0, 1.22, 0)))

    # Belt
    belt = make_torus(major_r=0.36, minor_r=0.025, major_sections=32, minor_sections=8)
    parts.append(create_mesh(belt, "belt", translate(0, 0.55, 0)))

    # Chest emblem (宝石花 logo) — flat disc on front
    emblem = make_sphere(radius=0.06, subdivisions=2)
    emblem.apply_transform(scale(1, 0.3, 1))
    parts.append(create_mesh(emblem, "emblem", translate(0, 1.05, 0.36)))

    # ═══ HEAD ═══
    # Head sphere — slightly oval (wider than tall for cartoon style)
    head = make_sphere(radius=0.28, subdivisions=4)
    head.apply_transform(scale(1.0, 0.95, 1.0))
    parts.append(create_mesh(head, "skin", translate(0, 1.65, 0)))

    # Hair — top cap (darker hemisphere)
    hair_outer = make_sphere(radius=0.30, subdivisions=3)
    # Cut bottom half
    cut_plane = trimesh.creation.box(extents=[1, 0.32, 1])
    hair_outer = hair_outer.difference(cut_plane)
    parts.append(create_mesh(hair_outer, "hair", translate(0, 1.75, -0.02)))

    # Hair bangs — front sweep
    bangs = make_rounded_cylinder(radius=0.12, height=0.05, sections=16)
    parts.append(create_mesh(bangs, "hair", translate(0, 1.82, 0.22)))

    # Side hair strands
    for side in [-1, 1]:
        strand = make_rounded_cylinder(radius=0.04, height=0.18, sections=8)
        parts.append(create_mesh(strand, "hair",
            translate(side * 0.24, 1.55, 0) @ rotate_x(np.pi * 0.1 * side)))

    # ═══ FACE ═══
    # Eyes — small dark spheres
    for side in [-1, 1]:
        eye = make_sphere(radius=0.035, subdivisions=3)
        parts.append(create_mesh(eye, "eyes", translate(side * 0.10, 1.66, 0.24)))
        # Eye highlight (tiny white dot)
        highlight = make_sphere(radius=0.012, subdivisions=2)
        highlight_mat = mat("eye_hl", [255, 255, 255])
        hl_visual = trimesh.visual.TextureVisuals(material=highlight_mat)
        hl_mesh = trimesh.Trimesh(vertices=highlight.vertices, faces=highlight.faces, visual=hl_visual)
        hl_mesh.apply_transform(translate(side * 0.10 + 0.01, 1.675, 0.26))
        parts.append(hl_mesh)

    # Eyebrows — thin curved boxes
    for side in [-1, 1]:
        brow = make_rounded_cylinder(radius=0.008, height=0.08, sections=6)
        parts.append(create_mesh(brow, "hair",
            translate(side * 0.10, 1.72, 0.25) @ rotate_z(side * 0.15)))

    # Nose — tiny bump
    nose = make_sphere(radius=0.02, subdivisions=2)
    nose.apply_transform(scale(0.8, 0.6, 1.0))
    parts.append(create_mesh(nose, "skin", translate(0, 1.62, 0.28)))

    # Mouth — small smile curve (using torus segment)
    mouth = make_torus(major_r=0.04, minor_r=0.006, major_sections=12, minor_sections=6)
    parts.append(create_mesh(mouth, "mouth",
        translate(0, 1.57, 0.26) @ rotate_x(np.pi * 0.5)))

    # Cheeks — soft pink spheres
    for side in [-1, 1]:
        cheek = make_sphere(radius=0.04, subdivisions=2)
        cheek.apply_transform(scale(1.0, 0.7, 0.5))
        parts.append(create_mesh(cheek, "cheek", translate(side * 0.16, 1.59, 0.22)))

    # ═══ HARD HAT (安全帽) ═══
    # Helmet dome
    helmet = make_sphere(radius=0.32, subdivisions=4)
    # Cut bottom to make dome
    cut = trimesh.creation.box(extents=[1, 0.25, 1])
    helmet = helmet.difference(cut)
    parts.append(create_mesh(helmet, "helmet", translate(0, 1.85, 0)))

    # Helmet brim — flat ring
    brim = make_torus(major_r=0.33, minor_r=0.02, major_sections=32, minor_sections=8)
    parts.append(create_mesh(brim, "helmet_r", translate(0, 1.72, 0)))

    # Helmet top ridge
    ridge = make_rounded_cylinder(radius=0.025, height=0.15, sections=8)
    ridge.apply_transform(scale(1, 1, 0.5))
    parts.append(create_mesh(ridge, "helmet", translate(0, 1.98, 0)))

    # PetroChina logo on helmet — small gold disc
    logo_disc = make_sphere(radius=0.04, subdivisions=2)
    logo_disc.apply_transform(scale(1, 0.3, 1))
    parts.append(create_mesh(logo_disc, "logo", translate(0, 1.92, 0.28)))

    # ═══ ARMS ═══
    for side in [-1, 1]:
        # Upper arm
        upper = make_rounded_cylinder(radius=0.09, height=0.35, sections=12)
        parts.append(create_mesh(upper, "uniform",
            translate(side * 0.42, 1.05, 0) @ rotate_z(side * 0.2)))

        # Elbow joint
        elbow = make_sphere(radius=0.08, subdivisions=2)
        parts.append(create_mesh(elbow, "uniform",
            translate(side * 0.46, 0.87, 0)))

        # Forearm
        forearm = make_rounded_cylinder(radius=0.08, height=0.30, sections=12)
        parts.append(create_mesh(forearm, "skin",
            translate(side * 0.48, 0.72, 0) @ rotate_z(side * 0.1)))

        # Glove / Hand
        hand = make_sphere(radius=0.07, subdivisions=3)
        parts.append(create_mesh(hand, "gloves", translate(side * 0.50, 0.55, 0)))

    # ═══ LEGS ═══
    for side in [-1, 1]:
        # Upper leg (pants)
        upper_leg = make_rounded_cylinder(radius=0.10, height=0.35, sections=12)
        parts.append(create_mesh(upper_leg, "uniform_d",
            translate(side * 0.14, 0.28, 0)))

        # Knee
        knee = make_sphere(radius=0.09, subdivisions=2)
        parts.append(create_mesh(knee, "uniform_d",
            translate(side * 0.14, 0.08, 0)))

        # Lower leg
        lower_leg = make_rounded_cylinder(radius=0.085, height=0.30, sections=12)
        parts.append(create_mesh(lower_leg, "uniform_d",
            translate(side * 0.14, -0.12, 0)))

        # Boot
        boot = make_rounded_cylinder(radius=0.095, height=0.12, sections=12)
        parts.append(create_mesh(boot, "boots", translate(side * 0.14, -0.30, 0)))

        # Boot sole (wider)
        sole = make_rounded_cylinder(radius=0.10, height=0.04, sections=12)
        parts.append(create_mesh(sole, "boots", translate(side * 0.14, -0.38, 0)))

        # Boot toe (front bump)
        toe = make_sphere(radius=0.06, subdivisions=2)
        toe.apply_transform(scale(0.9, 0.7, 1.0))
        parts.append(create_mesh(toe, "boots", translate(side * 0.14, -0.35, 0.06)))

    return parts


# ─── Export ────────────────────────────────────────────────────────────────────

def main():
    print("Building Xiaoxue character model...")
    parts = build_character()

    print(f"  Created {len(parts)} mesh parts")

    # Combine all parts into a single scene
    scene = trimesh.Scene()
    for i, part in enumerate(parts):
        scene.add_geometry(part, node_name=f"part_{i:03d}")

    # Center the model
    bounds = scene.bounding_box.extents
    print(f"  Model bounds: {bounds[0]:.3f} x {bounds[1]:.3f} x {bounds[2]:.3f}")

    # Calculate center offset
    centroid = scene.centroid
    print(f"  Centroid: {centroid}")

    # Create a root transform to center the model at origin
    root = trimesh.Scene()
    root.add_geometry(scene, node_name="xiaoxue_root",
                      transform=trimesh.transformations.translation_matrix(-centroid + [0, 0.2, 0]))

    # Export as GLB
    output_dir = os.path.join(os.path.dirname(__file__), "..",
                              "packages", "app", "public", "assets")
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, "xiaoxue.glb")

    root.export(output_path, file_type="glb")
    file_size = os.path.getsize(output_path)
    print(f"  Exported to: {output_path}")
    print(f"  File size: {file_size:,} bytes ({file_size/1024:.1f} KB)")

    # Also export as GLTF for debugging
    gltf_path = os.path.join(output_dir, "xiaoxue.gltf")
    root.export(gltf_path, file_type="gltf")
    gltf_size = os.path.getsize(gltf_path)
    print(f"  GLTF export: {gltf_path} ({gltf_size/1024:.1f} KB)")

    print("\n[X] Xiaoxue model generated successfully!")
    print("    Load in Three.js with GLTFLoader to view the model.")


if __name__ == "__main__":
    main()
