const fs = require('fs');
const path = require('path');

const env = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || ''
};

const outPath = path.join(__dirname, '..', 'src', 'assets', 'env.js');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(
  outPath,
  'window.__env__ = ' + JSON.stringify(env, null, 2) + ';' + '\n',
  { encoding: 'utf8' }
);

// 👇 Add these lines for visibility in Vercel logs
console.log('✅ Generated env.js at:', outPath);
console.log('✅ Env variables included:', Object.keys(env).filter(k => !!env[k]));
