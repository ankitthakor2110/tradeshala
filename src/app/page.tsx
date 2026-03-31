import { landingConfig } from "@/config/landing";
import Navbar from "@/components/landing/Navbar";
import HeroSection from "@/components/landing/HeroSection";
import StatsSection from "@/components/landing/StatsSection";
import FeaturesSection from "@/components/landing/FeaturesSection";
import HowItWorksSection from "@/components/landing/HowItWorksSection";
// import TestimonialsSection from "@/components/landing/TestimonialsSection";
import CTASection from "@/components/landing/CTASection";
import Footer from "@/components/landing/Footer";
import ScrollToTop from "@/components/ui/ScrollToTop";

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <Navbar appName={landingConfig.appName} links={landingConfig.navLinks} />
      <HeroSection hero={landingConfig.hero} />
      <StatsSection stats={landingConfig.stats} />
      <FeaturesSection features={landingConfig.features} />
      <HowItWorksSection steps={landingConfig.howItWorks} />
      {/* <TestimonialsSection testimonials={landingConfig.testimonials} /> */}
      <CTASection cta={landingConfig.cta} />
      <Footer appName={landingConfig.appName} footer={landingConfig.footer} />
      <ScrollToTop label={landingConfig.scrollToTopLabel} />
    </main>
  );
}
