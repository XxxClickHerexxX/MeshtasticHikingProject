require('dotenv').config();
const { buildApp } = require('./app');

async function start() {
  const app = await buildApp();
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => {
    console.log(`Hiking with Confidence running on http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error('Failed to start server', error);
  process.exit(1);
});
