Build a complete, modern, lightweight e-commerce website for my Bangladesh-based online business **AWAJ**.

The website should be strongly inspired by the overall shopping experience and structure of **https://skybuybd.com/**, but it must NOT copy SkyBuyBD's branding, logo, text, images, source code, or exact visual design.

Use the reference website only as UX/design inspiration.

## 1. BUSINESS MODEL

AWAJ imports products from China and sells them to customers in Bangladesh.

I sell many different types of products, including:

* Gadgets
* Electronics
* Mobile accessories
* Fashion
* Bags
* Shoes
* Beauty products
* Home & kitchen products
* Lifestyle products
* Trending Chinese products
* Other interesting products sourced from China

There are two important product types:

### READY STOCK

Products that are already available in Bangladesh.

Display:

**READY STOCK**

"Available in Bangladesh"

Customers can order immediately.

### PRE-ORDER

Products that I source from China after receiving customer orders.

Display:

**PRE-ORDER**

"Estimated delivery: 7–10 days"

The customer must clearly understand that the product needs to be imported from China.

The website must make Ready Stock and Pre-Order products visually different.

---

# 2. MAIN DESIGN DIRECTION

Create a shopping marketplace experience similar in usability to SkyBuyBD.

The website should feel:

* Modern
* Clean
* Trustworthy
* Professional
* Fast
* Mobile-first
* Suitable for Bangladesh
* Easy to browse
* Suitable for a large variety of products

Do NOT make it look like a typical basic Facebook shop.

AWAJ should look like a proper online marketplace.

Brand name:

**AWAJ**

Suggested tagline:

**China Trends, Delivered to Bangladesh**

Alternative:

**Discover. Pre-Order. Receive.**

---

# 3. HEADER / TOP NAVIGATION

Create a header inspired by the reference site's shopping structure.

Desktop header:

* AWAJ logo
* Large search bar
* Search button
* Optional image-search button
* Wishlist
* Cart
* Account
* WhatsApp/Support
* More/Menu

Mobile header:

* Hamburger menu
* AWAJ logo
* Search icon
* Cart icon

Below the main header, create a horizontally scrollable category menu.

Example:

**Gadgets | Electronics | Fashion | Bags | Shoes | Beauty | Home & Kitchen | Accessories | Trending**

The category menu must work smoothly on mobile.

---

# 4. SEARCH SYSTEM

Search should be one of the most important features.

Allow customers to search products by:

* Product name
* Product keyword
* Category
* Product code

Example:

Customer searches:

"mini printer"

"wireless charger"

"bag"

"LED light"

Show matching products immediately.

Add filters:

* Category
* Price
* Ready Stock
* Pre-Order
* New
* Discount

### IMAGE SEARCH

Create an Image Search button similar in concept to the reference website.

The interface should allow:

**Upload Product Image → Search Similar Products**

However, because I want the first version to remain lightweight, do not install a huge AI/computer-vision system locally.

For Version 1:

Create the Image Search UI and architecture so that it can later connect to an external image-search/AI API.

Do not make local AI image processing mandatory.

---

# 5. HOMEPAGE STRUCTURE

The homepage should have the following structure:

## HERO SECTION

Large promotional banner.

Example:

**Trending Products From China**

"Order Ready Stock or Pre-Order the latest products from China."

Buttons:

**Shop Ready Stock**

**Explore Pre-Order**

Use a modern image/banner, but keep the file size small.

Create a carousel with 2–3 banners.

Do not use large videos.

---

# 6. QUICK CATEGORY SECTION

Create visually attractive category cards.

Example:

### Gadgets

Phones, accessories, smart devices

### Fashion

Clothing, bags, shoes

### Beauty

Beauty and personal care

### Home & Kitchen

Useful household products

### Electronics

Electronic products and accessories

### Trending

Latest popular Chinese products

Each category should have:

* Small optimized image
* Category name
* Clickable link

---

# 7. READY STOCK SECTION

Create a dedicated homepage section:

## Ready Stock

Subtitle:

