import React from "react";
import { createRoot } from "react-dom/client";
import DashboardApp from "../../dashboard/src/DashboardApp.jsx";
import "./shell.css";

function RemoteErrorBoundary({ children }) {
  const [error, setError] = React.useState(null);
  if (error) {
    return (
      <main className="shell-fallback">
        <h1>Dashboard yüklenemedi</h1>
        <p>Shell çalışıyor, fakat dashboard bileşeni render sırasında hata verdi.</p>
        <pre>{String(error.message || error)}</pre>
      </main>
    );
  }
  return <ErrorCapture onError={setError}>{children}</ErrorCapture>;
}

class ErrorCapture extends React.Component {
  componentDidCatch(error) {
    this.props.onError(error);
  }

  render() {
    return this.props.children;
  }
}

function ShellApp() {
  return (
    <RemoteErrorBoundary>
      <DashboardApp />
    </RemoteErrorBoundary>
  );
}

createRoot(document.getElementById("root")).render(<ShellApp />);
