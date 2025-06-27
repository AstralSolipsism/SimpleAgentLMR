import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Agents } from './pages/Agents';
import { Applications } from './pages/Applications';
import { Tasks } from './pages/Tasks';
import { InputSources } from './pages/InputSources';
import { OutputConfigs } from './pages/OutputConfigs';
import { MCPTools } from './pages/MCPTools';
import { Visualization } from './pages/Visualization';
import TaskTester from './pages/TaskTester';
import SystemConfig from './pages/SystemConfig';
import DbViewer from './pages/DbViewer';
import './App.css';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/applications" element={<Applications />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/input-sources" element={<InputSources />} />
          <Route path="/output-configs" element={<OutputConfigs />} />
          <Route path="/mcp-tools" element={<MCPTools />} />
          <Route path="/visualization" element={<Visualization />} />
          <Route path="/task-tester" element={<TaskTester />} />
          <Route path="/system-config" element={<SystemConfig />} />
          <Route path="/db-viewer" element={<DbViewer />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
