// A leg is a journey between two places on somebody else's timetable.
//
// This app has always called those things flights, and the word has been
// doing two jobs: the mode of transport, and the shape of the record. The
// shape is the same for a Eurostar as for a 787 — you left a named place at
// a time, you arrived at another named place at a time, somebody operated
// it and gave it a number, and there is a seat and a class of travel and a
// vehicle with an identity. Only the mode differs.
//
// So the model is: a **node** is somewhere a service leaves from, a **part**
// is the bit of it you were actually standing in, and a **mode** is how the
// gap gets crossed. An airport and a railway station are the same kind of
// object with a different `kind`, and everything that reads a leg reads the
// node, not the airport.
//
// This file is deliberately only the vocabulary and the places. The
// inference — which node, which mode, which service — is in deduce.js,
// because that is the part with judgement in it and this is the part with
// facts in it.

import { AIRPORT_COORDS } from './airportCoords.js'
import { AIRPORT_CITY } from './airportCities.js'

/**
 * How a gap gets crossed, and what that implies.
 *
 * `ceiling` is the fastest a mode can average **door to door over the
 * ground**, not its cruising speed. It is used one way only: to rule a mode
 * out. A crossing's measured average is always an understatement — great
 * circles are shorter than real routes, and the two fixes bracketing a
 * journey are taken before it starts and after it ends — so a measured
 * average above a ceiling is proof, while one below it proves nothing.
 *
 * `kind` is the sort of node the mode departs from. Road has none, which is
 * exactly right: a car leaves from wherever you parked it, so it can never
 * be argued for by position, only left as what remains when nothing else
 * fits.
 */
export const MODES = {
  air: { kind: 'airport', ceiling: null, verb: 'flew', noun: 'flight' },
  rail: { kind: 'station', ceiling: 300, verb: 'took the train', noun: 'train' },
  road: { kind: null, ceiling: 110, verb: 'drove', noun: 'drive' },
}

/** On your own feet. Anything faster than this was a vehicle. */
export const ON_FOOT_KMH = 15

/**
 * How near you have to be for the fix to *be* the node, and how far away a
 * node can still be the one that serves you.
 *
 * Airports get the wider bands because they are large and far out of town:
 * Ciampino is fourteen kilometres from the middle of Rome and Fiumicino is
 * twenty-four, and both of them serve it. Stations get narrow ones because
 * they are in the middle of the place they are named after, so a fix ten
 * kilometres from a station is somebody's hotel, not the station.
 */
export const BANDS = {
  airport: { at: 3, serves: 60 },
  station: { at: 0.8, serves: 15 },
}

/**
 * Terminals, but only the ones a phone can actually tell apart.
 *
 * The point of this is the difference between Terminal 5 and Terminal 3 —
 * which airline, which alliance, which of two flights an hour apart. It is
 * the single most useful thing a geotag knows that nothing else does.
 *
 * The rule for adding one: **only if the terminals are further apart than a
 * phone is wrong by under a terminal roof.** Fiumicino's T1 and T3 are two
 * hundred metres apart, so they are not here — naming one of them would be
 * a coin toss wearing a fact's clothing. Heathrow's T3 and T5 are three and
 * a half kilometres apart and the answer is never in doubt.
 */
export const PARTS = {
  LHR: {
    'Terminal 2': [51.4697, -0.4498],
    'Terminal 3': [51.4713, -0.4584],
    'Terminal 4': [51.459, -0.4462],
    'Terminal 5': [51.472, -0.4885],
  },
  JFK: {
    'Terminal 1': [40.644, -73.7893],
    'Terminal 4': [40.6448, -73.7823],
    'Terminal 5': [40.6459, -73.7763],
    'Terminal 7': [40.6483, -73.7825],
    'Terminal 8': [40.647, -73.7877],
  },
  CDG: {
    'Terminal 1': [49.01, 2.561],
    'Terminal 2': [49.0043, 2.5711],
    'Terminal 3': [49.0122, 2.5581],
  },
  SIN: {
    'Terminal 1': [1.3592, 103.9871],
    'Terminal 2': [1.3563, 103.9903],
    'Terminal 3': [1.3554, 103.9856],
    'Terminal 4': [1.34, 103.98],
  },
  HKG: {
    'Terminal 1': [22.316, 113.936],
    'Terminal 2': [22.32, 113.933],
  },
  DXB: {
    'Terminal 1': [25.2483, 55.356],
    'Terminal 2': [25.26, 55.366],
    'Terminal 3': [25.2497, 55.3646],
  },
  SYD: {
    'Terminal 1': [-33.935, 151.165],
    'Terminal 2': [-33.933, 151.181],
    'Terminal 3': [-33.934, 151.183],
  },
}

