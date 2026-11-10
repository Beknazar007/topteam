import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { LoginPage } from '../features/auth/LoginPage';
import { TodayPage } from '../features/today/TodayPage';
import { FeedPage } from '../features/feed/FeedPage';
import { LeaderboardPage } from '../features/leaderboard/LeaderboardPage';
import { ProfilePage } from '../features/profile/ProfilePage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AppLayout />}>
        <Route index element={<TodayPage />} />
        <Route path="feed" element={<FeedPage />} />
        <Route path="leaderboard" element={<LeaderboardPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
