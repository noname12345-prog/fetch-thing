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
        const rolimons = rolimonsData.items || {}

        let total = 0
        const countedBundles = new Set() // avoid double-counting bundle parts

        await Promise.all(assets.map(async (asset) => {
            const id = String(asset.id)
            try {
                // 1. Rolimons (limiteds)
                if (rolimons[id] && rolimons[id][2] > 0) {
                    console.log(`[AvatarCost] ${id} Rolimons RAP: ${rolimons[id][2]}`)
                    total += rolimons[id][2]
                    return
                }

                // 2. Check if this asset belongs to a bundle (catches Korblox, Headless etc.)
                const bundleRes = await fetch(`https://catalog.roblox.com/v1/assets/${asset.id}/bundles`)
                const bundleData = await bundleRes.json()
                if (bundleData.data && bundleData.data.length > 0) {
                    for (const bundle of bundleData.data) {
                        if (countedBundles.has(bundle.id)) continue
                        countedBundles.add(bundle.id)

                        // Get bundle price
                        const bRes = await fetch(`https://catalog.roblox.com/v1/bundles/${bundle.id}/details`)
                        const bData = await bRes.json()
                        const price = bData.product?.priceInRobux ?? 0
                        console.log(`[AvatarCost] ${id} is part of bundle "${bData.name}" price: ${price}`)
                        total += price
                    }
                    return
                }

                // 3. Resale/RAP
                const r = await fetch(`https://marketplace.roblox.com/v1/assets/${asset.id}/resale-data`)
                const data = await r.json()
                if (data.recentAveragePrice && data.recentAveragePrice > 0) {
                    console.log(`[AvatarCost] ${id} resale RAP: ${data.recentAveragePrice}`)
                    total += data.recentAveragePrice
                    return
                }

                // 4. Economy endpoint
                const r2 = await fetch(`https://economy.roblox.com/v2/assets/${asset.id}/details`)
                const data2 = await r2.json()
                if (data2.PriceInRobux && data2.PriceInRobux > 0) {
                    console.log(`[AvatarCost] ${id} economy price: ${data2.PriceInRobux}`)
                    total += data2.PriceInRobux
                    return
                }

                // 5. Catalog v1 GET
                const r3 = await fetch(`https://catalog.roblox.com/v1/assets/${asset.id}/details`)
                const data3 = await r3.json()
                if (data3.price && data3.price > 0) {
                    console.log(`[AvatarCost] ${id} catalog price: ${data3.price}`)
                    total += data3.price
                    return
                }

                console.log(`[AvatarCost] ${id} — no price found`)
            } catch (e) {
                console.warn(`[AvatarCost] ${id} error:`, e.message)
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
