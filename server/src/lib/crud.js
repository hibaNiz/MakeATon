// Tiny helper to build "UPDATE table SET a=$1, b=$2 WHERE id=$3" from an object.
export function buildUpdate(table, id, fields, columnMap = {}) {
  const keys = Object.keys(fields).filter((k) => fields[k] !== undefined);
  if (!keys.length) return null;
  const sets = keys.map((k, i) => `${columnMap[k] || toSnake(k)} = $${i + 1}`);
  return {
    text: `UPDATE ${table} SET ${sets.join(', ')} WHERE id = $${keys.length + 1} RETURNING *`,
    values: [...keys.map((k) => fields[k]), id],
  };
}

export const toSnake = (s) => s.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
