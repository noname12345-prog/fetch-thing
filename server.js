import express from "express"
const app = express()
app.use(express.json())

const SECRET = process.env.SECRET_KEY
const ROBLOX_API_KEY = process.env.ROBLOX_API_KEY

function auth(req, res, next) {
    if (req.headers["x-secret"] !== SECRET) return res.status(403).json({ error: "Forbidden" })
    next()
}

function robloxHeaders() {
    return {
        "x-api-key": ROBLOX_API_KEY,
        "Accept": "application/json"
    }
}

app.get("/check/inventory/:userId", auth, async (req, res) => {
    try {
        const r = await fetch(`https://inventory.roproxy.com/v1/users/${req.params.userId}/can-view-inventory`, {
            headers: robloxHeaders()
        })
        const data = await r.json()
        console.log(`[Inventory] ${req.params.userId}:`, JSON.stringify(data))
        res.json({ canView: data.canView })
    } catch (e) {
        console.error(`[Inventory] Error:`, e.message)
        res.status(500).json({ error: e.message })
    }
})

app.get("/check/friends/:userId", auth, async (req, res) => {
    try {
        const r = await fetch(`https://friends.roproxy.com/v1/users/${req.params.userId}/friends/count`, {
            headers: robloxHeaders()
        })
        const data = await r.json()
        console.log(`[Friends] ${req.params.userId}: ${data.count}`)
        res.json({ count: data.count })
    } catch (e) {
        console.error(`[Friends] Error:`, e.message)
        res.status(500).json({ error: e.message })
    }
})

app.get("/check/avatar-cost/:userId", auth, async (req, res) => {
    try {
        const avatarRes = await fetch(`https://avatar.roproxy.com/v1/users/${req.params.userId}/avatar`, {
            headers: robloxHeaders()
        })
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

                const bundleRes = await fetch(`https://catalog.roproxy.com/v1/assets/${asset.id}/bundles`, {
                    headers: robloxHeaders()
                })
                const bundleData = await bundleRes.json()
                if (bundleData.data && bundleData.data.length > 0) {
                    for (const bundle of bundleData.data) {
                        if (countedBundles.has(bundle.id)) continue
                        countedBundles.add(bundle.id)
                        const bRes = await fetch(`https://catalog.roproxy.com/v1/bundles/${bundle.id}/details`, {
                            headers: robloxHeaders()
                        })
                        const bData = await bRes.json()
                        const price = bData.product?.priceInRobux ?? 0
                        console.log(`[AvatarCost] ${id} bundle "${bData.name}" price: ${price}`)
                        total += price
                    }
                    return
                }

                const r = await fetch(`https://marketplace.roproxy.com/v1/assets/${asset.id}/resale-data`, {
                    headers: robloxHeaders()
                })
                const data = await r.json()
                if (data.recentAveragePrice && data.recentAveragePrice > 0) {
                    console.log(`[AvatarCost] ${id} resale RAP: ${data.recentAveragePrice}`)
                    total += data.recentAveragePrice
                    return
                }

                const r2 = await fetch(`https://economy.roproxy.com/v2/assets/${asset.id}/details`, {
                    headers: robloxHeaders()
                })
                const data2 = await r2.json()
                if (data2.PriceInRobux && data2.PriceInRobux > 0) {
                    console.log(`[AvatarCost] ${id} economy price: ${data2.PriceInRobux}`)
                    total += data2.PriceInRobux
                    return
                }

                const r3 = await fetch(`https://catalog.roproxy.com/v1/assets/${asset.id}/details`, {
                    headers: robloxHeaders()
                })
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
            const url = new URL(`https://apis.roblox.com/cloud/v2/users/${req.params.userId}/inventory-items`)
            url.searchParams.set("filter", "badges=true")
            url.searchParams.set("maxPageSize", "100")
            if (cursor) url.searchParams.set("pageToken", cursor)

            const r = await fetch(url.toString(), {
                headers: robloxHeaders()
            })
            const data = await r.json()

            console.log(`[Badges] Page ${pageCount + 1} — items: ${(data.inventoryItems || []).length} next: ${data.nextPageToken || "none"}`)

            if (!data.inventoryItems) {
                console.warn(`[Badges] Unexpected response:`, JSON.stringify(data))
                break
            }

            pages.push(data.inventoryItems)
            pageCount++
            cursor = data.nextPageToken || null
        } while (cursor && pageCount < 200)

        console.log(`[Badges] Total pages for ${req.params.userId}: ${pageCount}`)
        res.json({ pages })
    } catch (e) {
        console.error(`[Badges] Error:`, e.message)
        res.status(500).json({ error: e.message })
    }
})

app.listen(8000)
