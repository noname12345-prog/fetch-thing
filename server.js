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

        const ids = assets.map(a => ({ id: a.id, itemType: "Asset" }))
        console.log(`[AvatarCost] Sending to catalog:`, JSON.stringify(ids))

        const catalogRes = await fetch("https://catalog.roblox.com/v1/catalog/items/details", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: ids })
        })
        const catalogData = await catalogRes.json()
        console.log(`[AvatarCost] Catalog response:`, JSON.stringify(catalogData))

        let total = 0
        for (const item of catalogData.data || []) {
            const price =
                item.price ??
                item.lowestPrice ??
                item.collectibleLowestResalePrice ??
                0
            console.log(`[AvatarCost] Item ${item.id} — price:${item.price} lowestPrice:${item.lowestPrice} resale:${item.collectibleLowestResalePrice} → using ${price}`)
            total += price
        }

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
