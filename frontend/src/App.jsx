import { Route, Routes } from "react-router-dom";

import Navbar from "./components/Layout/Navbar.jsx";
import Sidebar from "./components/Layout/Sidebar.jsx";
import CalendarPage from "./pages/CalendarPage.jsx";
import CardPage from "./pages/CardPage.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import EmailPage from "./pages/EmailPage.jsx";
import IdeaPage from "./pages/IdeaPage.jsx";
import ProjectPage from "./pages/ProjectPage.jsx";
import TodoPage from "./pages/TodoPage.jsx";

export default function App() {
  return (
    <div className="flex h-screen flex-col">
      <Navbar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-6">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/email" element={<EmailPage />} />
            <Route path="/project" element={<ProjectPage />} />
            <Route path="/todo" element={<TodoPage />} />
            <Route path="/idea" element={<IdeaPage />} />
            <Route path="/card" element={<CardPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
