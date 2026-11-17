export const FT = 0.3048;

export const UNIT_LABEL = { m: 'm', ft: 'ft' };

export function toDisplay(m, units) {
  return units === 'ft' ? m / FT : m;
}

export function fromDisplay(v, units) {
  return units === 'ft' ? v * FT : v;
}

/** Value for a number field, rounded to 2 decimals in the active unit. */
export function fieldValue(m, units) {
  return String(Math.round(toDisplay(m, units) * 100) / 100);
}

export function fieldStep(units) {
  return units === 'ft' ? 0.25 : 0.05;
}

export function fmtLen(m, units) {
  return `${toDisplay(m, units).toFixed(2)} ${UNIT_LABEL[units]}`;
}

/** Mattress sizes read better in cm or inches than in m or ft. */
export function fmtMattress(w, l, units) {
  if (units === 'ft') return `${Math.round(w / 0.0254)} × ${Math.round(l / 0.0254)} in`;
  return `${Math.round(w * 100)} × ${Math.round(l * 100)} cm`;
}
