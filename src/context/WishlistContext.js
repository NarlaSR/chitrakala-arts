import React, { createContext, useContext, useEffect, useState } from 'react';

const WishlistContext = createContext();

export function WishlistProvider({ children }) {
  const [wishlist, setWishlist] = useState(() => {
    // Try to load from sessionStorage
    const stored = sessionStorage.getItem('wishlist');
    return stored ? JSON.parse(stored) : [];
  });

  useEffect(() => {
    sessionStorage.setItem('wishlist', JSON.stringify(wishlist));
  }, [wishlist]);

  const addToWishlist = (artwork) => {
    setWishlist((prev) => {
      if (prev.find((item) => item.id === artwork.id)) return prev;
      return [...prev, artwork];
    });
  };

  const removeFromWishlist = (artworkId) => {
    setWishlist((prev) => prev.filter((item) => item.id !== artworkId));
  };

  const clearWishlist = () => setWishlist([]);

  return (
    <WishlistContext.Provider value={{ wishlist, addToWishlist, removeFromWishlist, clearWishlist }}>
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist() {
  return useContext(WishlistContext);
}
