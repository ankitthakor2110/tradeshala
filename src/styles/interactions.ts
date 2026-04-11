export const INTERACTION_CLASSES = {
  // Primary button (violet gradient)
  primaryButton: `
    cursor-pointer transition-all duration-200
    bg-gradient-to-r from-violet-600 to-violet-500
    hover:from-violet-500 hover:to-violet-400
    hover:shadow-lg hover:shadow-violet-500/25
    hover:-translate-y-0.5 active:scale-95
    disabled:opacity-50 disabled:cursor-not-allowed
    disabled:hover:translate-y-0 disabled:hover:shadow-none
  `,

  // Secondary/outline button
  secondaryButton: `
    cursor-pointer transition-all duration-200
    border border-gray-700 hover:border-violet-500/50
    hover:bg-gray-800 active:bg-gray-700
    active:scale-95
    disabled:opacity-50 disabled:cursor-not-allowed
  `,

  // Ghost button (no background)
  ghostButton: `
    cursor-pointer transition-all duration-200
    hover:bg-gray-800 active:bg-gray-700
    active:scale-95
    disabled:opacity-50 disabled:cursor-not-allowed
  `,

  // Danger button (red)
  dangerButton: `
    cursor-pointer transition-all duration-200
    bg-red-600 hover:bg-red-500
    hover:shadow-lg hover:shadow-red-500/25
    hover:-translate-y-0.5 active:scale-95
    disabled:opacity-50 disabled:cursor-not-allowed
  `,

  // Navigation link
  navLink: `
    cursor-pointer transition-colors duration-200
    hover:text-violet-400 active:opacity-70
  `,

  // Inline text link
  textLink: `
    cursor-pointer transition-colors duration-200
    text-violet-400 hover:text-violet-300
    hover:underline underline-offset-4
    active:opacity-70
  `,

  // Sidebar nav item
  sidebarItem: `
    cursor-pointer transition-all duration-200
    hover:bg-gray-800 active:bg-gray-700
    rounded-lg
  `,

  // Sidebar active item
  sidebarItemActive: `
    bg-violet-500/10 text-violet-400
    border-l-2 border-violet-500
  `,

  // Icon button (bell, close, etc)
  iconButton: `
    cursor-pointer transition-all duration-200
    hover:bg-gray-800 active:bg-gray-700
    rounded-full p-2 active:scale-90
  `,

  // Card (clickable)
  clickableCard: `
    cursor-pointer transition-all duration-200
    hover:border-violet-500/30
    hover:-translate-y-1
    hover:shadow-xl hover:shadow-violet-500/5
    active:translate-y-0
  `,

  // Form input
  formInput: `
    cursor-text transition-all duration-200
    focus:outline-none focus:ring-2
    focus:ring-violet-500/50 focus:border-violet-500
  `,

  // Checkbox label
  checkboxLabel: `
    cursor-pointer transition-colors duration-200
    hover:text-gray-300
  `,

  // Dropdown item
  dropdownItem: `
    cursor-pointer transition-colors duration-200
    hover:bg-gray-800 active:bg-gray-700
    px-4 py-2 rounded-lg
  `,
} as const;
