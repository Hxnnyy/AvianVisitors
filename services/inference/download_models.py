import hashlib, urllib.request
from pathlib import Path

base = Path(__file__).parent / "models"
base.mkdir(exist_ok=True)
root = "https://huggingface.co/birder-project/mobilenet_v4_l_eu-common/resolve/a030bb140c795be62c7052053a9f0b915955a39e/"
files = {
    "ssdlite320_mobilenet_v3_large_coco-a79551df.pth": (
        "a79551df90c79834bcd3bb3845ef9d966b5449a3a9b2833ae8404778ca5d65d2",
        "https://download.pytorch.org/models/ssdlite320_mobilenet_v3_large_coco-a79551df.pth",
    ),
    "mobilenet_v4_l_eu-common.pt": (
        "e1a24218a2ee2c5ae3ea7247553ba09fac47bced00dd531a33c7ce06ab49f689",
        root + "mobilenet_v4_l_eu-common.pt",
    ),
}
for name, (digest, url) in files.items():
    path = base / name
    if not path.exists():
        urllib.request.urlretrieve(url, path)
    if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
        raise RuntimeError("Model checksum mismatch: " + name)
if not (base / "mobilenet_v4_l_eu-common.json").exists():
    urllib.request.urlretrieve(
        root + "mobilenet_v4_l_eu-common.json", base / "mobilenet_v4_l_eu-common.json"
    )
