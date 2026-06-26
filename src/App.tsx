import { Navigate, Route, Routes } from 'react-router-dom';
import { CatalogProvider } from './CatalogContext';
import { ExploreRoute, RedirectExploreToHome } from './ExploreRoute';
import { Faqs, PrivacyPolicy } from './StaticPages';

export default function App() {
  return (
    <CatalogProvider>
      <Routes>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/home" element={<ExploreRoute />} />
        <Route path="/home/:id" element={<ExploreRoute detail />} />
        <Route path="/explore" element={<Navigate to="/home" replace />} />
        <Route path="/explore/:id" element={<RedirectExploreToHome />} />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="/faqs" element={<Faqs />} />
      </Routes>
    </CatalogProvider>
  );
}
