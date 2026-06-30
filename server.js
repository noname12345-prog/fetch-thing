const express = require('express');
const app = express();
const API_KEY = process.env.API_KEY;

app.get('/thumbnail', async (req, res) => {
  if (API_KEY && req.headers['x-api-key'] !== API_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const assetId = req.query.assetId;
  if (!assetId || !/^\d+$/.test(assetId)) {
    return res.status(400).json({ error: 'missing or invalid assetId' });
  }

  try {
    const maxAttempts = 10;
    const delayMs = 1500;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const apiRes = await fetch(
        `https://thumbnails.roblox.com/v1/assets?assetIds=${assetId}&size=420x420&format=Png`
      );
      const data = await apiRes.json();
      const entry = data?.data?.[0];

      if (entry?.state === 'Completed' && entry.imageUrl) {
        return res.json({ imageUrl: entry.imageUrl, state: entry.state });
      }

      if (entry?.state === 'Error' || entry?.state === 'Blocked') {
        return res.status(422).json({ error: 'thumbnail_unavailable', state: entry.state });
      }

      // state is "Pending" (or similar) — wait and retry
      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }

    return res.status(504).json({ error: 'thumbnail_timed_out' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'proxy_fetch_failed' });
  }
});

app.get('/', (req, res) => res.send('ok'));
const port = process.env.PORT || 8000;
app.listen(port, () => console.log(`listening on ${port}`));
