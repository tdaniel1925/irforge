import { MarketingNav, MarketingFooter } from "@/components/marketing/Chrome";
import SplitHero from "@/components/marketing/SplitHero";

// The homepage is a single decision: investor or company. Each side of the split
// routes to its own dedicated page (/for-investors, /for-companies), where the deep
// marketing content lives — so neither audience wades through the other's pitch.
export default function Landing() {
  return (
    <div className="flex min-h-screen flex-col bg-app text-app">
      <MarketingNav audience="hub" />
      <SplitHero />
      <MarketingFooter />
    </div>
  );
}
