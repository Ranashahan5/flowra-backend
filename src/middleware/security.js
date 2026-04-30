const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const validator = require('validator');
const helmetMiddleware = helmet({ contentSecurityPolicy: false });
const authLimiter = rateLimit({ windowMs: 15*60*1000, max: 10, message: { error: 'Too many attempts.' } });
const apiLimiter = rateLimit({ windowMs: 60*1000, max: 100, message: { error: 'Too many requests.' }, keyGenerator: (req) => req.user?.id || req.ip });
const runLimiter = rateLimit({ windowMs: 60*1000, max: 10, message: { error: 'Too many runs.' }, keyGenerator: (req) => req.user?.id || req.ip });
const ALLOWED_STEP_TYPES = ['click','type','fill','select','navigate','waitForElement','wait','keyPress','scroll','screenshot'];
const ALLOWED_KEYS = ['Enter','Tab','Escape','Backspace','Delete','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];
function sanitizeSteps(steps) {
  if (!Array.isArray(steps)) throw new Error('Steps must be an array');
  if (steps.length > 200) throw new Error('Too many steps');
  return steps.map((step, i) => {
    if (!ALLOWED_STEP_TYPES.includes(step.type)) throw new Error('Unknown step type: ' + step.type);
    const clean = { type: step.type };
    if (step.selector !== undefined) { if (/<script|javascript:|on\w+=/i.test(step.selector)) throw new Error('Invalid selector'); clean.selector = step.selector.trim().substring(0,500); }
    if (step.value !== undefined) clean.value = String(step.value).substring(0,5000);
    if (step.url !== undefined) { if (!validator.isURL(step.url, { protocols:['http','https'], require_protocol:true })) throw new Error('Invalid URL'); clean.url = step.url; }
    if (step.key !== undefined) { if (!ALLOWED_KEYS.includes(step.key)) throw new Error('Key not allowed'); clean.key = step.key; }
    return clean;
  });
}
function validateStartUrl(url) {
  if (!validator.isURL(url, { protocols:['http','https'], require_protocol:true })) throw new Error('Invalid URL');
  if (/localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\./i.test(url)) throw new Error('Internal URLs not allowed');
  return url.trim();
}
function validateEmail(email) {
  if (!validator.isEmail(email)) throw new Error('Invalid email');
  return validator.normalizeEmail(email);
}
module.exports = { helmetMiddleware, authLimiter, apiLimiter, runLimiter, sanitizeSteps, validateStartUrl, validateEmail };