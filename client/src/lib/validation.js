// Client-side checks (the server checks again — never trust only the browser).
export const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export function passwordProblems(p) {
  const problems = [];
  if (p.length <= 8) problems.push('more than 8 characters');
  if (!/[A-Z]/.test(p)) problems.push('an uppercase letter');
  if (!/[a-z]/.test(p)) problems.push('a lowercase letter');
  if (!/[^A-Za-z0-9]/.test(p)) problems.push('a special character');
  return problems;
}

// Runs a map of { field: (value, allValues) => errorMessage | undefined }
export function check(values, rules) {
  const errors = {};
  for (const [field, rule] of Object.entries(rules)) {
    const msg = rule(values[field], values);
    if (msg) errors[field] = msg;
  }
  return errors;
}

export const required = (label) => (v) => (v === '' || v === null || v === undefined ? `${label} is required` : undefined);
export const positiveNumber = (label, { allowZero = true } = {}) => (v) => {
  if (v === '' || v === null || v === undefined) return `${label} is required`;
  const n = Number(v);
  if (Number.isNaN(n)) return `${label} must be a number`;
  if (n < 0 || (!allowZero && n === 0)) return `${label} must be ${allowZero ? '0 or more' : 'more than 0'}`;
  return undefined;
};