**Available in Bangladesh — Order Now**

Show a horizontal product carousel/grid.

Each product card should show:

* Product image
* Product name
* Current price
* Previous price if applicable
* Discount
* Rating
* SOLD count if available
* READY STOCK badge
* Add to Cart button
* Buy Now button

Example:

**Mini Portable Thermal Printer**

৳1,850

READY STOCK

[Buy Now]

---

# 8. PRE-ORDER SECTION

Create another major homepage section:

## Pre-Order From China

Subtitle:

**Order Today — Estimated Delivery 7–10 Days**

Product cards should contain:

* Product image
* Product name
* Price in BDT
* Original price
* Discount
* PRE-ORDER badge
* Estimated delivery
* Order button

Example:

**Portable Mini Projector**

৳3,250

PRE-ORDER

Estimated delivery: 7–10 days

[Pre-Order Now]

This section should be visually different from Ready Stock.

---

# 9. TRENDING PRODUCTS

Create a section:

## Trending Now

Use product cards inspired by marketplace websites.

Display:

* Product image
* Product name
* Price
* Discount
* Sold quantity
* Rating
* Stock type
* Add to cart
* Buy now

Example:

★★★★★

2.3k sold

PRE-ORDER

---

# 10. FLASH DEALS / SPECIAL OFFERS

Create:

## Hot Deals

Show products with:

* Discount percentage
* Old price
* New price
* Countdown timer
* Limited stock indicator

Example:

~~৳1,500~~

**৳999**

**33% OFF**

Only 12 left

Do not make the countdown fake in production. It should be controlled from product/admin data.

---

# 11. PRODUCT DISCOVERY SECTIONS

Similar to marketplace-style browsing, create category-based sections:

## Popular Gadgets

[View All]

## Fashion Picks

[View All]

## Beauty & Personal Care

[View All]

## Home & Kitchen

[View All]

## Bags & Accessories

[View All]

## New Arrivals

[View All]

Each section should contain a product grid or horizontal slider.

---

# 12. PRODUCT CARD DESIGN

The product card is very important.

Each card should support:

* Product image
* NEW badge
* READY STOCK badge
* PRE-ORDER badge
* Discount badge
* Product title
* Current price
* Previous price
* Rating
* Sold quantity
* Wishlist heart
* Add to Cart
* Quick View

Do not overcrowd the card.

On mobile, prioritize:

Image → Product Name → Price → Stock Type → Buy button.

---

# 13. PRODUCT DETAILS PAGE

Create a professional marketplace-style product page.

Layout:

LEFT:

* Main product image
* Thumbnail gallery
* Zoom/view image

RIGHT:

* Product title
* Rating
* Sold quantity
* Product price
* Discount
* Stock type
* Delivery estimate
* Available variants
* Quantity selector
* Add to Cart
* Buy Now
* WhatsApp inquiry

For Ready Stock:

**READY STOCK**

Available in Bangladesh.

For Pre-Order:

**PRE-ORDER**

Estimated delivery: **7–10 days**

Show this notice:

"Pre-order products are sourced from China after order confirmation. Delivery normally takes approximately 7–10 days, depending on shipping and customs."

---

# 14. PRODUCT DESCRIPTION

Product pages should have tabs/sections:

### Description

### Specifications

### Available Variants

### Delivery Information

### Return Policy

### Reviews

Keep the interface simple.

---

# 15. ORDER SYSTEM

Create a simple checkout process.

Customer information:

* Full Name
* Mobile Number
* WhatsApp Number
* District
* Area
* Full Address
* Product
* Variant
* Quantity
* Delivery Method
* Payment Method
* Additional Note

Calculate:

Product price
+
Delivery charge
===============

Total

Show everything clearly before order confirmation.

---

# 16. CHECKOUT

Use a simple one-page checkout.

Do NOT create a complicated multi-step checkout unless necessary.

Example:

### Your Order

Product:
Mini Projector

Quantity:
1

Price:
৳3,250

Delivery:
৳80

Total:
**৳3,330**

[Place Order]

---

