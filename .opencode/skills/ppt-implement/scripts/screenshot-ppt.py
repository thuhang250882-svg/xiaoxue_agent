#!/usr/bin/env python3
"""Use Xiaoxue's bundled Python and Playwright to capture HTML slides."""

import argparse
import subprocess
import sys
from pathlib import Path

try:
    from playwright.sync_api import Error, sync_playwright
except ImportError as exc:
    raise SystemExit("内置 Python 缺少 playwright；请修复安装包依赖，禁止借用用户 Python。") from exc


def capture(url: str, output: Path, pages: int | None, install_attempted: bool = False) -> list[Path]:
    output.mkdir(parents=True, exist_ok=True)
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            context = browser.new_context(viewport={"width": 1440, "height": 810}, device_scale_factor=2)
            page = context.new_page()
            page.goto(f"{url}?page=1", wait_until="networkidle")
            total = pages or page.evaluate("() => window.slideDataMap ? window.slideDataMap.size : 0")
            if not total:
                browser.close()
                raise RuntimeError("无法确定页数；请用 --pages 明确指定。")
            results = []
            for number in range(1, total + 1):
                page.goto(f"{url}?page={number}", wait_until="networkidle")
                target = output / f"page-{number}.png"
                page.locator("#ppt-viewport").screenshot(path=str(target))
                results.append(target)
            browser.close()
            return results
    except Error as error:
        if install_attempted or "Executable doesn't exist" not in str(error):
            raise
        print("首次使用：正在安装 Playwright Chromium 浏览器内核……", flush=True)
        subprocess.check_call([sys.executable, "-m", "playwright", "install", "chromium"])
        return capture(url, output, pages, True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://localhost:5173")
    parser.add_argument("--output", required=True)
    parser.add_argument("--pages", type=int)
    args = parser.parse_args()
    results = capture(args.url, Path(args.output).resolve(), args.pages)
    print(f"已生成 {len(results)} 张截图: {Path(args.output).resolve()}")


if __name__ == "__main__":
    main()
