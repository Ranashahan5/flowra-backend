const { query } = require('../../db/connection');
const { authenticate } = require('../../middleware/auth');
const { authLimiter } = require('../../middleware/security');
const { authLimiter } = require('../middleware/security');
const router = express.Router();
function getStripe() { if (!process.env.STRIPE_SECRET_KEY) throw new Error('Stripe not configured'); return require('stripe')(process.env.STRIPE_SECRET_KEY); }
const PLANS = { starter: { name:'Starter', priceId: process.env.STRIPE_STARTER_PRICE_ID, maxAutomations:10, maxRunsPerDay:10 }, pro: { name:'Pro', priceId: process.env.STRIPE_PRO_PRICE_ID, maxAutomations:-1, maxRunsPerDay:-1 } };
router.get('/status', (req, res) => res.json({ enabled: !!process.env.STRIPE_SECRET_KEY }));
router.post('/create-checkout', authenticate, authLimiter, async (req, res) => {
  const { plan } = req.body;
  if (!PLANS[plan]) return res.status(400).json({ error: 'Invalid plan' });
  if (!PLANS[plan].priceId) return res.status(503).json({ error: 'Billing not configured yet' });
  try {
    const stripe = getStripe();
    const custResult = await query('SELECT stripe_customer_id FROM users WHERE id=$1', [req.user.id]);
    let customerId = custResult.rows[0]?.stripe_customer_id;
    if (!customerId) { const customer = await stripe.customers.create({ email: req.user.email, metadata: { userId: req.user.id } }); await query('UPDATE users SET stripe_customer_id=$1 WHERE id=$2', [customer.id, req.user.id]); customerId = customer.id; }
    const session = await stripe.checkout.sessions.create({ customer: customerId, payment_method_types:['card'], line_items:[{ price: PLANS[plan].priceId, quantity:1 }], mode:'subscription', success_url: process.env.FRONTEND_URL+'/billing/success', cancel_url: process.env.FRONTEND_URL+'/billing/cancelled', metadata:{ userId: req.user.id, plan } });
    res.json({ url: session.url });
  } catch(err) { res.status(500).json({ error: 'Could not create checkout' }); }
});
router.post('/webhook', express.raw({ type:'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  if (!process.env.STRIPE_WEBHOOK_SECRET) return res.status(503).json({ error: 'Webhook not configured' });
  let event;
  try { event = getStripe().webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET); }
  catch(err) { return res.status(400).json({ error: 'Invalid signature' }); }
  try {
    if (event.type === 'checkout.session.completed') { const s = event.data.object; if (s.metadata?.userId && s.metadata?.plan) await query('UPDATE users SET plan=$1, stripe_customer_id=$2, subscription_status=$3 WHERE id=$4', [s.metadata.plan, s.customer, 'active', s.metadata.userId]); }
    if (event.type === 'invoice.payment_failed') await query("UPDATE users SET subscription_status='past_due' WHERE stripe_customer_id=$1", [event.data.object.customer]);
    if (event.type === 'customer.subscription.deleted') await query("UPDATE users SET plan='free', subscription_status='cancelled' WHERE stripe_customer_id=$1", [event.data.object.customer]);
    res.json({ received: true });
  } catch(err) { res.status(500).json({ error: 'Webhook error' }); }
});
module.exports = router;
