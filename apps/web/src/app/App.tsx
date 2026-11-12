import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { RequireAuth, RequireOnboarded } from './guards';
import { LoginPage } from '../features/auth/LoginPage';
import { JoinPage } from '../features/onboarding/JoinPage';
import { OnboardingPage } from '../features/onboarding/OnboardingPage';
import { TodayPage } from '../features/today/TodayPage';
import { FeedPage } from '../features/feed/FeedPage';
import { LeaderboardPage } from '../features/leaderboard/LeaderboardPage';
import { ProfilePage } from '../features/profile/ProfilePage';
import { NewWodPage } from '../features/wod/NewWodPage';
import { AthletePage } from '../features/profile/AthletePage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/join/:code" element={<JoinPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route element={<RequireOnboarded />}>
          <Route path="/wod/new" element={<NewWodPage />} />
          <Route element={<AppLayout />}>
            <Route index element={<TodayPage />} />
            <Route path="feed" element={<FeedPage />} />
            <Route path="leaderboard" element={<LeaderboardPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="athlete/:id" element={<AthletePage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
