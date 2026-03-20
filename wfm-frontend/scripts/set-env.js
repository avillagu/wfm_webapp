const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, '../src/environments/environment.production.ts');

const envConfigFile = `export const environment = {
  production: true,
  apiBaseUrl: '${process.env.API_BASE_URL || 'http://localhost:3000/api'}',
  socketUrl: '${process.env.SOCKET_URL || 'http://localhost:3000'}'
};
`;

console.log('Generating environment file for production...\n');
fs.writeFileSync(targetPath, envConfigFile);
console.log(`Environment file generated at ${targetPath}\n`);
