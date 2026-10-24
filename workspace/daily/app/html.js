// Tiny escaping template helper. Every render function returns a Raw string, so the
// controller can set innerHTML without double-escaping, and node tests can read it.
class Raw {
  constructor(text) { this.text = text; }
  toString() { return this.text; }
}

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ENTITIES[c]);
export const raw = text => new Raw(String(text ?? ''));

function convert(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return String(value); // aria-pressed="false" must survive
  if (value instanceof Raw) return value.text;
  if (Array.isArray(value)) return value.map(convert).join('');
  return esc(value);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i += 1) out += convert(values[i]) + strings[i + 1];
  return new Raw(out);
}

export const join = (items, sep = '') => raw(items.map(convert).join(sep));
