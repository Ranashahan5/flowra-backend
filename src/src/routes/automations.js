const express = require('express');
const { query } = require('../../db/connection');
const { authenticate } = require('../../middleware/auth');
const { runAutomation } = require('../automation/player');
const { sanitizeSteps, validateStartUrl, runLimiter } = require('../../middleware/security');
const router = express.Router();
router.use(authenticate);
router.get('/', async (req, res) => {
  try { const result = await query('SELECT id, name, description, start_url, trigger_type, trigger_config, is_active, last_run_at, created_at, jsonb_array_length(steps) as step_count FROM automations WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]); res.json(result.rows); }
  catch(err) { res.status(500).json({ error: 'Could not fetch automations' }); }
});
router.get('/:id', async (req, res) => {
  try { const result = await query('SELECT * FROM automations WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]); if (!result.rows.length) return res.status(404).json({ error: 'Not found' }); res.json(result.rows[0]); }
  catch(err) { res.status(500).json({ error: 'Could not fetch automation' }); }
});
router.post('/', async (req, res) => {
  const { name, description, start_url, steps, trigger_type, trigger_config } = req.body;
  if (!name || !start_url || !steps) return res.status(400).json({ error: 'name, start_url, and steps required' });
  try { validateStartUrl(start_url); sanitizeSteps(steps); } catch(err) { return res.status(400).json({ error: err.message }); }
  try {
    const countResult = await query('SELECT COUNT(*) FROM automations WHERE user_id = $1', [req.user.id]);
    const limitResult = await query('SELECT max_automations FROM plan_limits WHERE plan = $1', [req.user.plan]);
    const max = limitResult.rows[0]?.max_automations ?? 3;
    if (max !== -1 && parseInt(countResult.rows[0].count) >= max) return res.status(403).json({ error: 'Plan limit reached' });
    const result = await query('INSERT INTO automations (user_id, name, description, start_url, steps, trigger_type, trigger_config) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *', [req.user.id, name, description||'', start_url, JSON.stringify(steps), trigger_type||'manual', JSON.stringify(trigger_config||{})]);
    res.status(201).json(result.rows[0]);
  } catch(err) { res.status(500).json({ error: 'Could not create automation' }); }
});
router.patch('/:id', async (req, res) => {
  const { name, description, start_url, steps, trigger_type, trigger_config, is_active } = req.body;
  try { const result = await query('UPDATE automations SET name=COALESCE($1,name), description=COALESCE($2,description), start_url=COALESCE($3,start_url), steps=COALESCE($4,steps), trigger_type=COALESCE($5,trigger_type), trigger_config=COALESCE($6,trigger_config), is_active=COALESCE($7,is_active), updated_at=NOW() WHERE id=$8 AND user_id=$9 RETURNING *', [name, description, start_url, steps?JSON.stringify(steps):null, trigger_type, trigger_config?JSON.stringify(trigger_config):null, is_active, req.params.id, req.user.id]); if (!result.rows.length) return res.status(404).json({ error: 'Not found' }); res.json(result.rows[0]); }
  catch(err) { res.status(500).json({ error: 'Could not update' }); }
});
router.delete('/:id', async (req, res) => {
  try { const result = await query('DELETE FROM automations WHERE id=$1 AND user_id=$2 RETURNING id', [req.params.id, req.user.id]); if (!result.rows.length) return res.status(404).json({ error: 'Not found' }); res.json({ message: 'Deleted' }); }
  catch(err) { res.status(500).json({ error: 'Could not delete' }); }
});
router.post('/:id/run', runLimiter, async (req, res) => {
  try { const result = await query('SELECT * FROM automations WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]); if (!result.rows.length) return res.status(404).json({ error: 'Not found' }); runAutomation(result.rows[0]).catch(console.error); res.json({ message: 'Automation started' }); }
  catch(err) { res.status(500).json({ error: 'Could not start' }); }
});
module.exports = router;
