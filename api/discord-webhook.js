const Stripe = require("stripe");

module.exports.config = {
  api: {
    bodyParser: false,
  },
};

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function discordMessage(event) {
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const amount = session.amount_total ? (session.amount_total / 100).toFixed(2) : "?";
    const currency = (session.currency || "usd").toUpperCase();
    return `New sale: $${amount} ${currency} (${session.customer_details?.email || "no email"})`;
  }
  if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object;
    const amount = intent.amount ? (intent.amount / 100).toFixed(2) : "?";
    const currency = (intent.currency || "usd").toUpperCase();
    return `Payment succeeded: $${amount} ${currency}`;
  }
  return null;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");
  const rawBody = await readRawBody(req);
  const signature = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    res.status(400).json({ error: "invalid signature" });
    return;
  }

  const content = discordMessage(event);
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

  if (content && webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      });
    } catch (err) {
      // Discord post failing should not fail the Stripe webhook ack.
    }
  }

  res.status(200).json({ received: true });
};