/**
 * Railway stations, as a starting set rather than a gazetteer.
 *
 * There is no free equivalent of the IATA list for railways, so this is
 * hand-built and will stay incomplete for a long time. That is survivable
 * because of how it is used: a station that is missing makes a rail journey
 * *unresolvable*, never *wrong*. The deduction says "somewhere in this
 * city" rather than naming the wrong platform.
 *
 * What is here: the high-speed spine of Europe, Japan, China, Korea and
 * Taiwan; the British intercity termini; and the handful of others this
 * archive actually touches. Codes are made up, because station codes are
 * not standardised the way airport codes are — they exist to be a stable
 * key, not to be shown to anybody. The name is what gets shown.
 */
export const STATIONS = {
  // Britain
  LON_STP: { name: 'London St Pancras International', city: 'London', at: [51.532, -0.1264] },
  LON_KGX: { name: "London King's Cross", city: 'London', at: [51.5308, -0.1238] },
  LON_EUS: { name: 'London Euston', city: 'London', at: [51.5282, -0.1337] },
  LON_PAD: { name: 'London Paddington', city: 'London', at: [51.5154, -0.1755] },
  LON_WAT: { name: 'London Waterloo', city: 'London', at: [51.5031, -0.1132] },
  LON_LST: { name: 'London Liverpool Street', city: 'London', at: [51.5178, -0.0823] },
  EDI_WAV: { name: 'Edinburgh Waverley', city: 'Edinburgh', at: [55.9522, -3.19] },
  GLA_CEN: { name: 'Glasgow Central', city: 'Glasgow', at: [55.8586, -4.2576] },
  MAN_PIC: { name: 'Manchester Piccadilly', city: 'Manchester', at: [53.4774, -2.2309] },
  BHM_NST: { name: 'Birmingham New Street', city: 'Birmingham', at: [52.4778, -1.8983] },
  LDS_LDS: { name: 'Leeds', city: 'Leeds', at: [53.7955, -1.5491] },
  YRK_YRK: { name: 'York', city: 'York', at: [53.958, -1.093] },
  BRS_TMD: { name: 'Bristol Temple Meads', city: 'Bristol', at: [51.4492, -2.5813] },

  // France, the Low Countries, Germany, the Alps
  PAR_NOR: { name: 'Paris Gare du Nord', city: 'Paris', at: [48.8809, 2.3553] },
  PAR_LYO: { name: 'Paris Gare de Lyon', city: 'Paris', at: [48.8443, 2.3736] },
  PAR_EST: { name: "Paris Gare de l'Est", city: 'Paris', at: [48.8768, 2.359] },
  LIL_EUR: { name: 'Lille Europe', city: 'Lille', at: [50.639, 3.0757] },
  LYO_PDU: { name: 'Lyon Part-Dieu', city: 'Lyon', at: [45.7605, 4.8592] },
  MRS_STC: { name: 'Marseille Saint-Charles', city: 'Marseille', at: [43.3025, 5.3806] },
  BOD_STJ: { name: 'Bordeaux Saint-Jean', city: 'Bordeaux', at: [44.8259, -0.5563] },
  BRU_MID: { name: 'Brussels-Midi', city: 'Brussels', at: [50.8358, 4.3357] },
  ANR_CEN: { name: 'Antwerpen-Centraal', city: 'Antwerp', at: [51.2172, 4.4211] },
  AMS_CEN: { name: 'Amsterdam Centraal', city: 'Amsterdam', at: [52.3789, 4.9003] },
  RTM_CEN: { name: 'Rotterdam Centraal', city: 'Rotterdam', at: [51.925, 4.4691] },
  BER_HBF: { name: 'Berlin Hauptbahnhof', city: 'Berlin', at: [52.525, 13.3694] },
  CGN_HBF: { name: 'Köln Hauptbahnhof', city: 'Cologne', at: [50.943, 6.9587] },
  FRA_HBF: { name: 'Frankfurt Hauptbahnhof', city: 'Frankfurt', at: [50.1071, 8.6638] },
  MUC_HBF: { name: 'München Hauptbahnhof', city: 'Munich', at: [48.1402, 11.5583] },
  HAM_HBF: { name: 'Hamburg Hauptbahnhof', city: 'Hamburg', at: [53.5528, 10.0067] },
  ZRH_HBF: { name: 'Zürich Hauptbahnhof', city: 'Zurich', at: [47.3779, 8.5403] },
  VIE_HBF: { name: 'Wien Hauptbahnhof', city: 'Vienna', at: [48.1852, 16.3765] },

  // Italy and Iberia
  ROM_TER: { name: 'Roma Termini', city: 'Rome', at: [41.901, 12.5015] },
  MIL_CEN: { name: 'Milano Centrale', city: 'Milan', at: [45.4863, 9.2044] },
  FLR_SMN: { name: 'Firenze Santa Maria Novella', city: 'Florence', at: [43.7765, 11.248] },
  NAP_CEN: { name: 'Napoli Centrale', city: 'Naples', at: [40.8523, 14.2725] },
  VCE_SLU: { name: 'Venezia Santa Lucia', city: 'Venice', at: [45.4412, 12.3208] },
  BLQ_CEN: { name: 'Bologna Centrale', city: 'Bologna', at: [44.5058, 11.3432] },
  MAD_ATO: { name: 'Madrid Atocha', city: 'Madrid', at: [40.4067, -3.6896] },
  BCN_SAN: { name: 'Barcelona Sants', city: 'Barcelona', at: [41.3792, 2.14] },
  SVQ_SJU: { name: 'Sevilla Santa Justa', city: 'Seville', at: [37.3919, -5.9754] },
  LIS_ORI: { name: 'Lisboa Oriente', city: 'Lisbon', at: [38.7677, -9.0993] },

  // China and Hong Kong
  SHA_HQI: { name: 'Shanghai Hongqiao Railway Station', city: 'Shanghai', at: [31.1946, 121.3196] },
  SHA_STA: { name: 'Shanghai Railway Station', city: 'Shanghai', at: [31.2497, 121.455] },
  BJS_SOU: { name: 'Beijing South', city: 'Beijing', at: [39.8653, 116.3786] },
  BJS_WES: { name: 'Beijing West', city: 'Beijing', at: [39.8949, 116.322] },
  BJS_STA: { name: 'Beijing', city: 'Beijing', at: [39.9027, 116.427] },
  BJS_CHA: { name: 'Beijing Chaoyang', city: 'Beijing', at: [39.937, 116.474] },
  CAN_SOU: { name: 'Guangzhou South', city: 'Guangzhou', at: [22.9891, 113.2687] },
  CAN_STA: { name: 'Guangzhou', city: 'Guangzhou', at: [23.1497, 113.2586] },
  SZX_NOR: { name: 'Shenzhen North', city: 'Shenzhen', at: [22.6103, 114.0294] },
  HGH_EAS: { name: 'Hangzhou East', city: 'Hangzhou', at: [30.2905, 120.2129] },
  NKG_SOU: { name: 'Nanjing South', city: 'Nanjing', at: [31.9689, 118.7969] },
  SIA_NOR: { name: "Xi'an North", city: "Xi'an", at: [34.3766, 108.937] },
  HKG_WKL: { name: 'Hong Kong West Kowloon', city: 'Hong Kong', at: [22.304, 114.166] },
  HKG_HUH: { name: 'Hung Hom', city: 'Hong Kong', at: [22.303, 114.1815] },

  // Japan, Korea, Taiwan
  TYO_TYO: { name: 'Tokyo', city: 'Tokyo', at: [35.6812, 139.7671] },
  TYO_SGW: { name: 'Shinagawa', city: 'Tokyo', at: [35.6284, 139.7387] },
  YOK_SNY: { name: 'Shin-Yokohama', city: 'Yokohama', at: [35.5077, 139.617] },
  NGO_NGO: { name: 'Nagoya', city: 'Nagoya', at: [35.1709, 136.8815] },
  KYO_KYO: { name: 'Kyoto', city: 'Kyoto', at: [34.9858, 135.7588] },
  OSA_SOS: { name: 'Shin-Osaka', city: 'Osaka', at: [34.7332, 135.5003] },
  OSA_OSA: { name: 'Osaka', city: 'Osaka', at: [34.7024, 135.4959] },
  KOB_SKO: { name: 'Shin-Kobe', city: 'Kobe', at: [34.7107, 135.1968] },
  HIJ_HIJ: { name: 'Hiroshima', city: 'Hiroshima', at: [34.3977, 132.4756] },
  FUK_HKT: { name: 'Hakata', city: 'Fukuoka', at: [33.5897, 130.4207] },
  SDJ_SDJ: { name: 'Sendai', city: 'Sendai', at: [38.2601, 140.8825] },
  KAN_KAN: { name: 'Kanazawa', city: 'Kanazawa', at: [36.578, 136.648] },
  SEL_SEO: { name: 'Seoul', city: 'Seoul', at: [37.5559, 126.9723] },
  SEL_GWM: { name: 'Gwangmyeong', city: 'Seoul', at: [37.4164, 126.8845] },
  PUS_BUS: { name: 'Busan', city: 'Busan', at: [35.115, 129.0417] },
  TPE_MAI: { name: 'Taipei Main', city: 'Taipei', at: [25.0478, 121.517] },
  TPE_THS: { name: 'Taoyuan HSR', city: 'Taoyuan', at: [25.013, 121.215] },
  KHH_ZUO: { name: 'Zuoying', city: 'Kaohsiung', at: [22.687, 120.308] },

  // South-east Asia, South Asia
  KUL_SEN: { name: 'KL Sentral', city: 'Kuala Lumpur', at: [3.1339, 101.6869] },
  JHB_SEN: { name: 'JB Sentral', city: 'Johor Bahru', at: [1.4632, 103.7644] },
  PEN_BWH: { name: 'Butterworth', city: 'Penang', at: [5.3936, 100.364] },
  BKK_KTA: { name: 'Krung Thep Aphiwat', city: 'Bangkok', at: [13.821, 100.54] },
  BKK_HUA: { name: 'Hua Lamphong', city: 'Bangkok', at: [13.7378, 100.517] },
  HAN_HAN: { name: 'Hanoi', city: 'Hanoi', at: [21.0245, 105.8412] },
  SGN_SGN: { name: 'Saigon', city: 'Ho Chi Minh City', at: [10.7823, 106.6774] },
  DEL_NDL: { name: 'New Delhi', city: 'Delhi', at: [28.642, 77.219] },
  BOM_CST: { name: 'Mumbai CSMT', city: 'Mumbai', at: [18.94, 72.8353] },

  // North America, Australasia
  NYC_PEN: { name: 'New York Penn Station', city: 'New York', at: [40.7506, -73.9935] },
  WAS_UNI: { name: 'Washington Union Station', city: 'Washington', at: [38.8977, -77.0065] },
  BOS_SOU: { name: 'Boston South Station', city: 'Boston', at: [42.3519, -71.0552] },
  PHL_30S: { name: 'Philadelphia 30th Street', city: 'Philadelphia', at: [39.9556, -75.1819] },
  CHI_UNI: { name: 'Chicago Union Station', city: 'Chicago', at: [41.8789, -87.6397] },
  MEL_SXS: { name: 'Southern Cross', city: 'Melbourne', at: [-37.8183, 144.9525] },
  SYD_CEN: { name: 'Sydney Central', city: 'Sydney', at: [-33.8832, 151.2069] },
  BNE_ROM: { name: 'Roma Street', city: 'Brisbane', at: [-27.465, 153.0186] },
  WLG_WLG: { name: 'Wellington', city: 'Wellington', at: [-41.279, 174.78] },
  AKL_BRI: { name: 'Britomart', city: 'Auckland', at: [-36.8443, 174.769] },
}

