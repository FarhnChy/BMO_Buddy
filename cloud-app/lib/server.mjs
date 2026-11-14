const json = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const error = (message, status = 400) => json({ error: message }, status);
function foodInput(body) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 160) throw new Error("Enter an item name up to 160 characters.");
  const barcode = String(body.barcode || "").trim().replaceAll(" ", "");
  if (barcode && !/^[0-9]{4,18}$/.test(barcode)) throw new Error("Enter 4 to 18 barcode digits, or leave it blank.");
  const quantity = Number(body.quantity ?? 1);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw new Error("Quantity must be between 1 and 99.");
  const expires_on = body.expires_on || "";
  if (expires_on && (typeof expires_on !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(expires_on) || !Number.isFinite(Date.parse(expires_on)) || new Date(expires_on).toISOString().slice(0, 10) !== expires_on)) throw new Error("Enter a valid expiration date.");
  return { name, barcode, quantity, expires_on };
}
const classify = (c) => c === null ? "No sensor" : c * 9 / 5 + 32 < 32 ? "Too Cold!" : c * 9 / 5 + 32 > 40 ? "Too Warm!" : "Normal";
const mood = (c) => ({ "No sensor": "sleepy", "Too Cold!": "cold", "Too Warm!": "worried", "Normal": "happy" })[classify(c)];

