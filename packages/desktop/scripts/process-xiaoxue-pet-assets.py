from __future__ import annotations

import argparse
import json
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


@dataclass(frozen=True)
class Asset:
    name: str
    video: str
    webp: str
    transform: tuple[float, float, float, float, float, float]


ASSETS = (
    Asset("greeting-wave", "xiaoxue-greeting-wave.mp4", "xiaoxue-greeting-wave.webp", (1.0001, -0.0001, 740.0076, 0.0001, 1.0001, 109.9534)),
    Asset("listen", "listening.mp4", "xiaoxue-listen.webp", (1.6122, 0.0002, 299.5915, -0.0002, 1.6122, -233.6329)),
    Asset("celebrate", "xiaoxue_celebrate.mp4", "xiaoxue-celebrate.webp", (1.1251, 0.0001, 429.9553, -0.0001, 1.1251, -0.0007)),
    Asset("error", "xiaoxue_error.mp4", "xiaoxue-error.webp", (1.1251, 0.0001, 429.9504, -0.0001, 1.1251, -0.005)),
    Asset("idle", "xiaoxue_idle.mp4", "xiaoxue-idle.webp", (1.125, 0, 430.0484, 0, 1.125, 0.0139)),
    Asset("idle-random", "xiaoxue_idle2.mp4", "xiaoxue-idle-random.webp", (1.1249, 0, 650.0495, 0, 1.1249, 0.0598)),
    Asset("reading", "xiaoxue_reading.mp4", "xiaoxue-reading.webp", (0.75, 0.0001, 357.9072, -0.0001, 0.75, -0.0369)),
    Asset("searching", "xiaoxue_searching.mp4", "xiaoxue-searching.webp", (1.3333, 0, 490.0577, 0, 1.3333, -99.8906)),
    Asset("speaking", "xiaoxue_speaking.mp4", "xiaoxue-speaking.webp", (1.25, -0.0001, 390.0719, 0.0001, 1.25, -60.0231)),
    Asset("success", "xiaoxue_success.mp4", "xiaoxue-success.webp", (1.0001, 0, 279.9782, 0, 1.0001, -120.0687)),
    Asset("thinking", "xiaoxue_thinking.mp4", "xiaoxue-thinking.webp", (1.6121, 0.0001, 299.751, -0.0001, 1.6121, -233.6421)),
    Asset("waiting", "xiaoxue_waiting.mp4", "xiaoxue-waiting.webp", (1.3882, -0.0002, 450.4991, 0.0002, 1.3882, -126.3113)),
    Asset("writing", "xiaoxue_write.mp4", "xiaoxue-writing.webp", (1.25, 0.0001, 390.0198, -0.0001, 1.25, -59.9121)),
)


def main() -> None:
    parser = argparse.ArgumentParser(description="Repair Xiaoxue black-background animation mattes.")
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--reference", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--quality", type=int, default=92)
    parser.add_argument("--method", type=int, default=3, choices=range(0, 7))
    args = parser.parse_args()

    ffmpeg = shutil.which("ffmpeg")
    ffprobe = shutil.which("ffprobe")
    if not ffmpeg or not ffprobe:
        raise SystemExit("ffmpeg and ffprobe must be available on PATH")

    args.output.mkdir(parents=True, exist_ok=True)
    report = []
    for asset in ASSETS:
        result = process_asset(
            asset,
            args.source,
            args.reference,
            args.output,
            args.quality,
            args.method,
            ffmpeg,
            ffprobe,
        )
        report.append(result)
        print(json.dumps(result, ensure_ascii=False))
    (args.output / "matting-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def process_asset(
    asset: Asset,
    source: Path,
    reference: Path,
    output: Path,
    quality: int,
    method: int,
    ffmpeg: str,
    ffprobe: str,
) -> dict[str, object]:
    video = source / asset.video
    prior_path = reference / asset.webp
    if not video.is_file():
        raise FileNotFoundError(video)
    if not prior_path.is_file():
        raise FileNotFoundError(prior_path)

    source_frames = decode_video(video, ffmpeg, ffprobe)
    prior = Image.open(prior_path)
    if len(source_frames) != prior.n_frames:
        raise RuntimeError(f"{asset.name}: source produced {len(source_frames)} frames, prior has {prior.n_frames}")

    width, height = prior.size
    transform = np.array(asset.transform, dtype=np.float32).reshape(2, 3)
    frames = []
    repaired = 0
    removed = 0
    opaque_holes_before = 0
    opaque_holes_after = 0

    for index, source_frame in enumerate(source_frames):
        prior.seek(index)
        prior_rgba = np.array(prior.convert("RGBA"))
        rgb = cv2.warpAffine(
            source_frame,
            transform,
            (width, height),
            flags=cv2.INTER_LANCZOS4 | cv2.WARP_INVERSE_MAP,
            borderMode=cv2.BORDER_CONSTANT,
        )
        alpha, stats = repair_alpha(prior_rgba[:, :, 3], rgb, asset.name)
        repaired += stats["repaired"]
        removed += stats["removed"]
        opaque_holes_before += stats["holes_before"]
        opaque_holes_after += stats["holes_after"]
        rgb[alpha == 0] = 0
        frames.append(Image.fromarray(np.dstack((rgb, alpha)), "RGBA"))

    durations = [round((index + 1) * 1000 / 15) - round(index * 1000 / 15) for index in range(len(frames))]
    target = output / asset.webp
    frames[0].save(
        target,
        format="WEBP",
        save_all=True,
        append_images=frames[1:],
        duration=durations,
        loop=0,
        quality=quality,
        method=method,
        minimize_size=True,
        exact=True,
    )
    verify = Image.open(target)
    if verify.n_frames != len(frames) or verify.size != (width, height) or verify.mode != "RGBA":
        raise RuntimeError(f"{asset.name}: encoded WebP verification failed")

    return {
        "asset": asset.name,
        "video": asset.video,
        "webp": asset.webp,
        "size": [width, height],
        "frames": len(frames),
        "bytes": target.stat().st_size,
        "repaired_pixels": repaired,
        "removed_artifact_pixels": removed,
        "holes_before": opaque_holes_before,
        "holes_after": opaque_holes_after,
    }


