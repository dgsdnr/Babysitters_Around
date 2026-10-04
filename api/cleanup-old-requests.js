export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ ok: false });
  }

  const supabaseUrl = process.env.SUPABASE_URL || 'https://ponyiyijmamsecgrzmsa.supabase.co';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const RETENTION_DAYS = 180;
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const closedStatuses = ['cancelled', 'completed', 'not_happened', 'reported_other'];
  const statusFilter = closedStatuses.map(s => `status.eq.${s}`).join(',');

  const url = `${supabaseUrl}/rest/v1/requests?date=lt.${cutoff}&or=(${statusFilter})`;

  const delRes = await fetch(url, {
    method: 'DELETE',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Prefer: 'return=representation'
    }
  });

  const deleted = await delRes.json();
  return res.status(200).json({ ok: true, deletedCount: Array.isArray(deleted) ? deleted.length : 0 });
}
