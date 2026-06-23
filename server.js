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
        const r = await fetch(`https://inventory.roproxy.com/v1/users/${req.params.userId}/can-view-inventory`)
        const data = await r.json()
        res.json({ canView: data.canView })
    } catch (e) {
        res.status(500).json({ error: e.message })
    }
})

app.get("/check/friends/:userId", auth, async (req, res) => {
    try {
        const r = await fetch(`https://friends.roproxy.com/v1/users/${req.params.userId}/friends/count`)
        const data = await r.json()
        res.json({ count: data.count })
    } catch (e) {
        res.status(500).json({ error: e.message })
    }
})

app.get("/check/avatar-cost/:userId", auth, async (req, res) => {
    try {
        const avatarRes = await fetch(`https://avatar.roproxy.com/v1/users/${req.params.userId}/avatar`)
        const avatarData = await avatarRes.json()
        const assets = avatarData.assets || []
        if (!assets.length) return res.json({ robuxSpent: 0 })

        const rolimonsRes = await fetch("https://www.rolimons.com/itemapi/itemdetails")
        const rolimonsData = await rolimonsRes.json()
        const rolimons = rolimonsData.items || {}

        let total = 0
        const countedBundles = new Set()

        await Promise.all(assets.map(async (asset) => {
            const id = String(asset.id)
            try {
                if (rolimons[id] && rolimons[id][2] > 0) {
                    console.log(`[AvatarCost] ${id} Rolimons RAP: ${rolimons[id][2]}`)
                    total += rolimons[id][2]
                    return
                }

                const bundleRes = await fetch(`https://catalog.roproxy.com/v1/assets/${asset.id}/bundles`)
                const bundleData = await bundleRes.json()
                if (bundleData.data && bundleData.data.length > 0) {
                    for (const bundle of bundleData.data) {
                        if (countedBundles.has(bundle.id)) continue
                        countedBundles.add(bundle.id)
                        const bRes = await fetch(`https://catalog.roproxy.com/v1/bundles/${bundle.id}/details`)
                        const bData = await bRes.json()
                        const price = bData.product?.priceInRobux ?? 0
                        console.log(`[AvatarCost] ${id} is part of bundle "${bData.name}" price: ${price}`)
                        total += price
                    }
                    return
                }

                const r = await fetch(`https://marketplace.roproxy.com/v1/assets/${asset.id}/resale-data`)
                const data = await r.json()
                if (data.recentAveragePrice && data.recentAveragePrice > 0) {
                    console.log(`[AvatarCost] ${id} resale RAP: ${data.recentAveragePrice}`)
                    total += data.recentAveragePrice
                    return
                }

                const r2 = await fetch(`https://economy.roproxy.com/v2/assets/${asset.id}/details`)
                const data2 = await r2.json()
                if (data2.PriceInRobux && data2.PriceInRobux > 0) {
                    console.log(`[AvatarCost] ${id} economy price: ${data2.PriceInRobux}`)
                    total += data2.PriceInRobux
                    return
                }

                const r3 = await fetch(`https://catalog.roproxy.com/v1/assets/${asset.id}/details`)
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
        let cursor = null
        let pageCount = 0

        do {
            const url = new URL(`https://badges.roblox.com/v1/users/${req.params.userId}/badges`)
            url.searchParams.set("limit", "100")
            url.searchParams.set("sortOrder", "Asc")
            if (cursor) url.searchParams.set("cursor", cursor)

            const r = await fetch(url.toString(), {
                headers: {
                    "User-Agent": "Mozilla/5.0",
                    "Accept": "application/json"
                }
            })
            const data = await r.json()

            console.log(`[Badges] Page ${pageCount + 1} — items: ${(data.data || []).length} nextCursor: ${data.nextPageCursor || "none"}`)

            if (!data.data) {
                console.warn(`[Badges] No data field:`, JSON.stringify(data))
                break
            }

            pages.push(data.data)
            pageCount++
            cursor = data.nextPageCursor || null
        } while (cursor && pageCount < 200)

        console.log(`[Badges] Total pages for ${req.params.userId}: ${pageCount}`)
        res.json({ pages })
    } catch (e) {
        console.error(`[Badges] Error:`, e.message)
        res.status(500).json({ error: e.message })
    }
})

app.listen(8000)
