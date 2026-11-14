"""Download only verified, credited test images from Commons and Unsplash.

Run manually: .venv/bin/python scripts/fetch_test_assets.py
Failed or blocked downloads are reported and never replaced with another source.
"""
import json
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DESTINATION = ROOT / "assets-source" / "external"
COMMONS = {
    "white-bowl.png": "File:Empty white bowl.png",
    "rim-bowl.jpg": "File:Simple-ceramic-bowl.jpg",
    "monkey-flower.jpg": "File:Lewis Monkey Flower (Mimulus lewisii) by Mary Vaux Walcott-saam1970.355.711.jpg",
    "gentian.jpg": "File:Gentian (Gentiana newberri) by Mary Vaux Walcott-saam1970.355.243.jpg",
    "poppy.jpg": "File:California Poppy (Eschscholtzia californica) by Mary Vaux Walcott-saam1970.355.303.jpg",
}
DIRECT_COMMONS = {
    "monkey-flower.jpg": "https://upload.wikimedia.org/wikipedia/commons/f/f6/Lewis_Monkey_Flower_%28Mimulus_lewisii%29_by_Mary_Vaux_Walcott-saam1970.355.711.jpg",
    "gentian.jpg": "https://upload.wikimedia.org/wikipedia/commons/d/d9/Gentian_%28Gentiana_newberri%29_by_Mary_Vaux_Walcott-saam1970.355.243.jpg",
    "poppy.jpg": "https://upload.wikimedia.org/wikipedia/commons/4/4b/California_Poppy_%28Eschscholtzia_californica%29_by_Mary_Vaux_Walcott-saam1970.355.303.jpg",
}
UNSPLASH = {
    "artisan-bowl.jpg": "https://unsplash.com/photos/X2TRduCQgOQ/download?force=true",
}
HEADERS = {"User-Agent": "ArtInClayPOC/1.0 (local image compositing research)"}


def fetch(url: str) -> tuple[bytes, str]:
    with urlopen(Request(url, headers=HEADERS), timeout=25) as response:
        return response.read(15_000_001), response.headers.get_content_type()


def save_image(name: str, url: str) -> None:
    path = DESTINATION / name
    if path.exists():
        with Image.open(path) as image:
            image.verify()
        print(f"Already downloaded: {name}")
        return
    contents, content_type = fetch(url)
    if len(contents) > 15_000_000 or not content_type.startswith("image/"):
        raise ValueError(f"Unexpected response: {content_type}, {len(contents)} bytes")
    from io import BytesIO

    with Image.open(BytesIO(contents)) as image:
        image.verify()
    path.write_bytes(contents)
    print(f"Downloaded: {name} ({len(contents)} bytes)")


def main() -> None:
    DESTINATION.mkdir(parents=True, exist_ok=True)
    for name, title in COMMONS.items():
        try:
            api = "https://commons.wikimedia.org/w/api.php?" + urlencode({
                "action": "query", "format": "json", "prop": "imageinfo", "iiprop": "url", "titles": title,
            })
            metadata, _ = fetch(api)
            pages = json.loads(metadata)["query"]["pages"]
            image_url = next(iter(pages.values()))["imageinfo"][0]["url"]
            save_image(name, image_url)
        except (OSError, ValueError, KeyError, StopIteration) as error:
            if name not in DIRECT_COMMONS:
                print(f"Unavailable: {name} ({title}): {error}")
                continue
            try:
                save_image(name, DIRECT_COMMONS[name])
            except (OSError, ValueError) as direct_error:
                print(f"Unavailable: {name} ({title}): {error}; original file: {direct_error}")
    for name, url in UNSPLASH.items():
        try:
            save_image(name, url)
        except (OSError, ValueError) as error:
            print(f"Unavailable: {name} ({url}): {error}")


if __name__ == "__main__":
    main()
