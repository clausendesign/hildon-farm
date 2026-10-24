import { comparableTrends } from './market-trends.mjs';

// Warwick runs store beef cattle, so dairy-beef sales, reports and prices (Friesian and dairy-cross stock) are left out.
const DAIRY_BEEF = /dairy[\s-]?beef|friesian|dairy\b|speckle park.{0,3}dairy/i;
export const isDairyBeef = text => DAIRY_BEEF.test(String(text || ''));
export function focusOnStoreBeef(brief) {
  const dairyEvents = new Set(brief.events.filter(e => e.species === 'cattle' && DAIRY_BEEF.test(`${e.id} ${e.title}`)).map(e => e.id));
  const isDairy = item => item.species === 'cattle' && DAIRY_BEEF.test([item.class, item.classLabel, item.scope, item.summary, item.title, item.category].filter(Boolean).join(' '));
  return {
    ...brief,
    events: brief.events.filter(e => !dairyEvents.has(e.id)),
    outlooks: brief.outlooks.filter(o => !dairyEvents.has(o.eventId) && !isDairy(o)),
    briefs: brief.briefs.filter(b => !isDairy(b)),
    prices: brief.prices.filter(p => !isDairy(p)),
  };
}

export const speciesName = value => ({ cattle: 'Cattle', lambs: 'Lambs', sheep: 'Sheep', weather: 'Weather' }[value] || value);
export const nzDate = (value, options = {}) => value ? new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', day: 'numeric', month: 'short', year: 'numeric', ...options }).format(new Date(value.length === 10 ? value + 'T12:00:00+12:00' : value)) : 'date not reported';
export function nzToday(now = Date.now()) {
  const p = new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(now));
  return ['year', 'month', 'day'].map(type => p.find(part => part.type === type).value).join('-');
}
export const isOld = (date, now = Date.now()) => !date || now - Date.parse(date) > 14 * 86400000;
export function upcomingEvents(brief, stock = 'all', now = Date.now()) {
  const today = nzToday(now);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Pacific/Auckland', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(now));
  return (brief.events || []).filter(e => e.date && (e.date > today || (e.date === today && (!e.time || e.time >= time))) && (stock === 'all' || e.species === stock || (stock === 'lambs' && e.species === 'sheep'))).sort((a, b) => `${a.date} ${a.time || ''}`.localeCompare(`${b.date} ${b.time || ''}`));
}
function detectedSpecies(q) {
  if (/\b(lambs?|hoggets?)\b/.test(q)) return 'lambs';
  if (/\b(cattle|beef|steers?|heifers?|bulls?|calves|weaners?|cows?)\b/.test(q)) return 'cattle';
  if (/\b(sheep|ewes?|rams?|mutton)\b/.test(q)) return 'sheep';
  return null;
}
// Processor schedule series recorded in the briefing (labels match lib/market-series.ts).
const SCHEDULES = { 'lamb-yx-ni': ['lambs', 'North Island lamb schedule, 17.5 kg YX', 'head'], 'steer-p2-ni': ['cattle', 'North Island P2 steer schedule, 270 to 295 kg', 'kg'], 'bull-m2-ni': ['cattle', 'North Island M2 bull schedule, 296 to 320 kg', 'kg'] };
const scheduleMoney = (v, per) => per === 'kg' ? `$${(v / 100).toFixed(2)} a kilo carcass weight` : `$${Math.round(v)} a head`;
function scheduleText(s) {
  const [, label, per] = SCHEDULES[s.seriesId], c = s.compare || {}, m = v => scheduleMoney(v, per);
  const gap = (v, before) => { const d = per === 'kg' ? `${Math.abs(v - before)} cents a kilo` : `$${Math.abs(Math.round(v - before))}`; return v === before ? 'the same' : `${d} ${v > before ? 'ahead' : 'behind'}`; };
  const parts = [`${label}: ${m(s.value)}, week of ${nzDate(s.weekOf)}.`];
  if (c.yearAgo) parts.push(`A year ago it was ${m(c.yearAgo)}, so it is ${gap(s.value, c.yearAgo)}.`);
  const earlier = [c.fourWeeksAgo && `${m(c.fourWeeksAgo)} four weeks ago`, c.threeMonthsAgo && `${m(c.threeMonthsAgo)} three months ago`].filter(Boolean);
  if (earlier.length) parts.push(`It was ${earlier.join(' and ')}.`);
  if (c.high52 && c.low52) parts.push(`The 52-week range is ${m(c.low52)} to ${m(c.high52)}.`);
  return parts.join(' ');
}
function classify(q) {
  if (/\b(mean|meaning|explain|definition|difference)\b/.test(q) && /\b(firm|soft|steady|liveweight|carcass|head|mixed|confidence)\b/.test(q)) return 'terms';
  if (/\b(how old|updated|checked|fresh|stale|current|up.to.date)\b/.test(q) && !/\b(price|prices)\b/.test(q)) return 'freshness';
  if (/\b(source|sources|where.*(?:come|from)|who.*(?:said|says|report)|radio|podcast)\b/.test(q)) return 'sources';
  if (/\b(weather|rain|dry|drought|feed|grass|el ni[ñn]o)\b/.test(q)) return 'weather';
  if ((/\bschedules?\b/.test(q) && !/\b(sale|sales|saleyard)\b/.test(q)) || /\b(processors?|works price|meat companies|this time last year|last year|last season|this season)\b/.test(q)) return 'schedules';
  if (/\b(when|what time|calendar|schedule)\b/.test(q) || /\bnext\b.*\b(sale|sales|saleyard)\b/.test(q)) return 'sales';
  if (/\b(right|correct|accuracy|history|held up|hold up|did.*forecast|result.*forecast)\b/.test(q)) return 'history';
  if (/\b(forecast|outlook|predict|prediction|next week|next month|should i|should we|sell now|buy now|will .* (?:rise|fall|up|down)|going to)\b/.test(q)) return 'outlook';
  if (/\b(trend|trending|compared|compare|last week|rising|falling|higher|lower|up or down|going up|going down|better|worse)\b/.test(q)) return 'trends';
  if (/\b(price|prices|paid|pay|worth|dollars?|cost|how much|weight|weigh|kilograms?|kg|average|top pen)\b/.test(q)) return 'prices';
  if (/\b(market|briefing|summary|summarise|summarize|happening|looking|doing|tell me|catch.up|latest|update|lamb|lambs|sheep|cattle|beef|steers|ewes|weaners|anything new)\b/.test(q)) return 'overview';
  return null;
}
function priceText(p, now) {
  const label = p.classLabel || p.class || p.category || speciesName(p.species);
  const unit = p.unit || ({ head: 'NZD/head', kg_lw: 'NZD/kg LW', kg_cw: 'NZD/kg CW' }[p.priceBasis]) || 'unit not reported';
  const min = Number(p.min ?? p.price), max = Number(p.max ?? p.price);
  const amount = Number.isFinite(min) ? `$${min.toFixed(unit === 'NZD/head' ? 0 : 2)}${Number.isFinite(max) && max !== min ? `–$${max.toFixed(2)}` : ''} ${unit}` : 'Price not reported';
  const basis = p.saleDate ? `Sale ${nzDate(p.saleDate)}.` : `Published ${nzDate(p.publishedDate)}; exact sale date not reported.`;
  const stale = p.historicalContext || isOld(p.saleDate || p.publishedDate, now);
  const weights = p.weightMinKg ? ` ${p.weightMinKg}${p.weightMaxKg && p.weightMaxKg !== p.weightMinKg ? `–${p.weightMaxKg}` : ''} kg ${p.weightEstimated ? 'estimated ' : ''}${p.weightBasis || ''}.` : ' Weight not reported.';
  return `${stale ? 'Historical observation. ' : ''}${p.yard || p.venue || p.region || 'Location not reported'}: ${label}, ${amount}.${weights} ${basis} ${p.statistic || 'Reported observation'}. ${p.note || ''}`;
}
export function answerQuestion(brief, question, context = {}, now = Date.now()) {
  const q = String(question).trim().toLowerCase().replace(/[’']/g, '');
  const explicit = detectedSpecies(q);
  const stock = /\b(all stock|all three|everything|all markets)\b/.test(q) ? 'all' : explicit || context.species || 'all';
  let intent = classify(q);
  if (/\b(gold|silver|bitcoin|crypto|stocks|shares|milk|wool|goats?|pigs?|deer)\b/.test(q)) intent = 'unsupported';
  if (/^(?:and |what about|how about|why|can you explain|tell me more|what about them|and them)/.test(q) && !intent) intent = context.intent || 'overview';
  if (/^(?:and |what about|how about)/.test(q) && explicit && (!intent || intent === 'overview')) intent = context.intent || 'overview';
  const refs = new Set();
  const add = item => { (item.sourceIds || [item.sourceId]).filter(Boolean).forEach(id => refs.add(id)); };
  const matching = item => stock === 'all' || item.species === stock;
  const paragraphs = [];
  const checked = `Sources last checked ${nzDate(brief.checkedAt)}.`;
  const supported = ['schedules', 'overview', 'prices', 'sales', 'outlook', 'weather', 'trends', 'sources', 'terms', 'freshness', 'history'];
  if (!supported.includes(intent)) {
    return { text: 'I can help with the saved livestock briefing: reported prices and weights, sale dates, market commentary, weather risks and the next-sale outlook. Which of those would you like to know about?', sourceIds: [], intent: context.intent || 'overview', species: stock, suggestions: ['When is the next sale?', 'What are lambs doing?', 'What prices have been reported?'] };
  }
  if (intent === 'schedules') {
    const rows = (brief.schedules || []).filter(s => SCHEDULES[s.seriesId] && (stock === 'all' || stock === SCHEDULES[s.seriesId][0] || (stock === 'sheep' && SCHEDULES[s.seriesId][0] === 'lambs')));
    if (!rows.length) paragraphs.push('There is no processor schedule reading saved in the briefing yet.');
    rows.forEach(row => { add(row); paragraphs.push(scheduleText(row)); });
    if (rows.length) paragraphs.push('These are averages of what processors pay for prime stock. They are not store sale prices, and the season charts under The numbers show how they have moved.');
  }
  if (intent === 'terms') {
    const definitions = [
      [/\bfirm\b/, '“Firm” means reported prices or buying demand are holding strongly. It usually favours a seller; a buyer may pay more. It does not give us a numerical price increase.'],
      [/\bsoft\b/, '“Soft” means reported prices or buying demand are weaker. It can favour a buyer. It does not tell us the size of a price change.'],
      [/\bsteady\b/, '“Steady” means the report describes little change in conditions. It is a commentary label, rather than a calculated price trend.'],
      [/\bmixed\b/, '“Mixed” means the evidence points in different directions, or buying varies by stock class and quality.'],
      [/\bliveweight\b/, 'Liveweight is the animal’s weight before slaughter. A price in NZD/kg LW is dollars per kilogram of live animal weight.'],
      [/\bcarcass\b/, 'Carcass weight is the processed carcass weight after slaughter. NZD/kg CW cannot be compared directly with liveweight prices.'],
      [/\bhead\b/, 'NZD/head is the total reported price for one animal. It is a different basis from dollars per kilogram. A selected top pen is not a sale average.'],
      [/\bconfidence\b/, 'Low confidence means evidence is limited or mixed. An app outlook is an assessment of the saved reports, not a guaranteed sale result.']
    ];
    definitions.forEach(([pattern, definition]) => { if (pattern.test(q)) paragraphs.push(definition); });
  }
  if (intent === 'freshness') paragraphs.push(checked, brief.coverageNote || 'Check the dates on each observation. The date you open the briefing is not the date of its market evidence.');
  if (intent === 'sources') {
    paragraphs.push(checked, 'The briefing uses short summaries of public publisher reports and podcast descriptions. These are the sources saved with the briefing, rather than a fresh search performed for this question.');
    (brief.sources || []).forEach(source => { refs.add(source.id); paragraphs.push(`${source.publisher}: ${source.title}${source.publishedAt ? `, published ${nzDate(source.publishedAt)}` : ''}.`); });
  }
  if (intent === 'sales') {
    const events = upcomingEvents(brief, stock, now);
    if (!events.length) paragraphs.push('There are no future sales for that stock class in the saved calendar. Check Feilding Saleyards for the latest advertised dates.');
    events.slice(0, 4).forEach(event => { add(event); paragraphs.push(`${event.title}: ${nzDate(event.date, { weekday: 'long' })}${event.time ? ` at ${event.time}` : '; time not reported'}, New Zealand time. Calendar checked ${nzDate(event.checkedAt || brief.checkedAt)}.`); });
    if (events.length) paragraphs.push('Confirm the advertised time with the saleyard before travelling.');
  }
  if (intent === 'prices') {
    paragraphs.push(checked);
    const prices = (brief.prices || []).filter(matching).sort((a, b) => String(b.saleDate || b.publishedDate).localeCompare(String(a.saleDate || a.publishedDate)));
    if (!prices.length) paragraphs.push(`There are no verified ${stock === 'all' ? 'livestock' : speciesName(stock).toLowerCase()} price observations in the saved briefing. I can’t give a current price from these reports.`);
    prices.slice(0, 4).forEach(price => { add(price); paragraphs.push(priceText(price, now)); });
    if (prices.length && !prices.some(p => (p.yard === 'Feilding' || p.venue === 'Feilding') && !p.historicalContext && !isOld(p.saleDate, now))) paragraphs.push('There is no recent, verified Feilding price for this stock class in the saved briefing. These observations are context, not a current quote for your animals.');
    if (/\b(\d+\s*(?:kg|kilo)|worth|my |our |calculate|estimate)\b/.test(q)) paragraphs.push('I can’t value your animals from a different pen, weight or sale date. That needs a current report for the same stock class, weight and price basis.');
  }
  if (intent === 'trends') {
    const trends = comparableTrends((brief.prices || []).filter(matching), now);
    if (!trends.length) paragraphs.push('There aren’t enough recent, comparable observations to calculate a reliable price trend. We need the same yard, class, unit and statistic, with similar weights. A strong regional report or one top pen cannot establish a Feilding price rise.');
    trends.forEach(t => { add(t.before); add(t.latest); paragraphs.push(`${t.latest.yard}, ${t.latest.classLabel}: ${t.change > 0 ? 'up' : t.change < 0 ? 'down' : 'unchanged'} ${Math.abs(t.percent || 0).toFixed(1)}%, from ${t.before.min} to ${t.latest.min} ${t.latest.unit}, ${nzDate(t.before.saleDate)} to ${nzDate(t.latest.saleDate)}. Yarding composition may still affect prices.`); });
  }
  if (intent === 'overview' || intent === 'weather') {
    paragraphs.push(checked);
    const briefs = (brief.briefs || []).filter(b => intent === 'weather' ? b.species === 'weather' : matching(b) && b.species !== 'weather').sort((a, b) => String(b.evidenceDate).localeCompare(String(a.evidenceDate)));
    briefs.slice(0, 4).forEach(item => { add(item); paragraphs.push(`${speciesName(item.species)} · ${item.scope || item.yard}. ${item.historicalContext || isOld(item.evidenceDate, now) ? 'Historical context. ' : ''}Published ${nzDate(item.evidenceDate)}. ${item.summary}`); });
    if (!briefs.length) paragraphs.push('There is no fresh commentary for that stock class in the saved briefing.');
    if (intent === 'weather') paragraphs.push('This is reported weather context, not a current forecast for the farm or a measurement of your feed supply.');
  }
  if (intent === 'outlook') {
    const ids = new Set(upcomingEvents(brief, stock, now).map(e => e.id));
    const outlooks = (brief.outlooks || []).filter(o => matching(o) && ids.has(o.eventId));
    if (/\b(should i|should we|sell|buy)\b/.test(q)) paragraphs.push('The briefing alone cannot establish the right buying or selling decision for your stock. Your feed, animal weights, costs and current local quotes also matter. Here is the evidence saved for the next sale.');
    if (!outlooks.length) paragraphs.push('There is no current next-sale outlook for that stock class in the saved briefing.');
    outlooks.slice(0, 4).forEach(item => { add(item); const event = (brief.events || []).find(e => e.id === item.eventId); paragraphs.push(`${speciesName(item.species)}${event ? ` · ${event.title}, ${nzDate(event.date)}` : ''}: ${item.direction}, ${item.confidence} confidence. ${item.type === 'app-assessment' ? 'App assessment' : 'Attributed forecast'}, issued ${nzDate(item.issuedAt)}. ${item.summary}`); });
    paragraphs.push('There is no numerical price forecast unless one is explicitly recorded in the source.');
  }
  if (intent === 'history') {
    const history = (brief.forecastHistory || []).filter(matching);
    const outcomes = (brief.outcomes || []).filter(result => history.some(h => h.id === result.forecastId));
    if (!outcomes.length) paragraphs.push('There are no matched outcomes for those original forecasts yet. A forecast needs a comparable sale result before we can judge it; missing results do not count as a correct prediction.');
    outcomes.forEach(result => { add(result); paragraphs.push(`${result.score}: ${result.explanation || 'No further explanation recorded.'}`); });
  }
  return { text: paragraphs.join('\n\n'), sourceIds: [...refs], intent, species: stock, suggestions: intent === 'schedules' ? [stock === 'cattle' ? 'And lambs?' : 'And steers?', 'When is the next sale?'] : intent === 'sales' ? ['What is the outlook?', 'What prices have been reported?'] : intent === 'prices' ? ['Are prices trending up?', 'When is the next sale?'] : ['When is the next sale?', 'What prices have been reported?'] };
}

export function briefingScript(brief, name, now = Date.now()) {
  const parts = [`${name ? `Righto, ${name}. ` : ''}Here is your Hildon Farm daily briefing. Sources last checked ${nzDate(brief.checkedAt)}.`];
  (brief.briefs || []).slice(0, 4).forEach(item => parts.push(`${speciesName(item.species)}, ${item.scope || item.yard}. Published ${nzDate(item.evidenceDate)}. ${item.historicalContext || isOld(item.evidenceDate, now) ? 'Historical context. ' : ''}${item.summary}`));
  const next = upcomingEvents(brief, 'all', now)[0];
  if (next) parts.push(`Next in the saved calendar: ${next.title}, ${nzDate(next.date)}, ${next.time || 'time not reported'}, New Zealand time. Confirm with the saleyard.`);
  else parts.push('There are no future sales in the saved calendar.');
  parts.push(brief.coverageNote || 'Check source dates before using these reports.', 'What would you like to know? Tap Ask by voice, or type a question below.');
  return parts.join(' ');
}
