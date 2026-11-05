import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { MarqueeTicker } from "@/components/MarqueeTicker";
import { IdeSimulator } from "@/components/IdeSimulator";
import { DigitalWorkers } from "@/components/DigitalWorkers";
import { Features } from "@/components/Features";
import { ArchitectureSection } from "@/components/ArchitectureSection";
import { ComparisonTable } from "@/components/ComparisonTable";
import { BottomCta } from "@/components/BottomCta";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <main className="min-h-screen bg-alma-yogurt text-alma-teriyaki selection:bg-alma-kiwi/30 selection:text-alma-teriyaki">
      <Navbar />
      <Hero />
      <MarqueeTicker />
      <IdeSimulator />
      <DigitalWorkers />
      <Features />
      <ArchitectureSection />
      <ComparisonTable />
      <BottomCta />
      <Footer />
    </main>
  );
}
