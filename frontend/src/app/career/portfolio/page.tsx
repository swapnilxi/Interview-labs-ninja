import type { Metadata } from 'next';
import Header from '@/components/common/Header';
import Icon from '@/components/ui/AppIcon';
import PortfolioStudioInteractive from '@/modules/career/PortfolioModule';

export const metadata: Metadata = {
  title: 'Portfolio Builder - Career Studio',
  description: 'Build a one-page developer portfolio with widgets, versioning, and AI review.',
};

export default function PortfolioStudioPage() {
  return (
    <>
      <Header />
      <div className="min-h-screen bg-background pt-[60px]">
        <div className="max-w-[1400px] mx-auto px-24 py-24">
          <div className="lab-hero p-8 mb-12">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(124,58,237,0.16),transparent_60%)] pointer-events-none" />
            <div className="relative flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500 to-primary flex items-center justify-center shadow-lg shadow-primary/25 flex-shrink-0">
                <Icon name="GlobeAltIcon" size={22} className="text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground tracking-tight">Portfolio Builder</h1>
                <p className="text-sm text-muted-foreground mt-0.5">Compose a portfolio from widgets, preview it live, version it, and get AI feedback.</p>
              </div>
            </div>
          </div>
          <PortfolioStudioInteractive />
        </div>
      </div>
    </>
  );
}
