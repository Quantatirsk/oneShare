import { useNavigate } from 'react-router-dom';
import { HeroSection } from '@/components/homepage/HeroSection';
import { UseCaseSection } from '@/components/homepage/UseCaseSection';


export function Homepage() {
  const navigate = useNavigate();

  const handleGetStarted = () => {
    navigate('/create');
  };


  const handleCreateApp = () => {
    navigate('/create');
  };

  const handleViewAllApps = () => {
    navigate('/app');
  };

  const handleViewFiles = () => {
    navigate('/files');
  };
  
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <HeroSection 
        onGetStarted={handleGetStarted}
        onCreateApp={handleCreateApp}
        onViewAllApps={handleViewAllApps}
        onViewFiles={handleViewFiles}
      />

      {/* Use Cases */}
      <UseCaseSection onGetStarted={handleGetStarted} />

    </div>
  );
}