# 17. PAYMENT OPTIONS

Version 1 should support:

* Cash on Delivery
* bKash
* Nagad
* Bank Transfer

Make payment settings configurable from admin.

Do not install complicated payment systems for the first version.

Later I may integrate:

* SSLCommerz
* bKash API
* Nagad API
* Other Bangladesh payment gateways

---

# 18. DELIVERY

Create configurable delivery charges.

Example:

Inside Dhaka:
৳80

Outside Dhaka:
৳130

These values must be editable from admin.

Do NOT permanently hard-code the charges.

---

# 19. ORDER TRACKING

Create an order tracking page.

Customer enters:

**Order ID + Phone Number**

Then show:

Order Received
↓
Confirmed
↓
Ordered From China
↓
China Shipment
↓
Arrived Bangladesh
↓
Ready for Delivery
↓
Delivered

For Ready Stock orders, the China-related steps can be skipped automatically.

---

# 20. ADMIN PANEL

Create a lightweight admin dashboard.

Admin should be able to:

### Products

* Add product
* Edit product
* Delete product
* Upload images
* Set price
* Set original price
* Set discount
* Set category
* Set Ready Stock / Pre-Order
* Set estimated delivery
* Add variants
* Set stock quantity
* Set featured product
* Set trending product

### Orders

View:

* Order ID
* Customer
* Phone
* Address
* Product
* Quantity
* Total
* Payment
* Order date
* Order status

Change status:

* Order Received
* Confirmed
* Ordered From China
* In Transit
* Arrived Bangladesh
* Ready for Delivery
* Delivered
* Cancelled

---

# 21. WHATSAPP

Create a floating WhatsApp button.

On product pages:

**Ask on WhatsApp**

Automatically generate:

"Hello AWAJ, I am interested in [Product Name]. Is this product available?"

Also add a general customer support WhatsApp button.

---

# 22. FACEBOOK

Because my business currently sells through Facebook, make Facebook highly visible.

Include:

**Follow AWAJ on Facebook**

**Chat on Facebook**

Add configurable Facebook page URL.

Do not hard-code an unavailable page URL.

---

# 23. WISHLIST

Create a lightweight wishlist.

Customers can click the heart icon.

Guest wishlist can use local browser storage.

A full account-based wishlist can be added later.

---

# 24. CART

Create a shopping cart.

Support:

* Multiple products
* Quantity changes
* Remove item
* Product subtotal
* Delivery charge
* Total amount

Show cart icon with item count.

---

# 25. LOGIN / ACCOUNT

Version 1 should NOT require customers to create an account just to order.

Allow:

**Guest Checkout**

Later, account functionality can be added.

This is important because many Bangladeshi Facebook customers prefer quick checkout.

---

# 26. FOOTER

Create a professional footer containing:

### AWAJ

China Trends, Delivered to Bangladesh.

### Customer Support

WhatsApp
Facebook
Phone
Email

### Quick Links

Home
Products
Categories
Ready Stock
Pre-Order
Track Order
About Us
Contact Us

### Policies

Shipping Policy
Return & Refund
Privacy Policy
Terms & Conditions

### Social Media

Facebook
Instagram
TikTok

---

# 27. ABOUT AWAJ

Create an About section explaining:

"AWAJ brings interesting and trending products from China to customers in Bangladesh. Customers can purchase Ready Stock products or pre-order selected products with an estimated delivery time of 7–10 days."

The tone should be trustworthy and simple.

---

# 28. MOBILE DESIGN

Mobile is extremely important.

The majority of customers may access the website through smartphones.

Create:

* Sticky bottom navigation
* Home
* Categories
* Search
* Cart
* Account

Use a floating WhatsApp button.

Product pages should have a sticky mobile bottom bar:

**Add to Cart | Buy Now**

For pre-order products:

**Add to Cart | Pre-Order Now**

---

# 29. PERFORMANCE

This is extremely important.

My laptop has limited storage, so development must use minimum tools.

Use the simplest architecture possible.

Preferred:

### Frontend