export async function handleApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const user = request.headers.get("oai-authenticated-user-id");
  // Hosted dispatch enforces owner-private access, including service uploads.
  // Service callers can submit readings but cannot access the food inventory.
  if (!(path === "/api/readings" && request.method === "POST") && !user) return error("Sign in to access your fridge.", 401);
  if (!["GET", "HEAD"].includes(request.method) && request.headers.get("Origin") && request.headers.get("Origin") !== url.origin) return error("Request origin is not allowed.", 403);
  try {
    const db = env.DB;
    if (!db) return error("Storage is unavailable. Please try again shortly.", 503);
    if (path === "/api/inventory" && request.method === "GET") {
      const { results } = await db.prepare("SELECT id, barcode, name, quantity, NULLIF(expires_on, '') AS expires_on FROM inventory ORDER BY expires_on = '', expires_on, id").all();
      return json(results);
    }
    if (path === "/api/inventory" && request.method === "POST") {
      const food = foodInput(await request.json());
      const barcode = food.barcode || `manual:${crypto.randomUUID()}`;
      await db.prepare("INSERT INTO inventory (barcode, name, quantity, expires_on) VALUES (?, ?, ?, ?) ON CONFLICT (barcode, expires_on) DO UPDATE SET quantity = inventory.quantity + excluded.quantity, name = excluded.name").bind(barcode, food.name, food.quantity, food.expires_on).run();
      return json({ message: `Added ${food.quantity} ${food.name}.` }, 201);
    }
    const match = path.match(/^\/api\/inventory\/(\d+)$/);
    if (match && ["PATCH", "DELETE"].includes(request.method)) {
      const id = Number(match[1]);
      const item = await db.prepare("SELECT * FROM inventory WHERE id = ?").bind(id).first();
      if (!item) return error("Food item was not found. Refresh your inventory.", 404);
      if (request.method === "DELETE") {
        if (url.searchParams.get("all") === "1") await db.prepare("DELETE FROM inventory WHERE id = ?").bind(id).run();
        else await db.batch([
          db.prepare("UPDATE inventory SET quantity = quantity - 1 WHERE id = ?").bind(id),
          db.prepare("DELETE FROM inventory WHERE id = ? AND quantity <= 0").bind(id),
        ]);
        return json({ message: `Removed ${item.name}.` });
      }
      const food = foodInput(await request.json());
      const barcode = food.barcode || (item.barcode.startsWith("manual:") ? item.barcode : `manual:${crypto.randomUUID()}`);
      try {
        await db.prepare("UPDATE inventory SET barcode = ?, name = ?, quantity = ?, expires_on = ? WHERE id = ?").bind(barcode, food.name, food.quantity, food.expires_on, id).run();
      } catch (e) {
        if (/unique/i.test(String(e))) return error("That barcode and expiration date already exist. Edit the existing batch.", 409);
        throw e;
      }
      return json({ message: `Updated ${food.name}.` });
    }
    if (path === "/api/status" && request.method === "GET") {
      const latest = await db.prepare("SELECT * FROM readings ORDER BY id DESC LIMIT 1").first();
      const online = !!latest && Date.now() - Date.parse(latest.timestamp) < 180000;
      const c = online ? latest.temperature_c : null;
      const counts = await db.prepare("SELECT COALESCE(SUM(quantity), 0) AS total, COALESCE(SUM(CASE WHEN expires_on != '' AND expires_on <= date('now', '+3 days') THEN 1 ELSE 0 END), 0) AS expiring FROM inventory").first();
      return json({ pi_online: online, last_seen: latest?.timestamp || null, temperature_c: c, temperature_f: c === null ? null : Math.round((c * 9 / 5 + 32) * 10) / 10, temperature_status: classify(c), bmo_mood: mood(c), inventory_count: counts.total, expiring_count: counts.expiring });
    }
    if (path === "/api/temperature-history" && request.method === "GET") {
      const hours = Number(url.searchParams.get("hours") || 24);
      if (![1, 24, 168].includes(hours)) return error("Choose 1, 24, or 168 hours.");
      const cutoff = new Date(Date.now() - hours * 3600000).toISOString();
      const { results } = await db.prepare("SELECT timestamp, temperature_c FROM readings WHERE timestamp >= ? AND temperature_c IS NOT NULL ORDER BY id DESC LIMIT 10080").bind(cutoff).all();
      return json({ hours, safe_min_f: 32, safe_max_f: 40, points: results.reverse().map(r => ({ ...r, temperature_f: r.temperature_c * 9 / 5 + 32 })) });
    }
    if (path === "/api/readings" && request.method === "POST") {
      const body = await request.json();
      const c = body.temperature_c;
      if (c !== null && (typeof c !== "number" || !Number.isFinite(c) || c < -55 || c > 125)) return error("Invalid sensor reading.");
      const timestamp = new Date().toISOString();
      await db.batch([
        db.prepare("INSERT INTO readings (timestamp, temperature_c) VALUES (?, ?)").bind(timestamp, c),
        db.prepare("DELETE FROM readings WHERE timestamp < ?").bind(new Date(Date.now() - 7 * 86400000).toISOString()),
      ]);
      return json({ received: true }, 201);
    }
    if (path === "/api/products/lookup" && request.method === "POST") {
      const body = await request.json();
      const barcode = String(body.barcode || "").replaceAll(" ", "");
      if (!/^[0-9]{4,18}$/.test(barcode)) return error("Enter a barcode containing 4 to 18 digits.");
      let product;
      try {
        const response = await fetch(`https://world.openfoodfacts.org/api/v3.6/product/${barcode}.json?fields=product_name,product_name_en,image_front_small_url`, { headers: { "User-Agent": "BMOFridge/1.0 (https://github.com/FarhnChy/bmo_fridge_buddy)" }, signal: AbortSignal.timeout(7000) });
        if (response.ok) product = (await response.json()).product;
      } catch { /* Manual entry remains available when lookup is unavailable. */ }
      const name = product?.product_name || product?.product_name_en;
      const image = product?.image_front_small_url;
      return json({ barcode, found: !!name, name: name || "Unknown item", image_url: typeof image === "string" && image.startsWith("https://images.openfoodfacts.org/") ? image : null });
    }
    return error("This action was not found.", 404);
  } catch (e) {
    if (e instanceof SyntaxError || (e instanceof Error && /^(Enter |Quantity )/.test(e.message))) return error(e.message);
    console.error("Fridge request failed", e);
    return error("Could not complete this action. Please refresh and try again.", 500);
  }
}
