# Charmbless Rental

Next.js App Router + TypeScript + Tailwind CSS + Radix UI.

## Development

Requires Node.js 20.9 or newer.

```bash
npm ci
npm run dev
```

Open http://localhost:3000. Edit `src/app/page.tsx` for the homepage and Radix Dialog example. Global Tailwind styles are in `src/app/catalog.css`.

## Checks

```bash
npm run lint
npx tsc --noEmit
```

The storefront uses original AI-generated images in `public/images/`, created with the built-in imagegen tool. The catalog layout follows `public/exam/home3.png`, with search, category filters, sorting, requested rental dates, and a local interest cart. Products are illustrative demo data; the cart lasts for the current page session. Dates do not check inventory or confirm bookings. LINE contact is configured in `src/lib/contact.ts`. Booking forms do not automatically transmit information to LINE; the user opens the chat and communicates with the shop directly. Images preserve their aspect ratio through Next.js Image. No production build has been run.

Image prompt set: sharp premium fashion rental photography, warm ivory studio, soft natural daylight, realistic fabric details, no text or logos. Hero: an adult Thai woman in a rose satin evening gown with winter outerwear on a clothing rack, clean left space for copy. Individual portrait catalog images: rose satin gown, blue ruffle dress, white puffer, brown leather jacket, taupe winter boots, and ivory wool coat.

Radix Primitives documentation: https://www.radix-ui.com/primitives/docs/overview/introduction
