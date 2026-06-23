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
        if (!assets.length) return res.json({ robuxSpent: 0 })

        const rolimonsRes = await fetch("https://www.rolimons.com/itemapi/itemdetails")
        const rolimonsData = await rolimonsRes.json()
        const items = rolimonsData.items || {}

        // Rolimons item format: [name, acronym, rap, value, default_value, demand, trend, projected, hyped, rare]
        // index 2 = RAP (Recent Average Price)

        let total = 0
        for (const asset of assets) {
            const id = String(asset.id)
            if (items[id]) {
                const rap = items[id][2]
                if (rap && rap > 0) {
                    console.log(`[AvatarCost] Asset ${id} RAP: ${rap}`)
                    total += rap
                }
            } else {
                // fallback for non-limited UGC: try economy endpoint
                try {
                    const r = await fetch(`https://economy.roblox.com/v2/assets/${asset.id}/details`)
                    const data = await r.json()
                    if (data.PriceInRobux && data.PriceInRobux > 0) {
                        console.log(`[AvatarCost] Asset ${id} economy price: ${data.PriceInRobux}`)
                        total += data.PriceInRobux
                    }
                } catch (_) {}
            }
        }

        console.log(`[AvatarCost] Total RAP for ${req.params.userId}: ${total}`)
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
