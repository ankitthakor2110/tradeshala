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

## When Creating New Pages or Components
1. Import INTERACTION_CLASSES from 
   src/styles/interactions.ts
2. Apply appropriate class to every interactive element
3. Never create a button without hover + active state
4. Never create a link without hover state
5. Always follow color rules above