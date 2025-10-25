// scripts/write-env.js
const fs = require('fs');
const path = require('path');

const envVars = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || 'NOT_FOUND',
  SUPABASE_URL: process.env.SUPABASE_URL || 'NOT_FOUND',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || 'NOT_FOUND'
};

const content = `window.__env__ = ${JSON.stringify(envVars, null, 2)};`;
const filePath = path.join(__dirname, '../src/assets/env.js');

// Ensure directory exists
fs.mkdirSync(path.dirname(filePath), { recursive: true });

// Write the file
fs.writeFileSync(filePath, content);
console.log('✅ Generated env.js at:', filePath);
console.log('✅ Env variables included:', Object.keys(envVars));
console.log('🔍 Values summary:', envVars);
