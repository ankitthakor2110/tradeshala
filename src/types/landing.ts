export interface NavLink {
  label: string;
  href: string;
}

export interface CTAButton {
  label: string;
  href: string;
  variant: "primary" | "secondary";
}

export interface Badge {
  text: string;
}

export interface HeroConfig {
  headline: string;
  highlightedWord: string;
  subheadline: string;
  ctaButtons: CTAButton[];
  badges: Badge[];
}

export interface Stat {
  value: string;
  label: string;
}

export interface Feature {
  icon: string;
  title: string;
  description: string;
}

export interface Step {
  stepNumber: number;
  title: string;
  description: string;
}

export interface Testimonial {
  name: string;
  role: string;
  avatarInitials: string;
  text: string;
  rating: number;
}

export interface CTASectionConfig {
  headline: string;
  subheadline: string;
  buttonText: string;
  buttonHref: string;
}

export interface FooterLinkGroup {
  title: string;
  links: NavLink[];
}

export interface FooterConfig {
  description: string;
  linkGroups: FooterLinkGroup[];
  copyright: string;
}

export interface LogoConfig {
  src: string;
  alt: string;
  width: number;
  height: number;
}

export interface LandingConfig {
  appName: string;
  // logo: LogoConfig;
  scrollToTopLabel: string;
  tagline: string;
  description: string;
  navLinks: NavLink[];
  hero: HeroConfig;
  stats: Stat[];
  features: Feature[];
  howItWorks: Step[];
  testimonials: Testimonial[];
  cta: CTASectionConfig;
  footer: FooterConfig;
}
