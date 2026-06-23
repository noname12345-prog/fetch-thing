import express from "express"
const app = express()
app.use(express.json())

const SECRET = process.env.SECRET_KEY

function auth(req, res, next) {
    if (req.headers["x-secret"] !== SECRET) return res.status(403).json({ error: "Forbidden" })
    next()
}

app.get("/check/inventory/:userId", auth, async (req, res) => {
    try {
        const r = await fetch(`https://inventory.roblox.com/v1/users/${req.params.userId}/can-view-inventory`)
        const data = await r.json()
        res.json({ canView: data.canView })
    } catch (e) {
        res.status(500).json({ error: e.message })
    }
})

app.get("/check/friends/:userId", auth, async (req, res) => {
    try {
        const r = await fetch(`https://friends.roblox.com/v1/users/${req.params.userId}/friends/count`)
        const data = await r.json()
        res.json({ count: data.count })
    } catch (e) {
        res.status(500).json({ error: e.message })
    }
})

app.get("/check/avatar-cost/:userId", auth, async (req, res) => {
    try {
        const avatarRes = await fetch(`https://avatar.roblox.com/v1/users/${req.params.userId}/avatar`)
        const avatarData = await avatarRes.json()
        const assets = avatarData.assets || []
        console.log(`[AvatarCost] ${req.params.userId} — ${assets.length} assets on avatar`)
        if (!assets.length) return res.json({ robuxSpent: 0 })

        let total = 0
        await Promise.all(assets.map(async (asset) => {
            try {
                const r = await fetch(`https://economy.roblox.com/v2/assets/${asset.id}/details`)
                const data = await r.json()
                console.log(`[AvatarCost] Asset ${asset.id} — PriceInRobux:${data.PriceInRobux} IsForSale:${data.IsForSale}`)
                if (data.PriceInRobux && data.PriceInRobux > 0) {
                    total += data.PriceInRobux
                }
            } catch (e) {
                console.warn(`[AvatarCost] Failed to fetch asset ${asset.id}:`, e.message)
            }
        }))

        console.log(`[AvatarCost] Total for ${req.params.userId}: ${total}`)
        res.json({ robuxSpent: total })
    } catch (e) {
        console.error(`[AvatarCost] Error:`, e.message)
        res.status(500).json({ error: e.message })
    }
})

app.get("/check/badges/:userId", auth, async (req, res) => {
    try {
        const pages = []
        let cursor = ""
        do {
            const r = await fetch(
                `https://badges.roblox.com/v1/users/${req.params.userId}/badges?limit=100&sortOrder=Desc${cursor ? `&cursor=${cursor}` : ""}`
            )
            const data = await r.json()
            pages.push(data.data || [])
            cursor = data.nextPageCursor || ""
        } while (cursor)

        res.json({ pages })
    } catch (e) {
        res.status(500).json({ error: e.message })
    }
})

app.listen(8000)
