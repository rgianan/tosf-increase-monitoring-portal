export const REGION_META = [
  { code: '1', shortName: 'Region I', label: 'Region I - Ilocos Region', rir: 4.3, privateHeiCount: 82 },
  { code: '2', shortName: 'Region II', label: 'Region II - Cagayan Valley', rir: 0.2, privateHeiCount: 45 },
  { code: '3', shortName: 'Region III', label: 'Region III - Central Luzon', rir: 1.6, privateHeiCount: 181 },
  { code: '4', shortName: 'Region IV-A', label: 'Region IV-A - CALABARZON', rir: 2.6, privateHeiCount: 288 },
  { code: '17', shortName: 'MIMAROPA', label: 'MIMAROPA Region', rir: 1.9, privateHeiCount: 40 },
  { code: '5', shortName: 'Region V', label: 'Region V - Bicol Region', rir: 3.4, privateHeiCount: 115 },
  { code: '6', shortName: 'Region VI', label: 'Region VI - Western Visayas', rir: 2.4, privateHeiCount: 48 },
  { code: '7', shortName: 'Region VII', label: 'Region VII - Central Visayas', rir: 3.5, privateHeiCount: 100 },
  { code: '18', shortName: 'NIR', label: 'Negros Island Region (NIR)', rir: 9.7, privateHeiCount: 88 },
  { code: '8', shortName: 'Region VIII', label: 'Region VIII - Eastern Visayas', rir: 1.2, privateHeiCount: 89 },
  { code: '9', shortName: 'Region IX', label: 'Region IX - Zamboanga Peninsula', rir: 2.5, privateHeiCount: 65 },
  { code: '10', shortName: 'Region X', label: 'Region X - Northern Mindanao', rir: 3.1, privateHeiCount: 61 },
  { code: '11', shortName: 'Region XI', label: 'Region XI - Davao Region', rir: 4.4, privateHeiCount: 84 },
  { code: '12', shortName: 'Region XII', label: 'Region XII - SOCCSKSARGEN', rir: 3.0, privateHeiCount: 82 },
  { code: '13', shortName: 'NCR', label: 'National Capital Region (NCR)', rir: 2.4, privateHeiCount: 284 },
  { code: '14', shortName: 'CAR', label: 'Cordillera Administrative Region (CAR)', rir: 1.2, privateHeiCount: 34 },
  { code: '16', shortName: 'Caraga', label: 'Region XIII - Caraga', rir: 1.8, privateHeiCount: 40 },
]

export const ACTION_STATUS_OPTIONS = [
  'CHEDRO Approved',
  'CHEDRO Denied',
  'HEI agreed to defer implementation',
  'HEI will proceed with AY 2026-2027',
  'Decrease: within RIR',
  'Decrease: from above RIR to within RIR',
  'Application below the RIR is decreased',
  'Under consideration, pending final decision',
  'No response from HEI',
  'Others',
]

export const RIR_CATEGORY_OPTIONS = [
  'Below the applicable RIR',
  'Equivalent to the applicable RIR',
  'Higher than the RIR',
]

export const REQUIRED_ACTION_WITH_SPECIFICS = 'Others'

export const toNumberOrNull = (value) => {
  if (value === '' || value === null || value === undefined) return null
  const num = Number(String(value).replace(/,/g, '').trim())
  return Number.isFinite(num) ? num : null
}

export function getRegionByCode(code) {
  return REGION_META.find((region) => region.code === String(code || '').trim()) || null
}

export function computeRirCategory(tfIncrease, osfIncrease, rir) {
  const tf = toNumberOrNull(tfIncrease)
  const osf = toNumberOrNull(osfIncrease)
  const rate = toNumberOrNull(rir)
  if (rate === null || (tf === null && osf === null)) return ''
  const highest = Math.max(tf ?? -Infinity, osf ?? -Infinity)
  const tolerance = 0.0001
  if (highest > rate + tolerance) return 'Higher than the RIR'
  if (Math.abs(highest - rate) <= tolerance) return 'Equivalent to the applicable RIR'
  return 'Below the applicable RIR'
}

export function normalizeRegionCode(value) {
  return String(value || '').trim().replace(/^0+/, '') || String(value || '').trim()
}
