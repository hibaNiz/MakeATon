import { query, transaction } from '../../lib/db.js';
import { HttpError } from '../../lib/errors.js';
import { selectedPlan, selectedLines } from './references.js';

export async function getTemplate(id, client = { query }) {
  const { rows: [template] } = await client.query(`SELECT t.*, p.name AS plan_name
    FROM quotation_templates t JOIN plans p ON p.id=t.plan_id WHERE t.id=$1`, [id]);
  if (!template) throw new HttpError(404, 'Quotation template not found');
  const { rows } = await client.query(`SELECT l.*, p.name AS product_name,
    v.attribute AS variant_attribute, v.value AS variant_value
    FROM template_lines l JOIN products p ON p.id=l.product_id
    LEFT JOIN product_variants v ON v.id=l.variant_id WHERE template_id=$1 ORDER BY l.id`, [id]);
  return { ...template, lines: rows };
}

export async function listTemplates({ search, page, pageSize }) {
  const params = ['%' + search.replace(/[\\%_]/g, '\\$&') + '%'];
  const where = 'WHERE t.name ILIKE $1';
  const [list, count] = await Promise.all([
    query(`SELECT t.*, p.name AS plan_name, (SELECT count(*)::int FROM template_lines WHERE template_id=t.id) AS line_count
      FROM quotation_templates t JOIN plans p ON p.id=t.plan_id ${where}
      ORDER BY t.name, t.id LIMIT $2 OFFSET $3`, [...params, pageSize, (page - 1) * pageSize]),
    query(`SELECT count(*)::int AS total FROM quotation_templates t ${where}`, params),
  ]);
  return { items: list.rows, total: count.rows[0].total, page, pageSize };
}

export async function saveTemplate(data, id) {
  return transaction(async client => {
    if (id) {
      const lock = await client.query('SELECT id FROM quotation_templates WHERE id=$1 FOR UPDATE', [id]);
      if (!lock.rowCount) throw new HttpError(404, 'Quotation template not found');
    }
    const plan = await selectedPlan(client, data.plan_id);
    await selectedLines(client, data.lines, plan);
    const values = [data.name, data.plan_id, data.validity_days, data.notes];
    if (id) {
      await client.query('UPDATE quotation_templates SET name=$1,plan_id=$2,validity_days=$3,notes=$4 WHERE id=$5', [...values, id]);
      await client.query('DELETE FROM template_lines WHERE template_id=$1', [id]);
    } else {
      const result = await client.query('INSERT INTO quotation_templates (name,plan_id,validity_days,notes) VALUES ($1,$2,$3,$4) RETURNING id', values);
      id = result.rows[0].id;
    }
    for (const line of data.lines) await client.query(
      'INSERT INTO template_lines (template_id,product_id,variant_id,quantity) VALUES ($1,$2,$3,$4)',
      [id, line.product_id, line.variant_id, line.quantity]);
    return getTemplate(id, client);
  });
}

export async function deleteTemplate(id) {
  const result = await query('DELETE FROM quotation_templates WHERE id=$1 RETURNING id', [id]);
  if (!result.rowCount) throw new HttpError(404, 'Quotation template not found');
}
