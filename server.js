const express = require('express');
const app = express();

const API_KEY = process.env.API_KEY; // set this in Koyeb's env vars, not in code

app.get('/thumbnail', async (req, res) => {
	if (API_KEY && req.headers['x-api-key'] !== API_KEY) {
		return res.status(401).json({ error: 'unauthorized' });
	}

	const assetId = req.query.assetId;
	if (!assetId || !/^\d+$/.test(assetId)) {
		return res.status(400).json({ error: 'missing or invalid assetId' });
	}

	try {
		const apiRes = await fetch(
			`https://thumbnails.roblox.com/v1/assets?assetIds=${assetId}&size=420x420&format=Png`
		);
		const data = await apiRes.json();
		const imageUrl = data?.data?.[0]?.imageUrl || null;
		res.json({ imageUrl });
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: 'proxy_fetch_failed' });
	}
});

app.get('/', (req, res) => res.send('ok'));

const port = process.env.PORT || 8000;
app.listen(port, () => console.log(`listening on ${port}`));
