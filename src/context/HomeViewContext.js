import React, { createContext, useContext, useState } from 'react';

const HomeViewContext = createContext();

export function HomeViewProvider({ children }) {
  const [showAllGrouped, setShowAllGrouped] = useState(false);
  return (
    <HomeViewContext.Provider value={{ showAllGrouped, setShowAllGrouped }}>
      {children}
    </HomeViewContext.Provider>
  );
}

export function useHomeView() {
  return useContext(HomeViewContext);
}
