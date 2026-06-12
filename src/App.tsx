import { useEffect, useState } from "react";
import { DEFAULT_CONTENT } from "./content/defaultContent";
import { AdminPanel } from "./components/AdminPanel";
import { Site } from "./components/Site";
import { getSiteContent } from "./lib/api";
import type { SiteContent } from "./types";

export default function App() {
  const path = window.location.pathname;
  const isAdmin = path === "/house" || path.startsWith("/house/");
  const [content, setContent] = useState<SiteContent>(DEFAULT_CONTENT);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSiteContent()
      .then(setContent)
      .finally(() => setLoading(false));
  }, []);

  if (isAdmin) {
    return (
      <AdminPanel
        initialContent={content}
        loading={loading}
        onContentSaved={setContent}
      />
    );
  }

  return <Site content={content} loading={loading} />;
}
