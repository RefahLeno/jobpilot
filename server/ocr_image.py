import json
import os
import shutil
import subprocess
import sys


def emit(payload):
    print(json.dumps(payload, ensure_ascii=False))


def main():
    if len(sys.argv) < 2:
        emit({"error": "missing_file"})
        return 1

    image_path = sys.argv[1]
    if not os.path.exists(image_path):
        emit({"error": "file_not_found"})
        return 1

    tesseract = shutil.which("tesseract")
    if not tesseract:
        emit({"error": "tesseract_not_installed"})
        return 1

    langs = os.environ.get("OCR_LANGS", "chi_sim+eng")
    try:
        result = subprocess.run(
            [tesseract, image_path, "stdout", "-l", langs, "--psm", "6"],
            text=True,
            capture_output=True,
            timeout=60,
            check=False,
        )
    except subprocess.TimeoutExpired:
        emit({"error": "ocr_timeout"})
        return 1

    if result.returncode != 0:
        emit({"error": result.stderr.strip() or "ocr_failed"})
        return 1

    emit({"text": result.stdout})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