/** Every node, both kinds, in one list — which is the whole point of the file. */
export function allNodes() {
  const out = []
  for (const [code, at] of Object.entries(AIRPORT_COORDS)) {
    out.push({
      code,
      kind: 'airport',
      name: `${AIRPORT_CITY[code] ?? code} (${code})`,
      city: AIRPORT_CITY[code] ?? null,
      at,
      parts: PARTS[code] ?? null,
    })
  }
  for (const [code, s] of Object.entries(STATIONS)) {
    out.push({ code, kind: 'station', name: s.name, city: s.city, at: s.at, parts: null })
  }
  return out
}

const NODES = allNodes()

/** Kilometres between two [lat, lon] points. Haversine, unrounded — the
 *  rounding in geo.js loses the difference between a terminal and a taxiway. */
export function kmApart(a, b) {
  if (!a || !b) return Infinity
  const rad = (d) => (d * Math.PI) / 180
  const dLat = rad(b[0] - a[0])
  const dLon = rad(b[1] - a[1])
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(h))
}

/**
 * Nodes near a point, nearest first.
 *
 * `within` defaults to the widest band any kind uses, so a caller who does
 * not care gets everything that could conceivably serve the place.
 */
export function nodesNear([lat, lon], { kind = null, within = BANDS.airport.serves } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return []
  return NODES.filter((n) => !kind || n.kind === kind)
    .map((n) => ({ ...n, km: kmApart([lat, lon], n.at) }))
    .filter((n) => n.km <= within)
    .sort((a, b) => a.km - b.km)
}

