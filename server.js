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

// Known bundle IDs
const KORBLOX_BUNDLE_ID = 94
const HEADLESS_BUNDLE_ID = 520
const KORBLOX_PRICE = 17000
const HEADLESS_PRICE = 31000

async function fetchWithFallback(urlList, headers) {
    for (const url of urlList) {
        try {
            const r = await fetch(url, { headers })
            if (!r.ok) continue
            const data = await r.json()
            return data
        } catch {
            continue
        }
    }
    return null
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
        const avatarData = await fetchWithFallback([
            `https://avatar.roproxy.com/v1/users/${req.params.userId}/avatar`,
            `https://avatar.roblox.com/v1/users/${req.params.userId}/avatar`
        ], robloxHeaders())

        if (!avatarData) return res.status(500).json({ error: "Failed to fetch avatar" })

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
                // Rolimons RAP check first
                if (rolimons[id] && rolimons[id][2] > 0) {
                    console.log(`[AvatarCost] ${id} Rolimons RAP: ${rolimons[id][2]}`)
                    total += rolimons[id][2]
                    return
                }

                // Check which bundles this asset belongs to
                const bundleData = await fetchWithFallback([
                    `https://catalog.roproxy.com/v1/assets/${asset.id}/bundles`,
                    `https://catalog.roblox.com/v1/assets/${asset.id}/bundles`
                ], robloxHeaders())

                if (bundleData?.data?.length > 0) {
                    for (const bundle of bundleData.data) {
                        if (countedBundles.has(bundle.id)) continue
                        countedBundles.add(bundle.id)

                        // Hardcoded Korblox / Headless
                        if (bundle.id === KORBLOX_BUNDLE_ID) {
                            console.log(`[AvatarCost] ${id} — Korblox bundle detected, adding ${KORBLOX_PRICE}`)
                            total += KORBLOX_PRICE
                            continue
                        }
                        if (bundle.id === HEADLESS_BUNDLE_ID) {
                            console.log(`[AvatarCost] ${id} — Headless bundle detected, adding ${HEADLESS_PRICE}`)
                            total += HEADLESS_PRICE
                            continue
                        }

                        const bData = await fetchWithFallback([
                            `https://catalog.roproxy.com/v1/bundles/${bundle.id}/details`,
                            `https://catalog.roblox.com/v1/bundles/${bundle.id}/details`
                        ], robloxHeaders())

                        if (!bData?.product) {
                            console.log(`[AvatarCost] ${id} bundle ${bundle.id} — no product data`)
                            continue
                        }

                        const price = bData.product.priceInRobux ?? 0
                        const name = bData.name ?? `bundle-${bundle.id}`
                        console.log(`[AvatarCost] ${id} bundle "${name}" price: ${price}`)
                        total += price
                    }
                    return
                }

                // Resale data
                const resaleData = await fetchWithFallback([
                    `https://marketplace.roproxy.com/v1/assets/${asset.id}/resale-data`,
                    `https://economy.roblox.com/v1/assets/${asset.id}/resale-data`
                ], robloxHeaders())

                if (resaleData?.recentAveragePrice > 0) {
                    console.log(`[AvatarCost] ${id} resale RAP: ${resaleData.recentAveragePrice}`)
                    total += resaleData.recentAveragePrice
                    return
                }

                // Economy details
                const econData = await fetchWithFallback([
                    `https://economy.roproxy.com/v2/assets/${asset.id}/details`,
                    `https://economy.roblox.com/v2/assets/${asset.id}/details`
                ], robloxHeaders())

                if (econData?.PriceInRobux > 0) {
                    console.log(`[AvatarCost] ${id} economy price: ${econData.PriceInRobux}`)
                    total += econData.PriceInRobux
                    return
                }

                // Catalog details
                const catalogData = await fetchWithFallback([
                    `https://catalog.roproxy.com/v1/assets/${asset.id}/details`,
                    `https://catalog.roblox.com/v1/assets/${asset.id}/details`
                ], robloxHeaders())

                if (catalogData?.price > 0) {
                    console.log(`[AvatarCost] ${id} catalog price: ${catalogData.price}`)
                    total += catalogData.price
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
            url.searchParams.set("maxPageSize", "25")
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

app.get("/", (req, res) => {
    res.json({ status: "ok" })
})

app.listen(8000)
