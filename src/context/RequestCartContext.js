import React, { createContext, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'orderRequestCart';
const RequestCartContext = createContext();

function loadCart() {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Same artwork + same size = the same line (dedup target).
// Different size on the same artwork is a distinct line — that's a
// deliberate, different request item, not a duplicate.
function itemKey(artworkId, artworkSizeId) {
  return `${artworkId}::${artworkSizeId ?? 'none'}`;
}

// Lightweight, public-only, session-scoped "artwork request cart" — this is
// an inquiry cart, not a payment cart. Items here are for DISPLAY only; the
// backend (POST /api/order-requests) re-validates every item against the
// current public/orderable artwork state and builds its own authoritative
// snapshot, so nothing stored here is trusted at submission time beyond
// artwork_id / artwork_size_id / quantity.
export function RequestCartProvider({ children }) {
  const [items, setItems] = useState(loadCart);

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  // item: { artwork_id, artwork_size_id, title, image, category, size_label, availability, price_inr, price_usd }
  const addToRequest = (item) => {
    setItems((prev) => {
      const key = itemKey(item.artwork_id, item.artwork_size_id);
      if (prev.some((i) => itemKey(i.artwork_id, i.artwork_size_id) === key)) return prev;
      return [...prev, item];
    });
  };

  const removeFromRequest = (artworkId, artworkSizeId) => {
    const key = itemKey(artworkId, artworkSizeId);
    setItems((prev) => prev.filter((i) => itemKey(i.artwork_id, i.artwork_size_id) !== key));
  };

  const isInRequest = (artworkId, artworkSizeId) => {
    const key = itemKey(artworkId, artworkSizeId);
    return items.some((i) => itemKey(i.artwork_id, i.artwork_size_id) === key);
  };

  const clearRequestCart = () => setItems([]);

  return (
    <RequestCartContext.Provider
      value={{ items, addToRequest, removeFromRequest, isInRequest, clearRequestCart }}
    >
      {children}
    </RequestCartContext.Provider>
  );
}

export function useRequestCart() {
  return useContext(RequestCartContext);
}
