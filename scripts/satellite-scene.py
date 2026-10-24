"""Add a Sentinel-2 scene to the farm's satellite history.

Usage: python scripts/satellite-scene.py <STAC item id> [--write]
Without --write it only prints the cloud-free fraction over the farm, so a
scene can be checked before it is added. Needs numpy, rasterio and Pillow.
"""
import json, sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import urlopen
from zoneinfo import ZoneInfo

import numpy as np
import rasterio
from PIL import Image
from rasterio.enums import Resampling
from rasterio.transform import from_origin
from rasterio.vrt import WarpedVRT

DATA = Path(__file__).resolve().parent.parent / 'public' / 'data'
MANIFEST = DATA / 'satellite' / 'satellite.json'
STAC = 'https://earth-search.aws.element84.com/v1/collections/sentinel-2-c1-l2a/items/'
KEEP = {4, 5, 6}  # vegetation, bare ground, water; the same mask as the existing scenes


def read(href, manifest, resampling):
    b = manifest['bounds']
    with rasterio.open(href) as src, WarpedVRT(src, crs=manifest['crs'], resampling=resampling,
            transform=from_origin(b['xmin'], b['ymax'], manifest['resolutionM'], manifest['resolutionM']),
            width=manifest['width'], height=manifest['height']) as vrt:
        return vrt.read()


def dilate(mask, steps):
    out = mask.copy()
    for _ in range(steps):
        grown = out.copy()
        grown[1:] |= out[:-1]; grown[:-1] |= out[1:]; grown[:, 1:] |= out[:, :-1]; grown[:, :-1] |= out[:, 1:]
        out = grown
    return out


def farm_mask(manifest):
    b, size = manifest['bounds'], manifest['resolutionM']
    poly = np.array(json.loads((DATA / 'boundary.json').read_text())['coordinates'])
    xs = b['xmin'] + (np.arange(manifest['width']) + .5) * size
    ys = b['ymax'] - (np.arange(manifest['height']) + .5) * size
    x, y = np.meshgrid(xs, ys)
    inside = np.zeros(x.shape, bool)
    for (x1, y1), (x2, y2) in zip(poly, np.roll(poly, -1, axis=0)):
        crosses = (y1 > y) != (y2 > y)
        inside ^= crosses & (x < (x2 - x1) * (y - y1) / np.where(y2 == y1, 1e-9, y2 - y1) + x1)
    return inside


def colour(value, legend):
    stops = [s['value'] for s in legend]
    rgb = np.array([[int(s['color'][i:i + 2], 16) for i in (1, 3, 5)] for s in legend], float)
    return np.stack([np.interp(value, stops, rgb[:, c]) for c in range(3)], -1)


def main():
    item_id, write = sys.argv[1], '--write' in sys.argv
    manifest = json.loads(MANIFEST.read_text())
    item = json.load(urlopen(STAC + item_id))
    assets = {k: item['assets'][k]['href'] for k in ('visual', 'red', 'nir', 'scl')}
    scl = read(assets['scl'], manifest, Resampling.nearest)[0]
    unknown = dilate(~np.isin(scl, list(KEEP)), 2)  # 20 m buffer
    farm = farm_mask(manifest)
    farm_valid = float((~unknown & farm).sum() / farm.sum())
    print(f'{item_id}: {farm_valid:.1%} of the farm is cloud-free, {(~unknown).mean():.1%} of the view')
    if not write:
        return
    cal = {k: item['assets'][k]['raster:bands'][0] for k in ('red', 'nir')}
    red = read(assets['red'], manifest, Resampling.bilinear)[0] * cal['red']['scale'] + cal['red']['offset']
    nir = read(assets['nir'], manifest, Resampling.bilinear)[0] * cal['nir']['scale'] + cal['nir']['offset']
    ndvi = np.clip((nir - red) / np.where(nir + red == 0, 1e-9, nir + red), -1, 1)
    rgb = np.moveaxis(read(assets['visual'], manifest, Resampling.bilinear)[:3], 0, -1).astype(float)
    grey = np.array([int(manifest['unknownColor'][i:i + 2], 16) for i in (1, 3, 5)], float)
    rgb[unknown] = grey
    ndvi_rgb = colour(ndvi, manifest['ndviLegend']); ndvi_rgb[unknown] = grey

    when = datetime.fromisoformat(item['properties']['datetime'].replace('Z', '+00:00'))
    local = when.astimezone(ZoneInfo('Pacific/Auckland')).date()
    name = f'scene-{local.isoformat()}'
    Image.fromarray(rgb.astype(np.uint8)).save(DATA / 'satellite' / f'{name}-rgb.jpg', quality=90)
    Image.fromarray(ndvi_rgb.astype(np.uint8)).save(DATA / 'satellite' / f'{name}-ndvi.png')
    values = ndvi[farm & ~unknown]
    scene = {
        'date': local.isoformat(), 'datetimeUTC': when.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z'),
        'dateTimezone': 'Pacific/Auckland', 'label': local.strftime('%d %b %Y'),
        'rgb': f'{name}-rgb.jpg', 'ndvi': f'{name}-ndvi.png',
        'validFraction': round(float((~unknown).mean()), 4), 'rgbValidFraction': round(float((~unknown).mean()), 4),
        'farmValidFraction': round(farm_valid, 4), 'tileCloudCoverPercent': item['properties'].get('eo:cloud_cover'),
        'sceneId': item_id, 'platform': item['properties'].get('platform'), 'collection': 'sentinel-2-c1-l2a',
        'sceneUrl': STAC + item_id,
        'ndviStatsFarm': {k: round(float(f(values)), 3) for k, f in (('mean', np.mean), ('median', np.median), ('min', np.min), ('max', np.max))},
        'reflectanceCalibration': {k: {f: cal[k][f] for f in ('nodata', 'data_type', 'spatial_resolution', 'scale', 'offset') if f in cal[k]} for k in cal},
        'sourceAssets': assets,
    }
    manifest['scenes'] = sorted([s for s in manifest['scenes'] if s['date'] != scene['date']] + [scene], key=lambda s: s['date'])
    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')
    print(f'Added {scene["label"]}')


if __name__ == '__main__':
    main()
