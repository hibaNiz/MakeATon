import { query, transaction } from '../../lib/db.js';
import { HttpError } from '../../lib/errors.js';

// SQL identifiers come only from this module's fixed configuration.
const columns = {
  taxes: ['name', 'rate', 'active'],
  products: ['name', 'type', 'sales_price', 'cost_price', 'notes', 'tax_id', 'active'],
  plans: ['name', 'price', 'billing_period', 'min_quantity', 'start_date', 'end_date', 'auto_close', 'closable', 'pausable', 'renewable', 'active'],
  discounts: ['name', 'type', 'value', 'scope', 'min_purchase', 'min_quantity', 'start_date', 'end_date', 'usage_limit', 'active'],
};
const select = kind => kind === 'products' ? `SELECT r.*, t.name AS tax_name, t.rate AS tax_rate,
  COALESCE((SELECT json_agg(v ORDER BY v.id) FROM product_variants v WHERE v.product_id=r.id), '[]') AS variants
  FROM products r LEFT JOIN taxes t ON t.id=r.tax_id`
  : kind === 'discounts' ? `SELECT r.*, ARRAY(SELECT product_id FROM discount_products WHERE discount_id=r.id ORDER BY product_id) AS product_ids FROM discounts r`
  : `SELECT r.* FROM ${kind} r`;

export async function getRecord(kind, id, db = { query }) {
  const { rows } = await db.query(`${select(kind)} WHERE r.id=$1`, [id]);
  if (!rows.length) throw new HttpError(404, 'Record not found');
  return rows[0];
}

export async function listRecords(kind, { search, active, page, pageSize }) {
  const params = [], where = [];
  if (search) {
    // Treat search as literal text, including % and _.
    params.push('%' + search.replace(/[\\%_]/g, '\\$&') + '%');
    where.push(`r.name ILIKE $${params.length}`);
  }
  if (active !== undefined) { params.push(active === 'true'); where.push(`r.active=$${params.length}`); }
  const filter = where.length ? ' WHERE ' + where.join(' AND ') : '';
  const count = await query(`SELECT count(*)::int AS total FROM ${kind} r${filter}`, params);
  const { rows } = await query(`${select(kind)}${filter} ORDER BY lower(r.name), r.id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, pageSize, (page - 1) * pageSize]);
  return { items: rows, total: count.rows[0].total, page, pageSize };
}

export async function saveRecord(kind, data, id = null) {
  return transaction(async db => {
    if (id) {
      const locked = await db.query(`SELECT id FROM ${kind} WHERE id=$1 FOR UPDATE`, [id]);
      if (!locked.rowCount) throw new HttpError(404, 'Record not found');
    }
    if (kind === 'products' && data.tax_id) {
      const tax = await db.query('SELECT id FROM taxes WHERE id=$1 FOR KEY SHARE', [data.tax_id]);
      if (!tax.rowCount) throw new HttpError(400, 'Choose an existing tax', { tax_id: 'Tax not found' });
    }
    if (kind === 'discounts' && data.product_ids.length) {
      const products = await db.query('SELECT id FROM products WHERE id=ANY($1::int[]) FOR KEY SHARE', [data.product_ids]);
      if (products.rowCount !== data.product_ids.length) throw new HttpError(400, 'Choose existing products', { product_ids: 'One or more products no longer exist' });
    }
    const keys = columns[kind], values = keys.map(key => data[key]);
    if (id) {
      await db.query(`UPDATE ${kind} SET ${keys.map((key, i) => `${key}=$${i + 1}`).join(',')} WHERE id=$${keys.length + 1}`, [...values, id]);
    } else {
      const result = await db.query(`INSERT INTO ${kind} (${keys.join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')}) RETURNING id`, values);
      id = result.rows[0].id;
    }
    if (kind === 'products') {
      const existing = await db.query('SELECT id FROM product_variants WHERE product_id=$1', [id]);
      const owned = new Set(existing.rows.map(row => row.id));
      for (const [index, v] of data.variants.entries()) {
        if (v.id && !owned.has(v.id)) throw new HttpError(400, 'Variant belongs to another product or no longer exists', { [`variants.${index}.id`]: 'Invalid variant ID' });
      }
      // Keep IDs used by subscription/template lines; the FK rejects removing an in-use variant.
      await db.query('DELETE FROM product_variants WHERE product_id=$1 AND NOT (id=ANY($2::int[]))', [id, data.variants.filter(v => v.id).map(v => v.id)]);
      for (const v of data.variants) {
        if (v.id) await db.query('UPDATE product_variants SET attribute=$1,value=$2,extra_price=$3 WHERE id=$4 AND product_id=$5', [v.attribute, v.value, v.extra_price, v.id, id]);
        else await db.query('INSERT INTO product_variants (product_id,attribute,value,extra_price) VALUES ($1,$2,$3,$4)', [id, v.attribute, v.value, v.extra_price]);
      }
    }
    if (kind === 'discounts') {
      await db.query('DELETE FROM discount_products WHERE discount_id=$1', [id]);
      if (data.product_ids.length) await db.query('INSERT INTO discount_products (discount_id,product_id) SELECT $1,unnest($2::int[])', [id, data.product_ids]);
    }
    return getRecord(kind, id, db);
  });
}

export async function deleteRecord(kind, id) {
  return transaction(async db => {
    const record = await db.query(`SELECT * FROM ${kind} WHERE id=$1 FOR UPDATE`, [id]);
    if (!record.rowCount) throw new HttpError(404, 'Record not found');
    if (kind === 'products') {
      const links = await db.query('SELECT 1 FROM discount_products WHERE product_id=$1 LIMIT 1', [id]);
      if (links.rowCount) throw new HttpError(409, 'This product is used by a discount. Archive it or remove the discount link first.');
    }
    if (kind === 'discounts' && record.rows[0].used_count > 0)
      throw new HttpError(409, 'This discount has been used. Archive it to preserve its history.');
    await db.query(`DELETE FROM ${kind} WHERE id=$1`, [id]);
  });
}

export async function setActive(kind, id, active) {
  const result = await query(`UPDATE ${kind} SET active=$1 WHERE id=$2 RETURNING id`, [active, id]);
  if (!result.rowCount) throw new HttpError(404, 'Record not found');
  return getRecord(kind, id);
}
