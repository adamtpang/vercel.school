const { neon } = require("@neondatabase/serverless");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  const email = (body && body.email ? String(body.email) : "").trim().toLowerCase();

  if (!EMAIL_RE.test(email)) {
    res.status(400).json({ error: "invalid email" });
    return;
  }

  try {
    const sql = neon(process.env.DATABASE_URL);
    await sql`
      INSERT INTO fleet_subscribers (email, source)
      VALUES (${email}, 'vercel.school')
      ON CONFLICT (email) DO NOTHING
    `;
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "server error" });
  }
};
