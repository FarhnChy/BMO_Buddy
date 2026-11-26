// Guest data never leaves this browser or touches the owner's database.
(() => {
  const key = 'bmo-guest-inventory-v1';
  const dateIn = days => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  function load() {
    const saved = localStorage.getItem(key);
    if (saved !== null) return JSON.parse(saved);
    const items = [
      {id: 1, name: 'Milk', barcode: 'manual:1', quantity: 1, expires_on: dateIn(3)},
      {id: 2, name: 'Apples', barcode: 'manual:2', quantity: 4, expires_on: dateIn(7)},
      {id: 3, name: 'Leftover soup', barcode: 'manual:3', quantity: 2, expires_on: dateIn(2)},
    ];
    localStorage.setItem(key, JSON.stringify(items));
    return items;
  }
  function save(items) { localStorage.setItem(key, JSON.stringify(items)); }
  window.bmoGuestApi = async (path, options = {}) => {
    const url = new URL(path, location.origin);
    const method = options.method || 'GET';
    const items = load();
    if (url.pathname === '/api/inventory' && method === 'GET') return items;
    if (url.pathname === '/api/status') return {pi_online:true, temperature_f:37, temperature_status:'Normal', bmo_mood:'happy', inventory_count:items.reduce((n, i) => n + i.quantity, 0), expiring_count:items.filter(i => i.expires_on && i.expires_on <= dateIn(3)).length};
    if (url.pathname === '/api/temperature-history') {
      const hours = Number(url.searchParams.get('hours')) || 24;
      return {hours, safe_min_f:32, safe_max_f:40, points:[37.1, 36.8, 37.3, 37].map((temperature_f, i) => ({temperature_f, timestamp:new Date(Date.now() - (3-i)*hours*3600000/3).toISOString()}))};
    }
    if (url.pathname === '/api/products/lookup') throw new Error('Product lookup is unavailable in guest mode. Enter the item name to try the inventory.');
    const match = url.pathname.match(/^\/api\/inventory\/(\d+)$/);
    if ((url.pathname === '/api/inventory' && method === 'POST') || (match && method === 'PATCH')) {
      const body = JSON.parse(options.body || '{}');
      const name = String(body.name || '').trim().slice(0,160);
      const quantity = Number(body.quantity);
      const barcode = String(body.barcode || '').trim();
      if (!name || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw new Error('Enter a name and a quantity between 1 and 99.');
      if (barcode && !/^\d{4,18}$/.test(barcode)) throw new Error('Enter a barcode containing 4 to 18 digits.');
      if (body.expires_on && !/^\d{4}-\d{2}-\d{2}$/.test(body.expires_on)) throw new Error('Enter a valid expiration date.');
      const id = match ? Number(match[1]) : Math.max(0, ...items.map(i => i.id)) + 1;
      const existing = items.find(i => i.id === id);
      if (match && !existing) throw new Error('Item not found.');
      const value = {id, name, quantity, barcode:barcode || `manual:${id}`, expires_on:body.expires_on || null};
      if (existing) Object.assign(existing, value); else items.push(value);
      save(items);
      return {message: match ? 'Item updated.' : 'Added to your guest fridge.'};
    }
    if (match && method === 'DELETE') {
      const index = items.findIndex(i => i.id === Number(match[1]));
      if (index < 0) throw new Error('Item not found.');
      if (url.searchParams.get('all') === '1' || items[index].quantity <= 1) items.splice(index, 1);
      else items[index].quantity--;
      save(items);
      return {message:'Guest fridge updated.'};
    }
    throw new Error('This action is unavailable in guest mode.');
  };
})();
