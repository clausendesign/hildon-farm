# Hildon Farm

The family farm app near Feilding, New Zealand, hosted with Sites.

- `/index.html`: a personalised welcome with Daily briefing and Explore the farm.
- `/markets.html`: the saved livestock briefing, read-aloud and questions by voice or text.
- `/farm.html`: the interactive map, soil, satellite history, measurements and paddocks.

The app uses a Vinext Worker and an existing R2 bucket for the shared market briefing and immutable forecast history. Development uses `npm run dev`; production builds use the Sites build helper. Keep the Site identity and bucket binding in `.openai/hosting.json`. The owner email is configured as a runtime secret, separately from source.

Name and voice preferences are browser-local. Voice is enabled by default; browsers may require a tap to start audio and permission for microphone input. Microphones stop when leaving or hiding the page. Names can also be selected, and questions typed.

Briefing questions use an intent-based reader over the current saved reports, rather than an external language model. Answers retain source dates, price units, source links, regional scope and missing-evidence caveats. Follow-up stock-class questions preserve the previous topic. The app does not search for new evidence during a question. `node scripts/check-briefing.mjs` and `node scripts/check-voice.mjs` check the evidence and speech behaviour.

For a move to another host, back up the R2 runtime records and recreate runtime settings separately; Git source does not contain the live briefing or credentials. Paddock and name preferences remain on each visitor’s device.

## Features

- Aerial imagery on measured terrain, bare-ground height colours and 5 m contours, and illustrative D8 surface flow paths.
- Orbit, pan, zoom, overhead view, north alignment and reset controls, including touch input.
- A 1–4× vertical exaggeration control; initial 2× exaggeration.
- An approximate boundary traced from the user's marked screenshot and aligned to the orthophotography using seven RANSAC-verified image landmarks.
- Tap the terrain for bilinearly interpolated NZVD2016 ground elevation.

- Distance and area measurement in EPSG:2193, with horizontal lengths and hectares.
- Draw, name and annotate paddocks; browser-local persistence plus JSON backup export/import.
- Real 2010–2011 and 2021–2022 aerial survey comparison with an image blend slider.
- Legacy FSL soil classification overlay and point inspection. The complete displayed extent has one mapped group: Perch-Gley Pallic. No invented soil variation or live soil condition readings.
- Nine dated Sentinel-2 photo and NDVI views (16 November 2025 to 7 October 2026, NZ local acquisition dates) with a date slider and seasonal playback. Cloud/shadow masking, consistent colours, and original acquisition dates. These are saved observations, not an automatically updated feed.

## Data

Source metadata and attribution are in `public/data/sources.json`. The terrain and texture share EPSG:2193 bounds. Heights are north-to-south, row-major, at 10 m sample spacing from the original 1 m DEM. The outer context was cropped to exclude all missing elevation data.

- Ground: Horizons Regional Council, Manawatū–Whanganui LiDAR 2015–2016, distributed by LINZ, CC BY 4.0.
- Photography: Manawatū–Whanganui LASS, 2021–2022 rural orthophotography, distributed by LINZ, CC BY 4.0; resampled from 30 cm to 1 m for delivery.
- Historical photography: Manawatū–Whanganui LASS 2010–2011, captured by NZ Aerial Mapping and distributed by LINZ, CC BY 4.0. Full provenance in `public/data/history-source.json`.
- Boundary: user-provided marked screenshot, approximate; not a cadastral or surveyed legal boundary.
- Soil: Manaaki Whenua FSL NZ Soil Classification via its official WMS/WFS, CC BY 3.0 NZ as declared by the service. Legacy surveys from the 1960s–2000, approximately 1:50,000 scale; metadata publication 2011. Exact provenance in `public/data/soil/soil-provenance.json`. This service provides classification and descriptions, not current pH or nutrients.
- Satellite: Copernicus Sentinel-2 Level-2A through EarthSearch public STAC / public COG assets. The manifest in `public/data/satellite/satellite.json` records dates, source items, coverage and processing. Natural colour and NDVI use actual georeferenced reflectance. The existing terrain dates remain 2015–2016.
- Rendering: Three.js 0.170.0 and OrbitControls, MIT licence.

The surface-flow view follows strict downhill D8 routing on the sampled DEM. It has no rainfall volume, infiltration, hydraulic structures, subsurface drains or flood depths, and stops at local depressions. It is an illustrative terrain exploration, not a drainage or flood forecast.

No generated terrain, inferred live stock positions or live imagery is presented. The model does not connect to Halter.
