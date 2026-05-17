import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Hero } from "@/components/landing/Hero";
import { PainSection } from "@/components/landing/PainSection";
import { SolutionSection } from "@/components/landing/SolutionSection";
import { AppShowcase } from "@/components/landing/AppShowcase";
import { PricingSection } from "@/components/landing/PricingSection";
import { HonestStats } from "@/components/landing/HonestStats";
import { FAQ } from "@/components/landing/FAQ";
import { FinalCTA } from "@/components/landing/FinalCTA";

/**
 * R42 — premium landing page. Composition only; each section is its own
 * component under components/landing/. Order is conversion-tuned:
 * hook → pain → solution → proof → PRICE → trust → objections → close.
 */
export default function LandingPage() {
  return (
    <>
      <Header />
      <main className="flex-1 relative">
        <Hero />
        <PainSection />
        <SolutionSection />
        <AppShowcase />
        <PricingSection />
        <HonestStats />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}