/**
 * How much nearer one thing has to be than the next before naming it is a
 * fact rather than a guess.
 *
 * Two and a half is chosen so that Heathrow's Terminal 2 and Terminal 3 —
 * six hundred metres apart, the closest pair in PARTS — return nothing
 * rather than a coin toss, while Terminal 5 against Terminal 3, ten times
 * clearer, returns Terminal 5.
 */
export const CLEARLY_NEARER = 2.5

/**
 * Which part of the node somebody was standing in, or null.
 *
 * Null is a real answer and the common one. Saying "Terminal 3" when the
 * evidence supports "Heathrow" is worse than saying "Heathrow", because
 * the whole value of the terminal is that it narrows which flight it was —
 * and a wrong narrowing is worse than none.
 */
export function partAt(node, [lat, lon]) {
  if (!node?.parts) return null
  const ranked = Object.entries(node.parts)
    .map(([name, at]) => ({ name, km: kmApart([lat, lon], at) }))
    .sort((a, b) => a.km - b.km)
  if (!ranked.length) return null
  const [best, next] = ranked
  if (next && best.km * CLEARLY_NEARER > next.km) return null
  return best
}

/** `at`, `near` or `far`, for a node of a given kind at a given distance. */
export function bandFor(kind, km) {
  const band = BANDS[kind]
  if (!band || !Number.isFinite(km)) return 'far'
  if (km <= band.at) return 'at'
  if (km <= band.serves) return 'near'
  return 'far'
}

/** A leg in words, for a list or a card. Mode-agnostic on purpose. */
export function describeLeg(leg) {
  const where = (end) =>
    end?.node ? (end.part ? `${end.node.name}, ${end.part.name}` : end.node.name) : 'somewhere'
  return `${MODES[leg.mode]?.noun ?? 'leg'} — ${where(leg.from)} to ${where(leg.to)}`
}
