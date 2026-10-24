# Hildon Farm — project reference

**What we built, why we built it, and how it works**  
Prepared 24 October 2026 · Published website version 8  
[Open Hildon Farm](https://sandon-farm-explorer.sacredscarf15.chatgpt.site)

This is a handover reference for the current implementation. The feature descriptions are grounded in the source code and live saved briefing. The rationale reflects the requests and decisions in this project; it has not been validated through farmer interviews or a field usability study.

## 1. The purpose

Give Warwick a useful, familiar way to catch up on livestock markets and explore the family farm near Feilding.

The brief developed from exploring farm data into a practical daily companion. The family already gets farming information from radio and newspapers. That led to a short, spoken briefing with links to the original reporting. The latest navigation change gives Warwick a clear choice on arrival: **Daily briefing** or **Explore the farm**.

The intended value is context before a sale or a conversation about the farm: what has been reported, where it applies, when the evidence was published, and what is still unknown.

## 2. What we built and why

| What is implemented | Why we chose it | Practical consequence |
| --- | --- | --- |
| A welcome screen with two main destinations | You identified that the navigation had become cluttered and wanted Warwick to reach the briefing directly. | Listening to the briefing does not require navigating the map controls. |
| A personalised greeting and spoken name setup | You requested Wozza, Wok, Big Dog Wok or Warwick as the choices. | The name is remembered on that device and can be changed. Buttons provide an alternative to speaking. |
| Voice enabled by default, with spoken briefings and answers | The radio habit informed an experience Warwick can listen to. | The browser can still require a first tap, microphone permission and a supported speech service. |
| Questions within the briefing | You wanted Warwick to ask about what he has just heard. | He can type or speak supported questions about prices, dates, commentary, weather context and outlooks. |
| Detailed reports and numbers behind an expandable section | The first view needed to stay approachable while retaining the evidence. | A quick catch-up and a deeper read share the same saved data. |
| One Map layers menu | The growing number of map layers was competing for attention. | Aerial, bare ground, water paths, soil and satellite remain available through one control. |
| A map built from real elevation and imagery | The farm itself is the reference point for exploration. | Ground and image dates are displayed; the boundary remains approximate. |
| Soil classification and satellite history | You asked what useful soil information and other data sources we could bring in. | The app shows broad mapped soil characteristics and dated greenness observations, with their limits stated. |
| Dated market observations and cautious sale outlooks | You wanted local prices, sentiment and an indication of upcoming sales. | Regional context is distinguished from local results, and missing evidence stays visible. |
| Original forecast history | Later results need to be judged against what was actually said beforehand. | The server retains first-issued forecast records to prevent hindsight edits within the retained history. |

## 3. The data behind the farm views

These details come from the provenance files included with the source export.

| Layer | Source and implementation | How to interpret it |
| --- | --- | --- |
| Ground elevation | Horizons Regional Council / LINZ Manawatū–Whanganui LiDAR, surveyed **2015–2016**. The original 1 m DEM is sampled at 10 m spacing for the interactive mesh. | Measured historical terrain, with elevations in NZVD2016. Display relief starts at 2× and can be set to 1×. |
| Aerial photography | Manawatū–Whanganui LASS / LINZ **2021–2022** imagery, resampled for delivery. | A dated photograph of the area. |
| Historical aerial comparison | LASS / LINZ **2010–2011** imagery, aligned to the same map extent. | The slider blends the two survey periods. A blend is not an image from an intermediate year. |
| Farm outline and measurements | Outline traced from the supplied marked screenshot and aligned to imagery. Horizontal distances and areas use NZTM / EPSG:2193. | Useful for orientation and approximate measurements; unsuitable for determining a legal boundary. |
| Water paths | Downhill D8 routing derived from the displayed terrain grid. | Illustrative surface flow. Rainfall, drains, infiltration, flood depths and subsurface movement are not modelled. |
| Soil | Manaaki Whenua’s legacy Fundamental Soil Layer, NZ Soil Classification. The displayed extent has one mapped group: **Perch-Gley Pallic**. | Broad legacy mapping at about 1:50,000. The app’s lookup grid does not imply paddock-scale soil accuracy. Current pH, nutrients and moisture are unavailable from this layer. |
| Satellite photos and greenness | Nine selected Copernicus Sentinel-2 Level-2A observations, **16 November 2025 to 7 October 2026**, with 10 m output pixels. Cloud and shadow screening is applied. | Dated snapshots. NDVI indicates greenness; it does not directly measure pasture mass, feed allocation, yield or animal positions. |

The satellite dates retained in the build are 16 Nov 2025, 11 Dec 2025, 5 Jan 2026, 21 Mar 2026, 25 Apr 2026, 20 May 2026, 9 Jun 2026, 29 Jul 2026 and 7 Oct 2026, displayed in New Zealand time.

The build has no Halter connection, live stock tracking or live soil sensors. Those capabilities would need separate access and data integrations.

## 4. The market briefing and its evidence rules

### Sources

The refresh instructions identify the official **Farmers Weekly NZ podcast** and **The Country** RSS feeds, the **Feilding Saleyards** calendar, public Farmers Weekly market reporting and Beef + Lamb NZ context. The current saved briefing also cites selected **MyLiveStock Rongotea** reports.

These sources serve different purposes. A calendar establishes an advertised sale date. A public article or report may establish a sold observation. A podcast description can establish reported commentary without establishing a numerical sale result.

At the time this reference was prepared, the live briefing was persisted at **revision 2**, with **four original forecast-history records**. Its coverage note says selected Rongotea observations are kept separate from Feilding and national commentary, and that fresh comparable Feilding sold results remain unavailable. These are implementation-state details, not a new market assessment.

### Rules we built around

- **Keep places distinct.** Feilding, Rongotea, Hawke’s Bay and national evidence have different scopes.
- **Keep dates distinct.** Publication date, sale date and source-check date are separate. An unknown sale date stays unknown. Evidence older than 14 days is labelled historical.
- **Preserve price units.** NZD/head, NZD/kg liveweight and NZD/kg carcass weight cannot be directly combined.
- **Preserve the statistic.** A selected pen or top pen is not a sale average. Estimated weights and unstated GST treatment remain explicit.
- **Require comparable observations for trends.** The trend logic checks matching yard, class, unit and statistic, known sale dates, non-estimated weights within a 10% range, and a recent latest observation. Selected pens are excluded from that calculation.
- **Keep forecasts cautious.** Outlooks identify direction, confidence, evidence and whether they are an app assessment or an attributed analyst forecast. The current server schema requires numeric forecast ranges to remain empty.
- **Retain the original forecast.** Outcomes refer to recorded forecasts. An uncertain forecast cannot be scored as a successful directional prediction. The current history implementation retains up to 150 records.
- **Publish summaries with attribution.** The update instructions call for short original summaries and links to publishers; original audio is linked for playback rather than copied into the website.

### How updates work

The app exposes `get_market_brief`, `get_market_update_instructions` and owner-only `update_market_brief` operations. Updates read the current revision first, validate the complete new briefing, preserve forecast history and reject conflicting writes.

The briefing is stored separately from the website code, so a data refresh can appear without rebuilding the website. Refresh instructions require checking both official podcast feeds over the latest 21 days and checking the official local sale calendar. The live coverage note reports a daily evening refresh schedule; this reference does not independently audit the automation’s timing or execution history.

## 5. What the interactive questions and voice actually do

### Question answering

The current implementation uses a **fixed set of question intents and report-reading functions**. It does not call an external generative language model or perform a fresh search for each question.

Supported examples include:

| Question | What the app reads |
| --- | --- |
| “When is the next sale?” | Future events in the saved calendar, with NZ times and calendar-check dates. |
| “What are cattle prices?” | Saved cattle observations with dates, weights, units and historical labels. |
| “And what about lambs?” | The previous question topic, applied to the new stock class. |
| “What is the outlook?” | Saved outlooks for upcoming sales, including confidence and origin. |
| “What does firm mean?” | A short explanation of the market term. |
| “Are prices trending up?” | The comparable-observation checks, or an explanation that evidence is insufficient. |

This makes the supported responses traceable to the saved reports. The trade-off is limited language flexibility: complex questions or unfamiliar phrasing may fall outside the recognised intents. A future conversational AI service would be a separate enhancement, with its own provider, running costs and evidence controls.

### Voice and personalisation

The site uses browser speech synthesis for playback and browser speech recognition for input. It attempts spoken setup with voice enabled by default. Browser policies, device settings and microphone permission still control whether speech can start.

Spoken answers can be replayed. Typed questions and name buttons remain usable when speech fails. Microphone sessions stop when the page is hidden or left. The chosen name, voice preference and saved paddocks are browser-local; they are not synchronised between devices. The browser’s recognition service may process speech externally.

## 6. A developer’s map of the build

| Area | Main files in the ZIP |
| --- | --- |
| Welcome and destination cards | `public/index.html`, `public/home.js`, `public/home.css` |
| Name setup and preferences | `public/profile-ui.mjs`, `public/farm-profile.mjs`, `public/profile.css` |
| Shared speech controls | `public/farm-voice.mjs`, `public/briefing-audio.mjs` |
| Briefing page and conversation interface | `public/markets.html`, `public/markets.js`, `public/daily-briefing.js`, `public/daily.css` |
| Supported questions and price comparisons | `public/briefing-answers.mjs`, `public/market-trends.mjs` |
| Farm map and tools | `public/farm.html`, `public/app.js`, `public/farm-nav.js`, `public/farm-tools.js`, `public/data-layers.js` |
| Map assets and provenance | `public/data/`, including `sources.json`, `history-source.json`, `soil/soil-provenance.json` and `satellite/satellite.json` |
| Briefing validation, persistence and update rules | `lib/market-schema.ts`, `lib/market-store.ts`, `lib/market-instructions.json` |
| Server routes and agent-facing operations | `app/api/markets/route.ts`, `app/api/market-instructions/route.ts`, `app/mcp/route.ts` |
| Checks | `scripts/check-briefing.mjs`, `scripts/check-voice.mjs` |

The application runs as a Vinext/React Worker through Sites. The map renderer uses Three.js. Public interface files and map assets are served alongside the server routes; the live briefing is held in an R2 bucket. The owner-authorisation setting is stored separately as a runtime secret.

### What was checked

The build passed. Browser checks covered the personalised welcome, persisted name across pages, typed questions, source links, historical price labels, phone-width briefing layout, map loading and soil selection through the new layer menu. Automated checks covered dates, units, missing evidence, follow-up stock questions, recognised names, speech queue handling, cancellation, denied microphone permission and cleanup when a page is hidden.

**Actual audible speech and recognition on Warwick’s phone remain a device check.** The preview browser could exercise controls and error handling but had no working speech output. Farmer usability and forecast accuracy have not been established by those technical checks.

### Keeping and extending it

The exported `Hildon-Farm.zip` contains tracked source, assets, a `START-HERE.txt` guide and `backup/market-brief.json`. Its code corresponds to published version 8, commit `d454e7dbba07bf04feac8adeac9374c784214f10`. The briefing backup is a snapshot; later updates require a new export.

A private GitHub repository provides an independent source copy. Moving to another host also requires the live briefing records, storage configuration and runtime authorisation settings. Browser-local paddocks and preferences need their own exports or a future synchronisation feature.

The useful next decisions are to test the voice flow on Warwick’s actual device, observe whether he can use it comfortably, and decide whether broader conversational questions justify a generative AI integration. A complete local sale-price feed and any Halter integration need verified supplier access and permission before implementation.

## 7. Reference links

The dataset and feed links below are retained from the build’s provenance and update instructions. Data/RSS endpoints may open as raw files. This document records the build’s sources; it does not refresh the market evidence.

**Farm and environmental data**

- [LINZ-hosted 2015–2016 elevation collection](https://nz-elevation.s3.ap-southeast-2.amazonaws.com/manawatu-whanganui/manawatu-whanganui_2015-2016/dem_1m/2193/collection.json)
- [LINZ-hosted 2021–2022 aerial collection](https://nz-imagery.s3.ap-southeast-2.amazonaws.com/manawatu-whanganui/manawatu-whanganui_2021-2022_0.3m/rgb/2193/collection.json)
- [LINZ-hosted 2010–2011 aerial collection](https://nz-imagery.s3-ap-southeast-2.amazonaws.com/manawatu-whanganui/manawatu-whanganui_2010-2011_0.4m/rgb/2193/collection.json)
- [Manaaki Whenua FSL viewer and information](https://soils.landcareresearch.co.nz/tools/fsl)
- [FSL mapping service](https://maps.scinfo.org.nz/)
- [Earth Search Sentinel-2 Collection 1 Level-2A metadata](https://earth-search.aws.element84.com/v1/collections/sentinel-2-c1-l2a)

**Market reporting and calendars**

- [Farmers Weekly NZ podcast RSS](https://www.spreaker.com/show/5901172/episodes/feed)
- [The Country official RSS](https://www.omnycontent.com/d/playlist/7784f840-c291-422a-924b-ad9000bbad71/6ac3a53c-3f44-41fd-8866-ae990144f969/f941f6d6-d476-4765-b06f-ae990144fa25/podcast.rss)
- [Feilding Saleyards calendar and information](https://feildingsaleyards.co.nz/)
- [Farmers Weekly public markets reporting](https://www.farmersweekly.co.nz/markets/)
- [Beef + Lamb NZ news and outlook context](https://beeflambnz.com/news)

Individual articles, episodes and Rongotea reports are linked in the saved briefing’s `sources` array and on the website.

**Speech implementation references**

- [MDN: SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition)
- [Chrome platform: speech synthesis and user activation](https://www.chromestatus.com/feature/5687444770914304)
- [WebKit: speech recognition support and device settings](https://webkit.org/blog/11648/new-webkit-features-in-safari-14-1/)

Terrain and aerial attribution in the build uses CC BY 4.0; the FSL service declares CC BY 3.0 NZ; satellite assets retain the Copernicus terms recorded in their manifest. Keep the bundled attribution and licence records with any redistribution.
