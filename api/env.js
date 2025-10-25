module.exports = async (req, res) => {
  // Build a safe object with only the values we need.
  const env = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
    SUPABASE_URL: process.env.SUPABASE_URL || '',
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || ''
  };

  // Return JavaScript that sets window.__env__ before the app boots.
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, must-revalidate');
  res.statusCode = 200;
  res.end(`window.__env__ = ${JSON.stringify(env, null, 2)};`);
};
