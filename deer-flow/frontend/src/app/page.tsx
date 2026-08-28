import { AiNative } from "@/components/landing/leedlime/ai-native";
import { AskAi } from "@/components/landing/leedlime/ask-ai";
import { Faq } from "@/components/landing/leedlime/faq";
import { Features } from "@/components/landing/leedlime/features";
import { FinalCta } from "@/components/landing/leedlime/final-cta";
import { LandingFooter } from "@/components/landing/leedlime/footer";
import { FounderQuote } from "@/components/landing/leedlime/founder-quote";
import { LandingHeader } from "@/components/landing/leedlime/header";
import { LandingHero } from "@/components/landing/leedlime/hero";
import { HowItWorks } from "@/components/landing/leedlime/how-it-works";
import { Pricing } from "@/components/landing/leedlime/pricing";
import { TrustStrip } from "@/components/landing/leedlime/trust-strip";
import { WhySection } from "@/components/landing/leedlime/why-section";

export default function LandingPage() {
  return (
    <div className="landing-scope min-h-screen w-full">
      <LandingHeader />
      <main className="flex w-full flex-col">
        <LandingHero />
        <TrustStrip />
        <HowItWorks />
        <Features />
        <WhySection />
        <AiNative />
        <FounderQuote />
        <Pricing />
        <Faq />
        <AskAi />
        <FinalCta />
      </main>
      <LandingFooter />
    </div>
  );
}