def decode_video(video: Path, ffmpeg: str, ffprobe: str) -> np.ndarray:
    dimensions = subprocess.check_output(
        [
            ffprobe,
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height",
            "-of",
            "csv=p=0:s=x",
            str(video),
        ],
        text=True,
    ).strip()
    width, height = map(int, dimensions.split("x"))
    raw = subprocess.check_output(
        [
            ffmpeg,
            "-v",
            "error",
            "-i",
            str(video),
            "-vf",
            "fps=15",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "-",
        ]
    )
    return np.frombuffer(raw, dtype=np.uint8).reshape(-1, height, width, 3)


def repair_alpha(alpha: np.ndarray, rgb: np.ndarray, asset: str) -> tuple[np.ndarray, dict[str, int]]:
    result = alpha.copy()
    removed = remove_low_opacity_components(result)
    main = largest_component(result >= 32)
    if main is None:
        return result, {"repaired": 0, "removed": removed, "holes_before": 0, "holes_after": 0}

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    closed = cv2.morphologyEx(main.astype(np.uint8), cv2.MORPH_CLOSE, kernel).astype(bool)
    holes_before = interior_holes(main)
    repair_region = (closed | holes_before) & ~main

    maximum = rgb.max(axis=2)
    chroma = maximum - rgb.min(axis=2)
    if asset == "searching":
        visible_dark_detail = (chroma >= 4) | (maximum >= 24)
    else:
        visible_dark_detail = (chroma >= 3) | (maximum >= 4)
    repair = repair_region & visible_dark_detail
    result[repair] = 255

    repaired_main = largest_component(result >= 32)
    holes_after = interior_holes(repaired_main) if repaired_main is not None else np.zeros_like(main)
    return result, {
        "repaired": int(repair.sum()),
        "removed": removed,
        "holes_before": int(holes_before.sum()),
        "holes_after": int(holes_after.sum()),
    }


def remove_low_opacity_components(alpha: np.ndarray) -> int:
    count, labels, stats, _ = cv2.connectedComponentsWithStats((alpha > 0).astype(np.uint8), 8)
    removed = 0
    for label in range(1, count):
        pixels = labels == label
        if int(alpha[pixels].max()) >= 32:
            continue
        removed += int(stats[label, cv2.CC_STAT_AREA])
        alpha[pixels] = 0
    return removed


def largest_component(mask: np.ndarray) -> np.ndarray | None:
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), 8)
    if count <= 1:
        return None
    label = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    return labels == label


def interior_holes(mask: np.ndarray) -> np.ndarray:
    inverted = (~mask).astype(np.uint8)
    flood = inverted.copy()
    padded = cv2.copyMakeBorder(flood, 1, 1, 1, 1, cv2.BORDER_CONSTANT, value=1)
    cv2.floodFill(padded, None, (0, 0), 2)
    exterior = padded[1:-1, 1:-1] == 2
    return (~mask) & ~exterior


if __name__ == "__main__":
    main()
