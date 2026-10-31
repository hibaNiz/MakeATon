import bcrypt from 'bcryptjs';
import { pool, transaction } from '../src/lib/db.js';

// Adds a small catalog demo. Existing records and passwords are never overwritten.
try {
  await transaction(async db => {
    await db.query('SELECT pg_advisory_xact_lock(6210402)');
    for (const [name, email, password, role] of [
      ['Demo Staff', 'staff@brightloop.com', 'Staff@1234', 'STAFF'],
      ['Demo Customer', 'customer@brightloop.com', 'Customer@1234', 'CUSTOMER'],
    ]) await db.query('INSERT INTO users (name,email,password_hash,role) VALUES ($1,$2,$3,$4) ON CONFLICT (email) DO NOTHING', [name, email, await bcrypt.hash(password, 10), role]);
    async function ensure(table, name, columns, values) {
      const existing = await db.query(`SELECT id FROM ${table} WHERE name=$1 ORDER BY id LIMIT 1`, [name]);
      if (existing.rowCount) return { id: existing.rows[0].id, created: false };
      const result = await db.query(`INSERT INTO ${table} (name,${columns}) VALUES ($1,${values.map((_, i) => '$' + (i + 2)).join(',')}) RETURNING id`, [name, ...values]);
      return { id: result.rows[0].id, created: true };
    }
    const gst = await ensure('taxes', 'GST 18%', 'rate', [18]);
    await ensure('taxes', 'Zero rated', 'rate', [0]);
    const software = await ensure('products', 'Business Suite', 'type,sales_price,cost_price,tax_id,notes', ['SOFTWARE', 1200, 450, gst.id, 'Business tools for a growing team. Choose a brand variant.']);
    if (software.created) await db.query("INSERT INTO product_variants (product_id,attribute,value,extra_price) VALUES ($1,'Brand','Odoo',560),($1,'Support','Priority',300)", [software.id]);
    await ensure('products', 'Onboarding Workshop', 'type,sales_price,cost_price,tax_id,notes', ['SERVICE', 2500, 900, gst.id, 'A guided setup session for your team.']);
    await ensure('products', 'Extra Storage', 'type,sales_price,cost_price,tax_id,notes', ['ADDON', 199, 60, gst.id, 'Additional storage per billing period.']);
    await ensure('plans', 'Starter Monthly', 'price,billing_period,min_quantity,pausable,renewable', [299, 'MONTHLY', 1, true, true]);
    await ensure('plans', 'Team Annual', 'price,billing_period,min_quantity,pausable,renewable', [2999, 'YEARLY', 10, false, true]);
    const volume = await ensure('discounts', 'Team 10%', 'type,value,scope,min_quantity,min_purchase,usage_limit', ['PERCENTAGE', 10, 'PRODUCT', 10, 10000, 100]);
    if (volume.created) await db.query('INSERT INTO discount_products (discount_id,product_id) VALUES ($1,$2)', [volume.id, software.id]);
    await ensure('discounts', 'Welcome 500', 'type,value,scope,min_purchase,usage_limit', ['FIXED', 500, 'SUBSCRIPTION', 2500, 50]);
  });
  console.log('Catalog demo ready: 3 products, 2 plans, 2 taxes and 2 discounts (existing names preserved).');
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await pool.end(); }
