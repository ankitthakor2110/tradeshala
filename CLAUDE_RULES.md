# TradeShala — Claude Code Rules

## UI Interaction Rules (ALWAYS FOLLOW)
Every button, link, and interactive element MUST have:

### Buttons
- cursor-pointer
- transition-all duration-200
- active:scale-95 (press effect)
- hover state (color change or lift)
- disabled:opacity-50 disabled:cursor-not-allowed
- Use INTERACTION_CLASSES from src/styles/interactions.ts

### Links
- cursor-pointer
- transition-colors duration-200
- hover:text-violet-400 for nav links
- hover:underline underline-offset-4 for text links

### Cards (clickable)
- cursor-pointer
- hover:-translate-y-1
- hover:border-violet-500/30
- transition-all duration-200

### Form Inputs
- cursor-text
- focus:ring-2 focus:ring-violet-500/50
- focus:border-violet-500

### Color Rules
- Violet → UI elements (buttons, nav, branding)
- Green  → Positive financial values
- Red    → Negative financial values  
- Gray   → Neutral/zero values

### Hydration Rules
- "use client" on all interactive components
- mounted state pattern for time/browser APIs
- No typeof window in JSX
- No <a> inside <Link>

## Loader Rules (ALWAYS FOLLOW)
- Every page MUST have a loading state
- Every async action MUST show loader on trigger element
- Every button during loading:
  * Show ButtonLoader spinner
  * Change text to loading variant ("Save" → "Saving...")
  * Disable the button
  * Add cursor-not-allowed
- Every page data fetch:
  * Show Skeleton components
  * Never show empty content while loading
- Top progress bar on ALL navigation

## Cursor Rules (ALWAYS FOLLOW)
- button → cursor-pointer ALWAYS
- a/Link → cursor-pointer ALWAYS
- input/textarea → cursor-text ALWAYS
- select → cursor-pointer ALWAYS
- checkbox label → cursor-pointer ALWAYS
- [role="button"] → cursor-pointer ALWAYS
- disabled elements → cursor-not-allowed
- loading elements → cursor-wait

## Sidebar Rules (ALWAYS FOLLOW)
- Always use shared Sidebar component from src/components/dashboard/Sidebar.tsx
- Never render sidebar inside individual page files
- Sidebar width is ALWAYS w-[220px]
- Main content ALWAYS has lg:ml-[220px]
- Navbar ALWAYS has lg:left-[220px]
- Icon size ALWAYS w-5 h-5 with strokeWidth 1.5
- Text size ALWAYS text-sm font-medium
- Active state ALWAYS uses usePathname() with startsWith
- Active style: bg-violet-500/10 text-violet-400 border-l-2 border-violet-500
- Inactive style: text-gray-400 hover:bg-gray-800 hover:text-white
- Items have rounded-xl and cursor-pointer

## When Creating New Pages or Components
1. Import INTERACTION_CLASSES from 
   src/styles/interactions.ts
2. Apply appropriate class to every interactive element
3. Never create a button without hover + active state
4. Never create a link without hover state
5. Always follow color rules above
6. Always add loading skeletons for data fetches
7. Always add loading states for async actions