HTML
CSS
Vanilla JavaScript

Use a framework only when there is a strong reason.

Avoid:

* Docker
* Large UI libraries
* Unnecessary packages
* Heavy animation libraries
* Large local databases
* Local AI models
* Unnecessary dependencies

Do not install hundreds of npm packages.

Keep node_modules and build size as small as practical.

---

# 30. IMAGE OPTIMIZATION

Product images are important but must not make the website slow.

Use:

* WebP
* Lazy loading
* Responsive image sizes
* Compression
* Thumbnail generation

Do not automatically load original high-resolution China supplier images.

---

# 31. SEO

Implement basic SEO:

* SEO-friendly URLs
* Product title
* Meta description
* Open Graph tags
* Product structured data
* Sitemap
* robots.txt
* Breadcrumbs

Example URL:

/product/mini-portable-projector

/category/gadgets

/pre-order

/ready-stock

---

# 32. DATA STORAGE

Do not create a complicated enterprise database for Version 1.

Use a lightweight backend/database architecture.

The system must be easy to upgrade later.

Possible approach:

Frontend:
HTML/CSS/JavaScript

Backend:
Lightweight API

Database:
SQLite for local development OR another small production database depending on hosting requirements.

Keep product/order data separate from frontend code.

---

# 33. DEVELOPMENT ENVIRONMENT

I have limited laptop storage.

Therefore:

Use minimum development tools.

Do NOT require:

* Docker
* XAMPP
* Android Studio
* Local AI models
* Kubernetes
* Large databases
* Heavy IDE plugins

The project should work with a lightweight editor and terminal.

Provide exact commands for installation and running.

Example:

npm install

npm run dev

But keep dependencies to the minimum.

---

# 34. PROJECT STRUCTURE

Keep the source code simple.

Example:

/awaj
/public
/images
/src
/components
/pages
/styles
/data
/admin
/api
package.json
README.md

Avoid unnecessary folders and packages.

---

# 35. VERSION 1 PRIORITIES

Do not over-engineer.

First build these features:

1. Homepage
2. Search
3. Categories
4. Product listing
5. Product details
6. Ready Stock
7. Pre-Order
8. Cart
9. Guest Checkout
10. Order submission
11. Order tracking
12. Admin product management
13. Admin order management
14. WhatsApp
15. Facebook
16. Mobile responsive design

Everything else should be optional.

---

# 36. IMPORTANT UX INSPIRATION

Use SkyBuyBD as inspiration for the following types of experience:

* Marketplace-style header
* Search-centric shopping
* Category shortcuts
* Product discovery
* Product grids
* Featured categories
* Promotional sections
* Wishlist
* Cart
* Account
* Mobile-friendly navigation
* Product browsing flow
* Sourcing/shopping concept

However:

DO NOT copy:

* SkyBuyBD logo
* SkyBuyBD brand colors exactly
* SkyBuyBD wording
* SkyBuyBD images
* SkyBuyBD product descriptions
* SkyBuyBD source code
* Exact page design
* Exact banners
* Copyrighted content

AWAJ must have its own identity.

---

# 37. IMPORTANT BUSINESS DIFFERENCE

Unlike a traditional marketplace, AWAJ should emphasize:

### READY STOCK

Fast local delivery.

### PRE-ORDER

China sourcing.

### 7–10 DAYS

Estimated pre-order delivery.

### CHINA SOURCING

Interesting/trending products from China.

Make these four concepts highly visible throughout the site.

---

# 38. FINAL VISUAL DIRECTION

The final website should feel like:

**A modern Bangladeshi shopping marketplace + China product sourcing platform + Facebook commerce business.**

It should be inspired by SkyBuyBD's marketplace structure while having a completely independent AWAJ identity.

The customer should immediately understand:

**"I can discover Chinese products here, buy Ready Stock products immediately, or Pre-Order products from China and receive them in approximately 7–10 days."**

Build a fully functional MVP, not only a static UI mockup.

Make the code clean, lightweight, responsive, easy to understand and easy to upgrade later.
