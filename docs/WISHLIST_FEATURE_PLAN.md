# Wishlist & Inquiry Feature Plan

## Overview
Enhance the site to allow customers to add artworks to a wishlist, review their wishlist, and submit an inquiry with their contact details and selected items. The wishlist is managed per user session.

---

## 1. Wishlist State Management
- Store wishlist items in browser session (React Context + sessionStorage or localStorage).
- Each wishlist item is an artwork object (id, title, image, etc.).

## 2. Art Details Page
- Remove the “Contact for Purchase” button.
- Make the “Add to Wishlist” button functional:
  - Adds the current artwork to the wishlist (if not already present).
  - Show a toast/notification (“Added to Wishlist!”).

## 3. Wishlist Cart UI
- Add a cart icon/button in the header or a visible location.
- Clicking the cart opens a modal or navigates to a Wishlist page.
- Show all wishlist items (art cards or a simple list).
- “Submit Request” button at the bottom.

## 4. Inquiry Form
- When “Submit Request” is clicked:
  - Show a form (modal or page) for user details (Name, Email, Phone, Message).
  - Pre-fill the inquiry with the wishlist items.
- On submit:
  - Send an email to your company with user details and the wishlist items (reuse backend logic from Contact form).

## 5. Session Management
- Wishlist is stored in sessionStorage (cleared on browser close) or localStorage (persists until user clears).
- No login required; wishlist is per-browser-session.

## 6. Backend/Email
- Reuse or extend the existing contact endpoint to accept a wishlist array.
- Email template includes user info and a list of artworks (title, id, etc.).

---

## Recommendations
- **sessionStorage** is best for privacy (clears on browser close), but **localStorage** is more user-friendly if you want the wishlist to persist longer.
- Use React Context for wishlist state so any component can access/update it.
- Keep the UI simple: a modal or dedicated page for the wishlist is user-friendly.
- Add basic validation to the inquiry form.
- Always show a toast/notification when an item is added to the wishlist.

---

## Implementation Steps
1. Create a WishlistContext for global wishlist state.
2. Update Art Details page to use “Add to Wishlist” and show a toast.
3. Add a Cart/Wishlist button in the header.
4. Build the Wishlist modal/page with “Submit Request”.
5. Reuse/extend the Contact form for inquiry submission.
6. Update backend to handle wishlist in inquiry emails.
