function verifyWebhookToken(req, res, next) {
  const token = req.headers['x-webhook-token'] || req.query.token;
  const expectedToken = process.env.WEBHOOK_SECRET;

  if (expectedToken && token !== expectedToken) {
    return res.status(401).json({ code: 401, message: 'Unauthorized' });
  }

  next();
}

module.exports = { verifyWebhookToken };
