// server.js
import express from "express"
const app = express()
app.use(express.json())

const SECRET = process.env.SECRET_KEY // set this in Koyeb env vars

// Auth middleware — stops randos from hitting your endpoints
function auth(req, res, next) {
    if (req.headers["x-secret"] !== SECRET) {
        return res.status(403).json({ error: "Forbidden" })
    }
    next()
}

// ── Inventory visibility ──────────────────────────────────
app.get("/check/inventory/:userId", auth, async (req, res) => {
    try {
        const r = await fetch(`https://inventory.roblox.com/v1/users/${req.params.userId}/can-view-inventory`)
        const data = await r.json()
        res.json({ canView: data.canView })
    } catch (e) {
        res.status(500).json({ error: e.message })
    }
})

// ── Avatar Robux cost ─────────────────────────────────────
app.get("/check/avatar-cost/:userId", auth, async (req, res) => {
    try {
        // Step 1: fetch avatar assets
        const avatarRes = await fetch(`https://avatar.roblox.com/v1/users/${req.params.userId}/avatar`)
        const avatarData = await avatarRes.json()
        const ids = (avatarData.assets || []).map(a => ({ id: a.id, itemType: "Asset" }))
        if (!ids.length) return res.json({ robuxSpent: 0 })

        // Step 2: POST to catalog for prices
        const catalogRes = await fetch("https://catalog.roblox.com/v1/catalog/items/details", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: ids })
        })
        const catalogData = await catalogRes.json()

        let total = 0
        for (const item of catalogData.data || []) {
            if (item.price) total += item.price
        }
        res.json({ robuxSpent: total })
    } catch (e) {
        res.status(500).json({ error: e.message })
    }
})

// ── Friend count ──────────────────────────────────────────
app.get("/check/friends/:userId", auth, async (req, res) => {
    try {
        const r = await fetch(`https://friends.roblox.com/v1/users/${req.params.userId}/friends/count`)
        const data = await r.json()
        res.json({ count: data.count })
    } catch (e) {
        res.status(500).json({ error: e.message })
    }
})

app.listen(8000)
