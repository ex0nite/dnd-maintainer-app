import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { Layout } from '@/components/Layout';
import CampaignList from '@/pages/CampaignList';
import CampaignDashboard from '@/pages/CampaignDashboard';
import CharacterList from '@/pages/CharacterList';
import CharacterBuilder from '@/pages/CharacterBuilder';
import CharacterSheet from '@/pages/CharacterSheet';
import SessionList from '@/pages/SessionList';
import SessionDetail from '@/pages/SessionDetail';
import NotesPage from '@/pages/NotesPage';
import CampaignNotes from '@/pages/CampaignNotes';
import ExportData from '@/pages/ExportData';
import SettingsTheme from '@/pages/SettingsTheme';
import Login from '@/pages/Login';
import Players from '@/pages/Players';
import ChangePassword from '@/pages/ChangePassword';
import PlayerHome from '@/pages/PlayerHome';
import { RequireDm } from '@/components/RequireDm';
import { useRole } from '@/hooks/usePermissions';
import { RequireAuth } from '@/components/RequireAuth';

/** The DM lands on the campaigns, a player on their characters (story 3.2). */
function Home() {
  const { isPlayer } = useRole();
  return isPlayer ? <PlayerHome /> : <CampaignList />;
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<RequireAuth />}>
          <Route path="/change-password" element={<ChangePassword />} />
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route element={<RequireDm />}>
              <Route path="/campaign/:campaignSlug" element={<CampaignDashboard />} />
              <Route path="/campaign/:campaignSlug/sessions" element={<SessionList />} />
              <Route path="/campaign/:campaignSlug/session/:sessionSlug" element={<SessionDetail />} />
              <Route path="/campaign/:campaignSlug/notes" element={<NotesPage />} />
              <Route path="/players" element={<Players />} />
              <Route path="/export" element={<ExportData />} />
            </Route>
            <Route path="/campaign/:campaignSlug/table-notes" element={<CampaignNotes />} />
            <Route path="/campaign/:campaignSlug/characters" element={<CharacterList />} />
            <Route path="/campaign/:campaignSlug/character/new" element={<CharacterBuilder />} />
            <Route path="/campaign/:campaignSlug/character/:characterSlug/edit" element={<CharacterBuilder />} />
            <Route path="/campaign/:campaignSlug/character/:characterSlug" element={<CharacterSheet />} />
            <Route path="/settings/theme" element={<SettingsTheme />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster position="bottom-center" />
    </>
  );
}
