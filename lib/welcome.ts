// The daily welcome: the farm's forecast for today and the next four days, plus a joke to suit the weather.
// Forecasts come from Open-Meteo for the farm's own coordinates; the result is fixed for the NZ day.
export const FARM = { lat: -40.2058, lon: 175.5145, place: 'Feilding' };

const WORDS: [number[], string, string][] = [
  [[0], 'fine and clear', 'sun'], [[1], 'mostly fine', 'sun'], [[2], 'partly cloudy', 'part'], [[3], 'cloudy', 'cloud'],
  [[45, 48], 'foggy', 'fog'], [[51, 53, 55, 56, 57], 'drizzle', 'drizzle'], [[61, 66], 'light rain', 'rain'], [[63], 'rain', 'rain'],
  [[65, 67], 'heavy rain', 'rain'], [[71, 73, 75, 77, 85, 86], 'snow', 'snow'], [[80, 81], 'showers', 'showers'],
  [[82], 'heavy showers', 'showers'], [[95], 'thunderstorms', 'storm'], [[96, 99], 'thunderstorms with hail', 'storm'],
];
export const describe = (code: number) => { const w = WORDS.find(([codes]) => codes.includes(code)); return { words: w?.[1] ?? 'changeable', icon: w?.[2] ?? 'cloud' }; };
const compass = (deg: number) => ['northerly', 'northeasterly', 'easterly', 'southeasterly', 'southerly', 'southwesterly', 'westerly', 'northwesterly'][Math.round(deg / 45) % 8];
const weekday = (date: string) => new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', weekday: 'long' }).format(new Date(date + 'T12:00:00+13:00'));

const JOKES: Record<string, string[]> = {
  wet: [
    'Rain on the way. Good for the grass, bad for the washing, and a fine excuse for another cuppa.',
    'They say a wet spring makes for a good autumn. They also say the cheque’s in the mail.',
    'If it rains much more this week, we might swap the steers for ducks. At least ducks don’t need drenching.',
    'Drizzle again. That’s the Manawatū’s way of saying it can’t quite commit.',
    'Why did the lamb bring an umbrella to the sale? It heard prices might be a bit damp.',
    'The gumboots are finally earning their keep this week.',
  ],
  windy: [
    'Windy enough today that your hat might take itself on a farm tour.',
    'It’s the kind of wind where you open the ute door and it shuts it for you.',
    'Why don’t sheep mind a gale? They’ve already got their jumpers on.',
    'What did the windmill say to the farmer? Big fan of your work.',
    'Feilding wind. The only thing that shifts a gate faster than a bored heifer.',
  ],
  cold: [
    'Frosty start. For once the gumboots are colder than the beer.',
    'Cold enough that the steers are queuing at the hay like it’s the pie cart.',
    'What do you get when you cross a sheep with a kangaroo? A woolly jumper. Handy on a morning like this.',
  ],
  warm: [
    'A warm one. The cattle will find the only bit of shade on the place and hold a meeting in it.',
    'Hot enough to cook a steak on the ute bonnet. Best leave the beef to the works, though.',
  ],
  fine: [
    'A fine day ahead. Perfect weather for jobs, which is exactly why we’ll be talking about doing them.',
    'Fine weather and a full tank in the ute. Doesn’t get much better, unless the schedule goes up too.',
    'What do lambs do on a sunny day? Have a baa-becue.',
  ],
  any: [
    'Why did the steer get a promotion? He was outstanding in his field.',
    'What do you call a sleeping bull? A bulldozer.',
    'Where do cows go on a night out? The moo-vies.',
    'What’s a sheep’s favourite car? A Lamborghini.',
    'Why do cows wear bells? Because their horns don’t work.',
    'What do you call a cow with no legs? Ground beef.',
    'How does a farmer count his cattle? With a cow-culator.',
    'What did the grass say to the steer? Keep chewing like that and I’ll need a lie down.',
  ],
};

// Today's weather picks the kind of joke; the day of the year picks which one, so it changes daily.
export function pickJoke(day: any, date: string) {
  const kind = day.rain >= 2 || day.rainChance >= 70 || ['rain', 'showers', 'drizzle', 'storm'].includes(day.icon) ? 'wet'
    : day.wind >= 40 ? 'windy' : day.min <= 3 ? 'cold' : day.max >= 25 ? 'warm' : 'fine';
  const list = [...JOKES[kind], ...JOKES.any], n = Math.floor(Date.parse(date + 'T00:00:00Z') / 86400000);
  return list[n % list.length];
}

export function buildWelcome(forecast: any, today: string) {
  const d = forecast.daily;
  const days = d.time.map((date: string, i: number) => ({
    date, weekday: weekday(date), code: d.weather_code[i], ...describe(d.weather_code[i]),
    max: Math.round(d.temperature_2m_max[i]), min: Math.round(d.temperature_2m_min[i]),
    rain: Math.round(d.precipitation_sum[i] * 10) / 10, rainChance: d.precipitation_probability_max[i],
    wind: Math.round(d.wind_speed_10m_max[i]), windFrom: compass(d.wind_direction_10m_dominant[i]),
  })).filter((day: any) => day.date >= today).slice(0, 5);
  const [now, ...rest] = days;
  const windy = now.wind >= 40 ? `, and a blustery ${now.windFrom}` : now.wind >= 28 ? `, with a fresh ${now.windFrom}` : '';
  const wet = now.rain >= 1 ? `, about ${Math.round(now.rain)} mil of rain` : '';
  const todayLine = `Today in ${FARM.place}: ${now.words}, a top of ${now.max} and a low of ${now.min}${wet}${windy}.`;
  const aheadLine = `The next few days: ${rest.map((x: any) => `${x.weekday}, ${x.words} and ${x.max}`).join('; ')}.`;
  const joke = pickJoke(now, today);
  return { date: today, place: FARM.place, days, todayLine, aheadLine, joke, spoken: `${todayLine} ${aheadLine} ${joke}`, source: { name: 'Open-Meteo', url: 'https://open-meteo.com/' } };
}

export async function fetchForecast() {
  const q = new URLSearchParams({ latitude: String(FARM.lat), longitude: String(FARM.lon), timezone: 'Pacific/Auckland', forecast_days: '6',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_direction_10m_dominant' });
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('Forecast unavailable: HTTP ' + r.status);
  return r.json();
}
